"""
Facebook Browser Automation — Astraventa FB Sniper
===================================================

Because Meta deprecated the Groups Publishing API (April 2024), all group
actions are performed through a real, logged-in browser session driven by
Playwright with human-mimicking behaviour.

Responsibilities
----------------
- capture_login()      : interactive (headful) login → returns encrypted-ready storage_state
- validate_session()   : is the stored session still logged in?
- fetch_joined_groups(): scrape the groups the account belongs to
- validate_group()     : open a group URL → exists / privacy / member / can_post
- post_to_group()      : compose + (optional) image attach + submit, human-paced

IMPORTANT (honesty):
- Facebook's DOM is volatile and localized. Selectors below use several
  fallbacks and may need periodic tuning. They are centralized in SELECTORS.
- This requires a host that can run a real Chromium (VPS/container), NOT
  serverless. Headful is recommended for the login-capture step.
- Undetectable is not guaranteed. We minimize risk (stealth, human pacing,
  persistent UA, optional proxy) but volume/account-age matter most.
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from playwright.async_api import (
    async_playwright,
    BrowserContext,
    Page,
    TimeoutError as PWTimeout,
)

logger = logging.getLogger(__name__)

# Optional stealth — degrade gracefully if not installed.
try:
    from playwright_stealth import stealth_async  # type: ignore
    _HAS_STEALTH = True
except Exception:  # pragma: no cover
    _HAS_STEALTH = False


# ── Fingerprint defaults ────────────────────────────────────────────────────

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
DEFAULT_VIEWPORT = {"width": 1366, "height": 768}
DEFAULT_LOCALE = "en-US"
DEFAULT_TIMEZONE = "America/New_York"

FB_HOME = "https://www.facebook.com/"
FB_GROUPS_JOINED = "https://www.facebook.com/groups/joins/"


# ── Centralized selectors (tune here when FB changes its DOM) ────────────────

SELECTORS = {
    "login_form": 'form[action*="login"], input[name="email"]',
    "logged_in_marker": '[aria-label="Your profile"], [aria-label="Account"], div[role="banner"]',
    "group_composer_trigger": [
        '[role="button"]:has-text("Write something")',
        '[role="button"]:has-text("Discuss something")',
        'span:has-text("Write something")',
        'div[aria-label*="Create"]',
    ],
    "composer_textbox": 'div[role="textbox"][contenteditable="true"]',
    "photo_input": 'input[type="file"][accept*="image"]',
    "post_button": [
        'div[aria-label="Post"][role="button"]',
        '[aria-label="Post"]',
        'div[role="button"]:has-text("Post")',
    ],
    "pending_approval_marker": "text=/pending|admin approval|waiting for approval/i",
    "join_button": 'div[aria-label="Join group"], [aria-label="Join Group"]',
    "private_marker": "text=/This group is private|Private group/i",
}


@dataclass
class SessionConfig:
    """Per-account browser fingerprint + network settings."""
    user_agent: str = DEFAULT_USER_AGENT
    proxy: Optional[str] = None  # "http://user:pass@host:port" or "host:port"
    locale: str = DEFAULT_LOCALE
    timezone: str = DEFAULT_TIMEZONE
    viewport: Dict[str, int] = field(default_factory=lambda: dict(DEFAULT_VIEWPORT))


# ── Human-mimicking helpers ─────────────────────────────────────────────────

async def _sleep(a: float, b: float) -> None:
    await asyncio.sleep(random.uniform(a, b))


async def _human_type(page: Page, selector_or_locator, text: str) -> None:
    """Type text char-by-char with human-like jitter."""
    locator = (
        page.locator(selector_or_locator)
        if isinstance(selector_or_locator, str)
        else selector_or_locator
    )
    await locator.click()
    await _sleep(0.3, 0.9)
    for ch in text:
        await page.keyboard.type(ch)
        # occasional longer pauses, like a human thinking
        if random.random() < 0.06:
            await _sleep(0.25, 0.8)
        else:
            await _sleep(0.02, 0.12)


async def _human_mouse_wiggle(page: Page) -> None:
    try:
        w = random.randint(200, 1100)
        h = random.randint(150, 600)
        await page.mouse.move(w, h, steps=random.randint(5, 20))
    except Exception:
        pass


async def _human_scroll(page: Page, times: int = 3) -> None:
    for _ in range(times):
        await page.mouse.wheel(0, random.randint(400, 900))
        await _sleep(0.6, 1.6)
        await _human_mouse_wiggle(page)


# ── Context construction ─────────────────────────────────────────────────────

def _parse_proxy(proxy: Optional[str]) -> Optional[Dict[str, str]]:
    if not proxy:
        return None
    p = proxy.strip()
    if "://" not in p:
        p = "http://" + p
    # Playwright accepts {"server": ..., "username":..., "password":...}
    # Simplify: pass full URL as server; embed creds if present.
    return {"server": p}


async def _new_context(
    pw, cfg: SessionConfig, storage_state: Optional[Dict[str, Any]], headless: bool
) -> BrowserContext:
    launch_kwargs: Dict[str, Any] = {
        "headless": headless,
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
        ],
    }
    proxy = _parse_proxy(cfg.proxy)
    if proxy:
        launch_kwargs["proxy"] = proxy

    browser = await pw.chromium.launch(**launch_kwargs)
    context = await browser.new_context(
        user_agent=cfg.user_agent,
        viewport=cfg.viewport,
        locale=cfg.locale,
        timezone_id=cfg.timezone,
        storage_state=storage_state if storage_state else None,
    )
    # Light fingerprint hardening even without the stealth package.
    await context.add_init_script(
        "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
    )
    return context


async def _apply_stealth(page: Page) -> None:
    if _HAS_STEALTH:
        try:
            await stealth_async(page)
        except Exception as exc:  # pragma: no cover
            logger.warning("stealth_async failed: %s", exc)


# ── Login detection ──────────────────────────────────────────────────────────

async def _detect_account(context: BrowserContext) -> Dict[str, Optional[str]]:
    """Read the c_user cookie to confirm login + capture the FB account id."""
    cookies = await context.cookies("https://www.facebook.com")
    c_user = next((c for c in cookies if c["name"] == "c_user"), None)
    return {"fb_account_id": c_user["value"] if c_user else None}


# ── Public API ───────────────────────────────────────────────────────────────

async def capture_login(cfg: Optional[SessionConfig] = None, timeout_s: int = 180) -> Dict[str, Any]:
    """
    Open a headful browser at facebook.com and wait for the user to log in.
    Detects success via the `c_user` cookie, then returns the storage_state.

    NOTE: This must run where the user can see/interact with the browser
    (local machine, or a remote browser viewer like noVNC in production).
    """
    cfg = cfg or SessionConfig()
    async with async_playwright() as pw:
        context = await _new_context(pw, cfg, storage_state=None, headless=False)
        page = await context.new_page()
        await _apply_stealth(page)
        await page.goto(FB_HOME, wait_until="domcontentloaded")

        # Poll for the c_user cookie which appears only after a successful login.
        deadline = asyncio.get_event_loop().time() + timeout_s
        fb_id: Optional[str] = None
        while asyncio.get_event_loop().time() < deadline:
            info = await _detect_account(context)
            if info["fb_account_id"]:
                fb_id = info["fb_account_id"]
                break
            await asyncio.sleep(2)

        if not fb_id:
            await context.close()
            return {"success": False, "error": "Login not completed within timeout."}

        # Grab display name (best-effort).
        name: Optional[str] = None
        try:
            await page.goto("https://www.facebook.com/me/", wait_until="domcontentloaded")
            await _sleep(1.5, 3.0)
            name = await page.title()
            if name:
                name = name.replace(" | Facebook", "").strip() or None
        except Exception:
            pass

        state = await context.storage_state()
        await context.close()
        return {
            "success": True,
            "fb_account_id": fb_id,
            "fb_account_name": name,
            "storage_state": state,
            "user_agent": cfg.user_agent,
        }


async def validate_session(
    storage_state: Dict[str, Any], cfg: Optional[SessionConfig] = None, headless: bool = True
) -> Dict[str, Any]:
    """Return {valid, fb_account_id, reason} for a stored session."""
    cfg = cfg or SessionConfig()
    async with async_playwright() as pw:
        context = await _new_context(pw, cfg, storage_state=storage_state, headless=headless)
        page = await context.new_page()
        await _apply_stealth(page)
        try:
            await page.goto(FB_HOME, wait_until="domcontentloaded")
            await _sleep(1.0, 2.5)
            info = await _detect_account(context)
            if not info["fb_account_id"]:
                # Redirected to login → session dead.
                is_login = await page.locator(SELECTORS["login_form"]).count()
                reason = "checkpoint_or_logged_out" if is_login else "no_c_user"
                return {"valid": False, "reason": reason}
            return {"valid": True, "fb_account_id": info["fb_account_id"]}
        except Exception as exc:
            return {"valid": False, "reason": str(exc)}
        finally:
            await context.close()


async def fetch_joined_groups(
    storage_state: Dict[str, Any],
    cfg: Optional[SessionConfig] = None,
    max_scroll: int = 8,
    headless: bool = True,
) -> Dict[str, Any]:
    """Scrape the account's joined groups → [{id, name, url}]."""
    cfg = cfg or SessionConfig()
    async with async_playwright() as pw:
        context = await _new_context(pw, cfg, storage_state=storage_state, headless=headless)
        page = await context.new_page()
        await _apply_stealth(page)
        try:
            await page.goto(FB_GROUPS_JOINED, wait_until="domcontentloaded")
            await _sleep(2.0, 4.0)
            await _human_scroll(page, times=max_scroll)

            anchors = await page.eval_on_selector_all(
                'a[href*="/groups/"]',
                """els => els.map(a => ({ href: a.href, text: (a.innerText||'').trim() }))""",
            )
            seen: Dict[str, Dict[str, str]] = {}
            for a in anchors:
                href = a.get("href", "")
                # Normalize to /groups/<id-or-slug>/
                import re
                m = re.search(r"/groups/([^/?#]+)", href)
                if not m:
                    continue
                gid = m.group(1)
                if gid in ("joins", "feed", "discover", "create"):
                    continue
                text = a.get("text", "")
                if gid not in seen and text:
                    seen[gid] = {
                        "id": gid,
                        "name": text.split("\n")[0][:120],
                        "url": f"https://www.facebook.com/groups/{gid}/",
                    }
            return {"success": True, "groups": list(seen.values())}
        except Exception as exc:
            return {"success": False, "error": str(exc), "groups": []}
        finally:
            await context.close()


