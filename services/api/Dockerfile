# ---- Build Stage ----
# Use Debian Trixie (not Alpine) so we can build libvips with HEIC/libde265 support.
# Alpine's musl-based sharp prebuilt only ships the AVIF codec; HEIC needs libde265
# which requires building libvips from source against system libheif.
FROM node:24-trixie-slim AS builder
WORKDIR /app

# Install build tools and libvips build dependencies (split to avoid network timeouts)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config wget ca-certificates xz-utils python3 \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    meson ninja-build \
    libglib2.0-dev libexpat1-dev libjpeg-dev libpng-dev \
    libwebp-dev libtiff-dev libheif-dev libde265-dev \
    libexif-dev liblcms2-dev \
    && rm -rf /var/lib/apt/lists/*

# Build libvips 8.17.3 from source with HEIC support (via libheif + libde265)
RUN wget -q https://github.com/libvips/libvips/releases/download/v8.17.3/vips-8.17.3.tar.xz \
    && tar xf vips-8.17.3.tar.xz && cd vips-8.17.3 \
    && meson setup build --prefix=/usr --buildtype=release -Dintrospection=disabled \
    && ninja -C build \
    && ninja -C build install \
    && cd /app && rm -rf /vips-8.17.3*

# Copy workspace manifests for dependency installation
# Only include packages needed for the API service (skip apps/ to avoid mobile deps)
COPY package.json yarn.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api/package.json ./services/api/

# Install all workspace dependencies (devDeps needed for TypeScript compilation)
RUN yarn install --frozen-lockfile --ignore-scripts

# Build sharp native addon from source against our custom libvips (HEIC-enabled)
RUN cd node_modules/sharp && npm install --no-save node-addon-api node-gyp \
    && PATH="/app/node_modules/sharp/node_modules/.bin:$PATH" \
       SHARP_FORCE_GLOBAL_LIBVIPS=1 node install/build.js

# Stage custom libvips libraries and modules for the runtime image
RUN mkdir /vips-libs && cp /usr/lib/x86_64-linux-gnu/libvips*.so* /vips-libs/ \
    && cp -r /usr/lib/x86_64-linux-gnu/vips-modules-8.17 /vips-libs/

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY services/api/ ./services/api/

# Build shared types package then API service
RUN yarn workspace @burnbuddy/shared build && \
    yarn workspace api build

# ---- Runtime Stage ----
FROM node:24-trixie-slim
WORKDIR /app

# Install runtime dependencies for custom libvips with HEIC support
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0t64 libexpat1 libjpeg62-turbo libpng16-16t64 \
    libwebp7 libwebpmux3 libwebpdemux2 \
    libtiff6 libheif1 libde265-0 libheif-plugin-libde265 \
    libexif12 liblcms2-2 \
    && rm -rf /var/lib/apt/lists/*

# Copy custom-built libvips (with HEIC support) and its heif module, then refresh linker cache
COPY --from=builder /vips-libs/libvips*.so* /usr/lib/x86_64-linux-gnu/
COPY --from=builder /vips-libs/vips-modules-8.17/ /usr/lib/x86_64-linux-gnu/vips-modules-8.17/
RUN ldconfig

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
