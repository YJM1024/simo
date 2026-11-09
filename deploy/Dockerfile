# simo 容器镜像（多阶段构建）
#
# 构建上下文 = 仓库根目录（不是 deploy/）：
#   docker build -f deploy/Dockerfile -t simo:local .
#   docker compose -f deploy/compose.yaml build
#
# 阶段：
#   1) web         : node 24 + pnpm 构建前端 → backend/internal/webui/dist（被 Go embed 内嵌）
#   2) build       : golang 1.27 编译静态二进制（CGO_ENABLED=0）
#   3) runtime     : alpine（非 root、带 HEALTHCHECK）  ← 默认目标
#   3b) runtime-distroless : distroless static（更小，但无 shell/wget → 无内置 HEALTHCHECK）
#
# 备选（容器内 npm/网络不可用、想复用本机构建产物）：
#   docker build -f deploy/Dockerfile.go-only -t simo:local .
#   前置：先在本机跑 web 的 `node build.mjs`，使 backend/internal/webui/dist 存在；
#   该专用 Dockerfile 跳过 node 阶段，只编译 Go（其忽略清单不排除 dist）。
#
# 诚实声明：本机无 Docker/WSL/Podman，本文件**未经过实际构建验证**，
# 见 deploy/README.md「验证状态」与「已知限制」。

# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-bookworm-slim
ARG GO_IMAGE=golang:1.27-alpine
ARG RUNTIME_IMAGE=alpine:3.22
ARG DISTROLESS_IMAGE=gcr.io/distroless/static-debian12:nonroot
ARG TZ=Asia/Shanghai

# ── 阶段 1：前端构建 ────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS web
WORKDIR /src/frontend

# 契约版本（docs/tech-stack.md §2）：Node 24.21.0 / pnpm 11.28.5
ARG PNPM_VERSION=11.28.5
RUN if command -v corepack >/dev/null 2>&1; then \
      corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate; \
    else \
      npm install -g "pnpm@${PNPM_VERSION}"; \
    fi \
 && pnpm --version

# 先只拷 manifest 与 lockfile，最大化依赖层缓存（lockfileVersion 9.0）
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.strictDepBuilds=false

# 再拷源码（node_modules 已被排除，见 .dockerignore / Dockerfile.dockerignore）
COPY frontend/ ./

# 构建：tsc --noEmit → tailwind CSS → esbuild JS → 复制 public/index.html
# 前端产物固定输出 frontend/dist；后续再复制进 backend/internal/webui/dist 供 Go embed。
RUN node build.mjs \
 && test -f /src/frontend/dist/index.html \
 && test -f /src/frontend/dist/app.js \
 && test -f /src/frontend/dist/app.css

# ── 阶段 2：Go 编译（静态、无 CGO）──────────────────────────────────────────
FROM ${GO_IMAGE} AS build
WORKDIR /src

# goproxy.cn：proxy.golang.org 在开发网络不可达（docs/tech-stack.md §2）
ARG GOPROXY=https://goproxy.cn,direct
ENV GOPROXY=${GOPROXY} GOSUMDB=off GOTOOLCHAIN=local CGO_ENABLED=0

# 依赖层缓存
COPY backend/go.mod backend/go.sum ./backend/
RUN cd backend && go mod download

# 源码 + 前端产物（覆盖/创建 embed 目录，保证镜像内前端是最新构建）
COPY backend/ ./backend/
COPY --from=web /src/frontend/dist ./backend/internal/webui/dist

# -trimpath/-s -w 减小体积；-buildvcs=false：容器内无 .git 时避免版本信息报错
RUN mkdir -p /out \
 && cd backend \
 && go build -trimpath -buildvcs=false -ldflags="-s -w" -o /out/simo ./cmd/simo \
 && mkdir -p /out/data

# ── 阶段 3b：distroless（可选目标，--target runtime-distroless）──────────────
# 注意：distroless 无 shell/wget，因此**不能**用 wget 做 HEALTHCHECK；
# 需要由编排层（compose/K8s）或外部探针调 /api/health。
# 非 root 用户 65532（distroless nonroot）；/data 由构建期预创建并 chown。
FROM ${DISTROLESS_IMAGE} AS runtime-distroless
ARG TZ
WORKDIR /app
COPY --from=build --chown=65532:65532 /out/simo /simo
COPY --from=build --chown=65532:65532 /out/data /data
ENV SIMO_HOME=/data \
    SIMO_ADDR=0.0.0.0:8787 \
    TZ=${TZ}
EXPOSE 8787
VOLUME ["/data"]
USER 65532:65532
ENTRYPOINT ["/simo", "serve"]
# distroless 无 shell/wget，无法内置 HEALTHCHECK；由 compose/K8s 外部探针调用 /api/health。

# ── 阶段 3：运行镜像（默认目标）────────────────────────────────────────────
FROM ${RUNTIME_IMAGE} AS runtime
ARG TZ

# 非 root：固定 uid/gid=10001，避免依赖镜像默认用户
RUN addgroup -g 10001 -S simo \
 && adduser -u 10001 -S -G simo -h /app -s /sbin/nologin simo \
 && apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=build /out/simo /simo

# /data = SIMO_HOME（SQLite/artifacts/workspace/logs）；先建再 chown，
# 命名卷首次挂载时会继承该目录的属主（bind mount 需宿主侧自行 chown，见 README）。
RUN mkdir -p /data && chown -R 10001:10001 /data

# SIMO_ADDR 必须改成 0.0.0.0：默认 127.0.0.1 只在容器内回环，端口映射不通。
ENV SIMO_HOME=/data \
    SIMO_ADDR=0.0.0.0:8787 \
    SIMO_MODEL=mock \
    TZ=${TZ}

EXPOSE 8787
VOLUME ["/data"]

USER 10001:10001

# 契约端点：GET /api/health → {"ok":true,"time":...}（docs/m1-contract.md §3.1）
# busybox wget 随 alpine 提供；-q 静默，成功返回 0
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8787/api/health >/dev/null 2>&1 || exit 1

# Go 进程自行处理 SIGTERM（优雅关闭最长 10s）；显式声明便于阅读
STOPSIGNAL SIGTERM

ENTRYPOINT ["/simo", "serve"]
