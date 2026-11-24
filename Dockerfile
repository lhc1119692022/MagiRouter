# syntax=docker/dockerfile:1

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS builder

ARG BUILD_CONCURRENCY=4
ARG NODE_MAX_OLD_SPACE_SIZE=3072
ENV BUN_INSTALL_CACHE_DIR=/root/.bun/install/cache

WORKDIR /build/web
COPY web/package.json web/bun.lock ./
RUN --mount=type=cache,id=new-api-bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
COPY ./web ./
COPY ./VERSION /build/VERSION
RUN DISABLE_ESLINT_PLUGIN='true' \
    RAYON_NUM_THREADS="${BUILD_CONCURRENCY}" \
    TOKIO_WORKER_THREADS="${BUILD_CONCURRENCY}" \
    UV_THREADPOOL_SIZE="${BUILD_CONCURRENCY}" \
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" \
    VITE_REACT_APP_VERSION=$(cat /build/VERSION) \
    bun run build

FROM golang:1.26.10-alpine@sha256:9ce231b28998b32e116927c61aa5c406183061d4f3f2d61b292c88e7f6bdf7ca AS builder2
ENV GO111MODULE=on CGO_ENABLED=0 GOWORK=off \
    GOMODCACHE=/go/pkg/mod GOCACHE=/root/.cache/go-build

ARG TARGETOS
ARG TARGETARCH
ARG GO_BUILD_PARALLEL=4
ARG GO_BUILD_MEMLIMIT=2GiB
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc

WORKDIR /build

ADD go.mod go.sum ./
# relaykit and tokenkit are local submodules referenced via replace; their
# go.mod files must be present for go mod download to resolve the main module graph.
ADD relaykit/go.mod ./relaykit/go.mod
ADD tokenkit/go.mod ./tokenkit/go.mod
RUN --mount=type=cache,id=new-api-gomod,target=/go/pkg/mod \
    go mod download

COPY . .
COPY --from=builder /build/web/dist ./web/dist
RUN --mount=type=cache,id=new-api-gomod,target=/go/pkg/mod \
    --mount=type=cache,id=new-api-gobuild,target=/root/.cache/go-build \
    GOMEMLIMIT="${GO_BUILD_MEMLIMIT}" \
    go build -p "${GO_BUILD_PARALLEL}" -pgo="$(go list -m -f '{{.Dir}}' github.com/MoeForge/moejs)/default.pgo" -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api

FROM debian:bookworm-slim@sha256:f06537653ac770703bc45b4b113475bd402f451e85223f0f2837acbf89ab020a

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata libasan8 wget \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY --from=builder2 /build/new-api /
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/new-api"]
