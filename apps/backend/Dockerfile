# The API (and, with another command, the worker) for self-hosting
# (docs/specs/13-self-hosting.md §3). Build context: the repository root.
#   docker build -f apps/backend/Dockerfile -t paperscholar-backend .
FROM oven/bun:1.3.14-slim

WORKDIR /app
COPY . .
# /data/storage is created here, owned by bun, so a new named volume mounted
# there inherits that owner.
RUN bun install --frozen-lockfile --production --ignore-scripts \
    && mkdir -p /data/storage \
    && chown -R bun:bun /app/apps/backend /data

ENV NODE_ENV=production \
    PORT=8797 \
    STORAGE_FS_PATH=/data/storage
USER bun
EXPOSE 8797

# Applies migrations and loads the bundled papers, then serves.
CMD ["sh", "-c", "bun run --cwd packages/db db:migrate && bun run --cwd apps/backend content:sync && exec bun apps/backend/src/main.ts"]
