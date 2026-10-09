# Multi-stage Dockerfile for server + web SPA
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests for dependency installation
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

# Install dependencies including devDependencies for build
RUN npm ci

# Copy sources and configurations
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
COPY web/tsconfig.json web/vite.config.ts web/index.html ./web/
COPY web/src ./web/src

# Compile both web static assets and server TypeScript
RUN npm -w web run build && npm -w server run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci --omit=dev

# Copy compiled JavaScript output, web SPA static bundle, and DB migrations
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/web/dist ./web/dist
COPY server/migrations ./server/migrations

WORKDIR /app/server

EXPOSE 4318

CMD ["node", "dist/main.js"]
