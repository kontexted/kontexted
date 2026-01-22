FROM oven/bun:1.3.6-alpine
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/kontexted-db ./packages/kontexted-db
COPY apps/collab ./apps/collab
COPY apps/webapp ./apps/webapp

RUN bun install --frozen-lockfile --production --filter ./apps/collab --filter ./packages/kontexted-db

ENV NODE_ENV=production
EXPOSE 8787

CMD ["sh", "-c", "cd /app/apps/collab && bun run src/server.ts"]
