# Die Website aus Sicht der Besucher

Was Ihre Besucher tun können, damit Sie wissen, was Ihre Einstellungen verändern.

## Sprachen

Die Website gibt es auf **Französisch** (übliche Adressen, `/photo/…`), **Englisch** (`/en/…`) und **Deutsch** (`/de/…`).

- **Was übersetzt ist:** Menüs, Abschnittstitel, Schaltflächen, Fußzeile, Datumsangaben („oct. 2024“, „Oct 2024“, „Okt. 2024“), Ländernamen auf der Karte. Diese Texte liefert die Website, ohne maschinelle Übersetzung.
- **Ihre Texte** (Slogan, Einleitung, Über uns, Biografien, Namen der Serien, Titel, Bildunterschriften und Orte der Fotos): Ihre englische und deutsche Fassung ist **optional**; Sie füllen sie in der Verwaltung aus (unter jedem Feld eingeklappt, „auf Englisch und Deutsch“). Fehlt sie, wird eine andere Sprache angezeigt:
  - Seite auf Deutsch: Deutsch, sonst Französisch, sonst Englisch;
  - Seite auf Englisch: Englisch, sonst Französisch, sonst Deutsch;
  - Seite auf Französisch: Französisch, sonst Englisch, sonst Deutsch.
- **Auswahl:** am Ende des Menüs (und oben auf der Seite eines Fotos) die Flagge und das Sprachkürzel (🇫🇷 FR). Sie öffnet **dieselbe Seite** in einer anderen Sprache, Filter inbegriffen. Die Wahl wird gespeichert (das einzige Cookie der Website, erst in diesem Moment gesetzt).
- **Sprache bei der Ankunft** auf einer französischen Seite, wenn der Besucher nichts gewählt hat:
  - französischsprachige Länder (Frankreich, Monaco, Überseegebiete, frankophones Afrika…): Französisch;
  - Deutschland, Österreich, Liechtenstein: Deutsch;
  - Belgien, Schweiz, Luxemburg, Kanada: Die Sprache des Browsers entscheidet (eine Zürcherin bekommt Deutsch, ein niederländischsprachiger Belgier Englisch);
  - anderswo: Englisch; unbekanntes Land (lokales Netzwerk): die Sprache des Browsers.
- **Nie umgeleitet:** die Robots der Suchmaschinen (jede Sprache wird unter ihrer eigenen Adresse indexiert, untereinander verknüpft), Link-Vorschauen und jede Adresse unter `/en/` oder `/de/` (ein geteilter Link öffnet sich in der Sprache, die der Teilende gewählt hat).

## Startseite

- **Start-Diashow:**
  - Vollbildfotos, die alle 6 Sekunden wechseln;
  - Vorschaubilder, um ein Foto zu wählen;
  - Schaltfläche **Pause**, um den Wechsel anzuhalten (sie wird zu **Abspielen**, um ihn wieder zu starten);
  - der Wechsel hält auch an, solange Maus oder Tastatur auf der Start-Diashow sind.
- **Zwei Blicke:** „Beide“ oder ein Fotograf. Die Galerie wird **ohne Neuladen der Seite** gefiltert, und die Adresse ändert sich (`/auteur/julien`): Sie lässt sich teilen.
- **Serien:** der Index in großer Schrift. Beim Überfahren erscheint ein Foto der Serie; ein Klick filtert, ein zweiter Klick hebt den Filter auf. Die Filter lassen sich mit den Blicken kombinieren.
- **Reihenfolge:** über dem Raster **Auswahl** (die Reihenfolge, die Sie in der Fotothek gewählt haben, Standard) oder **Neueste** (nach Veröffentlichungsdatum, das zuletzt veröffentlichte zuerst). Die Reihenfolge kombiniert sich mit den Filtern, behält ihre Adresse (`?ordre=recentes`) und gilt auch für das vorherige und nächste Foto. Maßgeblich ist das Datum der **ersten** Veröffentlichung: Ein zurückgezogenes und wieder veröffentlichtes Foto behält seinen Platz.
- **Galerie:** alle veröffentlichten Fotos, in der Reihenfolge der Verwaltung.

## Bildbetrachter (Seite eines Fotos)

| Geste | Wirkung |
|---|---|
| **→** oder nach links wischen | nächstes Foto |
| **←** oder nach rechts wischen | vorheriges Foto |
| **Esc**, „Schließen“ oder die Zurück-Taste des Browsers | zurück zur Serie (oder zur Galerie), mit demselben Filter und an der verlassenen Stelle |
| Aufziehen mit zwei Fingern (Smartphone) | in das Foto zoomen |
| **Weiterlesen** | klappt eine lange Bildunterschrift auf (sonst 3 Zeilen); man liest sie durch Scrollen der Seite, **Weniger** klappt sie wieder zu |

