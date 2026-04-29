FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/relay/package.json apps/relay/package.json

RUN pnpm install --filter relay... --frozen-lockfile

COPY apps/relay apps/relay

RUN pnpm --filter relay build

FROM node:22-alpine AS landing

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/landing-relaid/package.json apps/landing-relaid/package.json

RUN pnpm install --filter landing-relaid... --frozen-lockfile

COPY apps/landing-relaid apps/landing-relaid

RUN pnpm --filter landing-relaid build

FROM node:22-alpine AS runtime

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/relay/package.json apps/relay/package.json

RUN pnpm install --filter relay --prod --frozen-lockfile --ignore-scripts

COPY --from=build /workspace/apps/relay/dist apps/relay/dist
COPY --from=build /workspace/apps/relay/drizzle apps/relay/drizzle
COPY --from=build /workspace/apps/relay/package.json apps/relay/package.json
COPY --from=landing /workspace/apps/landing-relaid/out apps/relay/public

RUN mkdir -p /logs && chown -R node:node /logs /workspace

USER node
WORKDIR /workspace/apps/relay

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV LOGS_DIR=/logs

VOLUME ["/logs"]
EXPOSE 3001

CMD ["node", "dist/start.js"]
