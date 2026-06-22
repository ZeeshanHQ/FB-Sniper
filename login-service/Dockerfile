FROM python:3.11-slim

# ── System deps: Xvfb + noVNC + Chromium + websockify ──────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    curl \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    lsof \
    procps \
    && rm -rf /var/lib/apt/lists/*

# ── Python deps ─────────────────────────────────────────────────────────────
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Install Playwright Chromium ──────────────────────────────────────────────
RUN playwright install chromium --with-deps

# ── App source ──────────────────────────────────────────────────────────────
COPY . .

# ── noVNC static files symlink ───────────────────────────────────────────────
RUN ln -sf /usr/share/novnc /app/novnc_static || true

EXPOSE 8080 6080

CMD ["python", "server.py"]
