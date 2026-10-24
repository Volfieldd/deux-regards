# Öffentliche Website, Rechte und Datenschutz

Zwei Seiten der Gruppen **Veröffentlichen** und **Einstellungen** in der Seitenleiste; jede speichert nur ihre eigenen Felder.

## Öffentliche Website

Was die Besucher sehen. Slogan, Einleitung und „Über“ haben jeweils eine optionale **englische und deutsche** Fassung, unter dem französischen Feld eingeklappt („… auf Englisch und Deutsch“; der Status zeigt *optional*, *1 von 2 Sprachen* oder *übersetzt*). Leer: Englisch- und deutschsprachige Besucher lesen den französischen Text (siehe [Die Website aus Sicht der Besucher](site-public)). Die Schaltfläche **Übersetzung vorschlagen** füllt ein Feld vor (siehe [Fotos](photos), „Das Datenblatt eines Fotos“).

In der **Verwaltung v2** wird jedes Feld beim Verlassen gespeichert (das ganze Formular wird gesendet, wie mit der Schaltfläche), mit **Rückgängig**; die Start-Diashow wird an Ort und Stelle geordnet; ohne JavaScript **Öffentliche Website speichern** (eine einzige Schaltfläche).

| Feld | Wo es erscheint |
|---|---|
| **Name der Website** | Text-Logo, Seitentitel, Variable `{site}` des Wasserzeichens. Leer: Standardname des Servers. |
| **Slogan** | Titel des Abschnitts „Blicke“ der Startseite, Titel von „Über uns“, Beschreibung für Suchmaschinen |
| **Einleitung** | Text unter dem Slogan, auf der Startseite |
| **Über** | Seite „Über uns“. Trennen Sie Absätze durch eine Leerzeile. |
| **Weltkarte** | siehe unten |
| **Suche** | siehe unten |
| **Fotos der Start-Diashow** | die Vollbild-Diashow der Startseite, in der gewählten Reihenfolge (siehe unten) |
| **Start-Diashow auf dem Handy (v3)** | die Diashow der Startseite auf dem Handy, mit der öffentlichen Website v3 (siehe unten) |

### Weltkarte

Kästchen **Weltkarte veröffentlichen**, standardmäßig nicht aktiviert. Aktiviert: Die Seite `/carte` ist für Besucher geöffnet, ein Link **Karte** erscheint im Menü der Website, und die Seite wird in `sitemap.xml` aufgenommen. Nicht aktiviert: Besucher erhalten „Seite nicht gefunden“; angemeldet sehen Sie sie als **Vorschau** (Banner oben). Das Feld zeigt, wie viele Fotos auf der Karte sind. Nur **veröffentlichte** Fotos, in deren Datenblatt **Auf der Weltkarte anzeigen** aktiviert ist, erscheinen dort (siehe [Fotos](photos)).

### Suche

Kästchen **Suche anbieten**, standardmäßig aktiviert: Ein Link **Suchen** (eine Lupe auf dem Telefon) erscheint im Menü der Website und öffnet `/recherche`. Besucher durchsuchen dort die veröffentlichten Fotos nach Stichwörtern, in Titeln, Bildunterschriften, Orten, Städten und Regionen, Serien, Fotografen und den **Stichwörtern** der Fotos, in allen drei Sprachen. Nicht aktiviert: Die Seite existiert für Besucher nicht mehr.

Kästchen **Stichwörter auf der Seite des Fotos anzeigen**, standardmäßig nicht aktiviert. Aktiviert: Die Stichwörter erscheinen unter der Bildunterschrift, und jedes führt zur Suche. Sonst dienen sie nur der Suche.

### Fotos der Start-Diashow

Die Vollbild-Diashow der Startseite, **in der von Ihnen gewählten Reihenfolge**.

- **Hinzufügen:** Aktivieren Sie ein veröffentlichtes Foto unter „Veröffentlichte Fotos hinzufügen“. Es wird am Ende der Diashow angefügt.
- **Vorschaubilder:** Jedes zeigt das **ganze** Foto, ohne es zu verzerren oder zu beschneiden, in einem Rahmen im Format 3:2 (neutrale Streifen ergänzen Hochformatfotos).
- **Anordnen:** Ziehen Sie unter „Reihenfolge der Diashow“ ein Vorschaubild, oder nutzen Sie **←** und **→** unter jedem Vorschaubild.
- **Entfernen:** **✕** unter dem Vorschaubild.
- **Grenze:** 8 Fotos. Der Zähler („5 / 8 ausgewählt“) zeigt es an; bei 8 werden die übrigen Kästchen deaktiviert, und eine Meldung weist darauf hin.
- **Ohne Auswahl:** die ersten 5 veröffentlichten Fotos der Galerie.
- **Foto zurückgezogen oder gelöscht:** Es verlässt die Start-Diashow. **Adresse geändert:** Es bleibt darin.

