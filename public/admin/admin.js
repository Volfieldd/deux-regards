/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Amélioration progressive de l'admin : tout fonctionne sans ce script (formulaires classiques).
document.documentElement.classList.add('js');
const CSRF = document.body.dataset.csrf;
// Droits du compte (attribut data-can de la page) : on ne propose que ce qui est permis ; le serveur reste seul juge.
const GRANTS = document.body.dataset.can === undefined ? null : new Set(document.body.dataset.can.split(' ').filter(Boolean));
const can = perm => !GRANTS || GRANTS.has(perm);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// ----- langue de l'admin : celle de la page (<html lang>), français par défaut -----
// Textes du script : la clé est le texte français ; { fr } quand un même mot français a deux sens (Annuler).
const LANG = ['en', 'de'].includes(document.documentElement.lang) ? document.documentElement.lang : 'fr';
const LOCALE = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[LANG];
const I18N = {
  "Reprendre comme texte de remplacement": {"en": "Use as alternative text", "de": "Als Alternativtext übernehmen"},
  "Reprendre comme texte de remplacement anglais": {"en": "Use as English alternative text", "de": "Als englischen Alternativtext übernehmen"},
  "en cours de calcul…": {"en": "calculating…", "de": "wird berechnet…"},
  "annuler-action": {"fr": "Annuler", "en": "Undo", "de": "Rückgängig"},
  "Annuler": {"en": "Cancel", "de": "Abbrechen"},
  "Session expirée ? Rechargez la page.": {"en": "Session expired? Reload the page.", "de": "Sitzung abgelaufen? Laden Sie die Seite neu."},
  "Erreur {status}": {"en": "Error {status}", "de": "Fehler {status}"},
  "Annulation impossible : {msg}": {"en": "Could not undo: {msg}", "de": "Rückgängig nicht möglich: {msg}"},
  "Passer en mode clair": {"en": "Switch to light mode", "de": "Zum hellen Modus wechseln"},
  "Passer en mode sombre": {"en": "Switch to dark mode", "de": "Zum dunklen Modus wechseln"},
  "Traitement : {n} photos": {"en": "Processing: {n} photos", "de": "Verarbeitung: {n} Fotos"},
  "Traitement : {n} photo": {"en": "Processing: {n} photo", "de": "Verarbeitung: {n} Foto"},
  "{n} Ko": {"en": "{n} KB", "de": "{n} KB"},
  "{n} Mo": {"en": "{n} MB", "de": "{n} MB"},
  "Trop lourde ({max} max.)": {"en": "Too large ({max} max.)", "de": "Zu groß ({max} max.)"},
  "Ce n’est pas une image": {"en": "Not an image", "de": "Kein Bild"},
  "Trop grande (120 Mpx max.)": {"en": "Too big (120 MP max.)", "de": "Zu groß (120 MP max.)"},
  "… Vérification": {"en": "… Checking", "de": "… Prüfung"},
  "✓ Prête à envoyer": {"en": "✓ Ready to upload", "de": "✓ Bereit zum Hochladen"},
  "… En attente": {"en": "… Waiting", "de": "… Wartet"},
  "↑ Envoi": {"en": "↑ Uploading", "de": "↑ Hochladen"},
  "… En file": {"en": "… Queued", "de": "… In der Warteschlange"},
  "… Traitement": {"en": "… Processing", "de": "… Verarbeitung"},
  "✓ Prête": {"en": "✓ Ready", "de": "✓ Bereit"},
  "! Échec": {"en": "! Failed", "de": "! Fehlgeschlagen"},
  "— Annulée": {"en": "— Cancelled", "de": "— Abgebrochen"},
  "Ne sera pas envoyée": {"en": "Will not be uploaded", "de": "Wird nicht hochgeladen"},
  "Sera envoyée": {"en": "Will be uploaded", "de": "Wird hochgeladen"},
  "Envoi {pct} % · {done} / {total}": {"en": "Uploading {pct}% · {done} / {total}", "de": "Hochladen {pct} % · {done} / {total}"},
  "Traitement : images {done} / {total}": {"en": "Processing: images {done} / {total}", "de": "Verarbeitung: Bilder {done} / {total}"},
  "Envoyée · traitement en attente": {"en": "Uploaded · processing pending", "de": "Hochgeladen · Verarbeitung ausstehend"},
  "Envoyée · images prêtes": {"en": "Uploaded · images ready", "de": "Hochgeladen · Bilder bereit"},
  "Non envoyée": {"en": "Not uploaded", "de": "Nicht hochgeladen"},
  "Retirer {name}": {"en": "Remove {name}", "de": "{name} entfernen"},
  "Réessayer": {"en": "Retry", "de": "Erneut versuchen"},
  "Envoyer les {n} photos valides": {"en": "Upload the {n} valid photos", "de": "Die {n} gültigen Fotos hochladen"},
  "Envoyer la photo valide": {"en": "Upload the valid photo", "de": "Das gültige Foto hochladen"},
  "Envoyer": {"en": "Upload", "de": "Hochladen"},
  "{n} fichiers écartés : ils ne seront pas envoyés.": {"en": "{n} files rejected: they will not be uploaded.", "de": "{n} Dateien abgelehnt: Diese werden nicht hochgeladen."},
  "{n} fichier écarté : il ne sera pas envoyé.": {"en": "{n} file rejected: it will not be uploaded.", "de": "{n} Datei abgelehnt: Diese wird nicht hochgeladen."},
  "Ajoutez d’autres photos": {"en": "Add more photos", "de": "Weitere Fotos hinzufügen"},
  "Glissez vos photos ici": {"en": "Drag your photos here", "de": "Ziehen Sie Ihre Fotos hierher"},
  "environ {time} restantes": {"en": "about {time} left", "de": "noch etwa {time}"},
  "environ {time} restante": {"en": "about {time} left", "de": "noch etwa {time}"},
  "calcul du temps restant…": {"en": "estimating time left…", "de": "Restzeit wird berechnet…"},
  "{ready} photos prêtes sur {total}": {"en": "{ready} of {total} photos ready", "de": "{ready} von {total} Fotos bereit"},
  "{ready} photo prête sur {total}": {"en": "{ready} of {total} photos ready", "de": "{ready} von {total} Fotos bereit"},
  "· {n} en traitement": {"en": "· {n} processing", "de": "· {n} in Verarbeitung"},
  "· {n} en file": {"en": "· {n} queued", "de": "· {n} in der Warteschlange"},
  "· {n} en envoi": {"en": "· {n} uploading", "de": "· {n} beim Hochladen"},
  "· {n} en échec ou annulées": {"en": "· {n} failed or cancelled", "de": "· {n} fehlgeschlagen oder abgebrochen"},
  "· {n} en échec ou annulée": {"en": "· {n} failed or cancelled", "de": "· {n} fehlgeschlagen oder abgebrochen"},
  "Compléter et publier les {n} photos →": {"en": "Complete and publish the {n} photos →", "de": "Die {n} Fotos vervollständigen und veröffentlichen →"},
  "Compléter et publier la photo →": {"en": "Complete and publish the photo →", "de": "Das Foto vervollständigen und veröffentlichen →"},
  "Envoi en cours : gardez cette page ouverte. Le traitement des photos déjà envoyées continue même si vous la quittez.": {"en": "Uploading: keep this page open. Photos already uploaded keep processing even if you leave it.", "de": "Hochladen läuft: Lassen Sie diese Seite geöffnet. Bereits hochgeladene Fotos werden weiter verarbeitet, auch wenn Sie die Seite verlassen."},
  "Envoi terminé. Le traitement continue sur le serveur : vous pouvez compléter les photos dès maintenant.": {"en": "Upload finished. Processing continues on the server: you can complete the photos now.", "de": "Hochladen abgeschlossen. Die Verarbeitung läuft auf dem Server weiter: Sie können die Fotos schon jetzt vervollständigen."},
  "Toutes les photos sont prêtes.": {"en": "All photos are ready.", "de": "Alle Fotos sind bereit."},
  "Envoi de {n} photos commencé.": {"en": "Started uploading {n} photos.", "de": "Hochladen von {n} Fotos gestartet."},
  "Envoi de {n} photo commencé.": {"en": "Started uploading {n} photo.", "de": "Hochladen von {n} Foto gestartet."},
  "Envoi des photos restantes annulé. Les photos déjà envoyées sont conservées en brouillon.": {"en": "Remaining uploads cancelled. Photos already uploaded are kept as drafts.", "de": "Hochladen der restlichen Fotos abgebrochen. Bereits hochgeladene Fotos bleiben als Entwurf erhalten."},
  "Refusée": {"en": "Rejected", "de": "Abgelehnt"},
  "{name} refusée : {reason}.": {"en": "{name} rejected: {reason}.", "de": "{name} abgelehnt: {reason}."},
  "Session expirée : rechargez la page": {"en": "Session expired: reload the page", "de": "Sitzung abgelaufen: Laden Sie die Seite neu"},
  "Erreur du serveur ({status})": {"en": "Server error ({status})", "de": "Serverfehler ({status})"},
  "Connexion interrompue à {n} %": {"en": "Connection lost at {n}%", "de": "Verbindung bei {n} % unterbrochen"},
  "{name} : connexion interrompue. Vous pouvez réessayer cette photo.": {"en": "{name}: connection lost. You can retry this photo.", "de": "{name}: Verbindung unterbrochen. Sie können dieses Foto erneut versuchen."},
  "{name} prête.": {"en": "{name} ready.", "de": "{name} bereit."},
  "photo supprimée entre-temps": {"en": "photo deleted in the meantime", "de": "Foto inzwischen gelöscht"},
  "Import terminé : {n} photos prêtes.": {"en": "Import finished: {n} photos ready.", "de": "Import abgeschlossen: {n} Fotos bereit."},
  "Import terminé : {n} photo prête.": {"en": "Import finished: {n} photo ready.", "de": "Import abgeschlossen: {n} Foto bereit."},
  "{n} sélectionnées": {"en": "{n} selected", "de": "{n} ausgewählt"},
  "{n} sélectionnée": {"en": "{n} selected", "de": "{n} ausgewählt"},
  "Aucune photo sélectionnée": {"en": "No photo selected", "de": "Kein Foto ausgewählt"},
  "Supprimer {n} photos ?": {"en": "Delete {n} photos?", "de": "{n} Fotos löschen?"},
  "Supprimer {n} photo ?": {"en": "Delete {n} photo?", "de": "{n} Foto löschen?"},
  "{n} photos": {"en": "{n} photos", "de": "{n} Fotos"},
  "{n} photo": {"en": "{n} photo", "de": "{n} Foto"},
  "Cochez au moins une photo.": {"en": "Tick at least one photo.", "de": "Wählen Sie mindestens ein Foto aus."},
  "compris : {when}": {"en": "read as: {when}", "de": "erkannt: {when}"},
  "prise à {time}": {"en": "taken at {time}", "de": "aufgenommen um {time}"},
  "✓ Enregistré": {"en": "✓ Saved", "de": "✓ Gespeichert"},
  "● Enregistrement…": {"en": "● Saving…", "de": "● Wird gespeichert…"},
  "! Non enregistré": {"en": "! Not saved", "de": "! Nicht gespeichert"},
  "« {title} » enregistré": {"en": "“{title}” saved", "de": "„{title}“ gespeichert"},
  "« {title} » enregistrée": {"en": "“{title}” saved", "de": "„{title}“ gespeichert"},
  "Modification annulée.": {"en": "Change undone.", "de": "Änderung rückgängig gemacht."},
  "Images {done} / {total}": {"en": "Images {done} / {total}", "de": "Bilder {done} / {total}"},
  "N°{n}": {"en": "No. {n}", "de": "Nr. {n}"},
  "Ordre enregistré.": {"en": "Order saved.", "de": "Reihenfolge gespeichert."},
  "L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.": {"en": "The order could not be saved. Reload the page and try again.", "de": "Die Reihenfolge konnte nicht gespeichert werden. Laden Sie die Seite neu und versuchen Sie es erneut."},
  "« {name} » : place {pos} sur {total}.": {"en": "“{name}”: position {pos} of {total}.", "de": "„{name}“: Position {pos} von {total}."},
  "Supprimer la série « {name} » ?": {"en": "Delete the series “{name}”?", "de": "Serie „{name}“ löschen?"},
  "{n} / {max} choisies": {"en": "{n} / {max} chosen", "de": "{n} / {max} ausgewählt"},
  "{n} / {max} choisie": {"en": "{n} / {max} chosen", "de": "{n} / {max} ausgewählt"},
  "Avancer « {title} »": {"en": "Move “{title}” forward", "de": "„{title}“ nach vorne"},
  "Reculer « {title} »": {"en": "Move “{title}” back", "de": "„{title}“ nach hinten"},
  "Retirer « {title} » de l’ouverture": {"en": "Remove “{title}” from the opening slideshow", "de": "„{title}“ aus der Start-Diashow entfernen"},
  "« {title} » retirée de l’ouverture (pensez à enregistrer).": {"en": "“{title}” removed from the opening slideshow (remember to save).", "de": "„{title}“ aus der Start-Diashow entfernt (denken Sie ans Speichern)."},
  "« {title} » : place {pos} (pensez à enregistrer).": {"en": "“{title}”: position {pos} (remember to save).", "de": "„{title}“: Position {pos} (denken Sie ans Speichern)."},
  "« {title} » ajoutée en place {pos} (pensez à enregistrer).": {"en": "“{title}” added at position {pos} (remember to save).", "de": "„{title}“ an Position {pos} hinzugefügt (denken Sie ans Speichern)."},
  "Photothèque": {"en": "Photo library", "de": "Fotothek"},
  "{n} brouillons": {"en": "{n} drafts", "de": "{n} Entwürfe"},
  "{n} brouillon": {"en": "{n} draft", "de": "{n} Entwurf"},
  "{n} publiées": {"en": "{n} published", "de": "{n} veröffentlicht"},
  "{n} publiée": {"en": "{n} published", "de": "{n} veröffentlicht"},
  "Titre de la photo {title}": {"en": "Title of photo {title}", "de": "Titel des Fotos {title}"},
  "Publier les {n}": {"en": "Publish all {n}", "de": "Alle {n} veröffentlichen"},
  "Publier {n} brouillons": {"en": "Publish {n} drafts", "de": "{n} Entwürfe veröffentlichen"},
  "Publier {n} brouillon": {"en": "Publish {n} draft", "de": "{n} Entwurf veröffentlichen"},
  "Déjà publiées": {"en": "Already published", "de": "Bereits veröffentlicht"},
  "Publiée": {"en": "Published", "de": "Veröffentlicht"},
  "Brouillon": {"en": "Draft", "de": "Entwurf"},
  "Photo": {"en": "Photo", "de": "Foto"},
  "Traitement…": {"en": "Processing…", "de": "Verarbeitung…"},
  "Déjà publiée": {"en": "Already published", "de": "Bereits veröffentlicht"},
  "Publier": {"en": "Publish", "de": "Veröffentlichen"},
  "{n} ouvertures en grand": {"en": "{n} full-size views", "de": "{n}-mal groß geöffnet"},
  "{n} ouverture en grand": {"en": "{n} full-size view", "de": "{n}-mal groß geöffnet"},
  "1ʳᵉ photo la plus vue": {"en": "most viewed photo", "de": "meistgesehenes Foto"},
  "{n}ᵉ photo la plus vue": {"en": "rank {n} by views", "de": "Platz {n} nach Aufrufen"},
  "Pas encore ouverte en grand ces 30 derniers jours.": {"en": "Not opened full size in the last 30 days.", "de": "In den letzten 30 Tagen nicht groß geöffnet."},
  "publiée": {"en": "published", "de": "veröffentlicht"},
  "brouillon": {"en": "draft", "de": "Entwurf"},
  "Sélectionner « {title} »": {"en": "Select “{title}”", "de": "„{title}“ auswählen"},
  "○ Brouillon": {"en": "○ Draft", "de": "○ Entwurf"},
  "Titre provisoire": {"en": "Provisional title", "de": "Vorläufiger Titel"},
  "Annulé.": {"en": "Undone.", "de": "Rückgängig gemacht."},
  "Loupe": {"en": "Loupe", "de": "Lupe"},
  "← → photo suivante · Échap ou Espace : fermer": {"en": "← → next photo · Esc or Space: close", "de": "← → nächstes Foto · Esc oder Leertaste: schließen"},
  "Fermer la loupe": {"en": "Close the loupe", "de": "Lupe schließen"},
  "Photo précédente": {"en": "Previous photo", "de": "Vorheriges Foto"},
  "Photo suivante": {"en": "Next photo", "de": "Nächstes Foto"},
  "Développement…": {"en": "Developing…", "de": "Wird entwickelt…"},
  "Développement": {"en": "Developing", "de": "Entwicklung"},
  "Développement · {done} / {total}": {"en": "Developing · {done} / {total}", "de": "Entwicklung · {done} / {total}"},
  "En file": {"en": "Queued", "de": "In der Warteschlange"},
  "Aujourd’hui": {"en": "Today", "de": "Heute"},
  "Photos à finir": {"en": "Photos to finish", "de": "Fotos zum Fertigstellen"},
  "Brouillons": {"en": "Drafts", "de": "Entwürfe"},
  "Sorties": {"en": "Outings", "de": "Ausflüge"},
  "Personnes photographiées": {"en": "Photographed people", "de": "Fotografierte Personen"},
  "Nouvelle rencontre": {"en": "New encounter", "de": "Neue Begegnung"},
  "Séries": {"en": "Series", "de": "Serien"},
  "Site public": {"en": "Public site", "de": "Öffentliche Website"},
  "Photos de l’ouverture": {"en": "Opening slideshow photos", "de": "Fotos der Start-Diashow"},
  "Carte du monde": {"en": "World map", "de": "Weltkarte"},
  "Statistiques": {"en": "Statistics", "de": "Statistiken"},
  "Signalements": {"en": "Reports", "de": "Meldungen"},
  "Sur le terrain": {"en": "In the field", "de": "Unterwegs"},
  "Cartes d’accord": {"en": "Consent cards", "de": "Einwilligungskarten"},
  "Photographes": {"en": "Photographers", "de": "Fotografen"},
  "Apparence": {"en": "Appearance", "de": "Erscheinungsbild"},
  "Filigrane & EXIF": {"en": "Watermark & EXIF", "de": "Wasserzeichen & EXIF"},
  "Droits & confidentialité": {"en": "Rights & privacy", "de": "Rechte & Datenschutz"},
  "Aide": {"en": "Help (in French)", "de": "Hilfe (auf Französisch)"},
  "<b>Publier</b> la sélection": {"en": "<b>Publish</b> the selection", "de": "Auswahl <b>veröffentlichen</b>"},
  "<b>Dépublier</b> la sélection": {"en": "<b>Unpublish</b> the selection", "de": "Auswahl <b>nicht mehr veröffentlichen</b>"},
  "<b>Supprimer</b> la sélection…": {"en": "<b>Delete</b> the selection…", "de": "Auswahl <b>löschen</b>…"},
  "<b>Importer</b> des photos": {"en": "<b>Import</b> photos", "de": "Fotos <b>importieren</b>"},
  "<b>Nouvelle série</b>": {"en": "<b>New series</b>", "de": "<b>Neue Serie</b>"},
  "Basculer en mode <b>clair / sombre</b>": {"en": "Switch to <b>light / dark</b> mode", "de": "Zum <b>hellen / dunklen</b> Modus wechseln"},
  "<b>Voir le site</b> public": {"en": "<b>View</b> the public site", "de": "Öffentliche <b>Website ansehen</b>"},
  "Actions": {"en": "Actions", "de": "Aktionen"},
  "Photos": {"en": "Photos", "de": "Fotos"},
  "Aller à": {"en": "Go to", "de": "Gehe zu"},
  "Aller à <b>{page}</b>": {"en": "Go to <b>{page}</b>", "de": "Gehe zu <b>{page}</b>"},
  "Série <b>{name}</b>": {"en": "Series <b>{name}</b>", "de": "Serie <b>{name}</b>"},
  "Aucun résultat": {"en": "No results", "de": "Keine Ergebnisse"},
  "Suivi interrompu : session expirée ? Rechargez la page.": {"en": "Tracking stopped: session expired? Reload the page.", "de": "Verfolgung unterbrochen: Sitzung abgelaufen? Laden Sie die Seite neu."},
  "{n} image(s) n’ont pas pu être recalculées : {titles}.": {"en": "{n} image(s) could not be regenerated: {titles}.", "de": "{n} Bild(er) konnten nicht neu berechnet werden: {titles}."},
  "Images à jour.": {"en": "Images up to date.", "de": "Bilder sind aktuell."},
  "Suivi interrompu. Rechargez la page pour voir l’état des images.": {"en": "Tracking stopped. Reload the page to see the state of the images.", "de": "Verfolgung unterbrochen. Laden Sie die Seite neu, um den Stand der Bilder zu sehen."},
  "Texte par défaut rétabli : enregistrez les réglages pour l’appliquer.": {"en": "Default text restored: save the settings to apply it.", "de": "Standardtext wiederhergestellt: Speichern Sie die Einstellungen, um ihn anzuwenden."},
  "Rien à traduire : remplissez d’abord le texte français.": {"en": "Nothing to translate: fill in the French text first.", "de": "Nichts zu übersetzen: Füllen Sie zuerst den französischen Text aus."},
  "Traduction en cours…": {"en": "Translating…", "de": "Wird übersetzt…"},
  "Proposition traduite du français : relisez-la avant d’enregistrer.": {"en": "Suggestion translated from French: review it before saving.", "de": "Vorschlag aus dem Französischen übersetzt: Prüfen Sie ihn vor dem Speichern."},
  "Proposition traduite de l’anglais : relisez-la avant d’enregistrer.": {"en": "Suggestion translated from English: review it before saving.", "de": "Vorschlag aus dem Englischen übersetzt: Prüfen Sie ihn vor dem Speichern."},
  "Proposition traduite de l’allemand : relisez-la avant d’enregistrer.": {"en": "Suggestion translated from German: review it before saving.", "de": "Vorschlag aus dem Deutschen übersetzt: Prüfen Sie ihn vor dem Speichern."},
  "Proposition retirée.": {"en": "Suggestion removed.", "de": "Vorschlag entfernt."},
  "Comptes et rôles": {"en": "Accounts and roles", "de": "Konten und Rollen"},
  "Journal": {"en": "Log", "de": "Protokoll"},
  "ou": {"en": "or", "de": "oder"},
  "Série proposée :": {"en": "Suggested series:", "de": "Vorgeschlagene Serie:"},
  "Série proposée": {"en": "Suggested series", "de": "Vorgeschlagene Serie"},
  "ressemble à {n} de ses {total} photos": {"en": "looks like {n} of its {total} photos", "de": "ähnelt {n} ihrer {total} Fotos"},
  "Classer dans « {name} »": {"en": "Move to “{name}”", "de": "In „{name}“ einordnen"},
  "Garder « {name} »": {"en": "Keep “{name}”", "de": "„{name}“ behalten"},
  "Série choisie : elle sera gardée à l’enregistrement.": {"en": "Series chosen: it will be kept when you save.", "de": "Serie gewählt: Sie wird beim Speichern übernommen."},
  "{got} Mo sur {total}": {"en": "{got} MB of {total}", "de": "{got} MB von {total}"},
  "{done} photos sur {total}": {"en": "{done} of {total} photos", "de": "{done} von {total} Fotos"},
  "Envoi en cours…": {"en": "Sending…", "de": "Wird gesendet…"},
  "Voir le post ↗": {"en": "See the post ↗", "de": "Beitrag ansehen ↗"},
  "Mettre à jour la page": {"en": "Refresh the page", "de": "Seite aktualisieren"},
  "Suivi interrompu : rechargez la page pour voir où en est l’envoi.": {"en": "Tracking interrupted: reload the page to see how the sending is going.", "de": "Verfolgung unterbrochen: Laden Sie die Seite neu, um den Stand der Sendung zu sehen."},
  "Dernier essai sans succès : {error}": {"en": "Last attempt failed: {error}", "de": "Letzter Versuch fehlgeschlagen: {error}"},
  "Description prête : enregistrez vos modifications, puis rechargez la page pour la reprendre.": {"en": "Description ready: save your changes, then reload the page to use it.", "de": "Beschreibung bereit: Speichern Sie Ihre Änderungen und laden Sie dann die Seite neu, um sie zu übernehmen."},
};
function tr(s, params) {
  const e = I18N[s];
  let out = (LANG !== 'fr' && e?.[LANG]) || e?.fr || s;
  if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(params, k) ? String(params[k]) : m));
  return out;
}
const nPhotos = n => (n > 1 ? tr('{n} photos', { n }) : tr('{n} photo', { n }));

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) throw Object.assign(new Error(data.error || (res.status === 0 ? tr('Session expirée ? Rechargez la page.') : tr('Erreur {status}', { status: res.status }))), { data, status: res.status });
  return data;
}

