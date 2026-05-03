FROM node:20-alpine

WORKDIR /app

# Baileys (and a few of its transitive deps) reach for `git` during npm install,
# and ffmpeg is needed for media transcoding so manual sends with images / voice
# notes work later. The alpine base image ships with neither.
RUN apk add --no-cache ffmpeg git

COPY package.json ./
RUN npm install --omit=dev --no-fund --no-audit

COPY src ./src

# Persist the auth state on a docker volume so we don't have to scan the
# QR every time the container restarts.
VOLUME ["/app/auth"]

ENV NODE_ENV=production \
    PORT=3001 \
    AUTH_DIR=/app/auth

EXPOSE 3001

CMD ["node", "src/index.js"]
