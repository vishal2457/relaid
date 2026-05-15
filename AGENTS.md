# Agents

## Dev commands

```sh
pnpm dev              # All apps except local (turbo dev --filter=!local)
pnpm run dev --filter=local-web  # React dashboard only
pnpm dev --filter=mobile        # Expo dev server
pnpm dev --filter=go            # Wails dev (go app)
pnpm build:apk                  # Build mobile APK
pnpm lint
pnpm check-types
pnpm format
```

## App overview

- `apps/local-web` — React+Vite dashboard for Maximus (port 3004)
- `apps/relay` — Express/Socket.io relay server connecting mobile to local
- `apps/mobile` — Expo React Native app
- `apps/go` — Wails desktop app (Go + React)
- `packages/ui` — Shared React component library

- Build artifacts include `.next/`, `dist/`, `apps/go/frontend/dist/`.
