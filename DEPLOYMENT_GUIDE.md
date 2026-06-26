# FB Sniper Deployment Guide

## Overview
FB Sniper consists of two parts:
- **Frontend**: Next.js 15 application (deployed to Vercel)
- **Backend**: FastAPI application (deployed to Render or similar)

You must deploy both separately.

---

## Part 1: Frontend Deployment (Vercel)

### Prerequisites
- Vercel account (free tier works)
- GitHub repository with your code
- Supabase project URL and anon key

### Steps

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Import project in Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Select the `frontend` folder as root directory (if monorepo)

3. **Configure Environment Variables in Vercel**
   
   Go to Project Settings → Environment Variables and add:
   
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://rqpslulmmzlxnfkpphpg.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxcHNsdWxtbXpseG5ma3BwaHBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM0MzU5NiwiZXhwIjoyMDkzOTE5NTk2fQ.DAEt9KURVdwRbyR8S06UmoA0LUR95JgN_VrgHLkJ2kI
   NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com
   META_APP_ID=859277567200360
   META_APP_SECRET=5b36703cd059edf0c890cf4332acd305
   ```

   **Important**: `NEXT_PUBLIC_API_URL` should be your deployed backend URL (from Render), not localhost.

4. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy your Next.js app
   - You'll get a URL like `https://fb-sniper.vercel.app`

5. **Update Meta Redirect URI**
   - After deployment, update your Facebook App settings:
   - Set `META_REDIRECT_URI` to: `https://your-vercel-domain.vercel.app/api/auth/callback`

---

## Part 2: Backend Deployment (Render)

### Prerequisites
- Render account (free tier available)
- GitHub repository with your code

### Steps

1. **Create `requirements.txt` in backend folder** (if not exists)
   ```txt
   fastapi==0.104.1
   uvicorn[standard]==0.24.0
   supabase==2.3.4
   httpx==0.25.0
   python-dotenv==1.0.0
   ```

2. **Create `render.yaml` in backend folder** (optional but recommended)
   ```yaml
   services:
     - type: web
       name: fb-sniper-backend
       env: python
       buildCommand: pip install -r requirements.txt && playwright install chromium
       startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
       envVars:
         - key: SUPABASE_URL
           value: https://rqpslulmmzlxnfkpphpg.supabase.co
         - key: SUPABASE_SERVICE_KEY
           value: your_service_key_here
         - key: RESEND_API_KEY
           value: re_Pk4UBMsH_NEeT4xunsE1NtZi9VcKQ3HPM
         - key: FROM_EMAIL
           value: verify@astraventa.com
         - key: META_APP_ID
           value: 859277567200360
         - key: META_APP_SECRET
           value: 5b36703cd059edf0c890cf4332acd305
         - key: META_REDIRECT_URI
           value: https://your-vercel-domain.vercel.app/api/auth/callback
   ```

3. **Push code to GitHub** (if not already done)

