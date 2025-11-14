# Multi-stage build for React/Vite frontend
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY apps/demo/frontend/package.json ./apps/demo/frontend/

# Install dependencies
RUN npm ci --workspace=apps/demo/frontend

# Build stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/demo/frontend/node_modules ./apps/demo/frontend/node_modules

# Copy source code
COPY apps/demo/frontend ./apps/demo/frontend
COPY tsconfig.json ./

# Build arguments for environment variables (non-sensitive only)
ARG GITHUB_SHA
ARG VITE_BACKEND_URL
ARG VITE_SUPPORT_EMAIL
ARG VITE_ENV
ARG REACT_APP_URL

# Set build-time environment variables
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL
ENV VITE_ENV=$VITE_ENV
ENV REACT_APP_URL=$REACT_APP_URL

# Build the application
RUN cd apps/demo/frontend && npm run build

# Production stage with nginx
FROM nginx:alpine AS runner

# Copy built assets
COPY --from=builder /app/apps/demo/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /health { \
        access_log off; \
        return 200 "healthy\n"; \
        add_header Content-Type text/plain; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

