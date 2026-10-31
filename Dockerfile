# Two images from one Dockerfile:
#
#   web     public API + built frontend. Never runs user code.
#   worker  runs the biton compiler and user programs, one unprivileged uid
#           per job, on an internal network with no internet access.
#
# Stage the compiler first (it is copied from a local build of ../biton):
#   scripts/stage-compiler.sh ../biton
# then use docker-compose.yml, which sets the required isolation flags.

ARG NODE_IMAGE=node:22-bookworm-slim

# ── frontend build ──────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY shared ./shared
RUN npm run build

# ── web (API) ───────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS web
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY --from=frontend /app/dist ./dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/index.ts"]

# ── worker ──────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS node
FROM ubuntu:24.04 AS worker
# gcc + libc6-dev: biton links programs with the system C compiler.
# util-linux: prlimit.  zlib/zstd: the compiler's runtime libraries.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      gcc libc6-dev util-linux zlib1g libzstd1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY vendor/biton /opt/biton
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
ENV NODE_ENV=production \
    BITON_BIN=/opt/biton/bin/biton \
    BITON_HOME=/opt/biton/share/biton \
    BITON_SANDBOX=uid \
    JOB_ROOT=/jobs \
    WORKER_HOST=0.0.0.0 \
    WORKER_PORT=9000
# Starts as root so it can run each job as its own uid; docker-compose.yml
# drops every capability except the few this needs.
USER root
EXPOSE 9000
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/worker.ts"]
