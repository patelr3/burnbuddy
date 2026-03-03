# ---- Build Stage ----
FROM node:24-alpine AS builder
WORKDIR /app

# Firebase and API build args (baked into Next.js at build time)
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_API_URL

# Copy workspace manifests for dependency installation
COPY package.json yarn.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install all workspace dependencies
RUN yarn install --frozen-lockfile --ignore-scripts

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# Build shared types package then Next.js app
RUN yarn workspace @burnbuddy/shared build && \
    yarn workspace web build

# ---- Runtime Stage ----
FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output bundles everything needed to run
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
