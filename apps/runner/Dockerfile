# The bundled runner service (docs/specs/13-self-hosting.md §5). It starts one
# container per run through the host's Docker daemon, so it runs as root with
# the Docker socket mounted, and must never be published outside the internal
# network. Build context: the repository root.
#   docker build -f apps/runner/Dockerfile -t paperscholar-runner .
FROM docker:28.5.2-cli AS docker-cli

FROM oven/bun:1.3.14-slim
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production --ignore-scripts

ENV PORT=8798
EXPOSE 8798
CMD ["bun", "apps/runner/src/main.ts"]
