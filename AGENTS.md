# Agents

## Dev commands

```sh
pnpm dev              # All apps except local (turbo dev --filter=!local)
pnpm run dev --filter=local     # Maximux Discord bot only
pnpm run dev --filter=local-web  # React dashboard only
pnpm dev --filter=mobile        # Expo dev server
pnpm dev --filter=go            # Wails dev (go app)
pnpm build:apk                  # Build mobile APK
pnpm lint
pnpm check-types
pnpm format
```

## App overview

- `apps/local` — Maximus Discord bot (Node 22+, tsx/esbuild-register dev, pm2 managed)
- `apps/local-web` — React+Vite dashboard for Maximus (port 3004)
- `apps/relay` — Express/Socket.io relay server connecting mobile to local
- `apps/mobile` — Expo React Native app
- `apps/go` — Wails desktop app (Go + React)
- `packages/ui` — Shared React component library

## Important quirks

- `pnpm dev` intentionally excludes `local` (filter=!local). The `local` app must be run separately.
- Node 22 required (see `.nvmrc`).
- `apps/local` uses SQLite via Drizzle. DB path defaults to `~/maximus-bot-data/maximus.db` unless `DB_PATH` env is set. Migrations: `pnpm db:generate`, `pnpm db:push`.
- `apps/local` has no test script despite `vitest` being a dep.
- `apps/local` has a `web:build` step that builds `web-src/` before pm2 deployment.
- PM2 ecosystem (`ecosystem.config.js`) manages 4 processes: relay, local, local-web, mobile.
- Build artifacts include `.next/`, `dist/`, `apps/go/frontend/dist/`.