// ----- liste déroulante qui agit (enregistre, applique) -----
// Au pointeur (souris, doigt), dès le choix ; au clavier, les flèches parcourent les options sans rien déclencher
// (sous Windows, chaque flèche émet « change » : WCAG 3.2.2). Entrée applique ; quitter la liste aussi, sauf
// onBlur: false (ce qui recharge la page ne se déclenche pas en quittant un champ).
function onPick(select, act, { onBlur = true } = {}) {
  let pointer = false;
  let start = select.value;
  const fire = () => { start = select.value; act(); };
  select.addEventListener('focus', () => { start = select.value; });
  select.addEventListener('pointerdown', () => { pointer = true; });
  select.addEventListener('keydown', e => {
    pointer = false;
    if (e.key === 'Enter' && select.value !== start) { e.preventDefault(); fire(); }
  });
  select.addEventListener('change', () => { if (pointer && select.value !== start) fire(); });
  select.addEventListener('blur', () => { pointer = false; if (onBlur && select.value !== start) fire(); });
}

// ----- message de confirmation, avec « Annuler » pendant 10 s -----
// Il survit à un rechargement de page (sessionStorage) : les actions groupées rechargent la liste.
// La région live reste rendue (vide, hors de la vue) : vidée, puis écrite au tour suivant, le message est annoncé.
// Le délai s'arrête tant que la souris ou le focus est dessus (« Annuler » reste atteignable) ; à la fermeture, le
// focus qui y était revient où il était avant.
const toast = (() => {
  const box = $('[data-toast]');
  let timer = null, fill = null, delay = 6000, before = null, hover = false;
  const restore = () => { if (box.contains(document.activeElement)) (before && document.contains(before) ? before : $('#contenu'))?.focus({ preventScroll: true }); };
  const hide = () => {
    clearTimeout(timer);
    restore();
    box.replaceChildren();
    window.__lastUndo = null;
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(hide, delay); };
  if (box) {
    box.addEventListener('mouseenter', () => { hover = true; clearTimeout(timer); });
    box.addEventListener('mouseleave', () => { hover = false; if (box.firstChild && !box.contains(document.activeElement)) arm(); });
    box.addEventListener('focusin', () => clearTimeout(timer));
    box.addEventListener('focusout', e => { if (!box.contains(e.relatedTarget) && !hover && box.firstChild) arm(); });
  }
  function show(text, { undo = null, error = false } = {}) {
    if (!box) return;
    clearTimeout(timer);
    clearTimeout(fill);
    window.__lastUndo = undo;              // ⌘Z rejoue la dernière annulation proposée
    if (!box.contains(document.activeElement)) before = document.activeElement;
    restore();                             // « Annuler » qui affiche un nouveau message : le focus n'est pas perdu
    box.replaceChildren();
    fill = setTimeout(() => {
      box.classList.toggle('error', error);
      box.innerHTML = `<span>${esc(text)}</span>`;
      if (undo) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = tr('annuler-action');
        b.addEventListener('click', async () => {
          b.disabled = true;
          try { await undo(); } catch (err) { show(tr('Annulation impossible : {msg}', { msg: err.message }), { error: true }); }
        });
        box.appendChild(b);
      }
      delay = undo ? 10000 : 6000;
      hover = box.matches(':hover');
      if (!hover) arm();
    }, 50);
  }
  // Après rechargement : message (et annulation d'action groupée) mis de côté avant.
  try {
    const saved = sessionStorage.getItem('toast');
    if (saved) {
      sessionStorage.removeItem('toast');
      const t = JSON.parse(saved);
      if (Date.now() - t.at < 15000) {
        show(t.text, {
          error: t.error,
          undo: t.undo && (async () => { const r = await postJson('/admin/photos/actions', t.undo); keep(r.text); location.reload(); }),
        });
      }
    }
  } catch { /* stockage refusé ou message illisible : les messages de cette page restent utilisables */ }
  function keep(text, undo = null, error = false) {
    try { sessionStorage.setItem('toast', JSON.stringify({ text, undo, error, at: Date.now() })); } catch { /* rechargement sans message mémorisé */ }
  }
  return { show, keep };
})();

// ----- textes réservés au JavaScript / sans JavaScript -----
$$('[data-js-only]').forEach(el => { el.hidden = false; });

// ----- galeries privées : au téléphone, le champ qui prend le focus ne reste jamais sous la barre d'onglets fixe (un champ
// en partie visible n'est pas défilé par le navigateur ; WCAG 2.4.12) -----
if ($('.gp')) document.addEventListener('focusin', e => {
  const bar = $('.tabbar');
  if (!bar || getComputedStyle(bar).display === 'none' || !e.target.closest?.('.gp')) return;
  const r = e.target.getBoundingClientRect(), top = bar.getBoundingClientRect().top;
  if (r.bottom > top && r.top < top) window.scrollBy(0, r.bottom - top + 16);
});

// ----- galeries privées : « Copier » le lien, le mot de passe ou un message (page affichée une seule fois) -----
$$('[data-copier]').forEach(b => b.addEventListener('click', async () => {
  const src = document.getElementById(b.dataset.copier);
  if (!src) return;
  try {
    await navigator.clipboard.writeText(src.textContent.trim());
    const label = b.textContent;
    b.textContent = `✓ ${b.dataset.copie || label}`;
    setTimeout(() => { b.textContent = label; }, 2500);
  } catch { /* presse-papiers refusé : le texte reste sélectionnable */ }
}));

// ----- menu mobile -----
// Sans script, « Menu » est un lien vers #admin-nav (ouvert par :target, voir admin.css) ; ici, il redevient un bouton.
(function () {
  const side = $('[data-side]');
  const link = $('[data-menu]');
  if (!side || !link) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = link.className;
  btn.dataset.menu = '';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', side.id);
  btn.append(...link.childNodes);
  link.replaceWith(btn);
  // Menu ouvert, la page (et la barre d'onglets, la fenêtre « Nouveautés ») est inerte : ni le clavier ni un lecteur
  // d'écran n'y entrent ; à la fermeture, le focus revient au bouton « Menu ». La palette (⌘K) reste utilisable.
  const rest = () => [$('.shell > .main'), ...$$('body > :not(.shell, .skip, script, [data-cmdk])')].filter(Boolean);
  // Le focus entre dans le menu un instant après l'ouverture ; refermé avant (Échap aussitôt), il reste sur « Menu ».
  let entering;
  const set = open => {
    const was = side.classList.contains('open');
    side.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    for (const el of rest()) el.inert = open;
    clearTimeout(entering);
    if (open) entering = setTimeout(() => { if (side.classList.contains('open')) $('a[aria-current], a', side)?.focus(); }, 50);
    else if (was) btn.focus();
  };
  btn.addEventListener('click', e => { e.stopPropagation(); set(!side.classList.contains('open')); });
  $('[data-menu-close]', side)?.addEventListener('click', e => { e.preventDefault(); set(false); });
  document.addEventListener('click', e => { if (side.classList.contains('open') && !side.contains(e.target)) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && side.classList.contains('open')) set(false); });
  // Au bureau, la barre est toujours là : un menu resté ouvert au téléphone ne laisse pas la page inerte.
  matchMedia('(min-width: 721px)').addEventListener('change', e => { if (e.matches && side.classList.contains('open')) { side.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); for (const el of rest()) el.inert = false; } });
})();

// ----- mode clair / sombre : appliqué tout de suite, mémorisé (cookie lu par le serveur) -----
(function () {
  const form = $('[data-theme-form]');
  if (!form) return;
  const btn = $('[data-theme-toggle]', form);
  const effective = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const label = () => { const next = effective() === 'light' ? 'dark' : 'light'; btn.value = next; btn.setAttribute('aria-label', next === 'light' ? tr('Passer en mode clair') : tr('Passer en mode sombre')); };
  label();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const next = effective() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    $('meta[name=color-scheme]')?.setAttribute('content', next);
    label();
    try { await postJson('/admin/theme', { theme: next }); } catch { /* le choix reste appliqué pour cette page */ }
  });
})();

// ----- menus « ⋯ » : un seul ouvert, fermés par Échap ou un clic ailleurs -----
(function () {
  const menus = () => $$('details.menu[open]');
  document.addEventListener('click', e => menus().forEach(d => { if (!d.contains(e.target)) d.open = false; }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    menus().forEach(d => { d.open = false; d.querySelector('summary').focus(); });
  });
})();

