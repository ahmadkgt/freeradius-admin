#!/usr/bin/env bash
# Install and configure FreeRADIUS 3.x on the same Ubuntu VPS as the panel.
#
# What it does:
#   1. Installs `freeradius`, `freeradius-mysql`, `freeradius-utils` from apt.
#   2. Reads MySQL credentials from the panel's project-root `.env` file
#      (the same file `deploy/setup-vps.sh` generated).
#   3. Patches `/etc/freeradius/3.0/mods-available/sql` to talk to the panel's
#      MySQL on `127.0.0.1:3306` with `dialect = "mysql"` and
#      `read_clients = yes` (so FreeRADIUS reads NAS entries from the panel's
#      `nas` table — the same one you edit in the UI).
#   4. Enables the `sql` module (mods-enabled/sql) — the `-sql` references in
#      the default `sites-enabled/default` and `sites-enabled/inner-tunnel`
#      already wire it into authorize / accounting / post-auth.
#   5. Locks down permissions on the configured sql file (`chmod 640`,
#      group `freerad`) so the password isn't world-readable.
#   6. Restarts and enables the systemd service.
#   7. Smoke-tests `radtest alice alice123 127.0.0.1 0 testing123` against
#      the seeded admin user.
#
# Run from the panel repo root:  sudo bash deploy/freeradius/install-freeradius.sh
#
# Re-running is safe: the script keeps a one-time backup of the original sql
# config at `/etc/freeradius/3.0/mods-available/sql.dist` and patches in place.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${REPO_DIR}/.env"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Please run as root: sudo bash deploy/freeradius/install-freeradius.sh" >&2
    exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Could not find ${ENV_FILE}. Run deploy/setup-vps.sh first to generate it." >&2
    exit 1
fi

log() { printf "\n\033[1;32m==>\033[0m %s\n" "$*"; }
warn() { printf "\n\033[1;33m==>\033[0m %s\n" "$*"; }

# --------------------------------------------------------------------------
# 1. Read credentials from the panel's .env
# --------------------------------------------------------------------------
# shellcheck disable=SC1090
set -a; . "${ENV_FILE}"; set +a
MYSQL_USER="${MYSQL_USER:-radius}"
MYSQL_DATABASE="${MYSQL_DATABASE:-radius}"
if [[ -z "${MYSQL_PASSWORD:-}" ]]; then
    echo "MYSQL_PASSWORD is empty in ${ENV_FILE}; refusing to continue." >&2
    exit 1
fi

# --------------------------------------------------------------------------
# 2. Install packages
# --------------------------------------------------------------------------
log "Installing freeradius + freeradius-mysql + freeradius-utils..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    freeradius freeradius-mysql freeradius-utils

# --------------------------------------------------------------------------
# 3. Patch mods-available/sql
# --------------------------------------------------------------------------
SQL_CONF=/etc/freeradius/3.0/mods-available/sql
SQL_BAK="${SQL_CONF}.dist"

if [[ ! -f "${SQL_BAK}" ]]; then
    log "Backing up original sql config to ${SQL_BAK}"
    cp -a "${SQL_CONF}" "${SQL_BAK}"
fi

# Always re-derive from the upstream backup so re-runs converge to the same
# end state.
cp -a "${SQL_BAK}" "${SQL_CONF}"

log "Patching ${SQL_CONF} for MySQL on 127.0.0.1:3306..."

python3 - "${SQL_CONF}" "${MYSQL_USER}" "${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" <<'PY'
import re, sys
path, login, password, db = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. dialect: sqlite → mysql
text = re.sub(
    r'^(\s*)dialect\s*=\s*"sqlite"\s*$',
    r'\1dialect = "mysql"',
    text,
    count=1,
    flags=re.M,
)

# 2. driver: rlm_sql_null → rlm_sql_${dialect}
text = re.sub(
    r'^(\s*)driver\s*=\s*"rlm_sql_null"\s*$',
    r'\1driver = "rlm_sql_${dialect}"',
    text,
    count=1,
    flags=re.M,
)

# 3. Connection: uncomment the four "# server / port / login / password" lines
#    and set them to our values.
def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')

# The four connection lines appear commented in a contiguous block (the
# upstream order is: server, port, login, password). We match each line
# with a permissive value regex (quoted strings OR bare integers) so we
# don't depend on whether the upstream value is quoted.
repls = [
    ("server",   '"127.0.0.1"'),
    ("port",     "3306"),
    ("login",    f'"{_esc(login)}"'),
    ("password", f'"{_esc(password)}"'),
]
for key, val in repls:
    pat = re.compile(
        rf'^(\s*)#\s*{key}\s*=\s*[^\n]+$',
        re.M,
    )
    if pat.search(text) is None:
        raise SystemExit(f"Could not find connection key '{key}' in sql config")
    text, n = pat.subn(rf'\g<1>{key} = {val}', text, count=1)
    if n != 1:
        raise SystemExit(f"Failed to set '{key}' (matched {n} times)")

