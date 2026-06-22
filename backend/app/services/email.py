"""
Resend Email Service
Handles all transactional emails via Resend API
"""

import httpx
import random
import string
import os
from dotenv import load_dotenv

load_dotenv()

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL", "verify@astraventa.com")


def generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


async def send_password_reset_email(to_email: str, otp_code: str) -> bool:
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1d1d1d;padding:36px 40px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Astraventa</div>
            <div style="font-size:13px;color:#4d585f;margin-top:4px;">FB Sniper Platform</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#1d1d1d;">Password reset request</p>
            <p style="margin:0 0 32px;font-size:15px;color:#4d585f;line-height:1.6;">
              Use the code below to reset your Astraventa password.
              It expires in <strong style="color:#1d1d1d;">10 minutes</strong>.
            </p>

            <!-- OTP Box -->
            <div style="background:#f5f7fa;border:1px solid #dde5ed;border-radius:14px;padding:28px;text-align:center;margin-bottom:32px;">
              <div style="font-size:46px;font-weight:700;letter-spacing:14px;color:#1d1d1d;font-family:'Courier New',monospace;line-height:1;">
                {otp_code}
              </div>
            </div>

            <p style="margin:0;font-size:13px;color:#bababa;line-height:1.6;">
              If you didn&rsquo;t request a password reset, you can safely ignore this email.
              Your password will not change.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #edf1f4;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#bababa;">
              &copy; 2025 Astraventa &nbsp;&middot;&nbsp; astraventa.com
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"Astraventa <{FROM_EMAIL}>",
                    "to": [to_email],
                    "subject": f"{otp_code} — Reset your Astraventa password",
                    "html": html,
                },
            )
        return response.status_code in (200, 201)
    except Exception:
        return False


async def send_otp_email(to_email: str, otp_code: str, full_name: str = "") -> bool:
    display_name = full_name.split()[0] if full_name else "there"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1d1d1d;padding:36px 40px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Astraventa</div>
            <div style="font-size:13px;color:#4d585f;margin-top:4px;">FB Sniper Platform</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#1d1d1d;">Hey {display_name},</p>
            <p style="margin:0 0 32px;font-size:15px;color:#4d585f;line-height:1.6;">
              Here is your verification code to activate your Astraventa account.
              It expires in <strong style="color:#1d1d1d;">10 minutes</strong>.
            </p>

            <!-- OTP Box -->
            <div style="background:#f5f7fa;border:1px solid #dde5ed;border-radius:14px;padding:28px;text-align:center;margin-bottom:32px;">
              <div style="font-size:46px;font-weight:700;letter-spacing:14px;color:#1d1d1d;font-family:'Courier New',monospace;line-height:1;">
                {otp_code}
              </div>
            </div>

            <p style="margin:0;font-size:13px;color:#bababa;line-height:1.6;">
              If you didn&rsquo;t request this, you can safely ignore this email.
              Never share this code with anyone.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #edf1f4;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#bababa;">
              &copy; 2025 Astraventa &nbsp;&middot;&nbsp; astraventa.com
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"Astraventa <{FROM_EMAIL}>",
                    "to": [to_email],
                    "subject": f"{otp_code} — Your Astraventa verification code",
                    "html": html,
                },
            )
        return response.status_code in (200, 201)
    except Exception:
        return False


async def send_session_expired_email(
    to_email: str,
    full_name: str = "",
    fb_account_name: str = "",
    dashboard_url: str = "https://fb-sniper.vercel.app/dashboard",
) -> bool:
    display_name = full_name.split()[0] if full_name else "there"
    account_label = f" (<strong>{fb_account_name}</strong>)" if fb_account_name else ""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1d1d1d;padding:36px 40px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Astraventa</div>
            <div style="font-size:13px;color:#9ca3af;margin-top:4px;">FB Sniper Platform</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#1d1d1d;">Hey {display_name},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#4d585f;line-height:1.6;">
              Your Facebook session{account_label} has <strong style="color:#ef4444;">expired or been disconnected</strong>.
              Your scheduled campaigns targeting groups with this account have been paused.
            </p>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
              <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">
                &#9888;&nbsp; This can happen when Facebook logs out the session due to a password change,
                a security checkpoint, or natural cookie expiry. Simply reconnect to resume automation.
              </p>
            </div>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
              <tr>
                <td style="background:#1d1d1d;border-radius:10px;padding:14px 32px;text-align:center;">
                  <a href="{dashboard_url}" style="font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;display:inline-block;">
                    Reconnect Facebook &rarr;
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#bababa;line-height:1.6;">
              Go to <strong>Dashboard &rarr; Groups &rarr; Connect Facebook Account</strong> and log in again.
              It only takes a moment.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #edf1f4;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#bababa;">
              &copy; 2025 Astraventa &nbsp;&middot;&nbsp; astraventa.com
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"Astraventa <{FROM_EMAIL}>",
                    "to": [to_email],
                    "subject": "Action required — Reconnect your Facebook account",
                    "html": html,
                },
            )
        return response.status_code in (200, 201)
    except Exception:
        return False
