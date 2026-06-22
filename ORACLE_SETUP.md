# Oracle Cloud Free Instance — Complete Setup Guide
## For: FB Login Service (Astraventa FB Sniper)

---

## Step 1 — Create Oracle Cloud Account (Free)

1. Go to https://cloud.oracle.com
2. Click **Start for free**
3. Fill in details — use a **real credit card** (required for identity, NOT charged)
4. Choose your **Home Region** — pick closest to your users (e.g. UK South, US East)
5. Complete phone verification
6. Wait ~10 minutes for account activation email

> Oracle Always Free gives you: 2 AMD VMs (1 OCPU, 1GB RAM each) — FREE FOREVER

---

## Step 2 — Create the Free VM Instance

1. Log into https://cloud.oracle.com
2. Left menu → **Compute** → **Instances** → **Create Instance**
3. Settings:
   - **Name**: `fb-login-service`
   - **Image**: Ubuntu 22.04 (click "Change Image" → Ubuntu)
   - **Shape**: VM.Standard.E2.1.Micro (Always Free eligible)
   - **Networking**: Keep defaults (new VCN created automatically)
   - **SSH Keys**: Click "Generate a key pair" → Download BOTH files
     - Save `ssh-key-XXXX.key` somewhere safe (your private key)
4. Click **Create**
5. Wait ~2 minutes — Status turns **Running**
6. Copy the **Public IP Address** shown on the instance page

---

## Step 3 — Open Firewall Ports

Oracle blocks all ports by default. You must open them.

### A) Security List (Oracle firewall)
1. Instance page → **Primary VNIC** → click the **Subnet** link
2. Click **Default Security List**
3. **Add Ingress Rules** → Add these one by one:

| Source CIDR | Protocol | Port | Description |
|---|---|---|---|
| 0.0.0.0/0 | TCP | 8080 | Login service API |
| 0.0.0.0/0 | TCP | 6080 | noVNC websocket |
| 0.0.0.0/0 | TCP | 22 | SSH (already exists) |

### B) OS firewall (Ubuntu ufw)
SSH into the instance first (Step 4), then run:
```bash
sudo ufw allow 22
sudo ufw allow 8080
sudo ufw allow 6080
sudo ufw enable
```

---

## Step 4 — SSH Into The Instance

On your Windows machine, open PowerShell:

```powershell
# Replace with your actual key file path and public IP
ssh -i "C:\Users\YourName\Downloads\ssh-key-XXXX.key" ubuntu@YOUR_PUBLIC_IP
```

If permission error on Windows:
```powershell
icacls "C:\Users\YourName\Downloads\ssh-key-XXXX.key" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

---

## Step 5 — Install Docker on the VM

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# Log out and back in for group change to take effect
exit
```

SSH back in, then verify:
```bash
docker --version
```

---

## Step 6 — Deploy the Login Service

```bash
# Clone your repo (or just copy the login-service folder)
git clone https://github.com/ZeeshanHQ/FB-Sniper.git
cd FB-Sniper/login-service

# Create .env file
cp .env.example .env
nano .env
```

Fill in your `.env`:
```
RENDER_API_URL=https://your-render-app.onrender.com
SESSION_ENCRYPTION_KEY=same_key_as_render
ALLOWED_ORIGIN=https://your-app.vercel.app
PUBLIC_HOST=YOUR_ORACLE_PUBLIC_IP
LOGIN_TIMEOUT_S=300
NOVNC_PORT=6080
API_PORT=8080
```

**IMPORTANT**: `SESSION_ENCRYPTION_KEY` must be the EXACT same key you added to Render.

```bash
# Build and run
docker build -t fb-login-service .
docker run -d \
  --name fb-login \
  --env-file .env \
  --restart unless-stopped \
  -p 8080:8080 \
  -p 6080:6080 \
  fb-login-service

# Check it started correctly
docker logs fb-login
```

---

## Step 7 — Add to Vercel Environment Variables

In Vercel → Your Project → Settings → Environment Variables, add:

```
NEXT_PUBLIC_LOGIN_SERVICE_URL=http://YOUR_ORACLE_PUBLIC_IP:8080
```

Redeploy Vercel after adding this.

---

## Step 8 — Test It End to End

1. Open your dashboard → Groups section
2. Click **Connect Account**
3. A modal should appear with a live browser window
4. Log into Facebook normally
5. Modal auto-closes, account appears in the list

---

## Keeping It Running (Auto-restart on reboot)

Docker's `--restart unless-stopped` flag handles this. But also run:

```bash
sudo systemctl enable docker
```

---

## Updating The Login Service

```bash
cd FB-Sniper
git pull origin group
cd login-service
docker stop fb-login
docker rm fb-login
docker build -t fb-login-service .
docker run -d --name fb-login --env-file .env --restart unless-stopped -p 8080:8080 -p 6080:6080 fb-login-service
```

---

## Cost Summary

| Service | Monthly Cost |
|---|---|
| Oracle VM (login capture) | **$0 forever** |
| Render (API + worker) | $7 |
| Vercel (frontend) | $0 (hobby) |
| Supabase (database) | $0 (free tier) |
| **Total** | **$7/month** |

---

## Troubleshooting

**Modal opens but shows blank:**
```bash
docker logs fb-login --tail 50
```
Check Xvfb and x11vnc started correctly.

**Port refused:**
- Recheck Oracle Security List ingress rules
- Run `sudo ufw status` on the VM

**Session not storing to Render:**
- Verify `RENDER_API_URL` has no trailing slash
- Verify `SESSION_ENCRYPTION_KEY` matches exactly between Oracle and Render
- Check Render logs for errors on `/api/fb/session/store`
