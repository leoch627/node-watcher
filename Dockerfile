FROM node:22-alpine AS web-builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY client ./client
COPY components.json vite.config.js ./
RUN npm run build

FROM node:22-alpine AS runtime

ARG TARGETARCH
ARG MIHOMO_VERSION=v1.19.30
# SHA-256 of the release assets mihomo-linux-<arch>-<version>.gz, as published by GitHub for the release
# (https://api.github.com/repos/MetaCubeX/mihomo/releases/tags/<version>, field "digest").
# Update all three ARGs together when bumping the version.
ARG MIHOMO_SHA256_AMD64=cf06ce2c7d1421bdbda14ee4a5b6046672dc35ebf8eecd8e77504ec3c0ed9a84
ARG MIHOMO_SHA256_ARM64=58896873736d28628f66de3677c8654fa0f180662523148e136cff4f6e890069
# miaospeed test engine (github.com/AirportR/miaospeed, AGPL-3.0). SHA-256 of
# miaospeed-linux-<arch>-<version>.tar.gz from the release's asset digests; bump all three together.
ARG MIAOSPEED_VERSION=4.7.8
ARG MIAOSPEED_SHA256_AMD64=d41769a94deed8d5a52d52fb4f3c227bd5f397c481003f21225b8756e829767a
ARG MIAOSPEED_SHA256_ARM64=8192b2a2dc3eac398cbafb595d376036c3a9dee699ce253596f50da1d3ebd92b

LABEL org.opencontainers.image.title="Node Watcher" \
      org.opencontainers.image.source="https://github.com/leoch627/node-watcher" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

WORKDIR /app
RUN apk add --no-cache ca-certificates curl gzip openssl tini font-noto-cjk \
    && image_arch="${TARGETARCH}" \
    && if [ -z "${image_arch}" ]; then case "$(apk --print-arch)" in x86_64) image_arch=amd64 ;; aarch64) image_arch=arm64 ;; esac; fi \
    && case "${image_arch}" in \
         amd64) expected_sha256="${MIHOMO_SHA256_AMD64}"; miaospeed_sha256="${MIAOSPEED_SHA256_AMD64}" ;; \
         arm64) expected_sha256="${MIHOMO_SHA256_ARM64}"; miaospeed_sha256="${MIAOSPEED_SHA256_ARM64}" ;; \
         *) echo "Unsupported architecture: ${image_arch}" >&2; exit 1 ;; \
       esac \
    && curl -fsSL -o /tmp/mihomo.gz "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-${image_arch}-${MIHOMO_VERSION}.gz" \
    && echo "${expected_sha256}  /tmp/mihomo.gz" | sha256sum -c - \
    && gzip -d /tmp/mihomo.gz \
    && install -m 0755 /tmp/mihomo /usr/local/bin/mihomo \
    && mihomo -v \
    && curl -fsSL -o /tmp/miaospeed.tar.gz "https://github.com/AirportR/miaospeed/releases/download/${MIAOSPEED_VERSION}/miaospeed-linux-${image_arch}-${MIAOSPEED_VERSION}.tar.gz" \
    && echo "${miaospeed_sha256}  /tmp/miaospeed.tar.gz" | sha256sum -c - \
    && mkdir -p /tmp/miaospeed && tar -xzf /tmp/miaospeed.tar.gz -C /tmp/miaospeed \
    && install -m 0755 "/tmp/miaospeed/miaospeed-linux-${image_arch}" /usr/local/bin/miaospeed \
    && rm -rf /tmp/miaospeed /tmp/miaospeed.tar.gz \
    && miaospeed -version

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
COPY --from=web-builder /app/public ./public

RUN mkdir -p /app/data /app/logs && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    PORT=3000 \
    CONFIG_FILE=/app/data/config.json

VOLUME ["/app/data", "/app/logs"]
# 3000: web dashboard (master)   7443: TLS listener for remote probes (master)
EXPOSE 3000 7443
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/ready >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