// ----- filtres : appliqués dès qu'une liste change (au pointeur) ; au clavier, Entrée ou « Filtrer » -----
(function () {
  const form = $('[data-filters]');
  if (!form) return;
  const button = $('[data-filter-submit]', form);
  $$('select', form).forEach(s => {
    onPick(s, () => form.requestSubmit(), { onBlur: false });
    // Choix au clavier : le bouton « Filtrer » (masqué avec JavaScript) réapparaît pour appliquer.
    s.addEventListener('change', () => { if (s.value !== s.dataset.applied) button?.removeAttribute('data-nojs'); });
    s.dataset.applied = s.value;
  });
  const hint = $('[data-drop-hint]');
  if (hint) hint.hidden = false;
})();

// ----- indicateur « Traitement : n photos » (en-tête) -----
const activity = (() => {
  const box = $('[data-activity]');
  let timer = null;
  function set(n) {
    if (!box) return;
    box.hidden = !n;
    $('[data-activity-text]', box).textContent = n > 1 ? tr('Traitement : {n} photos', { n }) : tr('Traitement : {n} photo', { n });
  }
  async function poll() {
    try {
      const res = await fetch('/admin/photos/traitement', { headers: { accept: 'application/json' }, redirect: 'manual' });
      if (!res.ok) return;
      const { active } = await res.json();
      set(active);
      if (!active) { clearInterval(timer); timer = null; }
    } catch { /* réseau : on réessaie au prochain tour */ }
  }
  const watch = () => { if (!timer) timer = setInterval(poll, 2000); };
  if (box && !box.hidden) watch();
  return { set, watch };
})();

