FROM node:22.11.0-alpine AS base

FROM base AS builder

WORKDIR /tmp/build

ARG VITE_API_BASE_URL
ARG VITE_APP_NAME
ARG VITE_APP_VERSION
ARG VITE_BACKEND_URL
ARG VITE_SUPPORT_EMAIL
ARG VITE_ENV
ARG VITE_SSO_AUTH_SERVER_URL
ARG VITE_SSO_REALM
ARG VITE_SSO_CLIENT_ID

# Copy root package.json and package-lock.json for workspace support
# Note: Build context should be monorepo root, not apps/frontend
COPY package.json package-lock.json* ./

# Copy packages directory for workspace dependencies
COPY packages ./packages

# Copy frontend package.json
COPY apps/frontend/package.json ./apps/frontend/

# Install dependencies (using workspace support)
# Skip lifecycle scripts (husky prepare) in Docker builds
RUN npm install --workspace=apps/frontend --ignore-scripts

# Copy source code and config files
COPY apps/frontend ./apps/frontend

# Set build-time environment variables
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL
ENV VITE_ENV=$VITE_ENV
ENV VITE_SSO_AUTH_SERVER_URL=$VITE_SSO_AUTH_SERVER_URL
ENV VITE_SSO_REALM=$VITE_SSO_REALM
ENV VITE_SSO_CLIENT_ID=$VITE_SSO_CLIENT_ID

# Build the application
RUN cd apps/frontend && npm run build

# Fix npm cache permissions for OpenShift
RUN mkdir /.npm
RUN chgrp -R 0 /.npm && chmod -R g=u /.npm

FROM nginx:alpine AS runner

# Pass through all environment variables
ARG VITE_BACKEND_URL
ARG VITE_SUPPORT_EMAIL
ARG VITE_ENV

ENV VITE_BACKEND_URL $VITE_BACKEND_URL
ENV VITE_SUPPORT_EMAIL $VITE_SUPPORT_EMAIL
ENV VITE_ENV $VITE_ENV

# Copy built files and nginx configuration
COPY --from=builder /tmp/build/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Set up permissions for OpenShift
RUN set -x \
    && sed -i -e 's/^\(nginx:[^:]\):[0-9]*:[0-9]*:/\1:1001:0:/' /etc/passwd \
    && mkdir -p /var/cache/nginx \
    && chgrp -R 0 /var/cache/nginx && chmod -R g=u /var/cache/nginx \
    && chgrp -R 0 /var/run/ && chmod -R g=u /var/run \
    && chgrp -R 0 /usr/share/nginx/html && chmod -R g=u /usr/share/nginx/html \
    && rm /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh /docker-entrypoint.d/30-tune-worker-processes.sh

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

