# ========================================================
# DiviAkhaaa Backend — Multi-stage Production Dockerfile
# Base: node:20-alpine (lightweight, hardened)
# Compatible: Render, Railway, Fly.io, Cloud Run
# ========================================================

# --------------------------------------------------------
# Stage 1: Base image
# --------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# --------------------------------------------------------
# Stage 2: Install all dependencies (development + production)
# --------------------------------------------------------
FROM base AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --------------------------------------------------------
# Stage 3: Build TypeScript source into dist/
# --------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --------------------------------------------------------
# Stage 4: Production dependencies only
# --------------------------------------------------------
FROM base AS production-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --------------------------------------------------------
# Stage 5: Lightweight production runner (Non-root user)
# --------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Security: Ensure non-root node user owns application files
RUN chown -R node:node /app

# Copy production dependencies and compiled artifacts
COPY --chown=node:node --from=production-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node package*.json ./

# Switch to standard unprivileged user
USER node

# Healthcheck for orchestration platforms
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
