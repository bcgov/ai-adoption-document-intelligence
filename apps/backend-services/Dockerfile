# Build stage
# Expects build context: repository root (.), so apps/backend-services and apps/shared are available.
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files and config from apps/backend-services
COPY apps/backend-services/package.json ./
COPY apps/backend-services/nest-cli.json ./
COPY apps/backend-services/tsconfig*.json ./
COPY apps/backend-services/.swcrc ./

# Copy workspace packages referenced as file: dependencies (file:../../packages/* resolves to /packages/*)
COPY packages/logging /packages/logging
RUN cd /packages/logging && npm install --ignore-scripts && npm run build

COPY packages/graph-insertion-slots /packages/graph-insertion-slots
RUN cd /packages/graph-insertion-slots && npm install && npm run build

# Install dependencies (no lockfile — monorepo file: paths don't match Docker layout)
RUN npm install --ignore-scripts

# Copy source and shared Prisma schema
COPY apps/backend-services/src ./src
COPY apps/shared/prisma ./shared/prisma

# Generate Prisma client: patch schema to set output to src/generated, then generate.
RUN node -e "\
  const fs = require('fs'); \
  const p = './shared/prisma/schema.prisma'; \
  let s = fs.readFileSync(p, 'utf8'); \
  s = s.replace(/generator client \{[^}]*\}/s, 'generator client {\\n  provider = \"prisma-client-js\"\\n  output   = \"../../src/generated\"\\n}'); \
  fs.writeFileSync(p, s); \
"
# DATABASE_URL required for Prisma config load at generate; placeholder is fine (no connection during build)
ARG DATABASE_URL=postgresql://localhost:5432/dummy
ENV DATABASE_URL=${DATABASE_URL}
RUN npx prisma generate --schema=./shared/prisma/schema.prisma

# Build the application
RUN NODE_ENV=production npx nest build

# Production stage
FROM node:24-alpine AS production

WORKDIR /app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy pre-built workspace packages from builder (avoids needing tsc in production stage)
COPY --from=builder /packages/logging /packages/logging
COPY --from=builder /packages/graph-insertion-slots /packages/graph-insertion-slots

# Copy package files
COPY apps/backend-services/package.json ./

# openshift runs as a different user than what docker builds with
# this fixes the issue as related to the npm cache
# Create npm cache directory with proper permissions before npm install
RUN mkdir -p /.npm && \
    chgrp -R 0 /.npm && \
    chmod -R g=u /.npm

# Install only production dependencies (skip lifecycle scripts — logging already built)
RUN npm install --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy Prisma schema and migrations from builder stage (needed for migrations)
COPY --from=builder /app/shared/prisma ./shared/prisma

# Copy Prisma config so migrate deploy can resolve datasource (Prisma 7 requires datasource in config)
COPY apps/backend-services/prisma.config.ts ./
# Fix paths for container: in image cwd is /app, schema is at ./shared/prisma/
RUN node -e "const fs=require('fs'); let s=fs.readFileSync('prisma.config.ts','utf8'); s=s.replace(/\"\\.\\.\\/shared/g, '\"./shared'); fs.writeFileSync('prisma.config.ts', s);"

# Copy built application from builder stage (includes generated client in dist)
COPY --from=builder /app/dist ./dist

# Copy Prisma engines from builder (needed by migrate-db init container at runtime)
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Create storage directory and set permissions
RUN mkdir -p /app/storage/documents && \
    chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs
# Expose the port
EXPOSE 3002

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3002

# Start the application
CMD ["node", "dist/main"]