Klicken Sie auf **Start-Diashow speichern** (oder **Öffentliche Website speichern** unten auf der Seite). Ohne JavaScript speichern die Schaltflächen ← → ✕ sofort.

### Start-Diashow auf dem Handy (v3)

Mit der öffentlichen Website in **v3** (siehe [Erscheinungsbild](apparence)) füllt das Startfoto den Bildschirm: am Computer ein Querformat, am Handy ein Hochformat. Diese zweite Liste ist der Einstieg **für das Handy**.

- **Dieselben Handgriffe** wie bei der Diashow oben: ankreuzen, mit ← → ordnen, mit ✕ entfernen; höchstens 8 Fotos.
- **Nur Hochformate:** Die Auswahl bietet nur veröffentlichte Fotos an, die höher als breit sind.
- **Ohne Auswahl:** Das Handy zeigt die Diashow oben (ein Querformat nimmt die Breite ein, der Titel steht darunter).
- **In v1 und v2** dient diese Liste nicht: Der Einstieg ist überall derselbe.
- Jedes Foto der Diashow behält seinen **Schwerpunkt** (Datenblatt des Fotos): In v3 beschneidet der Einstieg höchstens 10 % um ihn herum.

## Suchmaschinen

**Einstellungen → Suchmaschinen** steht nur der Administration zur Verfügung und gilt für alle drei öffentlichen Gestaltungen. Die Installation behält die bisherige Sichtbarkeit bei. Wählen Sie, ob Suchmaschinen öffentliche Seiten und die Bildersuche öffentliche Fotos indexieren dürfen, und speichern Sie die Einstellungen. Die Bitte, die Website nicht zu indexieren, verhindert keinen Zugriff über die Adresse; dafür eine private Galerie verwenden. Die Sitemap wird leer, die öffentlichen Seiten bitten um Nichtindexierung. Ohne Bildindexierung bleiben Fotos auf der Website sichtbar.

Titel, Beschreibungen, kanonische Adressen, Sprachverweise, Vorschauen beim Teilen, strukturierte Daten und Sitemap folgen automatisch den veröffentlichten Inhalten. Entwürfe, private Galerien und zeitlich begrenzte Links bleiben ausgeschlossen. Notizbücher nennen nur veröffentlichte Sprachen. Originaldateien werden nie ausgeliefert.

Für die Startseite können Titel (100 Zeichen) und Beschreibung (320 Zeichen) auf Französisch, Englisch und Deutsch angepasst werden. Leere Felder nutzen automatisch den Namen, die Fotografen und den Leitsatz der Website. Fehlende Übersetzungen folgen dem üblichen Sprachrückgriff, auch auf einen angepassten französischen Text. Die Vorschau ist unverbindlich: Suchmaschinen wählen ihre Darstellung selbst.

Änderungen gelten für künftige Serverantworten. Das Entfernen aus Suchergebnissen braucht einen weiteren Abruf; bereits zwischengespeicherte Bilder werden nicht zurückgerufen. Bei dringendem Bedarf auch die Löschwerkzeuge der Suchmaschine nutzen und den Cloudflare-Cache leeren. Domainbestätigung und Einreichen der Sitemap in Search Console bleiben Aufgabe des Eigentümers. Die Website erhält weder ein Google-Konto noch Tracker.

Wenn Website und Bilder indexiert werden dürfen, erlauben öffentliche Seiten große Suchvorschauen; Ausschlüsse und seitenspezifische Grenzen haben Vorrang. Über 50.000 Adressen oder 50 MB wird die Sitemap automatisch aufgeteilt. Fotografenseiten und Verweise auf Notizbücher nutzen nur vorhandene öffentliche Vorstellungen und Beiträge.

## Rechte und Datenschutz

### Impressum (Mentions légales)

Pflicht in Frankreich (LCEN) wie in Deutschland (Impressum, § 5 DDG): die Seite `/mentions-legales`, unten auf **jeder Seite** der Website verlinkt („Mentions légales“, „Legal notice“, „Impressum“ je nach Sprache; auch `/impressum` führt dorthin). Der Text wird von der Website verfasst, in drei Sprachen; Sie geben nur an:

