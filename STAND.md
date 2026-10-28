# Stand – MorniHosting

**Ziel:** Selbst gehostetes Web-Panel für Minecraft-Server (Funktionsumfang wie Crafty Controller 4, Bedienung wie GGServers/Nodecraft).

## Entscheidungen (27.10.2026)

- Name: **MorniHosting** (Panel und Repo), Design **A · Smaragd** (docs/mockups/)
- Repo: `MoinMornhart/MorniHosting`, **öffentlich** → Chat-Sicherung aus
- Update-Funktion: **ja** · Hinweis „Verfasst mit Claude 🤖“: **ja** · Proxmox-Quick-Start: **ja**
- Arbeitsweise: alle 7 Phasen am Stück, nach jeder Phase Tests, Fortschrittsseite, Push
- Entwicklungs-Branch: `claude/gallant-clarke-bipv7b`

## Architektur (kurz)

- `apps/server`: Fastify 5 + Zod (fastify-type-provider-zod), SQLite/Drizzle, Argon2, Sitzungen + CSRF, WebSocket `/api/ws`.
  Docker über `DockerDriver` (echt: dockerode → tecnativa Socket-Proxy; `fake`: Simulation für Tests/Demo, `MH_DEMO=true`).
  Jeder Minecraft-Server = Container `mh-<id>` aus itzg-Images im Netz `mornihosting-mc`, Befehle per RCON (Java), `send-command` (Bedrock), stdin (Velocity).
- `apps/web`: React 19, Vite, Tailwind 4, Radix, TanStack Query, i18next (de/en).
- `packages/shared`: Typen, Zod-Schemas, Software-Katalog, Zeitplan → Cron.
- Code-Regeln: ts-patterns-Plugin (keine magischen Zahlen, keine Schleifen/switch, Regex mit Beispiel + Link).

## Stand

