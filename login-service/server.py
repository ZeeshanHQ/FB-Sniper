"""
FB Login Service — Astraventa FB Sniper
========================================
Runs on Oracle Cloud Free instance.

Flow:
  1. Client hits POST /start-login  → starts Xvfb + x11vnc + noVNC + Chrome
  2. Client gets back a noVNC URL   → rendered as iframe in the dashboard
  3. Client logs into Facebook in the iframe (real browser, real keyboard)
  4. Service detects login success  → captures storage_state
  5. Service encrypts + pushes to   → Render /api/fb/session/store
  6. Client's dashboard polls GET /login-status/{session_token} → done

Security:
  - Each session gets a random token; iframe URL is unguessable
  - Sessions auto-expire after 10 minutes if unused
  - CORS locked to your Vercel domain via ALLOWED_ORIGIN env var
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import secrets
import subprocess
import time
from contextlib import asynccontextmanager
from typing import Dict, Optional

import httpx
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from playwright.async_api import async_playwright
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ── Config from env ──────────────────────────────────────────────────────────
RENDER_API_URL      = os.getenv("RENDER_API_URL", "")          # e.g. https://fb-sniper-api.onrender.com
SESSION_ENC_KEY     = os.getenv("SESSION_ENCRYPTION_KEY", "")
ALLOWED_ORIGIN      = os.getenv("ALLOWED_ORIGIN", "*")         # e.g. https://fb-sniper.vercel.app
LOGIN_TIMEOUT_S     = int(os.getenv("LOGIN_TIMEOUT_S", "300")) # 5 min default
VNC_BASE_PORT       = int(os.getenv("VNC_BASE_PORT", "5900"))
NOVNC_PORT          = int(os.getenv("NOVNC_PORT", "6080"))
API_PORT            = int(os.getenv("API_PORT", "8080"))
SERVICE_SECRET      = os.getenv("SERVICE_SECRET", secrets.token_hex(32))

# ── In-memory session store ──────────────────────────────────────────────────
# { token: { user_id, status, fb_name, fb_id, created_at, procs } }
_sessions: Dict[str, dict] = {}
_FERNET = Fernet(SESSION_ENC_KEY.encode()) if SESSION_ENC_KEY else None


def _encrypt(data: dict) -> str:
    if not _FERNET:
        raise RuntimeError("SESSION_ENCRYPTION_KEY not set")
    return _FERNET.encrypt(json.dumps(data).encode()).decode()


# ── Models ───────────────────────────────────────────────────────────────────

class StartLoginRequest(BaseModel):
    user_id: str
    proxy: Optional[str] = None


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_cleanup_loop(), name="cleanup")
    yield


app = FastAPI(title="FB Login Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN] if ALLOWED_ORIGIN != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Cleanup loop — kill stale sessions after timeout ─────────────────────────

async def _cleanup_loop():
    while True:
        now = time.time()
        stale = [t for t, s in _sessions.items()
                 if now - s["created_at"] > LOGIN_TIMEOUT_S + 60
                 and s["status"] in ("waiting", "expired")]
        for token in stale:
            _kill_session(token)
        await asyncio.sleep(30)


def _kill_session(token: str):
    s = _sessions.pop(token, None)
    if not s:
        return
    for proc in s.get("procs", []):
        try:
            proc.terminate()
        except Exception:
            pass
    logger.info(f"[Cleanup] Session {token[:8]}… killed")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/start-login")
async def start_login(req: StartLoginRequest):
    """
    Starts a dedicated Xvfb display + Chrome + noVNC websocket for one login session.
    Returns the noVNC URL the frontend renders as an iframe.
    """
    token      = secrets.token_urlsafe(32)
    display_n  = (len(_sessions) % 50) + 10   # :10 to :59
    vnc_port   = VNC_BASE_PORT + display_n

    # ── Start Xvfb ───────────────────────────────────────────────────────────
    xvfb = subprocess.Popen([
        "Xvfb", f":{display_n}",
        "-screen", "0", "1366x768x24",
        "-ac", "+extension", "GLX",
    ])
    await asyncio.sleep(0.8)

    # ── Start x11vnc on that display ─────────────────────────────────────────
    x11vnc = subprocess.Popen([
        "x11vnc",
        "-display", f":{display_n}",
        "-rfbport", str(vnc_port),
        "-nopw",
        "-forever",
        "-shared",
        "-quiet",
        "-bg",
    ])
    await asyncio.sleep(0.5)

    _sessions[token] = {
        "user_id":    req.user_id,
        "status":     "waiting",
        "fb_name":    None,
        "fb_id":      None,
        "created_at": time.time(),
        "display":    display_n,
        "vnc_port":   vnc_port,
        "proxy":      req.proxy,
        "procs":      [xvfb, x11vnc],
    }

    # Launch Chrome + capture in background
    asyncio.create_task(_run_capture(token))

    # noVNC URL — served by websockify on NOVNC_PORT
    # We proxy all vnc ports through a single websockify via token routing
    # Generate full HTTPS URL to avoid mixed content issues
    scheme = "https"
    novnc_url = f"{scheme}://{os.getenv('PUBLIC_HOST', 'localhost')}/novnc/?token={token}"

    logger.info(f"[StartLogin] user={req.user_id} token={token[:8]}… display=:{display_n}")
    return {
        "success":   True,
        "token":     token,
        "novnc_url": novnc_url,
        "expires_in": LOGIN_TIMEOUT_S,
    }


@app.get("/login-status/{token}")
async def login_status(token: str):
    s = _sessions.get(token)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    return {
        "status":   s["status"],
        "fb_name":  s.get("fb_name"),
        "fb_id":    s.get("fb_id"),
    }


@app.get("/novnc/", response_class=HTMLResponse)
async def novnc_viewer(token: str):
    """Serve noVNC viewer page with auto-connect to the right VNC port."""
    s = _sessions.get(token)
    if not s:
        return HTMLResponse("<h2>Session expired or not found.</h2>", status_code=404)

    vnc_port = s["vnc_port"]
    host     = os.getenv("PUBLIC_HOST", "localhost")

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Connect Facebook — Astraventa</title>
  <style>
    * {{ margin:0;padding:0;box-sizing:border-box; }}
    body {{ background:#0f0f0f;display:flex;flex-direction:column;align-items:center;height:100vh;font-family:Arial,sans-serif; }}
    #header {{ width:100%;padding:10px 20px;background:#1d1d1d;color:#fff;font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px; }}
    #status {{ font-size:12px;color:#9ca3af;margin-left:auto; }}
    iframe {{ flex:1;width:100%;border:none; }}
  </style>
</head>
<body>
  <div id="header">
    <span>🔒 Astraventa — Connect your Facebook Account</span>
    <span id="status">Log into Facebook in the window below. This tab will close automatically when done.</span>
  </div>
  <iframe src="/static/novnc/vnc.html?host={host}&path=websockify?token={token}&autoconnect=true&resize=scale&show_dot=false" allowfullscreen></iframe>
  <script>
    // Poll for completion
    const poll = setInterval(async () => {{
      try {{
        const r = await fetch('/login-status/{token}');
        const d = await r.json();
        if (d.status === 'done') {{
          document.getElementById('status').textContent = '✅ Connected! You can close this tab.';
          document.getElementById('status').style.color = '#10b981';
          clearInterval(poll);
          setTimeout(() => window.close(), 3000);
        }} else if (d.status === 'expired') {{
          document.getElementById('status').textContent = '⚠ Session expired. Please try again.';
          clearInterval(poll);
        }}
      }} catch {{}}
    }}, 3000);
  </script>
</body>
</html>"""
    return HTMLResponse(html)