// ----- import : vérifier avant d'envoyer, puis envoi et traitement photo par photo -----
(function () {
  const section = $('[data-importer]');
  if (!section) return;
  const form = $('[data-import]', section);
  const input = $('input[type=file]', form);
  const list = $('[data-files]', section);
  const send = $('[data-send]', form);
  const cancel = $('[data-cancel]', form);
  const note = $('[data-import-note]', form);
  const sub = $('[data-import-sub]', section);
  const summary = $('[data-summary]', section);
  const next = $('[data-sum-next]', section);
  const defaults = $('[data-defaults]', section);
  const steps = $$('.steps li', section);
  const MAX_BYTES = Number(section.dataset.maxBytes);
  const MAX_PIXELS = 120e6;
  // Envois simultanés : 3 au plus, et 100 Mo au plus en cours d'envoi (au-delà, la photo suivante attend).
  // Chaque photo est une requête distincte : la limite de Cloudflare (100 Mo par requête) vaut par fichier.
  const PARALLEL = 3;
  const INFLIGHT_BYTES = 100 * 1000 * 1000;
  input.required = false;
  if ($('[data-contact]')) section.classList.add('with-grid');

  const items = [];
  let seq = 0;
  let started = 0;
  let firstStep = 0;            // début du traitement observé (premier état reçu)
  let lastDone = 0;             // dernière photo devenue prête
  let sending = false;
  const mb = n => (n < 1024 * 1024 ? tr('{n} Ko', { n: Math.max(1, Math.round(n / 1024)) }) : tr('{n} Mo', { n: (n / 1024 / 1024).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) }));

  // Ouvrir / fermer sans recharger la page.
  const open = () => {
    section.hidden = false;
    history.replaceState(null, '', `${location.pathname}?importer${location.hash}`);
    $('#import-title').setAttribute('tabindex', '-1');
    $('#import-title').focus();
  };
  // « Importer des photos » ouvre directement le choix des fichiers.
  $$('[data-import-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); open(); input.click(); }));
  $('[data-import-close]', section).addEventListener('click', e => {
    if (items.some(i => i.photoId)) return;          // des photos ont été envoyées : la liste se recharge
    e.preventDefault();
    if (sending) return;
    items.splice(0).forEach(i => i.url && URL.revokeObjectURL(i.url));
    render();
    section.hidden = true;
    history.replaceState(null, '', location.pathname);
    $('[data-import-open]')?.focus();
  });

  // Déposer des photos n'importe où sur la page.
  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  document.addEventListener('dragenter', e => { if (hasFiles(e)) { depth++; document.body.classList.add('dropping'); } });
  document.addEventListener('dragleave', e => { if (hasFiles(e) && --depth <= 0) { depth = 0; document.body.classList.remove('dropping'); } });
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dropping');
    if (section.hidden) open();
    add([...e.dataTransfer.files]);
  });
  input.addEventListener('change', () => { add([...input.files]); input.value = ''; });

  // Nature réelle du fichier, d'après ses premiers octets (une extension ne prouve rien).
  async function sniff(file) {
    const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const at = (o, ...v) => v.every((x, i) => b[o + i] === x);
    const str = (o, s) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
    if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
    if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'png';
    if (str(0, 'RIFF') && str(8, 'WEBP')) return 'webp';
    if (at(0, 0x49, 0x49, 0x2a, 0x00) || at(0, 0x4d, 0x4d, 0x00, 0x2a)) return 'tiff';
    if (str(4, 'ftyp')) return /^(heic|heix|hevc|hevx|mif1|msf1|avif|avis)/.test(String.fromCharCode(...b.slice(8, 12))) ? 'heif' : null;
    return null;
  }
  const size = (url) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });

  async function add(files) {
    await check(files);
    start();                     // les photos valides partent aussitôt : aucun bouton à cliquer
  }
  async function check(files) {
    for (const file of files) {
      if (items.some(i => !i.removed && i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified)) continue;
      const item = { key: ++seq, file, state: 'checking', reason: '', meta: mb(file.size) };
      items.push(item);
      render();
      if (file.size > MAX_BYTES) { Object.assign(item, { state: 'bad', reason: tr('Trop lourde ({max} max.)', { max: mb(MAX_BYTES) }) }); render(); continue; }
      const kind = await sniff(file);
      if (!kind) { Object.assign(item, { state: 'bad', reason: tr('Ce n’est pas une image') }); render(); continue; }
      if (['jpeg', 'png', 'webp'].includes(kind)) {
        item.url = URL.createObjectURL(file);
        const d = await size(item.url);
        if (d) { item.meta += ` · ${d.w} × ${d.h}`; item.w = d.w; item.h = d.h; }
        if (d && d.w * d.h > MAX_PIXELS) { Object.assign(item, { state: 'bad', reason: tr('Trop grande (120 Mpx max.)') }); render(); continue; }
      } else item.label = kind.toUpperCase();
      item.state = 'ready';
      render();
    }
  }

  // ----- affichage -----
  const live = () => items.filter(i => !i.removed);
  const BADGE = {
    checking: ['wait', tr('… Vérification')], ready: ['ok', tr('✓ Prête à envoyer')], queued: ['wait', tr('… En attente')],
    uploading: ['wait', tr('↑ Envoi')], waiting: ['wait', tr('… En file')], processing: ['wait', tr('… Traitement')],
    done: ['ok', tr('✓ Prête')], failed: ['err', tr('! Échec')], bad: ['err', null], cancelled: ['wait', tr('— Annulée')],
  };
  function row(i) {
    const [cls, label] = BADGE[i.state];
    let middle;
    if (i.state === 'bad') middle = `<span class="hint">${tr('Ne sera pas envoyée')}</span>`;
    else if (i.state === 'ready' || i.state === 'checking') middle = `<span class="hint">${tr('Sera envoyée')}</span>`;
    else if (i.state === 'uploading') middle = `<div class="bar"><i data-w="${i.up}"></i></div><span class="cap">${tr('Envoi {pct} % · {done} / {total}', { pct: i.up, done: mb(i.file.size * i.up / 100), total: mb(i.file.size) })}</span>`;
    else if (i.state === 'waiting' || i.state === 'processing') {
      const pct = i.total ? Math.round(100 * i.done / i.total) : 0;
      middle = `<div class="bar proc"><i data-w="${pct}"></i></div><span class="cap">${i.total ? tr('Traitement : images {done} / {total}', { done: i.done, total: i.total }) : tr('Envoyée · traitement en attente')}</span>`;
    } else if (i.state === 'done') middle = `<div class="bar"><i data-w="100"></i></div><span class="cap">${tr('Envoyée · images prêtes')}</span>`;
    else if (i.state === 'failed') middle = `<div class="bar fail"><i data-w="${i.up || 0}"></i></div><span class="cap">${esc(i.reason)}</span>`;
    else middle = `<span class="hint">${i.state === 'queued' ? tr('Sera envoyée') : tr('Non envoyée')}</span>`;
    let act = '';
    if (['ready', 'bad', 'checking'].includes(i.state)) act = `<button class="iconbtn" type="button" data-remove="${i.key}" aria-label="${tr('Retirer {name}', { name: esc(i.file.name) })}">✕</button>`;
    else if (i.state === 'failed' && i.retry || i.state === 'cancelled') act = `<button class="btn ghost" type="button" data-retry="${i.key}">${tr('Réessayer')}</button>`;
    const thumb = i.url ? `<img class="thumbf" src="${i.url}" alt="">` : `<span class="thumbf" aria-hidden="true">${i.state === 'bad' ? '✕' : esc(i.label || '…')}</span>`;
    return `<li class="${i.state === 'bad' ? 'bad' : ''}" data-key="${i.key}">${thumb}<span class="name">${esc(i.file.name)}<span class="meta">${esc(i.meta)}</span></span>`
      + `<span>${middle}</span><span class="st ${cls}">${esc(label || '✕ ' + i.reason)}</span><span class="act">${act}</span></li>`;
  }

  function render() {
    const all = live();
    list.hidden = !all.length;
    list.innerHTML = all.map(row).join('');
    // Largeurs posées par le CSSOM : la politique de sécurité interdit les attributs style.
    $$('[data-w]', list).forEach(el => { el.style.width = `${el.dataset.w}%`; });
    const count = s => all.filter(i => (Array.isArray(s) ? s : [s]).includes(i.state)).length;
    const valid = count('ready');
    const bad = count('bad');
    if (!started) {
      send.textContent = valid ? (valid > 1 ? tr('Envoyer les {n} photos valides', { n: valid }) : tr('Envoyer la photo valide')) : tr('Envoyer');
      send.disabled = !valid || count('checking') > 0;
      note.textContent = bad ? (bad > 1 ? tr('{n} fichiers écartés : ils ne seront pas envoyés.', { n: bad }) : tr('{n} fichier écarté : il ne sera pas envoyé.', { n: bad })) : '';
      $('[data-drop-title]', form).textContent = all.length ? tr('Ajoutez d’autres photos') : tr('Glissez vos photos ici');
      return;
    }
    // Étape 2 : barre du lot, décompte par état, temps restant.
    const sent = all.filter(i => i.state !== 'bad');
    const ready = count('done');
    const proc = count(['waiting', 'processing']);
    const working = count('processing');
    const up = count(['uploading', 'queued']);
    const failed = count(['failed', 'cancelled']);
    const frac = sent.length ? sent.reduce((a, i) => a + (i.state === 'done' ? 1 : i.state === 'processing' || i.state === 'waiting' ? 0.5 + 0.5 * (i.total ? i.done / i.total : 0) : i.state === 'uploading' ? 0.5 * i.up / 100 : 0), 0) / sent.length : 0;
    const left = proc + up;
    // Temps restant : d'après la durée de traitement des photos déjà prêtes (les tailles d'images
    // n'ont pas toutes le même coût : on attend une photo complète avant d'estimer).
    let eta = '';
    if (left) {
      const doneN = sent.filter(i => i.state === 'done').length;
      if (doneN && firstStep && lastDone > firstStep) {
        const perPhoto = (lastDone - firstStep) / 1000 / doneN;
        const remaining = sent.filter(i => !['done', 'failed', 'cancelled', 'bad'].includes(i.state))
          .reduce((a, i) => a + 1 - (i.state === 'processing' && i.total ? i.done / i.total : 0), 0);
        const sec = Math.max(1, Math.round(remaining * perPhoto));
        const time = sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`;
        eta = ` — ${sec > 1 ? tr('environ {time} restantes', { time }) : tr('environ {time} restante', { time })}`;
      } else eta = ` — ${tr('calcul du temps restant…')}`;
    }
    summary.hidden = false;
    $('[data-sum-title]', summary).textContent = ready > 1 ? tr('{ready} photos prêtes sur {total}', { ready, total: sent.length }) : tr('{ready} photo prête sur {total}', { ready, total: sent.length });
    $('[data-sum-detail]', summary).textContent = [working && tr('· {n} en traitement', { n: working }), proc - working && tr('· {n} en file', { n: proc - working }), up && tr('· {n} en envoi', { n: up }), failed && (failed > 1 ? tr('· {n} en échec ou annulées', { n: failed }) : tr('· {n} en échec ou annulée', { n: failed }))].filter(Boolean).join(' ') + eta;
    $('[data-sum-bar]', summary).style.width = `${Math.round(frac * 100)}%`;
    const ids = all.filter(i => i.photoId && i.state !== 'failed').map(i => i.photoId);
    sending = up > 0;
    next.hidden = sending || !ids.length;
    next.href = `/admin/photos/lot?ids=${ids.join(',')}`;
    next.textContent = ids.length > 1 ? tr('Compléter et publier les {n} photos →', { n: ids.length }) : tr('Compléter et publier la photo →');
    // Le focus va sur « Compléter… » seulement s'il n'est pas ailleurs (saisie dans l'inspecteur, autre champ) : sinon
    // la saisie serait coupée, et les lettres suivantes déclencheraient des raccourcis.
    if (!next.hidden && !next.dataset.focused) {
      next.dataset.focused = '1';
      const at = document.activeElement;
      if (!at || at === document.body || section.contains(at)) next.focus();
    }
    cancel.hidden = !up;
    send.hidden = true;
    defaults.hidden = true;
    steps[0].removeAttribute('aria-current'); steps[0].classList.add('done');
    if (!left) { steps[1].removeAttribute('aria-current'); steps[1].classList.add('done'); steps[2].setAttribute('aria-current', 'step'); }
    else steps[1].setAttribute('aria-current', 'step');
    sub.textContent = sending
      ? tr('Envoi en cours : gardez cette page ouverte. Le traitement des photos déjà envoyées continue même si vous la quittez.')
      : left ? tr('Envoi terminé. Le traitement continue sur le serveur : vous pouvez compléter les photos dès maintenant.') : tr('Toutes les photos sont prêtes.');
  }

  // Annonce vocale : seulement les changements d'état importants (pas chaque pourcentage).
  const announce = text => { note.textContent = text; };

  list.addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    const retry = e.target.closest('[data-retry]');
    if (rm) {
      const i = items.find(x => x.key === Number(rm.dataset.remove));
      i.removed = true;
      if (i.url) URL.revokeObjectURL(i.url);
      render();
      (list.querySelector('[data-remove]') || $('input[type=file]', form)).focus();
    }
    if (retry) {
      const i = items.find(x => x.key === Number(retry.dataset.retry));
      Object.assign(i, { state: 'queued', up: 0, reason: '' });
      render();
      pump();
    }
  });

  function start() {
    const ready = live().filter(i => i.state === 'ready');
    if (!ready.length) return;
    if (!started) started = Date.now();
    ready.forEach(i => { i.state = 'queued'; i.up = 0; });
    announce(ready.length > 1 ? tr('Envoi de {n} photos commencé.', { n: ready.length }) : tr('Envoi de {n} photo commencé.', { n: ready.length }));
    pump();
  }
  form.addEventListener('submit', e => { e.preventDefault(); start(); });

  cancel.addEventListener('click', () => {
    live().forEach(i => {
      if (i.state === 'queued') i.state = 'cancelled';
      if (i.state === 'uploading') { i.xhr?.abort(); i.state = 'cancelled'; }
    });
    render();
    announce(tr('Envoi des photos restantes annulé. Les photos déjà envoyées sont conservées en brouillon.'));
  });

  addEventListener('beforeunload', e => { if (sending) { e.preventDefault(); e.returnValue = ''; } });

  function pump() {
    for (;;) {
      const sendingNow = live().filter(i => i.state === 'uploading');
      const i = live().find(x => x.state === 'queued');
      if (!i || sendingNow.length >= PARALLEL) break;
      const inflight = sendingNow.reduce((sum, x) => sum + x.file.size, 0);
      if (sendingNow.length && inflight + i.file.size > INFLIGHT_BYTES) break;   // attend qu'un envoi se termine
      upload(i);
    }
    render();
  }

  function upload(i) {
    i.state = 'uploading';
    i.up = 0;
    const fd = new FormData();
    fd.append('_csrf', CSRF);                                  // le jeton d'abord : rien n'est lu sans lui
    fd.append('author_id', $('select[name=author_id]', form).value);
    fd.append('category_id', $('select[name=category_id]', form).value);
    fd.append('photos', i.file, i.file.name);
    const xhr = new XMLHttpRequest();
    i.xhr = xhr;
    let last = 0;
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      i.up = Math.min(99, Math.round(100 * e.loaded / e.total));
      if (Date.now() - last > 250) { last = Date.now(); render(); }
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* vide */ }
      if (xhr.status === 200 && data.id) {
        Object.assign(i, { state: 'waiting', photoId: data.id, up: 100, done: 0, total: 0, title: data.title });
        window.__library?.arrived(i);
        watch();
      } else if (xhr.status >= 400 && xhr.status < 500 && xhr.status !== 403) {
        Object.assign(i, { state: 'bad', reason: data.error ? data.error.charAt(0).toUpperCase() + data.error.slice(1) : tr('Refusée') });
        announce(tr('{name} refusée : {reason}.', { name: i.file.name, reason: i.reason }));
      } else {
        Object.assign(i, { state: 'failed', retry: true, reason: xhr.status === 403 ? tr('Session expirée : rechargez la page') : tr('Erreur du serveur ({status})', { status: xhr.status }) });
      }
      pump();
    };
    xhr.onerror = () => {
      Object.assign(i, { state: 'failed', retry: true, reason: tr('Connexion interrompue à {n} %', { n: i.up }) });
      announce(tr('{name} : connexion interrompue. Vous pouvez réessayer cette photo.', { name: i.file.name }));
      pump();
    };
    xhr.onabort = () => { if (i.state === 'uploading') i.state = 'cancelled'; pump(); };
    xhr.open('POST', '/admin/photos/envoi');
    xhr.setRequestHeader('accept', 'application/json');
    xhr.send(fd);
  }

  // Suivi du traitement côté serveur.
  let timer = null;
  function watch() {
    if (timer) return;
    timer = setInterval(async () => {
      const pending = live().filter(i => i.state === 'waiting' || i.state === 'processing');
      if (!pending.length) { clearInterval(timer); timer = null; return; }
      try {
        const res = await fetch(`/admin/photos/traitement?ids=${pending.map(i => i.photoId).join(',')}`, { headers: { accept: 'application/json' }, redirect: 'manual' });
        if (!res.ok) return;
        const data = await res.json();
        activity.set(data.active);
        if (!firstStep && data.photos.some(p => p.state === 'processing' || p.state === 'ready')) firstStep = Date.now() - 1000;
        for (const p of data.photos) {
          const i = pending.find(x => x.photoId === p.id);
          if (p.state === 'ready') { Object.assign(i, { state: 'done', done: p.total, total: p.total }); lastDone = Date.now(); announce(tr('{name} prête.', { name: i.file.name })); window.__library?.ready(i); }
          else if (p.state === 'error' || p.state === 'missing') { window.__library?.gone(i); Object.assign(i, { state: 'failed', retry: false, photoId: null, reason: p.error || tr('photo supprimée entre-temps') }); }
          else { Object.assign(i, { state: p.state, done: p.done, total: p.total }); window.__library?.progress(i); }
        }
        render();
        if (!live().some(i => ['queued', 'uploading', 'waiting', 'processing'].includes(i.state))) {
          const ok = live().filter(i => i.state === 'done').length;
          announce(ok > 1 ? tr('Import terminé : {n} photos prêtes.', { n: ok }) : tr('Import terminé : {n} photo prête.', { n: ok }));
          window.__library?.finished(live().filter(i => i.state === 'done').map(i => i.photoId));
        }
      } catch { /* réseau : prochain tour */ }
    }, 1000);
  }

  if (!section.hidden) $('#import-title').setAttribute('tabindex', '-1');
})();

// ----- sélection multiple et actions groupées (Photos, Compléter le lot) -----
(function () {
  const bar = $('[data-bulk]');
  if (!bar) return;
  const batch = bar.hasAttribute('data-batch');
  const library = Boolean(bar.closest('[data-library]'));
  const boxes = () => $$(`input.chk[name=ids][form=bulk]`);
  const checked = () => boxes().filter(b => b.checked);
  const count = $('[data-bulk-count]', bar);
  const clear = $('[data-bulk-clear]', bar);
  const allBox = $('[data-select-all] input') || $('[data-select-all-lot]');
  const allLabel = $('[data-select-all]');
  const newName = $('[data-bulk-new]', bar);
  const catSelect = $('[data-bulk-category]', bar);
  if (allLabel) allLabel.hidden = false;
  if (clear) clear.hidden = false;

  function update() {
    const n = checked().length;
    count.textContent = n ? (n > 1 ? tr('{n} sélectionnées', { n }) : tr('{n} sélectionnée', { n })) : tr('Aucune photo sélectionnée');
    if (!batch && !library) bar.hidden = n === 0;
    // D'abord l'état général des boutons, puis l'inspecteur l'affine (ex. « Déjà publiée » reste désactivé).
    $$('button[name=action]', bar).forEach(b => { b.disabled = n === 0; });
    document.dispatchEvent(new CustomEvent('selection', { detail: { n } }));
    if (allBox) { allBox.checked = n > 0 && n === boxes().length; allBox.indeterminate = n > 0 && n < boxes().length; }
  }
  document.addEventListener('change', e => { if (e.target.matches('input.chk[name=ids][form=bulk]')) update(); });
  // Maj + clic : toute la plage depuis la case précédente (comme dans un gestionnaire de fichiers).
  let last = null;
  document.addEventListener('click', e => {
    const box = e.target.closest('input.chk[name=ids][form=bulk]');
    if (!box) return;
    if (e.shiftKey && last && last !== box) {
      const all = boxes();
      const [a, b] = [all.indexOf(last), all.indexOf(box)].sort((x, y) => x - y);
      all.slice(a, b + 1).forEach(x => { x.checked = box.checked; });
      update();
    }
    last = box;
  });
  allBox?.addEventListener('change', () => { boxes().forEach(b => { b.checked = allBox.checked; }); update(); });
  clear?.addEventListener('click', () => { boxes().forEach(b => { b.checked = false; }); update(); boxes()[0]?.focus(); });
  catSelect?.addEventListener('change', () => newName.classList.toggle('on', catSelect.value === 'new'));
  if (catSelect) onPick(catSelect, () => { if (catSelect.value === 'new') newName.focus(); });   // pas à chaque flèche
  update();

  // Confirmation avant suppression. La publication, elle, se fait en un clic : le titre provisoire est
  // signalé dans la page avant le clic, et le message qui suit propose Annuler.
  const confirmDelete = n => new Promise(resolve => {
    const d = $('[data-confirm-delete]');
    if (!d) return resolve(confirm(n > 1 ? tr('Supprimer {n} photos ?', { n }) : tr('Supprimer {n} photo ?', { n })));
    $('[data-del-count]', d).textContent = nPhotos(n);
    const done = v => { d.close(); resolve(v); };
    $('[data-del-ok]', d).onclick = () => done(true);
    $('[data-del-cancel]', d).onclick = () => done(false);
    d.oncancel = () => resolve(false);
    d.showModal();
  });

  // Compléter le lot : série, lieu et date s'appliquent aux photos cochées dès qu'on les change.
  if (batch) {
    // Sur téléphone, ces champs (qui changent toutes les photos cochées) sont repliés derrière un bouton.
    const toggle = $('[data-bulk-toggle]', bar);
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        const open = bar.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
        if (open) catSelect.focus();
      });
    }
    const apply = (action, extra) => run(action, extra, null);
    onPick(catSelect, () => { if (catSelect.value && catSelect.value !== 'new') apply('category', { category_id: catSelect.value }); });
    newName.addEventListener('change', () => { if (newName.value.trim()) apply('category', { category_id: 'new', new_category: newName.value }); });
    bar.elements.place.addEventListener('change', () => { if (bar.elements.place.value.trim()) apply('fields', { place: bar.elements.place.value }); });
    bar.elements.taken_on.addEventListener('change', () => { if (bar.elements.taken_on.value.trim()) apply('fields', { taken_on: bar.elements.taken_on.value }); });
    // Entrée : applique le champ (comme le quitter), sans envoyer le formulaire.
    [bar.elements.place, bar.elements.taken_on].forEach(f => f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); f.focus(); } }));
  }

  async function run(action, extra, button) {
    const ids = checked().map(b => Number(b.value));
    if (!ids.length) return toast.show(tr('Cochez au moins une photo.'), { error: true });
    const body = { ids, action, back: bar.elements.back.value, ...extra };
    if (button) button.disabled = true;
    try {
      const r = await postJson('/admin/photos/actions', body);
      if (batch && (action === 'fields' || action === 'category')) {
        // Mise à jour sur place : pas de rechargement, la saisie continue.
        for (const id of ids) {
          const row = $(`tr[data-id="${id}"]`);
          if (!row) continue;
          if (action === 'category') {
            const sel = $('select[data-field=category_id]', row);
            if (r.category && !$(`option[value="${r.category.id}"]`, sel)) sel.add(new Option(r.category.name, r.category.id));
            if (r.category) { sel.value = r.category.id; sel.dataset.saved = sel.value; }
          }
          if (action === 'fields' && r.values.place) { const f = $('input[data-field=place]', row); f.value = r.values.place; f.dataset.saved = f.value; }
          if (action === 'fields' && r.values.taken_on) {
            const f = $('input[data-field=taken_on]', row);
            f.value = r.values.taken_on; f.dataset.saved = f.value;
            f.removeAttribute('aria-invalid');
            const note = $('.cellnote', f.closest('td')); note.classList.remove('err'); note.textContent = [tr('compris : {when}', { when: r.values.taken_on }), note.dataset.time].filter(Boolean).join(' · ');
          }
          $('[data-state]', row).textContent = tr('✓ Enregistré');
        }
        if (action === 'category' && r.category && !$(`option[value="${r.category.id}"]`, catSelect)) catSelect.add(new Option(r.category.name, r.category.id), catSelect.options[catSelect.options.length - 1]);
        if (action === 'category') { catSelect.value = ''; newName.value = ''; newName.classList.remove('on'); }
        toast.show(r.text, r.undo ? { undo: async () => { const u = await postJson('/admin/photos/actions', r.undo); toast.keep(u.text); location.reload(); } } : {});
        return;
      }
      toast.keep(r.text, r.undo || null);
      location.reload();
    } catch (err) {
      if (button) button.disabled = false;
      toast.show(err.message, { error: true });
    }
  }

  bar.addEventListener('submit', async e => {
    e.preventDefault();
    // Entrée dans un champ (envoi implicite) prend le premier bouton du formulaire, celui de la version sans script
    // (« Changer de série », masqué) : ignoré ; les champs s'enregistrent d'eux-mêmes.
    if (e.submitter?.matches('[data-nojs]')) return;
    const action = e.submitter?.value;
    const ids = checked().map(b => Number(b.value));
    if (!action || !ids.length) return;
    const body = { ids, action, back: bar.elements.back.value };
    if (action === 'category') Object.assign(body, { category_id: catSelect.value, new_category: newName.value });
    if (action === 'fields') Object.assign(body, { place: bar.elements.place.value, taken_on: bar.elements.taken_on.value });
    if (action === 'delete') { if (!(await confirmDelete(ids.length))) return; body.confirm = true; }
    const { ids: _, action: __, back: ___, ...extra } = body;
    run(action, extra, e.submitter);
  });
})();

// ----- compléter le lot : enregistrement à la sortie de chaque champ -----
(function () {
  const lot = $('[data-lot]');
  if (!lot) return;
  const stateOf = row => $('[data-state]', row);

  lot.addEventListener('submit', e => e.preventDefault());       // Entrée : le champ s'enregistre au change
  lot.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); e.target.blur(); e.target.focus(); } });

  async function save(field, value, previous) {
    const row = field.closest('tr');
    const id = row.dataset.id;
    const key = field.dataset.field;
    const cell = field.closest('td');
    const note = key === 'taken_on' ? $('.cellnote', cell) : null;
    stateOf(row).textContent = tr('● Enregistrement…');
    try {
      const { photo } = await postJson(`/admin/photos/${id}/champs`, { [key]: value });
      field.removeAttribute('aria-invalid');
      field.dataset.saved = key === 'taken_on' ? (photo.taken_on || '') : value;
      // Texte de remplacement : la version enregistrée (une ligne, bornée côté serveur).
      if (key === 'alt_text' && typeof photo.alt_text === 'string') { field.value = photo.alt_text; field.dataset.saved = photo.alt_text; }
      // L'heure de prise de vue (data-time) reste à côté de la date comprise.
      if (note) { note.classList.remove('err'); note.textContent = [photo.when && tr('compris : {when}', { when: photo.when }), note.dataset.time].filter(Boolean).join(' · '); }
      if (key === 'title') {
        row.dataset.title = photo.title;
        row.toggleAttribute('data-provisional', photo.provisional);
        $('[id^=prov-]', row).hidden = !photo.provisional;
      }
      stateOf(row).textContent = tr('✓ Enregistré');
      const label = row.dataset.title;
      toast.show(tr('« {title} » enregistré', { title: label }), previous === undefined ? {} : {
        undo: async () => { field.value = previous; await save(field, previous); toast.show(tr('Modification annulée.')); },
      });
    } catch (err) {
      const msg = err.data?.errors ? Object.values(err.data.errors).join(' ') : err.message;
      field.setAttribute('aria-invalid', 'true');
      if (note) { note.classList.add('err'); note.textContent = msg; }
      stateOf(row).textContent = tr('! Non enregistré');
      toast.show(msg, { error: true });
    }
  }
  $$('[data-field]', lot).forEach(f => {
    f.dataset.saved = f.value;
    const commit = () => { const prev = f.dataset.saved; if (f.value !== prev) save(f, f.value, prev); };
    if (f.matches('select')) onPick(f, commit); else f.addEventListener('change', commit);
  });

  // Vignettes des photos encore en traitement.
  // Une photo en échec ou supprimée sort du suivi (son état est affiché) ; refus ou session expirée : le suivi
  // s'arrête ; 20 minutes au plus.
  const pending = () => $$('[data-processing]', lot).map(ph => ph.closest('tr'));
  if (pending().length) {
    let tries = 0;
    const timer = setInterval(async () => {
      const rows = pending();
      if (!rows.length || ++tries > 800) return clearInterval(timer);
      try {
        const res = await fetch(`/admin/photos/traitement?ids=${rows.map(r => r.dataset.id).join(',')}`, { headers: { accept: 'application/json' }, redirect: 'manual' });
        if (!res.ok) return clearInterval(timer);
        const data = await res.json();
        for (const p of data.photos) {
          const row = rows.find(r => Number(r.dataset.id) === p.id);
          const ph = row && $('[data-processing]', row);
          if (!ph) continue;
          if (p.state === 'ready') ph.outerHTML = `<img src="${p.thumb}" alt="" width="84" height="56">`;
          else if (p.state === 'error' || p.state === 'missing') {
            ph.removeAttribute('data-processing');
            ph.textContent = p.state === 'missing' ? tr('photo supprimée entre-temps') : `${tr('! Échec')} · ${p.error || ''}`;
          } else if (p.total) ph.textContent = tr('Images {done} / {total}', { done: p.done, total: p.total });
        }
      } catch { /* réseau : prochain tour */ }
    }, 1500);
  }
})();

// ----- réordonnancement des photos par glisser-déposer -----
// Le menu ⋯ de chaque ligne (Monter, Descendre) reste l'alternative clavier et sans JS.
(function () {
  const list = $('.plist[data-sortable]');
  if (!list) return;
  let dragged = null;
  const clear = () => $$('.drop-before, .drop-after', list).forEach(li => li.classList.remove('drop-before', 'drop-after'));
  const after = (li, e) => e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
  const renumber = () => [...list.children].forEach((el, i) => { $('.handle', el).textContent = tr('N°{n}', { n: String(i + 1).padStart(2, '0') }); });
  $$('li', list).forEach(li => {
    li.draggable = true;
    $$('a, img', li).forEach(el => { el.draggable = false; });      // la ligne entière se déplace
    li.addEventListener('dragstart', e => {
      if (e.target.closest && e.target.closest('input, details')) return;
      dragged = li; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); clear(); dragged = null; });
    li.addEventListener('dragover', e => {
      if (!dragged || dragged === li) return;
      e.preventDefault();
      clear();
      li.classList.add(after(li, e) ? 'drop-after' : 'drop-before');
    });
    li.addEventListener('drop', async e => {
      if (!dragged || dragged === li) return;
      e.preventDefault();
      e.stopPropagation();
      const before = [...list.children];
      list.insertBefore(dragged, after(li, e) ? li.nextSibling : li);
      clear();
      try {
        await postJson('/admin/photos/order', { ids: [...list.children].map(el => Number(el.dataset.id)) });
        renumber();
        toast.show(tr('Ordre enregistré.'));
      } catch {
        before.forEach(el => list.appendChild(el));
        renumber();
        toast.show(tr('L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.'), { error: true });
      }
    });
  });
})();

// ----- séries : glisser une carte, ou flèches du clavier sur sa poignée -----
(function () {
  // Fiche photo : « Choisir » une série proposée remplit le champ ; l'enregistrement vaudra choix (même pour « Garder »).
  const fiche = $('[data-suggest-fiche]');
  fiche?.addEventListener('click', e => {
    const b = e.target.closest('[data-pick-series]');
    if (!b) return;
    const select = fiche.closest('form').querySelector('select[name="category_id"]');
    select.value = b.dataset.pickSeries;
    $('[data-series-chosen]', fiche).value = '1';
    $$('[data-pick-series]', fiche).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    toast.show(tr('Série choisie : elle sera gardée à l’enregistrement.'));
  });
  // Page Séries : téléchargement du modèle et analyse suivis sans recharger ; la page se recharge quand l'état change.
  const sp = $('[data-suggest-state]');
  if (sp && ['downloading', 'analysing'].includes(sp.dataset.suggestState)) {
    const tick = async () => {
      try {
        const res = await fetch('/admin/series/propositions', { headers: { accept: 'application/json' }, redirect: 'manual' });
        if (res.status >= 500) throw new Error(String(res.status));  // erreur passagère du serveur : nouvel essai
        if (!res.ok) return;                                         // refus, session expirée : le suivi s'arrête, sans recharger
        const st = await res.json();
        if (typeof st.status !== 'string') return;
        if (st.status !== sp.dataset.suggestState) return location.reload();
        const bar = $('progress', sp), n = $('[data-suggest-n]', sp);
        if (st.status === 'downloading' && st.download) { bar.value = Math.round((st.download.got / st.download.total) * 100); n.textContent = tr('{got} Mo sur {total}', { got: Math.round(st.download.got / 1e6), total: Math.round(st.download.total / 1e6) }); }
        if (st.status === 'analysing') { bar.value = Math.round((st.done / st.total) * 100); n.textContent = tr('{done} photos sur {total}', { done: st.done, total: st.total }); }
      } catch { /* réseau : nouvel essai */ }
      setTimeout(tick, 2500);
    };
    setTimeout(tick, 2500);
  }
  const grid = $('[data-series-list]');
  if (!grid) return;
  const cards = () => $$('.scard[data-id]', grid);
  const name = card => $('.title', card).textContent;
  async function persist(before) {
    try {
      await postJson('/admin/series/order', { ids: cards().map(c => Number(c.dataset.id)) });
      return true;
    } catch {
      before.forEach(c => grid.appendChild(c));
      toast.show(tr('L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.'), { error: true });
      return false;
    }
  }
  let dragged = null;
  const clear = () => cards().forEach(c => c.classList.remove('drop-before', 'drop-after'));
  const after = (c, e) => e.clientX > c.getBoundingClientRect().left + c.offsetWidth / 2;
  cards().forEach(card => {
    const grip = $('[data-grip]', card);
    grip.hidden = false;
    grip.addEventListener('mousedown', () => { card.draggable = true; });
    card.addEventListener('dragstart', e => { dragged = card; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', () => { card.draggable = false; card.classList.remove('dragging'); clear(); dragged = null; });
    card.addEventListener('dragover', e => { if (!dragged || dragged === card) return; e.preventDefault(); clear(); card.classList.add(after(card, e) ? 'drop-after' : 'drop-before'); });
    card.addEventListener('drop', async e => {
      if (!dragged || dragged === card) return;
      e.preventDefault();
      const before = cards();
      const moved = dragged;
      grid.insertBefore(moved, after(card, e) ? card.nextSibling : card);
      clear();
      if (await persist(before)) toast.show(tr('« {name} » : place {pos} sur {total}.', { name: name(moved), pos: cards().indexOf(moved) + 1, total: cards().length }));
    });
    grip.addEventListener('keydown', async e => {
      const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
      const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
      if (!back && !fwd) return;
      e.preventDefault();
      const list = cards();
      const i = list.indexOf(card);
      const j = i + (back ? -1 : 1);
      if (j < 0 || j >= list.length) return;
      if (back) grid.insertBefore(card, list[j]); else grid.insertBefore(card, list[j].nextSibling);
      grip.focus();
      if (await persist(list)) toast.show(tr('« {name} » : place {pos} sur {total}.', { name: name(card), pos: j + 1, total: list.length }));
    });
  });

  // « Nouvelle série » : le champ de la carte de création.
  $('[data-new-series]')?.addEventListener('click', e => {
    e.preventDefault();
    const input = $('[data-new-card] input[name=name]');
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input.focus();
  });
  $('[data-new-card] input[name=name]')?.addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); } });

  // Suppression : la confirmation s'ouvre dans une fenêtre.
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.setAttribute('aria-labelledby', 'del-serie-title');
  document.body.appendChild(dialog);
  $$('.menu-pop .danger > summary', grid).forEach(summary => summary.addEventListener('click', e => {
    e.preventDefault();
    const card = summary.closest('.scard');
    summary.closest('details.menu').open = false;
    const form = $('form[data-delete-series]', summary.parentElement).cloneNode(true);
    dialog.innerHTML = `<h2 id="del-serie-title">${tr('Supprimer la série « {name} » ?', { name: esc(name(card)) })}</h2>`;
    dialog.appendChild(form);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn ghost';
    cancel.textContent = tr('Annuler');
    cancel.addEventListener('click', () => dialog.close());
    (form.querySelector('.btn') || form).after(cancel);
    if (form.querySelector('.btn')) { const p = document.createElement('p'); p.className = 'actions'; form.querySelector('.btn').before(p); p.append(form.querySelector('.btn'), cancel); }
    else form.append(cancel);
    dialog.showModal();
    (form.querySelector('select') || cancel).focus();
  }));
})();

// ----- ouverture : composer l'ordre du diaporama (deux listes : hero, et hero_tel pour le téléphone en v3) -----
$$('[data-hero]').forEach(box => {
  const NAME = box.dataset.name || 'hero';
  const MAX = Number(box.dataset.max);
  const strip = $('[data-hero-chosen]', box);
  const pool = $('[data-hero-pool]', box);
  const counter = $('[data-hero-count]', box);
  const full = $('[data-hero-full]', box);
  const items = () => $$('.it', strip);
  function refresh() {
    const n = items().length;
    items().forEach((li, i, all) => {
      $('.n', li).textContent = i + 1;
      $('[data-hero-left]', li).disabled = i === 0;
      $('[data-hero-right]', li).disabled = i === all.length - 1;
    });
    counter.textContent = n > 1 ? tr('{n} / {max} choisies', { n, max: MAX }) : tr('{n} / {max} choisie', { n, max: MAX });
    full.hidden = n < MAX;
    $$('.pick', pool).forEach(l => { const c = $('input', l); if (!l.hidden) c.disabled = n >= MAX; });
    const empty = $('[data-hero-empty]', box);
    if (empty) empty.hidden = n > 0;
  }
  function item(label) {
    const slug = label.dataset.slug;
    const title = label.dataset.title;
    const li = document.createElement('li');
    li.className = 'it';
    li.dataset.slug = slug;
    li.innerHTML = `<input type="hidden" name="${NAME}" value="${esc(slug)}"><span class="n mono" aria-hidden="true"></span>`
      + `<span class="t">${esc(title)}</span><span class="mv">`
      + `<button type="submit" name="${NAME}_op" value="left:${esc(slug)}" aria-label="${tr('Avancer « {title} »', { title: esc(title) })}" data-hero-left>←</button>`
      + `<button type="submit" name="${NAME}_op" value="right:${esc(slug)}" aria-label="${tr('Reculer « {title} »', { title: esc(title) })}" data-hero-right>→</button>`
      + `<button type="submit" name="${NAME}_op" value="remove:${esc(slug)}" aria-label="${tr('Retirer « {title} » de l’ouverture', { title: esc(title) })}" data-hero-remove>✕</button></span>`;
    $('.n', li).after($('picture', label).cloneNode(true));
    wire(li);
    return li;
  }
  function wire(li) {
    li.draggable = true;
    li.addEventListener('dragstart', e => { li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); refresh(); });
  }
  items().forEach(wire);
  strip.addEventListener('dragover', e => {
    const dragging = $('.dragging', strip);
    if (!dragging) return;
    e.preventDefault();
    const target = items().find(li => li !== dragging && e.clientX < li.getBoundingClientRect().left + li.offsetWidth / 2 && e.clientY < li.getBoundingClientRect().bottom);
    strip.insertBefore(dragging, target || null);
  });
  strip.addEventListener('click', e => {
    const b = e.target.closest(`button[name=${NAME}_op]`);
    if (!b) return;
    e.preventDefault();
    const li = b.closest('.it');
    const title = $('.t', li).textContent;
    if (b.matches('[data-hero-left]') && li.previousElementSibling) { strip.insertBefore(li, li.previousElementSibling); $('[data-hero-left]', li).focus(); }
    if (b.matches('[data-hero-right]') && li.nextElementSibling) { strip.insertBefore(li.nextElementSibling, li); $('[data-hero-right]', li).focus(); }
    if (b.matches('[data-hero-remove]')) {
      const label = $(`.pick[data-slug="${CSS.escape(li.dataset.slug)}"]`, pool);
      li.remove();
      if (label) { label.hidden = false; const c = $('input', label); c.checked = false; c.disabled = false; }
      refresh();
      (items()[0] ? $('button', items()[0]) : counter).focus?.();
      toast.show(tr('« {title} » retirée de l’ouverture (pensez à enregistrer).', { title }));
      return;
    }
    refresh();
    toast.show(tr('« {title} » : place {pos} (pensez à enregistrer).', { title, pos: items().indexOf(li) + 1 }));
  });
  pool.addEventListener('change', e => {
    const c = e.target;
    if (!c.matches('input[type=checkbox]') || !c.checked) return;
    if (items().length >= MAX) { c.checked = false; return; }
    const label = c.closest('.pick');
    strip.appendChild(item(label));
    label.hidden = true;
    c.disabled = true;
    refresh();
    toast.show(tr('« {title} » ajoutée en place {pos} (pensez à enregistrer).', { title: label.dataset.title, pos: items().length }));
  });
  refresh();
});

// ----- villes proposées au fil de la frappe (fiche, photothèque) -----
// Liste embarquée côté serveur (/admin/villes) ; ↑ ↓ pour choisir, Entrée pour valider, Échap pour fermer.
// Choisir une ville remplit le champ et l'identifiant caché, puis émet « city-chosen » sur le conteneur [data-city].
// Taper sans choisir efface l'identifiant : le serveur reconnaît alors la ville si le nom est exact.
(function () {
  let n = 0;
  $$('[data-city]').forEach(box => {
    const input = $('[data-city-input]', box);
    const hidden = $('[data-city-id]', box);
    if (!input || !hidden) return;
    const list = document.createElement('ul');
    list.className = 'city-list';
    list.id = `villes-${++n}`;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    input.after(list);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    let items = [], active = -1, timer = null, seq = 0;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const mark = i => {
      active = i;
      $$('li', list).forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
      if (i >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${i}`); else input.removeAttribute('aria-activedescendant');
    };
    const choose = i => {
      const v = items[i];
      if (!v) return;
      input.value = v.label;
      hidden.value = v.id;
      close();
      box.dispatchEvent(new CustomEvent('city-chosen', { detail: v }));
    };
    const draw = () => {
      list.replaceChildren(...items.map((v, i) => {
        const li = document.createElement('li');
        li.id = `${list.id}-${i}`;
        li.setAttribute('role', 'option');
        li.textContent = v.label;
        li.addEventListener('mousedown', e => { e.preventDefault(); choose(i); });
        return li;
      }));
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', String(items.length > 0));
      mark(-1);
    };
    input.addEventListener('input', () => {
      hidden.value = '';
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { items = []; draw(); return; }
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          const res = await fetch(`/admin/villes?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } });
          const data = await res.json();
          if (mine === seq) { items = data.villes || []; draw(); }
        } catch { /* réseau : pas de proposition */ }
      }, 150);
    });
    input.addEventListener('keydown', e => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); mark(Math.min(active + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(active - 1, 0)); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
  });
})();

// ----- photothèque : planche contact, sélection, inspecteur, loupe, raccourcis -----
(function () {
  const lib = $('[data-library]');
  if (!lib) return;
  const contact = $('[data-contact]');
  const insp = $('[data-inspector]');
  const form = $('[data-bulk]', insp);
  const dataEl = $('#photos-data');
  const data = new Map((dataEl ? JSON.parse(dataEl.textContent) : []).map(p => [p.id, p]));
  window.__photoTitle = id => data.get(id)?.title;
  const panes = { empty: $('[data-insp-empty]', insp), one: $('[data-insp-one]', insp), many: $('[data-insp-many]', insp) };
  const boxes = () => $$('input.chk[name=ids][form=bulk]');
  const checked = () => boxes().filter(b => b.checked);
  const selIds = () => checked().map(b => Number(b.value));
  const tileOf = id => document.getElementById(`photo-${id}`);
  const boxOf = id => $(`input.chk[value="${id}"]`, tileOf(id) || document);
  const typing = el => el && (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select') || el.isContentEditable);
  const notify = () => document.dispatchEvent(new Event('change-selection'));
  let anchor = null;

  // Taille des vignettes (mémorisée).
  const density = $('[data-density]');
  if (density && contact) {
    try { const saved = Number(localStorage.getItem('planche-taille')); if (saved) density.value = saved; } catch { /* taille par défaut */ }
    // Sur téléphone, la taille reste celle de la feuille de style (le curseur y est masqué).
    const wide = matchMedia('(min-width: 721px)');
    // sizes des tuiles à la hauteur choisie (même formule que server/picture.js, tileSizes) : sans eux, le navigateur
    // garderait les fichiers choisis pour 190 px, flous à 320 px, trop lourds à 110 px.
    const resize = h => contact.querySelectorAll('.tile').forEach(li => {
      const r = Number(/\bar-(\d+)/.exec(li.className)?.[1] || 150) / 100;
      const sizes = `(max-width: 720px) min(calc(100vw - 20px), ${Math.ceil(1.6 * 120 * r)}px), ${Math.ceil(1.3 * h * r)}px`;
      li.querySelectorAll('source, img').forEach(el => { if (el.getAttribute('sizes') !== sizes) el.setAttribute('sizes', sizes); });
    });
    const apply = () => { if (wide.matches) contact.style.setProperty('--rowh', `${density.value}px`); else contact.style.removeProperty('--rowh'); resize(Number(density.value) || 190); };
    wide.addEventListener('change', apply);
    apply();
    density.addEventListener('input', () => {
      apply();
      try { localStorage.setItem('planche-taille', density.value); } catch { /* taille conservée seulement sur cette page */ }
    });
  }

  // ---------- sélection ----------
  // Sélection posée par le script : l'événement « change » (qui met la barre à jour) est marqué, pour ne pas
  // déplacer l'ancre de Maj + clic sur la première vignette.
  function select(ids, { add = false } = {}) {
    if (!add) boxes().forEach(b => { b.checked = false; });
    ids.forEach(id => { const b = boxOf(id); if (b) b.checked = true; });
    boxes()[0]?.dispatchEvent(Object.assign(new Event('change', { bubbles: true }), { scripted: true }));
  }
  if (contact) {
    contact.addEventListener('click', e => {
      const tile = e.target.closest('.tile');
      if (!tile || e.target.closest('input, .ttl')) return;
      e.preventDefault();
      const id = Number(tile.dataset.id);
      const box = boxOf(id);
      if (e.shiftKey && anchor) {
        const all = $$('.tile', contact).map(t => Number(t.dataset.id));
        const [a, b] = [all.indexOf(anchor), all.indexOf(id)].sort((x, y) => x - y);
        select(all.slice(a, b + 1), { add: e.metaKey || e.ctrlKey });
      } else if (e.metaKey || e.ctrlKey) {
        box.checked = !box.checked;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        anchor = id;
      } else {
        select([id]);
        anchor = id;
      }
      box.focus({ preventScroll: true });
    });
    contact.addEventListener('dblclick', e => { const t = e.target.closest('.tile'); if (t) loupe.open(Number(t.dataset.id)); });
    contact.addEventListener('change', e => { if (e.target.matches('.chk') && !e.scripted) anchor = Number(e.target.value); });
  }

  // ---------- inspecteur ----------
  const one = {
    root: panes.one,
    preview: $('[data-one-preview]', panes.one),
    field: k => $(`[data-one-field="${k}"]`, panes.one),
    id: null,
  };
  function stack(ids) {
    const el = $('[data-insp-stack]', insp);
    const imgs = ids.slice(-3).map(id => data.get(id)?.thumb).filter(Boolean);
    el.hidden = !imgs.length;
    el.innerHTML = imgs.map(src => `<img src="${esc(src)}" alt="">`).join('');
  }
  function render() {
    const ids = selIds();
    const n = ids.length;
    insp.classList.toggle('has-sel', n > 0);
    lib.classList.toggle('selecting', n > 0);
    panes.empty.hidden = n !== 0;
    panes.one.hidden = n !== 1;
    panes.many.hidden = n < 2;
    $('[data-bulk-clear]', insp).hidden = n === 0;
    $('[data-one-open]', insp).hidden = n !== 1;
    $$('.insp-ft .btn', insp).forEach(b => { b.disabled = n === 0; });
    const title = $('[data-insp-title]', insp);
    stack(n > 1 ? ids : []);
    if (n === 0) { title.textContent = tr('Photothèque'); return; }
    if (n === 1) return showOne(ids[0]);
    const list = ids.map(id => data.get(id)).filter(Boolean);
    title.textContent = tr('{n} photos', { n });
    const drafts = list.filter(p => p.status === 'draft').length;
    $('[data-bulk-count]', insp).textContent = [drafts && (drafts > 1 ? tr('{n} brouillons', { n: drafts }) : tr('{n} brouillon', { n: drafts })), n - drafts && (n - drafts > 1 ? tr('{n} publiées', { n: n - drafts }) : tr('{n} publiée', { n: n - drafts }))].filter(Boolean).join(' · ');
    const cats = new Set(list.map(p => p.category_id));
    $$('[data-many-series] .pill', insp).forEach(b => b.setAttribute('aria-pressed', String(cats.size === 1 && cats.has(Number(b.dataset.category)))));
    // Titres provisoires de la sélection : à saisir ici (lot qui vient d'arriver).
    const prov = list.filter(p => p.provisional).slice(0, 12);
    $('[data-many-titles]', insp).hidden = !prov.length;
    const titles = $('[data-titles]', insp);
    // Un titre en cours de frappe n'est jamais détruit (une photo du lot devient prête pendant la saisie).
    if (!titles.contains(document.activeElement)) titles.innerHTML = prov.map(p => `<label>${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<span class="ph"></span>'}<input value="${esc(p.title)}" data-title-of="${p.id}" aria-label="${tr('Titre de la photo {title}', { title: esc(p.title) })}"></label>`).join('');
    const pub = $('[data-publish]', insp);
    pub.textContent = drafts ? (n === drafts ? tr('Publier les {n}', { n }) : drafts > 1 ? tr('Publier {n} brouillons', { n: drafts }) : tr('Publier {n} brouillon', { n: drafts })) : tr('Déjà publiées');
    pub.disabled = !drafts;
  }
  function showOne(id) {
    const p = data.get(id);
    one.id = id;
    $('[data-insp-title]', insp).textContent = p ? (p.status === 'published' ? tr('Publiée') : tr('Brouillon')) : tr('Photo');
    $('[data-bulk-count]', insp).textContent = p ? `${tr('N°{n}', { n: String(p.n || '').padStart(2, '0') })} · ${p.category}` : '';
    if (!p) return;
    one.preview.innerHTML = p.large ? `<img src="${esc(p.large)}" alt="${esc(p.title)}">` : `<span class="ph">${tr('Traitement…')}</span>`;
    // Le champ en cours de saisie n'est jamais réécrit (une réponse qui arrive pendant la frappe).
    const put = (k, v) => { const f = one.field(k); if (f !== document.activeElement) f.value = v; };
    put('title', p.title);
    put('legend', p.legend || '');
    put('alt_text', p.alt_text || '');
    put('place', p.place || '');
    put('taken_on', p.taken_on || '');
    put('author_id', p.author_id ? String(p.author_id) : '');
    // Heure de prise de vue (EXIF) avec la date ; le choix de la montrer sur le site se fait dans la fiche.
    $('[data-one-when]', insp).textContent = [p.when && tr('compris : {when}', { when: p.when }), p.time && tr('prise à {time}', { time: p.time })].filter(Boolean).join(' · ');
    $('[data-one-prov]', insp).hidden = !p.provisional;
    $('[data-one-n]', insp).textContent = `/photo/${p.slug}`;
    $('[data-one-link]', insp).href = `/admin/photos/${p.id}`;
    const cityInput = $('[data-one-city]', insp);
    if (cityInput && cityInput !== document.activeElement) { cityInput.value = p.city || ''; $('[data-city-id]', cityInput.closest('[data-city]')).value = p.city_id || ''; }
    const onMap = $('[data-one-onmap]', insp);
    if (onMap) { onMap.checked = Boolean(p.on_map); onMap.disabled = !p.city_id; }
    const cityNote = $('[data-one-citynote]', insp);
    if (cityNote) cityNote.hidden = !(p.city_source === 'gps' && p.city);
    $('[data-one-open]', insp).href = `/admin/photos/${p.id}`;
    // Série proposée (au plus deux) : marquée parmi les séries, avec « Classer dans… » et « Garder… ».
    const sugg = p.suggest || [];
    $$('[data-one-series] .pill', insp).forEach(b => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.category) === p.category_id));
      b.classList.toggle('sug', sugg.some(x => x.id === Number(b.dataset.category)));
    });
    const sugBox = $('[data-one-suggest]', insp);
    if (sugBox && can('photos.modifier')) {
      sugBox.hidden = !sugg.length;
      sugBox.innerHTML = sugg.map((x, i) => `<div class="sugbox${i ? ' alt' : ''}"><span>${i ? esc(tr('ou')) : `✦ ${esc(tr('Série proposée :'))}`} <b>${esc(x.name)}</b></span>`
        + `<span class="why">${esc(tr('ressemble à {n} de ses {total} photos', { n: x.votes, total: x.size }))}</span>`
        + `<span class="acts"><button class="btn${i ? ' ghost' : ''} sm" type="button" data-category="${x.id}">${esc(tr('Classer dans « {name} »', { name: x.name }))}</button></span></div>`).join('')
        + (sugg.length ? `<p class="hint"><button class="more" type="button" data-keep-series>${esc(tr('Garder « {name} »', { name: p.category }))}</button></p>` : '');
    }
    $('[data-publish]', insp).textContent = p.status === 'published' ? tr('Déjà publiée') : tr('Publier');
    $('[data-publish]', insp).disabled = p.status === 'published';
    audience(id);
  }
  // Audience de la photo (30 jours) : chiffre, rang, petite courbe rendue par le serveur.
  async function audience(id) {
    const box = $('[data-one-aud]', insp);
    if (!box) return;                          // compte sans statistiques : pas de rubrique Audience
    box.innerHTML = '<span class="hint">…</span>';
    try {
      const res = await fetch(`/admin/photos/${id}/statistiques`, { headers: { accept: 'application/json' } });
      if (one.id !== id) return;
      if (!res.ok) { box.innerHTML = ''; return; }
      const s = await res.json();
      if (one.id !== id) return;
      box.innerHTML = s.total
        ? `<span>${s.total > 1 ? tr('{n} ouvertures en grand', { n: `<b>${s.total}</b>` }) : tr('{n} ouverture en grand', { n: `<b>${s.total}</b>` })}${s.rank ? ` · ${s.rank === 1 ? tr('1ʳᵉ photo la plus vue') : tr('{n}ᵉ photo la plus vue', { n: s.rank })}` : ''}</span>${s.spark}`
        : `<span class="hint">${tr('Pas encore ouverte en grand ces 30 derniers jours.')}</span>`;
    } catch { box.innerHTML = ''; }
  }
  document.addEventListener('change-selection', render);
  document.addEventListener('selection', render);

  // Mise à jour de la planche après une modification.
  function refreshTile(p) {
    const t = tileOf(p.id);
    if (!t) return;
    const ttl = $('.ttl', t);
    if (ttl) ttl.textContent = p.title;
    const small = $('.cap small', t);
    if (small) small.textContent = [p.category, p.when, p.status === 'published' ? tr('publiée') : ''].filter(Boolean).join(' · ');
    t.toggleAttribute('data-provisional', p.provisional);
    const box = $('.chk', t);
    if (box) box.setAttribute('aria-label', tr('Sélectionner « {title} »', { title: p.title }));
    // Badges empilés en haut à droite (statut, état, série proposée) : la légende du bas n'est jamais couverte.
    let badges = $('.badges', t);
    if (!badges) { badges = document.createElement('span'); badges.className = 'badges'; t.querySelector('.img').after(badges); }
    let badge = $('.badge.status', badges);
    const want = p.status === 'draft' ? tr('○ Brouillon') : p.provisional ? tr('Titre provisoire') : '';
    if (!want && badge) badge.remove();
    if (want) { if (!badge) { badge = document.createElement('span'); badges.prepend(badge); } badge.className = `badge status${p.status !== 'draft' ? ' warn' : ''}`; badge.textContent = want; }
    let sug = $('.badge.sug', badges);
    const first = (p.suggest || [])[0];
    if (!first) sug?.remove();
    else { if (!sug) { sug = document.createElement('span'); sug.className = 'badge sug'; sug.title = tr('Série proposée'); badges.append(sug); } sug.textContent = `✦ ${first.name}`; }
  }
  async function reload(id) {
    try {
      const res = await fetch(`/admin/photos/${id}/donnees`, { headers: { accept: 'application/json' } });
      if (res.ok) { const p = await res.json(); data.set(p.id, { ...data.get(p.id), ...p }); refreshTile(data.get(p.id)); return data.get(p.id); }
    } catch { /* réseau */ }
    return null;
  }
  // Plusieurs photos (après une action groupée) : une seule requête.
  async function reloadMany(ids) {
    try {
      const res = await fetch(`/admin/photos/donnees?ids=${ids.join(',')}`, { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      for (const p of (await res.json()).photos) { data.set(p.id, { ...data.get(p.id), ...p }); refreshTile(data.get(p.id)); }
    } catch { /* réseau */ }
  }

  // Une photo : enregistrement champ par champ.
  async function saveOne(key, value, previous) {
    const id = one.id;
    try {
      const r = await postJson(`/admin/photos/${id}/champs`, { [key]: value });
      Object.assign(data.get(id), r.photo);
      await reload(id);                       // série, auteur, « compris : … » : la version du serveur
      window.__paletteReset?.();
      if (one.id === id) showOne(id);
      const field = one.field(key);
      field?.removeAttribute('aria-invalid');
      toast.show(tr('« {title} » enregistrée', { title: data.get(id).title }), previous === undefined ? {} : {
        undo: async () => { await postJson(`/admin/photos/${id}/champs`, { [key]: previous }); await reload(id); if (one.id === id) showOne(id); toast.show(tr('Modification annulée.')); },
      });
    } catch (err) {
      const msg = err.data?.errors ? Object.values(err.data.errors).join(' ') : err.message;
      one.field(key)?.setAttribute('aria-invalid', 'true');
      toast.show(msg, { error: true });
    }
  }
  ['title', 'legend', 'alt_text', 'place', 'taken_on', 'author_id'].forEach(k => {
    const f = one.field(k);
    f.addEventListener('focus', () => { f.dataset.before = f.value; });
    if (f.matches('select')) onPick(f, () => saveOne(k, f.value, f.dataset.before));
    else f.addEventListener('change', () => saveOne(k, f.value, f.dataset.before));
    if (f.matches('input')) f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); } });
  });
  $('[data-one-series]', insp).addEventListener('click', e => {
    const b = e.target.closest('[data-category]');
    if (!b) return;
    const p = data.get(one.id);
    saveOne('category_id', b.dataset.category, String(p.category_id));
  });
  $('[data-one-suggest]', insp)?.addEventListener('click', async e => {
    const id = one.id;
    const p = data.get(id);
    const b = e.target.closest('[data-category]');
    if (b) return saveOne('category_id', b.dataset.category, String(p.category_id));
    if (!e.target.closest('[data-keep-series]')) return;
    try {
      const r = await postJson(`/admin/photos/${id}/serie`, { garder: '1' });
      await reload(id);
      if (one.id === id) showOne(id);
      toast.show(r.text);
    } catch (err) { toast.show(err.message, { error: true }); }
  });

  // Ville et carte : enregistrées aussitôt (ville choisie dans la liste, effacée, ou tapée telle quelle).
  async function saveLocation(body, undoBody) {
    const id = one.id;
    try {
      const r = await postJson(`/admin/photos/${id}/champs`, body);
      Object.assign(data.get(id), r.photo);
      if (one.id === id) showOne(id);
      toast.show(tr('« {title} » enregistrée', { title: data.get(id).title }), undoBody ? { undo: async () => { const u = await postJson(`/admin/photos/${id}/champs`, undoBody); Object.assign(data.get(id), u.photo); if (one.id === id) showOne(id); toast.show(tr('Modification annulée.')); } } : {});
    } catch (err) {
      toast.show(err.data?.errors ? Object.values(err.data.errors).join(' ') : err.message, { error: true });
      if (one.id === id) showOne(id);
    }
  }
  const cityBox = $('[data-one-city]', insp)?.closest('[data-city]');
  if (cityBox) {
    const before = () => { const p = data.get(one.id); return { city_id: p.city_id || '', city_label: p.city || '', on_map: p.on_map ? '1' : '0' }; };
    cityBox.addEventListener('city-chosen', e => saveLocation({ city_id: e.detail.id, city_label: e.detail.label }, before()));
    $('[data-one-city]', insp).addEventListener('change', e => {
      const v = e.target.value.trim();
      if (v === (data.get(one.id)?.city || '') || $('[data-city-id]', cityBox).value) return;   // inchangé, ou déjà choisi dans la liste
      saveLocation({ city_label: v }, before());
    });
    $('[data-one-onmap]', insp).addEventListener('change', e => saveLocation({ on_map: e.target.checked ? '1' : '0' }, { on_map: e.target.checked ? '0' : '1' }));
    // Entrée sans ville proposée choisie : enregistre la saisie (comme quitter le champ), sans envoyer le formulaire.
    $('[data-one-city]', insp).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); e.target.blur(); e.target.focus(); } });
  }

  // Plusieurs photos : série, lieu et date appliqués aussitôt.
  async function applyMany(action, extra) {
    const ids = selIds();
    if (!ids.length) return;
    try {
      const before = ids.map(id => data.get(id)?.category_id);
      const r = await postJson('/admin/photos/actions', { ids, action, ...extra });
      // Nouvelle série : la barre latérale doit l'afficher ; le message (et « Annuler ») survit au rechargement.
      if (r.category && !$(`[data-many-series] [data-category="${r.category.id}"]`, insp)) { toast.keep(r.text, r.undo || null); location.reload(); return; }
      await reloadMany(ids);
      const moved = action === 'category' && r.category;
      if (moved) { before.forEach(c => bump(c, -1)); bump(r.category.id, ids.length); }
      window.__paletteReset?.();
      render();
      toast.show(r.text, r.undo ? { undo: async () => {
        await postJson('/admin/photos/actions', r.undo);
        if (moved) { bump(r.category.id, -ids.length); before.forEach(c => bump(c, 1)); }   // compteurs de la barre latérale
        await reloadMany(ids); render(); toast.show(tr('Annulé.'));
      } } : {});
    } catch (err) { toast.show(err.message, { error: true }); }
  }
  const newName = $('[data-bulk-new]', insp);
  $('[data-many-series]', insp).addEventListener('click', e => {
    const b = e.target.closest('[data-category]');
    if (!b) return;
    if (b.dataset.category === 'new') { newName.classList.add('on'); newName.focus(); return; }
    applyMany('category', { category_id: b.dataset.category });
  });
  newName.addEventListener('change', () => { if (newName.value.trim()) applyMany('category', { category_id: 'new', new_category: newName.value }); });
  $$('[data-many-map]', insp).forEach(b => b.addEventListener('click', () => applyMany(b.dataset.manyMap, {})));
  newName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); newName.blur(); } });
  $$('[data-many-field]', insp).forEach(f => {
    f.addEventListener('change', async () => { if (!f.value.trim()) return; await applyMany('fields', { [f.dataset.manyField]: f.value }); f.value = ''; });
    f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); } });
  });
  $('[data-titles]', insp).addEventListener('change', async e => {
    const f = e.target.closest('[data-title-of]');
    if (!f) return;
    const id = Number(f.dataset.titleOf);
    try { await postJson(`/admin/photos/${id}/champs`, { title: f.value }); await reload(id); toast.show(tr('« {title} » enregistrée', { title: f.value })); } catch (err) { toast.show(err.data?.errors ? Object.values(err.data.errors).join(' ') : err.message, { error: true }); }
  });
  $('[data-titles]', insp).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); const next = e.target.closest('label').nextElementSibling; e.target.blur(); $('input', next || document.body)?.focus?.(); } });

  // ---------- loupe ----------
  const loupe = (() => {
    let el = null;
    let current = null;
    const order = () => $$('.tile', contact).map(t => Number(t.dataset.id)).filter(id => data.get(id)?.large);
    // Pellicule : 40 vignettes au plus autour de la photo affichée.
    const strip = () => { const o = order(); const i = Math.max(0, o.indexOf(current) - 20); return o.slice(i, i + 40); };
    function draw() {
      const p = data.get(current);
      $('.stage img', el).src = p.large;
      $('.stage img', el).alt = p.title;
      $('[data-loupe-title]', el).textContent = `${p.title} · ${p.category}${p.when ? ` · ${p.when}` : ''}`;
      $$('.strip button', el).forEach(b => b.toggleAttribute('aria-current', Number(b.dataset.id) === current));
      $(`.strip button[data-id="${current}"]`, el)?.scrollIntoView({ block: 'nearest', inline: 'center' });
      select([current]);
      anchor = current;                        // la photo regardée devient le point de départ de Maj + clic
    }
    function open(id) {
      if (!contact || !data.get(id)?.large) return;
      if (el) close();
      current = id;
      el = document.createElement('div');
      el.className = 'loupe';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', tr('Loupe'));
      el.innerHTML = `<div class="lbar"><span data-loupe-title></span><span class="sp"></span><span>${tr('← → photo suivante · Échap ou Espace : fermer')}</span><button class="iconbtn" type="button" data-loupe-close aria-label="${tr('Fermer la loupe')}">✕</button></div>
        <div class="stage"><button class="iconbtn nav-l" type="button" data-loupe-prev aria-label="${tr('Photo précédente')}">←</button><img alt=""><button class="iconbtn nav-r" type="button" data-loupe-next aria-label="${tr('Photo suivante')}">→</button></div>
        <div class="strip">${strip().map(i => `<button type="button" data-id="${i}" aria-label="${esc(data.get(i).title)}"><img src="${esc(data.get(i).thumb)}" alt=""></button>`).join('')}</div>`;
      $('[data-canvas]').appendChild(el);
      el.addEventListener('click', e => {
        if (e.target.closest('[data-loupe-close]')) close();
        else if (e.target.closest('[data-loupe-prev]')) step(-1);
        else if (e.target.closest('[data-loupe-next]')) step(1);
        else { const b = e.target.closest('.strip button'); if (b) { current = Number(b.dataset.id); draw(); } }
      });
      // Le focus reste dans la loupe (Tab et Maj + Tab bouclent).
      el.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const f = $$('button', el);
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      });
      draw();
      $('[data-loupe-close]', el).focus();
    }
    function step(d) {
      const o = order(); const i = o.indexOf(current);
      if (i + d < 0 || i + d >= o.length) return;
      current = o[i + d];
      if (!$(`.strip button[data-id="${current}"]`, el)) { const id = current; close(); open(id); return; }   // hors de la pellicule : on la recentre
      draw();
    }
    function close() { el?.remove(); el = null; boxOf(current)?.focus(); }
    return { open, close, step, get open_() { return Boolean(el); } };
  })();

  // ---------- raccourcis ----------
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || $('dialog[open]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (loupe.open_) {
      if (e.key === 'Escape' || (e.key === ' ' && !typing(document.activeElement))) { e.preventDefault(); loupe.close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); loupe.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); loupe.step(1); }
      return;
    }
    if (typing(document.activeElement)) return;
    if (mod && e.key.toLowerCase() === 'a' && contact) { e.preventDefault(); select(boxes().map(b => Number(b.value))); }
    else if (mod && e.key.toLowerCase() === 'z' && window.__lastUndo) { e.preventDefault(); const u = window.__lastUndo; window.__lastUndo = null; u(); }
    else if (mod) return;
    else if (e.key === 'Escape' && selIds().length) { e.preventDefault(); select([]); }
    // Touches d'une seule lettre (P, I, L, Espace) : seulement quand le focus est dans la planche ou l'inspecteur
    // (WCAG 2.1.4), jamais sur un lien de la barre latérale ou ailleurs dans la page (dictée, faute de frappe).
    else if (!document.activeElement?.closest?.('[data-contact], [data-inspector]')) return;
    else if (e.key.toLowerCase() === 'p' && selIds().length && can('photos.publier')) { e.preventDefault(); $('[data-publish]', insp).click(); }
    else if (e.key.toLowerCase() === 'i') { e.preventDefault(); $('[data-import-open]')?.click(); }
    else if (contact && (e.key.toLowerCase() === 'l' || (e.key === ' ' && !document.activeElement?.matches('button, a, input')))) {
      const id = selIds()[0] || Number(document.activeElement?.closest?.('.tile')?.dataset.id);
      if (id) { e.preventDefault(); loupe.open(id); }
    }
  });

  // ---------- glisser : ordre de la planche, ou vers une série ----------
  // Photos glissées depuis cette page : gardées ici, jamais relues dans les données du glisser (qu'une autre page
  // peut remplir à l'identique).
  let dragIds = null;
  if (contact) {
    let dragged = null;
    const sortable = contact.hasAttribute('data-sortable');
    const clear = () => $$('.drop-before, .drop-after', contact).forEach(t => t.classList.remove('drop-before', 'drop-after'));
    const after = (t, e) => e.clientX > t.getBoundingClientRect().left + t.offsetWidth / 2;
    const prepare = t => { t.draggable = true; $$('a, img', t).forEach(x => { x.draggable = false; }); };
    $$('.tile', contact).forEach(prepare);
    window.__prepareTile = prepare;
    contact.addEventListener('dragstart', e => {
      const t = e.target.closest('.tile');
      if (!t) return;
      dragged = t;
      t.classList.add('dragging');
      const id = Number(t.dataset.id);
      const ids = boxOf(id)?.checked ? selIds() : [id];
      dragIds = ids;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-nicephos-photos', JSON.stringify(ids));
      e.dataTransfer.setData('text/plain', ids.join(','));
    });
    contact.addEventListener('dragend', () => { dragged?.classList.remove('dragging'); clear(); dragged = null; dragIds = null; });
    contact.addEventListener('dragover', e => {
      const t = e.target.closest('.tile');
      if (!sortable || !dragged || !t || t === dragged) return;
      e.preventDefault();
      clear();
      t.classList.add(after(t, e) ? 'drop-after' : 'drop-before');
    });
    contact.addEventListener('drop', async e => {
      const t = e.target.closest('.tile');
      if (!sortable || !dragged || !t || t === dragged) return;
      e.preventDefault();
      e.stopPropagation();
      const before = $$('.tile', contact);
      contact.insertBefore(dragged, after(t, e) ? t.nextSibling : t);
      clear();
      try {
        await postJson('/admin/photos/order', { ids: $$('.tile', contact).map(x => Number(x.dataset.id)) });
        toast.show(tr('Ordre enregistré.'));
      } catch {
        before.forEach(x => contact.appendChild(x));
        toast.show(tr('L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.'), { error: true });
      }
    });
  }
  // Dépôt sur une série de la barre latérale : les photos glissées y sont classées.
  // Glisser vers une série du menu : seulement avec le droit de changer la série.
  if (can('photos.modifier')) $$('[data-drop-series]').forEach(a => {
    a.addEventListener('dragover', e => { if (dragIds) { e.preventDefault(); a.classList.add('over'); } });
    a.addEventListener('dragleave', () => a.classList.remove('over'));
    a.addEventListener('drop', async e => {
      a.classList.remove('over');
      const ids = (dragIds || []).filter(id => data.has(id));
      dragIds = null;
      if (!ids.length) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const before = ids.map(id => data.get(id)?.category_id);
        const r = await postJson('/admin/photos/actions', { ids, action: 'category', category_id: a.dataset.dropSeries });
        before.forEach(c => bump(c, -1));
        bump(Number(a.dataset.dropSeries), ids.length);
        window.__paletteReset?.();
        await reloadMany(ids);
        render();
        toast.show(r.text, { undo: async () => {
          await postJson('/admin/photos/actions', r.undo);
          bump(Number(a.dataset.dropSeries), -ids.length); before.forEach(c => bump(c, 1));
          await reloadMany(ids); render(); toast.show(tr('Annulé.'));
        } });
      } catch (err) { toast.show(err.message, { error: true }); }
    });
  });

  // Compteurs de la barre latérale après un classement.
  function bump(categoryId, d) {
    const n = $(`[data-drop-series="${categoryId}"] .n`);
    if (n) n.textContent = String(Math.max(0, Number(n.textContent) + d));
  }

  // ---------- import : les photos arrivent dans la planche et s'y développent ----------
  const ratio = (w, h) => `ar-${Math.min(300, Math.max(40, Math.round((w / h) * 20) * 5))}`;
  window.__library = contact && {
    arrived(i) {
      data.set(i.photoId, { id: i.photoId, title: i.title, status: 'draft', provisional: true, category: '', ready: false, thumb: i.url || null });
      const li = document.createElement('li');
      li.id = `photo-${i.photoId}`;
      li.className = `tile developing ${i.w && i.h ? ratio(i.w, i.h) : 'ar-150'}`;
      li.dataset.id = i.photoId;
      li.setAttribute('data-provisional', '');
      li.innerHTML = `<input class="chk" type="checkbox" name="ids" value="${i.photoId}" form="bulk" aria-label="${tr('Sélectionner « {title} »', { title: esc(i.title) })}">
        <a class="img" href="/admin/photos/${i.photoId}" tabindex="-1" aria-hidden="true">${i.url ? `<img src="${i.url}" alt="">` : `<span class="ph">${tr('Développement…')}</span>`}</a>
        <span class="badges"><span class="badge status">${tr('Développement')}</span></span><span class="dev"><i></i></span>
        <span class="cap"><a class="ttl" href="/admin/photos/${i.photoId}">${esc(i.title)}</a><small>${tr('brouillon')}</small></span>`;
      contact.appendChild(li);
      window.__prepareTile?.(li);
      this.progress(i);
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    progress(i) {
      const t = tileOf(i.photoId);
      if (!t) return;
      const f = i.total ? i.done / i.total : 0;
      const img = $('img', t);
      if (img) img.style.filter = `blur(${((1 - f) * 12).toFixed(1)}px) grayscale(${(1 - f).toFixed(2)}) brightness(${(0.6 + 0.4 * f).toFixed(2)})`;
      $('.dev i', t).style.width = `${Math.round(f * 100)}%`;
      $('.badge.status', t).textContent = i.total ? tr('Développement · {done} / {total}', { done: i.done, total: i.total }) : tr('En file');
    },
    async ready(i) {
      const t = tileOf(i.photoId);
      const p = await reload(i.photoId);
      if (!t) return;
      t.classList.remove('developing');
      $('.dev', t)?.remove();
      const img = $('img', t);
      if (img) { img.style.filter = ''; if (p?.thumb) img.src = p.thumb; }
      if (selIds().includes(i.photoId)) render();
    },
    gone(i) { tileOf(i.photoId)?.remove(); data.delete(i.photoId); if (anchor === i.photoId) anchor = null; },
    // Import terminé : les photos importées sont choisies, sauf pendant une saisie ou si une sélection est en cours
    // (le lien « Compléter et publier… » de l'import reste là).
    finished(ids) {
      if (!ids.length || typing(document.activeElement) || selIds().length) return;
      select(ids);
      ($('[data-titles] input') || one.field('title'))?.focus();
    },
  };

  // Tout sélectionner (case de la planche).
  render();
})();

