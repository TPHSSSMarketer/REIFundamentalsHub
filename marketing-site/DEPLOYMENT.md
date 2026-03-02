# Marketing Site Deployment

## Overview
Static HTML/CSS/JS site deployed to Cloudflare Pages.
No build step required.

## Deploy to Cloudflare Pages

1. Go to dash.cloudflare.com
2. Pages > Create application
3. Connect GitHub repo
4. Build settings:
   - **Project name:** rei-fundamentals-marketing
   - **Root directory:** marketing-site/
   - **Build command:** (leave empty)
   - **Output directory:** marketing-site/
5. Add custom domain: reifundamentalsHub.com

## DNS

Add a CNAME record for `reifundamentalsHub.com` pointing to your
Cloudflare Pages project (automatic if domain is on Cloudflare).

## No Build Step Needed

This is a pure HTML/CSS/JS site. Cloudflare Pages serves the files
directly from the `marketing-site/` directory.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main marketing landing page |
| `pricing.html` | Full pricing + feature comparison |
| `css/styles.css` | All styles |
| `js/main.js` | Mobile menu, smooth scroll, waitlist form |
| `_redirects` | Cloudflare Pages redirect rules |
| `_headers` | Security headers |
