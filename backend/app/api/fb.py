"""
Facebook Session + Group API — Astraventa FB Sniper
====================================================

Browser-session-based replacement for the deprecated Groups API.

Endpoints
---------
POST /api/fb/session/start      → headful login capture → store encrypted session
GET  /api/fb/sessions           → list a user's sessions
POST /api/fb/session/validate   → re-check a stored session (active/expired)
POST /api/fb/session/disconnect → delete a session
POST /api/fb/groups/fetch       → auto-scrape joined groups (optionally persist)
POST /api/fb/groups/validate    → validate one group URL (green tick / red alert)

NOTE: session/start runs a REAL browser on the host. It must run where the
user can complete the login (local now; remote browser viewer in production).
"""

import logging
import os
import re
from datetime import datetime, timezone
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase import create_client

from app.services import fb_browser
from app.services.crypto import decrypt_state, encrypt_state

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter()


def _sb():
    return create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_SERVICE_KEY", ""),
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_group_id(url: str) -> Optional[str]:
    m = re.search(r"/groups/([^/?#]+)", url or "")
    return m.group(1) if m else None


# ── Models ───────────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    user_id: str
    proxy: Optional[str] = None
    timeout_s: int = 180


class SessionRefRequest(BaseModel):
    user_id: str
    session_id: str


class FetchGroupsRequest(BaseModel):
    user_id: str
    session_id: str
    persist: bool = True


class ValidateGroupRequest(BaseModel):
    user_id: str
    session_id: str
    url: str
    name: Optional[str] = None
    persist: bool = True


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_session(sb, user_id: str, session_id: str) -> dict:
    res = (
        sb.table("fb_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found.")
    return res.data[0]


def _session_cfg(row: dict) -> fb_browser.SessionConfig:
    return fb_browser.SessionConfig(
        user_agent=row.get("user_agent") or fb_browser.DEFAULT_USER_AGENT,
        proxy=row.get("proxy"),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/session/start")
async def start_session(req: StartSessionRequest):
    """
    Launch a headful browser, wait for the user to log into Facebook, then
    persist the encrypted session. Returns the new session row (no secrets).
    """
    cfg = fb_browser.SessionConfig(proxy=req.proxy)
    result = await fb_browser.capture_login(cfg=cfg, timeout_s=req.timeout_s)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Login failed."))

    sb = _sb()
    encrypted = encrypt_state(result["storage_state"])
    row = {
        "user_id": req.user_id,
        "fb_account_name": result.get("fb_account_name"),
        "fb_account_id": result.get("fb_account_id"),
        "storage_state": encrypted,
        "status": "active",
        "proxy": req.proxy,
        "user_agent": result.get("user_agent"),
        "last_validated_at": _now(),
        "is_active": True,
    }
    inserted = sb.table("fb_sessions").insert(row).execute()
    out = inserted.data[0]
    out.pop("storage_state", None)
    return {"success": True, "session": out}


@router.get("/sessions")
async def list_sessions(user_id: str):
    sb = _sb()
    res = (
        sb.table("fb_sessions")
        .select("id, fb_account_name, fb_account_id, status, proxy, last_validated_at, last_error, created_at")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )
    return {"success": True, "sessions": res.data or []}


@router.post("/session/validate")
async def validate(req: SessionRefRequest):
    sb = _sb()
    row = _load_session(sb, req.user_id, req.session_id)
    try:
        state = decrypt_state(row["storage_state"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cannot decrypt session: {exc}")

    res = await fb_browser.validate_session(state, cfg=_session_cfg(row))
    new_status = "active" if res.get("valid") else "expired"
    sb.table("fb_sessions").update({
        "status": new_status,
        "last_validated_at": _now(),
        "last_error": None if res.get("valid") else res.get("reason"),
    }).eq("id", req.session_id).execute()

    return {"success": True, "valid": res.get("valid"), "status": new_status, "reason": res.get("reason")}


@router.post("/session/disconnect")
async def disconnect(req: SessionRefRequest):
    sb = _sb()
    _load_session(sb, req.user_id, req.session_id)
    sb.table("fb_sessions").update({"is_active": False, "status": "invalid"}).eq("id", req.session_id).execute()
    return {"success": True}


@router.post("/groups/fetch")
async def fetch_groups(req: FetchGroupsRequest):
    sb = _sb()
    row = _load_session(sb, req.user_id, req.session_id)
    state = decrypt_state(row["storage_state"])

    res = await fb_browser.fetch_joined_groups(state, cfg=_session_cfg(row))
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Failed to fetch groups."))

    groups = res.get("groups", [])
    if req.persist and groups:
        existing = (
            sb.table("target_groups")
            .select("fb_group_id")
            .eq("user_id", req.user_id)
            .execute()
        )
        have = {r.get("fb_group_id") for r in (existing.data or [])}
        rows = [
            {
                "user_id": req.user_id,
                "session_id": req.session_id,
                "name": g["name"],
                "url": g["url"],
                "fb_group_id": g["id"],
                "is_member": True,
                "validation_status": "valid",
                "last_checked_at": _now(),
            }
            for g in groups
            if g["id"] not in have
        ]
        if rows:
            sb.table("target_groups").insert(rows).execute()

    return {"success": True, "groups": groups, "count": len(groups)}


@router.post("/groups/validate")
async def validate_group(req: ValidateGroupRequest):
    sb = _sb()
    row = _load_session(sb, req.user_id, req.session_id)
    state = decrypt_state(row["storage_state"])

    gid = _extract_group_id(req.url)
    if not gid:
        raise HTTPException(status_code=422, detail="Could not parse a group id from the URL.")

    res = await fb_browser.validate_group(req.url, state, cfg=_session_cfg(row))
    if not res.get("success"):
        # Persist as invalid so the UI shows a red alert.
        if req.persist:
            sb.table("target_groups").upsert({
                "user_id": req.user_id,
                "session_id": req.session_id,
                "name": req.name or gid,
                "url": req.url,
                "fb_group_id": gid,
                "validation_status": "invalid",
                "validation_error": res.get("error"),
                "last_checked_at": _now(),
            }, on_conflict="user_id,fb_group_id").execute()
        return {"success": False, "error": res.get("error"), "validation": res}

    valid = res.get("exists") and res.get("can_post")
    payload = {
        "user_id": req.user_id,
        "session_id": req.session_id,
        "name": req.name or res.get("name") or gid,
        "url": req.url,
        "fb_group_id": gid,
        "privacy": res.get("privacy"),
        "is_member": res.get("is_member", False),
        "can_post": res.get("can_post", False),
        "requires_approval": res.get("requires_approval", False),
        "member_count": res.get("member_count"),
        "validation_status": "valid" if valid else "invalid",
        "validation_error": None if valid else "Not a member or cannot post in this group.",
        "last_checked_at": _now(),
    }
    if req.persist:
        sb.table("target_groups").upsert(payload, on_conflict="user_id,fb_group_id").execute()

    return {"success": True, "validation": res, "saved": payload}
