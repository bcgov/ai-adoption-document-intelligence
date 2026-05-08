# Build context: repository root (.), so apps/alertmanager-webhook is available.
FROM node:24-alpine AS builder

WORKDIR /app

COPY apps/alertmanager-webhook/package.json ./
COPY apps/alertmanager-webhook/tsconfig.json ./

RUN npm install --ignore-scripts

COPY apps/alertmanager-webhook/src ./src

RUN npm run build

# ---- Runtime stage ----
FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist

RUN npm install --omit=dev --ignore-scripts

USER node

EXPOSE 3003

CMD ["node", "dist/index.js"]
