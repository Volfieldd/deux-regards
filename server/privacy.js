// Page « Confidentialité » (/confidentialite, /en/confidentialite, /de/confidentialite) : ce que le site collecte,
// pourquoi, combien de temps, qui le reçoit, et les droits des personnes (RGPD, articles 13 et 14). Elle décrit ce que
// le code fait réellement : toute évolution d'un traitement ou d'une durée se reporte ici dans la même modification.
// Responsables conjoints : les auteurs du site ; contact réglable dans l'admin (privacy_contact).

export const UPDATED = '2026-10-14';

const list = (names, and) => (names.length > 1 ? `${names.slice(0, -1).join(', ')}${and}${names.at(-1)}` : names[0] || '');

export const PRIVACY = {
  fr: {
    title: 'Confidentialité', link: 'Confidentialité',
    description: site => `Données personnelles sur ${site} : ce qui est collecté, pourquoi, combien de temps, et vos droits.`,
    updated: d => `Mise à jour : ${d}.`,
    sections: ({ site, authors, contact, host, mfa, encrypted, fields }) => [
      ['Qui est responsable', [
        `${list(authors, ' et ')}, photographes du site ${site}, sont responsables ensemble (responsables conjoints) des données décrites ici. Pour toute question ou demande : ${contact}.`,
        'Le site est hébergé chez nous, en France, sur notre propre serveur. Il ne contient ni publicité, ni outil de suivi, ni service extérieur dans ses pages.',
      ]],
      ['Les photos', [
        'Nous photographions dans la rue, à des fins artistiques. Une photo où vous êtes reconnaissable n’est publiée (sur ce site, sur Instagram, en exposition ou en tirage) que pour les usages que vous avez acceptés, ou dans le cadre de la liberté d’expression artistique.',
        'Si vous refusez, la photo ne peut plus être publiée : nous la retirons du site et de la file Instagram. Un post déjà publié sur Instagram est supprimé à la main par nos soins.',
        'Les photos ne sont jamais analysées pour reconnaître des visages.',
      ]],
      ['Quand vous nous écrivez ou nous donnez votre accord', [
        `Par la page ${host}/bonjour (le QR de nos cartes et vêtements), par une carte signée ou sur notre téléphone au moment de la photo, nous recueillons seulement ce que vous nous donnez : la référence de votre carte, la date et le lieu de la rencontre, votre nom, votre e-mail si vous voulez recevoir la photo ou une réponse, vos choix (recevoir la photo, accord par usage, refus) et vos messages.`,
        'Sur notre téléphone s’y ajoutent votre signature, une photo de repère (pour retrouver les bonnes images) et la position de la rencontre, arrondie à une centaine de mètres. Pour une personne mineure, un parent signe avec elle et nous notons son nom.',
        'Base légale : votre consentement, que vous pouvez retirer à tout moment sur la même page, sans justification.',
        'Nous ne vous envoyons rien d’autre que ce que vous avez demandé : votre photo, une réponse, le récapitulatif de votre accord.',
      ]],
      ['Combien de temps', [
        'Demande sans accord ni refus : effacée après 12 mois sans nouvelle.',
        'Photo de repère prise sur notre téléphone : effacée après 6 mois.',
        'Accord ou refus (avec la signature) : conservé tant qu’une photo qui vous concerne existe chez nous, puis 5 ans, le temps pendant lequel une action en justice reste possible.',
        'Lien privé pour télécharger votre photo : valable 30 jours, effacé un mois après.',
        'Sauvegardes : la base de données est sauvegardée chaque jour et chaque sauvegarde est effacée au bout de 14 jours ; une photo que nous supprimons disparaît de nos sauvegardes au bout de 90 jours.',
      ]],
      ['Qui reçoit vos données', [
        'Nous deux uniquement. Nous ne vendons ni ne cédons aucune donnée.',
        'Cloudflare achemine les connexions vers notre serveur (il assure le chiffrement HTTPS) ; il agit pour notre compte, sous ses conditions de protection des données, avec des transferts encadrés hors de l’Union européenne (Data Privacy Framework et clauses contractuelles types).',
        'Instagram (Meta) reçoit une photo seulement si vous avez accepté cet usage.',
        'Si nous vous écrivons par e-mail, le message passe par notre fournisseur de messagerie.',
      ]],
      ['Mesure d’audience et cookies', [
        'Le site compte ses visites de façon anonyme, sans cookie ni service extérieur : aucune adresse IP ni identifiant n’est conservé, les compteurs sont effacés après 25 mois.',
        'Le seul cookie du site public retient la langue que vous choisissez avec le sélecteur de langue. Nos journaux techniques, destinés à la sécurité, ne gardent que des adresses IP tronquées.',
      ]],
      ['Sécurité', [
        `Accès réservé à nous deux${mfa ? ', avec une authentification à deux facteurs' : ''} ; connexions chiffrées (HTTPS) ; signatures, photos de repère et cartes signées visibles seulement de nous ; données ${encrypted ? 'stockées sur un disque chiffré et ' : ''}sauvegardées chaque jour sur un autre disque${fields ? ' ; vos nom, adresse, signature et messages sont en plus chiffrés dans notre base, avec une clé conservée à part' : ''}.`,
      ]],
      ['Vos droits', [
        `Vous pouvez à tout moment demander à accéder à vos données (nous vous en envoyons une copie complète), les faire corriger ou effacer (photos comprises si vous le souhaitez), vous opposer à leur utilisation ou retirer votre accord : sur la page ${host}/bonjour, rubrique « Vos données » (avec la référence de votre carte si vous l’avez), ou à ${contact}. Nous répondons dans un délai d’un mois.`,
        'Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (www.cnil.fr/plaintes).',
      ]],
    ],
  },
  en: {
    title: 'Privacy', link: 'Privacy',
    description: site => `Personal data on ${site}: what is collected, why, for how long, and your rights.`,
    updated: d => `Updated: ${d}.`,
    sections: ({ site, authors, contact, host, mfa, encrypted, fields }) => [
      ['Who is responsible', [
        `${list(authors, ' and ')}, the photographers of ${site}, are jointly responsible (joint controllers) for the data described here. For any question or request: ${contact}.`,
        'The website is hosted by us, in France, on our own server. Its pages contain no advertising, no tracking tool and no third-party service.',
      ]],
      ['Photographs', [
        'We photograph in the street, for artistic purposes. A photograph in which you are recognisable is only published (on this website, on Instagram, in exhibitions or as prints) for the uses you have agreed to, or within the freedom of artistic expression.',
        'If you refuse, the photograph can no longer be published: we remove it from the website and from the Instagram queue. A post already published on Instagram is deleted by hand by us.',
        'Photographs are never analysed to recognise faces.',
      ]],
      ['When you write to us or give your consent', [
        `Through the page ${host}/bonjour (the QR code on our cards and clothes), on a signed card or on our phone when the photo is taken, we only collect what you give us: your card reference, the date and place of the meeting, your name, your email if you want to receive the photo or a reply, your choices (receive the photo, consent per use, refusal) and your messages.`,
        'On our phone we also record your signature, a reference photo (to find the right images) and the place of the meeting, rounded to about a hundred metres. For a minor, a parent signs with them and we note the parent’s name.',
        'Legal basis: your consent, which you can withdraw at any time on the same page, without giving a reason.',
        'We send you nothing other than what you asked for: your photo, a reply, a summary of your consent.',
      ]],
      ['For how long', [
        'Request without consent or refusal: deleted after 12 months without news.',
        'Reference photo taken on our phone: deleted after 6 months.',
        'Consent or refusal (with the signature): kept as long as a photo concerning you exists with us, then 5 years, the period during which legal action remains possible.',
        'Private link to download your photo: valid for 30 days, deleted one month later.',
        'Backups: the database is backed up every day and each backup is deleted after 14 days; a photo we delete disappears from our backups after 90 days.',
      ]],
      ['Who receives your data', [
        'Only the two of us. We never sell or pass on any data.',
        'Cloudflare routes connections to our server (it provides HTTPS encryption); it acts on our behalf, under its data protection terms, with safeguarded transfers outside the European Union (Data Privacy Framework and standard contractual clauses).',
        'Instagram (Meta) only receives a photo if you agreed to that use.',
        'If we email you, the message goes through our email provider.',
      ]],
      ['Audience measurement and cookies', [
        'The website counts its visits anonymously, without cookies or third-party services: no IP address or identifier is stored, and the counters are deleted after 25 months.',
        'The only cookie on the public website remembers the language you choose with the language selector. Our technical logs, used for security, only keep truncated IP addresses.',
      ]],
      ['Security', [
        `Access restricted to the two of us${mfa ? ', with two-factor authentication' : ''}; encrypted connections (HTTPS); signatures, reference photos and signed cards visible only to us; data ${encrypted ? 'stored on an encrypted disk and ' : ''}backed up daily on another disk${fields ? '; your name, address, signature and messages are also encrypted in our database, with a key kept separately' : ''}.`,
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
    sections: ({ site, authors, contact, host, mfa, encrypted, fields }) => [
      ['Verantwortliche', [
        `${list(authors, ' und ')}, die Fotografen von ${site}, sind gemeinsam verantwortlich (gemeinsam Verantwortliche) für die hier beschriebenen Daten. Für Fragen oder Anfragen: ${contact}.`,
        'Die Website wird von uns in Frankreich auf unserem eigenen Server betrieben. Ihre Seiten enthalten weder Werbung noch Tracking-Werkzeuge noch externe Dienste.',
      ]],
      ['Die Fotos', [
        'Wir fotografieren auf der Straße, zu künstlerischen Zwecken. Ein Foto, auf dem Sie erkennbar sind, wird nur für die Nutzungen veröffentlicht, denen Sie zugestimmt haben (auf dieser Website, auf Instagram, in Ausstellungen oder als Abzug), oder im Rahmen der künstlerischen Freiheit.',
        'Wenn Sie ablehnen, kann das Foto nicht mehr veröffentlicht werden: Wir entfernen es von der Website und aus der Instagram-Warteschlange. Einen bereits auf Instagram veröffentlichten Beitrag löschen wir von Hand.',
        'Die Fotos werden nie zur Gesichtserkennung ausgewertet.',
      ]],
      ['Wenn Sie uns schreiben oder einwilligen', [
        `Über die Seite ${host}/bonjour (den QR-Code unserer Karten und Kleidung), auf einer unterschriebenen Karte oder auf unserem Handy beim Fotografieren erheben wir nur, was Sie uns geben: die Referenz Ihrer Karte, Datum und Ort der Begegnung, Ihren Namen, Ihre E-Mail, wenn Sie das Foto oder eine Antwort erhalten möchten, Ihre Wahl (Foto erhalten, Einwilligung je Nutzung, Ablehnung) und Ihre Nachrichten.`,
        'Auf unserem Handy kommen Ihre Unterschrift, ein Erinnerungsfoto (um die richtigen Bilder zu finden) und der Ort der Begegnung hinzu, auf etwa hundert Meter gerundet. Bei Minderjährigen unterschreibt ein Elternteil mit, dessen Namen wir notieren.',
        'Rechtsgrundlage: Ihre Einwilligung, die Sie jederzeit auf derselben Seite ohne Begründung widerrufen können.',
        'Wir schicken Ihnen nur, was Sie angefragt haben: Ihr Foto, eine Antwort, eine Zusammenfassung Ihrer Einwilligung.',
      ]],
      ['Wie lange', [
        'Anfrage ohne Einwilligung oder Ablehnung: nach 12 Monaten ohne Nachricht gelöscht.',
        'Erinnerungsfoto auf unserem Handy: nach 6 Monaten gelöscht.',
        'Einwilligung oder Ablehnung (mit der Unterschrift): so lange aufbewahrt, wie ein Foto von Ihnen bei uns existiert, danach 5 Jahre, solange rechtliche Schritte möglich sind.',
        'Privater Link zum Herunterladen Ihres Fotos: 30 Tage gültig, einen Monat danach gelöscht.',
        'Sicherungen: Die Datenbank wird täglich gesichert, jede Sicherung wird nach 14 Tagen gelöscht; ein von uns gelöschtes Foto verschwindet nach 90 Tagen aus unseren Sicherungen.',
      ]],
      ['Wer Ihre Daten erhält', [
        'Nur wir beide. Wir verkaufen oder übermitteln keine Daten.',
        'Cloudflare leitet die Verbindungen zu unserem Server (und sorgt für die HTTPS-Verschlüsselung); es handelt in unserem Auftrag, nach seinen Datenschutzbedingungen, mit abgesicherten Übermittlungen außerhalb der Europäischen Union (Data Privacy Framework und Standardvertragsklauseln).',
        'Instagram (Meta) erhält ein Foto nur, wenn Sie dieser Nutzung zugestimmt haben.',
        'Wenn wir Ihnen eine E-Mail schreiben, läuft sie über unseren E-Mail-Anbieter.',
      ]],
      ['Reichweitenmessung und Cookies', [
        'Die Website zählt ihre Besuche anonym, ohne Cookies und ohne externe Dienste: Es werden weder IP-Adressen noch Kennungen gespeichert, die Zähler werden nach 25 Monaten gelöscht.',
        'Das einzige Cookie der öffentlichen Website speichert die Sprache, die Sie mit der Sprachauswahl wählen. Unsere technischen Protokolle dienen der Sicherheit und enthalten nur gekürzte IP-Adressen.',
      ]],
      ['Sicherheit', [
        `Zugang nur für uns beide${mfa ? ', mit Zwei-Faktor-Authentifizierung' : ''}; verschlüsselte Verbindungen (HTTPS); Unterschriften, Erinnerungsfotos und unterschriebene Karten nur für uns sichtbar; Daten ${encrypted ? 'auf einer verschlüsselten Festplatte gespeichert und ' : ''}täglich auf einer anderen Festplatte gesichert${fields ? '; Ihr Name, Ihre Adresse, Ihre Unterschrift und Ihre Nachrichten sind zusätzlich in unserer Datenbank verschlüsselt, mit einem separat aufbewahrten Schlüssel' : ''}.`,
      ]],
      ['Ihre Rechte', [
        `Sie können jederzeit Auskunft über Ihre Daten verlangen (wir schicken Ihnen eine vollständige Kopie), sie berichtigen oder löschen lassen (auf Wunsch einschließlich der Fotos), der Nutzung widersprechen oder Ihre Einwilligung widerrufen: auf der Seite ${host}/bonjour, Abschnitt „Ihre Daten“ (mit der Referenz Ihrer Karte, falls vorhanden), oder unter ${contact}. Wir antworten innerhalb eines Monats.`,
        'Wenn Sie meinen, dass Ihre Rechte nicht gewahrt werden, können Sie sich bei der CNIL, der französischen Datenschutzbehörde (www.cnil.fr/plaintes), oder bei der Aufsichtsbehörde Ihres Landes beschweren.',
      ]],
    ],
  },
};
