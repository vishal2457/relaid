# Relay VPS Deployment

The GitHub Actions workflow deploys the relay container to a VPS with Docker Compose.

## Required GitHub Secrets

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_PORT` (optional, defaults to `22`)
- `RELAY_DEPLOY_PATH` (example: `/opt/relaid/relay`)
- `GHCR_USERNAME`
- `GHCR_TOKEN` (must have `read:packages` on the VPS side)
- `RELAY_PUBLIC_BASE_URL`
- `RELAY_CORS_ORIGIN` (optional, defaults to `*`)
- `RELAY_PORT` (optional, defaults to `3001`)
- `RELAY_LOG_LEVEL` (optional, defaults to `info`)
- `RELAY_PAIRING_SESSION_TTL_MS` (optional, defaults to `300000`)
- `RELAY_SOCKET_REQUEST_TIMEOUT_MS` (optional, defaults to `30000`)

## Optional Android Signing Secrets

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

If the Android signing secrets are not set, the workflow still produces a release APK signed with the debug keystore. That is fine for internal testing, but not for store distribution.
