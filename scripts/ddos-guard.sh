#!/usr/bin/env bash
# MorniHosting – DDoS-Schutz auf dem Rechner (läuft als root, nicht im Panel-Container).
#
#   sudo /opt/mornihosting/scripts/ddos-guard.sh enable    Schutz einschalten
#   sudo /opt/mornihosting/scripts/ddos-guard.sh disable   Schutz ausschalten
#   sudo /opt/mornihosting/scripts/ddos-guard.sh status    Zustand anzeigen (und fürs Panel aufschreiben)
#   sudo /opt/mornihosting/scripts/ddos-guard.sh sync      Wunsch aus dem Panel umsetzen (macht systemd)
#   sudo /opt/mornihosting/scripts/ddos-guard.sh install   systemd-Einheiten einrichten (macht install.sh/update.sh)
#
# Was der Schutz tut: eine eigene iptables-Kette MH-DDOS, eingehängt in DOCKER-USER (Docker leitet
# Verbindungen zu Containern an INPUT vorbei) und in INPUT. Pro Absender-IP werden neue TCP-Verbindungen
# und gleichzeitige Verbindungen begrenzt, UDP-Pakete pro Sekunde gedrosselt und kaputte Pakete verworfen.
# Dazu SYN-Cookies und eine größere Verbindungstabelle. Heimnetz, NetBird und Docker-intern bleiben frei.
# Die Grenzen sind großzügig: eine Familie hinter einer IP merkt davon nichts. Ändern in
# /etc/mornihosting/ddos.conf (Vorlage legt `install` an).
#
# Das Panel schreibt nur seinen Wunsch (ddos/wish.json) und die Ports der Server (ddos/ports.txt) ins
# Datenvolume; dieses Skript liest daraus nur „an/aus“ und Portnummern und schreibt ddos/status.json zurück.
#
# Verfasst mit Claude 🤖

set -Euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
INSTALL_DIR="$(cd "$(dirname "${SCRIPT_PATH}")/.." && pwd)"
CONF_FILE="${MH_DDOS_CONF:-/etc/mornihosting/ddos.conf}"
SYSCTL_FILE="${MH_DDOS_SYSCTL_FILE:-/etc/sysctl.d/90-mornihosting-ddos.conf}"
UNIT_DIR="${MH_DDOS_UNIT_DIR:-/etc/systemd/system}"
LOCK_FILE="${MH_DDOS_LOCK:-/run/mornihosting-ddos.lock}"
VOLUME_NAME="mornihosting-data"
PANEL_UID=1000
CHAIN="MH-DDOS"
TAG="mh-ddos"
PARENTS=(DOCKER-USER INPUT)
MAX_INPUT_BYTES=65536

# Grenzen pro Absender-IP (bei IPv6 pro /64, so groß ist ein Heimanschluss).
TCP_NEW_PER_MINUTE=120     # neue Verbindungen pro Minute (Server-Liste aktualisieren, Einloggen, Panel)
TCP_NEW_BURST=60           # so viele dürfen auf einmal kommen
TCP_MAX_CONNECTIONS=64     # gleichzeitig offen (Minecraft braucht 1 pro Spieler, ein Browser bis zu 6)
UDP_PACKETS_PER_SECOND=4000 # Bedrock/Geyser ~100 und Voice-Chat ~50 Pakete pro Spieler und Sekunde
UDP_BURST=8000
# Diese Ports schützt der Schutz, solange das Panel keine Liste geschrieben hat (Bereiche mit Doppelpunkt).
DEFAULT_TCP_PORTS="25565:25600"
DEFAULT_UDP_PORTS="19132:19200 24454:24500"
# Panel (HTTPS-Gateway 80/443; der Panel-Port kommt aus der .env).
PANEL_TCP_PORTS="80 443"
# Nie begrenzt: lokale Adressen, Heimnetz, Docker-Netze, NetBird (100.64.0.0/10 und Schnittstelle wt0).
TRUSTED_V4="127.0.0.0/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10"
TRUSTED_V6="::1/128 fc00::/7 fe80::/10"
TRUSTED_IFACES="lo wt0"

GN=$'\e[32m'
YW=$'\e[33m'
RD=$'\e[31m'
CL=$'\e[0m'
msg_info() { printf ' %s…%s %s\n' "${YW}" "${CL}" "$1"; }
msg_ok() { printf ' %s✔%s %s\n' "${GN}" "${CL}" "$1"; }
msg_error() { printf ' %s✖%s %s\n' "${RD}" "${CL}" "$1" >&2; }