// ----- palette de commandes ⌘K : actions, photos, séries, pages -----
(function () {
  const dlg = $('[data-cmdk]');
  if (!dlg) return;
  const input = $('[data-cmdk-input]', dlg);
  const list = $('[data-cmdk-list]', dlg);
  const opener = $('[data-cmdk-open]');
  if (opener) opener.hidden = false;
  let index = null;
  window.__paletteReset = () => { index = null; };
  let items = [];
  let active = 0;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const selection = () => $$('input.chk[name=ids][form=bulk]:checked').length;
  const click = sel => () => $(sel)?.click();
  const go = href => () => { location.href = href; };
  // Pages proposées, avec la permission qu'il faut pour les ouvrir.
  const PAGES = [[tr('Aujourd’hui'), '/admin', 'admin.acceder'], [tr('Photothèque'), '/admin/photos', 'photos.voir'], [tr('Photos à finir'), '/admin/photos?statut=afinir', 'photos.voir'], [tr('Brouillons'), '/admin/photos?statut=draft', 'photos.voir'], [tr('Sorties'), '/admin/sorties', 'sorties.voir'], [tr('Personnes photographiées'), '/admin/rencontres', 'personnes.voir'], [tr('Nouvelle rencontre'), '/admin/rencontre', 'terrain.app'], [tr('Séries'), '/admin/series', 'series.gerer'], [tr('Site public'), '/admin/site', 'site.textes'], [tr('Photos de l’ouverture'), '/admin/site#ouverture', 'site.textes'], [tr('Carte du monde'), '/admin/site#carte', 'site.textes'], ['Instagram', '/admin/instagram', 'instagram.voir'], [tr('Statistiques'), '/admin/statistiques', 'statistiques.voir'], [tr('Signalements'), '/admin/signalements', 'signalements.traiter'], [tr('Sur le terrain'), '/admin/terrain', 'terrain.app'], [tr('Cartes d’accord'), '/admin/rencontres/cartes', 'terrain.cartes'], [tr('Photographes'), '/admin/auteurs', 'photographes.gerer'], [tr('Comptes et rôles'), '/admin/comptes', 'comptes.gerer'], [tr('Journal'), '/admin/journal', 'journal.voir'], [tr('Apparence'), '/admin/apparence', 'site.apparence'], [tr('Filigrane & EXIF'), '/admin/images', 'site.filigrane'], [tr('Droits & confidentialité'), '/admin/droits', 'reglages.droits'], [tr('Aide'), '/admin/aide', 'admin.acceder']].filter(([, , perm]) => can(perm));
  function actions() {
    const n = selection();
    const a = [];
    // Actions sur la sélection : seulement là où leur bouton existe (photothèque ; pas « Compléter le lot »).
    if (n) {
      if (can('photos.publier') && $('[data-publish]')) a.push({ label: tr('<b>Publier</b> la sélection'), r: nPhotos(n), key: 'P', run: click('[data-publish]') });
      if (can('photos.publier') && $('[data-inspector] button[value=draft]')) a.push({ label: tr('<b>Dépublier</b> la sélection'), r: nPhotos(n), run: click('[data-inspector] button[value=draft]') });
      if (can('photos.supprimer') && $('[data-bulk-delete]')) a.push({ label: tr('<b>Supprimer</b> la sélection…'), r: nPhotos(n), run: click('[data-bulk-delete]') });
    }
    if (can('photos.importer')) a.push({ label: tr('<b>Importer</b> des photos'), key: 'I', run: $('[data-import-open]') && location.pathname === '/admin/photos' ? click('[data-import-open]') : go('/admin/photos?importer#import') });
    if (can('series.gerer')) a.push({ label: tr('<b>Nouvelle série</b>'), run: go('/admin/series#nouvelle-serie') });
    a.push({ label: tr('Basculer en mode <b>clair / sombre</b>'), run: () => $('[data-theme-form]')?.requestSubmit() });
    a.push({ label: tr('<b>Voir le site</b> public'), run: () => window.open('/', '_blank', 'noopener') });
    return a;
  }
  async function load() {
    if (index) return index;
    try { index = await (await fetch('/admin/recherche.json', { headers: { accept: 'application/json' } })).json(); } catch { index = { photos: [], series: [] }; }
    return index;
  }
  function build(q) {
    const nq = norm(q);
    const hit = s => !nq || norm(s).includes(nq);
    const groups = [];
    const acts = actions().filter(a => hit(a.label.replace(/<[^>]+>/g, '')));
    if (acts.length) groups.push([tr('Actions'), acts]);
    const pages = PAGES.filter(([t]) => hit(t)).map(([t, href]) => ({ label: tr('Aller à <b>{page}</b>', { page: esc(t) }), run: go(href) }));
    if (index) {
      const series = index.series.filter(s => hit(s.name)).map(s => ({ label: tr('Série <b>{name}</b>', { name: esc(s.name) }), r: nPhotos(s.count), run: go(`/admin/photos?serie=${encodeURIComponent(s.slug)}`) }));
      const photos = nq ? index.photos.filter(p => hit(`${p.title} ${p.category} ${p.place}`)).slice(0, 8).map(p => ({ label: `${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : ''}<b>${esc(p.title)}</b> <span>${esc(p.category)}${p.place ? ` · ${esc(p.place)}` : ''}</span>`, r: p.status === 'draft' ? tr('brouillon') : tr('publiée'), run: go(`/admin/photos/${p.id}`) })) : [];
      if (photos.length) groups.push([tr('Photos'), photos]);
      if (series.length) groups.push([tr('Séries'), series]);
    }
    if (pages.length) groups.push([tr('Aller à'), pages]);
    items = groups.flatMap(([, g]) => g);
    active = Math.min(active, Math.max(items.length - 1, 0));
    let k = 0;
    list.innerHTML = groups.map(([name, g]) => `<li class="sec" role="presentation">${name}</li>` + g.map(it => { const i = k++; return `<li role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i === active}">${it.label}${it.r || it.key ? `<span class="r">${it.r || ''}${it.key ? ` <kbd>${it.key}</kbd>` : ''}</span>` : ''}</li>`; }).join('')).join('')
      || `<li class="sec" role="presentation">${tr('Aucun résultat')}</li>`;
    input.setAttribute('aria-activedescendant', items.length ? `cmdk-${active}` : '');
  }
  function move(d) {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    $$('[role=option]', list).forEach(o => o.setAttribute('aria-selected', String(Number(o.dataset.i) === active)));
    $(`#cmdk-${active}`)?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', `cmdk-${active}`);
  }
  function run(i) { const it = items[i]; if (!it) return; dlg.close(); it.run(); }
  async function open() {
    active = 0;
    input.value = '';
    build('');
    dlg.showModal();
    input.focus();
    await load();
    build(input.value);
  }
  opener?.addEventListener('click', open);
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (dlg.open) dlg.close(); else open(); }
  });
  input.addEventListener('input', () => { active = 0; build(input.value); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
  });
  list.addEventListener('click', e => { const o = e.target.closest('[role=option]'); if (o) run(Number(o.dataset.i)); });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();

