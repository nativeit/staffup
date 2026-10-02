#!/usr/bin/env bash
#
# Staff Up — installer for the management GUI on a fresh Debian/Ubuntu server.
#
#   DANGER: run this ONLY on a freshly provisioned server. It installs and
#   replaces Docker (removing distro packages like docker.io), configures UFW,
#   and creates system resources. Running it on an in-use system WILL BREAK
#   things. See IDEA.md.
#
# Usage (from a checkout):
#   sudo ./install.sh [--yes] [--port 3000] [--data-dir /opt/staffup]
#                     [--repo <git-url> | --source <dir>] [--branch main] [--force]
#
# Scope: OS -> Docker -> Node -> code -> build -> firewall -> systemd GUI.
# It does NOT deploy Traefik/Authentik/Hermes/Tailscale; those are configured
# and deployed through the GUI afterwards.
set -Eeuo pipefail

# ---------------------------------------------------------------- constants
APP_NAME="staffup"
DEFAULT_PORT=3000
DATA_DIR="/opt/staffup"
LOG_FILE="/var/log/staffup-install.log"
SRC_DIR="${DATA_DIR}/src"
STACK_DIR="${DATA_DIR}/stack"
RUN_USER="${APP_NAME}"
YES=0
FORCE=0
REPO=""
SOURCE_DIR=""
BRANCH="main"
GUI_PORT="${DEFAULT_PORT}"
SETUP_TOKEN=""

# ---------------------------------------------------------------- logging
# shellcheck disable=SC2312
exec > >(tee -a "${LOG_FILE}") 2>&1
log()  { printf '\033[1;33m[staffup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[  ok  ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ warn ]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[ fail ]\033[0m %s\n' "$*" >&2; exit 1; }
trap 'die "install failed at line ${LINENO}. See ${LOG_FILE}"' ERR

# ---------------------------------------------------------------- flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)     YES=1 ;;
    --force)   FORCE=1 ;;
    --port)    GUI_PORT="${2:?--port needs a value}"; shift ;;
    --data-dir) DATA_DIR="${2:?--data-dir needs a value}"; shift ;;
    --repo)    REPO="${2:?--repo needs a url}"; shift ;;
    --source)  SOURCE_DIR="${2:?--source needs a dir}"; shift ;;
    --branch)  BRANCH="${2:?--branch needs a value}"; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//' | tail -n +3; exit 0 ;;
    *) die "unknown flag: $1" ;;
  esac
  shift
done

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- preflight
preflight() {
  [[ $EUID -eq 0 ]] || die "must run as root (sudo)"

  # shellcheck disable=SC1091
  source /etc/os-release
  case "${ID:-}" in
    debian)
      case "${VERSION_ID:-}" in 12|13) ;; *) die "unsupported Debian: ${VERSION_ID}" ;; esac
      ;;
    ubuntu)
      case "${VERSION_CODENAME:-}" in jammy|noble) ;; *) die "unsupported Ubuntu: ${VERSION_CODENAME}" ;; esac
      ;;
    *) die "unsupported OS: ${ID:-unknown}" ;;
  esac

  local arch
  arch="$(dpkg --print-architecture)"
  case "${arch}" in amd64|arm64) ;; *) die "unsupported architecture: ${arch}" ;; esac

  # Freshness guards (IDEA.md: "WILL BREAK things" on in-use systems)
  if [[ $FORCE -ne 1 ]]; then
    command -v docker >/dev/null 2>&1 && \
      die "Docker is already installed — this script is for FRESH servers only. Re-run with --force to override."
    [[ -e "${DATA_DIR}" ]] && \
      die "${DATA_DIR} already exists. Re-run with --force to override."
    if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
      die "UFW is already active with existing rules. Re-run with --force to override."
    fi
  fi

  local mem_kb disk_avail port
  mem_kb="$(awk '/MemTotal/{print $2}' /proc/meminfo)"
  if [[ ${mem_kb} -lt 2000000 ]]; then
    warn "less than 2 GB RAM; creating a 2 GB swapfile"
    if [[ ! -e /swapfile ]]; then
      fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
  fi
  disk_avail="$(df --output=avail -BG / | awk 'NR==2{print $1}')"
  [[ ${disk_avail%\G} -ge 10 ]] || die "only ${disk_avail} free on / — need at least 10G"

  for port in 80 443 "${GUI_PORT}"; do
    if ss -ltnH "sport = :${port}" 2>/dev/null | grep -q .; then
      warn "port ${port} is already listening — services may conflict"
    fi
  done

  curl -fsS --max-time 10 https://deb.debian.org >/dev/null 2>&1 \
    || curl -fsS --max-time 10 https://archive.ubuntu.com >/dev/null 2>&1 \
    || die "no internet connectivity"

  local ssh_port
  ssh_port="$(sshd -T 2>/dev/null | awk '/^port /{print $2}')"
  SSH_PORT="${ssh_port:-22}"

  echo
  warn "This script is for a FRESHLY INSTALLED server only. It will install Docker"
  warn "(removing distro packages), configure UFW, and create /opt/${APP_NAME}."
  echo
  if [[ $YES -ne 1 ]]; then
    read -r -p "Continue? (yes/no): " reply
    [[ "${reply}" == "yes" ]] || die "aborted by user"
  fi
  log "preflight passed: ${ID} ${VERSION_ID:-} ${arch}, ssh on :${SSH_PORT}"
}