# MH_DDOS_TEST=1: nur für die Tests mit nachgebautem iptables (ohne root nichts zu holen).
TEST_MODE="${MH_DDOS_TEST:-}"
CONF_OWNER=0
[[ -n "${TEST_MODE}" ]] && CONF_OWNER="${EUID}"

if [[ "${EUID}" -ne 0 && -z "${TEST_MODE}" ]]; then
  msg_error "Bitte als root starten (z. B. mit sudo)."
  exit 1
fi

# Die Konfiguration wird als root ausgeführt: nur laden, wenn sie root gehört und niemand sonst schreiben darf.
if [[ -f "${CONF_FILE}" ]]; then
  read -r conf_owner conf_mode < <(stat -c '%u %a' "${CONF_FILE}")
  if [[ "${conf_owner}" == "${CONF_OWNER}" && $((8#${conf_mode} & 8#022)) -eq 0 ]]; then
    # shellcheck source=/dev/null
    source "${CONF_FILE}"
  else
    msg_error "${CONF_FILE} gehört nicht root oder ist für andere beschreibbar – wird ignoriert."
  fi
fi

for name in TCP_NEW_PER_MINUTE TCP_NEW_BURST TCP_MAX_CONNECTIONS UDP_PACKETS_PER_SECOND UDP_BURST; do
  if [[ ! "${!name}" =~ ^[1-9][0-9]{0,6}$ ]]; then
    msg_error "${name}=${!name} ist keine gültige Zahl."
    exit 1
  fi
done

# Port oder Bereich: "25565" oder "25565:25600".
valid_port_spec() {
  [[ "$1" =~ ^([0-9]{1,5})(:([0-9]{1,5}))?$ ]] || return 1
  local low="${BASH_REMATCH[1]}" high="${BASH_REMATCH[3]:-${BASH_REMATCH[1]}}"
  ((10#${low} >= 1 && 10#${high} <= 65535 && 10#${low} <= 10#${high}))
}

# --- Datenordner im Volume -------------------------------------------------------------------------

DATA_DIR="${MH_DDOS_DIR:-}"
if [[ -z "${DATA_DIR}" ]] && command -v docker >/dev/null 2>&1; then
  VOLUME_DIR="$(docker volume inspect -f '{{ .Mountpoint }}' "${VOLUME_NAME}" 2>/dev/null || true)"
  DATA_DIR="${VOLUME_DIR:+${VOLUME_DIR}/ddos}"
fi

# Liest eine Datei, die das Panel geschrieben hat: keine Verknüpfungen (die könnten auf Dateien von root
# zeigen), höchstens 64 KB.
read_panel_file() {
  local file="${DATA_DIR}/$1"
  [[ -n "${DATA_DIR}" && -f "${file}" && ! -L "${file}" && ! -L "${DATA_DIR}" ]] || return 1
  head -c "${MAX_INPUT_BYTES}" "${file}"
}

# Schreibt eine Datei fürs Panel: erst daneben, dann umbenennen. Eine Verknüpfung, die das Panel dort
# hingelegt hat, wird dabei ersetzt, nicht verfolgt.
write_panel_file() {
  local name="$1" content="$2" tmp
  [[ -n "${DATA_DIR}" && -d "${DATA_DIR}" && ! -L "${DATA_DIR}" ]] || return 0
  tmp="$(mktemp "${DATA_DIR}/.${name}.XXXXXX")" || return 0
  printf '%s\n' "${content}" >"${tmp}"
  chmod 644 "${tmp}"
  chown "${PANEL_UID}:${PANEL_UID}" "${tmp}" 2>/dev/null || true
  mv -fT "${tmp}" "${DATA_DIR}/${name}"
}

wanted() {
  read_panel_file wish.json 2>/dev/null | grep -Eq '"enabled"[[:space:]]*:[[:space:]]*true'
}

write_wish() {
  write_panel_file wish.json "{\"enabled\":$1,\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"by\":\"console\"}"
}

# Ports: die Liste des Panels („tcp 25565“ je Zeile), sonst die Vorgaben. Dazu immer das Panel selbst.
TCP_PORTS=""
UDP_PORTS=""
load_ports() {
  local panel_port proto port listed
  panel_port="$(grep -E '^MH_PANEL_PORT=[0-9]+$' "${INSTALL_DIR}/.env" 2>/dev/null | cut -d= -f2 || true)"
  TCP_PORTS="${PANEL_TCP_PORTS} ${panel_port:-8080}"
  if listed="$(read_panel_file ports.txt 2>/dev/null)"; then
    while read -r proto port _; do
      valid_port_spec "${port:-}" || continue
      [[ "${proto}" == "tcp" ]] && TCP_PORTS+=" ${port}"
      [[ "${proto}" == "udp" ]] && UDP_PORTS+=" ${port}"
    done <<<"${listed}"
  else
    TCP_PORTS+=" ${DEFAULT_TCP_PORTS}"
    UDP_PORTS="${DEFAULT_UDP_PORTS}"
  fi
  TCP_PORTS="$(tr ' ' '\n' <<<"${TCP_PORTS}" | grep -v '^$' | sort -u | tr '\n' ' ')"
  UDP_PORTS="$(tr ' ' '\n' <<<"${UDP_PORTS}" | grep -v '^$' | sort -u | tr '\n' ' ')"
  local spec
  for spec in ${TCP_PORTS} ${UDP_PORTS}; do
    valid_port_spec "${spec}" || {
      msg_error "Ungültiger Port: ${spec}"
      exit 1
    }
  done
}

# --- iptables --------------------------------------------------------------------------------------

FAMILIES=()
find_families() {
  FAMILIES=()
  command -v iptables >/dev/null 2>&1 && FAMILIES+=(iptables)
  # Viele Proxmox-LXC haben kein IPv6: dann gibt es ip6tables zwar, es kann aber nichts.
  if command -v ip6tables >/dev/null 2>&1 && ip6tables -w -L INPUT -n >/dev/null 2>&1; then
    FAMILIES+=(ip6tables)
  fi
}

has_chain() { "$1" -w -L "$2" -n >/dev/null 2>&1; }

# Ein Fingerabdruck der Regeln: Stimmt er, bleibt die Kette samt Zählern stehen.
fingerprint() {
  printf '%s|' "${TCP_NEW_PER_MINUTE}" "${TCP_NEW_BURST}" "${TCP_MAX_CONNECTIONS}" "${UDP_PACKETS_PER_SECOND}" \
    "${UDP_BURST}" "${TCP_PORTS}" "${UDP_PORTS}" "${TRUSTED_V4}" "${TRUSTED_V6}" "${TRUSTED_IFACES}" |
    sha256sum | cut -c1-12
}

build_chain() {
  local fam="$1" mark="$2" mask trusted suffix iface net port
  if [[ "${fam}" == "ip6tables" ]]; then
    mask=64 trusted="${TRUSTED_V6}" suffix=6
  else
    mask=32 trusted="${TRUSTED_V4}" suffix=4
  fi
  local ipt=("${fam}" -w)
  if has_chain "${fam}" "${CHAIN}"; then
    "${ipt[@]}" -F "${CHAIN}"
  else
    "${ipt[@]}" -N "${CHAIN}"
  fi || return 1
  for iface in ${TRUSTED_IFACES}; do
    "${ipt[@]}" -A "${CHAIN}" -i "${iface}" -j RETURN || return 1
  done
  for net in ${trusted}; do
    "${ipt[@]}" -A "${CHAIN}" -s "${net}" -j RETURN || return 1
  done
  "${ipt[@]}" -A "${CHAIN}" -p tcp -m conntrack --ctstate INVALID \
    -m comment --comment "${TAG}:invalid" -j DROP || return 1
  for port in ${TCP_PORTS}; do
    local new_tcp=(-p tcp --syn -m conntrack --ctstate NEW --ctdir ORIGINAL --ctorigdstport "${port}")
    "${ipt[@]}" -A "${CHAIN}" "${new_tcp[@]}" \
      -m connlimit --connlimit-above "${TCP_MAX_CONNECTIONS}" --connlimit-mask "${mask}" \
      -m comment --comment "${TAG}:tcp-conn" -j DROP || return 1
    "${ipt[@]}" -A "${CHAIN}" "${new_tcp[@]}" \
      -m hashlimit --hashlimit-name "mh-tcp${suffix}" --hashlimit-mode srcip --hashlimit-srcmask "${mask}" \
      --hashlimit-above "${TCP_NEW_PER_MINUTE}/minute" --hashlimit-burst "${TCP_NEW_BURST}" \
      -m comment --comment "${TAG}:tcp-rate" -j DROP || return 1
  done
  for port in ${UDP_PORTS}; do
    "${ipt[@]}" -A "${CHAIN}" -p udp -m conntrack --ctdir ORIGINAL --ctorigdstport "${port}" \
      -m hashlimit --hashlimit-name "mh-udp${suffix}" --hashlimit-mode srcip --hashlimit-srcmask "${mask}" \
      --hashlimit-above "${UDP_PACKETS_PER_SECOND}/second" --hashlimit-burst "${UDP_BURST}" \
      -m comment --comment "${TAG}:udp-rate" -j DROP || return 1
  done
  "${ipt[@]}" -A "${CHAIN}" -m comment --comment "${TAG}:v=${mark}" -j RETURN
}

hook_chain() {
  local fam="$1" parent
  for parent in "${PARENTS[@]}"; do
    # DOCKER-USER legt Docker selbst an; fehlt es (Docker startet noch), hängt der nächste Lauf sich ein.
    has_chain "${fam}" "${parent}" || continue
    "${fam}" -w -C "${parent}" -j "${CHAIN}" >/dev/null 2>&1 ||
      "${fam}" -w -I "${parent}" 1 -j "${CHAIN}" || return 1
  done
}

remove_chain() {
  local fam="$1" parent
  for parent in "${PARENTS[@]}"; do
    has_chain "${fam}" "${parent}" || continue
    while "${fam}" -w -D "${parent}" -j "${CHAIN}" >/dev/null 2>&1; do :; done
  done
  if has_chain "${fam}" "${CHAIN}"; then
    "${fam}" -w -F "${CHAIN}" && "${fam}" -w -X "${CHAIN}"
  fi
}

is_active() {
  local fam
  [[ ${#FAMILIES[@]} -gt 0 ]] || return 1
  for fam in "${FAMILIES[@]}"; do
    has_chain "${fam}" "${CHAIN}" || return 1
    "${fam}" -w -C INPUT -j "${CHAIN}" >/dev/null 2>&1 ||
      "${fam}" -w -C DOCKER-USER -j "${CHAIN}" >/dev/null 2>&1 || return 1
  done
}

# Verworfene Pakete einer Regel-Art, über IPv4 und IPv6 zusammengezählt.
dropped() {
  local kind="$1" fam total=0 count
  for fam in "${FAMILIES[@]}"; do
    has_chain "${fam}" "${CHAIN}" || continue
    count="$("${fam}" -w -L "${CHAIN}" -v -x -n 2>/dev/null |
      awk -v tag="/* ${TAG}:${kind} */" 'index($0, tag) { sum += $1 } END { print sum + 0 }')"
    total=$((total + count))
  done
  printf '%s' "${total}"
}

# --- sysctl ----------------------------------------------------------------------------------------

SYSCTLS=(
  "net.ipv4.tcp_syncookies=1"       # SYN-Flut: Verbindungen ohne Warteschlange annehmen
  "net.ipv4.tcp_max_syn_backlog=4096"
  "net.ipv4.tcp_synack_retries=3"   # halb offene Verbindungen schneller vergessen
  "net.netfilter.nf_conntrack_max=131072" # mehr Platz in der Verbindungstabelle
)
SYSCTL_OK=true

apply_sysctls() {
  local entry key value current
  SYSCTL_OK=true
  mkdir -p "$(dirname "${SYSCTL_FILE}")"
  {
    printf '# MorniHosting DDoS-Schutz (ddos-guard.sh). Wird beim Ausschalten entfernt.\n'
    printf '%s\n' "${SYSCTLS[@]}"
  } >"${SYSCTL_FILE}"
  for entry in "${SYSCTLS[@]}"; do
    key="${entry%%=*}" value="${entry#*=}"
    current="$(sysctl -n "${key}" 2>/dev/null || true)"
    # Nur anheben: Ist die Verbindungstabelle schon größer, bleibt sie so.
    if [[ "${key}" == *conntrack_max && "${current}" =~ ^[0-9]+$ ]] && ((current >= value)); then
      continue
    fi
    # Im Proxmox-LXC sind manche Werte Sache des Hosts; dann bleibt es bei den Firewall-Regeln.
    sysctl -q -w "${entry}" >/dev/null 2>&1 || SYSCTL_OK=false
  done
}

# --- Ein- und Ausschalten --------------------------------------------------------------------------

ERROR="null"

enable_guard() {
  local fam mark
  ERROR="null"
  if [[ ${#FAMILIES[@]} -eq 0 ]]; then
    ERROR='"iptables_missing"'
    return 1
  fi
  mark="$(fingerprint)"
  for fam in "${FAMILIES[@]}"; do
    if ! "${fam}" -w -S "${CHAIN}" 2>/dev/null | grep -qF -- "${TAG}:v=${mark}"; then
      if ! build_chain "${fam}" "${mark}"; then
        # Halbe Regeln sind schlimmer als keine: alles wieder weg.
        remove_chain "${fam}"
        ERROR='"rules_failed"'
        msg_error "Regeln für ${fam} ließen sich nicht setzen (fehlt ein Kernel-Modul wie xt_hashlimit?)."
        return 1
      fi
    fi
    hook_chain "${fam}" || {
      ERROR='"rules_failed"'
      return 1
    }
  done
  apply_sysctls
}

disable_guard() {
  local fam
  ERROR="null"
  for fam in "${FAMILIES[@]}"; do
    remove_chain "${fam}"
  done
  # Die laufenden Werte bleiben bis zum Neustart (SYN-Cookies sind ohnehin Linux-Standard).
  rm -f "${SYSCTL_FILE}"
}

# --- Status ----------------------------------------------------------------------------------------

json_list() {
  local item out="" sep=""
  for item in $1; do
    out+="${sep}\"${item}\""
    sep=","
  done
  printf '[%s]' "${out}"
}

write_status() {
  local active=false want=false ipv4=false ipv6=false docker=false fam
  is_active && active=true
  wanted && want=true
  for fam in "${FAMILIES[@]}"; do
    [[ "${fam}" == "iptables" ]] && ipv4=true
    [[ "${fam}" == "ip6tables" ]] && ipv6=true
    has_chain "${fam}" DOCKER-USER && docker=true
  done
  local status
  status="$(printf '{"active":%s,"wanted":%s,"ipv4":%s,"ipv6":%s,"docker":%s,"sysctl":%s,' \
    "${active}" "${want}" "${ipv4}" "${ipv6}" "${docker}" "${SYSCTL_OK}")"
  status+="$(printf '"tcpPorts":%s,"udpPorts":%s,' "$(json_list "${TCP_PORTS}")" "$(json_list "${UDP_PORTS}")")"
  status+="$(printf '"limits":{"tcpNewPerMinute":%s,"tcpBurst":%s,"tcpConnections":%s,"udpPacketsPerSecond":%s,"udpBurst":%s},' \
    "${TCP_NEW_PER_MINUTE}" "${TCP_NEW_BURST}" "${TCP_MAX_CONNECTIONS}" "${UDP_PACKETS_PER_SECOND}" "${UDP_BURST}")"
  status+="$(printf '"dropped":{"tcpRate":%s,"tcpConnections":%s,"udpRate":%s,"invalid":%s},' \
    "$(dropped tcp-rate)" "$(dropped tcp-conn)" "$(dropped udp-rate)" "$(dropped invalid)")"
  status+="$(printf '"error":%s,"at":"%s"}' "${ERROR}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
  write_panel_file status.json "${status}"
}

print_status() {
  if is_active; then
    msg_ok "DDoS-Schutz ist an (${FAMILIES[*]})."
  else
    msg_info "DDoS-Schutz ist aus."
  fi
  printf '   TCP-Ports: %s\n   UDP-Ports: %s\n' "${TCP_PORTS:-–}" "${UDP_PORTS:-–}"
  printf '   Verworfen: %s (zu viele neue Verbindungen), %s (zu viele gleichzeitig), %s (UDP-Flut), %s (kaputt)\n' \
    "$(dropped tcp-rate)" "$(dropped tcp-conn)" "$(dropped udp-rate)" "$(dropped invalid)"
}

# --- systemd ---------------------------------------------------------------------------------------

install_units() {
  [[ -n "${DATA_DIR}" ]] || {
    msg_error "Datenvolume ${VOLUME_NAME} nicht gefunden – läuft das Panel?"
    exit 1
  }
  mkdir -p "${DATA_DIR}"
  chown "${PANEL_UID}:${PANEL_UID}" "${DATA_DIR}"
  write_panel_file agent.json "{\"installedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"script\":\"${SCRIPT_PATH}\"}"

  mkdir -p "${UNIT_DIR}"
  if [[ ! -e "${CONF_FILE}" ]]; then
    mkdir -p "$(dirname "${CONF_FILE}")"
    {
      printf '# MorniHosting DDoS-Schutz: eigene Grenzen (Zeilen ohne # gelten). Danach: ddos-guard.sh sync\n'
      printf '#TCP_NEW_PER_MINUTE=%s\n#TCP_NEW_BURST=%s\n#TCP_MAX_CONNECTIONS=%s\n' \
        "${TCP_NEW_PER_MINUTE}" "${TCP_NEW_BURST}" "${TCP_MAX_CONNECTIONS}"
      printf '#UDP_PACKETS_PER_SECOND=%s\n#UDP_BURST=%s\n' "${UDP_PACKETS_PER_SECOND}" "${UDP_BURST}"
      printf '#TRUSTED_V4="%s"\n#TRUSTED_V6="%s"\n#TRUSTED_IFACES="%s"\n' \
        "${TRUSTED_V4}" "${TRUSTED_V6}" "${TRUSTED_IFACES}"
    } >"${CONF_FILE}"
    chmod 644 "${CONF_FILE}"
  fi

  cat >"${UNIT_DIR}/mornihosting-ddos.path" <<UNIT
[Unit]
Description=MorniHosting: DDoS-Schutz anpassen, wenn das Panel es wünscht

[Path]
PathChanged=${DATA_DIR}/wish.json
PathChanged=${DATA_DIR}/ports.txt
Unit=mornihosting-ddos.service

[Install]
WantedBy=multi-user.target
UNIT

  cat >"${UNIT_DIR}/mornihosting-ddos.service" <<UNIT
[Unit]
Description=MorniHosting: DDoS-Schutz abgleichen
After=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=${SCRIPT_PATH} sync
UNIT

  # Jede Minute: Zähler fürs Panel, und nach einem Neustart (Regeln weg) oder Docker-Start wieder einhängen.
  cat >"${UNIT_DIR}/mornihosting-ddos.timer" <<UNIT
[Unit]
Description=MorniHosting: DDoS-Schutz prüfen

[Timer]
OnBootSec=20s
OnUnitActiveSec=1min
Unit=mornihosting-ddos.service

[Install]
WantedBy=timers.target
UNIT

  if command -v systemctl >/dev/null 2>&1; then
    if ! systemctl daemon-reload ||
      ! systemctl enable --now mornihosting-ddos.path mornihosting-ddos.timer >/dev/null 2>&1; then
      msg_error "systemd-Einheiten ließen sich nicht starten."
      exit 1
    fi
  fi
  msg_ok "DDoS-Schutz eingerichtet (an/aus im Panel: Admin-Bereich → DDoS-Schutz)"
}

# Den Wunsch des Panels umsetzen und den Status zurückschreiben.
sync_now() {
  local result=0
  if wanted; then
    enable_guard || result=$?
  elif is_active || [[ -f "${SYSCTL_FILE}" ]]; then
    disable_guard
  fi
  write_status
  return "${result}"
}

# --- Ablauf ----------------------------------------------------------------------------------------

COMMAND="${1:-status}"

if command -v flock >/dev/null 2>&1; then
  exec 9>"${LOCK_FILE}"
  flock -w 30 9 || {
    msg_error "Ein anderer Lauf hängt."
    exit 1
  }
fi

find_families
load_ports

case "${COMMAND}" in
  enable)
    write_wish true
    enable_guard && msg_ok "DDoS-Schutz ist an."
    result=$?
    write_status
    exit "${result}"
    ;;
  disable)
    write_wish false
    disable_guard
    write_status
    msg_ok "DDoS-Schutz ist aus."
    ;;
  sync)
    sync_now
    exit $?
    ;;
  status)
    write_status
    print_status
    ;;
  install)
    install_units
    # Gleich einmal abgleichen: Status fürs Panel, und ein schon gewünschter Schutz gilt sofort.
    sync_now || true
    ;;
  *)
    msg_error "Unbekannter Befehl: ${COMMAND} (enable, disable, status, sync, install)"
    exit 2
    ;;
esac
