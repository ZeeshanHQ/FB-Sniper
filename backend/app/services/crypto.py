"""
Session encryption helper — Astraventa FB Sniper
=================================================

Encrypts/decrypts Playwright `storage_state` JSON before it is persisted to
Supabase. Uses Fernet (AES-128-CBC + HMAC) with a key from the environment.

Env:
  SESSION_ENCRYPTION_KEY  – a urlsafe base64 32-byte Fernet key.
                            Generate once with:
                              python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

If the key is missing we fail loudly rather than store plaintext secrets.
"""

import json
import os
from typing import Any, Dict

from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()


def _fernet() -> Fernet:
    key = os.getenv("SESSION_ENCRYPTION_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "SESSION_ENCRYPTION_KEY is not set. Generate one with: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode())


def encrypt_state(state: Dict[str, Any]) -> str:
    """Serialize + encrypt a Playwright storage_state dict to a string token."""
    raw = json.dumps(state, separators=(",", ":")).encode()
    return _fernet().encrypt(raw).decode()


def decrypt_state(token: str) -> Dict[str, Any]:
    """Decrypt + deserialize a stored token back into a storage_state dict."""
    raw = _fernet().decrypt(token.encode())
    return json.loads(raw.decode())