- **Anbieter**: Ihre Vor- und Nachnamen;
- **Postanschrift**: eine Adresse, unter der man Sie erreichen kann (eine Zeile pro Adresszeile);
- **Kontakt-E-Mail**: auf der Seite als Link veröffentlicht (leer: der Kontakt aus dem Datenschutz ersetzt sie, wenn er eine E-Mail-Adresse ist, kein `https://`-Link);
- **Telefon**: Pflicht für eine Person, die eine Website anbietet (LCEN, Art. 1-1; § 5 DDG), ob Sie die Website selbst hosten oder nicht;
- **Verantwortlich für den Inhalt**: die Person, die für das Veröffentlichte einsteht (in Frankreich „directeur de la publication“, LCEN, Art. 1-1; in Deutschland „Verantwortlich nach § 18 MStV“);
- **Hosting**: **Durch die Anbieter, auf ihrem eigenen Server** (Standard: die Seite sagt es, mit der Anschrift und der Telefonnummer oben) oder **Bei einem Hosting-Anbieter**: dann werden dessen **Name**, **Anschrift** und **Telefon** verlangt, und die Seite nennt ihn („Die Website wird gehostet von …“). Die Weiterleitung über Cloudflare wird in beiden Fällen genannt.

Solange eine Pflichtangabe fehlt (Namen, Adresse, E-Mail, Telefon, Verantwortlicher; bei einem Hosting-Anbieter dessen Name, Anschrift und Telefon), sagt es der Abschnitt („2 Pflichtangaben fehlen: Telefon, Verantwortlich für den Inhalt“), „Heute“ weist darauf hin, und die Seite zeigt nur das Ausgefüllte. Die Verweise auf die Nutzungsrechte und den Datenschutz werden automatisch ergänzt.

| Feld | Wo es erscheint |
|---|---|
| **Nutzungsrechte: Français** | öffentliche Seite `/droits`. Das Feld zeigt den veröffentlichten Text mit einem Abzeichen **Standardtext** oder **Eigener Text**. Unverändert gelassen, folgt der Standardtext den Namen der Fotografen; **Standardtext wiederherstellen** stellt ihn wieder her (danach speichern). |
| **Nutzungsrechte: English, Deutsch** | Seiten `/en/droits` (Englisch) und `/de/droits` (Deutsch), den Besuchern über die Sprachauswahl oben auf der Seite angeboten (Français, English, Deutsch). Dieselben Abzeichen und dieselbe Schaltfläche. Ist der französische Text angepasst und dieser keine Übersetzung davon, weist eine Warnung darauf hin: Passen Sie ihn an, sonst lesen ausländische Besucher die Übersetzung des Standardtexts. |
| **Nutzungsrechte: Kontakt** | E-Mail-Adresse oder `https://`-Link, als Link auf `/droits` angezeigt |
| **Datenschutz** | der **Kontakt** der Verantwortlichen, angezeigt auf der Seite `/confidentialite` (DSGVO, in drei Sprachen), und zwei Kästchen, die Sie **nur aktivieren, wenn es zutrifft**: Zwei-Faktor-Authentifizierung für alle Konten der Verwaltung und verschlüsselte Festplatten für Daten und Sicherungen (die Seite gibt sie dann an). Die Seite zeigt auch, ob die Verschlüsselung personenbezogener Daten in der Datenbank (`DATA_KEY`) aktiv ist. Der Rest der Seite folgt der Website automatisch. |

## Konten und Rollen

**Konten und Rollen** (Gruppe Einstellungen, nur für Administratoren) listet die Konten auf, die sich angemeldet haben.

In der **Verwaltung v2**: eine Karte pro Konto, wartende Konten zuerst; **Ändern** klappt das Formular auf, gespeichert an Ort und Stelle mit **Rückgängig**; **Dieses Konto löschen…** erscheint nur für ein **deaktiviertes oder wartendes** Konto, über einen Dialog, der es nennt (zuerst Abbrechen): ein aktives Konto zuerst deaktivieren.

