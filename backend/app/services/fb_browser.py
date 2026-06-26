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
import os
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
    """Type text with advanced human patterns: variable speed, typos/corrections, rhythm changes."""
    locator = (
        page.locator(selector_or_locator)
        if isinstance(selector_or_locator, str)
        else selector_or_locator
    )
    
    # Focus with slight delay
    await locator.click()
    await _sleep(0.4, 1.1)
    
    # Clear any existing text
    await page.keyboard.press("Control+a")
    await _sleep(0.1, 0.3)
    
    i = 0
    while i < len(text):
        ch = text[i]
        
        # Simulate realistic typing bursts and pauses
        if random.random() < 0.08:  # 8% chance of a thinking pause
            await _sleep(0.8, 2.2)
        elif random.random() < 0.15:  # 15% chance of short pause
            await _sleep(0.3, 0.7)
        
        # Occasional typo and correction (5% chance on longer words)
        if i > 5 and random.random() < 0.05 and ch.isalpha():
            # Type wrong character
            wrong = random.choice([c for c in "qwertyuiopasdfghjklzxcvbnm" if c != ch.lower()])
            await page.keyboard.type(wrong)
            await _sleep(0.1, 0.3)
            # Backspace and correct
            await page.keyboard.press("Backspace")
            await _sleep(0.2, 0.5)
        
        # Type the correct character with variable speed
        if random.random() < 0.3:  # 30% chance of faster typing
            await _sleep(0.03, 0.08)
        else:  # Normal typing speed
            await _sleep(0.05, 0.15)
            
        await page.keyboard.type(ch)
        i += 1


async def _human_mouse_wiggle(page: Page) -> None:
    """Realistic mouse movements: curved paths, slight tremors, hover patterns."""
    try:
        # Get current position
        pos = await page.evaluate("({x: window.mouseX || 0, y: window.mouseY || 0})")
        current_x, current_y = pos.get("x", 500), pos.get("y", 300)
        
        # Generate target with gaussian distribution around center
        target_x = int(random.gauss(700, 200))
        target_y = int(random.gauss(400, 150))
        target_x = max(100, min(1200, target_x))
        target_y = max(100, min(700, target_y))
        
        # Create curved path with intermediate points
        steps = random.randint(8, 20)
        for i in range(steps):
            t = (i + 1) / steps
            # Bezier curve for natural movement
            mid_x = (current_x + target_x) / 2 + random.randint(-100, 100)
            mid_y = (current_y + target_y) / 2 + random.randint(-80, 80)
            
            if t < 0.5:
                x = current_x + (mid_x - current_x) * (t * 2)
                y = current_y + (mid_y - current_y) * (t * 2)
            else:
                x = mid_x + (target_x - mid_x) * ((t - 0.5) * 2)
                y = mid_y + (target_y - mid_y) * ((t - 0.5) * 2)
            
            # Add micro-tremor
            x += random.randint(-3, 3)
            y += random.randint(-3, 3)
            
            await page.mouse.move(x, y)
            await _sleep(0.01, 0.04)
            
    except Exception:
        pass


