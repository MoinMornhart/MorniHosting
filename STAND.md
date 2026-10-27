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
- Phase 3 läuft: Datei-Manager, server.properties-Formular, Spieler, Welten.

## Lokal testen (Sandbox)
- Backend simuliert: `MH_SECRET=… MH_DATA_DIR=./data MH_DOCKER_DRIVER=fake MH_DEMO=true pnpm --filter @mornihosting/server dev`
- Web: `pnpm --filter @mornihosting/web dev` (Proxy auf :8099, `MH_DEV_BACKEND`)
- Tests: `pnpm --filter @mornihosting/server test`

## Nächste Schritte
1. Phase 3: Datei-Manager, Einstellungen-Tab, Spieler, Welten
2. Phase 4–7 laut Prompt
