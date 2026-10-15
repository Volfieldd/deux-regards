# Wasserzeichen und EXIF

Diese Einstellungen betreffen die **auf der Website ausgelieferten Bilder**. Die Originale werden nie verändert: Sie können Ihre Meinung jederzeit ändern.

## Ein Text-Wasserzeichen setzen

1. Aktivieren Sie **Den Bildern der Website ein Wasserzeichen hinzufügen** und wählen Sie dann **Art: Text**.
2. Geben Sie den **Text** ein (80 Zeichen). Mögliche Variablen:
   - `{auteur}`: Name des Autors des Fotos;
   - `{annee}`: Aufnahmejahr, ersatzweise Importjahr;
   - `{site}`: Name der Website;
   - `{titre}`: Titel des Fotos.

   Zum Beispiel ergibt `© {auteur} {annee}` „© Julien 2024“.
3. **Schrift** (die der Website) und **Farbton**:
   - hell, für dunkle Fotos;
   - dunkel, für helle Fotos;
   - **automatisch**: Foto für Foto gewählt, nach der Helligkeit der Stelle, an der das Wasserzeichen sitzt.
4. **Position**: neun Stellen, **Kachelung** (diagonal über das ganze Bild wiederholtes Muster, am schwersten zu entfernen) oder **Vollformat** (zentriert, so groß wie das Bild, abzüglich der Ränder).
5. **Deckkraft** (5 bis 100 %), **Breite** (3 bis 100 % des Bildes; ohne Wirkung bei Vollbild), **Rand** (0 bis 20 %).
6. **Auf Größen anwenden**:
   - alle;
   - ab 1280 px (Vorschaubilder ausgenommen);
   - nur 2000 px.

   Das größte Bild jedes Fotos wird immer markiert.

## Vor dem Speichern ausprobieren

1. Wählen Sie das **Vorschaufoto**.
2. Klicken Sie auf **Vorschau ohne Speichern**: Das Bild öffnet sich in einem neuen Tab mit den Einstellungen des Formulars. **Es wird nichts gespeichert.**

Das Bild links auf der Seite zeigt dagegen die **gespeicherten** Einstellungen.

## Das Logo der Website groß und blass einsetzen

Die empfohlene Einstellung, um Fotos zu signieren, ohne zu sehr zu stören:

1. Laden Sie das **Emblem** (oder das **vollständige Logo**) unter [Erscheinungsbild](apparence) hoch, falls noch nicht geschehen.
2. Aktivieren Sie hier **Wasserzeichen hinzufügen** und wählen Sie dann **Art: Emblem der Website** (oder **Vollständiges Logo der Website**).
3. **Farbton: Automatisch**. Die Grafik ist hell auf dunklen Fotos und dunkel auf hellen Fotos.
4. **Position: Vollformat**, **Rand** 5 bis 8 %.
5. **Deckkraft: 15 bis 25 %**. Unter 10 % verschwindet die Grafik auf manchen Fotos fast.
6. **Vorschau ohne Speichern** auf einem dunklen, dann auf einem hellen Foto. Speichern Sie, wenn Ihnen das Ergebnis gefällt.

Die Grafik ist die aus dem Erscheinungsbild: Wenn Sie sie dort ersetzen, werden die Bilder der Website mit der neuen neu berechnet.

## Ein anderes Logo als Wasserzeichen verwenden

1. Laden Sie unter **Logo des Wasserzeichens** ein **PNG- oder WebP-Bild mit transparentem Hintergrund** hoch:
   - höchstens 5 MB und 4000 px Seitenlänge;
   - mindestens 8 px;
   - Seitenverhältnis Breite/Höhe von höchstens 10.

   SVG-Dateien werden abgelehnt.
2. Wählen Sie **Art: Unten hochgeladenes Logo** und speichern Sie. Dieses Logo behält seine eigenen Farben: Der Farbton gilt dafür nicht.

**Logo entfernen** entfernt dieses Wasserzeichen bis zum nächsten Hochladen.

## Ein Foto ausnehmen

Im Datenblatt des Fotos: **Wasserzeichen → Nie auf diesem Foto**, dann **Speichern**. Die gewählten Metadaten gelten trotzdem.

## Metadaten (EXIF)

| Auswahl | Die Bilder der Website enthalten | Wofür |
|---|---|---|
| **Keine Metadaten** (Standard) | nichts | nichts preisgeben |
| **Urheberrecht** | Autor, „© Jahr Autor“, IPTC-Angaben (Credit, Link zu „Nutzungsrechte“) | die Dateien signieren; Google Bilder zeigt dann ein Abzeichen „Lizenzierbar“ |
| **Aufnahmedaten** | Urheberrecht + Kamera, Objektiv, Blende, Belichtungszeit, ISO, Brennweite, Datum; **nie der Aufnahmeort** | die eigene Technik teilen |
| **Alle EXIF-Daten des Originals** | alles, **einschließlich der GPS-Position** | selten: verrät, wo das Foto aufgenommen wurde |

EXIF-Felder akzeptieren nur einfache Zeichen: „© 2024 Sébastien“ wird dort zu „(C) 2024 Sebastien“. IPTC-Angaben und das Wasserzeichen behalten die Akzente.

## Aktualisierung der Bilder

Nach **Speichern und Bilder aktualisieren**:

- zeigt ein Banner den Fortschritt („Bilder werden aktualisiert: 5 / 12“);
- bleibt die Website mit den alten Bildern online;
- wechselt jedes Foto zu den neuen, sobald sie bereit sind, ohne defektes Bild;
- zeigt das Banner am Ende „Bilder sind aktuell“ oder die Liste der Fotos mit Fehlern.

Rechnen Sie mit einigen Sekunden pro Foto.

Dieselbe Neuberechnung wird ausgelöst, wenn Sie einen Autor umbenennen, den Namen der Website ändern oder Titel, Datum, Autor oder Wasserzeichen-Option eines Fotos ändern.

**Rückgängig machen:** Deaktivieren Sie das Wasserzeichen, wählen Sie „Keine Metadaten“ und speichern Sie. Die Bilder werden wieder zu den ursprünglichen.
