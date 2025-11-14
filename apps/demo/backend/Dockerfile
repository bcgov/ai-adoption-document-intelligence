# Multi-stage build for NestJS backend
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY apps/demo/backend/package.json ./apps/demo/backend/

# Install dependencies
RUN npm ci --workspace=apps/demo/backend

# Copy Prisma schema
COPY apps/demo/backend/prisma ./apps/demo/backend/prisma

# Generate Prisma Client
RUN cd apps/demo/backend && npx prisma generate

# Build stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/demo/backend/node_modules ./apps/demo/backend/node_modules
COPY --from=deps /app/apps/demo/backend/prisma ./apps/demo/backend/prisma

# Copy source code
COPY apps/demo/backend ./apps/demo/backend
COPY tsconfig*.json ./
COPY nest-cli.json ./apps/demo/backend/

# Build the application
RUN cd apps/demo/backend && npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/apps/demo/backend/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/demo/backend/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/demo/backend/prisma ./prisma
COPY --from=deps --chown=nestjs:nodejs /app/apps/demo/backend/node_modules ./node_modules

# Generate Prisma Client in production image
RUN npx prisma generate

USER nestjs

EXPOSE 3000

ENV PORT=3000

# Start the application
CMD ["node", "dist/main.js"]

