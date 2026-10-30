#!/bin/sh
# Startet einen Hytale-Server im Ordner /data.
# 1. Eine feste machine-id im Server-Ordner: Hytale verschlüsselt die gespeicherte Anmeldung damit.
# 2. Fehlen die Server-Dateien (oder HYTALE_UPDATE=true), lädt sie der offizielle Downloader.
#    Beim ersten Mal zeigt er einen Anmelde-Link für das Hytale-Konto in der Konsole.
# 3. Java läuft als Hauptprozess mit offener Eingabe: Befehle aus dem Panel kommen über stdin an.
#
# Verfasst mit Claude 🤖
set -eu
cd /data

DOWNLOADER_URL="https://downloader.hytale.com/hytale-downloader.zip"
TOOLS=.downloader

if [ ! -s .machine-id ]; then
  tr -d '-' < /proc/sys/kernel/random/uuid > .machine-id
fi

if [ ! -f Server/HytaleServer.jar ] || [ "${HYTALE_UPDATE}" = "true" ]; then
  if [ ! -x "$TOOLS/hytale-downloader-linux-amd64" ]; then
    echo "[MorniHosting] Lade den offiziellen Hytale-Downloader ..."
    mkdir -p "$TOOLS"
    curl -fsSL --proto '=https' -o "$TOOLS/downloader.zip" "$DOWNLOADER_URL"
    unzip -oq "$TOOLS/downloader.zip" -d "$TOOLS"
    chmod +x "$TOOLS/hytale-downloader-linux-amd64"
  fi
  echo "[MorniHosting] Lade die Hytale-Server-Dateien. Beim ersten Mal: Link unten öffnen und mit deinem Hytale-Konto anmelden."
  "$TOOLS/hytale-downloader-linux-amd64" -download-path game.zip -skip-update-check
  unzip -oq game.zip -d .
  rm -f game.zip
fi

echo "[MorniHosting] Starte Hytale auf UDP-Port ${HYTALE_PORT} mit ${MEMORY} Arbeitsspeicher."
exec java "-Xms${MEMORY}" "-Xmx${MEMORY}" -jar Server/HytaleServer.jar \
  --assets Assets.zip --bind "0.0.0.0:${HYTALE_PORT}"
