# Reisetagebücher

Die **Reisetagebücher** sind die Beiträge der Website: Reiseberichte und Werkstattnotizen, datiert und signiert, mit Fotos aus der Fotothek. Sie werden in der Verwaltung geschrieben (Seitenleiste, Gruppe „Veröffentlichen“, **Reisetagebücher**); auf der öffentlichen Website erscheinen sie **nur in Version 2**: Solange v1 angewendet ist (Einstellungen → Darstellung), sind ihre Seiten nur für Administratoren in der Ansicht v2 sichtbar (Schaltfläche **In v2 ansehen** oben auf den Seiten der Website).

Die Seite **Reisetagebücher** listet die Beiträge, die neuesten zuerst, mit ihrem Status (○ Entwurf, ◐ Vorgeschlagen oder Geplant, ▲ Zu überarbeiten, ● Veröffentlicht, ✕ Zurückgezogen), ihren Signaturen, ihrer Rubrik und ihrem Datum. **Neuer Beitrag**: ein Titel, eine Rubrik (Reisen oder Werkstattnotizen) und eine oder zwei Signaturen; ein Fotograf signiert seine Beiträge immer selbst.

## Einen Beitrag schreiben

Der Editor öffnet die französische Fassung, die Originalsprache. Oben: der Titel, der Status, die Metadaten (Signaturen, Rubrik, Beginn) und **Gespeichert um …**.

- **Titel** (höchstens 120 Zeichen) und **Vorspann** (höchstens 300 Zeichen, zum Vorschlagen erforderlich): Die Zähler melden, ohne zu sperren, einen Titel über 70 oder einen Vorspann über 160 Zeichen (Suchmaschinen würden das Ende abschneiden).
- **Text**: in eingeschränktem Markdown (siehe unten). Ein Foto steht allein in seiner Zeile: `photo:quai-7h12`.
- **Automatische Speicherung**: Mit dem Skript wird der Text alle paar Sekunden beiseitegelegt („Gespeichert um 22:42“), nie im veröffentlichten Beitrag. Beim erneuten Öffnen übernimmt der Editor diesen Text und bietet **Im Beitrag speichern** oder **Verwerfen** an. Fällt das Netz aus, bleibt eine Kopie auf dem Gerät. Ohne Skript: **Speichern und Vorschau ansehen**.
- **Vorschau**: unter dem Text (auf dem Telefon der Reiter **Vorschau**) der Beitrag wie auf der Website, vom Server gerendert; ein nicht veröffentlichtes Foto ist markiert.
- **Sprachen**: Die Reiter **Français**, **English**, **Deutsch** zeigen den Stand jeder Sprache (veröffentlicht, zu prüfen, leer). Eine Übersetzung wird nur veröffentlicht, wenn **Übersetzung geprüft: auch auf … veröffentlichen** angekreuzt ist; sonst zeigt die Seite dieser Sprache den französischen Text mit einem Hinweis, ohne Weiterleitung. **Übersetzung vorschlagen** (wenn der lokale Übersetzer installiert ist) füllt die Felder, zu prüfen.
- **Weitere Einstellungen** (eingeklappt): Signaturen, Rubrik, Titelbild und Bild zum Teilen (standardmäßig das erste Foto des Textes), verknüpfte Reise, „An … schreiben“ unten im Beitrag, Adresse (sie folgt dem Titel bis zur ersten Veröffentlichung; danach geändert, führt die alte zur neuen), **Aktualisierung anzeigen** („Aktualisiert am …“; ein Tippfehler rechtfertigt das nicht), **Werbehinweis** (Inhalt in Partnerschaft) und **Gegendarstellung** (die Antwort einer genannten Person, datiert, nach dem Beitrag).
- **Versionen**: Jedes Speichern bewahrt eine Version (die letzten 30), zum Wiederherstellen. Hat inzwischen jemand gespeichert, wird nichts überschrieben: Ihr Text bleibt erhalten, zum Übernehmen.

## Die Formatierung

| Schreiben | Für |
|---|---|
| `## Samstag, Lissabon` | einen Zwischentitel; mindestens zwei ergeben das Inhaltsverzeichnis |
| <code>&#42;&#42;fett&#42;&#42;</code>, `*kursiv*` | die Hervorhebung |
| `> ein Zitat` | ein Zitat; `> (pt-PT) …` nennt seine Sprache, `> Übersetzung: …` seine Übersetzung, `> — Inês` seine Quelle |
| `- ein Punkt` | eine Liste |
| <code>[Text]&#40;https://…)</code> | einen Link; Titel `"gesponsert"` für einen bezahlten oder Affiliate-Link |
| <code>[Text]&#40;serie:rue)</code>, `voyage:…`, `carnet:…`, `photo:…` | einen Link zur Website (nicht veröffentlicht: einfacher Text) |
| `photo:quai-7h12` allein in der Zeile | ein Foto |
| zwei `photo:`-Zeilen hintereinander | ein Paar (ein Diptychon, wenn es die beiden Blicke sind) |
| drei bis zwölf `photo:`-Zeilen | eine Galerie |

