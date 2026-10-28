#!/usr/bin/env bash
# MorniHosting – Proxmox-Quick-Start (Stil der community-scripts.org).
# Auf dem Proxmox-Host in der Shell ausführen:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/MoinMornhart/MorniHosting/main/proxmox/mornihosting.sh)"
#
# Legt einen Debian-12-LXC-Container an (unprivilegiert, Nesting für Docker), installiert darin
# MorniHosting mit install.sh und zeigt am Ende die Adresse des Panels.
# Alle Werte lassen sich vorher per Umgebungsvariable setzen, z. B. RAM=12288 CORES=6.
#
# Verfasst mit Claude 🤖

set -Eeuo pipefail

APP="MorniHosting"
INSTALL_URL="${MH_INSTALL_URL:-https://raw.githubusercontent.com/MoinMornhart/MorniHosting/main/install.sh}"

GN=$'\e[32m'
YW=$'\e[33m'
RD=$'\e[31m'
BL=$'\e[36m'
CL=$'\e[0m'

msg_info() { printf ' %s…%s %s\n' "${YW}" "${CL}" "$1"; }
msg_ok() { printf ' %s✔%s %s\n' "${GN}" "${CL}" "$1"; }
msg_error() { printf ' %s✖%s %s\n' "${RD}" "${CL}" "$1" >&2; }

trap 'msg_error "Abgebrochen in Zeile ${LINENO}."' ERR

if ! command -v pct >/dev/null 2>&1 || ! command -v pveversion >/dev/null 2>&1; then
  msg_error "Dieses Skript läuft nur auf einem Proxmox-VE-Host."
  exit 1
fi
if [[ "${EUID}" -ne 0 ]]; then
  msg_error "Bitte als root starten."
  exit 1
fi

default_storage() {
  pvesm status -content rootdir 2>/dev/null | awk 'NR > 1 && $3 == "active" { print $1; exit }'
}

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
CT_HOSTNAME="${CT_HOSTNAME:-mornihosting}"
CORES="${CORES:-4}"
RAM="${RAM:-8192}"
DISK="${DISK:-32}"
STORAGE="${STORAGE:-$(default_storage)}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"

ask() {
  local title="$1" text="$2" value="$3"
  if command -v whiptail >/dev/null 2>&1; then
    whiptail --backtitle "${APP}" --title "${title}" --inputbox "${text}" 10 64 "${value}" 3>&1 1>&2 2>&3
  else
    read -r -p " ${text} [${value}]: " answer
    printf '%s' "${answer:-${value}}"
  fi
}

printf '\n %s%s%s – Minecraft-Server-Panel als Proxmox-Container\n\n' "${BL}" "${APP}" "${CL}"
SUMMARY="Container-ID: ${CTID}\nName: ${CT_HOSTNAME}\nCPU-Kerne: ${CORES}\nRAM: ${RAM} MB\nFestplatte: ${DISK} GB auf ${STORAGE}\nNetz: ${BRIDGE} (DHCP)"
if command -v whiptail >/dev/null 2>&1; then
  if ! whiptail --backtitle "${APP}" --title "Einstellungen" --yesno \
    "Mit diesen Werten anlegen?\n\n${SUMMARY}\n\nMit Nein kannst du die Werte ändern." 18 64; then
    CTID="$(ask "Container-ID" "Freie Container-ID" "${CTID}")"
    CT_HOSTNAME="$(ask "Name" "Hostname des Containers" "${CT_HOSTNAME}")"
    CORES="$(ask "CPU" "CPU-Kerne" "${CORES}")"
    RAM="$(ask "Arbeitsspeicher" "RAM in MB (Panel + alle Minecraft-Server)" "${RAM}")"
    DISK="$(ask "Festplatte" "Größe in GB (Welten und Backups)" "${DISK}")"
    STORAGE="$(ask "Speicher" "Proxmox-Speicher für den Container" "${STORAGE}")"
    BRIDGE="$(ask "Netzwerk" "Netzwerk-Bridge" "${BRIDGE}")"
  fi
else
  printf "%b\n\n" "${SUMMARY}"
fi

if [[ -z "${STORAGE}" ]]; then
  msg_error "Kein Speicher für Container gefunden. Setze STORAGE=… und starte neu."
  exit 1
fi

msg_info "Debian-12-Vorlage wird gesucht"
pveam update >/dev/null
TEMPLATE="$(pveam available --section system | awk '/debian-12-standard/ { print $2 }' | sort -V | tail -n 1)"
if [[ -z "${TEMPLATE}" ]]; then
  msg_error "Keine Debian-12-Vorlage gefunden."
  exit 1
fi
if ! pveam list "${TEMPLATE_STORAGE}" | grep -q "${TEMPLATE}"; then
  pveam download "${TEMPLATE_STORAGE}" "${TEMPLATE}" >/dev/null
fi
msg_ok "Vorlage ${TEMPLATE}"

msg_info "Container ${CTID} wird angelegt"
pct create "${CTID}" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "${CT_HOSTNAME}" \
  --cores "${CORES}" \
  --memory "${RAM}" \
  --swap 1024 \
  --rootfs "${STORAGE}:${DISK}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --onboot 1 \
  --tags "minecraft;mornihosting" \
  --description "MorniHosting – Minecraft-Server-Panel. Update im Container: update" >/dev/null
pct start "${CTID}"
msg_ok "Container ${CTID} läuft"

msg_info "Warte auf das Netzwerk"
IP=""
for _ in $(seq 1 60); do
  IP="$(pct exec "${CTID}" -- hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "${IP}" ]] && pct exec "${CTID}" -- getent hosts github.com >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if [[ -z "${IP}" ]]; then
  msg_error "Der Container hat keine IP bekommen. Prüfe DHCP auf ${BRIDGE}."
  exit 1
fi
msg_ok "Container-IP: ${IP}"

msg_info "MorniHosting wird im Container installiert (ein paar Minuten)"
pct exec "${CTID}" -- bash -c "apt-get update -qq && apt-get install -y -qq curl >/dev/null && bash -c \"\$(curl -fsSL ${INSTALL_URL})\""
msg_ok "Installation abgeschlossen"

printf '\n %s🎉 %s ist bereit:%s %shttp://%s:8080%s\n' "${GN}" "${APP}" "${CL}" "${BL}" "${IP}" "${CL}"
printf '    Update später im Container: %spct enter %s%s und dann %supdate%s\n\n' "${YW}" "${CTID}" "${CL}" "${YW}" "${CL}"
