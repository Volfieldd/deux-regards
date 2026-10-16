# Serien

Serien fassen die Fotos zusammen (Straße, Porträt…). Sie bilden den Index der Website und dienen als Filter. Jede Serie ist eine **Tafel**: ihre ersten drei Fotos, ihr Name und die Anzahl ihrer Fotos.

- **Erstellen:** **＋ Neue Serie** oben auf der Seite setzt den Cursor in die Erstellungskarte. Geben Sie den Namen ein, dann **Eingabe** (oder **Erstellen**); **Esc** löscht die Eingabe. Die neue Serie kommt auf den **ersten Platz**, mit einer aus dem Namen abgeleiteten Adresse.
- **Ihre Fotos ansehen:** **Fotos ›** öffnet die Liste der Fotos, gefiltert auf diese Serie.
- **Umbenennen:** **Umbenennen** öffnet den Namen in der Karte, dann **Speichern**. Unter dem Namen „Name auf Englisch und Deutsch“: die Fassung, die auf den englischen und deutschen Seiten der Website angezeigt wird (freiwillig; leer: der französische Name). Die Adresse (`/serie/<adresse>`) liegt unter „Adresse der Serie (erweitert)“: Eine Änderung macht bereits geteilte Links ungültig.
- **Ordnen:** Das ist die Reihenfolge des Serienindex auf der Website.
  - mit der Maus: Greifen Sie den Griff **⠿ Verschieben** und ziehen Sie die Karte an ihren neuen Platz;
  - per Tastatur: Tab bis zum Griff, dann **↑ / ←** (einen Platz nach vorn) oder **↓ / →** (einen Platz nach hinten);
  - überall, auch auf dem Telefon: Menü **⋯**, **Eine Position nach oben** oder **Eine Position nach unten**.

  Die Reihenfolge wird sofort gespeichert, und eine Meldung nennt den neuen Platz.
- **Löschen:** Menü **⋯**, **Löschen…**. Ein Fenster öffnet sich.
  - Leere Serie: Bestätigen Sie.
  - Serie mit Fotos: **Diese werden nie gelöscht.** Wählen Sie die Serie, in die sie verschoben werden sollen, dann **Die *n* Fotos verschieben und löschen**.

