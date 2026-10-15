# Instagram

Auf der Website veröffentlichte Fotos können auf **einem Instagram-Konto** (dem von Nicephos) erscheinen, **eines nach dem anderen, zu den gewählten Zeiten**, mit einer Bildunterschrift aus einer **Vorlage**. Für jedes Foto können Sie Rahmen, Wasserzeichen und Bildunterschrift ändern.

Die Einrichtung erfolgt nur einmal: ein **professionelles Instagram-Konto**, eine **Meta-App**, zwei Zeilen in der Serverkonfiguration, dann **Verbinden** in der Verwaltung. Rechnen Sie mit einer halben Stunde.

## Im Alltag

1. **Wählen Sie, was auf Instagram erscheint.** Standardmäßig kommt nichts von selbst hinein: Öffnen Sie die Seite eines auf der Website veröffentlichten Fotos und klicken Sie im Abschnitt **Instagram** auf **Zur Instagram-Warteschlange hinzufügen**. (Ein Foto im Entwurf muss zuerst auf der Website veröffentlicht werden.) Damit eine ganze Serie automatisch erscheint, kreuzen Sie sie unter **Instagram → Einstellungen → Automatische Warteschlange** an: Jedes in dieser Serie veröffentlichte Foto kommt dann in die **Instagram-Warteschlange**.
2. **Zu den gewählten Zeiten** (standardmäßig 18:30 Uhr, Pariser Zeit) geht das erste Foto der Warteschlange auf Instagram. Eines pro Zeitfenster.
3. **Bis zum Versand** lässt sich alles einstellen:
   - auf der **Seite des Fotos**, Abschnitt **Instagram**: Rahmen, Wasserzeichen, Bildunterschrift, mit genauer Vorschau des gesendeten Bildes, dann **Aktualisieren**; **Aus der Warteschlange entfernen** nimmt es heraus;
   - auf der Seite **Instagram**: die Reihenfolge der Warteschlange (↑ ↓), **Jetzt veröffentlichen**, **Entfernen**.
4. Nach der Veröffentlichung zeigt die Seite des Fotos den Link **Beitrag ansehen ↗** und der Verlauf der Instagram-Seite den Link **Auf Instagram ansehen ↗**.

> Ein Foto kommt nie von selbst zweimal in die Warteschlange: Zurückgezogen und erneut veröffentlicht, wird es nicht wieder vorgeschlagen. Um es noch einmal zu teilen, verwenden Sie **Erneut veröffentlichen (wieder in die Warteschlange)** auf seiner Seite.

## Der Bildrahmen

Instagram akzeptiert nur Bilder zwischen **4:5** (Hochformat) und **1,91:1** (Querformat). Ihre Hochformatfotos im Format 2:3 passen so nicht hinein. Drei Möglichkeiten, als Standard in den Einstellungen (**Zuschnitt**, wenn Sie nichts gewählt haben) und Foto für Foto auf seiner Seite:

| Rahmen | Ergebnis |
|---|---|
| **Weißes Passepartout** | das ganze Foto mit weißem Rand auf einer 4:5-Fläche von 1080 × 1350 px: ein gleichmäßiger Feed |
| **Schwarzes Passepartout** | dasselbe auf schwarzem Hintergrund |
| **Zuschnitt (ohne Rand)** | ohne Rand: Hochformatfotos werden auf 4:5 zugeschnitten (um den Bildschwerpunkt), die anderen behalten ihr Format |

Das gesendete Bild ist ein JPEG mit 1080 px Breite, **ganz ohne Metadaten**. Das **Wasserzeichen** (Kästchen auf der Seite des Fotos, Standardwert in den Einstellungen) ist das aus **Wasserzeichen & EXIF**, auch wenn es auf der Website deaktiviert ist. Ein Foto, das auf „nie ein Wasserzeichen“ eingestellt ist, hat auch auf Instagram keines.

## Die Bildunterschrift

Die **Vorlage** (Instagram → Einstellungen) gilt für alle Fotos, mit diesen Variablen:

