// Page « Confidentialité » (/confidentialite, /en/confidentialite, /de/confidentialite) : ce que le site collecte,
// pourquoi, combien de temps, qui le reçoit, et les droits des personnes (RGPD, articles 13 et 14). Elle décrit ce que
// le code fait réellement : toute évolution d'un traitement ou d'une durée se reporte ici dans la même modification.
// Responsables conjoints : les auteurs du site ; contact réglable dans l'admin (privacy_contact).

export const UPDATED = '2026-10-16';
// Date du paragraphe « Journal de sécurité », affiché seulement avec la Vigie (facultative).
export const UPDATED_SECURITY_LOG = '2026-10-17';

const list = (names, and) => (names.length > 1 ? `${names.slice(0, -1).join(', ')}${and}${names.at(-1)}` : names[0] || '');

export const PRIVACY = {
  fr: {
    title: 'Confidentialité', link: 'Confidentialité',
    description: site => `Données personnelles sur ${site} : ce qui est collecté, pourquoi, combien de temps, et vos droits.`,
    updated: d => `Mise à jour : ${d}.`,
    sections: ({ site, authors, contact, host, mfa, encrypted, fields, securityLog }) => [
      ['Qui est responsable', [
        `${list(authors, ' et ')}, photographes du site ${site}, sont responsables ensemble (responsables conjoints) des données décrites ici. Pour toute question ou demande : ${contact}.`,
        'Le site est hébergé chez nous, en France, sur notre propre serveur. Il ne contient ni publicité, ni outil de suivi, ni service extérieur dans ses pages.',
      ]],
      ['Les photos', [
        'Nous photographions dans la rue, à des fins artistiques. Une photo où vous êtes reconnaissable n’est publiée (sur ce site, sur Instagram, en exposition ou en tirage) que pour les usages que vous avez acceptés, ou dans le cadre de la liberté d’expression artistique.',
        'Si vous refusez, la photo ne peut plus être publiée : nous la retirons du site et de la file Instagram. Un post déjà publié sur Instagram est supprimé à la main par nos soins.',
        'Les photos ne sont jamais analysées pour reconnaître des visages. Sur notre serveur, un programme repère seulement s’il y a un visage sur une photo, et où (sans chercher à qui il appartient, et sans rien garder qui permette de le reconnaître) : cela nous dit s’il faut obtenir l’accord de quelqu’un avant de la publier.',
        'Pour nous aider à ranger les photos par série, le même serveur peut aussi calculer une empreinte de chaque image (une suite de nombres qui décrit son allure générale : lumière, couleurs, sujet). Elle sert seulement à comparer les photos entre elles, ne permet pas de reconnaître une personne, ne quitte jamais le serveur et est effacée avec la photo.',
      ]],
      ['Quand vous nous écrivez ou nous donnez votre accord', [
        `Par la page ${host}/bonjour (le QR de nos cartes et vêtements), par une carte signée ou sur notre téléphone au moment de la photo, nous recueillons seulement ce que vous nous donnez : la référence de votre carte, la date et le lieu de la rencontre, votre nom, votre e-mail si vous voulez recevoir la photo ou une réponse, vos choix (recevoir la photo, accord par usage, refus) et vos messages.`,
        'Sur notre téléphone s’y ajoutent votre signature, une photo de vous jointe à votre accord (pour savoir qui a signé et retrouver les bonnes images) et la position de la rencontre, arrondie à une centaine de mètres. Pour une personne mineure, un parent signe avec elle et nous notons son nom.',
        'Votre accord couvre les photos que le photographe a prises ce jour-là (la sortie ; si la journée est partagée en deux, la partie de la journée où il vous a rencontré) ; votre refus s’applique aux photos où vous apparaissez.',
        'Base légale : votre consentement, que vous pouvez retirer à tout moment sur la même page, sans justification.',
        'Nous ne vous envoyons rien d’autre que ce que vous avez demandé : votre photo, une réponse, le récapitulatif de votre accord.',
      ]],
      ['« J’aime », partages et signalements', [
        'Le bouton « J’aime » sous une photo est anonyme : ni compte, ni cookie. Votre navigateur retient la photo aimée (stockage local, sur votre appareil) ; notre serveur garde seulement en mémoire, quelques heures, que votre adresse IP a aimé cette photo, pour éviter les doublons, sans jamais l’enregistrer.',
        'Le bouton « Partager » ouvre le menu de partage de votre téléphone, ou de simples liens vers WhatsApp, Facebook, Bluesky, X, Pinterest ou votre messagerie : aucun script de ces services n’est chargé sur notre site, et rien n’est transmis avant que vous ne choisissiez. Nous comptons seulement le nombre de partages par photo et par moyen, chaque jour, sans rien garder sur vous.',
        'Le lien « Signaler » nous envoie votre message et, si vous le souhaitez, votre adresse e-mail pour vous répondre : ils ne servent qu’à traiter le signalement et sont effacés au bout de 12 mois.',
      ]],
      ['Combien de temps', [
        'Demande sans accord ni refus : effacée après 12 mois sans nouvelle.',
        'Photo de vous jointe à votre accord : conservée avec l’accord ; sans accord, effacée après 6 mois (si vous refusez après avoir accepté : 6 mois après votre refus).',
        'Accord ou refus (avec la signature) : conservé tant qu’une photo qui vous concerne existe chez nous, puis 5 ans après la suppression de la dernière, le temps pendant lequel une action en justice reste possible.',
        'Lien privé pour télécharger votre photo : valable 30 jours, effacé un mois après.',
        'Sauvegardes : la base de données est sauvegardée chaque jour et chaque sauvegarde est effacée au bout de 14 jours ; une photo que nous supprimons disparaît de nos sauvegardes au bout de 90 jours.',
      ]],
      ['Qui reçoit vos données', [
        'Nous deux, et les personnes à qui nous confions la modération ou la relecture des photos (chacune avec son compte) : elles voient les photos, jamais vos coordonnées, votre signature ni votre accord. Nous ne vendons ni ne cédons aucune donnée.',
        'Cloudflare achemine les connexions vers notre serveur (il assure le chiffrement HTTPS) ; il agit pour notre compte, sous ses conditions de protection des données, avec des transferts encadrés hors de l’Union européenne (Data Privacy Framework et clauses contractuelles types).',
        'Instagram (Meta) reçoit une photo seulement si vous avez accepté cet usage, qui suppose aussi le site. Si vous refusez Instagram, aucune photo de ce jour-là où vous pourriez figurer n’y est envoyée.',
        'Si nous vous écrivons par e-mail, le message passe par notre fournisseur de messagerie.',
      ]],
      ['Mesure d’audience et cookies', [
        'Le site compte ses visites de façon anonyme, sans cookie ni service extérieur : aucune adresse IP ni identifiant n’est conservé, les compteurs sont effacés après 25 mois.',
        'Le seul cookie du site public retient la langue que vous choisissez avec le sélecteur de langue. Nos journaux techniques, destinés à la sécurité, ne gardent que des adresses IP tronquées.',
        ...(securityLog ? ['Journal de sécurité : lorsqu’une requête paraît malveillante (tentative d’intrusion, saisie piégée, envois en rafale, lien inexistant cherché en série) et à chaque connexion à l’administration, nous enregistrons l’adresse IP complète, la ville et le pays estimés par Cloudflare, le type de navigateur et la page demandée, dans un journal séparé du site, consultable par nous seuls. Une visite ordinaire n’y laisse rien. Ce journal est effacé au bout de 6 mois. Base légale : notre intérêt légitime à protéger le site et les données qu’il contient (RGPD, articles 6-1-f et 32).'] : []),
      ]],
      ['Sécurité', [
        `Accès réservé à nous deux et aux personnes que nous autorisons, chacune avec son compte${mfa ? ', avec une authentification à deux facteurs' : ''} ; connexions chiffrées (HTTPS) ; signatures, photos de repère et cartes signées visibles seulement de nous deux ; données ${encrypted ? 'stockées sur un disque chiffré et ' : ''}sauvegardées chaque jour sur un autre disque${fields ? ' ; vos nom, adresse, signature et messages sont en plus chiffrés dans notre base, avec une clé conservée à part' : ''}.`,
      ]],
      ['Vos droits', [
        `Vous pouvez à tout moment demander à accéder à vos données (nous vous en envoyons une copie complète), les faire corriger ou effacer (photos comprises si vous le souhaitez), vous opposer à leur utilisation ou retirer votre accord : sur la page ${host}/bonjour, rubrique « Vos données » (avec la référence de votre carte si vous l’avez), ou à ${contact}. Nous répondons dans un délai d’un mois.`,
        'Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (www.cnil.fr/plaintes), ou à l’autorité de protection des données de votre pays.',
      ]],
    ],
  },
  en: {
    title: 'Privacy', link: 'Privacy',
    description: site => `Personal data on ${site}: what is collected, why, for how long, and your rights.`,
    updated: d => `Updated: ${d}.`,
    sections: ({ site, authors, contact, host, mfa, encrypted, fields, securityLog }) => [
      ['Who is responsible', [
        `${list(authors, ' and ')}, the photographers of ${site}, are jointly responsible (joint controllers) for the data described here. For any question or request: ${contact}.`,
        'The website is hosted by us, in France, on our own server. Its pages contain no advertising, no tracking tool and no third-party service.',
      ]],
      ['Photographs', [
        'We photograph in the street, for artistic purposes. A photograph in which you are recognisable is only published (on this website, on Instagram, in exhibitions or as prints) for the uses you have agreed to, or within the freedom of artistic expression.',
        'If you refuse, the photograph can no longer be published: we remove it from the website and from the Instagram queue. A post already published on Instagram is deleted by hand by us.',
        'Photographs are never analysed to recognise faces. On our server, a program only detects whether there is a face in a photograph, and where (without trying to find out whose it is, and without keeping anything that would allow it to be recognised): this tells us whether we need someone’s consent before publishing it.',
        'To help us file photographs by series, the same server can also compute a fingerprint of each image (a series of numbers describing its general look: light, colours, subject). It is only used to compare photographs with each other, cannot recognise a person, never leaves the server and is deleted with the photograph.',
      ]],
      ['When you write to us or give your consent', [
        `Through the page ${host}/bonjour (the QR code on our cards and clothes), on a signed card or on our phone when the photo is taken, we only collect what you give us: your card reference, the date and place of the meeting, your name, your email if you want to receive the photo or a reply, your choices (receive the photo, consent per use, refusal) and your messages.`,
        'On our phone we also record your signature, a photo of you attached to your consent (to know who signed and find the right images) and the place of the meeting, rounded to about a hundred metres. For a minor, a parent signs with them and we note the parent’s name.',
        'Your consent covers the photos the photographer took that day (the outing; if the day is split in two, the part of the day when you met); your refusal applies to the photos you appear in.',
        'Legal basis: your consent, which you can withdraw at any time on the same page, without giving a reason.',
        'We send you nothing other than what you asked for: your photo, a reply, a summary of your consent.',
      ]],
      ['“Like”, sharing and reports', [
        'The “Like” button under a photo is anonymous: no account, no cookie. Your browser remembers the photo you liked (local storage, on your device); our server only keeps in memory, for a few hours, that your IP address liked this photo, to avoid duplicates, and never records it.',
        'The “Share” button opens your phone’s share menu, or plain links to WhatsApp, Facebook, Bluesky, X, Pinterest or your email: no script from these services is loaded on our site, and nothing is sent before you choose. We only count the number of shares per photo and per channel, each day, keeping nothing about you.',
        'The “Report” link sends us your message and, if you wish, your email address so that we can reply: they are only used to deal with the report and are deleted after 12 months.',
      ]],
      ['For how long', [
        'Request without consent or refusal: deleted after 12 months without news.',
        'Photo of you attached to your consent: kept with the consent; without consent, deleted after 6 months (if you refuse after agreeing: 6 months after your refusal).',
        'Consent or refusal (with the signature): kept as long as a photo concerning you exists with us, then 5 years after the last one is deleted, the period during which legal action remains possible.',
        'Private link to download your photo: valid for 30 days, deleted one month later.',
        'Backups: the database is backed up every day and each backup is deleted after 14 days; a photo we delete disappears from our backups after 90 days.',
      ]],
      ['Who receives your data', [
        'The two of us, and the people we entrust with moderating or proofreading the photos (each with their own account): they see the photos, never your contact details, your signature or your consent. We never sell or pass on any data.',
        'Cloudflare routes connections to our server (it provides HTTPS encryption); it acts on our behalf, under its data protection terms, with safeguarded transfers outside the European Union (Data Privacy Framework and standard contractual clauses).',
        'Instagram (Meta) only receives a photo if you agreed to that use, which also requires the website. If you refuse Instagram, no photo from that day in which you might appear is sent there.',
        'If we email you, the message goes through our email provider.',
      ]],
      ['Audience measurement and cookies', [
        'The website counts its visits anonymously, without cookies or third-party services: no IP address or identifier is stored, and the counters are deleted after 25 months.',
        'The only cookie on the public website remembers the language you choose with the language selector. Our technical logs, used for security, only keep truncated IP addresses.',
        ...(securityLog ? ['Security log: when a request looks malicious (intrusion attempt, booby-trapped input, bursts of requests, non-existent links requested in series) and at each sign-in to the administration area, we record the full IP address, the city and country estimated by Cloudflare, the type of browser and the page requested, in a log kept separately from the website and accessible only to us. An ordinary visit leaves nothing in it. This log is deleted after 6 months. Legal basis: our legitimate interest in protecting the website and the data it holds (GDPR, Articles 6(1)(f) and 32).'] : []),
      ]],
      ['Security', [
        `Access restricted to the two of us and the people we authorise, each with their own account${mfa ? ', with two-factor authentication' : ''}; encrypted connections (HTTPS); signatures, reference photos and signed cards visible only to the two of us; data ${encrypted ? 'stored on an encrypted disk and ' : ''}backed up daily on another disk${fields ? '; your name, address, signature and messages are also encrypted in our database, with a key kept separately' : ''}.`,
      ]],
      ['Your rights', [
        `You can at any time ask to access your data (we send you a full copy), have it corrected or deleted (photos included if you wish), object to its use or withdraw your consent: on the page ${host}/bonjour, section “Your data” (with your card reference if you have it), or at ${contact}. We reply within one month.`,
        'If you believe your rights are not respected, you can lodge a complaint with the CNIL, the French data protection authority (www.cnil.fr/plaintes), or with the authority of your country.',
      ]],
    ],
  },
  de: {
    title: 'Datenschutz', link: 'Datenschutz',
    description: site => `Personenbezogene Daten auf ${site}: was erhoben wird, warum, wie lange, und Ihre Rechte.`,
    updated: d => `Stand: ${d}.`,
    sections: ({ site, authors, contact, host, mfa, encrypted, fields, securityLog }) => [
      ['Verantwortliche', [
        `${list(authors, ' und ')}, die Fotografen von ${site}, sind gemeinsam verantwortlich (gemeinsam Verantwortliche) für die hier beschriebenen Daten. Für Fragen oder Anfragen: ${contact}.`,
        'Die Website wird von uns in Frankreich auf unserem eigenen Server betrieben. Ihre Seiten enthalten weder Werbung noch Tracking-Werkzeuge noch externe Dienste.',
      ]],
      ['Die Fotos', [
        'Wir fotografieren auf der Straße, zu künstlerischen Zwecken. Ein Foto, auf dem Sie erkennbar sind, wird nur für die Nutzungen veröffentlicht, denen Sie zugestimmt haben (auf dieser Website, auf Instagram, in Ausstellungen oder als Abzug), oder im Rahmen der künstlerischen Freiheit.',
        'Wenn Sie ablehnen, kann das Foto nicht mehr veröffentlicht werden: Wir entfernen es von der Website und aus der Instagram-Warteschlange. Einen bereits auf Instagram veröffentlichten Beitrag löschen wir von Hand.',
        'Die Fotos werden nie zur Gesichtserkennung ausgewertet. Auf unserem Server erkennt ein Programm nur, ob auf einem Foto ein Gesicht ist und wo (ohne herauszufinden, wem es gehört, und ohne etwas zu speichern, das eine Erkennung ermöglicht): So wissen wir, ob wir vor der Veröffentlichung jemandes Einwilligung brauchen.',
        'Um die Fotos nach Serien zu ordnen, kann derselbe Server außerdem einen Fingerabdruck jedes Bildes berechnen (eine Zahlenfolge, die seinen allgemeinen Eindruck beschreibt: Licht, Farben, Motiv). Er dient nur dazu, Fotos miteinander zu vergleichen, kann keine Person erkennen, verlässt den Server nie und wird mit dem Foto gelöscht.',
      ]],
      ['Wenn Sie uns schreiben oder einwilligen', [
        `Über die Seite ${host}/bonjour (den QR-Code unserer Karten und Kleidung), auf einer unterschriebenen Karte oder auf unserem Handy beim Fotografieren erheben wir nur, was Sie uns geben: die Referenz Ihrer Karte, Datum und Ort der Begegnung, Ihren Namen, Ihre E-Mail, wenn Sie das Foto oder eine Antwort erhalten möchten, Ihre Wahl (Foto erhalten, Einwilligung je Nutzung, Ablehnung) und Ihre Nachrichten.`,
        'Auf unserem Handy kommen Ihre Unterschrift, ein Foto von Ihnen zu Ihrer Einwilligung (um zu wissen, wer unterschrieben hat, und die richtigen Bilder zu finden) und der Ort der Begegnung hinzu, auf etwa hundert Meter gerundet. Bei Minderjährigen unterschreibt ein Elternteil mit, dessen Namen wir notieren.',
        'Ihre Einwilligung gilt für die Fotos, die der Fotograf an diesem Tag gemacht hat (der Ausflug; ist der Tag geteilt, der Teil des Tages, an dem Sie sich begegnet sind); Ihre Ablehnung gilt für die Fotos, auf denen Sie zu sehen sind.',
        'Rechtsgrundlage: Ihre Einwilligung, die Sie jederzeit auf derselben Seite ohne Begründung widerrufen können.',
        'Wir schicken Ihnen nur, was Sie angefragt haben: Ihr Foto, eine Antwort, eine Zusammenfassung Ihrer Einwilligung.',
      ]],
      ['„Gefällt mir“, Teilen und Meldungen', [
        'Die Schaltfläche „Gefällt mir“ unter einem Foto ist anonym: kein Konto, kein Cookie. Ihr Browser merkt sich das Foto (lokaler Speicher auf Ihrem Gerät); unser Server behält nur einige Stunden im Arbeitsspeicher, dass Ihre IP-Adresse dieses Foto mag, um Doppelungen zu vermeiden, und speichert sie nie.',
        'Die Schaltfläche „Teilen“ öffnet das Teilen-Menü Ihres Telefons oder einfache Links zu WhatsApp, Facebook, Bluesky, X, Pinterest oder Ihrem E-Mail-Programm: kein Skript dieser Dienste wird auf unserer Website geladen, und nichts wird übertragen, bevor Sie wählen. Wir zählen nur die Anzahl der Teilungen pro Foto und Kanal und Tag, ohne etwas über Sie zu speichern.',
        'Der Link „Melden“ schickt uns Ihre Nachricht und, wenn Sie möchten, Ihre E-Mail-Adresse für eine Antwort: Sie dienen nur der Bearbeitung der Meldung und werden nach 12 Monaten gelöscht.',
      ]],
      ['Wie lange', [
        'Anfrage ohne Einwilligung oder Ablehnung: nach 12 Monaten ohne Nachricht gelöscht.',
        'Foto von Ihnen zu Ihrer Einwilligung: zusammen mit der Einwilligung aufbewahrt; ohne Einwilligung nach 6 Monaten gelöscht (wenn Sie nach einer Einwilligung ablehnen: 6 Monate nach Ihrer Ablehnung).',
        'Einwilligung oder Ablehnung (mit der Unterschrift): so lange aufbewahrt, wie ein Foto von Ihnen bei uns existiert, danach 5 Jahre ab dem Löschen des letzten, solange rechtliche Schritte möglich sind.',
        'Privater Link zum Herunterladen Ihres Fotos: 30 Tage gültig, einen Monat danach gelöscht.',
        'Sicherungen: Die Datenbank wird täglich gesichert, jede Sicherung wird nach 14 Tagen gelöscht; ein von uns gelöschtes Foto verschwindet nach 90 Tagen aus unseren Sicherungen.',
      ]],
      ['Wer Ihre Daten erhält', [
        'Wir beide und die Personen, die wir mit der Moderation oder dem Korrekturlesen der Fotos betrauen (jede mit eigenem Konto): Sie sehen die Fotos, nie Ihre Kontaktdaten, Ihre Unterschrift oder Ihre Einwilligung. Wir verkaufen oder übermitteln keine Daten.',
        'Cloudflare leitet die Verbindungen zu unserem Server (und sorgt für die HTTPS-Verschlüsselung); es handelt in unserem Auftrag, nach seinen Datenschutzbedingungen, mit abgesicherten Übermittlungen außerhalb der Europäischen Union (Data Privacy Framework und Standardvertragsklauseln).',
        'Instagram (Meta) erhält ein Foto nur, wenn Sie dieser Nutzung zugestimmt haben, die auch die Website voraussetzt. Wenn Sie Instagram ablehnen, wird kein Foto dieses Tages, auf dem Sie zu sehen sein könnten, dorthin gesendet.',
        'Wenn wir Ihnen eine E-Mail schreiben, läuft sie über unseren E-Mail-Anbieter.',
      ]],
      ['Reichweitenmessung und Cookies', [
        'Die Website zählt ihre Besuche anonym, ohne Cookies und ohne externe Dienste: Es werden weder IP-Adressen noch Kennungen gespeichert, die Zähler werden nach 25 Monaten gelöscht.',
        'Das einzige Cookie der öffentlichen Website speichert die Sprache, die Sie mit der Sprachauswahl wählen. Unsere technischen Protokolle dienen der Sicherheit und enthalten nur gekürzte IP-Adressen.',
        ...(securityLog ? ['Sicherheitsprotokoll: Wenn eine Anfrage bösartig erscheint (Einbruchsversuch, manipulierte Eingabe, Anfragen in schneller Folge, serienweise abgefragte nicht vorhandene Links) und bei jeder Anmeldung im Verwaltungsbereich speichern wir die vollständige IP-Adresse, die von Cloudflare geschätzte Stadt und das Land, den Browsertyp und die aufgerufene Seite in einem von der Website getrennten Protokoll, das nur wir einsehen können. Ein gewöhnlicher Besuch hinterlässt dort nichts. Dieses Protokoll wird nach 6 Monaten gelöscht. Rechtsgrundlage: unser berechtigtes Interesse am Schutz der Website und der darin enthaltenen Daten (DSGVO, Art. 6 Abs. 1 lit. f und Art. 32).'] : []),
      ]],
      ['Sicherheit', [
        `Zugang nur für uns beide und die Personen, die wir dazu berechtigen, jede mit eigenem Konto${mfa ? ', mit Zwei-Faktor-Authentifizierung' : ''}; verschlüsselte Verbindungen (HTTPS); Unterschriften, Erinnerungsfotos und unterschriebene Karten nur für uns beide sichtbar; Daten ${encrypted ? 'auf einer verschlüsselten Festplatte gespeichert und ' : ''}täglich auf einer anderen Festplatte gesichert${fields ? '; Ihr Name, Ihre Adresse, Ihre Unterschrift und Ihre Nachrichten sind zusätzlich in unserer Datenbank verschlüsselt, mit einem separat aufbewahrten Schlüssel' : ''}.`,
      ]],
      ['Ihre Rechte', [
        `Sie können jederzeit Auskunft über Ihre Daten verlangen (wir schicken Ihnen eine vollständige Kopie), sie berichtigen oder löschen lassen (auf Wunsch einschließlich der Fotos), der Nutzung widersprechen oder Ihre Einwilligung widerrufen: auf der Seite ${host}/bonjour, Abschnitt „Ihre Daten“ (mit der Referenz Ihrer Karte, falls vorhanden), oder unter ${contact}. Wir antworten innerhalb eines Monats.`,
        'Wenn Sie meinen, dass Ihre Rechte nicht gewahrt werden, können Sie sich bei der CNIL, der französischen Datenschutzbehörde (www.cnil.fr/plaintes), oder bei der Aufsichtsbehörde Ihres Landes beschweren.',
      ]],
    ],
  },
};