- **Erste Anmeldung:** Das Konto wird angelegt. Gibt Zitadel ihm die Rolle „admin“, ist es Administrator; sonst bleibt es **wartend**, ohne Zugriff, und „Heute“ weist darauf hin. Name und Adresse stammen vom Identitätsanbieter (die Adresse nur, wenn er sie bestätigt hat): Prüfen Sie vor der Vergabe einer Rolle mit der Person die unter dem Konto angezeigte **Kennung (sub)**, die sie auch auf ihrer Seite „Konto wartend“ sieht. Ein nie bearbeitetes Konto, das 90 Tage wartend bleibt, wird gelöscht (ein Konto, dem ein Administrator die Rollen entzogen hat, bleibt erhalten, und der IdP kann ihm die Rolle „admin“ nicht zurückgeben).
- **Eine Rolle vergeben:** Ankreuzen, dann **Diese Rolle vergeben** (oder **Speichern**). Sie gilt sofort, ohne neue Anmeldung; ihr Entzug ebenso.
  - **Administrator**: alles, auch Konten, Protokoll und der Link zur Vigie ([Sicherheit](reglages#sécurité)).
  - **Moderator**: bestätigt, plant, veröffentlicht und zieht zurück (Website und Instagram), bearbeitet Meldungen, schickt Fotos zurück oder schreibt dem Fotografen Hinweise, stellt den Veröffentlichungsablauf ein; bearbeitet keine Fotos und sieht nie personenbezogene Daten (von einer Meldung liest er die Nachricht, nie die hinterlassene Adresse).
  - **Korrektor**: liest Texte Korrektur und übersetzt sie.
  - **Fotograf**: nur **seine eigenen** Fotos, Ausflüge und die Personen, denen er begegnet ist (die Einwilligung gilt pro Ausflug und pro Fotograf). Er importiert, bearbeitet und löscht seine Fotos (sie bleiben sein Eigentum), sieht die DSGVO-Anfragen, die ihn betreffen, nutzt die App Unterwegs und seine Karten; er veröffentlicht nicht (er schlägt vor, für die Website wie für Instagram) und sieht weder die Instagram-Warteschlange noch die Einstellungen noch die Besucherzahlen der Website (seine Statistiken zeigen nur seine Fotos). Was dem anderen Fotografen gehört, existiert für ihn nicht, auch nicht über die Adresse. Eine Person, der beide begegnet sind, erscheint ihm nur mit seinen eigenen Begegnungen; sie zusammenzuführen, zu trennen, zu exportieren oder zu löschen bleibt dem Administrator überlassen.
- **Verknüpfter Fotograf:** dient für Voreinstellungen (Import, App Unterwegs) und bestimmt, was ein Fotografen-Konto sieht; ohne verknüpften Fotografen sieht ein Fotografen-Konto nichts. Ein Fotograf kann nur mit einem Konto verknüpft werden.
- **Deaktiviert:** Das Konto kann sich nicht mehr anmelden, und seine laufende Sitzung verliert sofort den Zugriff; ein abgelehnter Versuch ändert seine „letzte Anmeldung“ nicht (das Protokoll hält ihn fest).
- **Dieses Konto löschen:** Ein Klick klappt die Bestätigung auf, dann **Konto „…“ löschen**: Konto und Sitzungen werden gelöscht, mit Rollen, verknüpftem Fotografen und Einstellungen; meldet es sich erneut an, beginnt es wieder wartend, ohne Rolle, auch wenn Zitadel ihm die Rolle „admin“ gibt.
- **Schutzmaßnahmen:** Es gibt immer mindestens einen aktiven Administrator; man kann sich nicht selbst deaktivieren oder löschen; die in `ADMIN_SUBS` aufgeführten Konten (Serverkonfiguration, als „geschützt“ markiert) bleiben in jedem Fall Administratoren (ein deaktiviertes oder rollenloses Konto, das in die Liste aufgenommen wird, wird bei seiner Anmeldung wieder aktiver Administrator). Die unter jedem Konto angezeigte **Kennung (sub)** ist die, die in `ADMIN_SUBS` einzutragen ist (ein Klick markiert sie).
- **E-Mails** (unten auf der Seite): zeigt, ob der Server E-Mails senden kann (`SMTP_URL`, `MAIL_FROM`) und von welcher Adresse. **Test senden** schickt eine E-Mail an die gewählte Adresse (standardmäßig Ihre). Bei einer Ablehnung wird der Grund angezeigt, zum Beispiel abgelehnte Zugangsdaten oder ein nicht erreichbarer Server.

Das Menü zeigt nur die Seiten, die das Konto öffnen darf.

## Protokoll

**Protokoll** (Administratoren): wer was in der Verwaltung getan hat, das Neueste zuerst: Anmeldungen (erfolgreich, wartend, abgelehnt), Änderungen, Veröffentlichungen, Aktionen für mehrere Fotos, geänderte Konten (mit Details: Rollen, Zustand, verknüpfter Fotograf), DSGVO-Exporte und heruntergeladene Originale. Nach Konto oder Stichwort filtern. Die Wahl von Sprache und Design wird nicht erfasst. **Ergebnis**: „erledigt“, oder „abgelehnt“, wenn der Server die Aktion abgelehnt hat (fehlendes Recht, oder Ablehnung mit einer Fehlermeldung oben auf der Seite). Das Protokoll wird 13 Monate aufbewahrt.

Aktionen für [Rückblicke und dauerhafte Sammlungen](saisons#bilans-et-rectificatifs) zeigen Erstellung, Speicherung, Veröffentlichung oder Rücknahme. Die Details enthalten die Namen geänderter Felder, nie den Bericht oder die Ausstellungsbeschriftungen. In der Vigie werden Veröffentlichung und Rücknahme dem ausführenden Konto zugeordnet; ein Entwurf gilt nicht als öffentlicher Text.

## Sicherheit

In der Vigie-Konsole zeigt **Surveiller → Veille** bekannte Schwachstellenmeldungen für direkte und indirekte Bibliotheken der Website und der Vigie. Nach Ziel, Schweregrad oder Name filtern und die Meldung zur Prüfung der Korrekturen öffnen. Die Prüfung erfolgt täglich; Datum, Fehler und Abdeckungsgrenzen werden angezeigt. Die Inventare werden mit der Vigie ausgeliefert und erfassen nicht die tatsächlich installierten Container. Node.js, Betriebssystem und externe Dienste sind nicht abgedeckt. Treffer erzeugen verlinkte Warnungen; hohe und kritische Schweregrade nutzen die konfigurierten Benachrichtigungen. Unveränderte Meldungen werden nicht täglich erneut versendet. Geschlossene Warnungen bleiben geschlossen, außer bei höherem Schweregrad, einem weiteren betroffenen Ziel oder erneutem Auftreten nach vollständig geprüfter Abwesenheit. Aktive hohe oder kritische Warnungen erhöhen auch den Schweregrad von Fällen zum selben Dienst um höchstens eine Stufe. Der Fall zeigt den vorherigen Schweregrad und die begründenden Warnungen; Sicherheit der Einschätzung und Angriffsphasen bleiben unverändert. Das Schließen einer Warnung entfernt die Erhöhung bei offenen Fällen im nächsten Zyklus; geschlossene Fälle behalten ihren Kontext. Vor Maßnahmen prüfen, ob die Bibliothek tatsächlich installiert ist. Es werden keine Updates oder automatischen Gegenmaßnahmen ausgelöst.

**Sicherheit** (Gruppe Einstellungen, nach Protokoll) öffnet in einem neuen Tab die Konsole der **Vigie**, der Sicherheitskomponente der Website (`https://vigie.nicephos.art`). Der Eintrag erscheint nur für Konten, die ihn sehen dürfen (die Rolle Administrator hat das Recht, die anderen Rollen nicht), und nur, wenn die Vigie installiert ist. Die Konsole hat eigene Sperren (Cloudflare Access, ihr Zitadel-Konto mit Zwei-Faktor-Authentifizierung): Administrator der Website zu sein, genügt nicht, um hineinzukommen.

Die Verwaltung weiß nur, was die Vigie ihr jede Minute signiert schickt: die Anzahl offener Sicherheitswarnungen je Schweregrad, Uhrzeit und Nummer der schwersten; nie den Titel einer Regel, eine Adresse oder ein Konto.

- **Zähler am Eintrag**: ▲ und die Anzahl hoher und kritischer Warnungen; die Zahl allein für mittlere; nichts, wenn keine Warnung offen ist.
- **Heute**: eine Zeile „Sicherheit: … in der Vigie“ (siehe [Übersicht](tableau-de-bord)).
- **Roter Hinweis** oben auf jeder Seite, solange eine kritische Warnung in der Konsole von niemandem übernommen ist; **Warnung #… öffnen** öffnet sie direkt.
- **Zusammenfassung nicht verfügbar** (die Vigie antwortet der Website seit mehr als 5 Minuten nicht): ▲ allein am Eintrag, und die Verwaltung sagt, was sie wusste und seit wann sie es nicht mehr weiß („laut letzter Zusammenfassung, 14:10 Uhr … nicht verfügbar seit 14:11 Uhr“); ein kritischer Hinweis bleibt, mit Datum. Die Vigie selbst sendet ihre Warnungen weiterhin über ihre eigenen Kanäle (Signal, E-Mail).