4. **Create Web Service in Render**
   - Go to [render.com](https://render.com)
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Select the `backend` folder as root (if monorepo)
   - Runtime: Python 3
   - Build Command: `pip install -r requirements.txt && playwright install chromium`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

5. **Configure Environment Variables in Render**
   
   Go to your service → Environment and add:
   
   ```
   SUPABASE_URL=https://rqpslulmmzlxnfkpphpg.supabase.co
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxcHNsdWxtbXpseG5ma3BwaHBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM0MzU5NiwiZXhwIjoyMDkzOTE5NTk2fQ.DAEt9KURVdwRbyR8S06UmoA0LUR95JgN_VrgHLkJ2kI
   RESEND_API_KEY=re_Pk4UBMsH_NEeT4xunsE1NtZi9VcKQ3HPM
   FROM_EMAIL=verify@astraventa.com
   META_APP_ID=859277567200360
   META_APP_SECRET=5b36703cd059edf0c890cf4332acd305
   META_REDIRECT_URI=https://your-vercel-domain.vercel.app/api/auth/callback
   ```

6. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy
   - You'll get a URL like `https://fb-sniper-backend.onrender.com`

7. **Update Frontend Environment Variable**
   - Go back to Vercel project settings
   - Update `NEXT_PUBLIC_API_URL` to your Render backend URL
   - Redeploy frontend

---

## Part 3: Facebook OAuth Domain Setup

### Who Can Connect Facebook?

**Each user connects their own Facebook account.** Your app acts as the intermediary. Users authorize YOUR Facebook App to access their pages/groups.

### Required Facebook Developer Settings

1. **Go to Facebook Developer Portal**
   - [developers.facebook.com](https://developers.facebook.com)
   - Select your app (App ID: 859277567200360)

2. **Add Valid OAuth Redirect URIs**
   
   In App Settings → Basic → Facebook Login → Settings:
   
   Add these redirect URIs:
   ```
   https://your-vercel-domain.vercel.app/api/auth/callback
   https://localhost:3000/api/auth/callback  (for local development)
   ```

3. **Add App Domains**
   
   In the same section, add:
   ```
   your-vercel-domain.vercel.app
   localhost  (for local development)
   ```

4. **Configure App Permissions**
   
   Your app needs these permissions for Facebook automation:
   - `pages_read_engagement` - Read page posts and comments
   - `pages_manage_posts` - Post as page
   - `pages_manage_engagement` - Manage page engagement
   - `groups_access_member_info` - Access group information
   - `publish_to_groups` - Post to groups (requires special review)
   
   **Note**: Some permissions require App Review. For development, you can use Test Mode.

5. **Enable Test Mode (for development)**
   - In App Review → Testing, add your test users
   - Test users can use the app without full approval

6. **For Production**
   - Submit your app for App Review
   - Provide screencast showing how your app uses each permission
   - Facebook will review and approve (can take 1-2 weeks)
   - Business verification may be required for certain permissions

### How OAuth Flow Works

1. User clicks "Connect Facebook" in your app
2. User is redirected to Facebook's OAuth dialog
3. User authorizes your app
4. Facebook redirects back to your `META_REDIRECT_URI` with a short-lived token
5. Your backend exchanges this for a long-lived token
6. Token is stored in Supabase for that user
7. Your app uses this token to make API calls on behalf of the user

---

## Part 4: Environment Variables Summary

### Frontend (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=https://rqpslulmmzlxnfkpphpg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
META_APP_ID=859277567200360
META_APP_SECRET=5b36703cd059edf0c890cf4332acd305
```

### Backend (Render)
```
SUPABASE_URL=https://rqpslulmmzlxnfkpphpg.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
RESEND_API_KEY=re_Pk4UBMsH_NEeT4xunsE1NtZi9VcKQ3HPM
FROM_EMAIL=verify@astraventa.com
META_APP_ID=859277567200360
META_APP_SECRET=5b36703cd059edf0c890cf4332acd305
META_REDIRECT_URI=https://your-vercel-domain.vercel.app/api/auth/callback
```

---

## Part 5: Common Issues & Solutions

### Issue: CORS errors between frontend and backend
**Solution**: Ensure your backend CORS settings include your Vercel domain. In `backend/app/main.py`:
```python
origins = [
    "https://your-vercel-domain.vercel.app",
    "http://localhost:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Issue: Facebook OAuth redirect fails
**Solution**: 
- Verify `META_REDIRECT_URI` matches exactly in Facebook Developer settings
- Ensure the URI is HTTPS in production
- Check that the redirect URI is added to "Valid OAuth Redirect URIs"

### Issue: Backend worker not running on Render
**Solution**: 
- Render free tier spins down after inactivity
- Consider using Render's paid tier for persistent background workers
- Or use a cron job service to trigger periodic tasks

### Issue: Supabase RLS policies blocking requests
**Solution**: 
- Ensure RLS policies are properly configured
- Use service key for backend operations
- Use anon key for frontend operations

---

## Part 6: Deployment Checklist

- [ ] Frontend deployed to Vercel
- [ ] Backend deployed to Render
- [ ] All environment variables configured in Vercel
- [ ] All environment variables configured in Render
- [ ] `NEXT_PUBLIC_API_URL` updated to Render backend URL
- [ ] Facebook OAuth redirect URI added to Facebook App
- [ ] Facebook App Domains configured
- [ ] CORS settings updated in backend
- [ ] Test Facebook connection flow
- [ ] Test email OTP flow
- [ ] Test dashboard functionality

---

## Support

For issues:
- Frontend: Check Vercel deployment logs
- Backend: Check Render deployment logs
- Facebook: Check Facebook Developer Dashboard
- Database: Check Supabase logs in dashboard
