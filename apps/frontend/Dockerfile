# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Build arguments for Vite (baked in at build time)
ARG VITE_BACKEND_URL=
ARG VITE_API_BASE_URL=
ARG VITE_SSO_AUTH_SERVER_URL=
ARG VITE_SSO_REALM=
ARG VITE_SSO_CLIENT_ID=
ARG VITE_APP_NAME=AI OCR Frontend
ARG VITE_APP_VERSION=1.0.0
ARG VITE_SUPPORT_EMAIL=
ARG VITE_ENV=

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL:-${VITE_BACKEND_URL}/api}
ENV VITE_SSO_AUTH_SERVER_URL=${VITE_SSO_AUTH_SERVER_URL}
ENV VITE_SSO_REALM=${VITE_SSO_REALM}
ENV VITE_SSO_CLIENT_ID=${VITE_SSO_CLIENT_ID}
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
ENV VITE_SUPPORT_EMAIL=${VITE_SUPPORT_EMAIL}
ENV VITE_ENV=${VITE_ENV}

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage: nginx to serve static files (non-root / OpenShift-safe)
FROM nginx:alpine

# Custom main config: writable paths under /tmp for non-root and read-only fs
COPY nginx.conf /etc/nginx/nginx.conf
COPY nginx-default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint.sh

# Create nginx temp/cache dirs (nginx does not create parent dirs); world-writable for OpenShift arbitrary UID.
# Make entrypoint and nginx config writable so the entrypoint can substitute env vars at startup.
RUN mkdir -p /tmp/nginx/client_temp /tmp/nginx/proxy_temp /tmp/nginx/fastcgi_temp \
    /tmp/nginx/uwsgi_temp /tmp/nginx/scgi_temp && chmod -R 777 /tmp/nginx \
    && chmod +x /docker-entrypoint.sh \
    && chmod 777 /etc/nginx/conf.d \
    && chmod 666 /etc/nginx/conf.d/default.conf

# Run as non-root so OpenShift's random UID or nginx user can write /tmp/nginx
USER nginx

EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
