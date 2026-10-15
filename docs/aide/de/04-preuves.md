# Prioritätsnachweise

Für jedes importierte Foto erstellt die Website selbstständig einen Nachweis, dass **Sie diese Datei zu einem bestimmten Datum besaßen**, überprüfbar ohne die Website.

## Wie es funktioniert

1. **Fingerabdruck:** Beim Import berechnet die Website den **SHA-256-Fingerabdruck** des Originals, eine Art „DNA“ der Datei. Ein einziges geändertes Pixel ergibt einen anderen Fingerabdruck.
2. **Zeitstempel:** Nur dieser Fingerabdruck, nie das Foto, wird an eine **Zeitstempelstelle** gesendet, die ein **signiertes Token** zurückgibt, das das Datum bestätigt.
3. **Prüfung:** Die Website prüft das Token (Signatur, Stelle, Datum) und bewahrt es dann auf.

Bei einem Fehler (Netzwerk, Dienst nicht erreichbar) versucht es die Website selbstständig erneut: einige Minuten später, dann stündlich.

## In den Details eines Fotos

| Element | Bedeutung |
|---|---|
| SHA-256-Fingerabdruck | die „DNA“ des Originals |
| **Zeitstempel vom … UTC** | das garantierte Datum (Weltzeit: +1 h im Winter, +2 h im Sommer für Paris) |
| Stelle, Nr. | wer das Token signiert hat, und seine Nummer |
| Ausstehend | Anfrage noch nicht abgeschlossen: Schaltfläche **Jetzt erneut versuchen** |

Schaltflächen:

- **Original**: die genaue Datei, deren Fingerabdruck mit einem Zeitstempel versehen wurde.
- **Token (.tsr)**: das signierte Token.
- **Nachweisblatt**: eine lesbare Zusammenfassung, mit den Prüfbefehlen.
- **Zertifikat der Stelle**: um die Signatur zu prüfen.
- **Nachweis prüfen**: führt alle Prüfungen erneut durch.
  - „**Gültiger Nachweis**“: Das Original ist unverändert, und die Signatur ist bis zur Stelle geprüft.
  - „**Ungültiger Nachweis: Das Original wurde verändert**“: Die Datei auf dem Server ist nicht mehr die mit dem Zeitstempel versehene. Stellen Sie sie aus einer Sicherung wieder her.
  - „**Gültige Signatur… aber Zertifizierungsstelle nicht geprüft**“: Dem Server fehlt das Stammzertifikat der Stelle. Benachrichtigen Sie die Person, die ihn verwaltet.

## Im Streitfall

Laden Sie die vier Dateien herunter und bewahren Sie sie zusammen auf, außerhalb der Website. Dann kann jeder den Nachweis mit OpenSSL prüfen; die Befehle stehen im Nachweisblatt. Fügen Sie Ihre **RAW**-Dateien und die benachbarten Aufnahmen derselben Sitzung bei: Der Nachweis der Website belegt das **Datum**, die RAW-Datei belegt den **Urheber**.

**Bevor Sie ein Foto löschen**, laden Sie seinen Nachweis herunter: Er wird mit dem Foto gelöscht.
