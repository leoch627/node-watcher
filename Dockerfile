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

WORKDIR /app
RUN apk add --no-cache ca-certificates curl gzip tini font-noto-cjk \
    && case "${TARGETARCH}" in amd64|arm64) ;; *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; esac \
    && curl -fsSL -o /tmp/mihomo.gz "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-${TARGETARCH}-${MIHOMO_VERSION}.gz" \
    && gzip -d /tmp/mihomo.gz \
    && install -m 0755 /tmp/mihomo /usr/local/bin/mihomo \
    && mihomo -v

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY --from=web-builder /app/public ./public

RUN mkdir -p /app/data /app/logs && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    PORT=3000 \
    CONFIG_FILE=/app/data/config.json

VOLUME ["/app/data", "/app/logs"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
