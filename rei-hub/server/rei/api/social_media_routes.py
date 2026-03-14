"""Social Media OAuth & Publishing Routes — Facebook, LinkedIn, X, Instagram."""

from __future__ import annotations

import json
import hashlib
import secrets
import logging
from urllib.parse import urlencode

import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import User
from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)
settings = get_settings()

social_media_router = APIRouter(prefix="/social", tags=["social-media"])

# ── Helpers ──────────────────────────────────────────────────────

async def _resolve_cred(field: str, provider: str, db=None) -> str:
    """Resolve credential from env config or SuperAdmin credentials DB."""
    val = getattr(settings, field, "")
    if val:
        logger.debug("Resolved %s from env settings", field)
        return val
    if db:
        creds = await get_provider_credentials(db, provider)
        if creds:
            resolved = creds.get(field, "")
            if resolved:
                logger.debug("Resolved %s from DB provider %s (len=%d)", field, provider, len(resolved))
            else:
                logger.warning("Field %s not found in DB provider %s. Available keys: %s", field, provider, list(creds.keys()))
            return resolved
    logger.warning("Could not resolve credential %s from env or DB", field)
    return ""


# ── Pydantic Schemas ─────────────────────────────────────────────

class PublishBody(BaseModel):
    content: str
    image_url: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════
# FACEBOOK
# ═══════════════════════════════════════════════════════════════════

@social_media_router.get("/facebook/auth-url")
async def facebook_auth_url(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the Facebook OAuth URL.

    NOTE: The Facebook app must be "Business" type to request Pages
    permissions (pages_manage_posts, pages_read_engagement).  If the
    app is Consumer type, fall back to basic scopes so OAuth at least
    completes without an "Invalid Scopes" error.  Full Pages posting
    requires creating a Business-type Facebook app.
    """
    app_id = await _resolve_cred("facebook_app_id", "facebook_oauth", db)
    redirect_uri = await _resolve_cred("facebook_redirect_uri", "facebook_oauth", db)
    if not app_id or not redirect_uri:
        raise HTTPException(status_code=503, detail="Facebook OAuth not configured. Ask your admin to add Facebook credentials in SuperAdmin Settings.")

    # Business-type app (ID 957976573829623) — request Pages permissions
    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "scope": "pages_manage_posts,pages_read_engagement",
        "response_type": "code",
        "state": str(user.id),
    }
    url = "https://www.facebook.com/v19.0/dialog/oauth?" + urlencode(params)
    return {"auth_url": url}


@social_media_router.post("/facebook/callback")
async def facebook_callback(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange Facebook auth code for a long-lived Page Access Token."""
    code = payload.get("code", "")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    app_id = await _resolve_cred("facebook_app_id", "facebook_oauth", db)
    app_secret = await _resolve_cred("facebook_app_secret", "facebook_oauth", db)
    redirect_uri = await _resolve_cred("facebook_redirect_uri", "facebook_oauth", db)

    async with aiohttp.ClientSession() as session:
        # Step 1: Exchange code for short-lived user token
        async with session.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            params={
                "client_id": app_id,
                "redirect_uri": redirect_uri,
                "client_secret": app_secret,
                "code": code,
            },
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise HTTPException(status_code=400, detail=f"Facebook token exchange failed: {body}")
            data = await resp.json()
            short_token = data["access_token"]

        # Step 2: Exchange for long-lived user token (60 days)
        async with session.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "fb_exchange_token": short_token,
            },
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                logger.warning("Facebook long-lived token exchange failed: %s", body)
                long_token = short_token  # fallback to short-lived
            else:
                data = await resp.json()
                long_token = data["access_token"]

        # Step 3: Get user's pages
        async with session.get(
            "https://graph.facebook.com/v19.0/me/accounts",
            params={"access_token": long_token},
        ) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch Facebook Pages")
            pages_data = await resp.json()
            pages = pages_data.get("data", [])

    if not pages:
        raise HTTPException(status_code=400, detail="No Facebook Pages found. You need to be an admin of at least one Facebook Page.")

    # Use the first page (most users have one business page)
    page = pages[0]
    user.facebook_page_token = json.dumps({
        "page_id": page["id"],
        "page_name": page["name"],
        "access_token": page["access_token"],  # this is already a long-lived page token
    })
    user.facebook_connected = True
    await db.commit()
    return {"status": "connected", "page_name": page["name"]}


