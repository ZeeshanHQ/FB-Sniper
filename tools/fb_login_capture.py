#!/usr/bin/env python3
"""
FB Login Capture — Astraventa FB Sniper
========================================
Run this ONCE on your local machine (Windows / Mac / Linux) to capture
your Facebook session and send it to your Render backend.

Requirements:
    pip install playwright requests
    playwright install chromium

Usage:
    python fb_login_capture.py

The script will:
  1. Ask for your Render API URL and your Astraventa user ID.
  2. Open a real Chrome window — log into Facebook normally.
  3. Capture and send the encrypted session to Render automatically.
  4. Print the new session ID when done.
"""

import asyncio
import json
import re
import sys

# ── Dependency checks ────────────────────────────────────────────────────────

try:
    import requests
except ImportError:
    sys.exit("Missing dependency. Run: pip install requests")

try:
    from playwright.async_api import async_playwright
except ImportError:
    sys.exit("Missing dependency. Run: pip install playwright && playwright install chromium")


# ── Config ───────────────────────────────────────────────────────────────────

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

WAIT_FOR_URL_TIMEOUT = 300_000  # 5 minutes to complete login


# ── Main capture ─────────────────────────────────────────────────────────────

async def capture_and_send(api_base: str, user_id: str, proxy: str | None = None) -> None:
    print("\n[1/4] Opening browser — log into Facebook and wait for your home feed...")

    launch_opts: dict = {
        "headless": False,
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-infobars",
            "--start-maximized",
        ],
    }
    if proxy:
        launch_opts["proxy"] = {"server": proxy}

    context_opts: dict = {
        "user_agent": DEFAULT_USER_AGENT,
        "viewport": {"width": 1366, "height": 768},
        "locale": "en-US",
        "timezone_id": "America/New_York",
    }

    async with async_playwright() as p:
        browser = await p.chromium.launch(**launch_opts)
        context = await browser.new_context(**context_opts)

        # Remove webdriver property so Facebook doesn't detect automation
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        """)

        page = await context.new_page()
        await page.goto("https://www.facebook.com/login", wait_until="domcontentloaded")

        print("[2/4] Waiting for you to log in and reach the home feed (up to 5 min)...")

        try:
            await page.wait_for_url(
                re.compile(r"facebook\.com(/|\?|$)"),
                timeout=WAIT_FOR_URL_TIMEOUT,
            )
        except Exception:
            await browser.close()
            sys.exit("Timed out waiting for login. Please try again.")

        # Extra wait to ensure cookies are fully set
        await asyncio.sleep(3)

        # Detect account info from the page
        fb_account_name: str | None = None
        fb_account_id: str | None = None

        try:
            fb_account_name = await page.evaluate(
                "() => document.querySelector('[aria-label=\"Facebook\"] span')?.innerText || null"
            )
        except Exception:
            pass

        # c_user cookie = Facebook numeric user ID
        cookies = await context.cookies()
        for c in cookies:
            if c.get("name") == "c_user":
                fb_account_id = c["value"]
                break

        print(f"[3/4] Captured session — Account: {fb_account_name or 'unknown'}, ID: {fb_account_id or 'unknown'}")

        storage_state = await context.storage_state()
        await browser.close()

    # ── Send to Render ────────────────────────────────────────────────────────
    print(f"[4/4] Sending session to {api_base}/api/fb/session/store ...")

    payload = {
        "user_id": user_id,
        "storage_state": storage_state,
        "fb_account_name": fb_account_name,
        "fb_account_id": fb_account_id,
        "user_agent": DEFAULT_USER_AGENT,
    }

    try:
        resp = requests.post(
            f"{api_base.rstrip('/')}/api/fb/session/store",
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.RequestException as e:
        sys.exit(f"\nFailed to reach Render backend: {e}")

    if not data.get("success"):
        sys.exit(f"\nServer error: {data}")

    session = data["session"]
    print("\n✅  Session stored successfully!")
    print(f"    Session ID : {session['id']}")
    print(f"    Account    : {session.get('fb_account_name') or 'unknown'}")
    print(f"    Status     : {session.get('status')}")
    print("\nYou can now close this terminal. Your campaigns will run on Render automatically.")
    print("If Facebook expires this session, you will receive an email to run this script again.\n")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("  Astraventa FB Sniper — Facebook Login Capture Tool")
    print("=" * 60)

    api_base = input(
        "\nEnter your Render backend URL\n"
        "(e.g. https://fb-sniper-api.onrender.com): "
    ).strip().rstrip("/")

    if not api_base.startswith("http"):
        sys.exit("Invalid URL. Must start with https://")

    user_id = input(
        "\nEnter your Astraventa User ID\n"
        "(find it in Dashboard → Settings → Account): "
    ).strip()

    if len(user_id) < 10:
        sys.exit("User ID looks too short. Copy it from your dashboard Settings page.")

    proxy = input(
        "\nProxy (optional — leave blank to skip)\n"
        "(format: http://user:pass@host:port or socks5://host:port): "
    ).strip() or None

    asyncio.run(capture_and_send(api_base, user_id, proxy))


if __name__ == "__main__":
    main()
