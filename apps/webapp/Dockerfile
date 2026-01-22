FROM oven/bun:1.3.6-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/kontexted-db ./packages/kontexted-db
COPY apps/webapp ./apps/webapp
COPY apps/collab ./apps/collab

RUN bun install --frozen-lockfile --linker isolated \
  --filter ./apps/webapp \
  --filter ./packages/kontexted-db

WORKDIR /app/apps/webapp
RUN bun run build

FROM oven/bun:1.3.6-alpine
WORKDIR /app

RUN apk add --no-cache postgresql-client

COPY package.json bun.lock ./
COPY apps/webapp/package.json ./apps/webapp/
COPY apps/collab/package.json ./apps/collab/
COPY packages/kontexted-db/package.json ./packages/kontexted-db/

RUN bun install --production --frozen-lockfile --linker isolated \
  --filter ./apps/webapp \
  --filter ./packages/kontexted-db
RUN bun add -d drizzle-kit

COPY --from=builder /app/apps/webapp/.next ./apps/webapp/.next
COPY --from=builder /app/apps/webapp/public ./apps/webapp/public
COPY apps/webapp/docker-entrypoint.sh ./apps/webapp/
COPY apps/webapp/drizzle.config.ts ./apps/webapp/
COPY apps/webapp/src/db ./apps/webapp/src/db

RUN chmod +x ./apps/webapp/docker-entrypoint.sh

WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["./apps/webapp/docker-entrypoint.sh"]
