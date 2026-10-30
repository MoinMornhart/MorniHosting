# Weitere Spiele

Neben Minecraft hostet MorniHosting sechs weitere Spiele. Du bestellst sie genauso: unter **Server erstellen**
das Spiel wählen, Paket und Version auswählen, Namen vergeben, fertig. Konsole, Dateien, Backups, Zeitpläne
und die Adresse `name.mornihosting.de` funktionieren wie bei Minecraft.

| Spiel | Image | Ports | Konsole im Panel | RAM (empfohlen) |
|---|---|---|---|---|
| Factorio | `factoriotools/factorio:stable` / `latest` | 34197/UDP | ja (RCON) | 3 GB |
| Counter-Strike 2 | `joedwards32/cs2` | 27015/UDP | ja (RCON) | 3 GB |
| Garry's Mod | `ceifa/garrysmod` | 27015/UDP | ja (RCON) | 2 GB |
| Satisfactory | `wolveix/satisfactory-server` | 7777/UDP+TCP, 8888/TCP | nein (im Spiel) | 12 GB |
| Euro Truck Simulator 2 | `gameservermanagers/gameserver:ets2` (LinuxGSM) | 27015/UDP, 27016/UDP | nein | 2 GB |
| Hytale | `ghcr.io/pmornhart/mornihosting-hytale` (eigenes Rezept) | 5520/UDP | ja (Eingabe) | 6 GB |

Im Router gibst du die Ports aus der Tabelle frei (bei mehreren Servern desselben Spiels die Ports, die
im Kopf der Server-Seite stehen). Mit eigener Domain legt das Panel nur einen A-Eintrag an; einen SRV-Eintrag
gibt es nur bei Minecraft Java. Liegt der Port nicht auf dem Standard, gehört er mit zur Adresse
(`name.mornihosting.de:27016`).

## Die Spiele im Einzelnen

**Factorio** – Mods und öffentliche Server-Liste brauchen deinen Factorio-Benutzernamen und den Token aus
deinem Factorio-Profil (factorio.com → Profil). Beides ist freiwillig. „Space Age“ ist an; ausschalten,
wenn nicht alle die Erweiterung haben. Befehle in der Konsole mit `/`, z. B. `/players online`.

**Counter-Strike 2** – Ohne Steam-Token (GSLT) können Freunde über die Adresse beitreten. Für die öffentliche
Server-Liste einen Token unter <https://steamcommunity.com/dev/managegameservers> mit App-ID **730** anlegen.
Beim ersten Start lädt der Server etwa 60 GB von Steam.

**Garry's Mod** – Addons kommen am einfachsten über eine Steam-Workshop-Sammlung: Nummer der Sammlung
eintragen und einen Steam-Web-API-Schlüssel (<https://steamcommunity.com/dev/apikey>). Gespeichert werden
`data/` und `addons/` im Server-Ordner; das Spiel selbst steckt im Image.

**Satisfactory** – Hat keine Konsole für das Panel. Nach dem ersten Start im Spiel unter **Server Manager**
die Adresse eintragen, Server übernehmen, Namen und Admin-Passwort setzen. Das Image startet nicht auf
virtuellen CPUs namens „QEMU“/„Common KVM processor“: bei **Proxmox** den CPU-Typ der VM auf `host` stellen.

**Euro Truck Simulator 2** – Der Server braucht `server_packages.sii` und `server_packages.dat` aus dem Spiel.
Das Panel zeigt eine Anleitung und lädt beide Dateien in den richtigen Ordner; ohne sie startet der Server
nicht. Name, Passwort, Spielerzahl, Willkommensnachricht, Token und Ports schreibt das Panel vor jedem Start
in `server_config.sii` (andere Zeilen bleiben, wie du sie eingestellt hast).

**Hytale** – Es gibt noch kein großes, gepflegtes Image. Die vorhandenen (kraoc, lovelesscx, mbround18 …)
sind kleine Hobby-Projekte, teils als root oder ohne Konsole. Deshalb liegt in `images/hytale/` ein eigenes,
schlankes Rezept: Java 25 (eclipse-temurin) und ein Startskript. Die Server-Dateien lädt beim Start der
**offizielle** Hytale-Downloader (`downloader.hytale.com`); dafür erscheint beim ersten Mal ein Anmelde-Link in
der Konsole. Danach in der Konsole `/auth login device` eingeben und den Server mit dem Hytale-Konto anmelden.
`install.sh` und `update.sh` bauen das Image auf dem Rechner, CI veröffentlicht es bei Versions-Tags.
Der Downloader hat keine veröffentlichte Prüfsumme; er kommt per HTTPS direkt von Hytale.

## Sicherheit

- Das Panel startet nur Images aus dem Katalog (`packages/shared/src/games.ts`, `allowedGameImages`).
- RCON ist nie nach außen freigegeben; das Panel spricht es im internen Docker-Netz an. Das Passwort ist
  zufällig und verschlüsselt gespeichert.
- Tokens, Passwörter und Schlüssel werden verschlüsselt gespeichert und nie wieder angezeigt.
- Eingaben werden geprüft (nur Felder des Spiels, keine Sonderzeichen, Startargumente ohne Leerzeichen).
- Ordner im Container sind nur Unterordner des Server-Ordners.

## Was getestet ist

Alles mit dem simulierten Docker (Vitest, Playwright, Demo). Mit echtem Docker gebaut ist nur das
Hytale-Image; gestartet wurde keines der Spiele. Die Erkennung „Server läuft“ und Beitritte stützt sich auf
die Log-Zeilen der Images (Factorio, Source-Spiele, Satisfactory, Hytale aus Doku und Quelltext; bei ETS2
nimmt das Panel LinuxGSMs Meldung „Starting ets2server … OK“). Passt eine Zeile in Wirklichkeit nicht,
bleibt der Server auf „Startet“, funktioniert aber trotzdem.

Verfasst mit Claude 🤖