Die Leiste (mit dem Skript) fügt diese Formen ein; **Foto…**, **Galerie…** und **Interner Link…** öffnen die Fotoauswahl. Kürzel: Strg oder ⌘ + B, I, K (Link), S (speichern). HTML wird als Text angezeigt; ein Bild einer anderen Website wird entfernt; ein Link mit unbekanntem Schema wird zu Text.

## Die Fotos eines Beitrags

Das Feld **Fotos des Beitrags** zeigt jedes Foto des Textes in der Reihenfolge, mit seinem Status (● Veröffentlicht, ○ Entwurf, ▲ Einwilligung zu prüfen, ✕ Gesperrt):

- **Foto beschreiben…**: sein **Alternativtext** (was es zeigt, für alle, die es nicht sehen; zum Vorschlagen erforderlich, außer bei einem dekorativen Foto), seine **Bildunterschrift** und seine **Größe** (Textbreite oder volle Breite), je Sprache. Leer gilt der Alternativtext der Fotothek.
- **Aus dem Beitrag entfernen**: Seine Zeile verschwindet aus dem Text in allen drei Sprachen.
- **Fotos hinzufügen** (ohne Skript): Angekreuzte Fotos werden am Ende des Textes hinzugefügt, je eine Zeile. Nur veröffentlichte oder eigene Fotos sind möglich.

Auf der Website erscheint ein nicht veröffentlichtes Foto nicht; jedes Foto führt zum Viewer im Kontext des Beitrags (zurück zum Beitrag, benachbarte Fotos des Beitrags).

## Der Veröffentlichungsablauf

Wie bei den Fotos: Der Fotograf **schlägt vor**, der Moderator **veröffentlicht** (sofort oder zu einem Datum) oder **schickt zurück** mit einer Anmerkung.

- **… vorschlagen**: prüft Vorspann, Alternativtexte und Einwilligungen; was sperrt, steht oben, mit einem Link zu jedem Punkt. Fotos im Entwurf gehen mit dem Beitrag mit.
- **Veröffentlichen** oder **Planen** (Feld **Veröffentlichung**): Schreiben Sie Tag und Uhrzeit, wie Sie möchten („Samstag 8 Uhr“, „17.10. 8:00“); ein vergangenes Datum wird abgelehnt. Fotos der Unterzeichnenden im Entwurf (oder bereits vorgeschlagene) werden mit dem Beitrag veröffentlicht (oder zur selben Zeit geplant), wenn Sie sie veröffentlichen dürfen; sonst veröffentlichen Sie sie zuerst. Zur geplanten Zeit veröffentlicht die „geplante Veröffentlichung“ den Beitrag; ist ein Foto nicht mehr veröffentlicht, geht er mit dem Grund „zu überarbeiten“ zurück. Ein geplanter Beitrag, den jemand ohne Veröffentlichungsrecht ändert (Text, Foto, wiederhergestellte Version), wird wieder „vorgeschlagen“: Er wird vor dem Erscheinen erneut geprüft.
- **Zurückschicken…** (Anmerkung erforderlich), **Planung aufheben**, **Von der Website zurückziehen…** (Grund erforderlich; die Adresse antwortet „zurückgezogen“) und **Wieder veröffentlichen**. Ein nie veröffentlichter Beitrag wird gelöscht; ein veröffentlichter wird zurückgezogen.
- **Rechte**: Ein Fotograf schreibt und schlägt seine Beiträge vor (die er signiert) und bearbeitet die veröffentlichten; „Eigene Beiträge ohne Freigabe veröffentlichen“ wird je Fotograf eingestellt (Einstellungen → Veröffentlichungsablauf). Der Korrektor korrigiert die Texte; der Moderator veröffentlicht.

## Auf der Website

In v2 erscheint **Reisetagebücher** im Menü, sobald ein Beitrag veröffentlicht ist. Die Liste filtert nach **Rubrik** und nach **Blick** (jede Wahl nennt ihre Anzahl), 12 Beiträge pro Seite. Ein Beitrag beginnt mit Titelbild, Autoren, Daten und Inhaltsverzeichnis; dann der Text, „An … schreiben“ (eine Nachricht an die auf der Seite Reisetagebücher eingestellte Adresse, standardmäßig die des Impressums; nichts wird gespeichert), **Diesen Beitrag teilen**, die Fotos des Beitrags und die benachbarten Beiträge. Leser abonnieren den **RSS-Feed der Reisetagebücher**, einen je Sprache. Sitemap und Suchmaschinen sehen nur veröffentlichte Beiträge, in ihren veröffentlichten Sprachen.

Bei öffentlichen Fotos und Reisen verweist **In den Reisetagebüchern** auf bis zu sechs öffentliche Beiträge, die sie erwähnen, neueste zuerst. Dafür sind eine veröffentlichte Sprache und ein Verweis in dieser Sprache oder ein gemeinsames Titelbild beziehungsweise eine verknüpfte Reise erforderlich. Entwürfe, private oder zurückgezogene Beiträge und unveröffentlichte Übersetzungen bleiben ausgeschlossen; eine Teamvorschau öffnet den Bereich nicht für Besucher.
