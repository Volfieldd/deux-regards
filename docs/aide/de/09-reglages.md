# Öffentliche Website, Rechte und Datenschutz

Zwei Seiten der Gruppen **Veröffentlichen** und **Einstellungen** in der Seitenleiste; jede speichert nur ihre eigenen Felder.

## Öffentliche Website

Was die Besucher sehen. Slogan, Einleitung und „Über“ haben jeweils eine optionale **englische und deutsche** Fassung, unter dem französischen Feld eingeklappt („… auf Englisch und Deutsch“; der Status zeigt *optional*, *1 von 2 Sprachen* oder *übersetzt*). Leer: Englisch- und deutschsprachige Besucher lesen den französischen Text (siehe [Die Website aus Sicht der Besucher](site-public)). Die Schaltfläche **Übersetzung vorschlagen** füllt ein Feld vor (siehe [Fotos](photos), „Das Datenblatt eines Fotos“).

| Feld | Wo es erscheint |
|---|---|
| **Name der Website** | Text-Logo, Seitentitel, Variable `{site}` des Wasserzeichens. Leer: Standardname des Servers. |
| **Slogan** | Titel des Abschnitts „Blicke“ der Startseite, Titel von „Über uns“, Beschreibung für Suchmaschinen |
| **Einleitung** | Text unter dem Slogan, auf der Startseite |
| **Über** | Seite „Über uns“. Trennen Sie Absätze durch eine Leerzeile. |
| **Weltkarte** | siehe unten |
| **Suche** | siehe unten |
| **Fotos der Start-Diashow** | die Vollbild-Diashow der Startseite, in der gewählten Reihenfolge (siehe unten) |

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

## Rechte und Datenschutz

### Impressum (Mentions légales)

Pflicht in Frankreich (LCEN) wie in Deutschland (Impressum, § 5 DDG): die Seite `/mentions-legales`, unten auf **jeder Seite** der Website verlinkt („Mentions légales“, „Legal notice“, „Impressum“ je nach Sprache; auch `/impressum` führt dorthin). Der Text wird von der Website verfasst, in drei Sprachen; Sie geben nur an:

- **Anbieter**: Ihre Vor- und Nachnamen;
- **Postanschrift**: eine Adresse, unter der man Sie erreichen kann (eine Zeile pro Adresszeile);
- **E-Mail** (leer: die aus dem Datenschutz) und **Telefon** (optional);
- **Verantwortlich für den Inhalt**: eine Person (in Deutschland „Verantwortlich nach § 18 MStV“).

Solange das Wesentliche fehlt (Namen, Adresse, E-Mail, Verantwortlicher), weist „Heute“ darauf hin, und die Seite zeigt nur das Ausgefüllte. Das Hosting (Ihr Server, in Frankreich; Weiterleitung über Cloudflare) und die Verweise auf die Nutzungsrechte und den Datenschutz werden automatisch ergänzt.

| Feld | Wo es erscheint |
|---|---|
| **Nutzungsrechte: Français** | öffentliche Seite `/droits`. Das Feld zeigt den veröffentlichten Text mit einem Abzeichen **Standardtext** oder **Eigener Text**. Unverändert gelassen, folgt der Standardtext den Namen der Fotografen; **Standardtext wiederherstellen** stellt ihn wieder her (danach speichern). |
| **Nutzungsrechte: English, Deutsch** | Seiten `/en/droits` (Englisch) und `/de/droits` (Deutsch), den Besuchern über die Sprachauswahl oben auf der Seite angeboten (Français, English, Deutsch). Dieselben Abzeichen und dieselbe Schaltfläche. Ist der französische Text angepasst und dieser keine Übersetzung davon, weist eine Warnung darauf hin: Passen Sie ihn an, sonst lesen ausländische Besucher die Übersetzung des Standardtexts. |
| **Nutzungsrechte: Kontakt** | E-Mail-Adresse oder `https://`-Link, als Link auf `/droits` angezeigt |
| **Datenschutz** | der **Kontakt** der Verantwortlichen, angezeigt auf der Seite `/confidentialite` (DSGVO, in drei Sprachen), und zwei Kästchen, die Sie **nur aktivieren, wenn es zutrifft**: Zwei-Faktor-Authentifizierung für alle Konten der Verwaltung und verschlüsselte Festplatten für Daten und Sicherungen (die Seite gibt sie dann an). Die Seite zeigt auch, ob die Verschlüsselung personenbezogener Daten in der Datenbank (`DATA_KEY`) aktiv ist. Der Rest der Seite folgt der Website automatisch. |

## Konten und Rollen

**Konten und Rollen** (Gruppe Einstellungen, nur für Administratoren) listet die Konten auf, die sich angemeldet haben.

