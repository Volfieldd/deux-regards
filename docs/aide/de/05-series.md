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