async def _human_scroll(page: Page, times: int = 3) -> None:
    """Natural scrolling with variable speeds and pauses."""
    for i in range(times):
        # Variable scroll distances and speeds
        if random.random() < 0.3:  # 30% chance of long scroll
            distance = random.randint(600, 1200)
            speed = random.randint(3, 8)
        else:  # Normal scroll
            distance = random.randint(200, 500)
            speed = random.randint(5, 12)
            
        # Scroll in small increments for smoothness
        steps = max(1, distance // 50)
        for _ in range(steps):
            await page.mouse.wheel(0, distance // steps)
            await _sleep(0.02, 0.06)
            
        await _sleep(0.4, 1.2)
        
        # Occasional mouse movement during scroll
        if random.random() < 0.4:
            await _human_mouse_wiggle(page)


async def _human_hover_around(page: Page, selector_or_locator) -> None:
    """Hover around an element before clicking, like a human scanning."""
    try:
        if isinstance(selector_or_locator, str):
            elem = page.locator(selector_or_locator).first
        else:
            elem = selector_or_locator
        box = await elem.bounding_box()
        if not box:
            return
            
        # Hover around the element (not directly on it)
        hover_x = box["x"] + random.randint(-50, box["width"] + 50)
        hover_y = box["y"] + random.randint(-30, box["height"] + 30)
        
        await page.mouse.move(hover_x, hover_y, steps=random.randint(5, 12))
        await _sleep(0.3, 0.8)
        
        # Small movement toward element
        await page.mouse.move(
            box["x"] + box["width"] // 2,
            box["y"] + box["height"] // 2,
            steps=random.randint(3, 8)
        )
    except Exception:
        pass


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
    ws_url = os.getenv("BROWSERLESS_WS_URL")
    if ws_url:
        token = os.getenv("BROWSERLESS_TOKEN", "astraventa_sniper_2026")
        connect_url = f"{ws_url}?token={token}&stealth"
        if cfg.proxy:
            connect_url += f"&--proxy-server={cfg.proxy}"
        
        logger.info(f"[fb_browser] Connecting to Browserless via CDP for consistent footprint: {ws_url}")
        browser = await pw.chromium.connect_over_cdp(connect_url)
    else:
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

        logger.info("[fb_browser] Launching local Chromium instance")
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
    """Scrape 'Groups you manage' from groups home sidebar."""
    cfg = cfg or SessionConfig()
    async with async_playwright() as pw:
        context = await _new_context(pw, cfg, storage_state=storage_state, headless=headless)
        page = await context.new_page()
        await _apply_stealth(page)
        try:
            # 1. Navigating to the main Groups page
            logger.info("[fb_browser] Navigating to https://www.facebook.com/groups/ to look for managed groups...")
            await page.goto("https://www.facebook.com/groups/", wait_until="domcontentloaded")
            await _sleep(3.0, 5.0)

            # Scroll all scrollable navigation/sidebar elements to trigger React lazy-loading
            try:
                await page.evaluate("""
                () => {
                    const navigations = Array.from(document.querySelectorAll('div[role="navigation"], div[aria-label="Groups"], div.x1iyjqo2'));
                    for (const nav of navigations) {
                        if (nav.innerText.includes('groups') || nav.innerText.includes('Groups') || nav.scrollHeight > nav.clientHeight) {
                            nav.scrollTop = 1000;
                        }
                    }
                }
                """)
                await _sleep(1.5, 3.0)
            except Exception as e:
                logger.warning(f"[fb_browser] Error scrolling sidebar: {e}")

            managed_groups = await page.evaluate("""
            () => {
                // Normalizes text to lowercase and replaces curly quotes with standard ones
                const norm = (str) => (str || '').trim().toLowerCase().replace(/[\\u2018\\u2019’']/g, "'");

                const managedKeywords = [
                    "groups you manage", "groups you run", "groups you admin", "managed groups",
                    "grupos que administras", "grupos que diriges", "meine gruppen", "groupes que vous gérez",
                    "your groups"
                ];
                const exitKeywords = [
                    "groups you've joined", "joined groups", "groups you joined", "discover", "suggested groups",
                    "grupos a los que te has unido", "grupos unidos", "populäre gruppen", "groupes que vous avez rejoints",
                    "see all"
                ];

                // 1. Find deepest header containing "Groups you manage" in document.body
                const headerCandidates = Array.from(document.body.querySelectorAll('span, h1, h2, h3, h4'));
                const manageCandidates = headerCandidates.filter(el => {
                    const val = norm(el.textContent);
                    return managedKeywords.includes(val);
                });
                const header = manageCandidates.find(el => {
                    return !Array.from(el.querySelectorAll('*')).some(child => manageCandidates.includes(child));
                });

                if (!header) return [];

                // 2. Find the container (sidebar) that contains this header
                let container = header.closest('div[role="navigation"]') || header.closest('div[aria-label="Groups"]') || header.closest('nav');
                if (!container) {
                    // Fallback to traversing up to 5 levels to find a suitable list div
                    let parent = header.parentElement;
                    for (let i = 0; i < 5 && parent; i++) {
                        if (parent.tagName.toUpperCase() === 'DIV' && parent.querySelectorAll('a[href*="/groups/"]').length > 0) {
                            container = parent;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }
                if (!container) container = document.body;

                // 3. Find exit header inside this container
                const containerElements = Array.from(container.querySelectorAll('span, h1, h2, h3, h4'));
                const exitCandidates = containerElements.filter(el => {
                    const val = norm(el.textContent);
                    return exitKeywords.includes(val);
                });
                const exitHeader = exitCandidates.find(el => {
                    return !Array.from(el.querySelectorAll('*')).some(child => exitCandidates.includes(child));
                });

                // 4. Extract all links pointing to groups that appear between header and exitHeader in DOM order
                const managedGroups = {};
                const allContainerElements = Array.from(container.querySelectorAll('span, h1, h2, h3, a'));
                for (const el of allContainerElements) {
                    if (el.tagName.toUpperCase() !== 'A') continue;
                    
                    // Must be after header
                    const isAfterHeader = (header.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
                    // Must be before exitHeader (if exitHeader exists)
                    const isBeforeExit = !exitHeader || ((el.compareDocumentPosition(exitHeader) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);

                    if (isAfterHeader && isBeforeExit) {
                        const href = el.getAttribute('href') || el.href || '';
                        const match = href.match(/\/groups\/([^/?#]+)/);
                        if (match) {
                            const gid = match[1];
                            if (!['feed', 'discover', 'joins', 'create', 'search', 'category'].includes(gid)) {
                                const firstSpan = el.querySelector('span');
                                 let nameText = firstSpan ? (firstSpan.innerText || firstSpan.textContent || '').trim() : (el.innerText || el.textContent || '').trim().split('\\n')[0].trim();
                                 // Replace all spaces (including non-breaking spaces like \\u00A0) with standard spaces
                                 nameText = nameText.replace(/\\s+/g, ' ');
                                // Clean up trailing activity indicators
                                nameText = nameText.replace(/(?:last active|active|about|hour|hours|minute|minutes|just now|yesterday|días|horas|minutos|activa).*/i, '').trim();
                                
                                if (nameText && nameText.length > 1 && !managedGroups[gid]) {
                                    managedGroups[gid] = {
                                        id: gid,
                                        name: nameText.substring(0, 120),
                                        url: "https://www.facebook.com/groups/" + gid + "/"
                                    };
                                }
                            }
                        }
                    }
                }
                return Object.values(managedGroups);
            }
            """)

            logger.info(f"[fb_browser] Scraped {len(managed_groups)} managed groups via groups home sidebar.")
            return {"success": True, "groups": managed_groups}
        except Exception as exc:
            logger.error(f"[fb_browser] Error scraping managed groups: {exc}")
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

            # Open composer with human-like interaction (using combined selector to wait efficiently)
            combined_trigger = ', '.join(SELECTORS["group_composer_trigger"])
            try:
                await page.locator(combined_trigger).first.wait_for(state="attached", timeout=15000)
            except Exception:
                return {"success": False, "error": "Composer not found (not a member or DOM changed)."}

            loc = page.locator(combined_trigger)
            count = await loc.count()
            opened = False
            for i in range(count):
                el = loc.nth(i)
                if await el.is_visible():
                    await _human_hover_around(page, el)
                    await _sleep(0.2, 0.6)
                    await el.click()
                    opened = True
                    break

            if not opened:
                return {"success": False, "error": "Composer not found (not a member or DOM changed)."}

            await _sleep(1.2, 2.8)
            
            # Find the visible composer textbox inside the modal dialog
            textbox = None
            dialog_textbox_selector = 'div[role="dialog"] div[role="textbox"][contenteditable="true"]'
            loc = page.locator(dialog_textbox_selector)
            if not await loc.count():
                loc = page.locator(SELECTORS["composer_textbox"])

            try:
                await loc.first.wait_for(state="attached", timeout=15000)
            except Exception:
                return {"success": False, "error": "Composer textbox not found."}
            
            count = await loc.count()
            for i in range(count):
                el = loc.nth(i)
                if await el.is_visible():
                    # Avoid matching comment boxes
                    placeholder = await el.get_attribute("aria-placeholder") or ""
                    label = await el.get_attribute("aria-label") or ""
                    if "comment" in placeholder.lower() or "comment" in label.lower():
                        continue
                    textbox = el
                    break
            
            # Fallback to first visible textbox if no exact match found
            if not textbox:
                for i in range(count):
                    el = loc.nth(i)
                    if await el.is_visible():
                        textbox = el
                        break

            if not textbox:
                return {"success": False, "error": "Composer textbox is not visible."}
            
            # Click near textbox then focus properly
            await _human_hover_around(page, textbox)
            await textbox.click()
            await _sleep(0.3, 0.7)
            
            await _human_type(page, textbox, content)
            await _sleep(0.8, 2.1)

            # Optional image with realistic upload behavior
            if image_path:
                try:
                    # Look for photo button inside dialog first
                    photo_loc = page.locator(f'div[role="dialog"] {SELECTORS["photo_input"]}')
                    if not await photo_loc.count():
                        photo_loc = page.locator(SELECTORS["photo_input"])
                    
                    # If no file input is found, click the Photo/video button in dialog to reveal it
                    if not await photo_loc.count():
                        logger.info("Hidden file input not found, searching for Photo/video button to click first")
                        trigger_btn = page.locator('div[role="dialog"] div[role="button"]:has-text("Photo/video")')
                        if not await trigger_btn.count():
                            trigger_btn = page.locator('div[role="dialog"] [aria-label*="Photo/video"]')
                        if await trigger_btn.count() and await trigger_btn.first.is_visible():
                            await _human_hover_around(page, trigger_btn.first)
                            await trigger_btn.first.click()
                            await _sleep(1.0, 2.5)
                        
                        # Re-locate photo input
                        photo_loc = page.locator(f'div[role="dialog"] {SELECTORS["photo_input"]}')
                        if not await photo_loc.count():
                            photo_loc = page.locator(SELECTORS["photo_input"])

                    await _human_hover_around(page, photo_loc)
                    file_input = photo_loc.first
                    await file_input.set_input_files(image_path)
                    
                    # Wait for upload with human-like impatience checks
                    for _ in range(random.randint(4, 8)):
                        await _sleep(0.5, 1.0)
                        # Move mouse slightly while waiting
                        await _human_mouse_wiggle(page)
                        
                except Exception as exc:
                    logger.warning("Image attach failed: %s", exc)

            # Final review before posting (human behavior)
            if random.random() < 0.4:  # 40% chance to "review" before posting
                await _sleep(1.5, 3.0)
                await _human_mouse_wiggle(page)
            
            # Submit Post button (robust exact-text dialog check first)
            posted = False
            btn_loc = page.locator('div[role="dialog"] div[role="button"]')
            if not await btn_loc.count():
                btn_loc = page.locator('div[role="button"]')
                
            count = await btn_loc.count()
            for i in range(count):
                el = btn_loc.nth(i)
                if await el.is_visible():
                    text = (await el.inner_text() or "").strip().lower()
                    if text in ["post", "publicar", "posten", "publier", "share", "partager", "pubblica"]:
                        # Check if post button is disabled (e.g. uploading) and wait for it to become enabled
                        for _ in range(15):
                            disabled = await el.get_attribute("aria-disabled")
                            if disabled == "true":
                                logger.info("Post button is disabled (possibly uploading), waiting...")
                                await _sleep(1.0, 2.0)
                            else:
                                break
                        await _human_hover_around(page, el)
                        await _sleep(0.3, 0.8)
                        await el.click()
                        posted = True
                        break
            
            # Fallback to selectors if exact text search didn't resolve
            if not posted:
                for sel in SELECTORS["post_button"]:
                    loc = page.locator(f'div[role="dialog"] {sel}')
                    if not await loc.count():
                        loc = page.locator(sel)
                    try:
                        await loc.first.wait_for(state="attached", timeout=5000)
                    except Exception:
                        continue
                    
                    count = await loc.count()
                    for i in range(count):
                        el = loc.nth(i)
                        if await el.is_visible():
                            # Guard against "Anonymous post" button
                            label = (await el.get_attribute("aria-label") or "").lower()
                            if "anonymous" in label:
                                continue
                            for _ in range(15):
                                disabled = await el.get_attribute("aria-disabled")
                                if disabled == "true":
                                    logger.info("Fallback post button is disabled, waiting...")
                                    await _sleep(1.0, 2.0)
                                else:
                                    break
                            await _human_hover_around(page, el)
                            await _sleep(0.3, 0.8)
                            await el.click()
                            posted = True
                            break
                    if posted:
                        break

            if not posted:
                return {"success": False, "error": "Post button not found."}

            # Wait for post to process with realistic behavior
            await _sleep(3.0, 7.0)
            
            # Occasional scroll after posting (human behavior)
            if random.random() < 0.3:
                await _human_scroll(page, times=1)

            pending = bool(await page.locator(SELECTORS["pending_approval_marker"]).count())
            return {"success": True, "pending_approval": pending, "error": None}
        except PWTimeout as exc:
            return {"success": False, "error": f"Timeout: {exc}"}
        except Exception as exc:
            return {"success": False, "error": str(exc)}
        finally:
            await context.close()
