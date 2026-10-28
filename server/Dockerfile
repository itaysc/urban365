# Multi-stage build: compile with devDependencies, ship only the runtime deps.
FROM node:22 AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma/
COPY src ./src/

# `prisma generate` must run before the build: the compiled code imports the client.
RUN npm ci --include=dev \
 && npx prisma generate \
 && npm run build

FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production

# openssl is required by Prisma's query engine on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma/
COPY --from=builder /app/dist ./dist

RUN npm ci --omit=dev

# Reinstalling wiped the generated client, so bring it over from the builder rather
# than running generate again (the CLI is a devDependency and is not installed here).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 5555

CMD ["node", "dist/main.js"]