| Variable | Ersetzt durch |
|---|---|
| `{titre}` · `{legende}` · `{lieu}` · `{date}` | die Felder des Fotos (Datum ausgeschrieben: „Nov. 2023“) |
| `{auteur}` · `{serie}` | seinen Autor, seine Serie |
| `{site}` | den Namen der Website |
| `{hashtags}` | die Hashtags „für alle Fotos“, dann die seiner Serie, ohne Doppelte, höchstens 30 |
| `{signature}` | die Signatur des Fotografen (siehe unten); ohne diese Variable in der Vorlage steht sie direkt unter der Bildunterschrift |

**Signatur des Fotografen**: Jeder Fotograf legt seine eigene unter [Fotografen](auteurs) fest (zum Beispiel „— Julien · @julien.photo“). Sie wird dem Beitrag **nur hinzugefügt, wenn das Foto eine Bildunterschrift hat**. Für ein einzelnes Foto entfernen Sie das Häkchen bei **Meine Signatur hinzufügen** im Abschnitt Instagram seiner Seite und klicken dann auf **Zur Warteschlange hinzufügen** oder **Aktualisieren**: Sie erscheint dann nicht. Die Website selbst zeigt die Signatur nicht an.

**Eine Zeile, deren Variablen alle leer sind, verschwindet**, und ein allein übrig gebliebenes Komma wird entfernt: Ein Foto ohne Ort und Datum hinterlässt kein „,“ in seiner Bildunterschrift.

**Für ein einzelnes Foto** auf seiner Seite: Bearbeiten Sie die Bildunterschrift direkt. Das Kästchen **Eigene Bildunterschrift** wird automatisch angekreuzt; **Zurück zur Vorlage** übernimmt wieder die der Vorlage. Der Zähler zeigt die Länge (höchstens 2.200 Zeichen). Warnungen weisen auf einen Link hin (auf Instagram nicht anklickbar: besser „Link in der Bio“) oder auf mehr als 30 Hashtags.

## API-Limits

Es gibt kein kostenpflichtiges Angebot der Instagram-API: Meta erlaubt **100 Beiträge pro Konto in gleitenden 24 Stunden** und eine Zahl von Aufrufen, die es selbst berechnet. Die Website veröffentlicht daher innerhalb eines **Budgets**, eingestellt unter **Instagram → Einstellungen → API-Limits**:

| Einstellung | Beiträge in 24 Std. | Abstand zwischen zwei | Aufrufe pro Stunde |
|---|---|---|---|
| **Vorsichtig** (Standard) | 25 | 60 Min. | 100 |
| **Grenzen von Meta** | das bei Instagram gelesene Kontingent (derzeit 100) | keiner | 200 |
| **Benutzerdefiniert** | 1 bis 100 | 0 bis 1.440 Min. | 10 bis 1.000 |

- **Außerhalb des Budgets** wartet das Foto in der Warteschlange. **Jetzt veröffentlichen** lehnt ab und erklärt, warum und wann es möglich sein wird („Letzte Veröffentlichung vor 20 Min.; mindestens 60 Min. zwischen zwei Veröffentlichungen: nächste möglich um 14:30 Uhr“).
- **Meldet Instagram ein Limit**, wird die Warteschlange für die angegebene Zeit **pausiert** (sonst 1 Std., dann 2 Std., 4 Std., 8 Std., 24 Std.). Das Foto bleibt an der Spitze der Warteschlange und **der Versuch wird nicht gezählt**. Ein Banner kündigt dies auf der Seite **Instagram** an, mit **Jetzt fortsetzen**, um die Pause von Hand aufzuheben. Bei der Fortsetzung ein Foto pro Zeitfenster, nie eine Serie auf einmal.
- Die Seite **Instagram** zeigt den **Verbrauch**: Beiträge in 24 Stunden, Aufrufe in der letzten Stunde, bei Instagram gelesenes Kontingent.

## Likes und Kommentare

Jeden Morgen (nach 6 Uhr) erfasst die Website die **Likes** und **Kommentare** der Fotos, die sie auf Instagram veröffentlicht hat, und speichert eine Erfassung pro Tag.

