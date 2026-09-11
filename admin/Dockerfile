# Build context is the REPOSITORY ROOT, not admin/:
#   docker build -f admin/Dockerfile .
# The build derives the portal's fonts, logo and colour tokens from the site's
# own static/ files (scripts/sync-brand.mjs), so it needs to see them.
# admin/Dockerfile.dockerignore allow-lists only what is needed, so the content
# images are never sent to the build.

# Base pinned by digest, not just tag: the image is the deployable artifact, and
# a floating tag would silently change what gets shipped between deploys.
FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS builder

WORKDIR /repo
# npm ci (never npm install) so the lockfile is authoritative.
COPY admin/package.json admin/package-lock.json admin/
RUN cd admin && npm ci
COPY admin/ admin/
# The site's brand sources, read by the prebuild step.
COPY static/css/main.css static/css/main.css
COPY static/fonts/ static/fonts/
COPY static/img/logo.svg static/img/favicon.svg static/img/favicon.png static/img/favicon.ico static/img/
RUN cd admin && npm run build

FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY admin/package.json admin/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /repo/admin/build ./build

# Scaleway Serverless Containers routes to $PORT; adapter-node binds HOST:PORT.
# BODY_SIZE_LIMIT must be raised from its 512 KB default or image uploads 413.
ENV PORT=8080 \
    HOST=0.0.0.0 \
    BODY_SIZE_LIMIT=12M

USER node
EXPOSE 8080
CMD ["node", "build"]
