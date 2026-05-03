FROM node:20-alpine

WORKDIR /app

# Baileys requires a couple of extra binaries for media transcoding; install
# them eagerly so manual sends with images/voice notes work later.
RUN apk add --no-cache ffmpeg

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