- **Seite eines Fotos**, Abschnitt Instagram: „39 Likes · 4 Kommentare“, das Datum der Erfassung und eine Kurve der Entwicklung der Likes.
- **Instagram-Seite**, „Am meisten gelikt auf Instagram“: die Rangfolge der Fotos nach Likes, mit dem Link zu jedem Beitrag. **Jetzt erfassen** führt eine Erfassung durch, ohne bis zum nächsten Tag zu warten (höchstens einmal alle 10 Minuten).
- **Nur Zahlen**: Instagram verrät nicht, wer geliked hat oder was in den Kommentaren steht.
- **Direkt auf Instagram veröffentlichte Beiträge**, ohne den Weg über die Website: Sie werden nicht erfasst (sie sind mit keinem Foto der Website verknüpft).
- Die Erfassung kostet 1 bis 3 Aufrufe pro Tag, die in die obigen Limits eingerechnet werden. Schlägt sie fehl (Instagram nicht erreichbar), folgt eine Stunde später ein neuer Versuch, und der Grund wird auf der Instagram-Seite angezeigt.

## Bei einem Fehler

- **Automatischer neuer Versuch:** Das Foto bleibt an der Spitze der Warteschlange, und die Fehlermeldung erscheint in der Warteschlange und auf der Seite des Fotos. Es wird im nächsten Zeitfenster erneut gesendet, **höchstens 3 Versuche**.
- **Nach 3 Fehlschlägen:** Es kommt in den **Verlauf**, mit **Erneut versuchen**. Die Seite des Fotos bietet auch **Erneut veröffentlichen (wieder an den Anfang der Warteschlange)**.
- **Der Fotograf** (der die Warteschlange nicht verwaltet) sieht den Fehlschlag unter **Heute** und auf der Seite des Fotos, mit **Erneute Veröffentlichung anfragen**. Eine Anfrage pro Fehlschlag. Sie erscheint dann, markiert mit ⚑ „Erneute Veröffentlichung angefragt“, unter **Heute** bei denen, die die Warteschlange verwalten, im Verlauf und auf der Seite des Fotos; per E-Mail auch, wenn sie das gewählt haben. Sie verschwindet, sobald das Foto wieder in der Warteschlange ist. Ist das Foto schon in der Warteschlange, gibt es nichts anzufragen.
- **Zugang abgelaufen:** Das Zugriffstoken gilt 60 Tage und erneuert sich selbst. Ist es abgelaufen (mehr als 60 Tage ohne Funktion), verbinden Sie das Konto über die Seite **Instagram** neu: **Trennen**, dann **Instagram-Konto verbinden**. Zeigt die Verwaltung **Konto erneut verbinden** an (Verschlüsselungsschlüssel geändert, siehe Schritt 6), klicken Sie einfach darauf.

---

## Einrichtung (einmalig)

### 1. Das Instagram-Konto in ein professionelles Konto umwandeln

Die Veröffentlichungs-API funktioniert nur mit einem **Creator**- oder **Unternehmens**-Konto. Das ist kostenlos, ohne Verlust von Followern oder Beiträgen, und umkehrbar.

1. Öffnen Sie in der Instagram-App das **Profil** des Kontos Nicephos, dann das Menü **☰**.
2. **Einstellungen und Aktivität** → **Kontoart und Tools** → **Zu professionellem Konto wechseln**.
3. Wählen Sie **Creator** (empfohlen für Fotografen) oder **Unternehmen**.
4. Kategorie: **Fotograf**. Öffentliche Kontaktdaten sind optional.
5. Keine Facebook-Seite nötig: Die Verbindung erfolgt direkt mit Instagram.

### 2. Ein Meta-Entwicklerkonto erstellen

1. Gehen Sie zu **developers.facebook.com** und klicken Sie auf **Los geht’s**.
2. Melden Sie sich mit einem Facebook-Konto an, dem von einem von Ihnen beiden.
3. Akzeptieren Sie die Bedingungen und bestätigen Sie Ihre E-Mail-Adresse oder Telefonnummer, falls Meta danach fragt.

### 3. Die App erstellen

1. **Meine Apps** → **App erstellen**.
2. Name der App: zum Beispiel „Nicephos“. Kontakt-E-Mail: Ihre.
3. Anwendungsfall: **Nachrichten und Inhalte auf Instagram verwalten** („Instagram API“), dann weiter bis **App erstellen**.
4. Die App ist im **Entwicklungsmodus**. Das genügt: Um auf Ihrem **eigenen** Konto zu veröffentlichen, ist keine Prüfung durch Meta nötig.

### 4. Die Zugangsdaten abrufen und die Rücksprungadresse angeben

