#!/usr/bin/env bash
# MorniHosting aktualisieren: neuen Code holen, neues Image laden (oder bauen), Panel neu starten.
# Die Minecraft-Server laufen dabei weiter; sie sind eigene Container.
#
#   update                              (nach install.sh, z. B. im Proxmox-Container)
#   sudo /opt/mornihosting/update.sh    (gleiche Wirkung)
#
# Der Update-Knopf im Panel legt die Datei update/request.json in den Datenordner;
# die systemd-Einheit mornihosting-update.path startet dann dieses Skript.
#
# Verfasst mit Claude 🤖

set -Eeuo pipefail

INSTALL_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
VOLUME_NAME="mornihosting-data"
PANEL_UID=1000

GN=$'\e[32m'
YW=$'\e[33m'
RD=$'\e[31m'
CL=$'\e[0m'

msg_info() { printf ' %s…%s %s\n' "${YW}" "${CL}" "$1"; }
msg_ok() { printf ' %s✔%s %s\n' "${GN}" "${CL}" "$1"; }
msg_error() { printf ' %s✖%s %s\n' "${RD}" "${CL}" "$1" >&2; }

if [[ "${EUID}" -ne 0 ]]; then
  msg_error "Bitte als root starten (z. B. mit sudo)."
  exit 1
fi

VOLUME_DIR="$(docker volume inspect -f '{{ .Mountpoint }}' "${VOLUME_NAME}" 2>/dev/null || true)"
STATUS_FILE="${VOLUME_DIR:+${VOLUME_DIR}/update/status.json}"

write_status() {
  [[ -n "${STATUS_FILE}" ]] || return 0
  mkdir -p "$(dirname "${STATUS_FILE}")"
  printf '{"state":"%s","at":"%s"}\n' "$1" "$(date -Iseconds)" >"${STATUS_FILE}"
  chown "${PANEL_UID}:${PANEL_UID}" "${STATUS_FILE}" 2>/dev/null || true
}

# The request file must go first: while it exists, systemd would start this script again and again.
if [[ -n "${VOLUME_DIR}" ]]; then
  rm -f "${VOLUME_DIR}/update/request.json"
fi

trap 'write_status "failed"; msg_error "Update fehlgeschlagen in Zeile ${LINENO}. Das Panel läuft in der alten Version weiter."' ERR
write_status "running"
cd "${INSTALL_DIR}"

if [[ -d .git ]]; then
  msg_info "Neuer Code wird geholt"
  git pull --ff-only --quiet
  msg_ok "Code aktuell ($(git describe --tags --always 2>/dev/null || echo dev))"
fi

msg_info "Neues Panel-Image wird geladen"
if docker compose pull --quiet panel 2>/dev/null; then
  docker compose up -d --quiet-pull >/dev/null
else
  MH_BUILD_VERSION="$(git describe --tags --always 2>/dev/null || echo dev)" docker compose up -d --build >/dev/null
fi
msg_ok "Panel neu gestartet"

docker image prune -f >/dev/null 2>&1 || true
write_status "done"
msg_ok "Fertig. Deine Minecraft-Server sind die ganze Zeit weitergelaufen."