Der erste Bildschirm zeigt das Foto, seinen Titel und den Anfang der Bildunterschrift; eine kurze Bildunterschrift wird vollständig angezeigt. Auf dem Smartphone liegen die Pfeile ‹ › unter dem Text.

Das nächste Foto hängt vom aktiven Filter ab: In „Straße, von Julien“ bleibt man in dieser Auswahl.

**Zurück zur Serie:** Der Wechsel zum vorherigen oder nächsten Foto stapelt sich nicht im Verlauf des Browsers. Nach zehn angesehenen Fotos führt **ein einziges** Zurück (oder **Schließen**, oder **Esc**) zur Serie zurück, an die Stelle, an der man sie verlassen hat, und das zuletzt angesehene Foto wird wieder ins Bild gerückt.

**Gefällt mir und Melden**: unter dem Text jedes Fotos ein Herz **Gefällt mir** (anonym: kein Konto, kein Cookie; Besucher können es zurücknehmen, die Zahl steht daneben) und ein Link **Melden**: Foto, das nicht online sein sollte, Vorschlag zum Text, etwas anderes, mit einer Nachricht und einer optionalen Adresse. Wer sich erkennt, wird zu `/bonjour` geleitet. Meldungen erscheinen in „Heute“ und auf der Seite **Meldungen von Besuchern**; die Zahl der „Gefällt mir“ steht im Abschnitt Publikum der Fotoseite.

## Weitere Seiten

- **Über uns:** vollständiges Logo, Slogan, Text, Biografien der Autoren.
- **Nutzungsrechte:** Bedingungen, Kontakt und Information zur Reichweitenmessung, in drei Sprachen: `/droits` (Französisch), `/en/droits` (Englisch), `/de/droits` (Deutsch). Die Sprachauswahl im Menü wechselt zwischen ihnen (die alten Adressen `/droits/en` und `/droits/de` führen zu den neuen). Die Texte werden unter [Rechte & Datenschutz](reglages#droits-et-confidentialité) eingestellt.
- **Karte** (wenn Sie sie unter [Öffentliche Website](reglages#carte-du-monde) veröffentlicht haben): eine Weltkarte in den Farben des Themes, mit dem runden Vorschaubild eines Fotos auf jeder Stadt und, als Plakette, der Zahl der Fotos aus dieser Stadt. Städte, die zu nah beieinander liegen, um unterschieden zu werden, werden gruppiert (Gesamtzahl); ein Klick auf die Gruppe vergrößert die Karte, bis sie sich trennen. Unter der Karte die Liste der Orte mit ihren Fotos; ein Klick auf ein Vorschaubild der Karte führt dorthin.

  | Geste | Wirkung |
  |---|---|
  | **+**, **−**, **Welt** | vergrößern, verkleinern, zurück zur ganzen Welt |
  | Aufziehen mit zwei Fingern (Smartphone), **Strg + Mausrad** oder Zwei-Finger-Geste auf dem Touchpad | Zoom an der gewählten Stelle |
  | ziehen (vergrößerte Karte) | sich bewegen |

  Beim Vergrößern wird der Hintergrund detaillierter (Küsten, Grenzen, kleine Inseln): Nur der angezeigte Bereich wird geladen. Das Mausrad allein und senkrechtes Wischen auf der Karte der ganzen Welt scrollen die Seite, wie anderswo. Ohne JavaScript ist die Karte fest, und die Liste der Orte bleibt vollständig.
- **„Ich habe Sie fotografiert“** (`/bonjour`): die Seite hinter dem QR-Code der Einwilligungskarten und der Kleidung (`/bonjour/J`: mit dem Namen des Fotografen), ohne Link im Menü (siehe [Begegnungen](rencontres)).
- **Impressum** (`/mentions-legales`, „Impressum“ auf Deutsch, Link in der Fußzeile jeder Seite): Anbieter, Adresse, Kontakt, Verantwortlicher für den Inhalt, Hosting (siehe [Rechte & Datenschutz](reglages#mentions-légales-impressum)).
- **Datenschutz** (`/confidentialite`, in drei Sprachen, Link in der Fußzeile): wer verantwortlich ist, was die Website erhebt und warum, wie lange, wer es erhält und wie man seine Rechte ausübt (siehe [Rechte & Datenschutz](reglages#droits-et-confidentialité)).
- **Seite nicht gefunden:** für eine unbekannte Adresse oder ein zurückgezogenes Foto.

## Immer

- **Ohne JavaScript, mit der Tastatur, mit einem Screenreader:** Die Website funktioniert.
- **Bilder:** Sie passen sich dem Bildschirm an (Format AVIF oder WebP, passende Größe).
- **Schutz:**
  - Rechtsklick und Ziehen der Bilder sind deaktiviert;
  - die Originale sind nie zugänglich;
  - Fotos im Entwurf sind nur in der Verwaltung sichtbar.
