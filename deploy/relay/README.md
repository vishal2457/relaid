# Relay Docker Deployment

The `Deploy Relay to Docker Hub` GitHub Actions workflow builds only `apps/relay`, pushes the image to Docker Hub as `vishal2457/derived:relay-latest`, then SSHes into the VPS and restarts the `relay` service from `/srv/derived/derived-infra`.

## Required GitHub Secrets

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `VPS_HOST`
- `VPS_USERNAME`
- `VPS_PASSWORD`

## VPS Requirements

Install Docker with the Compose plugin on the VPS. The infra repo at `/srv/derived/derived-infra` owns Docker Compose, relay environment variables, volumes, and nginx routing for `relaid.derived.dev`.