// ----- page Instagram : « Publier maintenant » suivi sans recharger (étapes, barre d'avancement) -----
(function () {
  const items = $$('[data-ig-item]');
  if (!items.length) return;
  const box = id => $(`[data-ig-item="${id}"] [data-ig-progress]`);
  const show = (id, st) => {
    const b = box(id);
    if (!b) return;
    b.hidden = false;
    $('progress', b).value = st.percent || 0;
    $('[data-ig-progress-label]', b).textContent = st.label || tr('Envoi en cours…');
    b.classList.toggle('done-ok', Boolean(st.done && st.ok));
    b.classList.toggle('done-ko', Boolean(st.done && !st.ok));
  };
  const finish = (id, st) => {
    const b = box(id);
    $$('[data-ig-publish] button').forEach(x => { x.disabled = false; });
    if (st.ok && st.permalink) { const a = document.createElement('a'); a.className = 'more'; a.href = st.permalink; a.target = '_blank'; a.rel = 'noopener'; a.textContent = tr('Voir le post ↗'); b.append(' ', a); }
    // Les listes (file, dernières publications, journal) suivent : la page se recharge après un succès.
    if (st.ok) setTimeout(() => location.reload(), 2500);
    else { const a = document.createElement('a'); a.className = 'more'; a.href = location.pathname; a.textContent = tr('Mettre à jour la page'); b.append(' ', a); }
  };
  async function watch(id) {
    for (let k = 0; k < 240; k++) {
      await new Promise(r => setTimeout(r, k ? 1000 : 300));
      let st;
      try { st = await (await fetch(`/admin/instagram/${id}/etat`, { headers: { accept: 'application/json' } })).json(); } catch { st = null; }
      if (!st) continue;
      show(id, st);
      if (st.done) return finish(id, st);
    }
    show(id, { percent: 0, label: tr('Suivi interrompu : rechargez la page pour voir où en est l’envoi.'), done: true, ok: false });
  }
  document.addEventListener('submit', async e => {
    const form = e.target.closest('[data-ig-publish]');
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.igPublish;
    $$('[data-ig-publish] button').forEach(x => { x.disabled = true; });
    show(id, { percent: 3, label: tr('Envoi en cours…') });
    try {
      const res = await fetch(form.action, { method: 'POST', redirect: 'manual', headers: { 'x-csrf-token': CSRF, accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { show(id, { ...(data.state || {}), percent: 0, label: data.error || tr('Erreur {status}', { status: res.status }), done: true, ok: false }); return finish(id, { ok: false }); }
      show(id, data.state);
      if (data.state?.done) return finish(id, data.state);
      watch(id);
    } catch {
      show(id, { percent: 0, label: tr('Session expirée ? Rechargez la page.'), done: true, ok: false });
      finish(id, { ok: false });
    }
  });
  // Envoi déjà en cours à l'ouverture de la page (créneau, autre onglet) : suivi aussi.
  $$('[data-ig-watch]').forEach(b => watch(b.dataset.igWatch));
})();

// ----- fiche d'une photo : partage Instagram (aperçu, légende) -----
(function () {
  const form = $('[data-ig-form]');
  if (!form) return;
  const id = form.elements.photo_id.value;
  const preview = $('[data-ig-preview]');
  const frame = $('[data-ig-frame]', form);
  const wm = $('[data-ig-watermark]', form);
  const custom = $('[data-ig-custom]', form);
  const text = $('[data-ig-caption]', form);
  const count = $('[data-ig-count]', form);
  const back = $('[data-ig-template]', form);
  // L'aperçu suit le cadre et le filigrane choisis (image recalculée par le serveur).
  const refresh = () => { preview.src = `/admin/instagram/apercu.jpg?photo=${encodeURIComponent(id)}&cadre=${encodeURIComponent(frame.value)}&filigrane=${wm.checked ? 1 : 0}`; };
  frame.addEventListener('change', refresh);
  wm.addEventListener('change', refresh);
  const counter = () => { count.textContent = `${text.value.length} / 2200`; back.hidden = !custom.checked; };
  // Modifier la légende la rend personnelle ; « Revenir au modèle » reprend celle du modèle.
  text.addEventListener('input', () => { custom.checked = true; counter(); });
  custom.addEventListener('change', async () => { if (!custom.checked) await template(); counter(); });
  async function template() {
    try {
      const r = await (await fetch(`/admin/instagram/legende?photo=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } })).json();
      text.value = r.caption || '';
      custom.checked = false;
      counter();
    } catch { /* l'enregistrement reprendra le modèle de toute façon */ }
  }
  back.addEventListener('click', template);
  counter();
})();

// ----- progression de la mise à jour des images -----
// Le nombre se met à jour sans être relu à chaque fois ; seul le message final est annoncé.
(function () {
  const box = document.querySelector('[data-variants]');
  if (!box || !box.querySelector('[data-done]')) return;
  const done = box.querySelector('[data-done]');
  const total = box.querySelector('[data-total]');
  const final = box.querySelector('[data-final]');
  const finish = (text, error) => {
    clearInterval(timer);
    box.querySelector('[data-running]').hidden = true;
    box.classList.toggle('error', Boolean(error));
    final.textContent = text;
  };
  const timer = setInterval(async () => {
    try {
      const res = await fetch('/admin/images/etat', { headers: { accept: 'application/json' }, redirect: 'manual' });
      // 403 : ce compte ne suit pas les images (droit retiré entre-temps) ; on s'arrête sans fausse alerte.
      if (res.status === 403) { clearInterval(timer); box.hidden = true; return; }
      if (!res.ok) return finish(tr('Suivi interrompu : session expirée ? Rechargez la page.'), true);
      const s = await res.json();
      done.textContent = s.done;
      if (total) total.textContent = s.total;
      if (!s.running) {
        finish(s.errors.length
          ? tr('{n} image(s) n’ont pas pu être recalculées : {titles}.', { n: s.errors.length, titles: s.errors.map(e => e.title).join(', ') })
          : tr('Images à jour.'), s.errors.length);
      }
    } catch {
      finish(tr('Suivi interrompu. Rechargez la page pour voir l’état des images.'), true);
    }
  }, 1500);
})();

// ----- aide : recherche dans les sections -----
(function () {
  const input = document.querySelector('[data-help-search]');
  if (!input) return;
  document.querySelectorAll('[data-js-only]').forEach(el => { el.hidden = false; });
  const sections = [...document.querySelectorAll('[data-help-section]')];
  const empty = document.querySelector('[data-help-empty]');
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    let shown = 0;
    for (const s of sections) {
      const hit = !q || norm(s.textContent).includes(q);
      s.hidden = !hit;
      if (hit) shown++;
    }
    // Région live toujours rendue : son texte change (une région révélée par hidden n'est pas annoncée).
    const text = shown ? '' : empty.dataset.text;
    if (empty.textContent !== text) empty.textContent = text;
  });
})();

// ----- réglages : rétablir un texte par défaut (droits d'utilisation) -----
document.addEventListener('click', e => {
  const b = e.target.closest('[data-reset-default]');
  if (!b) return;
  const ta = document.getElementById(b.dataset.resetDefault);
  if (!ta) return;
  ta.value = ta.dataset.default;
  ta.focus();
  toast.show(tr('Texte par défaut rétabli : enregistrez les réglages pour l’appliquer.'));
});

// ----- propositions de traduction (LibreTranslate du réseau local) -----
// Remplit le champ anglais ou allemand d'après le texte français (sinon l'autre traduction) ; l'auteur relit, corrige et
// enregistre. « Annuler » remet le texte d'avant.
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-translate]');
  if (!btn) return;
  const form = btn.closest('form');
  const name = btn.dataset.translate, to = btn.dataset.to;
  const field = form.elements[`${name}_${to}`];
  const status = btn.parentElement.querySelector('[data-translate-status]');
  const sources = [['fr', form.elements[name]], ...['en', 'de'].filter(l => l !== to).map(l => [l, form.elements[`${name}_${l}`]])];
  const [source, input] = sources.find(([, el]) => el && el.value.trim()) || [];
  if (!input) { status.textContent = tr('Rien à traduire : remplissez d’abord le texte français.'); return; }
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  status.textContent = tr('Traduction en cours…');
  try {
    const { text } = await postJson('/admin/traduction', { text: input.value, source, target: to });
    const before = field.value;
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const proposal = source === 'fr' ? tr('Proposition traduite du français : relisez-la avant d’enregistrer.')
      : source === 'en' ? tr('Proposition traduite de l’anglais : relisez-la avant d’enregistrer.') : tr('Proposition traduite de l’allemand : relisez-la avant d’enregistrer.');
    status.innerHTML = `${proposal} <button class="linkbtn" type="button" data-translate-undo>${tr('annuler-action')}</button>`;
    status.querySelector('[data-translate-undo]').addEventListener('click', () => {
      field.value = before;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      status.textContent = tr('Proposition retirée.');
      field.focus();
    }, { once: true });
    field.focus();
  } catch (err) {
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
});

// ----- cartes à imprimer : le premier numéro suit le photographe choisi -----
const cardsAuthor = $('[data-cards-author]');
if (cardsAuthor) cardsAuthor.addEventListener('change', () => { $('[data-cards-from]').value = cardsAuthor.selectedOptions[0].dataset.next; });

// ----- lien privé : sélectionné d'un clic, prêt à copier -----
document.addEventListener('focusin', e => { if (e.target.matches('[data-select-all]')) e.target.select(); });

// Accord : Instagram suppose le site (cocher Instagram coche le site, décocher le site décoche Instagram).
// Le serveur refuse de toute façon un accord Instagram sans le site.
document.addEventListener('change', e => {
  const t = e.target;
  if (!t.form || (t.name !== 'scope_instagram' && t.name !== 'scope_site')) return;
  const other = t.form.elements[t.name === 'scope_instagram' ? 'scope_site' : 'scope_instagram'];
  if (!other) return;
  if (t.name === 'scope_instagram' && t.checked) other.checked = true;
  if (t.name === 'scope_site' && !t.checked) other.checked = false;
});

// ----- rubriques repliées : un lien vers une ancre (#instagram, #rencontres…) ouvre la rubrique qui la contient -----
function openFor(hash) {
  if (!hash || hash.length < 2) return;
  let el = null;
  try { el = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
  for (let d = el && el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
}
openFor(location.hash);
window.addEventListener('hashchange', () => openFor(location.hash));

// ----- nouveautés : la fenêtre (ouverte sans script) devient modale, avec le fond assombri et le focus gardé -----
(function () {
  const d = $('[data-release-pop]');
  if (!d || typeof d.showModal !== 'function') return;
  d.close();
  d.showModal();
})();

// ----- mots-clés suggérés (fiche) : un clic ajoute le mot au champ Mots-clés, sans doublon ; à enregistrer -----
document.addEventListener('click', e => {
  const b = e.target.closest('[data-kw-add]');
  if (!b) return;
  const field = b.closest('form')?.querySelector('input[name="keywords"]');
  if (!field) return;
  const words = field.value.split(',').map(w => w.trim()).filter(Boolean);
  if (!words.some(w => w.toLowerCase() === b.dataset.kwAdd.toLowerCase())) words.push(b.dataset.kwAdd);
  field.value = words.join(', ');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  b.remove();
});
document.querySelectorAll('[data-kw-add]').forEach(b => { b.hidden = false; });

// ----- description suggérée (fiche) : la reprendre comme texte de remplacement ; suivre son calcul sans recharger -----
// Le bouton remplit seulement les champs : rien n'est enregistré, ni publié, avant « Enregistrer ».
document.addEventListener('click', e => {
  const b = e.target.closest('[data-desc-use]');
  if (!b) return;
  const form = b.closest('form');
  const field = name => form?.querySelector(`textarea[name="${name}"]`);
  // Le champ de la langue de la description : français (traduite), sinon anglais (rubrique des traductions).
  const main = field(b.dataset.descField === 'alt_text_en' ? 'alt_text_en' : 'alt_text');
  if (!main) return;
  if (main.value.trim() && main.value !== b.dataset.descUse && !confirm(b.closest('[data-desc]').dataset.descConfirm)) return;
  const put = (el, text) => { const fold = el.closest('details'); if (fold) fold.open = true; el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); };
  put(main, b.dataset.descUse);
  // Les autres langues déjà traduites : seulement dans un champ encore vide (un texte écrit à la main reste).
  for (const [name, text] of [['alt_text_en', b.dataset.descEn], ['alt_text_de', b.dataset.descDe]]) {
    const el = field(name);
    if (el && el !== main && text && !el.value.trim()) put(el, text);
  }
  main.focus();
});
document.querySelectorAll('[data-desc]').forEach(box => {
  // Demander ou recevoir une description ne quitte jamais la fiche : les saisies restent intactes.
  const requestForm = $('#desc-form');
  const text = $('[data-desc-text]', box);
  let polling = false;
  function watch() {
    if (polling) return;
    polling = true;
    let n = 0;
    const poll = async () => {
      if (++n > 120) { polling = false; return; }
      try {
        const r = await fetch(box.dataset.descUrl, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (!d.pending) {
          polling = false;
          box.removeAttribute('data-desc-pending');
          text.textContent = d.text ? `« ${d.text} »` : d.error ? tr('Dernier essai sans succès : {error}', { error: d.error }) : '';
          let use = $('[data-desc-use]', box);
          if (d.use?.text) {
            if (!use) {
              use = document.createElement('button');
              use.type = 'button';
              use.className = 'btn ghost sm';
              $('.actions', box).prepend(use);
            }
            use.hidden = false;
            use.dataset.descUse = d.use.text;
            use.dataset.descField = d.use.field;
            use.dataset.descEn = d.use.en || '';
            use.dataset.descDe = d.use.de || '';
            use.textContent = tr(d.use.field === 'alt_text' ? 'Reprendre comme texte de remplacement' : 'Reprendre comme texte de remplacement anglais');
          } else if (use) use.hidden = true;
          return;
        }
      } catch { /* réseau : on réessaie */ }
      setTimeout(poll, 5000);
    };
    setTimeout(poll, 1000);
  }
  requestForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.submitter;
    if (button) button.disabled = true;
    try {
      const r = await fetch(requestForm.action, { method: 'POST', headers: { accept: 'application/json' }, body: new URLSearchParams(new FormData(requestForm)) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || tr('Erreur {status}', { status: r.status }));
      text.textContent = tr('en cours de calcul…');
      watch();
    } catch (err) { text.textContent = err.message; }
    finally { if (button) button.disabled = false; }
  });
  if (box.hasAttribute('data-desc-pending')) watch();
});
