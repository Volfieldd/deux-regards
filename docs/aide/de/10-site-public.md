# Die Website aus Sicht der Besucher

Was Ihre Besucher tun können, damit Sie wissen, was Ihre Einstellungen verändern.

## Themen je Bereich

Das Erscheinungsbild kann je Bereich variieren: Startseite, Galerien, Fotos, Karte, Reisen, Journale, Fotografen, Kontakt oder Informationen. Die drei bisherigen Ansichten und sechs Dunkelkammer-Designs stehen zur Wahl. Die Auswahl erfolgt unter [Erscheinungsbild → Themen und Bereiche](apparence#thèmes-et-rubriques); die Installation des Updates verändert die veröffentlichte Website nicht.

In einem Dunkelkammer-Design werden die Bilder am Anfang manuell ausgewählt, ohne automatische Wiedergabe. Der **Ruhemodus** in der Fußzeile reduziert optionale Bewegungen; die Einstellung des Geräts für reduzierte Bewegung wird immer berücksichtigt. Fotos behalten verwandte Bilder und eine Minikarte, wenn ein Ort veröffentlicht ist. Reisen und Journale behalten ihre Funktionen. Private Galerien behalten ihre eigene Ansicht.

Wenn Themen je Bereich aktiviert sind, öffnet das Menü Galerie `/galerie` mit einem eigenen Thema. Journale bleiben auch mit V1 als allgemeinem Thema erreichbar; sie verwenden dann die V2-Ansicht. Die folgenden Beschreibungen der Startseite beziehen sich auf die bisherigen Ansichten V1 und V2.

## Sprachen

Die Website gibt es auf **Französisch** (übliche Adressen, `/photo/…`), **Englisch** (`/en/…`) und **Deutsch** (`/de/…`).

- **Was übersetzt ist:** Menüs, Abschnittstitel, Schaltflächen, Fußzeile, Datumsangaben („oct. 2024“, „Oct 2024“, „Okt. 2024“), Ländernamen auf der Karte. Diese Texte liefert die Website, ohne maschinelle Übersetzung.
- **Ihre Texte** (Slogan, Einleitung, Über uns, Biografien, Namen der Serien, Titel, Bildunterschriften und Orte der Fotos): Ihre englische und deutsche Fassung ist **optional**; Sie füllen sie in der Verwaltung aus (unter jedem Feld eingeklappt, „auf Englisch und Deutsch“). Fehlt sie, wird eine andere Sprache angezeigt:
  - Seite auf Deutsch: Deutsch, sonst Französisch, sonst Englisch;
  - Seite auf Englisch: Englisch, sonst Französisch, sonst Deutsch;
  - Seite auf Französisch: Französisch, sonst Englisch, sonst Deutsch.
- **Auswahl:** am Ende des Menüs (und oben auf der Seite eines Fotos) die Flagge und das Sprachkürzel (🇫🇷 FR). Sie öffnet **dieselbe Seite** in einer anderen Sprache, Filter inbegriffen. Das Sprach-Cookie speichert die Wahl und wird erst in diesem Moment gesetzt. Das Abstimmungs-Cookie einer Ausstellung erfordert eine gesonderte Einwilligung, die bei der ersten Stimme abgefragt wird.
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

## Startseite, Galerie und Serien in v2

Wenn die **v2** angewendet ist (Erscheinungsbild → Öffentliche Website: v1 oder v2), ändern sich diese Seiten so:

- **Eröffnung:** das **ganze** Foto in Bildschirmhöhe, ohne Schleier und ohne Text darauf; darunter Ihr Leitsatz als Titel und die Bildangabe (Titel, Fotograf, Ort, Datum, **Foto ansehen**). Die Diashow ist **angehalten**: Die Punkte wählen ein Foto, **Abspielen** startet sie (alle 6 Sekunden ein Foto), **Pause** hält sie an; unter der Maus wartet sie, sobald die Tastatur die Eröffnung erreicht, hält sie an, und sie läuft nicht, wenn der Besucher weniger Bewegung gewünscht hat. Nur das erste Foto wird mit der Seite geladen. Der Rahmen nimmt das breiteste Format Ihrer Eröffnungsfotos an: Ein Hochformat zwischen Querformaten passt ganz hinein, schmaler.
- **Zwei Blicke:** „Beide“ führt zur Galerie der Startseite, ein Fotograf zu seiner Galerie (`/auteur/julien`).
- **Serien:** eine Reihe von Titelbildern (das erste Foto jeder Serie), jedes zur Seite seiner Serie.
- **Galerie:** unten auf der Startseite (`/#galerie`). Eine **Filterleiste** (der Blick, die **Reihenfolge** in einem Menü, die Serien mit Titelbild und Anzahl der Fotos); jede Auswahl öffnet eine Seite mit eigener Adresse zum Teilen, ohne Skript. Ab Tablet-Breite bleibt die Leiste beim Blättern oben.
- **Reihen:** Jedes Foto behält sein Format (ein Hochformat bleibt hoch), in gemeinsamer Höhe und **in der Reihenfolge der Fotothek**: Die erste Reihe liest sich von links nach rechts, dann die nächste; die Tastatur folgt derselben Reihenfolge. Auf dem Telefon höchstens zwei Fotos pro Reihe.
- **Zwei Filter ohne gemeinsames Foto** (eine geteilte Adresse, etwa „Reise, von Julien“): Die Seite sagt es und bietet die ganze Serie oder alle Fotos des Fotografen an; jeder Filter lässt sich mit einem Griff entfernen (**✕**).
- **Seite einer Serie** (`/serie/rue`): ihr Name als Titel, die Anzahl der Fotos, die Fotografen und die Jahre, dann die Fotos ab dem ersten Bildschirm (ohne großes Titelbild), „Dieselbe Serie, ein Blick“ und die weiteren Serien.

## Formulare in v2 („Ich habe Sie fotografiert“, Melden, Teilen)

Wenn die **v2** angewendet ist, erhalten die Seite „Ich habe Sie fotografiert“ (`/bonjour`), „Dieses Foto melden“ und die Seite **Teilen** (die ohne Skript oder in einem neuen Tab geöffnet wird) die Gestaltung der v2. Die Felder ändern sich nicht: Was die Person sendet und was Sie erhalten, ist dasselbe wie in v1.

- **Eine einzige Regel** oben: Alle Felder sind Pflichtfelder, außer den als „optional“ markierten; die Hilfe jedes Feldes steht unter seinem Namen („Nötig, wenn Sie einer Veröffentlichung zustimmen“).
- **Nach einem unvollständigen Senden** bleiben die Eingaben erhalten, und jeder Fehler steht unter seinem Feld (unter dem Titel der Gruppe bei Kästchen), „⚠ Fehler:“ und wie man ihn behebt; der Titel des Tabs beginnt mit „Fehler“. Ab zwei Punkten erhält eine **Zusammenfassung** oben den Fokus, mit einem Link zu jedem Feld; bei nur einem steht der Cursor schon im Feld.
- **Zu viele Sendungen von derselben Verbindung** (8 pro Stunde auf `/bonjour`, 5 bei Melden): Eine eigene Meldung, die kein Eingabefehler ist, bittet, es in einer Stunde erneut zu versuchen; nichts von den Eingaben geht verloren.
- **Nach dem Senden** erhält der Titel „Danke, notiert.“ (oder die Meldung von Melden) den Fokus; die Referenz der Karte wird wiederholt.
- **Teilen**: das Fenster des Bildbetrachters als Seite, unter einem Link zurück zum Foto; mit dem Skript funktioniert **Link kopieren** auch dort.
- Das **geschenkte Foto** (`/pour-vous/…`) behält seine Kopfzeile, die nur den Namen der Website zeigt, ohne Menü und ohne Sprache.

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

**Gefällt mir und Melden**: unter dem Text jedes Fotos ein Herz **Gefällt mir** (anonym: kein Konto, kein Cookie; Besucher können es zurücknehmen, die Zahl steht daneben; zwei Personen hinter derselben Verbindung, etwa demselben Router, zählen 12 Stunden lang nur ein „Gefällt mir“ pro Foto) und ein Link **Melden**: Foto, das nicht online sein sollte, Vorschlag zum Text, etwas anderes, mit einer Nachricht und einer optionalen Adresse. Wer sich erkennt, wird zu `/bonjour` geleitet. Meldungen erscheinen in „Heute“ und auf der Seite **Meldungen von Besuchern**, geöffnet über **Meldungen** in der Seitenleiste (mit der Zahl der neuen), auch wenn alles erledigt ist (die hinterlassene Adresse sehen dort nur Administratoren; der Moderator liest die Nachricht); die Zahl der „Gefällt mir“ steht im Abschnitt Publikum der Fotoseite.

**Teilen**: neben dem Herz. Auf dem Telefon öffnet es das Teilen-Menü des Telefons (Instagram, Signal, Nachrichten, WhatsApp…). Am Computer zeigt ein Fenster die Vorschau (Bild, Titel, Fotograf, Website), die Schaltflächen WhatsApp, Facebook, Bluesky, X, Pinterest und E-Mail, **Auf Instagram ansehen**, wenn das Foto von der Website aus gepostet wurde, den Link zum Kopieren und einen QR-Code, um das Foto auf einem Telefon zu öffnen. Geteilt wird die Seite, nie die Datei. Es sind einfache Links: kein Skript dieser Dienste wird geladen, kein Cookie gesetzt. Ohne JavaScript führt die Schaltfläche zu einer Seite mit denselben Links. Geteilte Fotos werden anonym gezählt (siehe [Statistiken](statistiques)).

**Wo und in der Nähe**: Ist im Datenblatt des Fotos **Auf der Weltkarte anzeigen** aktiviert, erscheint neben dem Text eine kleine Karte, zugeschnitten auf seinen Ort. Das Vorschaubild des Fotos erscheint in einem Kreis, die anderen Fotos im Umkreis von 250 km als Markierungen mit dem Namen ihres Ortes; jede Markierung führt zu ihrem Foto. Unter dem Foto zeigt die Reihe **In der Nähe** die nächsten, mit Ort und Entfernung. Nur Fotos, die „auf der Karte“ aktiviert sind, erscheinen, und nur der Ort ist bekannt, nie die genaue Position. Der Link **Weltkarte ansehen** erscheint, wenn die Seite Karte veröffentlicht ist.

**Datum und Uhrzeit**: das Datum des Fotos, wie Sie es eingegeben haben (auf den Monat oder den Tag genau). Die Aufnahmezeit erscheint nur, wenn im Datenblatt **Uhrzeit auf der Website zeigen** angekreuzt und das Datum tagesgenau ist: „1. Mai 2025, 14:32 Uhr“ („14 h 32“, „2:32 pm“), in der Bildlegende und der Zeile „Ort, Datum und Uhrzeit“. Sie wird nur auf der Seite des Fotos gezeigt, nie in der Galerie, unter In der Nähe, auf der Karte oder in den Vorschauen beim Teilen.

**Aufnahmedaten**: Kamera, Objektiv, Brennweite, Belichtungszeit, Blende und Empfindlichkeit aus den EXIF-Daten des Originals, in der Reihenfolge des Lexikons: „Fujifilm X-T5 · XF23mmF1.4 R LM WR · 23 mm · 1/1000 s · f/11 · ISO 160“ („18,3 mm“ auf Deutsch und Französisch, „18.3 mm“ auf Englisch). In v2 und v3 ist es die Zeile **Aufnahmedaten** in den Angaben des Betrachters, nach dem Fotografen; in v1 eine zweite Zeile unter der Zeile mit Nummer, Serie und Ort. Standardmäßig gezeigt; das Kästchen **Aufnahmedaten auf der Website zeigen** im Datenblatt blendet sie aus. Nie die Uhrzeit an dieser Stelle (sie folgt ihrem eigenen Kästchen), weder der genaue Ort noch die Seriennummer.

## Meldungen von Besuchern

Die Seite **Meldungen von Besuchern** (Seitenleiste, Gruppe Personen; Administratoren und Moderatoren) empfängt, was Besucher über den Link **Melden** eines Fotos senden: die Art (sollte nicht online sein, Vorschlag zum Text, etwas anderes), die Nachricht, die Sprache des Besuchers und die für eine Antwort hinterlassene Adresse (nur für Administratoren sichtbar; der Moderator weiß nur, dass eine Adresse hinterlassen wurde). Nachricht und Adresse werden verschlüsselt und nach 12 Monaten gelöscht. Eine Meldung nimmt nichts von selbst offline: Öffnen Sie das Foto und entscheiden Sie.

- **Als erledigt markieren** legt die Meldung zu den erledigten; der Zähler in der Seitenleiste sinkt.
- **Löschen…** löscht Nachricht und Adresse; in der Verwaltung v2 fragt zuerst ein Dialog (Abbrechen steht vorn).
- In der Verwaltung v2 sortieren die Filter **Neu** und **Erledigt** die Liste; jede Karte nennt das Foto, zeigt die Art als Plakette mit Symbol und die Nachricht in ihrer Sprache.

## Nachrichten und Anfragen

Die Seite **Nachrichten und Anfragen** (Seitenleiste, Gruppe Personen; Administratoren, und Fotografen für ihre eigenen) empfängt, was Besucher über die Seite **Kontakt** (`/contact`) und über eine **Lizenzanfrage** (`/droits/demande`, geöffnet über „Lizenz anfragen“ unter jedem Foto in v2 und auf der Seite Rechte) senden.

- **Die Liste** (50 Nachrichten pro Seite) zeigt keine personenbezogenen Daten: die Art (Nachricht oder Lizenzanfrage), das Datum, an wen sie gerichtet ist, Foto und geplante Nutzung einer Anfrage, die Sprache, den Status. Ein Fotograf sieht die an ihn gerichteten Nachrichten (eine Lizenzanfrage geht an den Fotografen des Fotos) und die an beide.
- **Lesen** öffnet die Nachricht: Name, Firma, E-Mail-Adresse, Verbreitung und Text. Dieses Lesen wird protokolliert („Nachricht gelesen“). Der Text wird unverändert angezeigt: Ein Link ist darin nie anklickbar (Vorsicht bei einem Link oder einer Adresse, die einen Verlag oder ein Medium nachahmt).
- **Per E-Mail antworten** öffnet Ihr E-Mail-Programm mit der Adresse des Besuchers. Die Website selbst sendet dem Besucher nichts: keine Eingangsbestätigung.
- **Als erledigt markieren** ordnet die Nachricht unter den erledigten ein; **Löschen…** löscht sie endgültig (in einem Aufklappbereich in der Verwaltung v1, in einem Dialog in v2).
- Name, Adresse und Nachricht werden verschlüsselt und 12 Monate nach dem Senden gelöscht. „Heute“ zählt die zu lesenden Nachrichten. Ist der E-Mail-Server der Website eingerichtet, erhält jeder betroffene Fotograf „Eine neue Nachricht wartet auf Sie“ und den Link zu dieser Seite, ohne etwas aus der Nachricht (höchstens 30 E-Mails pro Tag; darüber hinaus warten die Nachrichten hier).

## Weitere Seiten

- **Reisen** (sobald eine Reise veröffentlicht ist, siehe [Fotografierte Personen](rencontres#les-voyages)): die Liste der Reisen, dann eine Seite pro Reise. Oben ein großes Foto, der Name, die Daten, die Fotografen, dann der Text. Danach eine **auf die Reise zugeschnittene Karte**: die Route als gepunktete Linie, eine nummerierte Markierung pro Etappe (zwei Tage hintereinander am selben Ort ergeben eine) und ein Kästchen „T1 · 1. Sept. · Lissabon“ an jeder Etappe; ein Klick auf eine Etappe führt zu ihrem Tag. Schließlich die Erzählung **Tag für Tag** mit den veröffentlichten Fotos jedes Tages, in der Reihenfolge der Aufnahme (das große Foto ist das erste, wie in der Verwaltung). Nur veröffentlichte Fotos erscheinen, und die Karte verortet nur die mit Häkchen bei „Auf der Weltkarte anzeigen“ (ohne sie keine Karte). Auf dem Telefon lässt sich die Karte mit dem Finger verschieben.
- **Suchen** (falls angeboten, siehe [Website](reglages#suche)): ein Feld, dann die gefundenen Fotos, die passendsten zuerst. Jedes Wort muss gefunden werden; ein Wortanfang genügt („Neb“ findet „Nebel“); Akzente und Großschreibung spielen keine Rolle; ß, œ, æ, ø zählen als ss, oe, ae, o („strasse“ findet „Straße“). Bei gleicher Relevanz gilt die Reihenfolge der Galerie. Ein Wort aus einem einzigen Buchstaben genügt nicht: Die Seite verlangt mindestens zwei. Ergebnisseiten werden von Suchmaschinen nicht indexiert.
- **Nutzungsrechte:** Bedingungen, Kontakt und Information zur Reichweitenmessung, in drei Sprachen: `/droits` (Französisch), `/en/droits` (Englisch), `/de/droits` (Deutsch). Die Sprachauswahl im Menü wechselt zwischen ihnen (die alten Adressen `/droits/en` und `/droits/de` führen zu den neuen). Die Texte werden unter [Rechte & Datenschutz](reglages#droits-et-confidentialité) eingestellt.
- **Karte** (wenn Sie sie unter [Öffentliche Website](reglages#carte-du-monde) veröffentlicht haben): eine Weltkarte in den Farben des Themes, mit dem runden Vorschaubild eines Fotos auf jeder Stadt und, als Plakette, der Zahl der Fotos aus dieser Stadt. Städte, die zu nah beieinander liegen, um unterschieden zu werden, werden gruppiert (Gesamtzahl); ein Klick auf die Gruppe vergrößert die Karte, bis sie sich trennen. Unter der Karte die Liste der Orte mit ihren Fotos; ein Klick auf ein Vorschaubild der Karte führt dorthin.

  | Geste | Wirkung |
  |---|---|
  | **+**, **−**, **Welt** | vergrößern, verkleinern, zurück zur ganzen Welt |
  | Aufziehen mit zwei Fingern (Smartphone), **Strg + Mausrad** oder Zwei-Finger-Geste auf dem Touchpad | Zoom an der gewählten Stelle |
  | ziehen (vergrößerte Karte) | sich bewegen |

  Beim Vergrößern wird der Hintergrund detaillierter (Küsten, Grenzen, kleine Inseln): Nur der angezeigte Bereich wird geladen. Das Mausrad allein und senkrechtes Wischen auf der Karte der ganzen Welt scrollen die Seite, wie anderswo. Ohne JavaScript ist die Karte fest, und die Liste der Orte bleibt vollständig.
- **„Ich habe Sie fotografiert“** (`/bonjour`): die Seite hinter dem QR-Code der Einwilligungskarten und der Kleidung (`/bonjour/J`: mit dem Namen des Fotografen), ohne Link im Menü (siehe [Begegnungen](rencontres)).
- **Impressum** (`/mentions-legales`, „Impressum“ auf Deutsch, Link in der Fußzeile jeder Seite): Anbieter, Adresse, Kontakt (E-Mail als Link, Telefon), Verantwortlicher für den Inhalt, Hosting (siehe [Rechte & Datenschutz](reglages#mentions-légales-impressum)).
- **Datenschutz** (`/confidentialite`, in drei Sprachen, Link in der Fußzeile): wer verantwortlich ist, was die Website erhebt und warum, wie lange, wer es erhält und wie man seine Rechte ausübt (siehe [Rechte & Datenschutz](reglages#droits-et-confidentialité)). Bis zum Ausstellungsende führt **Meine Stimmen** zu den in diesem Browser erkannten Stimmen, um sie einzusehen, zu exportieren oder die Einwilligung zu widerrufen. Dieser persönliche Weg bleibt in v1 ohne Zwischenspeicherung erreichbar; neue Stimmen können dort nicht abgegeben werden (siehe [Ausstellungen](saisons#vote-consultatif-et-droits-des-visiteurs)).
- **Kontakt** (`/contact`, Link in der Fußzeile jeder Seite und von Über uns, Teil „Schreiben Sie uns“): „An Sébastien, an Julien oder an beide schreiben“: der Empfänger, die Nachricht, Name und E-Mail-Adresse des Besuchers. **Lizenz anfragen** (`/droits/demande`, mit dem Foto vorausgefüllt aus dem Bildbetrachter v2 und der Seite Rechte): das Foto, die geplante Nutzung (Buch oder Presse, Website oder soziale Netzwerke, Werbung, Sonstiges), Verbreitung und Dauer, die Nachricht, der Name, die Firma, die Adresse. Beide kommen in [Nachrichten und Anfragen](site-public#messages-et-demandes) an; ohne JavaScript, mit denselben Schutzmaßnahmen wie `/bonjour` (verstecktes Anti-Roboter-Feld, Senden von einer anderen Website abgelehnt, 8 Sendungen pro Stunde und Verbindung, insgesamt 50 Nachrichten pro Tag: darüber hinaus wird der Besucher gebeten, am nächsten Tag wiederzukommen). Dem Besucher wird nichts gesendet.
- **Seite nicht gefunden:** für eine unbekannte Adresse oder ein zurückgezogenes Foto.

## Weitere Seiten in v2

Wenn die **v2** angewendet ist, erhalten die übrigen Seiten der Website dieselbe Gestaltung (Kopfzeile, vollständige Fußzeile, dieselben Schaltflächen):

- **Datenschutz, Impressum:** derselbe Text wie in v1, mit einem Inhaltsverzeichnis **Auf dieser Seite**: Ein Klick führt zum gewählten Teil. Am Computer bleibt das Inhaltsverzeichnis links neben dem Text; am Telefon steht es oben, und jeder Teil endet mit **↑ Inhalt**. Kurze Zeilen, leicht zu lesen; gedruckt schwarz auf weiß, ohne Menü.
- **Nutzungsrechte, Über uns:** derselbe Text, in kurzen Zeilen; „Über uns“ zeigt Ihre Fotografen, ihre Biografie und **Die Fotos von … ansehen** (ohne das Logo oben: Die Marke steht in der Kopfzeile).
- **Suchen:** dasselbe Feld, mit Beschriftung und Hilfe darüber; die gefundenen Fotos in Reihen. Ohne Ergebnis (oder vor der Suche) die Serien zum Stöbern.
- **Karte:** Sie öffnet sich **auf Ihre Orte zugeschnitten** (mit oder ohne JavaScript); **Welt** zeigt die ganze Welt. Der Name jeder Stadt steht neben ihrem Vorschaubild, wenn Platz ist. Jeder Ort der Liste hat sein **↑ Karte**.

  | Geste | Wirkung |
  |---|---|
  | **+**, **−**, **Welt** | vergrößern, verkleinern, ganze Welt |
  | die vier Pfeilschaltflächen oder **← → ↑ ↓** auf der Tastatur (auf einem Vorschaubild oder einer Schaltfläche der Karte) | Karte verschieben |
  | **+** und **−** auf der Tastatur | vergrößern, verkleinern |

  Ein Vorschaubild außerhalb des Ausschnitts ist mit der Tastatur nicht mehr erreichbar.
- **Reisen:** jede Reise mit ihrem Titelbild in seinem Format; die Seite einer Reise zeigt das ganze Foto neben dem Titel (kein Titel mehr auf dem Foto), die Liste der Tage, die Karte der Route (am Telefon ohne seitliches Scrollen: Die Etappen sind dort nummeriert, die Beschriftungen erscheinen nur am Computer), dann die Tage in Reihen.
- **Seite nicht gefunden:** ein Feld, um ein Foto zu suchen, die Galerie, die Serien, „Über uns“; die Sprachauswahl führt zur Startseite jeder Sprache.

## Immer

- **Ohne JavaScript, mit der Tastatur, mit einem Screenreader:** Die Website funktioniert.
- **Bilder:** Sie passen sich dem Bildschirm an (Format AVIF oder WebP, passende Größe).
- **Schutz:**
  - Rechtsklick und Ziehen der Bilder sind deaktiviert;
  - die Originale sind nie zugänglich;
  - Fotos im Entwurf sind nur in der Verwaltung sichtbar.

## Automatische Suchmetadaten

[Einstellungen → Suchmaschinen](reglages#référencement) steuert die Indexierungswünsche. Titel, Beschreibungen, Fotoinformationen, Vorschauen und Sitemap folgen veröffentlichten Inhalten. Nichtindexierung beschränkt den Zugriff nicht; private Galerien behalten ihre Schutzmaßnahmen. Über Indexierung, Zeitpunkt und Darstellung entscheiden die Suchmaschinen.

In v2/v3 zeigt eine Fotografenseite den Namen als Überschrift und die öffentliche Vorstellung vor den Fotos. Foto- und Reiseseiten verlinken auf öffentliche Notizbücher, die sie in veröffentlichten Sprachen erwähnen, auch ohne JavaScript.
