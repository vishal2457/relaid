FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/relay/package.json apps/relay/package.json

RUN pnpm install --filter relay... --frozen-lockfile

COPY apps/relay apps/relay

RUN pnpm --filter relay build

FROM node:22-alpine AS runtime

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/relay/package.json apps/relay/package.json

RUN pnpm install --filter relay --prod --frozen-lockfile --ignore-scripts

COPY --from=build /workspace/apps/relay/dist apps/relay/dist
COPY --from=build /workspace/apps/relay/package.json apps/relay/package.json

RUN mkdir -p /data /logs && chown -R node:node /data /logs /workspace

USER node
WORKDIR /workspace/apps/relay

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DB_PATH=/data/chat-server.db
ENV LOGS_DIR=/logs

VOLUME ["/data", "/logs"]
EXPOSE 3001

CMD ["node", "dist/index.js"]