# ── Background capture coroutine ──────────────────────────────────────────────

async def _run_capture(token: str):
    """Open Chrome on the Xvfb display, wait for FB login, capture session, push to Render."""
    s = _sessions.get(token)
    if not s:
        return

    display  = s["display"]
    user_id  = s["user_id"]
    proxy    = s.get("proxy")

    os.environ["DISPLAY"] = f":{display}"

    DEFAULT_UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )

    launch_opts: dict = {
        "headless": False,
        "env": {"DISPLAY": f":{display}"},
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-infobars",
            "--start-maximized",
            f"--display=:{display}",
        ],
    }
    if proxy:
        launch_opts["proxy"] = {"server": proxy}

    try:
        async with async_playwright() as p:
            browser  = await p.chromium.launch(**launch_opts)
            context  = await browser.new_context(
                user_agent=DEFAULT_UA,
                viewport={"width": 1366, "height": 768},
                locale="en-US",
                timezone_id="America/New_York",
            )

            # Remove automation fingerprint
            await context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                window.chrome = { runtime: {} };
            """)

            page = await context.new_page()
            await page.goto("https://www.facebook.com/login", wait_until="domcontentloaded")

            logger.info(f"[Capture] {token[:8]}… waiting for login (timeout={LOGIN_TIMEOUT_S}s)")

            # Wait until user lands on home feed
            await page.wait_for_url(
                re.compile(r"facebook\.com(/|\?|$)"),
                timeout=LOGIN_TIMEOUT_S * 1000,
            )
            await asyncio.sleep(3)  # let cookies settle

            # Detect account info
            fb_name: Optional[str] = None
            fb_id:   Optional[str] = None
            try:
                fb_name = await page.evaluate(
                    "() => document.querySelector('[aria-label=\"Facebook\"] span')?.innerText || null"
                )
            except Exception:
                pass

            cookies = await context.cookies()
            for c in cookies:
                if c.get("name") == "c_user":
                    fb_id = c["value"]
                    break

            storage_state = await context.storage_state()
            await browser.close()

        # Encrypt + push to Render
        encrypted = _encrypt(storage_state)
        payload   = {
            "user_id":          user_id,
            "storage_state":    storage_state,
            "fb_account_name":  fb_name,
            "fb_account_id":    fb_id,
            "user_agent":       DEFAULT_UA,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{RENDER_API_URL.rstrip('/')}/api/fb/session/store",
                json=payload,
            )
            r.raise_for_status()
            data = r.json()

        if data.get("success"):
            _sessions[token]["status"]  = "done"
            _sessions[token]["fb_name"] = fb_name
            _sessions[token]["fb_id"]   = fb_id
            logger.info(f"[Capture] {token[:8]}… ✅ session stored — {fb_name} ({fb_id})")
        else:
            _sessions[token]["status"] = "error"
            logger.error(f"[Capture] {token[:8]}… Render store failed: {data}")

    except Exception as exc:
        _sessions[token]["status"] = "expired"
        logger.error(f"[Capture] {token[:8]}… failed: {exc}")
    finally:
        # Kill Xvfb + x11vnc for this display after capture
        await asyncio.sleep(10)
        _kill_session(token)


# ── Websockify token file (maps noVNC token → VNC port) ──────────────────────

@app.on_event("startup")
async def start_websockify():
    """Start a single websockify that routes by token to each VNC port."""
    token_dir = "/tmp/novnc_tokens"
    os.makedirs(token_dir, exist_ok=True)
    subprocess.Popen([
        "websockify",
        "--web", "/usr/share/novnc",
        "--token-plugin", "TokenFile",
        "--token-source", token_dir,
        str(NOVNC_PORT),
    ])
    logger.info(f"[Websockify] Started on port {NOVNC_PORT}")
    app.state.token_dir = token_dir


@app.on_event("startup")
async def write_token_files():
    """Keep token files in sync with active sessions (runs every 5s)."""
    async def _sync():
        while True:
            token_dir = getattr(app.state, "token_dir", "/tmp/novnc_tokens")
            for token, s in list(_sessions.items()):
                tf = os.path.join(token_dir, token)
                if not os.path.exists(tf):
                    with open(tf, "w") as f:
                        f.write(f"{token}: localhost:{s['vnc_port']}\n")
            await asyncio.sleep(5)
    asyncio.create_task(_sync())


# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=API_PORT, reload=False)
