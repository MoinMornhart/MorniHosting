# 🟩 MorniHosting

**Dein eigenes Minecraft-Hosting zu Hause.** MorniHosting ist ein Web-Panel, mit dem du Minecraft-Server auf
deinem eigenen Rechner (z. B. Proxmox, Raspberry Pi, alter PC) anlegst und verwaltest – so einfach wie bei
einem großen Hoster, aber ohne monatliche Kosten.

Es kann so viel wie [Crafty Controller 4](https://craftycontrol.com/) und ist so aufgeräumt wie die Panels von
GGServers oder Nodecraft. Leitsatz: **Jede häufige Aufgabe in höchstens 3 Klicks – ohne Anleitung.**

[![CI](https://github.com/MoinMornhart/MorniHosting/actions/workflows/ci.yml/badge.svg)](https://github.com/MoinMornhart/MorniHosting/actions/workflows/ci.yml)
![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-10b981)
![Sprachen: Deutsch und Englisch](https://img.shields.io/badge/Sprachen-DE%20%7C%20EN-10b981)

![Übersicht mit drei Servern](docs/screenshots/dashboard.webp)

## Inhalt

- [Was kann MorniHosting?](#was-kann-mornihosting)
- [Bilder](#bilder)
- [Installation](#installation)
- [Erster Start](#erster-start)
- [Freunde einladen](#freunde-einladen)
- [Updates](#updates)
- [Sicherheit](#sicherheit)
- [Häufige Fragen](#häufige-fragen)
- [Für Entwickler](#für-entwickler)

## Was kann MorniHosting?

| Bereich                   | Was du bekommst                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🖥️ **Server**             | Java (Vanilla, Paper, Purpur, Fabric, Forge, NeoForge), Velocity-Proxy und Bedrock. Assistent mit RAM-Empfehlung, Versionen werden live geladen.      |
| 📦 **Import**             | Vorhandenen Server als ZIP hochladen – Software und Version werden erkannt.                                                                           |
| 🔗 **Adresse**            | Oben auf jeder Server-Seite: Adresse zum Kopieren, öffentliche und lokale IP, Prüfung „Von außen erreichbar?“ mit Hilfe zur Portfreigabe.             |
| ⌨️ **Konsole**            | Live, mit Farben, Befehlsverlauf (↑/↓), Tab-Ergänzung, Suche und Kopieren.                                                                            |
| 🩺 **Absturz-Helfer**     | Erkennt typische Fehler (falsche Java-Version, zu wenig RAM, fehlende Abhängigkeit) und erklärt die Lösung mit einem Knopf.                           |
| 🧩 **Marktplatz**         | Plugins, Mods und Modpacks aus Modrinth, Hangar, SpigotMC und (mit eigenem Schlüssel) CurseForge. Nur passende Versionen, Abhängigkeiten automatisch. |
| 🔌 **Plugins**            | Liste mit An/Aus-Schalter, Updates per Klick, eigene `.jar` per Drag & Drop.                                                                          |
| 📁 **Dateien**            | Ordnerbaum, Drag & Drop, Editor mit Syntaxfarben, ZIP packen und entpacken, Papierkorb (7 Tage).                                                      |
| ⚙️ **Einstellungen**      | `server.properties` als Formular mit Erklärung zu jeder Einstellung, MOTD-Editor mit Farbvorschau, Server-Bild.                                       |
| 👥 **Spieler**            | Online-Liste mit Köpfen, OP, Kick, Bann und Whitelist per Klick – auch für Spieler, die gerade offline sind.                                          |
| 🌍 **Welten**             | Welt hochladen, wechseln oder neu erzeugen (mit Seed).                                                                                                |
| 📱 **Bedrock-Spieler**    | Geyser und Floodgate mit einem Schalter: Freunde auf Handy, Konsole oder Windows spielen auf deinem Java-Server mit.                                  |
| 💾 **Backups**            | Per Klick oder geplant, Welt wird vorher gespeichert, Aufbewahrung, Ausschlüsse, Download, Wiederherstellen mit Sicherheitskopie.                     |
| ⏰ **Zeitpläne**          | Neustart, Backup oder Befehl – „jeden Tag um 04:00“ statt Cron-Syntax, mit Vorwarnung im Spiel-Chat.                                                  |
| 📊 **Statistik**          | CPU, RAM, TPS und Spieler über die letzte Stunde, 24 Stunden oder 7 Tage.                                                                             |
| 🔔 **Benachrichtigungen** | Discord, Slack, Microsoft Teams oder eigene Webhooks: Server gestartet oder abgestürzt, Backup fertig, Spieler beigetreten.                           |
| 🔐 **Benutzer & Rollen**  | Rollen pro Server (Besitzer, Moderator, Zuschauer oder eigene), 2FA per App, Protokoll aller Aktionen.                                                |
| 🤖 **REST-API**           | API-Schlüssel mit Ablaufdatum und OpenAPI-Doku unter `/api/docs`.                                                                                     |
| ⬆️ **Updates**            | Das Panel zeigt neue Versionen an und aktualisiert sich per Knopfdruck. Deine Minecraft-Server laufen dabei weiter.                                   |
| 🌗 **Bedienung**          | Dunkel und hell, Deutsch und Englisch, auch auf dem Handy gut bedienbar.                                                                              |

## Bilder

|                                                                        |                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| ![Server-Seite mit Adresse und Spielern](docs/screenshots/server.webp) | ![Live-Konsole](docs/screenshots/console.webp)   |
| **Server-Seite:** Adresse, Bedrock-Port, Spieler, Kennzahlen           | **Konsole:** live, mit Verlauf und Tab-Ergänzung |
| ![Plugin-Marktplatz](docs/screenshots/market.webp)                     | ![Datei-Manager](docs/screenshots/files.webp)    |
| **Marktplatz:** nur Plugins, die zu deinem Server passen               | **Dateien:** Baum, Drag & Drop, Editor           |
| ![Statistik der letzten 24 Stunden](docs/screenshots/stats.webp)       | ![Helles Design](docs/screenshots/light.webp)    |
| **Statistik:** CPU, RAM, TPS und Spieler                               | **Hell oder dunkel**, wie du magst               |

<p align="center"><img src="docs/screenshots/phone.webp" alt="Server-Seite auf dem Handy" width="300"></p>

Den Weg dorthin zeigt die [Fortschrittsseite](docs/progress.html).

## Installation

Du brauchst einen Rechner mit Linux und **mindestens 4 GB RAM** (besser 8 GB) – zum Beispiel einen
Proxmox-Server, einen Mini-PC oder eine VM. Wähle **einen** der drei Wege:

### A) Proxmox: ein Befehl, fertig (empfohlen)

In Proxmox den Host öffnen (z. B. `pve`) → **Shell** → diese Zeile einfügen:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MoinMornhart/MorniHosting/main/proxmox/mornihosting.sh)"
```

Das Skript legt einen eigenen Container (Debian 12, 4 Kerne, 8 GB RAM, 32 GB Platte) an, installiert Docker
und MorniHosting und zeigt dir am Ende die Adresse. Alle Werte kannst du vorher ändern.
Mehr dazu: [Proxmox-Anleitung](docs/proxmox-quickstart.md).

### B) Debian oder Ubuntu (Server, VM, Mini-PC)

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MoinMornhart/MorniHosting/main/install.sh)"
```

Installiert Docker (falls nötig), legt das Panel nach `/opt/mornihosting`, erzeugt eine `.env` mit zufälligem
Geheimnis und richtet den Update-Knopf ein.

### C) Von Hand mit Docker Compose (auch Windows mit Docker Desktop)

```bash
git clone https://github.com/MoinMornhart/MorniHosting.git
cd MorniHosting
cp .env.example .env
# In der .env bei MH_SECRET einen langen Zufallswert eintragen, z. B. aus: openssl rand -hex 32
docker compose up -d
```

Gibt es noch kein fertiges Image, baust du es mit `docker compose up -d --build` selbst (dauert beim ersten
Mal ein paar Minuten). Unter Windows läuft das in der PowerShell genauso; den Zufallswert bekommst du dort
z. B. mit `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')`.

<details>
<summary>Alle Einstellungen in der <code>.env</code></summary>

| Name                | Pflicht | Bedeutung                                                                                                |
| ------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `MH_SECRET`         | ja      | Langer Zufallswert. Schützt Sitzungen und gespeicherte Schlüssel. Nie teilen.                            |
| `MH_PANEL_PORT`     | nein    | Port des Panels im Browser, Standard `8080`.                                                             |
| `MH_LAN_IP`         | nein    | IP des Rechners im Heimnetz, damit die Adress-Karte sie zeigen kann.                                     |
| `MH_PUBLIC_ADDRESS` | nein    | Domain oder DynDNS-Name für deine Freunde, z. B. `mc.example.de`.                                        |
| `TZ`                | nein    | Zeitzone für Zeitpläne, Standard `Europe/Berlin`.                                                        |
| `MH_TRUST_PROXY`    | nein    | `true`, wenn das Panel hinter einem Reverse-Proxy mit HTTPS läuft (Nginx Proxy Manager, Traefik, Caddy). |
| `MH_IMAGE_TAG`      | nein    | Bestimmte Panel-Version statt `latest`, z. B. `1.0.0`.                                                   |

</details>

## Erster Start

1. Öffne `http://<IP-deines-Rechners>:8080` im Browser.
2. Der **Einrichtungs-Assistent** fragt nach Sprache und deinem Administrator-Konto. Es gibt kein
   Standard-Passwort – du legst dein eigenes an.
3. Klicke auf **Neuer Server**, wähle Java oder Bedrock, die Software und die Version – fertig. Der Server
   startet sofort und die Adresse für deine Freunde steht oben auf der Seite.

## Freunde einladen

Im Heimnetz reicht die Adresse oben auf der Server-Seite. Für Freunde aus dem Internet gibst du im Router die
Ports an deinen Rechner weiter:

| Port                     | Protokoll | Wofür                                        |
| ------------------------ | --------- | -------------------------------------------- |
| 25565 (bzw. Server-Port) | TCP       | Java-Server                                  |
| 19132                    | UDP       | Bedrock-Server oder Geyser (Bedrock-Spieler) |

Der Knopf **Jetzt prüfen** auf der Server-Seite sagt dir, ob es klappt. Kein Zugriff auf den Router? Dann hilft
ein Tunnel wie [playit.gg](https://playit.gg) – der Knopf dazu steht direkt daneben.

## Updates

- **Im Panel:** Unter _Einstellungen → Updates_ (und unten links in der Seitenleiste) erscheint ein Hinweis,
  sobald es eine neue Version gibt. Ein Klick auf **Jetzt aktualisieren** genügt.
- **Auf der Konsole:** `update` (nach Weg A oder B) bzw. `sudo /opt/mornihosting/update.sh`.
- **Weg C (von Hand):** `git pull` und danach `docker compose pull && docker compose up -d`
  (ohne fertiges Image: `docker compose up -d --build`).

Deine Minecraft-Server sind eigene Container und laufen während des Updates einfach weiter.

## Sicherheit

- **Kein direkter Docker-Zugriff:** Das Panel spricht Docker nur über einen
  [Socket-Proxy](https://github.com/Tecnativa/docker-socket-proxy) mit minimalen Freigaben, in einem internen
  Netz ohne Internet.
- **Ohne Root:** Der Panel-Container läuft als normaler Benutzer, schreibgeschützt, mit `cap_drop: ALL` und
  `no-new-privileges`.
- **Keine Standard-Passwörter:** Das erste Konto legst du selbst an; Geheimnisse stehen nur in der `.env`.
- **Anmeldung:** Passwörter mit Argon2, Sitzungs-Cookies (`httpOnly`, `SameSite`, bei HTTPS `Secure`),
  CSRF-Schutz, Rate-Limit beim Login, 2FA per Authenticator-App, API-Schlüssel nur als Hash gespeichert.
- **Dateien:** Jeder Pfad bleibt im Ordner des Servers (kein `../`), ZIPs werden auf „Zip-Slip“ geprüft,
  Uploads haben ein Größenlimit, im Plugin-Bereich sind nur `.jar` erlaubt.
- **Downloads:** Plugins und Mods kommen nur von Modrinth, Hangar, SpigotMC, CurseForge und (für Floodgate)
  GeyserMC – über HTTPS, jede Weiterleitung wird geprüft, die Prüfsumme wird verglichen, wenn die Quelle eine
  liefert.
- **Webhooks:** Adressen werden verschlüsselt gespeichert und dürfen nicht ins Heimnetz zeigen.

Das Panel selbst (Port 8080) gehört **nicht** ins Internet. Für unterwegs nimm ein VPN (WireGuard, Tailscale)
oder einen Reverse-Proxy mit HTTPS und setze dann `MH_TRUST_PROXY=true`.

Eine Sicherheitslücke gefunden? Bitte nicht als öffentliches Issue, sondern über
[GitHub Security Advisories](https://github.com/MoinMornhart/MorniHosting/security/advisories/new) melden.

## Häufige Fragen

<details>
<summary><b>Wie viel RAM brauche ich?</b></summary>

Pro Server: Vanilla oder Paper 2–4 GB, Modpacks 6–10 GB. Dazu etwa 1 GB für System und Panel. Der Assistent
schlägt dir einen Wert vor und warnt, wenn du mehr verteilst, als frei ist.

</details>

<details>
<summary><b>Freunde können nicht beitreten – was tun?</b></summary>

Öffne die Server-Seite und klicke auf **Jetzt prüfen**. Ist der Server von außen nicht erreichbar, fehlt meist
die Portfreigabe im Router (siehe [Freunde einladen](#freunde-einladen)). Manche Anbieter (DS-Lite, CGNAT)
erlauben keine Freigaben – dann hilft der playit.gg-Tunnel.

</details>

<details>
<summary><b>Können Bedrock-Spieler (Handy, Switch, Xbox) auf meinen Java-Server?</b></summary>

Ja. In den Server-Einstellungen **Bedrock-Spieler erlauben** einschalten. MorniHosting installiert Geyser und
Floodgate und öffnet einen UDP-Port (meist 19132). Das geht bei Paper, Purpur, Fabric, NeoForge und Velocity.

</details>

<details>
<summary><b>Kann ich meinen bisherigen Server mitnehmen?</b></summary>

Ja. Packe den Server-Ordner als ZIP und nutze **Server importieren** auf der Übersicht. Software und Version
werden erkannt, du kannst sie vor dem Import noch ändern.

</details>

<details>
<summary><b>Wo liegen meine Welten und Backups?</b></summary>

Im Docker-Volume `mornihosting-data` (unter Linux meist `/var/lib/docker/volumes/mornihosting-data/_data`).
Backups kannst du im Panel auch direkt herunterladen.

</details>

<details>
<summary><b>Ich habe mein Passwort vergessen oder mein Handy (2FA) verloren.</b></summary>

Ein anderer Administrator kann es unter _Benutzer und Rollen_ neu setzen. Bist du der einzige Admin, setze es
auf dem Rechner zurück (bei Proxmox vorher `pct enter <ID>`):

```bash
docker exec mornihosting node /app/server/dist/cli.js reset-password <name>
```

Du bekommst ein neues Passwort angezeigt. Handy mit der 2FA-App verloren? Dann `reset-2fa <name>` statt
`reset-password <name>`. `list-users` zeigt alle Kontonamen.

</details>

<details>
<summary><b>Warum nicht einfach Crafty, Pterodactyl oder AMP?</b></summary>

Die können viel, sind aber eher für Admins gemacht. MorniHosting richtet sich an alle, die einfach mit
Freunden spielen wollen: klare Sprache statt Fachbegriffen, Erklärungen direkt an jeder Einstellung und
trotzdem alles, was Crafty Controller kann.

</details>

<details>
<summary><b>Läuft das auch auf dem Raspberry Pi?</b></summary>

Ja, das Image gibt es für `amd64` und `arm64`. Ein Pi 5 mit 8 GB reicht für einen kleinen Paper-Server.

</details>

## Für Entwickler

Voraussetzungen: Node.js 22 und pnpm 10.

```bash
pnpm install
# Panel ohne Docker ausprobieren (simulierte Server, Demo-Spieler):
MH_SECRET=$(openssl rand -hex 32) MH_DATA_DIR=./data MH_DEMO=true pnpm --filter @mornihosting/server dev
pnpm --filter @mornihosting/web dev
```

| Befehl           | Was es tut                                                               |
| ---------------- | ------------------------------------------------------------------------ |
| `pnpm lint`      | ESLint                                                                   |
| `pnpm typecheck` | TypeScript (strict) für alle Pakete und die Browser-Tests                |
| `pnpm test`      | Vitest für die Backend-Logik                                             |
| `pnpm build`     | Web-App und Server bauen                                                 |
| `pnpm test:e2e`  | Playwright: Server anlegen, Plugin installieren, Backup wiederherstellen |

Aufbau: `apps/server` (Fastify, SQLite/Drizzle, Docker über den Socket-Proxy), `apps/web` (React, Vite,
Tailwind, Radix, TanStack Query), `packages/shared` (Typen, Schemas, Software-Katalog). Jeder Minecraft-Server
ist ein eigener Container auf Basis der [itzg-Images](https://github.com/itzg/docker-minecraft-server).

GitHub Actions prüft jeden Push (Lint, Typen, Tests, Playwright). Eine neue Version entsteht mit einem Tag
`v1.2.3`: Dann wird das Image `ghcr.io/moinmornhart/mornihosting` für amd64 und arm64 gebaut und danach das
GitHub-Release angelegt – mit den Hinweisen aus `docs/releases/v1.2.3.md`, falls es die Datei gibt. Sobald das
Release da ist, bieten alle Panels das Update an.

## Lizenz

[MIT](LICENSE) – mach damit, was du willst. Minecraft ist eine Marke von Mojang/Microsoft; MorniHosting ist
ein unabhängiges Projekt.

---

<sub>Verfasst mit Claude 🤖</sub>
