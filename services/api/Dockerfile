# ---- Build Stage ----
FROM node:24-alpine AS builder
WORKDIR /app

# Copy workspace manifests for dependency installation
# Only include packages needed for the API service (skip apps/ to avoid mobile deps)
COPY package.json yarn.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api/package.json ./services/api/

# Install all workspace dependencies (devDeps needed for TypeScript compilation)
RUN yarn install --frozen-lockfile --ignore-scripts

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY services/api/ ./services/api/

# Build shared types package then API service
RUN yarn workspace @burnbuddy/shared build && \
    yarn workspace api build

# ---- Runtime Stage ----
FROM node:24-alpine
WORKDIR /app

# Copy root-level node_modules (preserves workspace symlinks)
COPY --from=builder /app/node_modules ./node_modules

# Copy shared package (required for workspace symlink resolution at runtime)
COPY --from=builder /app/packages/shared ./packages/shared

# Copy API compiled output and manifest
COPY --from=builder /app/services/api/dist ./services/api/dist
COPY --from=builder /app/services/api/package.json ./services/api/package.json

# Copy root manifest (required for workspace resolution)
COPY --from=builder /app/package.json ./package.json

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "services/api/dist/index.js"]
