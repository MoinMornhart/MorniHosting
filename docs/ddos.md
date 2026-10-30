# DDoS-Schutz

MorniHosting kann deine Minecraft-Server und das Panel vor **Flut-Angriffen** schützen – so weit das auf einem Rechner zu Hause sinnvoll ist. Eingeschaltet wird er im Panel: **Admin-Bereich → DDoS-Schutz**.

## Was er tut

Pro Absender-IP (bei IPv6 pro /64, also pro Anschluss) gelten diese Grenzen:

| Was                                               | Grenze                               | Warum so viel                                                                     |
| ------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Neue TCP-Verbindungen (Java, Panel)               | 120 pro Minute, bis zu 60 auf einmal | Server-Liste aktualisieren, Einloggen, Browser-Tabs – auch für eine ganze Familie |
| Gleichzeitig offene TCP-Verbindungen              | 64                                   | Ein Spieler braucht eine, ein Browser bis zu 6                                    |
| UDP-Pakete (Bedrock/Geyser, Voice-Chat)           | 4000 pro Sekunde, Spitze 8000        | Bedrock ~100, Voice-Chat ~50 Pakete pro Spieler und Sekunde                       |
| Kaputte TCP-Pakete (gehören zu keiner Verbindung) | werden verworfen                     | –                                                                                 |

Dazu SYN-Cookies, schnelleres Vergessen halb offener Verbindungen und eine größere Verbindungstabelle (sysctl).

**Nie gebremst:** Heimnetz (10/8, 172.16/12, 192.168/16), Docker intern, NetBird (100.64/10 und Schnittstelle `wt0`), localhost. Hinter NetBird kommen alle Spieler über eine Adresse – deshalb ist NetBird ausgenommen.

Geschützt werden genau die Ports deiner Server (das Panel schreibt die Liste mit), dazu 80, 443 und der Panel-Port aus der `.env`.

Zusätzlich gibt es die **Spam-Grenze in Minecraft** (`rate-limit` in server.properties): Spieler, die mehr Pakete pro Sekunde schicken, werden rausgeworfen. Sie gilt für Java-Server ab dem nächsten Start.

## Was er nicht kann

Gegen große Angriffe, die deinen ganzen Internetanschluss verstopfen, hilft nichts, was bei dir zu Hause läuft: Die Leitung ist voll, bevor ein Paket deinen Rechner erreicht. Dafür braucht es einen Dienst **vor** deinem Anschluss:

- **TCPShield** – für Minecraft Java, kostenloser Einstieg.
- **Cloudflare Spectrum** – beliebige TCP/UDP-Ports (auch Bedrock), kostenpflichtig. Fürs Panel reicht normales Cloudflare.
- **NetBird-Proxy auf einem Mietserver** – die Welt sieht nur die Adresse des Mietservers; viele Anbieter filtern große Angriffe dort.

## Wie es funktioniert

Das Panel hat absichtlich keinen Root- und keinen Firewall-Zugriff. Es schreibt nur in sein Datenvolume:

- `ddos/wish.json` – an oder aus,
- `ddos/ports.txt` – die Ports der Server (`tcp 25565` je Zeile).

Auf dem Rechner läuft `scripts/ddos-guard.sh` als root:

- `mornihosting-ddos.path` startet es, sobald sich eine der beiden Dateien ändert,
- `mornihosting-ddos.timer` jede Minute (Zähler fürs Panel; nach einem Neustart oder Docker-Start wieder einhängen).

Das Skript legt die iptables-Kette `MH-DDOS` an und hängt sie in `DOCKER-USER` (Docker leitet Verbindungen an INPUT vorbei) und `INPUT` ein; ip6tables genauso, falls IPv6 da ist. Es antwortet in `ddos/status.json` (an/aus, verworfene Pakete, Zeitpunkt). Aus den Dateien des Panels liest es nur „an/aus“ und Portnummern, Verknüpfungen werden nicht verfolgt.

`install.sh` richtet das ein, `update.sh` bei jedem Update auch. Von Hand:

```bash
sudo /opt/mornihosting/scripts/ddos-guard.sh install   # Einheiten einrichten
sudo /opt/mornihosting/scripts/ddos-guard.sh status    # Zustand und Zähler
sudo /opt/mornihosting/scripts/ddos-guard.sh enable    # an (wie der Schalter)
sudo /opt/mornihosting/scripts/ddos-guard.sh disable   # aus
```

## Eigene Grenzen

In `/etc/mornihosting/ddos.conf` (Vorlage legt `install` an, muss root gehören):

```bash
TCP_NEW_PER_MINUTE=120
TCP_NEW_BURST=60
TCP_MAX_CONNECTIONS=64
UDP_PACKETS_PER_SECOND=4000
UDP_BURST=8000
TRUSTED_V4="127.0.0.0/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10"
```

Danach `sudo /opt/mornihosting/scripts/ddos-guard.sh sync`.

## Proxmox

Ein LXC-Container teilt den Kernel des Proxmox-Hosts und kann Kernel-Module nicht selbst laden. Das Proxmox-Skript lädt sie beim Anlegen (`/etc/modules-load.d/mornihosting-ddos.conf`). Bei älteren Containern einmal **auf dem Proxmox-Host**:

```bash
modprobe -a xt_hashlimit xt_connlimit xt_conntrack xt_comment
printf '%s\n' xt_hashlimit xt_connlimit xt_conntrack xt_comment > /etc/modules-load.d/mornihosting-ddos.conf
```

Die sysctl-Werte bestimmt im LXC teils der Host; das Panel zeigt das an, die Firewall-Regeln wirken trotzdem.
