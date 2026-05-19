# Build context: repository root (.), so apps/ches-adapter is available.
FROM node:24-alpine AS builder

WORKDIR /app

COPY apps/ches-adapter/package.json ./
COPY apps/ches-adapter/tsconfig.json ./

RUN npm install --ignore-scripts

COPY apps/ches-adapter/src ./src

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