Um Fotos einer Serie zuzuordnen, ist die [Mehrfachauswahl](photos#agir-sur-plusieurs-photos) auf der Seite Fotos am schnellsten. Auf der Website ist eine Serie ohne veröffentlichtes Foto ausgegraut und nicht anklickbar.

## Vorgeschlagene Serie

Unten auf der Seite Serien hilft **Serie vorschlagen** beim Einordnen neuer Fotos. Die Funktion ist **standardmäßig aus**.

- **Einschalten:** **Vorschläge einschalten**. Das Analysemodell (etwa 90 MB, ein freies Modell namens CLIP) wird einmalig in den Datenordner heruntergeladen. Danach werden die vorhandenen Fotos im Hintergrund analysiert, mit Fortschrittsbalken; jedes importierte Foto wird sofort analysiert.
- **Was vorgeschlagen wird:** Beim Import erhält jedes Foto die im Formular gewählte Serie. Solange Sie sie nicht selbst gewählt haben, vergleicht der Server das Foto mit den bereits eingeordneten Fotos (Ihren und denen des anderen Fotografen: die Ähnlichkeit wird pro Serie berechnet). Ähnelt ihm eine **andere** Serie deutlich mehr, wird sie vorgeschlagen; sind zwei fast gleich nah, werden beide vorgeschlagen. Eine Serie wird erst ab **3 eingeordneten Fotos** vorgeschlagen. Ein veröffentlichtes Foto erhält nie einen Vorschlag.
- **Wo er erscheint:** ein Stern **✦** und ein gepunkteter Rahmen kennzeichnen ihn, unabhängig von der Farbe.
  - auf dem Vorschaubild im [Kontaktbogen](photos#la-planche-contact) und mit dem Filter **✦ Vorgeschlagene Serie**;
  - im [Inspektor](photos#linspecteur): **In „…“ einordnen** übernimmt ihn sofort, **„…“ behalten** bestätigt die aktuelle Serie;
  - in den [Details des Fotos](photos#la-fiche-dune-photo): **Wählen** füllt das Feld Serie aus, **Speichern** bestätigt; die kleinen Vorschaubilder zeigen die ähnlichsten Fotos der Serie;
  - auf der Seite eines [Ausflugs](rencontres#les-sorties), unter jedem Foto;
  - unter **Heute** eine Zeile „*n* Fotos mit vorgeschlagener Serie“.
- **Ein Foto nach dem anderen:** Ohne Ihren Klick wird nie etwas eingeordnet, und es gibt kein „alle übernehmen“. Sobald Sie eine Serie wählen (vorgeschlagen oder nicht, oder indem Sie das Foto auf eine Serie ziehen), verschwindet der Vorschlag, und das Foto dient als Beispiel für die nächsten.
- **Ausschalten:** **Ausschalten und löschen** entfernt das Modell und alle Bild-Fingerabdrücke.

Die Analyse läuft auf Ihrem Server: Kein Bild wird anderswohin gesendet. Der Fingerabdruck eines Fotos (eine Zahlenfolge) dient nur dazu, Bilder miteinander zu vergleichen. Er kann keine Person erkennen und wird mit dem Foto gelöscht.

## Fotos beschreiben

Unter **Serie vorschlagen** schlägt das Feld **Fotos beschreiben** für jedes Foto einen kurzen, sachlichen Satz vor („ein roter Leuchtturm auf einer kleinen Insel“), angezeigt auf der Seite des Fotos unter der Bildunterschrift. Es ist **standardmäßig ausgeschaltet**.

- **Einschalten:** Wählen Sie das Modell, **Leicht** (Florence-2 base, voreingestellt: etwa 270 MB herunterzuladen, 2 GB Speicher während der Berechnung, etwa 10 Sekunden pro Foto) oder **Genau** (Florence-2 large: etwa 850 MB, 4 GB, etwas detaillierter). **Genau** setzt voraus, dass die Website 6 GB hat: Fügen Sie `SITE_MEM_LIMIT=6g` zur `.env` des Stacks hinzu, dann **Compose Up**. Das Feld zeigt den verfügbaren Speicher und lehnt **Genau** ab, wenn er nicht reicht. Wählen Sie außerdem die **Nachtstunden** (standardmäßig 1 bis 6 Uhr, Pariser Zeit), dann **Beschreibungen einschalten** (Anfang und Ende müssen sich unterscheiden). Das Modell wird einmal heruntergeladen, bei der ersten Berechnung, Datei für Datei: Jede wird geprüft (Größe und SHA-256-Fingerabdruck), bevor sie behalten wird, und ein unterbrochener Download wird bei der nächsten Berechnung fortgesetzt.
- **Wann:** Fotos ohne Beschreibung werden in den Nachtstunden beschrieben, eines nach dem anderen, in einem eigenen Prozess, auf einem einzigen Prozessorkern: Die Website bleibt während der Berechnung erreichbar. Das Modell belegt nur während der Berechnung Speicher; wird er knapp, bricht nur diese Berechnung ab, nicht die Website.
- **Auf der Seite des Fotos:** **Dieses Foto beschreiben** kommt sofort an die Reihe (etwa eine Minute). Dann kopiert **Als Bildunterschrift übernehmen** den Satz in das Feld Bildunterschrift, zum Prüfen, Umschreiben und Speichern. **Erneut beschreiben** berechnet ihn neu. Nichts wird je von selbst übernommen. Höchstens zwanzig Fotos warten, bis sie an der Reihe sind: darüber hinaus versuchen Sie es in einigen Minuten erneut. Eine fehlgeschlagene Berechnung wird auf der Seite des Fotos angezeigt („Letzter Versuch erfolglos“); das Foto wird beim nächsten Neustart der Website erneut versucht, oder mit **Dieses Foto beschreiben**.
- **Sprache:** Das Modell schreibt auf Englisch. Hat die Website einen Übersetzer (LibreTranslate), wird der Satz ins Französische und Deutsche übersetzt; sonst bleibt er auf Englisch. Eine verpasste Übersetzung (Übersetzer gestoppt oder langsam) wird in den folgenden Minuten von selbst nachgeholt.
- **Wenn das Modell nicht lädt** (Netzwerk beim ersten Herunterladen unterbrochen, zu wenig Speicher): Kein Foto wird als fehlgeschlagen markiert; die Seite Serien zeigt „Letzter Versuch erfolglos“, und zehn Minuten später folgt ein neuer Versuch.
- **Ausschalten:** **Ausschalten und Modell löschen** bricht einen laufenden Download oder eine laufende Berechnung sofort ab und entfernt das Modell von der Festplatte; vorhandene Beschreibungen bleiben.

Die Analyse erfolgt auf Ihrem Server: Kein Bild wird woandershin gesendet. Das Modell beschreibt, was es sieht, ohne je Personen zu nennen.
