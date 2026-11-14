# The web app for self-hosting (docs/specs/13-self-hosting.md §3). Build
# context: the repository root.
#   docker build -f apps/web/Dockerfile --build-arg SITE_URL=http://localhost:8080 -t paperscholar-web .
#
# The /api rewrite and the public site URL are fixed when the app is built,
# so both are build arguments.
FROM oven/bun:1.3.14-slim AS bun

FROM node:24.22.3-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
ARG API_ORIGIN=http://backend:8797
ARG SITE_URL=http://localhost:8080
# Only with avatars in R2: the public bucket's origin, for the image policy.
ARG AVATAR_ORIGIN=
ENV API_ORIGIN=$API_ORIGIN \
    NEXT_PUBLIC_SITE_URL=$SITE_URL \
    AVATAR_ORIGIN=$AVATAR_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd apps/web build

FROM node:24.22.3-slim
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ARG API_ORIGIN=http://backend:8797
ARG SITE_URL=http://localhost:8080
ENV NODE_ENV=production \
    API_ORIGIN=$API_ORIGIN \
    NEXT_PUBLIC_SITE_URL=$SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