- Phase 1 fertig: Compose + Socket-Proxy (getestet mit echtem Docker), Auth, Setup, Dashboard live, 61 Vitest-Tests.
- Phase 2 fertig: Server-Assistent (Live-Versionen), Import per ZIP (Erkennung, Zip-Slip-Schutz), Server-Seite (Status, IP-Karte, Kennzahlen, Verlauf), Live-Konsole (xterm, Verlauf, Tab), Absturz-Helfer. 69 Tests.
- Phase 3 fertig: Datei-Manager (Baum, Drag & Drop, CodeMirror-Editor, ZIP, Papierkorb 7 Tage unter `data/trash/`), server.properties als Formular mit Erklärungen (Feld-Liste in `packages/shared/src/properties.ts`, Texte unter `props.*` in i18n) und MOTD-Vorschau, Spieler (online per RCON, offline über die JSON-Dateien, UUID von Mojang), Welten (Upload, Wechsel, Neu mit Seed), Server-Bild (64×64, wird im Browser zugeschnitten), Server löschen. 93 Tests.
- Phase 4 fertig: Marktplatz (`apps/server/src/market/`): Modrinth, Hangar, Spiget, CurseForge (Schlüssel in den Panel-Einstellungen). Downloads nur über HTTPS von erlaubten Hosts (`market/download.ts`, jede Weiterleitung geprüft), Prüfsumme wenn vorhanden, Größenlimit. Abhängigkeiten automatisch, gleiches Plugin aus zwei Quellen wird abgelehnt. Updates nur bei wirklich neuerer Version; unbekannte .jar werden per sha1 bei Modrinth erkannt. An/Aus = `.jar.disabled`. 105 Tests.
- Phase 5 fertig: Backups (`apps/server/src/backups/`, ZIP unter `data/backups/<id>/`, vorher `save-off`/`save-all flush`, Retention, Wiederherstellen legt ein Sicherheits-Backup an), Zeitpläne (`schedules/`, croner nur für die nächste Zeit, eigener Timer mit Vorwarnung im Chat), Webhooks (`webhooks/`, URL verschlüsselt, Host passend zum Dienst, `lib/net-guard.ts` blockt private Adressen). Fehler behoben: Beim Neustart wurde das Ende des alten Containers als Absturz des neuen gewertet. 126 Tests.
- Phase 6 fertig: Benutzer/Rollen/Zugriff (`users/routes.ts`, letzter Admin geschützt, Sperren beendet Sitzungen), API-Schlüssel (`auth/token-routes.ts`, nur Hash gespeichert, Schlüssel kann keine Schlüssel erzeugen), Protokoll (`audit/routes.ts`, Texte unter `audit.actions.*`), Panel-Einstellungen (`settings/routes.ts`), Konto mit 2FA (Seiten in `apps/web/src/features/admin/`). 132 Tests.
- Phase 7 fertig: Geyser/Floodgate (`geyser/`, Geyser von Modrinth, Floodgate für Paper/Velocity von download.geysermc.org mit sha256, UDP-Port ab 19132), TPS im Verlauf, Update-Funktion (`system/update.ts`: GitHub-Release prüfen; Knopf legt `data/update/request.json` an, systemd-Path-Unit aus `install.sh` startet `update.sh`; Builds ohne Release-Version („dev“, Commit) nehmen jedes Release), Rettungsbefehle `node /app/server/dist/cli.js list-users|reset-password|reset-2fa`, `install.sh`, `update.sh`, `proxmox/mornihosting.sh`, `docs/proxmox-quickstart.md`, `.github/workflows/ci.yml` (Lint, Format, Typen, Vitest, Build, Playwright; Image nach GHCR bei `v*`-Tags, amd64+arm64), Playwright (`e2e/`, Port 8199, Fake-Driver), README mit Bildern (`docs/screenshots/`) und FAQ, LICENSE (MIT). 139 Tests + 3 Playwright-Abläufe.
- Mit echtem Docker getestet: Erststart wie `install.sh`, Updater-Teil (agent.json → `canSelfUpdate`), `update.sh` tauscht den Panel-Container, Status „done“, Rettungsbefehl im Container. Nicht getestet: Proxmox-Skript auf echtem Proxmox-Host, systemd-Path-Unit (Sandbox ohne systemd).
- Fehler behoben: Volume heißt `mornihosting-data` (nicht `mornihosting_mornihosting-data`) – `install.sh` wäre sonst beim Updater abgebrochen.
- Phase 8 fertig (auf Philips Wunsch, 28.10.): Passkeys (`auth/passkeys.ts`, `auth/passkey-routes.ts`, Tabelle `passkeys`, @simplewebauthn v14; Passkeys nur über HTTPS/localhost und, sobald im Admin-Bereich eine Panel-Domain steht, nur über diese Domain; Passkey-Login überspringt 2FA), Admin-Bereich (`PanelSettingsPage.tsx`: Domain `panelDomain`, Updates, Passwörter zurücksetzen über `POST /api/users/:id/reset-password`, Einstellungen), Demo-Website (`apps/web/src/demo/`: echte Oberfläche + nachgebauter Server im Browser aus aufgezeichneten Antworten, `pnpm --filter @mornihosting/web build:demo` → eine HTML-Datei; Login `philip`/`minecraft1` oder simulierter Passkey; Artefakt https://claude.ai/artifact/DGaWzgEdpEztT9inVZz9KD, privat), README mit Titelbild, Animation und Bildern. Fehler behoben: Laufzeit „Seit -1 Tag“ direkt nach dem Start. 147 Tests + 4 Playwright-Abläufe (inkl. Passkey mit virtuellem Authenticator).
- Phase 9 fertig (auf Philips Wunsch, 28.10.): Reiter „NetBird“ im Admin-Bereich (`apps/web/src/features/admin/NetBirdGuide.tsx`, Texte `netbird.*`): eigene Domain bei NetBird (CNAME `*.<domain>` → `eu.proxy.netbird.io`), HTTP-Service fürs Panel mit „Pass Host Header“, TCP/UDP-Services je Server mit echten Ports, Anleitung auch in `docs/netbird.md`. Hinter NetBird gilt die eingetragene Panel-Domain als HTTPS (`auth/hook.ts`: `onPanelDomain`, `servedOverHttps`, `originAllowed`), da NetBird kein X-Forwarded-Proto dokumentiert. Öffentlicher Port pro Server (`publicPort`, für Tunnel mit anderem Außen-Port; Adresse und Erreichbarkeit nutzen ihn nur mit Domain). Simple Voice Chat mit einem Schalter (`apps/server/src/voicechat/`, `PUT /api/servers/:id/voicechat`): Plugin/Mod von Modrinth (`9eGKb6K1`), eigener UDP-Port ab 24454 (im Container immer 24454), `voicechat-server.properties` mit `port` und `voice_host`, vor jedem Start neu geschrieben (`servers.onBeforeStart`). Paper, Purpur, Fabric, Forge, NeoForge, eigene Jar. Migration `0002_ports_voicechat.sql`. Demo kann Voice-Chat, Geyser und öffentlichen Port. 155 Tests.
- Demo-Daten neu aufnehmen: Dev-Server mit `MH_DEMO=true` starten, Aufnahme-Skript klickt alles durch und schreibt `apps/web/src/demo/fixtures.json` (Plugin-Bilder eingebettet, öffentliche IP ersetzt durch 203.0.113.25).

## Lokal testen (Sandbox)

- Backend simuliert: `MH_SECRET=… MH_DATA_DIR=./data MH_DOCKER_DRIVER=fake MH_DEMO=true pnpm --filter @mornihosting/server dev`
- Web: `pnpm --filter @mornihosting/web dev` (Proxy auf :8099, `MH_DEV_BACKEND`)
- Tests: `pnpm --filter @mornihosting/server test`

## Releases

- Neue Version: Tag `vX.Y.Z` auf `main` pushen. CI baut das Image (ghcr.io, amd64+arm64) und legt danach das GitHub-Release an; Hinweise aus `docs/releases/vX.Y.Z.md`, sonst automatisch. Das Panel bietet ein Update an, sobald das Release da ist.
- `main` ist der stabile Stand (die Einzeiler laden von dort), entwickelt wird auf `claude/gallant-clarke-bipv7b`.

## Nächste Schritte

1. Philip: Release v1.0.0 anlegen (GitHub → Releases → „Draft a new release“ → Tag `v1.0.0`, Ziel `main` → „Publish release“). Aus der Cloud-Sitzung blockiert die Sicherheitsprüfung den Tag-Push. CI baut danach das Image und setzt Titel und Text des Releases.
2. Philip: GHCR-Paket `mornihosting` auf „Public“ stellen (GitHub → Profil → Packages → mornihosting → Package settings → Change visibility).
3. Philip: Proxmox-Skript einmal auf dem echten Proxmox-Host laufen lassen.
4. Philip: NetBird nach dem Reiter im Admin-Bereich einrichten und den Voice-Chat einmal mit echten Spielern testen (in der Sandbox nur mit simuliertem Docker geprüft; das Plugin kam echt von Modrinth).
5. Optional: `main` als Standard-Branch setzen; Demo-Artefakt öffentlich teilen und im README verlinken.
