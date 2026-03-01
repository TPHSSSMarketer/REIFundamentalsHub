# HelmEcosystem — Security & Secrets Rotation Guide

## Secrets Inventory

| Secret | Env Variable | Rotation Frequency | How to Rotate |
|--------|-------------|-------------------|---------------|
| App secret key | `SECRET_KEY` | Every 90 days | Generate new 64-char random string, update .env, restart |
| JWT signing key | `JWT_SECRET_KEY` | Every 90 days | Generate new key, existing tokens expire naturally (4h TTL) |
| REI plugin secret | `REI_PLUGIN_SECRET` | Every 90 days | Update in both Helm Hub and REI Hub .env files simultaneously |
| API keys | `API_KEYS` | Every 90 days | Add new key to comma-separated list, remove old key after 24h |
| Stripe secret key | `STRIPE_SECRET_KEY` | On compromise only | Roll in Stripe Dashboard, update .env |
| Stripe webhook secret | `STRIPE_WEBHOOK_SECRET` | On compromise only | Create new endpoint in Stripe, update .env |
| PayPal credentials | `PAYPAL_CLIENT_ID/SECRET` | On compromise only | Regenerate in PayPal Developer Dashboard |
| Telegram bot token | `TELEGRAM_BOT_TOKEN` | On compromise only | Revoke via @BotFather, create new token |
| Telegram webhook secret | `TELEGRAM_WEBHOOK_SECRET` | Every 90 days | Generate new string, call setWebhook with new secret_token |
| WhatsApp access token | `WHATSAPP_ACCESS_TOKEN` | Per Meta policy | Refresh via Meta Business Suite |
| WhatsApp app secret | `WHATSAPP_APP_SECRET` | On compromise only | Reset in Meta App Dashboard |
| Anthropic API key | `ANTHROPIC_API_KEY` | Every 180 days | Rotate in Anthropic Console |
| OpenRouter API key | `OPENROUTER_API_KEY` | Every 180 days | Rotate in OpenRouter Dashboard |
| Database URL | `DATABASE_URL` | On compromise only | Change DB password, update connection string |
| Supabase keys | `SUPABASE_*` | On compromise only | Rotate in Supabase Dashboard |
| Admin password | `ADMIN_PASSWORD` | Every 90 days | Generate new bcrypt hash, update .env |

## How to Generate Secure Secrets

```bash
# Generate a 64-character random secret
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# Generate a bcrypt-hashed admin password
python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('your-password-here'))"
```

## Rotation Checklist

1. Generate the new secret value
2. Update the `.env` file on your deployment server
3. Restart the affected service (Helm Hub or REI Hub)
4. Verify the service starts without errors
5. Test authentication flows still work
6. If rotating API_KEYS: keep old key active for 24h (grace period for connected clients)
7. Document the rotation date in your ops log

## Incident Response

If you suspect a secret has been compromised:

1. Rotate the compromised secret immediately
2. Check server logs for unauthorized access during the exposure window
3. If JWT_SECRET_KEY was compromised: all existing sessions are invalidated on rotation
4. If API_KEYS were compromised: remove the compromised key immediately (no grace period)
5. If database credentials were compromised: rotate credentials AND audit recent DB operations

## Security Headers

The following security headers are set on all responses:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Content-Security-Policy: default-src 'self'; ...`
- `X-API-Version: 2026-03-01`
