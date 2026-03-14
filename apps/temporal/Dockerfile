# Build stage
# Expects build context: repository root (.), so shared and apps/temporal are available.
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Copy package files and config from apps/temporal
COPY apps/temporal/package.json ./
COPY apps/temporal/tsconfig.json ./
COPY apps/temporal/prisma.config.ts ./

# Copy shared prisma schema and prisma.config (tsconfig references ../shared/prisma.config.ts)
COPY apps/shared/prisma ./shared/prisma
COPY apps/shared/prisma.config.ts /shared/prisma.config.ts

# Copy workspace packages referenced as file: dependencies (file:../../packages/logging resolves to /packages/logging)
COPY packages/logging /packages/logging
RUN cd /packages/logging && npm install && npm run build

# Install dependencies (no lockfile — monorepo file: paths don't match Docker layout)
RUN npm install

# Generate Prisma client: patch schema to set output; url comes from prisma.config via DATABASE_URL.
# The shared generate-prisma.js expects monorepo layout; we use a direct generate.
RUN node -e "\
  const fs = require('fs'); \
  const p = './shared/prisma/schema.prisma'; \
  let s = fs.readFileSync(p, 'utf8'); \
  s = s.replace(/generator client \\{[^}]*\\}/s, 'generator client {\\n  provider = \"prisma-client-js\"\\n  output   = \"../../src/generated\"\\n}'); \
  fs.writeFileSync(p, s); \
"
# DATABASE_URL required for Prisma config load at generate; placeholder is fine (no connection during build)
ARG DATABASE_URL=postgresql://localhost:5432/dummy
ENV DATABASE_URL=${DATABASE_URL}
RUN npx prisma generate --schema=./shared/prisma/schema.prisma

# Copy source and build. Use a build tsconfig that only includes src (exclude prisma.config).
COPY apps/temporal/src ./src
RUN echo '{"extends":"./tsconfig.json","compilerOptions":{"rootDir":"./src"},"include":["src/**/*.ts"]}' > tsconfig.build.json && \
    npx tsc -p tsconfig.build.json

# Production stage
FROM node:24-bookworm-slim AS production

WORKDIR /app

# Create non-root user (align with backend)
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g 1001 nodeuser

# npm cache for OpenShift
RUN mkdir -p /.npm && \
    chgrp -R 0 /.npm && \
    chmod -R g=u /.npm

# Copy pre-built logging package from builder (avoids needing tsc in production stage)
COPY --from=builder /packages/logging /packages/logging

# Package files and production deps
COPY apps/temporal/package.json ./
RUN npm install --omit=dev --ignore-scripts && \
    npm cache clean --force

# Built output and generated Prisma client from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated

# Node resolves require('@generated/client') from node_modules; tsconfig paths are compile-time only.
RUN mkdir -p node_modules/@generated && cp -r src/generated node_modules/@generated/client

# Prisma schema for any runtime resolve
COPY --from=builder /app/shared/prisma ./shared/prisma

RUN chown -R nodeuser:nodejs /app
USER nodeuser

ENV NODE_ENV=production

CMD ["node", "dist/worker.js"]
