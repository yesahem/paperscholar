# The CMS for self-hosting (docs/specs/14-cms.md §10). Build context: the repository root.
#   docker build -f apps/cms/Dockerfile \
#     --build-arg CMS_URL=http://localhost:8081 --build-arg SITE_URL=http://localhost:8080 \
#     -t paperscholar-cms .
#
# The /api rewrite and the public URLs are fixed when the app is built, so they are
# build arguments. CMS_URL must be the backend's CMS_ORIGIN.
FROM oven/bun:1.3.14-slim AS bun

FROM node:24.22.3-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
ARG API_ORIGIN=http://backend:8797
ARG CMS_URL=http://localhost:8081
ARG SITE_URL=http://localhost:8080
# Only with files in R2: the S3 endpoint's origin, so PDFs can be uploaded to it directly.
ARG UPLOAD_ORIGIN=
ENV API_ORIGIN=$API_ORIGIN \
    NEXT_PUBLIC_CMS_URL=$CMS_URL \
    NEXT_PUBLIC_SITE_URL=$SITE_URL \
    UPLOAD_ORIGIN=$UPLOAD_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd apps/cms build

FROM node:24.22.3-slim
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ARG API_ORIGIN=http://backend:8797
ARG CMS_URL=http://localhost:8081
ARG SITE_URL=http://localhost:8080
ENV NODE_ENV=production \
    API_ORIGIN=$API_ORIGIN \
    NEXT_PUBLIC_CMS_URL=$CMS_URL \
    NEXT_PUBLIC_SITE_URL=$SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
USER node
WORKDIR /app/apps/cms
EXPOSE 3001
CMD ["node_modules/.bin/next", "start", "-p", "3001"]
