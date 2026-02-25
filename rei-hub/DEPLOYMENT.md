# REI Hub Deployment Guide

## Architecture
- **Frontend:** Cloudflare Pages — hub.reifundamentalsHub.com
- **Backend:** Railway — api.reifundamentalsHub.com
- **Database:** Railway PostgreSQL (managed, automatic backups)

## First-Time Setup

### Step 1: Railway (Backend)
1. Go to railway.app
2. Create new project
3. Connect GitHub repo
4. Select `rei-hub/server` as root
5. Add PostgreSQL plugin
6. Set environment variables (copy from `.env.production.example`)
7. Add custom domain: `api.reifundamentalsHub.com`

### Step 2: Cloudflare Pages (Frontend)
1. Go to dash.cloudflare.com
2. Pages → Create application
3. Connect GitHub repo
4. Build settings:
   - Root: `rei-hub`
   - Build command: `npm run build`
   - Output directory: `dist`
5. Environment variables:
   - `VITE_REI_SERVER_URL=https://api.reifundamentalsHub.com`
   - `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
6. Add custom domain: `hub.reifundamentalsHub.com`

### Step 3: DNS (Cloudflare)
Add these DNS records:
- `api` → Railway provided URL (CNAME)
- `hub` → Cloudflare Pages (automatic)

### Step 4: GitHub Secrets
Add these secrets to the GitHub repo:
- `RAILWAY_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_REI_SERVER_URL`
- `VITE_STRIPE_PUBLISHABLE_KEY`

### Step 5: First Deploy
Push to `master` branch. GitHub Actions will automatically:
1. Test backend
2. Deploy backend to Railway
3. Build frontend
4. Deploy frontend to Cloudflare

## Ongoing Deployments
Every push to `master` auto-deploys. No manual steps required.

## Monitoring
- Health check: https://api.reifundamentalsHub.com/health
- Railway dashboard: railway.app
- Cloudflare dashboard: dash.cloudflare.com
