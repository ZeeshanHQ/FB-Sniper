"""
Campaign Worker — Astraventa FB Sniper
======================================

Runs as a background asyncio task alongside FastAPI.

Architecture:
  - Polls automation_posts every WORKER_POLL_INTERVAL seconds
  - Atomically claims campaigns (status: pending → running) to prevent
    double-execution when multiple worker instances are running
  - Executes up to WORKER_MAX_CONCURRENT campaigns in parallel (semaphore)
  - Supports three action types: Post, Like, Comment (keyword trigger)
  - Handles daily frequency by rescheduling 24 hrs after each run
  - Exponential backoff on failure: 5 min → 15 min → 45 min → permanent fail
  - All executions logged to sniper_logs for the activity feed

Env vars (all optional, sensible defaults):
  WORKER_POLL_INTERVAL   – seconds between polls         (default: 60)
  WORKER_MAX_CONCURRENT  – max parallel campaigns        (default: 3)
  WORKER_MAX_RETRIES     – attempts before permanent fail (default: 3)
  WORKER_BATCH_SIZE      – campaigns fetched per poll    (default: 10)
"""

import asyncio
import logging
import os
import random
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

POLL_INTERVAL  = int(os.getenv("WORKER_POLL_INTERVAL",  "60"))
MAX_CONCURRENT = int(os.getenv("WORKER_MAX_CONCURRENT", "3"))
MAX_RETRIES    = int(os.getenv("WORKER_MAX_RETRIES",    "3"))
BATCH_SIZE     = int(os.getenv("WORKER_BATCH_SIZE",     "10"))


# ── Supabase helper ───────────────────────────────────────────────────────────

def _make_client() -> Client:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")  # service role — bypasses RLS
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    return create_client(url, key)


async def _db(fn) -> Any:
    """Run a synchronous Supabase call in a thread pool (non-blocking)."""
    return await asyncio.to_thread(fn)


# ── Database helpers ──────────────────────────────────────────────────────────

