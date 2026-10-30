# E-Mail im Panel

Das Panel kann E-Mails verschicken: Willkommen, Registrierung, „Passwort vergessen“, Bestellbestätigung und (optional) eine Warnung an Admins, wenn ein Server abstürzt. **Ohne Mail-Einstellungen läuft alles wie bisher.**

## Einrichten (einmal)

1. **Postfach anlegen**, z. B. `noreply@mornihosting.de`:
   - **INWX:** Kundenmenü → Postfach für die Domain anlegen. Server und Port stehen in den Postfach-Angaben (meist `mail.inwx.de`, Port 587).
   - **IONOS:** Postfach anlegen, Server `smtp.ionos.de`, Port 587, Benutzer ist die ganze Adresse.
   - **Gmail:** `smtp.gmail.com`, Port 587, dazu ein „App-Passwort“ (Google-Konto → Sicherheit → 2-Schritt-Bestätigung → App-Passwörter).
2. **Admin-Bereich → Domain & HTTPS:** die Domain des Panels eintragen (z. B. `mornihosting.de`). Links in Mails zeigen immer auf diese Domain, nie auf die Adresse, mit der jemand das Panel gerade aufruft (so kann niemand Links in Mails umbiegen).
3. **Admin-Bereich → E-Mail:** Server, Port, Verschlüsselung (STARTTLS 587 oder TLS 465), Benutzer, Passwort und Absender eintragen, speichern und **Test-Mail senden**.

Das Passwort wird verschlüsselt gespeichert (wie der NetBird-Schlüssel) und nie wieder an den Browser geschickt.

## Welche Mails gibt es?

| Mail                    | Wann                                                                                | Link                                  |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| Test                    | Knopf im Admin-Bereich                                                              | –                                     |
| Willkommen              | Ein Admin legt einen Benutzer mit E-Mail-Adresse an                                 | Zum Panel (kein Passwort in der Mail) |
| E-Mail bestätigen       | Registrierung auf der Startseite                                                    | 24 Stunden, einmalig                  |
| Schon ein Konto         | Registrierung mit einer Adresse, die es schon gibt                                  | Zur Anmeldung                         |
| Neue Adresse bestätigen | Benutzer ändert die Adresse unter „Mein Konto“                                      | 24 Stunden, einmalig                  |
| Passwort zurücksetzen   | „Passwort vergessen?“ auf der Anmeldeseite                                          | 1 Stunde, einmalig                    |
| Server bestellt         | Ein Server wird angelegt (Name, Paket, Software, Adresse, Link)                     | Zur Server-Seite                      |
| Server abgestürzt       | Nur wenn eingeschaltet; an Admins mit Adresse, höchstens alle 15 Minuten pro Server | Zur Server-Seite                      |

Alle Mails gibt es auf Deutsch und Englisch (nach der Sprache des Benutzers), als schlichtes HTML plus Text-Fassung, ohne Bilder von außen.

## Registrierung

Im Reiter „E-Mail“ lässt sich die **Registrierung auf der Startseite** einschalten (Standard: aus). Dann:

- Neue Leute geben Benutzername, E-Mail und Passwort ein und bekommen einen Bestätigungs-Link. **Vorher kann sich niemand anmelden.** Unbestätigte Konten werden nach 24 Stunden gelöscht.
- Sie bekommen nur Standardrechte (kein Admin). Ob sie **Server bestellen dürfen**, entscheidet der zweite Schalter („Neue Konten dürfen Server bestellen“, Standard: aus).
- Die Seite verrät nicht, ob eine Adresse schon ein Konto hat: Wer eine bekannte Adresse benutzt, sieht dieselbe Antwort und bekommt nur eine Mail „Du hast schon einen Zugang“.

Wer als Admin Benutzer anlegt, kann die Adresse gleich mit eintragen (jede Adresse nur einmal).

## Sicherheit

- Links enthalten 256 Bit Zufall; gespeichert wird nur der SHA-256-Hash. Ein Link gilt einmal und läuft ab.
- „Passwort vergessen“ antwortet immer gleich (kein Hinweis, ob die Adresse existiert), schickt höchstens eine Mail pro Minute pro Konto und hat ein Rate-Limit pro IP.
- Nach dem Zurücksetzen werden alle Sitzungen des Kontos beendet. 2FA und Passkeys bleiben bestehen.
- Absender und Texte können keine Kopfzeilen einschleusen: Zeilenumbrüche werden abgelehnt bzw. entfernt, alles Eingegebene wird für HTML maskiert.
- Gesendet wird mit [nodemailer](https://nodemailer.com) 10.2.1.

## Fehlersuche

- „Die Mail konnte nicht verschickt werden“: die Meldung des Mailservers steht dahinter (falsches Passwort, falscher Port, Verschlüsselung passt nicht zum Port).
- Registrierung und „Passwort vergessen“ erscheinen erst, wenn **Mailserver und Panel-Domain** eingetragen sind.
- Landet nichts im Postfach: Spam-Ordner prüfen; bei eigener Domain helfen SPF/DKIM-Einträge, die das Postfach-Angebot (INWX, IONOS) beschreibt.