# ---------------------------------------------------------------- apt
install_base() {
  log "installing base packages"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg git ufw jq openssl iproute2 \
    lsb-release python3 make g++ systemd-timesyncd
  systemctl enable --now systemd-timesyncd
  timedatectl set-ntp true
  ok "base packages + timesyncd"
}

# ---------------------------------------------------------------- docker
install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker already present ($(docker --version)) — skipping"
  else
    log "installing Docker Engine (official repo)"
    apt-get remove -y -qq docker.io docker-doc docker-compose podman-docker containerd runc >/dev/null 2>&1 || true
    install -m 0755 -d /etc/apt/keyrings
    # shellcheck disable=SC1091
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
    docker compose version >/dev/null || die "docker compose plugin not functional"
  fi

  if [[ ! -f /etc/docker/daemon.json ]]; then
    log "writing /etc/docker/daemon.json (log rotation)"
    cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
    systemctl restart docker
  fi
  ok "docker $(docker --version --format '{{.Version}}')"
}

# ---------------------------------------------------------------- node
install_node() {
  if command -v node >/dev/null 2>&1 && [[ "$(node -v)" == v22.* ]]; then
    log "Node 22 already present ($(node -v))"
  else
    log "installing Node.js 22 (NodeSource)"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs
    [[ "$(node -v)" == v22.* ]] || die "expected Node 22, got $(node -v)"
  fi
  ok "node $(node -v)"
}

# ---------------------------------------------------------------- code
fetch_code() {
  mkdir -p "${DATA_DIR}"
  if [[ -n ${REPO} ]]; then
    if [[ -d ${SRC_DIR}/.git ]]; then
      log "updating existing checkout at ${SRC_DIR}"
      git -C "${SRC_DIR}" fetch --depth 1 origin "${BRANCH}"
      git -C "${SRC_DIR}" reset --hard "origin/${BRANCH}"
    else
      log "cloning ${REPO} (branch ${BRANCH})"
      git clone --depth 1 --branch "${BRANCH}" "${REPO}" "${SRC_DIR}"
    fi
  elif [[ -n ${SOURCE_DIR} ]]; then
    log "copying source from ${SOURCE_DIR}"
    mkdir -p "${SRC_DIR}"
    cp -a "${SOURCE_DIR}/." "${SRC_DIR}/"
  elif [[ -f "$(dirname "$(readlink -f "$0")")/package.json" ]]; then
    log "using checkout the script was run from"
    rm -rf "${SRC_DIR}"
    cp -a "$(dirname "$(readlink -f "$0")")" "${SRC_DIR}/"
    rm -rf "${SRC_DIR}/.git" "${SRC_DIR}/node_modules" "${SRC_DIR}/data"
  else
    die "no source: pass --repo <url> or --source <dir>, or run from a checkout"
  fi

  id -u "${RUN_USER}" >/dev/null 2>&1 || useradd --system --home "${DATA_DIR}" --shell /usr/sbin/nologin "${RUN_USER}"
  id -nG "${RUN_USER}" | grep -qw docker || usermod -aG docker "${RUN_USER}"
  mkdir -p "${DATA_DIR}"/{data,stack}
  chmod 700 "${DATA_DIR}/data" "${DATA_DIR}/stack"
  chown -R "${RUN_USER}:${RUN_USER}" "${DATA_DIR}"
  ok "source staged at ${SRC_DIR}"
}