# 4. radius_db: ensure it points at our database (default is already "radius")
text = re.sub(
    r'^(\s*)radius_db\s*=\s*".*?"\s*$',
    rf'\1radius_db = "{_esc(db)}"',
    text,
    count=1,
    flags=re.M,
)

# 5. read_clients: uncomment so FreeRADIUS pulls NAS clients from the `nas` table.
text = re.sub(
    r'^(\s*)#\s*read_clients\s*=\s*yes\s*$',
    r'\1read_clients = yes',
    text,
    count=1,
    flags=re.M,
)

# 6. Comment out the TLS sub-block inside mysql {}. By default it points at
#    /etc/ssl/certs/my_ca.crt which doesn't exist on a fresh install, and
#    FreeRADIUS validates the path at parse time even when TLS isn't used.
#    We're talking to MySQL on 127.0.0.1, so plain TCP is fine.
def _comment_tls(match: re.Match) -> str:
    block = match.group(0)
    return "\n".join(
        ("#" + line if line.strip() and not line.lstrip().startswith("#") else line)
        for line in block.splitlines()
    )

text = re.sub(
    r'^[ \t]*tls\s*\{[^{}]*\}\s*$',
    _comment_tls,
    text,
    count=1,
    flags=re.M,
)

with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PY

# --------------------------------------------------------------------------
# 4. Permissions (the file now contains the DB password)
# --------------------------------------------------------------------------
chown root:freerad "${SQL_CONF}"
chmod 640 "${SQL_CONF}"

# --------------------------------------------------------------------------
# 5. Enable the sql module
# --------------------------------------------------------------------------
ENABLED_LINK=/etc/freeradius/3.0/mods-enabled/sql
if [[ ! -L "${ENABLED_LINK}" ]]; then
    log "Enabling sql module (symlink mods-enabled/sql)..."
    ln -s ../mods-available/sql "${ENABLED_LINK}"
else
    log "sql module already enabled."
fi

# --------------------------------------------------------------------------
# 6. Restart + enable service
# --------------------------------------------------------------------------
log "Restarting freeradius..."
systemctl enable --now freeradius
systemctl restart freeradius

# Quick health check
if ! systemctl is-active --quiet freeradius; then
    warn "freeradius did not come up cleanly. Showing journal:"
    journalctl -u freeradius -n 40 --no-pager || true
    exit 1
fi

# --------------------------------------------------------------------------
# 7. Open firewall (only if ufw is active and the user opted in)
# --------------------------------------------------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    if [[ -n "${RADIUS_ALLOW_FROM:-}" ]]; then
        log "Allowing UDP 1812 + 1813 from ${RADIUS_ALLOW_FROM} via ufw..."
        ufw allow from "${RADIUS_ALLOW_FROM}" to any port 1812 proto udp || true
        ufw allow from "${RADIUS_ALLOW_FROM}" to any port 1813 proto udp || true
    else
        warn "ufw is active but RADIUS_ALLOW_FROM is not set — RADIUS ports stay CLOSED."
        warn "Set RADIUS_ALLOW_FROM to your NAS subnet (e.g. 10.0.0.0/8) and re-run, or run:"
        warn "    sudo ufw allow from <your-nas-subnet> to any port 1812 proto udp"
        warn "    sudo ufw allow from <your-nas-subnet> to any port 1813 proto udp"
    fi
fi

# --------------------------------------------------------------------------
# 8. Smoke test against the seeded user
# --------------------------------------------------------------------------
log "Smoke-testing with the seeded user 'alice / alice123' over the default localhost client..."
if radtest alice alice123 127.0.0.1 0 testing123 2>&1 | tee /tmp/radtest-alice.log | grep -q "Access-Accept"; then
    printf "\n\033[1;32m==> radtest succeeded — FreeRADIUS authenticated 'alice' against the panel DB.\033[0m\n"
else
    warn "radtest did NOT return Access-Accept. Output:"
    cat /tmp/radtest-alice.log
    warn "Check journalctl -u freeradius -n 50 --no-pager and verify .env credentials."
    exit 1
fi

cat <<'EOF'

==> Done.

FreeRADIUS is running on UDP 1812 (auth) + 1813 (accounting) and shares the panel's
database. Anything you do in the panel — adding a user, changing a group's
attributes, registering a new NAS — takes effect on the very next RADIUS request.

What to do next:
  1. Add your NAS devices in the panel under "NAS / Clients" (or via the UI you've
     been using). The `read_clients = yes` setting means FreeRADIUS picks them up
     on the next service reload.
  2. Open RADIUS UDP ports for your NAS subnet, e.g.:
        sudo ufw allow from 10.0.0.0/8 to any port 1812 proto udp
        sudo ufw allow from 10.0.0.0/8 to any port 1813 proto udp
  3. After adding/removing clients in the panel, reload FreeRADIUS to refresh the
     in-memory client list:
        sudo systemctl reload freeradius
  4. Tail the live RADIUS log:
        sudo journalctl -u freeradius -f

EOF
