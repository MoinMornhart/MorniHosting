# MorniHosting

@STAND.md

## Regeln für dieses Projekt

- Oberfläche auf Deutsch (Standard) und Englisch, freundliche Sprache, keine Fachbegriffe ohne Erklärung.
- **„Verfasst mit Claude 🤖“ gilt:** als letzte Zeile in Commit-Messages (durch eine Leerzeile getrennt), in PRs, Issues und Release-Notes; einmal als Fußzeile im README.
- **Update-Funktion:** ja. **Proxmox-Quick-Start:** ja.
- Repo ist öffentlich: keine Geheimnisse, Tokens oder privaten Daten committen. Secrets nur über `.env`.
- Fortschrittsseite `docs/progress.html` nach jedem Baustein aktualisieren (Bilder in `docs/progress/`).
- Nach jeder sichtbaren Änderung Philip Screenshots schicken, wie es jetzt aussieht (auch Handy, wenn betroffen).
- Vor jeder Veröffentlichung (Merge nach `main`) Philips Go abwarten. Die Demo-Seite muss dafür nicht mehr aktualisiert werden (Philip, 30.10.).
- `STAND.md` nach jedem größeren Schritt aktualisieren.
- Sicherheit ist nicht verhandelbar: Docker nur über den Socket-Proxy, Pfade strikt begrenzen, keine Standard-Passwörter.