1. In der App: **Instagram** → **API-Einrichtung mit Instagram-Login** („API setup with Instagram login“).
2. Notieren Sie:
   - die **Instagram-App-ID**, einzutragen in `INSTAGRAM_APP_ID`;
   - den **geheimen Schlüssel der Instagram-App** („Anzeigen“), einzutragen in `INSTAGRAM_APP_SECRET`.

   Das sind die **Instagram**-Zugangsdaten der App, verschieden von ihrer oben angezeigten Facebook-ID.
3. Abschnitt **Instagram-Business-Login einrichten** („Set up Instagram business login“) → **App-Einstellungen**:
   - **Gültige OAuth-Weiterleitungs-URIs:** `https://www.nicephos.art/admin/instagram/callback`. Das ist die Adresse, die auf der Seite **Instagram** der Verwaltung angezeigt wird, Zeichen für Zeichen.
   - Speichern.
4. Von der Website angeforderte Berechtigungen, nichts anzukreuzen: `instagram_business_basic` und `instagram_business_content_publish`.

### 5. Das Konto Nicephos für die App freigeben

Im Entwicklungsmodus können sich nur eingeladene Konten verbinden:

1. In der Meta-App: **App-Rollen** → **Rollen** → **Personen hinzufügen** → **Instagram-Tester**. Geben Sie den Kontonamen ein (@nicephos).
2. In Instagram, im Konto Nicephos: **Einstellungen und Aktivität** → **Apps und Websites** → **Tester-Einladungen** → **Annehmen**. Am Computer geht das auch auf instagram.com → Einstellungen → Apps und Websites.

### 6. Den Server konfigurieren

In der Datei `.env` des Servers (auf Unraid: **Edit Stack → ENV File**):

```dotenv
INSTAGRAM_APP_ID=…            # ID de l'application Instagram
INSTAGRAM_APP_SECRET=…        # clé secrète de l'application Instagram
```

Empfohlen: `INSTAGRAM_TOKEN_KEY`, ein Schlüssel zur Verschlüsselung des Zugriffstokens (`openssl rand -base64 32`). Ohne ihn wird der Schlüssel aus `COOKIE_SECRET` abgeleitet: Wird dieses Geheimnis geändert oder die Datenbank auf einem Server mit einem anderen wiederhergestellt, muss das Konto **neu verbunden** werden (die Verwaltung weist darauf hin; kein Foto geht verloren).

Starten Sie dann die Website neu (**Compose Up**). Die Website muss **HTTPS** verwenden (`PUBLIC_URL=https://…`): Meta lehnt `http`-Adressen ab und muss das Bild herunterladen können.

### 7. Verbinden

1. Verwaltung → **Instagram** → **Instagram-Konto verbinden**.
2. Instagram bittet darum, die App zu autorisieren. Melden Sie sich **mit dem Konto Nicephos** an und stimmen Sie zu.
3. Zurück in der Verwaltung: „Instagram-Konto @nicephos verbunden“. Die Warteschlange kann starten.

### Wenn die Verbindung fehlschlägt

| Meldung | Ursache, Lösung |
|---|---|
| „Invalid redirect_uri“ / „redirect_uri is missing“ | die angegebene Rücksprungadresse (Schritt 4) ist nicht genau die in der Verwaltung angezeigte |
| „Insufficient developer role“ | die Tester-Einladung wurde nicht angenommen (Schritt 5), oder im Browser ist ein anderes Instagram-Konto angemeldet |
| „Verbindung abgelehnt: Die Anfrage kam nicht von diesem Bildschirm oder ist abgelaufen“ | mehr als 10 Minuten zwischen Klick und Rückkehr, oder Rückkehr in einem anderen Browser: Beginnen Sie von vorn |
| „Die Website muss HTTPS verwenden“ | `PUBLIC_URL` mit `http://`: Die Verbindung ist nur online möglich |
| „Bild von Instagram abgelehnt“ | selten; versuchen Sie einen anderen Rahmen für dieses Foto |

**Trennen** (Instagram-Seite) löscht das Token vom Server. Um auch den Zugriff auf Seiten von Instagram zu entfernen: **Einstellungen** → **Apps und Websites** → **Aktiv** → die App → **Entfernen**.