# ---------------------------------------------------------------- build
build_app() {
  log "building server + web"
  sudo -u "${RUN_USER}" env HOME="${DATA_DIR}" bash -c "cd '${SRC_DIR}' && npm ci --no-audit --no-fund"
  sudo -u "${RUN_USER}" env HOME="${DATA_DIR}" bash -c "cd '${SRC_DIR}' && npm run build"
  [[ -f "${SRC_DIR}/server/dist/index.js" ]] || die "server build output missing"
  [[ -f "${SRC_DIR}/web/dist/index.html" ]] || die "web build output missing"
  sudo -u "${RUN_USER}" env HOME="${DATA_DIR}" bash -c "cd '${SRC_DIR}' && npm prune --omit=dev"
  ok "build verified (server/dist/index.js + web/dist/index.html)"
}

# ---------------------------------------------------------------- firewall
configure_firewall() {
  log "configuring UFW (ssh first, then web)"
  ufw allow "OpenSSH" >/dev/null
  [[ "${SSH_PORT}" != "22" ]] && ufw allow "${SSH_PORT}/tcp" >/dev/null
  ufw allow 80/tcp  >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow "${GUI_PORT}/tcp" >/dev/null
  ufw allow 41641/udp >/dev/null   # Tailscale
  ufw default deny incoming
  ufw default allow outgoing
  ufw --force enable >/dev/null
  ok "ufw active: ssh(${SSH_PORT}), 80, 443, ${GUI_PORT}, 41641/udp"
  warn "note: Docker-published container ports bypass UFW (iptables DOCKER chain)"
}

# ---------------------------------------------------------------- service
install_service() {
  SETUP_TOKEN="$(openssl rand -hex 24)"
  log "creating systemd service (port ${GUI_PORT})"

  if systemctl list-unit-files | grep -q "^${APP_NAME}.service"; then
    systemctl stop "${APP_NAME}" || true
  fi

  cat > "/etc/systemd/system/${APP_NAME}.service" <<UNIT
[Unit]
Description=Staff Up management GUI
Wants=network-online.target
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_USER}
SupplementaryGroups=docker
WorkingDirectory=${SRC_DIR}
Environment=NODE_ENV=production
Environment=PORT=${GUI_PORT}
Environment=STAFFUP_DATA_DIR=${DATA_DIR}/data
Environment=STAFFUP_STACK_DIR=${STACK_DIR}
Environment=STAFFUP_SETUP_TOKEN=${SETUP_TOKEN}
ExecStart=/usr/bin/node ${SRC_DIR}/server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  chmod 600 "/etc/systemd/system/${APP_NAME}.service"
  systemctl daemon-reload
  systemctl enable --now "${APP_NAME}"
  ok "service enabled"
}

# ---------------------------------------------------------------- health
wait_healthy() {
  log "waiting for GUI to come up"
  local n=0
  while [[ ${n} -lt 30 ]]; do
    if curl -fsS "http://127.0.0.1:${GUI_PORT}/api/auth/status" | grep -q setupComplete; then
      ok "GUI is healthy on :${GUI_PORT}"
      return 0
    fi
    sleep 2
    n=$((n + 1))
  done
  journalctl -u "${APP_NAME}" -n 50 --no-pager || true
  die "GUI failed to become healthy — see logs above"
}

# ---------------------------------------------------------------- summary
summary() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  cat <<EOF

============================================================
  Staff Up management GUI installed

  URL:          http://${ip:-<server-ip>}:${GUI_PORT}
  Setup token:  ${SETUP_TOKEN}

  Next steps:
    1. Open the URL and create the admin password
       (enter the setup token above on first launch).
    2. Configuration -> set your root domain + ACME email,
       then configure accounts for each service.
       (DNS: *.your-domain must point to ${ip:-this server}.)
    3. Deploy -> "Deploy stack" to bring the suite online.

  Security notes:
    - Docker-published ports bypass UFW; once your domain resolves
      and Traefik serves HTTPS, restrict or close port ${GUI_PORT}.
    - GUI credentials and generated secrets live under
      ${DATA_DIR}/data and ${DATA_DIR}/stack (both mode 0700).

  Service:   systemctl {status|restart|stop} ${APP_NAME}
  Logs:      journalctl -u ${APP_NAME} -f
  Install log: ${LOG_FILE}
============================================================
EOF
}

# ---------------------------------------------------------------- main
preflight
install_base
install_docker
install_node
fetch_code
build_app
configure_firewall
install_service
wait_healthy
summary