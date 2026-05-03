#!/usr/bin/env bash
# One-shot VPS bootstrap for FreeRADIUS Admin (Ubuntu 22.04 / 24.04).
#
# What this does:
#   1. Installs Docker Engine + Compose plugin via the official Docker apt repo.
#   2. Installs nginx and configures a host-level reverse proxy → 127.0.0.1:8080.
#   3. Configures ufw to allow SSH (22) + HTTP (80) + HTTPS (443).
#   4. Generates a fresh .env from .env.example with strong random secrets.
#   5. Brings the stack up with docker compose using the production overlay.
#
# Run as root or with sudo, from the cloned repo root:
#   sudo bash deploy/setup-vps.sh
#
# Re-running is safe — it only regenerates .env on first run.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Please run as root: sudo bash deploy/setup-vps.sh" >&2
    exit 1
fi

log() { printf "\n\033[1;32m==>\033[0m %s\n" "$*"; }
warn() { printf "\n\033[1;33m==>\033[0m %s\n" "$*"; }

# --------------------------------------------------------------------------
# 1. Docker Engine + Compose plugin
# --------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
    log "Installing Docker Engine..."
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
       https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y \
        docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
else
    log "Docker already installed ($(docker --version))."
fi

# --------------------------------------------------------------------------
# 2. nginx host reverse proxy
# --------------------------------------------------------------------------
if ! command -v nginx >/dev/null 2>&1; then
    log "Installing nginx..."
    apt-get install -y nginx
fi

NGINX_SITE=/etc/nginx/sites-available/freeradius-admin
NGINX_LINK=/etc/nginx/sites-enabled/freeradius-admin

log "Installing nginx site config..."
install -m 0644 "$REPO_DIR/deploy/nginx.conf" "$NGINX_SITE"
ln -sf "$NGINX_SITE" "$NGINX_LINK"
# Disable Ubuntu's default site so it doesn't shadow ours.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# --------------------------------------------------------------------------
# 3. ufw firewall
# --------------------------------------------------------------------------
if command -v ufw >/dev/null 2>&1; then
    log "Configuring ufw firewall..."
    ufw allow OpenSSH || true
    ufw allow 'Nginx Full' || true
    if ! ufw status | grep -q "Status: active"; then
        warn "ufw is inactive — enabling. SSH must already be allowed (above)."
        ufw --force enable
    fi
else
    warn "ufw not installed; skipping firewall config."
fi

# --------------------------------------------------------------------------
# 4. .env file
# --------------------------------------------------------------------------
if [[ ! -f .env ]]; then
    log "Generating .env with strong random secrets..."
    cp .env.example .env
    JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
    DB_ROOT=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
    DB_USER_PW=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
    ADMIN_PW=$(python3 -c "import secrets; print(secrets.token_urlsafe(18))")
    WHATSAPP_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    sed -i \
        -e "s|CHANGE_ME_long_random_secret|${JWT_SECRET}|" \
        -e "s|CHANGE_ME_strong_root_password|${DB_ROOT}|" \
        -e "s|CHANGE_ME_strong_db_password|${DB_USER_PW}|" \
        -e "s|CHANGE_ME_initial_admin_password|${ADMIN_PW}|" \
        -e "s|CHANGE_ME_long_random_whatsapp_key|${WHATSAPP_KEY}|" \
        .env
    chmod 600 .env
    log "Generated .env. Initial admin credentials:"
    printf "    username: \033[1madmin\033[0m\n"
    printf "    password: \033[1m%s\033[0m\n" "$ADMIN_PW"
    warn "SAVE THIS PASSWORD NOW. After first login, change it from inside the panel."
else
    log ".env already exists — leaving it alone."
fi

# --------------------------------------------------------------------------
# 5. Bring up the stack
# --------------------------------------------------------------------------
log "Building and starting docker compose..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

log "Done. The panel is now reachable at:"
SERVER_IP=$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
printf "    \033[1;36mhttp://%s/\033[0m\n" "${SERVER_IP}"
printf "\n"
log "To follow logs:    docker compose logs -f"
log "To stop the stack: docker compose down"
log "To upgrade:        git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