@social_media_router.get("/facebook/status")
async def facebook_status(user: User = Depends(get_current_user)):
    if not user.facebook_connected or not user.facebook_page_token:
        return {"connected": False}
    data = json.loads(user.facebook_page_token)
    return {"connected": True, "account_name": data.get("page_name", "Facebook Page")}


@social_media_router.post("/facebook/disconnect")
async def facebook_disconnect(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.facebook_page_token = None
    user.facebook_connected = False
    await db.commit()
    return {"status": "disconnected"}


@social_media_router.post("/facebook/publish")
async def facebook_publish(
    body: PublishBody,
    user: User = Depends(get_current_user),
):
    """Publish a post to the user's connected Facebook Page."""
    if not user.facebook_connected or not user.facebook_page_token:
        raise HTTPException(status_code=400, detail="Facebook not connected. Connect in Settings first.")

    page_data = json.loads(user.facebook_page_token)
    page_id = page_data["page_id"]
    access_token = page_data["access_token"]

    post_data = {"message": body.content, "access_token": access_token}
    if body.image_url:
        endpoint = f"https://graph.facebook.com/v19.0/{page_id}/photos"
        post_data["url"] = body.image_url
    else:
        endpoint = f"https://graph.facebook.com/v19.0/{page_id}/feed"

    async with aiohttp.ClientSession() as session:
        async with session.post(endpoint, data=post_data) as resp:
            if resp.status in (200, 201):
                result = await resp.json()
                return {"status": "published", "post_id": result.get("id", "")}
            else:
                body_text = await resp.text()
                logger.warning("Facebook publish failed: %s", body_text)
                raise HTTPException(status_code=400, detail="Facebook publish failed. Your token may have expired — try reconnecting in Settings.")


# ═══════════════════════════════════════════════════════════════════
# LINKEDIN
# ═══════════════════════════════════════════════════════════════════

@social_media_router.get("/linkedin/auth-url")
async def linkedin_auth_url(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_id = await _resolve_cred("linkedin_client_id", "linkedin_oauth", db)
    redirect_uri = await _resolve_cred("linkedin_redirect_uri", "linkedin_oauth", db)
    if not client_id or not redirect_uri:
        raise HTTPException(status_code=503, detail="LinkedIn OAuth not configured. Ask your admin to add LinkedIn credentials in SuperAdmin Settings.")

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "openid profile w_member_social",
        "state": str(user.id),
    }
    url = "https://www.linkedin.com/oauth/v2/authorization?" + urlencode(params)
    return {"auth_url": url}


@social_media_router.post("/linkedin/callback")
async def linkedin_callback(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    code = payload.get("code", "")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    client_id = await _resolve_cred("linkedin_client_id", "linkedin_oauth", db)
    client_secret = await _resolve_cred("linkedin_client_secret", "linkedin_oauth", db)
    redirect_uri = await _resolve_cred("linkedin_redirect_uri", "linkedin_oauth", db)

    if not client_id or not client_secret or not redirect_uri:
        logger.error("LinkedIn callback missing creds: client_id=%s, secret=%s, redirect=%s",
                      bool(client_id), bool(client_secret), bool(redirect_uri))
        raise HTTPException(status_code=503, detail="LinkedIn OAuth credentials incomplete. Check SuperAdmin Settings.")

    logger.info("LinkedIn token exchange: client_id=%s..., redirect_uri=%s", client_id[:8], redirect_uri)

    async with aiohttp.ClientSession() as session:
        # Exchange code for token
        async with session.post(
            "https://www.linkedin.com/oauth/v2/accessToken",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                logger.error("LinkedIn token exchange failed (HTTP %d): %s", resp.status, body[:500])
                raise HTTPException(status_code=400, detail=f"LinkedIn token exchange failed: {body}")
            tokens = await resp.json()

        access_token = tokens["access_token"]
        expires_in = tokens.get("expires_in", 5184000)  # default 60 days

        # Get user profile info (sub = member URN)
        async with session.get(
            "https://api.linkedin.com/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        ) as resp:
            if resp.status == 200:
                profile = await resp.json()
                member_name = profile.get("name", "LinkedIn User")
                member_sub = profile.get("sub", "")
            else:
                member_name = "LinkedIn User"
                member_sub = ""

    from datetime import datetime, timedelta
    user.linkedin_token = json.dumps({
        "access_token": access_token,
        "expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
        "member_sub": member_sub,
        "member_name": member_name,
    })
    user.linkedin_connected = True
    await db.commit()
    return {"status": "connected", "account_name": member_name}


@social_media_router.get("/linkedin/status")
async def linkedin_status(user: User = Depends(get_current_user)):
    if not user.linkedin_connected or not user.linkedin_token:
        return {"connected": False}
    data = json.loads(user.linkedin_token)
    return {"connected": True, "account_name": data.get("member_name", "LinkedIn")}


@social_media_router.post("/linkedin/disconnect")
async def linkedin_disconnect(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.linkedin_token = None
    user.linkedin_connected = False
    await db.commit()
    return {"status": "disconnected"}


@social_media_router.post("/linkedin/publish")
async def linkedin_publish(
    body: PublishBody,
    user: User = Depends(get_current_user),
):
    if not user.linkedin_connected or not user.linkedin_token:
        raise HTTPException(status_code=400, detail="LinkedIn not connected. Connect in Settings first.")

    token_data = json.loads(user.linkedin_token)
    access_token = token_data["access_token"]
    member_sub = token_data.get("member_sub", "")

    # LinkedIn Posts API (v2)
    post_body = {
        "author": f"urn:li:person:{member_sub}",
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": body.content},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.linkedin.com/v2/ugcPosts",
            json=post_body,
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-Restli-Protocol-Version": "2.0.0",
            },
        ) as resp:
            if resp.status in (200, 201):
                result = await resp.json()
                return {"status": "published", "post_id": result.get("id", "")}
            else:
                body_text = await resp.text()
                logger.warning("LinkedIn publish failed: %s", body_text)
                raise HTTPException(status_code=400, detail="LinkedIn publish failed. Your token may have expired — try reconnecting in Settings.")


# ═══════════════════════════════════════════════════════════════════
# X (TWITTER)
# ═══════════════════════════════════════════════════════════════════

# PKCE helper
def _generate_pkce():
    code_verifier = secrets.token_urlsafe(64)[:128]
    code_challenge = hashlib.sha256(code_verifier.encode()).digest()
    import base64
    code_challenge_b64 = base64.urlsafe_b64encode(code_challenge).rstrip(b"=").decode()
    return code_verifier, code_challenge_b64


# Store PKCE verifiers in memory (per user_id). In production, use Redis.
_pkce_store: dict[int, str] = {}


@social_media_router.get("/x/auth-url")
async def x_auth_url(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_id = await _resolve_cred("x_twitter_client_id", "x_twitter_oauth", db)
    redirect_uri = await _resolve_cred("x_twitter_redirect_uri", "x_twitter_oauth", db)
    if not client_id or not redirect_uri:
        raise HTTPException(status_code=503, detail="X (Twitter) OAuth not configured. Ask your admin to add X credentials in SuperAdmin Settings.")

    code_verifier, code_challenge = _generate_pkce()
    _pkce_store[user.id] = code_verifier

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "tweet.read tweet.write users.read offline.access",
        "state": str(user.id),
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    url = "https://twitter.com/i/oauth2/authorize?" + urlencode(params)
    return {"auth_url": url}


@social_media_router.post("/x/callback")
async def x_callback(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    code = payload.get("code", "")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    client_id = await _resolve_cred("x_twitter_client_id", "x_twitter_oauth", db)
    client_secret = await _resolve_cred("x_twitter_client_secret", "x_twitter_oauth", db)
    redirect_uri = await _resolve_cred("x_twitter_redirect_uri", "x_twitter_oauth", db)

    if not client_id or not client_secret or not redirect_uri:
        logger.error("X callback missing creds: client_id=%s, secret=%s, redirect=%s",
                      bool(client_id), bool(client_secret), bool(redirect_uri))
        raise HTTPException(status_code=503, detail="X (Twitter) OAuth credentials incomplete. Check SuperAdmin Settings.")

    code_verifier = _pkce_store.pop(user.id, "")
    if not code_verifier:
        logger.error("X PKCE verifier not found for user %d. Store has %d entries.", user.id, len(_pkce_store))
        raise HTTPException(status_code=400, detail="PKCE session expired. Please try connecting again.")

    import base64
    basic_auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

    logger.info("X token exchange: client_id=%s..., redirect_uri=%s, has_verifier=%s",
                client_id[:8], redirect_uri, bool(code_verifier))

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.x.com/2/oauth2/token",
            data={
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {basic_auth}",
            },
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                logger.error("X token exchange failed (HTTP %d): %s", resp.status, body[:500])
                raise HTTPException(status_code=400, detail=f"X token exchange failed: {body}")
            tokens = await resp.json()

        access_token = tokens["access_token"]
        refresh_token = tokens.get("refresh_token", "")

        # Get username
        async with session.get(
            "https://api.x.com/2/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
        ) as resp:
            if resp.status == 200:
                user_data = await resp.json()
                x_data = user_data.get("data", {})
                username = x_data.get("username", "")
                x_user_id = x_data.get("id", "")
            else:
                username = ""
                x_user_id = ""

    user.x_twitter_token = json.dumps({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "username": username,
        "user_id": x_user_id,
    })
    user.x_twitter_connected = True
    await db.commit()
    return {"status": "connected", "account_name": f"@{username}" if username else "X Account"}


@social_media_router.get("/x/status")
async def x_status(user: User = Depends(get_current_user)):
    if not user.x_twitter_connected or not user.x_twitter_token:
        return {"connected": False}
    data = json.loads(user.x_twitter_token)
    username = data.get("username", "")
    return {"connected": True, "account_name": f"@{username}" if username else "X Account"}


@social_media_router.post("/x/disconnect")
async def x_disconnect(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.x_twitter_token = None
    user.x_twitter_connected = False
    await db.commit()
    return {"status": "disconnected"}


@social_media_router.post("/x/publish")
async def x_publish(
    body: PublishBody,
    user: User = Depends(get_current_user),
):
    if not user.x_twitter_connected or not user.x_twitter_token:
        raise HTTPException(status_code=400, detail="X not connected. Connect in Settings first.")

    token_data = json.loads(user.x_twitter_token)
    access_token = token_data["access_token"]

    # X API v2 — create tweet (max 280 chars)
    tweet_text = body.content[:280]

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.x.com/2/tweets",
            json={"text": tweet_text},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        ) as resp:
            if resp.status in (200, 201):
                result = await resp.json()
                tweet_id = result.get("data", {}).get("id", "")
                return {"status": "published", "post_id": tweet_id}
            else:
                body_text = await resp.text()
                logger.warning("X publish failed: %s", body_text)
                raise HTTPException(status_code=400, detail="X publish failed. Your token may have expired — try reconnecting in Settings.")


# ═══════════════════════════════════════════════════════════════════
# INSTAGRAM
# ═══════════════════════════════════════════════════════════════════

@social_media_router.get("/instagram/auth-url")
async def instagram_auth_url(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Instagram uses the same Facebook OAuth — redirect to Facebook with instagram permissions.

    NOTE: Instagram permissions (instagram_basic, instagram_content_publish) and
    Pages permissions require a Business-type Facebook app.  With a Consumer
    app, we fall back to basic scopes.
    """
    app_id = await _resolve_cred("facebook_app_id", "facebook_oauth", db)
    redirect_uri = await _resolve_cred("facebook_redirect_uri", "facebook_oauth", db)
    if not app_id or not redirect_uri:
        raise HTTPException(status_code=503, detail="Instagram/Facebook OAuth not configured. Ask your admin to add Facebook credentials in SuperAdmin Settings.")

    # Business-type app (ID 957976573829623) — request Instagram permissions
    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "scope": "pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
        "response_type": "code",
        "state": f"instagram_{user.id}",
    }
    url = "https://www.facebook.com/v19.0/dialog/oauth?" + urlencode(params)
    return {"auth_url": url}


@social_media_router.post("/instagram/callback")
async def instagram_callback(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange Facebook code for tokens, then find the linked Instagram Business account."""
    code = payload.get("code", "")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    app_id = await _resolve_cred("facebook_app_id", "facebook_oauth", db)
    app_secret = await _resolve_cred("facebook_app_secret", "facebook_oauth", db)
    redirect_uri = await _resolve_cred("facebook_redirect_uri", "facebook_oauth", db)

    async with aiohttp.ClientSession() as session:
        # Step 1: Exchange code for user token
        async with session.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            params={
                "client_id": app_id,
                "redirect_uri": redirect_uri,
                "client_secret": app_secret,
                "code": code,
            },
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise HTTPException(status_code=400, detail=f"Facebook/Instagram token exchange failed: {body}")
            data = await resp.json()
            user_token = data["access_token"]

        # Step 2: Get pages and find Instagram Business Account
        async with session.get(
            "https://graph.facebook.com/v19.0/me/accounts",
            params={
                "access_token": user_token,
                "fields": "id,name,access_token,instagram_business_account",
            },
        ) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch Facebook Pages for Instagram")
            pages_data = await resp.json()
            pages = pages_data.get("data", [])

    # Find a page with an Instagram Business Account linked
    ig_account = None
    page_token = None
    for page in pages:
        ig_biz = page.get("instagram_business_account")
        if ig_biz:
            ig_account = ig_biz
            page_token = page["access_token"]
            break

    if not ig_account or not page_token:
        raise HTTPException(
            status_code=400,
            detail="No Instagram Business account found. Make sure your Instagram is a Business account and linked to a Facebook Page.",
        )

    ig_user_id = ig_account["id"]

    # Get IG username
    ig_username = ""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"https://graph.facebook.com/v19.0/{ig_user_id}",
            params={"fields": "username", "access_token": page_token},
        ) as resp:
            if resp.status == 200:
                ig_data = await resp.json()
                ig_username = ig_data.get("username", "")

    user.instagram_token = json.dumps({
        "ig_user_id": ig_user_id,
        "page_access_token": page_token,
        "ig_username": ig_username,
    })
    user.instagram_connected = True
    await db.commit()
    return {"status": "connected", "account_name": f"@{ig_username}" if ig_username else "Instagram"}


@social_media_router.get("/instagram/status")
async def instagram_status(user: User = Depends(get_current_user)):
    if not user.instagram_connected or not user.instagram_token:
        return {"connected": False}
    data = json.loads(user.instagram_token)
    username = data.get("ig_username", "")
    return {"connected": True, "account_name": f"@{username}" if username else "Instagram"}


@social_media_router.post("/instagram/disconnect")
async def instagram_disconnect(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.instagram_token = None
    user.instagram_connected = False
    await db.commit()
    return {"status": "disconnected"}


@social_media_router.post("/instagram/publish")
async def instagram_publish(
    body: PublishBody,
    user: User = Depends(get_current_user),
):
    """Publish to Instagram. Requires an image_url (Instagram doesn't support text-only posts)."""
    if not user.instagram_connected or not user.instagram_token:
        raise HTTPException(status_code=400, detail="Instagram not connected. Connect in Settings first.")

    if not body.image_url:
        raise HTTPException(status_code=400, detail="Instagram requires an image. Provide an image_url.")

    token_data = json.loads(user.instagram_token)
    ig_user_id = token_data["ig_user_id"]
    page_token = token_data["page_access_token"]

    async with aiohttp.ClientSession() as session:
        # Step 1: Create media container
        async with session.post(
            f"https://graph.facebook.com/v19.0/{ig_user_id}/media",
            data={
                "image_url": body.image_url,
                "caption": body.content,
                "access_token": page_token,
            },
        ) as resp:
            if resp.status != 200:
                body_text = await resp.text()
                logger.warning("Instagram container creation failed: %s", body_text)
                raise HTTPException(status_code=400, detail="Instagram publish failed at media creation step.")
            container = await resp.json()
            creation_id = container.get("id")

        if not creation_id:
            raise HTTPException(status_code=400, detail="Instagram did not return a media container ID.")

        # Step 2: Publish the container
        async with session.post(
            f"https://graph.facebook.com/v19.0/{ig_user_id}/media_publish",
            data={
                "creation_id": creation_id,
                "access_token": page_token,
            },
        ) as resp:
            if resp.status == 200:
                result = await resp.json()
                return {"status": "published", "post_id": result.get("id", "")}
            else:
                body_text = await resp.text()
                logger.warning("Instagram publish failed: %s", body_text)
                raise HTTPException(status_code=400, detail="Instagram publish failed. Try reconnecting in Settings.")
