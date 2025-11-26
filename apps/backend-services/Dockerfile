# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm install

# Copy source code
COPY src ./src
COPY prisma ./prisma
# generates the prisma client
RUN npx prisma generate

# Build the application
RUN npm run build:prod

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./

# openshift runs as a different user than what docker builds with
# this fixes the issue as related to the npm cache
# Create npm cache directory with proper permissions before npm install
RUN mkdir -p /.npm && \
    chgrp -R 0 /.npm && \
    chmod -R g=u /.npm

# Install only production dependencies (but include prisma for migrations)
RUN npm install --omit=dev && \
    npm cache clean --force

# Copy Prisma schema and migrations from builder stage (needed for migrations)
COPY --from=builder /app/prisma/ ./prisma/

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy Prisma generated client
COPY --from=builder /app/src/generated ./dist/generated

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