- **Erste Anmeldung:** Das Konto wird angelegt. Gibt Zitadel ihm die Rolle „admin“, ist es Administrator; sonst bleibt es **wartend**, ohne Zugriff, und „Heute“ weist darauf hin. Name und Adresse stammen vom Identitätsanbieter (die Adresse nur, wenn er sie bestätigt hat): Prüfen Sie vor der Vergabe einer Rolle mit der Person die unter dem Konto angezeigte **Kennung (sub)**, die sie auch auf ihrer Seite „Konto wartend“ sieht. Ein nie bearbeitetes Konto, das 90 Tage wartend bleibt, wird gelöscht (ein Konto, dem ein Administrator die Rollen entzogen hat, bleibt erhalten, und der IdP kann ihm die Rolle „admin“ nicht zurückgeben).
- **Eine Rolle vergeben:** Ankreuzen, dann **Diese Rolle vergeben** (oder **Speichern**). Sie gilt sofort, ohne neue Anmeldung; ihr Entzug ebenso.
  - **Administrator**: alles, auch Konten und Protokoll.
  - **Moderator**: bestätigt, plant, veröffentlicht und zieht zurück (Website und Instagram), bearbeitet Meldungen, schickt Fotos zurück oder schreibt dem Fotografen Hinweise, stellt den Veröffentlichungsablauf ein; bearbeitet keine Fotos und sieht nie personenbezogene Daten (von einer Meldung liest er die Nachricht, nie die hinterlassene Adresse).
  - **Korrektor**: liest Texte Korrektur und übersetzt sie.
  - **Fotograf**: nur **seine eigenen** Fotos, Ausflüge und die Personen, denen er begegnet ist (die Einwilligung gilt pro Ausflug und pro Fotograf). Er importiert, bearbeitet und löscht seine Fotos (sie bleiben sein Eigentum), sieht die DSGVO-Anfragen, die ihn betreffen, nutzt die App Unterwegs und seine Karten; er veröffentlicht nicht (er schlägt vor, für die Website wie für Instagram) und sieht weder die Instagram-Warteschlange noch die Einstellungen noch die Besucherzahlen der Website (seine Statistiken zeigen nur seine Fotos). Was dem anderen Fotografen gehört, existiert für ihn nicht, auch nicht über die Adresse. Eine Person, der beide begegnet sind, erscheint ihm nur mit seinen eigenen Begegnungen; sie zusammenzuführen, zu trennen, zu exportieren oder zu löschen bleibt dem Administrator überlassen.
- **Verknüpfter Fotograf:** dient für Voreinstellungen (Import, App Unterwegs) und bestimmt, was ein Fotografen-Konto sieht; ohne verknüpften Fotografen sieht ein Fotografen-Konto nichts. Ein Fotograf kann nur mit einem Konto verknüpft werden.
- **Deaktiviert:** Das Konto kann sich nicht mehr anmelden, und seine laufende Sitzung verliert sofort den Zugriff; ein abgelehnter Versuch ändert seine „letzte Anmeldung“ nicht (das Protokoll hält ihn fest).
- **Dieses Konto löschen:** Konto und Sitzungen werden gelöscht; meldet es sich erneut an, beginnt es wieder wartend, ohne Rolle, auch wenn Zitadel ihm die Rolle „admin“ gibt.
- **Schutzmaßnahmen:** Es gibt immer mindestens einen aktiven Administrator; man kann sich nicht selbst deaktivieren oder löschen; die in `ADMIN_SUBS` aufgeführten Konten (Serverkonfiguration, als „geschützt“ markiert) bleiben in jedem Fall Administratoren (ein deaktiviertes oder rollenloses Konto, das in die Liste aufgenommen wird, wird bei seiner Anmeldung wieder aktiver Administrator). Die unter jedem Konto angezeigte **Kennung (sub)** ist die, die in `ADMIN_SUBS` einzutragen ist (ein Klick markiert sie).
- **E-Mails** (unten auf der Seite): zeigt, ob der Server E-Mails senden kann (`SMTP_URL`, `MAIL_FROM`) und von welcher Adresse. **Test senden** schickt eine E-Mail an die gewählte Adresse (standardmäßig Ihre). Bei einer Ablehnung wird der Grund angezeigt, zum Beispiel abgelehnte Zugangsdaten oder ein nicht erreichbarer Server.

Das Menü zeigt nur die Seiten, die das Konto öffnen darf.

## Protokoll

**Protokoll** (Administratoren): wer was in der Verwaltung getan hat, das Neueste zuerst: Anmeldungen (erfolgreich, wartend, abgelehnt), Änderungen, Veröffentlichungen, Aktionen für mehrere Fotos, geänderte Konten (mit Details: Rollen, Zustand, verknüpfter Fotograf), DSGVO-Exporte und heruntergeladene Originale. Nach Konto oder Stichwort filtern. Die Wahl von Sprache und Design wird nicht erfasst. Das Protokoll wird 13 Monate aufbewahrt.