async def _claim_campaign(sb: Client, campaign_id: str) -> bool:
    """
    Atomically claim a campaign by transitioning status pending/scheduled → running.
    The WHERE status in ('pending', 'scheduled') guard prevents two workers claiming the same row.
    Returns True only if this worker successfully claimed it.
    """
    result = await _db(lambda: (
        sb.table("automation_posts")
        .update({
            "status":     "running",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", campaign_id)
        .in_("status", ["pending", "scheduled"])   # ← atomic guard
        .execute()
    ))
    return len(result.data or []) > 0


async def _get_user_token(sb: Client, user_id: str) -> Optional[str]:
    """Fetch the user's active long-lived Meta access token."""
    result = await _db(lambda: (
        sb.table("meta_tokens")
        .select("access_token, expires_at")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ))
    rows = result.data or []
    if not rows:
        return None

    row = rows[0]
    # Validate expiry
    expires_raw = row.get("expires_at")
    if expires_raw:
        try:
            expires_at = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
            if expires_at < datetime.now(timezone.utc):
                logger.warning(f"Meta token for user {user_id} is expired")
                return None
        except ValueError:
            pass  # if we can't parse expiry, try the token anyway

    return row.get("access_token")


async def _resolve_target_groups(sb: Client, user_id: str,
                                  group_uuids: List[str]) -> List[Dict]:
    """Resolve target_group UUIDs → rows with name, url, session_id, fb_group_id."""
    if not group_uuids:
        return []
    result = await _db(lambda: (
        sb.table("target_groups")
        .select("id, name, url, session_id, fb_group_id")
        .eq("user_id", user_id)
        .in_("id", group_uuids)
        .execute()
    ))
    return result.data or []


async def _log_execution(sb: Client, user_id: str, action_type: str,
                          target_desc: str, status: str, detail: str = "") -> None:
    """Write an execution record to sniper_logs (fire-and-forget; never raises)."""
    try:
        await _db(lambda: (
            sb.table("sniper_logs")
            .insert({
                "user_id":     user_id,
                "action_type": action_type,
                "target_type": "automated",
                "status":      status,
                "metadata":    {"target": target_desc, "detail": detail},
            })
            .execute()
        ))
    except Exception as exc:
        logger.warning(f"[Worker] sniper_logs write failed (non-fatal): {exc}")


async def _notify(sb: Client, user_id: str, ntype: str, title: str, body: str) -> None:
    """Insert a notifications row — triggers Supabase real-time to the frontend."""
    try:
        await _db(lambda: (
            sb.table("notifications")
            .insert({"user_id": user_id, "type": ntype, "title": title, "body": body})
            .execute()
        ))
    except Exception as exc:
        logger.warning(f"[Worker] notifications write failed (non-fatal): {exc}")


async def _update_campaign(sb: Client, campaign_id: str, updates: Dict) -> None:
    """Convenience wrapper to update a campaign row."""
    updates.setdefault("updated_at", datetime.now(timezone.utc).isoformat())
    await _db(lambda: (
        sb.table("automation_posts")
        .update(updates)
        .eq("id", campaign_id)
        .execute()
    ))


# ── Utility ───────────────────────────────────────────────────────────────────

def _extract_fb_id(url: str) -> Optional[str]:
    """
    Extract a Facebook group/page ID from a URL or return the raw value
    if it looks like a numeric/slug ID already.

    Handles:
      https://www.facebook.com/groups/123456789
      https://facebook.com/groups/mygroupslug
      123456789  (bare numeric ID)
    """
    if not url:
        return None
    url = url.strip()

    # Numeric or slug from /groups/
    m = re.search(r"facebook\.com/groups/([a-zA-Z0-9._-]+)", url)
    if m:
        return m.group(1)

    # Bare numeric ID
    if re.fullmatch(r"\d+", url):
        return url

    # Page URL: facebook.com/pagename
    m = re.search(r"facebook\.com/([a-zA-Z0-9._-]+)", url)
    if m and m.group(1) not in ("groups", "pages", "profile.php"):
        return m.group(1)

    return None


async def _execute_paired_comments(
    sb: Client,
    meta_api,
    user_token: str,
    campaign_id: str,
    user_id: str,
    post_targets: List[Dict[str, Optional[str]]],
    post_content: str,
    group_session_mapping: Optional[Dict[str, str]] = None,
) -> None:
    """
    After a post campaign publishes, fetch all pending paired comments and fire them.
    post_targets = [{"post_id": str, "page_id": Optional[str]}]
    Page posts use their page-specific token; group posts use the user token.
    """

    result = await _db(lambda: (
        sb.table("post_scheduled_comments")
        .select("*")
        .eq("post_id", campaign_id)
        .eq("status", "pending")
        .execute()
    ))
    comments = result.data or []
    if not comments:
        return

    # Cache page tokens — one API call per unique page_id
    _page_token_cache: Dict[str, Optional[str]] = {}

    async def _token_for(page_id: Optional[str]) -> str:
        if not page_id:
            return user_token
        if page_id not in _page_token_cache:
            _page_token_cache[page_id] = await _get_page_token(meta_api, user_token, page_id)
        return _page_token_cache.get(page_id) or user_token

    fb_post_ids = [t["post_id"] for t in post_targets]
    now_iso     = datetime.now(timezone.utc).isoformat()

    for comment in comments:
        comment_id    = comment["id"]
        content       = comment["content"]
        delay_minutes = int(comment.get("delay_minutes") or 0)

        if delay_minutes > 0:
            # Store post_targets + fire_at; the polling loop fires it when due
            fire_at = (datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)).isoformat()
            await _db(lambda: (
                sb.table("post_scheduled_comments")
                .update({
                    "fb_post_ids":  fb_post_ids,
                    "post_targets": post_targets,
                    "fire_at":      fire_at,
                    "updated_at":   datetime.now(timezone.utc).isoformat(),
                })
                .eq("id", comment_id)
                .execute()
            ))
            logger.info(f"[Worker] Delayed comment {comment_id[:8]}… fires in {delay_minutes}m at {fire_at}")
            continue

        # Instant — atomic claim then fire with correct token per target
        claimed = await _db(lambda: (
            sb.table("post_scheduled_comments")
            .update({"status": "running", "updated_at": now_iso})
            .eq("id", comment_id)
            .eq("status", "pending")
            .execute()
        ))
        if not (claimed.data or []):
            continue

        succeeded: List[str] = []
        failed:    List[str] = []
        errors:    Dict[str, str] = {}

        for target in post_targets:
            fb_post_id    = target["post_id"]
            if fb_post_id and fb_post_id.startswith("http"):
                # Playwright comment posting!
                try:
                    logger.info(f"[Worker] Posting comment to group via Playwright: {fb_post_id}")
                    g_res = await _db(lambda: (
                        sb.table("target_groups")
                        .select("id, url, session_id")
                        .eq("user_id", user_id)
                        .execute()
                    ))
                    session_id = None
                    for row in (g_res.data or []):
                        u1 = row.get("url") or ""
                        u2 = fb_post_id or ""
                        if u1.strip("/").lower() == u2.strip("/").lower():
                            g_id = row.get("id")
                            session_id = (group_session_mapping or {}).get(g_id) or row.get("session_id")
                            break
                    if not session_id:
                        for row in (g_res.data or []):
                            u1 = row.get("url") or ""
                            if u1.strip("/") and u1.strip("/").lower() in fb_post_id.lower():
                                g_id = row.get("id")
                                session_id = (group_session_mapping or {}).get(g_id) or row.get("session_id")
                                break

                    if not session_id:
                        raise RuntimeError(f"Could not find Facebook session linked to group URL: {fb_post_id}")

                    s_res = await _db(lambda: (
                        sb.table("fb_sessions")
                        .select("storage_state, user_agent, proxy, status")
                        .eq("id", session_id)
                        .eq("user_id", user_id)
                        .limit(1)
                        .execute()
                    ))
                    if not s_res.data:
                        raise RuntimeError(f"Facebook session not found (ID: {session_id[:8]}…)")
                    srow = s_res.data[0]
                    if srow.get("status") in ("expired", "invalid"):
                        raise RuntimeError(f"Facebook session is {srow['status']}")

                    from app.services.crypto import decrypt_state
                    state = decrypt_state(srow["storage_state"])
                    
                    from app.services.fb_browser import comment_on_group_post, SessionConfig, DEFAULT_USER_AGENT
                    cfg = SessionConfig(
                        user_agent=srow.get("user_agent") or DEFAULT_USER_AGENT,
                        proxy=srow.get("proxy"),
                    )

                    headless = os.getenv("FB_BROWSER_HEADLESS", "true").lower() != "false"
                    
                    res = await comment_on_group_post(
                        group_url=fb_post_id,
                        post_content=post_content,
                        comment_content=content,
                        storage_state=state,
                        cfg=cfg,
                        headless=headless
                    )
                    if not res.get("success"):
                        raise RuntimeError(res.get("error") or "Unknown browser automation error")

                    succeeded.append(fb_post_id)
                    logger.info(f"[Worker] Playwright comment posted on group {fb_post_id}")
                    await asyncio.sleep(random.uniform(2, 5))
                except Exception as exc:
                    logger.warning(f"[Worker] Playwright comment failed on {fb_post_id}: {exc}")
                    failed.append(fb_post_id)
                    errors[fb_post_id] = str(exc)
            else:
                comment_token = await _token_for(target.get("page_id"))
                try:
                    await meta_api.comment_on_post(fb_post_id, content, comment_token)
                    succeeded.append(fb_post_id)
                    logger.info(f"[Worker] Instant comment on fb_post {fb_post_id} (page={target.get('page_id')})")
                    await asyncio.sleep(1)
                except Exception as exc:
                    logger.warning(f"[Worker] Instant comment failed on {fb_post_id}: {exc}")
                    failed.append(fb_post_id)
                    errors[fb_post_id] = str(exc)

        final_status = "completed" if succeeded else "failed"
        err_msg = (
            "; ".join(f"{pid}: {errors.get(pid, 'failed')}" for pid in failed)
            if failed else None
        )

        _snap_status  = final_status
        _snap_fb_ids  = list(fb_post_ids)
        _snap_targets = list(post_targets)
        _snap_err     = err_msg
        _snap_id      = comment_id
        _snap_posted  = datetime.now(timezone.utc).isoformat() if succeeded else None

        await _db(lambda: (
            sb.table("post_scheduled_comments")
            .update({
                "status":        _snap_status,
                "fb_post_ids":   _snap_fb_ids,
                "post_targets":  _snap_targets,
                "posted_at":     _snap_posted,
                "error_message": _snap_err,
                "updated_at":    datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", _snap_id)
            .execute()
        ))

        await _log_execution(
            sb, user_id, "comment",
            f"paired:{campaign_id[:8]}",
            final_status,
            f"Instant comment on {len(succeeded)}/{len(fb_post_ids)} post(s)",
        )


async def _get_page_token(meta_api, user_token: str, page_id: str) -> Optional[str]:
    """Fetch the page-specific access token from the user's token."""
    try:
        pages = await meta_api.get_user_pages(user_token)
        for page in pages:
            if page.get("id") == page_id:
                return page.get("access_token")
    except Exception as exc:
        logger.warning(f"[Worker] Could not fetch page token for {page_id}: {exc}")
    return None


# ── Playwright group posting ─────────────────────────────────────────────────

# Global lock registry to serialize actions sharing the same session
_SESSION_LOCKS: Dict[str, asyncio.Lock] = {}

def _get_session_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _SESSION_LOCKS:
        _SESSION_LOCKS[session_id] = asyncio.Lock()
    return _SESSION_LOCKS[session_id]


async def _playwright_post_to_groups(
    sb: Client,
    user_id: str,
    target_groups: List[Dict],
    content: str,
    media_url: Optional[str],
) -> List[Dict[str, Optional[str]]]:
    """
    Post to groups using Playwright (replaces dead Graph API).
    Each group row must have a session_id. Groups sharing the same session
    are batched under one browser context load.
    Returns [{post_id, page_id}] — post_id is the group URL (no FB post id
    available from browser automation), page_id is None.
    """
    from app.services.fb_browser import post_to_group, SessionConfig, DEFAULT_USER_AGENT
    from app.services.crypto import decrypt_state
    import tempfile
    import httpx

    headless = os.getenv("FB_BROWSER_HEADLESS", "true").lower() != "false"
    created: List[Dict[str, Optional[str]]] = []

    # Download image once per campaign execution if media_url is provided
    temp_img_path = None
    if media_url:
        try:
            logger.info(f"[Worker] Downloading image from {media_url} for Playwright posting...")
            suffix = ".jpg"
            if ".png" in media_url.lower():
                suffix = ".png"
            elif ".gif" in media_url.lower():
                suffix = ".gif"
            
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(media_url, timeout=30)
                    resp.raise_for_status()
                    tmp.write(resp.content)
                temp_img_path = tmp.name
            logger.info(f"[Worker] Downloaded image to {temp_img_path}")
        except Exception as exc:
            logger.error(f"[Worker] Failed to download image from {media_url}: {exc}")
            temp_img_path = None

    skipped_invalid_session: List[str] = []  # group names skipped due to bad session
    skip_reason: str = ""

    try:
        # Group rows by session_id so we load each session once.
        sessions_needed: Dict[str, List[Dict]] = {}
        for g in target_groups:
            sid = g.get("session_id")
            if not sid:
                logger.warning(f"[Worker] Group '{g.get('name')}' has no session — skipping.")
                skipped_invalid_session.append(g.get("name", "unknown"))
                if not skip_reason:
                    skip_reason = "No Facebook session linked to group. Please reconnect Facebook in the dashboard."
                continue
            sessions_needed.setdefault(sid, []).append(g)

        for session_id, groups in sessions_needed.items():
            # Acquire the lock for this session before operating on it
            lock = _get_session_lock(session_id)
            async with lock:
                # Load + decrypt session
                s_res = await _db(lambda: (
                    sb.table("fb_sessions")
                    .select("storage_state, user_agent, proxy, status")
                    .eq("id", session_id)
                    .eq("user_id", user_id)
                    .limit(1)
                    .execute()
                ))
                rows = s_res.data or []
                if not rows:
                    group_names = [g.get("name", "?") for g in groups]
                    logger.warning(f"[Worker] Session {session_id} not found — skipping groups: {group_names}")
                    skipped_invalid_session.extend(group_names)
                    if not skip_reason:
                        skip_reason = f"Facebook session not found (ID: {session_id[:8]}…). Please reconnect Facebook in the dashboard."
                    continue
                srow = rows[0]
                if srow.get("status") in ("expired", "invalid"):
                    group_names = [g.get("name", "?") for g in groups]
                    logger.warning(
                        f"[Worker] Session {session_id} is {srow['status']} — skipping groups: {group_names}. "
                        f"User must reconnect Facebook."
                    )
                    skipped_invalid_session.extend(group_names)
                    if not skip_reason:
                        skip_reason = (
                            f"Facebook session is {srow['status']} — please reconnect Facebook in the dashboard "
                            f"(Settings → Facebook Account → Reconnect)."
                        )
                    continue
                try:
                    state = decrypt_state(srow["storage_state"])
                except Exception as exc:
                    logger.error(f"[Worker] Cannot decrypt session {session_id}: {exc}")
                    skipped_invalid_session.extend(g.get("name", "?") for g in groups)
                    if not skip_reason:
                        skip_reason = f"Cannot read Facebook session data: {exc}"
                    continue

                cfg = SessionConfig(
                    user_agent=srow.get("user_agent") or DEFAULT_USER_AGENT,
                    proxy=srow.get("proxy"),
                )

                for g in groups:
                    group_url = g.get("url", "")
                    if not group_url:
                        logger.warning(f"[Worker] Group '{g.get('name')}' has no URL — skipping.")
                        continue
                    result = await post_to_group(
                        group_url=group_url,
                        content=content,
                        storage_state=state,
                        image_path=temp_img_path,
                        cfg=cfg,
                        headless=headless,
                    )
                    if result.get("success"):
                        label = "(pending approval)" if result.get("pending_approval") else "(posted)"
                        created.append({"post_id": group_url, "page_id": None})
                        logger.info(f"[Worker] Playwright posted to '{g.get('name')}' {label}")
                    else:
                        err = result.get('error', 'unknown error')
                        logger.warning(f"[Worker] Playwright post failed for '{g.get('name')}': {err}")
                        if not skip_reason and not created:
                            skip_reason = err
                    # Human-paced inter-group delay (1-3 minutes is standard to prevent cookie checkpointing)
                    await asyncio.sleep(random.uniform(60, 180))
    finally:
        if temp_img_path and os.path.exists(temp_img_path):
            try:
                os.remove(temp_img_path)
                logger.info(f"[Worker] Cleaned up temporary image: {temp_img_path}")
            except Exception as e:
                logger.warning(f"[Worker] Failed to remove temp image {temp_img_path}: {e}")

    # If nothing was posted and we have a specific reason, surface it
    if not created and skip_reason:
        raise RuntimeError(skip_reason)

    return created


# ── Action executors ──────────────────────────────────────────────────────────

async def _execute_post(
    meta_api,
    user_token: str,
    target_groups: List[Dict],
    target_page_ids: List[str],
    content: str,
    media_url: Optional[str],
) -> List[Dict[str, Optional[str]]]:
    """
    Post content to all target groups and pages.
    Returns list of {"post_id": str, "page_id": Optional[str]}.
    page_id is set for page posts so callers can fetch the right page token;
    None for group posts (which use the user token).
    """
    created: List[Dict[str, Optional[str]]] = []

    for group in target_groups:
        fb_id = _extract_fb_id(group.get("url", ""))
        if not fb_id:
            logger.warning(f"[Worker] Skipping group '{group.get('name')}' — cannot parse FB ID from '{group.get('url')}'")
            continue
        result = await meta_api.post_to_group(fb_id, content, user_token, media_url=media_url)
        post_id = result.get("id", "unknown")
        created.append({"post_id": post_id, "page_id": None})
        logger.info(f"[Worker] Posted to group '{group.get('name')}' ({fb_id}) → post {post_id}")
        await asyncio.sleep(1)

    for page_id in target_page_ids:
        page_token = await _get_page_token(meta_api, user_token, page_id)
        token = page_token or user_token
        result = await meta_api.post_to_page(page_id, content, token, media_url=media_url)
        post_id = result.get("id", "unknown")
        created.append({"post_id": post_id, "page_id": page_id})
        logger.info(f"[Worker] Posted to page {page_id} → post {post_id}")
        await asyncio.sleep(1)

    return created


async def _execute_like(
    meta_api,
    user_token: str,
    target_groups: List[Dict],
    target_page_ids: List[str],
    likes_per_target: int = 5,
) -> int:
    """
    Like the N most recent posts on every target group/page.
    Returns total likes created.
    """
    liked = 0

    for group in target_groups:
        fb_id = _extract_fb_id(group.get("url", ""))
        if not fb_id:
            continue
        try:
            feed = await meta_api.get_group_feed(fb_id, user_token, limit=likes_per_target)
            for post in feed[:likes_per_target]:
                try:
                    await meta_api.like_post(post["id"], user_token)
                    liked += 1
                    await asyncio.sleep(1.5)  # stay well below rate limits
                except Exception as exc:
                    logger.warning(f"[Worker] Like failed on post {post['id']}: {exc}")
        except Exception as exc:
            logger.error(f"[Worker] Feed fetch failed for group {fb_id}: {exc}")

    return liked


async def _execute_comment_trigger(
    meta_api,
    user_token: str,
    target_groups: List[Dict],
    keywords: List[str],
    auto_reply: str,
    already_processed: List[str],
) -> Tuple[int, List[str]]:
    """
    Scan group feeds for posts containing any keyword, then auto-comment.

    - already_processed: post IDs we have already commented on (avoids duplicates)
    - Returns (comments_posted, updated_processed_ids)
    """
    commented = 0
    processed = list(already_processed)

    for group in target_groups:
        fb_id = _extract_fb_id(group.get("url", ""))
        if not fb_id:
            continue
        try:
            feed = await meta_api.get_group_feed(fb_id, user_token, limit=25)
        except Exception as exc:
            logger.error(f"[Worker] Feed fetch failed for group {fb_id}: {exc}")
            continue

        for post in feed:
            post_id = post.get("id", "")
            if not post_id or post_id in processed:
                continue

            message = (post.get("message") or "").lower()
            matched = any(kw.strip().lower() in message for kw in keywords if kw.strip())

            if matched:
                try:
                    await meta_api.comment_on_post(post_id, auto_reply, user_token)
                    processed.append(post_id)
                    commented += 1
                    logger.info(f"[Worker] Auto-commented on post {post_id} in '{group.get('name')}'")
                    await asyncio.sleep(2)  # mandatory delay between comments
                except Exception as exc:
                    logger.warning(f"[Worker] Comment failed on {post_id}: {exc}")

    # Dedup and keep most recent 500 to bound metadata size
    seen: Dict[str, bool] = {}
    deduped = [p for p in processed if not (p in seen or seen.update({p: True}))]
    return commented, deduped[-500:]


async def _fire_delayed_comment_task(sb: Client, comment: Dict) -> None:
    """
    Fire a delayed comment whose fire_at is now due.
    Uses post_targets to pick the correct token per post (page token for page
    posts, user token for group posts).
    """
    comment_id   = comment["id"]
    user_id      = comment["user_id"]
    content      = comment["content"]
    post_id      = comment["post_id"]
    post_targets = comment.get("post_targets") or []
    fb_post_ids  = comment.get("fb_post_ids") or []

    camp_res = await _db(lambda: (
        sb.table("automation_posts")
        .select("content")
        .eq("id", post_id)
        .single()
        .execute()
    ))
    post_content = camp_res.data.get("content", "") if camp_res.data else ""

    # Build targets list — fall back to bare fb_post_ids if post_targets not stored
    if post_targets:
        targets = post_targets
    elif fb_post_ids:
        targets = [{"post_id": pid, "page_id": None} for pid in fb_post_ids]
    else:
        logger.warning(f"[Worker] Delayed comment {comment_id[:8]}… no targets — skipping")
        return

    user_token = await _get_user_token(sb, user_id)
    if not user_token:
        logger.warning(f"[Worker] Delayed comment {comment_id[:8]}… no active token — skipping")
        return

    from app.services.meta import get_meta_api
    meta_api = get_meta_api(os.getenv("META_APP_ID", ""), os.getenv("META_APP_SECRET", ""))

    # Cache page tokens
    _page_token_cache: Dict[str, Optional[str]] = {}

    async def _token_for(page_id: Optional[str]) -> str:
        if not page_id:
            return user_token
        if page_id not in _page_token_cache:
            _page_token_cache[page_id] = await _get_page_token(meta_api, user_token, page_id)
        return _page_token_cache.get(page_id) or user_token

    # Atomic claim
    claimed = await _db(lambda: (
        sb.table("post_scheduled_comments")
        .update({"status": "running", "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", comment_id)
        .eq("status", "pending")
        .execute()
    ))
    if not (claimed.data or []):
        return

    succeeded: List[str] = []
    failed:    List[str] = []
    errors:    Dict[str, str] = {}

    for target in targets:
        fb_post_id    = target["post_id"]
        if fb_post_id and fb_post_id.startswith("http"):
            # Playwright comment posting!
            try:
                logger.info(f"[Worker] Posting delayed comment to group via Playwright: {fb_post_id}")
                g_res = await _db(lambda: (
                    sb.table("target_groups")
                    .select("url, session_id")
                    .eq("user_id", user_id)
                    .execute()
                ))
                session_id = None
                for row in (g_res.data or []):
                    u1 = row.get("url") or ""
                    u2 = fb_post_id or ""
                    if u1.strip("/").lower() == u2.strip("/").lower():
                        session_id = row.get("session_id")
                        break
                if not session_id:
                    for row in (g_res.data or []):
                        u1 = row.get("url") or ""
                        if u1.strip("/") and u1.strip("/").lower() in fb_post_id.lower():
                            session_id = row.get("session_id")
                            break

                if not session_id:
                    raise RuntimeError(f"Could not find Facebook session linked to group URL: {fb_post_id}")

                s_res = await _db(lambda: (
                    sb.table("fb_sessions")
                    .select("storage_state, user_agent, proxy, status")
                    .eq("id", session_id)
                    .eq("user_id", user_id)
                    .limit(1)
                    .execute()
                ))
                if not s_res.data:
                    raise RuntimeError(f"Facebook session not found (ID: {session_id[:8]}…)")
                srow = s_res.data[0]
                if srow.get("status") in ("expired", "invalid"):
                    raise RuntimeError(f"Facebook session is {srow['status']}")

                from app.services.crypto import decrypt_state
                state = decrypt_state(srow["storage_state"])
                
                from app.services.fb_browser import comment_on_group_post, SessionConfig, DEFAULT_USER_AGENT
                cfg = SessionConfig(
                    user_agent=srow.get("user_agent") or DEFAULT_USER_AGENT,
                    proxy=srow.get("proxy"),
                )

                headless = os.getenv("FB_BROWSER_HEADLESS", "true").lower() != "false"
                
                res = await comment_on_group_post(
                    group_url=fb_post_id,
                    post_content=post_content,
                    comment_content=content,
                    storage_state=state,
                    cfg=cfg,
                    headless=headless
                )
                if not res.get("success"):
                    raise RuntimeError(res.get("error") or "Unknown browser automation error")

                succeeded.append(fb_post_id)
                logger.info(f"[Worker] Playwright delayed comment posted on group {fb_post_id}")
                await asyncio.sleep(random.uniform(2, 5))
            except Exception as exc:
                logger.warning(f"[Worker] Playwright delayed comment failed on {fb_post_id}: {exc}")
                failed.append(fb_post_id)
                errors[fb_post_id] = str(exc)
        else:
            comment_token = await _token_for(target.get("page_id"))
            try:
                await meta_api.comment_on_post(fb_post_id, content, comment_token)
                succeeded.append(fb_post_id)
                logger.info(f"[Worker] Delayed comment on fb_post {fb_post_id} (page={target.get('page_id')})")
                await asyncio.sleep(1)
            except Exception as exc:
                logger.warning(f"[Worker] Delayed comment failed on {fb_post_id}: {exc}")
                failed.append(fb_post_id)
                errors[fb_post_id] = str(exc)

    final_status = "completed" if succeeded else "failed"
    err_msg = (
        "; ".join(f"{pid}: {errors.get(pid, 'failed')}" for pid in failed)
        if failed else None
    )
    all_ids = [t["post_id"] for t in targets]

    _snap_status  = final_status
    _snap_targets = list(targets)
    _snap_fb_ids  = list(all_ids)
    _snap_err     = err_msg
    _snap_id      = comment_id
    _snap_posted  = datetime.now(timezone.utc).isoformat() if succeeded else None

    await _db(lambda: (
        sb.table("post_scheduled_comments")
        .update({
            "status":        _snap_status,
            "post_targets":  _snap_targets,
            "fb_post_ids":   _snap_fb_ids,
            "posted_at":     _snap_posted,
            "error_message": _snap_err,
            "updated_at":    datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", _snap_id)
        .execute()
    ))

    await _log_execution(
        sb, user_id, "comment",
        f"delayed:{comment_id[:8]}",
        final_status,
        f"Delayed comment on {len(succeeded)}/{len(targets)} post(s)",
    )


# ── Campaign dispatcher ───────────────────────────────────────────────────────

async def execute_campaign(sb: Client, campaign: Dict[str, Any]) -> None:
    """
    Execute a single campaign row end-to-end.

    Flow:
      1. Validate token + targets
      2. Dispatch to the correct executor
      3. On success → mark completed (or reschedule if daily)
      4. On failure → exponential backoff retry, then permanent fail
    """
    campaign_id = campaign["id"]
    user_id     = campaign["user_id"]
    metadata    = dict(campaign.get("metadata") or {})
    action_type = metadata.get("action_type", "Post to group/page")
    frequency   = metadata.get("frequency", "once")
    content     = (campaign.get("content") or "").strip()

    logger.info(
        f"[Worker] ── Campaign {campaign_id[:8]}…  "
        f"action={action_type!r}  freq={frequency}"
    )

    try:
        # ── 1. Resolve Meta token (optional if only posting to Playwright groups) ──
        token = await _get_user_token(sb, user_id)

        # ── 2. Init Meta API client ───────────────────────────────────────
        from app.services.meta import get_meta_api  # lazy import keeps startup fast
        meta_api = get_meta_api(
            os.getenv("META_APP_ID", ""),
            os.getenv("META_APP_SECRET", ""),
        )

        # ── 3. Resolve targets ────────────────────────────────────────────
        group_uuids      = campaign.get("target_groups") or []
        target_page_ids  = campaign.get("target_pages")  or []
        target_groups    = await _resolve_target_groups(sb, user_id, group_uuids)

        # Apply custom session overrides from metadata.group_session_mapping if present
        metadata = campaign.get("metadata") or {}
        session_mapping = metadata.get("group_session_mapping") or {}
        if session_mapping:
            for g in target_groups:
                g_id = g.get("id")
                if g_id in session_mapping:
                    g["session_id"] = session_mapping[g_id]

        if not target_groups and not target_page_ids:
            raise RuntimeError("Campaign has no valid targets. Add groups or pages first.")

        # Require token ONLY if page posts, api group posts, or Graph API actions (like/comment triggers) are requested
        has_api_targets = bool(target_page_ids) or any(not g.get("session_id") for g in target_groups)
        requires_token = has_api_targets or action_type in ("Like posts", "Comment on post")

        if requires_token and not token:
            raise RuntimeError(
                "No active Meta token. User must reconnect Facebook in the dashboard to post to pages or perform Graph API actions."
            )

        target_desc = (
            f"{len(target_groups)} group(s), {len(target_page_ids)} page(s)"
        )

        # ── 4. Execute ────────────────────────────────────────────────────
        result_detail = ""

        if action_type == "Post to group/page":
            if not content:
                raise RuntimeError("Post content is empty.")
            # Groups → Playwright browser automation (Graph API deprecated Apr 2024)
            # Pages  → Graph API (still works with pages_manage_posts permission)
            pw_groups = [g for g in target_groups if g.get("session_id")]
            api_groups = [g for g in target_groups if not g.get("session_id")]
            post_targets: List[Dict[str, Optional[str]]] = []
            if pw_groups:
                pw_results = await _playwright_post_to_groups(
                    sb, user_id, pw_groups, content, metadata.get("media_url"),
                )
                post_targets.extend(pw_results)
            if api_groups or target_page_ids:
                api_results = await _execute_post(
                    meta_api, token, api_groups, target_page_ids,
                    content, metadata.get("media_url"),
                )
                post_targets.extend(api_results)
            if not post_targets:
                raise RuntimeError("Failed to post to any of the target groups/pages.")

            post_ids = [t["post_id"] for t in post_targets]
            result_detail = (
                f"Posted to {len(post_ids)} target(s). "
                f"Post ID(s): {', '.join(post_ids)}"
            )
            await _execute_paired_comments(
                sb, meta_api, token, campaign_id, user_id, post_targets, content, session_mapping
            )

        elif action_type == "Like posts":
            liked = await _execute_like(meta_api, token, target_groups, target_page_ids)
            result_detail = f"Liked {liked} post(s) across {target_desc}."

        elif action_type == "Comment on post":
            raw_kw = metadata.get("trigger_keywords") or ""
            keywords = [k.strip() for k in raw_kw.split(",") if k.strip()]
            auto_reply = (metadata.get("auto_reply") or "").strip()

            if not keywords:
                raise RuntimeError("Comment trigger requires at least one keyword.")
            if not auto_reply:
                raise RuntimeError("Comment trigger requires an auto-reply message.")

            processed = metadata.get("processed_post_ids") or []
            commented, new_processed = await _execute_comment_trigger(
                meta_api, token, target_groups, keywords, auto_reply, processed
            )
            result_detail = (
                f"Scanned feeds across {target_desc}. "
                f"Commented on {commented} new matching post(s)."
            )
            # Persist processed IDs back to metadata
            metadata["processed_post_ids"] = new_processed
            await _update_campaign(sb, campaign_id, {"metadata": metadata})

        else:
            raise RuntimeError(f"Unknown action_type: {action_type!r}")

        # ── 5. Mark success / reschedule ──────────────────────────────────
        now = datetime.now(timezone.utc)
        if frequency == "daily":
            next_run = now + timedelta(hours=24)
            await _update_campaign(sb, campaign_id, {
                "status":       "scheduled",
                "scheduled_at": next_run.isoformat(),
                "metadata":     {
                    **metadata,
                    "last_run":    now.isoformat(),
                    "last_result": result_detail,
                    "retry_count": 0,  # reset retries on success
                },
            })
            logger.info(
                f"[Worker] Campaign {campaign_id[:8]}… ✓ daily — "
                f"next run: {next_run.strftime('%Y-%m-%d %H:%M UTC')}"
            )
        else:
            await _update_campaign(sb, campaign_id, {
                "status":   "completed",
                "metadata": {
                    **metadata,
                    "completed_at": now.isoformat(),
                    "result":       result_detail,
                    "retry_count":  0,
                },
            })
            logger.info(f"[Worker] Campaign {campaign_id[:8]}… ✓ completed — {result_detail}")
            await _notify(sb, user_id, "campaign_completed",
                          "Campaign completed",
                          f"{action_type} finished. {result_detail}")

        await _log_execution(sb, user_id, action_type, target_desc, "success", result_detail)

    except Exception as exc:
        error_msg = str(exc)
        logger.error(f"[Worker] Campaign {campaign_id[:8]}… ✗ FAILED: {error_msg}")

        current_retries = int(metadata.get("retry_count", 0))
        new_retries     = current_retries + 1

        if new_retries >= MAX_RETRIES:
            # Permanent failure
            await _update_campaign(sb, campaign_id, {
                "status":   "failed",
                "metadata": {
                    **metadata,
                    "retry_count": new_retries,
                    "last_error":  error_msg,
                    "failed_at":   datetime.now(timezone.utc).isoformat(),
                },
            })
            logger.error(
                f"[Worker] Campaign {campaign_id[:8]}… permanently failed "
                f"after {MAX_RETRIES} attempts."
            )
            await _notify(sb, user_id, "action_failed",
                          "Campaign failed",
                          f"{action_type} failed after {MAX_RETRIES} attempts. {error_msg[:120]}")
        else:
            # Exponential backoff: 5 min → 15 min → 45 min
            backoff_minutes = 5 * (3 ** current_retries)
            next_retry      = datetime.now(timezone.utc) + timedelta(minutes=backoff_minutes)
            await _update_campaign(sb, campaign_id, {
                "status":       "pending",
                "scheduled_at": next_retry.isoformat(),
                "metadata":     {
                    **metadata,
                    "retry_count": new_retries,
                    "last_error":  error_msg,
                },
            })
            logger.warning(
                f"[Worker] Campaign {campaign_id[:8]}… retry "
                f"{new_retries}/{MAX_RETRIES} in {backoff_minutes} min"
            )

        await _log_execution(sb, user_id, action_type, campaign_id, "failed", error_msg)


# ── Worker loop ───────────────────────────────────────────────────────────────

async def worker_loop() -> None:
    """
    Main polling loop. Intended to run as a background asyncio task via
    FastAPI's lifespan context manager.

    Each iteration:
      1. Fetches pending campaigns that are due (no scheduled_at, or scheduled_at ≤ now)
      2. Claims each atomically
      3. Executes claimed campaigns concurrently (bounded by semaphore)
      4. Sleeps POLL_INTERVAL seconds before next poll
    """
    logger.info(
        f"[Worker] Started — poll={POLL_INTERVAL}s  "
        f"concurrency={MAX_CONCURRENT}  batch={BATCH_SIZE}"
    )

    sb  = _make_client()
    sem = asyncio.Semaphore(MAX_CONCURRENT)

    async def _run_guarded(campaign: Dict) -> None:
        async with sem:
            await execute_campaign(sb, campaign)

    while True:
        try:
            now_dt  = datetime.now(timezone.utc)
            now_iso = now_dt.isoformat()

            # Fetch a batch of pending campaigns ordered oldest-first (FIFO)
            raw = await _db(lambda: (
                sb.table("automation_posts")
                .select("*")
                .in_("status", ["pending", "scheduled"])
                .order("created_at", desc=False)
                .limit(BATCH_SIZE * 2)   # over-fetch; we filter by scheduled_at below
                .execute()
            ))

            all_pending = raw.data or []

            # Filter to campaigns that are actually due
            due = [
                c for c in all_pending
                if not c.get("scheduled_at") or
                datetime.fromisoformat(
                    c["scheduled_at"].replace("Z", "+00:00")
                ) <= now_dt
            ][:BATCH_SIZE]

            if due:
                logger.info(f"[Worker] {len(due)} campaign(s) due for execution")

                tasks = []
                for campaign in due:
                    claimed = await _claim_campaign(sb, campaign["id"])
                    if claimed:
                        tasks.append(_run_guarded(campaign))
                    else:
                        logger.debug(
                            f"[Worker] Campaign {campaign['id'][:8]}… "
                            "already claimed by another worker"
                        )

                if tasks:
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    for r in results:
                        if isinstance(r, Exception):
                            logger.error(f"[Worker] Unhandled task exception: {r}")

            # ── Delayed comments that are now due ─────────────────────────
            due_comments_raw = await _db(lambda: (
                sb.table("post_scheduled_comments")
                .select("*")
                .eq("status", "pending")
                .lte("fire_at", now_iso)   # NULL fire_at rows excluded by lte
                .limit(BATCH_SIZE)
                .execute()
            ))
            for dc in (due_comments_raw.data or []):
                asyncio.create_task(_fire_delayed_comment_task(sb, dc))

            # ── Orphaned instant comments (fire_at IS NULL, post completed) ──
            # Pending comments whose campaign already finished but the paired-comment
            # step was skipped (e.g. backend restart mid-run).
            # Two queries to avoid a fragile join-filter.
            null_fire_raw = await _db(lambda: (
                sb.table("post_scheduled_comments")
                .select("*")
                .eq("status", "pending")
                .is_("fire_at", "null")
                .limit(BATCH_SIZE)
                .execute()
            ))
            null_fire_comments = null_fire_raw.data or []
            if null_fire_comments:
                campaign_ids = list({c["post_id"] for c in null_fire_comments})
                camp_status_raw = await _db(lambda: (
                    sb.table("automation_posts")
                    .select("id, status")
                    .in_("id", campaign_ids)
                    .execute()
                ))
                done_campaigns = {
                    r["id"] for r in (camp_status_raw.data or [])
                    if r["status"] in ("completed", "failed")
                }
                for oc in null_fire_comments:
                    if oc["post_id"] in done_campaigns:
                        asyncio.create_task(_fire_delayed_comment_task(sb, oc))

        except asyncio.CancelledError:
            logger.info("[Worker] Received cancellation — shutting down cleanly")
            raise

        except Exception as exc:
            logger.error(f"[Worker] Poll loop error: {exc}", exc_info=True)

        await asyncio.sleep(POLL_INTERVAL)


# ── Session health-check loop ─────────────────────────────────────────────────
# Runs every SESSION_CHECK_INTERVAL seconds (default 6 hours).
# Marks expired sessions and e-mails the account owner once per expiry.

SESSION_CHECK_INTERVAL = int(os.getenv("SESSION_CHECK_INTERVAL", str(6 * 60 * 60)))


async def session_health_loop() -> None:
    """Background loop that validates stored FB sessions and notifies on expiry."""
    from app.services.fb_browser import validate_session, SessionConfig, DEFAULT_USER_AGENT
    from app.services.crypto import decrypt_state
    from app.services.email import send_session_expired_email

    logger.info(f"[SessionHealth] Started — check interval={SESSION_CHECK_INTERVAL}s")
    sb = _make_client()

    while True:
        try:
            res = await _db(lambda: (
                sb.table("fb_sessions")
                .select("id, user_id, fb_account_name, storage_state, user_agent, proxy, status")
                .eq("is_active", True)
                .neq("status", "expired")
                .neq("status", "invalid")
                .execute()
            ))
            sessions = res.data or []
            logger.info(f"[SessionHealth] Checking {len(sessions)} active session(s)")

            for srow in sessions:
                sid = srow["id"]
                uid = srow["user_id"]
                try:
                    state = decrypt_state(srow["storage_state"])
                except Exception:
                    continue

                cfg = SessionConfig(
                    user_agent=srow.get("user_agent") or DEFAULT_USER_AGENT,
                    proxy=srow.get("proxy"),
                )
                result = await validate_session(state, cfg=cfg)
                if result.get("valid"):
                    await _db(lambda: (
                        sb.table("fb_sessions")
                        .update({"status": "active", "last_validated_at": datetime.now(timezone.utc).isoformat(), "last_error": None})
                        .eq("id", sid)
                        .execute()
                    ))
                    continue

                # Session is dead → mark + notify
                await _db(lambda: (
                    sb.table("fb_sessions")
                    .update({"status": "expired", "last_validated_at": datetime.now(timezone.utc).isoformat(), "last_error": result.get("reason")})
                    .eq("id", sid)
                    .execute()
                ))
                logger.warning(f"[SessionHealth] Session {sid} expired — notifying user {uid}")

                # Fetch user email
                u_res = await _db(lambda: (
                    sb.table("users")
                    .select("email, full_name")
                    .eq("id", uid)
                    .limit(1)
                    .execute()
                ))
                u_rows = u_res.data or []
                if u_rows:
                    await send_session_expired_email(
                        to_email=u_rows[0]["email"],
                        full_name=u_rows[0].get("full_name") or "",
                        fb_account_name=srow.get("fb_account_name") or "",
                    )
                    await _notify(sb, uid, "action_failed",
                                  "Facebook session expired",
                                  f"Your Facebook session{' for ' + srow['fb_account_name'] if srow.get('fb_account_name') else ''} has expired. Please reconnect in Groups settings.")

        except asyncio.CancelledError:
            logger.info("[SessionHealth] Shutting down")
            raise
        except Exception as exc:
            logger.error(f"[SessionHealth] Error: {exc}", exc_info=True)

        await asyncio.sleep(SESSION_CHECK_INTERVAL)