async def validate_group(
    group_url: str,
    storage_state: Dict[str, Any],
    cfg: Optional[SessionConfig] = None,
    headless: bool = True,
) -> Dict[str, Any]:
    """
    Open a group and return:
      {exists, privacy, is_member, can_post, requires_approval, name, member_count}
    """
    cfg = cfg or SessionConfig()
    async with async_playwright() as pw:
        context = await _new_context(pw, cfg, storage_state=storage_state, headless=headless)
        page = await context.new_page()
        await _apply_stealth(page)
        result: Dict[str, Any] = {
            "exists": False, "privacy": "unknown", "is_member": False,
            "can_post": False, "requires_approval": False,
            "name": None, "member_count": None,
        }
        try:
            resp = await page.goto(group_url, wait_until="domcontentloaded")
            await _sleep(2.0, 3.5)

            # 404 / removed group
            if resp and resp.status >= 400:
                result["exists"] = False
                return {"success": True, **result}

            title = (await page.title() or "").strip()
            low = title.lower()
            if "page not found" in low or "content not found" in low:
                result["exists"] = False
                return {"success": True, **result}

            result["exists"] = True
            result["name"] = title.replace(" | Facebook", "").strip() or None

            # Privacy
            if await page.locator(SELECTORS["private_marker"]).count():
                result["privacy"] = "private"
            else:
                result["privacy"] = "public"

            # Membership / posting ability — presence of composer trigger
            for sel in SELECTORS["group_composer_trigger"]:
                if await page.locator(sel).count():
                    result["is_member"] = True
                    result["can_post"] = True
                    break

            # If a "Join group" button is present, we're not a member.
            if await page.locator(SELECTORS["join_button"]).count():
                result["is_member"] = False
                result["can_post"] = False

            return {"success": True, **result}
        except Exception as exc:
            return {"success": False, "error": str(exc), **result}
        finally:
            await context.close()


