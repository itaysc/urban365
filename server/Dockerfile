# Multi-stage build: compile with devDependencies, ship only the runtime deps.
FROM node:22 AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma/
COPY src ./src/

# A placeholder, and it is never connected to.
#
# Prisma 7 takes the connection string from `prisma.config.ts`, which resolves
# DATABASE_URL eagerly when the config loads — so `prisma generate` refuses to start
# without one even though generating a client reads the schema and touches no
# database. A build must not need a live database, and Railway rightly injects no
# service variables into the image build, so the build supplies its own. This ENV
# belongs to the builder stage, which is thrown away; the runtime stage below starts
# from a clean image and gets the real URL from Railway.
ENV DATABASE_URL="postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder"

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

# The three scripts that are production operations rather than development ones.
#
# PRODUCTION.md §4 and §7 tell whoever sets this up to run them here, and until now
# they were not in the image to run — the reference-data syncs and the bucket check
# all live in `scripts/` as plain .mjs, outside anything the build compiles. They read
# `.env` if there is one and fall back to `process.env`, which is how Railway supplies
# it, and they import nothing that `--omit=dev` removes.
#
# Named one by one on purpose. The rest of that directory is development tooling and
# the CBS source files it chews on, which have no business in a running image.
COPY scripts/sync-streets.mjs scripts/sync-boundaries.mjs scripts/init-storage.mjs ./scripts/

COPY --from=builder /app/dist ./dist

RUN npm ci --omit=dev

# Reinstalling wiped the generated client, so bring it over from the builder rather
# than running generate again (the CLI is a devDependency and is not installed here).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 5555

CMD ["node", "dist/main.js"]
