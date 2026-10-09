# Multi-stage Dockerfile for server
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests for dependency installation
COPY package.json package-lock.json ./
COPY server/package.json ./server/

# Install dependencies including devDependencies for build
RUN npm ci

# Copy server source and tsconfig
COPY server/tsconfig.json ./server/
COPY server/src ./server/src

# Compile TypeScript
RUN npm -w server run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package.json package-lock.json ./
COPY server/package.json ./server/

RUN npm ci --omit=dev

# Copy compiled JavaScript output
COPY --from=builder /app/server/dist ./server/dist

WORKDIR /app/server

EXPOSE 4318

CMD ["node", "dist/main.js"]