async def post_to_group(
    group_url: str,
    content: str,
    storage_state: Dict[str, Any],
    image_path: Optional[str] = None,
    cfg: Optional[SessionConfig] = None,
    headless: bool = True,
) -> Dict[str, Any]:
    """
    Compose and submit a post (with optional image) in a group, human-paced.
    Returns {success, pending_approval, error}.
    """
    cfg = cfg or SessionConfig()
    async with async_playwright() as pw:
        context = await _new_context(pw, cfg, storage_state=storage_state, headless=headless)
        page = await context.new_page()
        await _apply_stealth(page)
        try:
            await page.goto(group_url, wait_until="domcontentloaded")
            await _sleep(2.5, 4.5)
            await _human_scroll(page, times=1)

            # Open composer
            opened = False
            for sel in SELECTORS["group_composer_trigger"]:
                loc = page.locator(sel).first
                if await loc.count():
                    await loc.click()
                    opened = True
                    break
            if not opened:
                return {"success": False, "error": "Composer not found (not a member or DOM changed)."}

            await _sleep(1.0, 2.2)
            textbox = page.locator(SELECTORS["composer_textbox"]).first
            await textbox.wait_for(state="visible", timeout=15000)
            await _human_type(page, textbox, content)
            await _sleep(0.8, 1.8)

            # Optional image
            if image_path:
                try:
                    file_input = page.locator(SELECTORS["photo_input"]).first
                    await file_input.set_input_files(image_path)
                    await _sleep(2.5, 5.0)  # wait for upload/preview
                except Exception as exc:
                    logger.warning("Image attach failed: %s", exc)

            # Submit
            posted = False
            for sel in SELECTORS["post_button"]:
                btn = page.locator(sel).first
                if await btn.count():
                    await btn.click()
                    posted = True
                    break
            if not posted:
                return {"success": False, "error": "Post button not found."}

            await _sleep(3.0, 6.0)

            pending = bool(await page.locator(SELECTORS["pending_approval_marker"]).count())
            return {"success": True, "pending_approval": pending, "error": None}
        except PWTimeout as exc:
            return {"success": False, "error": f"Timeout: {exc}"}
        except Exception as exc:
            return {"success": False, "error": str(exc)}
        finally:
            await context.close()
