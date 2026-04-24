# Relay VPS Deployment

The `Deploy Relay to Docker Hub` GitHub Actions workflow builds only `apps/relay`, pushes the image to Docker Hub, then SSHes into the VPS to pull the image and restart the Docker Compose service.

## Required GitHub Secrets

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_PORT` (optional, defaults to `22`)
- `RELAY_DEPLOY_PATH` (example: `/opt/relaid/relay`)
- `RELAY_PUBLIC_BASE_URL`
- `ENCRYPTION_KEY` (64-character hex string)

## Optional GitHub OAuth Secrets

- `RELAY_GITHUB_CLIENT_ID`
- `RELAY_GITHUB_CLIENT_SECRET`
- `RELAY_GITHUB_REDIRECT_URI`

## Optional GitHub Variables

- `DOCKERHUB_REPOSITORY` (defaults to `<DOCKERHUB_USERNAME>/relaid-relay`)
- `RELAY_PORT` (defaults to `3001`)
- `RELAY_CORS_ORIGIN` (defaults to `*`)
- `RELAY_LOG_LEVEL` (defaults to `info`)
- `RELAY_PAIRING_SESSION_TTL_MS` (defaults to `300000`)
- `RELAY_SOCKET_REQUEST_TIMEOUT_MS` (defaults to `30000`)
- `APP_DEEP_LINK_SCHEME` (defaults to `relaid`)

## VPS Requirements

Install Docker with the Compose plugin on the VPS. The workflow uploads this compose file into `RELAY_DEPLOY_PATH`, writes the runtime `.env`, runs `docker login`, `docker compose pull relay`, and `docker compose up -d relay`.
