// Page « Confidentialité » (/confidentialite, /en/confidentialite, /de/confidentialite) : ce que le site collecte,
// pourquoi, combien de temps, qui le reçoit, et les droits des personnes (RGPD, articles 13 et 14). Elle décrit ce que
// le code fait réellement : toute évolution d'un traitement ou d'une durée se reporte ici dans la même modification.
// Responsables conjoints : les auteurs du site ; contact réglable dans l'admin (privacy_contact).
import { VOTE_UI } from './saisons-votes-textes.js';

export const UPDATED = '2026-10-24';
// Date du paragraphe « Journal de sécurité », affiché seulement avec la Vigie (facultative).
export const UPDATED_SECURITY_LOG = '2026-10-21';

const list = (names, and) => (names.length > 1 ? `${names.slice(0, -1).join(', ')}${and}${names.at(-1)}` : names[0] || '');

export const PRIVACY = {
  fr: {
    title: 'Confidentialité', link: 'Confidentialité',
    description: site => `Données personnelles sur ${site} : ce qui est collecté, pourquoi, combien de temps, et vos droits.`,
    updated: d => `Mise à jour : ${d}.`,
    sections: ({ site, authors, contact, host, mfa, encrypted, fields, securityLog, edge }) => [
      ['Qui est responsable', [
        `${list(authors, ' et ')}, photographes du site ${site}, sont responsables ensemble (responsables conjoints) des données décrites ici. Pour toute question ou demande : ${contact}.`,
        'Le site est hébergé chez nous, en France, sur notre propre serveur. Il ne contient ni publicité, ni outil de suivi, ni service extérieur dans ses pages.',
      ]],
      ['Les photos', [
        'Nous photographions dans la rue, à des fins artistiques. Une photo où vous êtes reconnaissable n’est publiée (sur ce site, sur Instagram, en exposition ou en tirage) que pour les usages que vous avez acceptés, ou dans le cadre de la liberté d’expression artistique.',
        'Si vous refusez, la photo ne peut plus être publiée : nous la retirons du site et de la file Instagram. Un post déjà publié sur Instagram est supprimé à la main par nos soins.',
        'Avec une photo publiée, le site indique le lieu et le mois ou le jour de la prise de vue. L’heure, qui dirait avec le lieu où vous vous trouviez à ce moment-là, n’est jamais montrée par défaut : seulement sur la page d’une photo pour laquelle nous l’avons choisi.',
        'Les photos ne sont jamais analysées pour reconnaître des visages. Sur notre serveur, un programme repère seulement s’il y a un visage sur une photo, et où (sans chercher à qui il appartient, et sans rien garder qui permette de le reconnaître) : cela nous dit s’il faut obtenir l’accord de quelqu’un avant de la publier.',
        'Pour nous aider à ranger les photos par série, le même serveur peut aussi calculer une empreinte de chaque image (une suite de nombres qui décrit son allure générale : lumière, couleurs, sujet). Elle sert seulement à comparer les photos entre elles, ne permet pas de reconnaître une personne, ne quitte jamais le serveur et est effacée avec la photo.',
      ]],
      ['Quand vous nous écrivez ou nous donnez votre accord', [
        `Par la page ${host}/bonjour (le QR de nos cartes et vêtements), par une carte signée ou sur notre téléphone au moment de la photo, nous recueillons seulement ce que vous nous donnez : la référence de votre carte, la date et le lieu de la rencontre, votre nom, votre e-mail si vous voulez recevoir la photo ou une réponse, vos choix (recevoir la photo, accord par usage, refus) et vos messages.`,
        'Sur notre téléphone s’y ajoutent votre signature, une photo de vous jointe à votre accord (pour savoir qui a signé et retrouver les bonnes images) et la position de la rencontre, arrondie à une centaine de mètres.',
        'Avant 18 ans, la publication d’une photo se décide avec un parent, avec l’accord des deux parents (ou du parent qui exerce seul l’autorité parentale). Sur la page comme sur notre téléphone, nous vous demandons seulement votre tranche d’âge (jamais votre date de naissance), quand vous acceptez une publication, et aussi quand vous demandez à recevoir la photo (sur notre téléphone, dès que vous nous laissez une adresse). Avant 18 ans, votre accord n’est enregistré qu’avec le nom d’un parent, qui le donne avec vous (sur notre téléphone, il signe avec vous) ; s’il contredit ce que nous avons noté (votre âge ou votre parent), il attend notre vérification. Un refus, lui, peut venir de vous seul.',
        'Avant 15 ans, pour recevoir la photo comme pour accepter une publication, la page et notre téléphone vous demandent l’adresse e-mail d’un parent à la place de la vôtre : la photo, le récapitulatif de votre accord et nos réponses lui sont envoyés, et votre propre adresse n’est pas gardée. L’adresse et le nom du parent sont chiffrés et conservés comme le reste de la demande, pour la même durée.',
        'Votre accord couvre les photos que le photographe a prises ce jour-là (la sortie ; si la journée est partagée en deux, la partie de la journée où il vous a rencontré) ; votre refus s’applique aux photos où vous apparaissez.',
        'Base légale : votre consentement, que vous pouvez retirer à tout moment sur la même page, sans justification.',
        'Nous ne vous envoyons rien d’autre que ce que vous avez demandé : votre photo, une réponse, le récapitulatif de votre accord.',
      ]],
      ['« J’aime », partages et signalements', [
        'Le bouton « J’aime » sous une photo est anonyme : ni compte, ni cookie. Votre navigateur retient la photo aimée (stockage local, sur votre appareil) ; notre serveur garde seulement en mémoire, quelques heures, que votre adresse IP a aimé cette photo, pour éviter les doublons, sans jamais l’enregistrer.',
        'Le bouton « Partager » ouvre le menu de partage de votre téléphone, ou de simples liens vers WhatsApp, Facebook, Bluesky, X, Pinterest ou votre messagerie : aucun script de ces services n’est chargé sur notre site, et rien n’est transmis avant que vous ne choisissiez. Nous comptons seulement le nombre de partages par photo et par moyen, chaque jour, sans rien garder sur vous.',
        'Le lien « Signaler » nous envoie votre message et, si vous le souhaitez, votre adresse e-mail pour vous répondre : ils ne servent qu’à traiter le signalement et sont effacés au bout de 12 mois.',
      ]],
      ['Contact et demandes de licence', [
        `Par la page ${host}/contact, ou par « Demander une licence » sous une photo (${host}/droits/demande), vous nous envoyez votre nom, votre adresse e-mail et votre message ; pour une licence, aussi la photo concernée, l’usage prévu, la diffusion et, si vous le souhaitez, votre société ou votre média.`,
        'Ils servent seulement à vous répondre et, pour une licence, à vous proposer des conditions. Base légale : votre demande, à laquelle nous répondons (mesures précontractuelles pour une licence) et notre intérêt légitime à répondre à qui nous écrit (RGPD, articles 6-1-b et 6-1-f).',
        'Seul le photographe à qui vous écrivez (celui de la photo, pour une licence ; les deux si vous écrivez aux deux) et l’administrateur du site les lisent ; chaque lecture est notée. Nous ne vous envoyons aucun e-mail automatique : seulement notre réponse. Le photographe est prévenu par un e-mail qui ne contient rien de votre message.',
        `Votre message, votre nom et votre adresse sont ${fields ? 'chiffrés dans notre base et ' : ''}effacés 12 mois après l’envoi ; vous pouvez nous demander de les effacer plus tôt.`,
      ]],
      ['Vote consultatif des expositions', [
        'Une exposition peut proposer de voter sur des photographies choisies et validées par l’équipe. Chaque navigateur peut voter une fois sur chacune. Aucun résultat ne publie automatiquement une œuvre dans la collection permanente ; l’atelier affiche seulement des totaux, qui ne sont pas présentés aux visiteurs.',
        VOTE_UI.fr.notice, VOTE_UI.fr.free, VOTE_UI.fr.retention, VOTE_UI.fr.rights, VOTE_UI.fr.limit,
        'Base légale : votre consentement (RGPD, article 6.1.a), recueilli par une case non cochée au premier vote et retirable depuis « Mes votes ». Le cookie de vote est facultatif et distinct des cookies fonctionnels ci-dessous ; aucune exemption de consentement n’est invoquée pour lui. Sans ce cookie, nous ne pouvons plus retrouver vos votes individuels et nous ne demandons pas d’identité supplémentaire pour le faire.',
        'Le vote ne conserve ni adresse IP ni caractéristiques techniques du navigateur. Le limiteur technique des formulaires utilise temporairement le réseau en mémoire, comme les autres formulaires du site ; les refus de provenance, les défis de formulaire invalides, les pièges et les rafales peuvent être signalés au journal de sécurité décrit ci-dessous. Ni cookie, ni index, ni bulletin individuel n’y est copié.',
      ]],
      ['Galeries privées', [
        'Nous pouvons montrer des photos à des personnes choisies, dans une galerie privée : chacune reçoit de nous un lien personnel et, par un autre moyen, un mot de passe. Pour cela, nous gardons le nom de la personne invitée (chiffré, visible de nous seuls), la langue et la durée de son accès, et une empreinte du lien et du mot de passe (jamais le lien ni le mot de passe eux-mêmes).',
        'Quand vous ouvrez une galerie privée, nous notons la date de vos visites, les mots de passe refusés, vos favoris, la sélection que vous nous envoyez et vos téléchargements, avec le réseau d’où vous venez (votre adresse IP tronquée) et le pays estimé par Cloudflare ; jamais votre navigateur. Cela nous dit si les photos vous sont parvenues, et protège la galerie contre un lien qui aurait été transmis à d’autres.',
        'Un cookie, nécessaire, garde la galerie ouverte sur votre navigateur : 12 heures sans visite et 7 jours au plus, ou 30 jours si vous cochez « Se souvenir de cet appareil » ; jamais au-delà de la fin de votre accès. « Quitter la galerie » le referme aussitôt.',
        ...(securityLog ? ['Le journal de sécurité (voir plus bas) reçoit, pour chaque mot de passe accepté, le réseau et le pays seulement ; pour un mot de passe refusé, un lien inconnu ou un accès tenté après son retrait, l’adresse IP complète. Jamais votre nom, le lien ni le mot de passe.'] : []),
        ...(securityLog ? ['Si notre système de sécurité suspend votre accès, nous gardons son numéro et les dates de la décision jusqu’à son échéance, pour suivre son application et respecter un déblocage par l’équipe. Cette trace est effacée au prochain nettoyage horaire après l’échéance, ou dès l’effacement de votre accès ou le retrait du système de sécurité. Vous pouvez en demander une copie.'] : []),
        'Tout ce qui concerne un accès est effacé six mois après sa fin (échéance ou retrait) ; vous pouvez nous demander de l’effacer plus tôt. Base légale : l’exécution du contrat pour une séance commandée, notre intérêt légitime pour les autres invités et pour la sécurité de la galerie (RGPD, articles 6-1-b et 6-1-f).',
      ]],
      ['Combien de temps', [
        'Demande sans accord ni refus : effacée après 12 mois sans nouvelle.',
        'Message envoyé par la page Contact ou demande de licence : effacé 12 mois après l’envoi.',
        'Photo de vous jointe à votre accord : conservée avec l’accord ; sans accord, effacée après 6 mois (si vous refusez après avoir accepté : 6 mois après votre refus).',
        'Accord ou refus (avec la signature) : conservé tant qu’une photo qui vous concerne existe chez nous, puis 5 ans après la suppression de la dernière, le temps pendant lequel une action en justice reste possible.',
        'Votre tranche d’âge (18 ans ou plus, moins de 18 ans, moins de 15 ans), le nom et, avant 15 ans, l’adresse de votre parent : avec la demande ou l’accord qu’ils accompagnent, pour la même durée.',
        'Lien privé pour télécharger votre photo : valable 30 jours, effacé un mois après.',
        'Sauvegardes : la base de données est sauvegardée chaque jour et chaque sauvegarde est effacée au bout de 14 jours ; une photo que nous supprimons disparaît de nos sauvegardes au bout de 90 jours.',
      ]],
      ['Qui reçoit vos données', [
        'Nous deux, et les personnes à qui nous confions la modération ou la relecture des photos (chacune avec son compte) : elles voient les photos, jamais vos coordonnées, votre signature, votre accord ni les messages que vous nous envoyez. Nous ne vendons ni ne cédons aucune donnée.',
        'Cloudflare achemine les connexions vers notre serveur (il assure le chiffrement HTTPS) ; il agit pour notre compte, sous ses conditions de protection des données, avec des transferts encadrés hors de l’Union européenne (Data Privacy Framework et clauses contractuelles types).',
        'Instagram (Meta) reçoit une photo seulement si vous avez accepté cet usage, qui suppose aussi le site. Si vous refusez Instagram, aucune photo de ce jour-là où vous pourriez figurer n’y est envoyée.',
        'Si nous vous écrivons par e-mail, le message passe par notre fournisseur de messagerie.',
      ]],
      ['Mesure d’audience et cookies', [
        'Le site compte ses visites de façon anonyme, sans cookie ni service extérieur : aucune adresse IP ni identifiant n’est conservé, les compteurs sont effacés après 25 mois.',
        'Un cookie du site public retient la langue que vous choisissez avec le sélecteur de langue ; un autre, seulement si vous ouvrez une galerie privée avec son mot de passe, garde la galerie ouverte sur votre navigateur (voir « Galeries privées ») ; un troisième, après un envoi de la page /bonjour, permet à la page de remerciement de vous montrer une seule fois le récapitulatif de vos choix (il ne contient qu’un numéro tiré au hasard ; le récapitulatif reste sur notre serveur, en mémoire, sans être enregistré, ne contient ni votre nom ni votre adresse, et il est effacé dès qu’il a été montré, ou au bout de 15 minutes). Tous trois sont nécessaires au service que vous demandez. Nos journaux techniques, destinés à la sécurité, ne gardent que des adresses IP tronquées.',
        ...(securityLog ? ['Journal de sécurité : lorsqu’une requête paraît malveillante (tentative d’intrusion, saisie piégée, envois en rafale, lien inexistant cherché en série) et à chaque connexion à l’administration, nous enregistrons l’adresse IP complète, la ville et le pays estimés par Cloudflare, le type de navigateur et la page demandée, dans un journal séparé du site, consultable par nous seuls. Une visite ordinaire n’y laisse en principe rien ; une erreur ponctuelle (lien mal tapé, page restée ouverte après une déconnexion) peut y laisser une ligne. Les lectures et exports de données personnelles dans l’administration sont aussi notés : catégorie des données, nombre d’objets affichés, opérations de déchiffrement et taille de la réponse, rattachés au compte et à sa session. Aucun nom, adresse e-mail, message, signature ou contenu de fiche n’est copié dans ces indications. Ce journal est effacé au bout de 6 mois. Base légale : notre intérêt légitime à protéger le site et les données qu’il contient (RGPD, articles 6-1-f et 32).'] : []),
        ...(securityLog && edge ? ['Ce journal est complété par un filtre que nous faisons tourner chez Cloudflare, qui achemine déjà le site : pour chaque page demandée (hors images), Cloudflare enregistre pour nous l’adresse IP, l’opérateur réseau, le pays, une empreinte technique de la connexion chiffrée (jamais son contenu) et le code de réponse, sans le détail de l’adresse de la page. Notre journal de sécurité lit ces relevés chaque minute ; Cloudflare les efface au bout de 3 mois au plus. Ce filtre bloque aussi, avant le site, les adresses que nous avons bloquées.'] : []),
      ]],
      ['Sécurité', [
        `Accès réservé à nous deux et aux personnes que nous autorisons, chacune avec son compte${mfa ? ', avec une authentification à deux facteurs' : ''} ; connexions chiffrées (HTTPS) ; signatures, photos de repère et cartes signées visibles seulement de nous deux ; données ${encrypted ? 'stockées sur un disque chiffré et ' : ''}sauvegardées chaque jour sur un autre disque${fields ? ' ; vos nom, adresse, âge, nom et adresse de votre parent, signature et messages sont en plus chiffrés dans notre base, avec une clé conservée à part' : ''}.`,
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
    sections: ({ site, authors, contact, host, mfa, encrypted, fields, securityLog, edge }) => [
      ['Who is responsible', [
        `${list(authors, ' and ')}, the photographers of ${site}, are jointly responsible (joint controllers) for the data described here. For any question or request: ${contact}.`,
        'The website is hosted by us, in France, on our own server. Its pages contain no advertising, no tracking tool and no third-party service.',
      ]],
      ['Photographs', [
        'We photograph in the street, for artistic purposes. A photograph in which you are recognisable is only published (on this website, on Instagram, in exhibitions or as prints) for the uses you have agreed to, or within the freedom of artistic expression.',
        'If you refuse, the photograph can no longer be published: we remove it from the website and from the Instagram queue. A post already published on Instagram is deleted by hand by us.',
        'With a published photograph, the website gives the place and the month or day it was taken. The time, which together with the place would tell where you were at that moment, is never shown by default: only on the page of a photograph for which we have chosen to.',
        'Photographs are never analysed to recognise faces. On our server, a program only detects whether there is a face in a photograph, and where (without trying to find out whose it is, and without keeping anything that would allow it to be recognised): this tells us whether we need someone’s consent before publishing it.',
        'To help us file photographs by series, the same server can also compute a fingerprint of each image (a series of numbers describing its general look: light, colours, subject). It is only used to compare photographs with each other, cannot recognise a person, never leaves the server and is deleted with the photograph.',
      ]],
      ['When you write to us or give your consent', [
        `Through the page ${host}/bonjour (the QR code on our cards and clothes), on a signed card or on our phone when the photo is taken, we only collect what you give us: your card reference, the date and place of the meeting, your name, your email if you want to receive the photo or a reply, your choices (receive the photo, consent per use, refusal) and your messages.`,
        'On our phone we also record your signature, a photo of you attached to your consent (to know who signed and find the right images) and the place of the meeting, rounded to about a hundred metres.',
        'Under 18, the publication of a photograph is decided with a parent, with the consent of both parents (or of the parent who alone exercises parental authority). On the page as on our phone, we only ask for your age bracket (never your date of birth), when you agree to a publication, and also when you ask to receive the photo (on our phone, as soon as you leave us an address). Under 18, your consent is only recorded with the name of a parent, who gives it with you (on our phone, they sign with you); if it contradicts what we have noted (your age or your parent), it waits for us to check it. A refusal, however, can come from you alone.',
        'Under 15, to receive the photo as to agree to a publication, the page and our phone ask for a parent’s email address instead of yours: the photo, the summary of your consent and our replies are sent to them, and your own address is not kept. The parent’s address and name are encrypted and kept like the rest of the request, for the same period.',
        'Your consent covers the photos the photographer took that day (the outing; if the day is split in two, the part of the day when you met); your refusal applies to the photos you appear in.',
        'Legal basis: your consent, which you can withdraw at any time on the same page, without giving a reason.',
        'We send you nothing other than what you asked for: your photo, a reply, a summary of your consent.',
      ]],
      ['“Like”, sharing and reports', [
        'The “Like” button under a photo is anonymous: no account, no cookie. Your browser remembers the photo you liked (local storage, on your device); our server only keeps in memory, for a few hours, that your IP address liked this photo, to avoid duplicates, and never records it.',
        'The “Share” button opens your phone’s share menu, or plain links to WhatsApp, Facebook, Bluesky, X, Pinterest or your email: no script from these services is loaded on our site, and nothing is sent before you choose. We only count the number of shares per photo and per channel, each day, keeping nothing about you.',
        'The “Report” link sends us your message and, if you wish, your email address so that we can reply: they are only used to deal with the report and are deleted after 12 months.',
      ]],
      ['Contact and licence requests', [
        `Through the page ${host}/contact, or through “Request a licence” under a photograph (${host}/droits/demande), you send us your name, your email address and your message; for a licence, also the photograph concerned, the intended use, the circulation and, if you wish, your company or media outlet.`,
        'They are only used to answer you and, for a licence, to offer you terms. Legal basis: your request, which we answer (pre-contractual steps for a licence), and our legitimate interest in answering those who write to us (GDPR, Articles 6(1)(b) and 6(1)(f)).',
        'Only the photographer you write to (the photographer of the photograph, for a licence; both of us if you write to both) and the site administrator read them; each reading is logged. We send you no automatic email: only our reply. The photographer is notified by an email that contains nothing of your message.',
        `Your message, your name and your address are ${fields ? 'encrypted in our database and ' : ''}deleted 12 months after sending; you can ask us to delete them earlier.`,
      ]],
      ['Advisory voting in exhibitions', [
        'An exhibition may offer voting on photographs selected and approved by the team. Each browser can vote once on each photograph. No result automatically publishes a work in the permanent collection; the workspace shows totals only, which are not displayed to visitors.',
        VOTE_UI.en.notice, VOTE_UI.en.free, VOTE_UI.en.retention, VOTE_UI.en.rights, VOTE_UI.en.limit,
        'Legal basis: your consent (GDPR, Article 6.1.a), collected through an unchecked box at the first vote and withdrawable from “My votes”. The voting cookie is optional and separate from the functional cookies below; no consent exemption is claimed for it. Without this cookie we cannot retrieve your individual votes and do not request additional identity information to do so.',
        'Voting stores neither your IP address nor your browser’s technical characteristics. The technical form limiter temporarily uses the network in memory, like the other forms on the site; rejected origins, invalid form challenges, traps and bursts may be reported to the security log described below. No cookie, index or individual ballot is copied there.',
      ]],
      ['Private galleries', [
        'We may show photographs to chosen people, in a private gallery: each receives from us a personal link and, by another channel, a password. For this, we keep the name of the invited person (encrypted, visible to us only), the language and the duration of their access, and a fingerprint of the link and of the password (never the link or the password themselves).',
        'When you open a private gallery, we record the dates of your visits, refused passwords, your favourites, the selection you send us and your downloads, with the network you come from (your truncated IP address) and the country estimated by Cloudflare; never your browser. This tells us whether the photographs reached you, and protects the gallery against a link passed on to others.',
        'A necessary cookie keeps the gallery open in your browser: 12 hours without a visit and 7 days at most, or 30 days if you tick “Remember this device”; never beyond the end of your access. “Leave the gallery” closes it at once.',
        ...(securityLog ? ['The security log (see below) receives, for each accepted password, the network and country only; for a refused password, an unknown link or an access attempted after its withdrawal, the full IP address. Never your name, the link or the password.'] : []),
        ...(securityLog ? ['If our security system suspends your access, we keep its number and the dates of the decision until it expires, to track its application and respect any unblocking by our team. This record is deleted at the next hourly cleanup after expiry, or as soon as your access or the security system is removed. You can request a copy.'] : []),
        'Everything about an access is deleted six months after it ends (expiry or withdrawal); you can ask us to delete it earlier. Legal basis: performance of the contract for a commissioned session, our legitimate interest for other guests and for the security of the gallery (GDPR, Articles 6(1)(b) and 6(1)(f)).',
      ]],
      ['For how long', [
        'Request without consent or refusal: deleted after 12 months without news.',
        'Message sent through the Contact page or licence request: deleted 12 months after sending.',
        'Photo of you attached to your consent: kept with the consent; without consent, deleted after 6 months (if you refuse after agreeing: 6 months after your refusal).',
        'Consent or refusal (with the signature): kept as long as a photo concerning you exists with us, then 5 years after the last one is deleted, the period during which legal action remains possible.',
        'Your age bracket (18 or older, under 18, under 15), your parent’s name and, under 15, their address: with the request or consent they accompany, for the same period.',
        'Private link to download your photo: valid for 30 days, deleted one month later.',
        'Backups: the database is backed up every day and each backup is deleted after 14 days; a photo we delete disappears from our backups after 90 days.',
      ]],
      ['Who receives your data', [
        'The two of us, and the people we entrust with moderating or proofreading the photos (each with their own account): they see the photos, never your contact details, your signature, your consent or the messages you send us. We never sell or pass on any data.',
        'Cloudflare routes connections to our server (it provides HTTPS encryption); it acts on our behalf, under its data protection terms, with safeguarded transfers outside the European Union (Data Privacy Framework and standard contractual clauses).',
        'Instagram (Meta) only receives a photo if you agreed to that use, which also requires the website. If you refuse Instagram, no photo from that day in which you might appear is sent there.',
        'If we email you, the message goes through our email provider.',
      ]],
      ['Audience measurement and cookies', [
        'The website counts its visits anonymously, without cookies or third-party services: no IP address or identifier is stored, and the counters are deleted after 25 months.',
        'One cookie on the public website remembers the language you choose with the language selector; another, only if you open a private gallery with its password, keeps the gallery open in your browser (see “Private galleries”); a third, after you send the /bonjour page, lets the thank-you page show you a summary of your choices once (it only holds a random number; the summary stays on our server, in memory, without being recorded, contains neither your name nor your address, and is erased as soon as it has been shown, or after 15 minutes). All three are necessary for the service you ask for. Our technical logs, used for security, only keep truncated IP addresses.',
        ...(securityLog ? ['Security log: when a request looks malicious (intrusion attempt, booby-trapped input, bursts of requests, non-existent links requested in series) and at each sign-in to the administration area, we record the full IP address, the city and country estimated by Cloudflare, the type of browser and the page requested, in a log kept separately from the website and accessible only to us. An ordinary visit normally leaves nothing in it; a one-off mistake (a mistyped link, a page left open after signing out) may leave a line. Reads and exports of personal data in the administration area are also logged: data categories, number of objects displayed, decryption operations and response size, linked to the account and its session. No names, email addresses, messages, signatures or record contents are copied into this metadata. This log is deleted after 6 months. Legal basis: our legitimate interest in protecting the website and the data it holds (GDPR, Articles 6(1)(f) and 32).'] : []),
        ...(securityLog && edge ? ['This log is supplemented by a filter we run at Cloudflare, which already carries the website: for each page requested (images excluded), Cloudflare records on our behalf the IP address, the network operator, the country, a technical fingerprint of the encrypted connection (never its content) and the response code, without the detail of the page address. Our security log reads these records every minute; Cloudflare deletes them after 3 months at most. This filter also blocks, before the website, the addresses we have blocked.'] : []),
      ]],
      ['Security', [
        `Access restricted to the two of us and the people we authorise, each with their own account${mfa ? ', with two-factor authentication' : ''}; encrypted connections (HTTPS); signatures, reference photos and signed cards visible only to the two of us; data ${encrypted ? 'stored on an encrypted disk and ' : ''}backed up daily on another disk${fields ? '; your name, address, age, parent’s name and address, signature and messages are also encrypted in our database, with a key kept separately' : ''}.`,
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
    sections: ({ site, authors, contact, host, mfa, encrypted, fields, securityLog, edge }) => [
      ['Verantwortliche', [
        `${list(authors, ' und ')}, die Fotografen von ${site}, sind gemeinsam verantwortlich (gemeinsam Verantwortliche) für die hier beschriebenen Daten. Für Fragen oder Anfragen: ${contact}.`,
        'Die Website wird von uns in Frankreich auf unserem eigenen Server betrieben. Ihre Seiten enthalten weder Werbung noch Tracking-Werkzeuge noch externe Dienste.',
      ]],
      ['Die Fotos', [
        'Wir fotografieren auf der Straße, zu künstlerischen Zwecken. Ein Foto, auf dem Sie erkennbar sind, wird nur für die Nutzungen veröffentlicht, denen Sie zugestimmt haben (auf dieser Website, auf Instagram, in Ausstellungen oder als Abzug), oder im Rahmen der künstlerischen Freiheit.',
        'Wenn Sie ablehnen, kann das Foto nicht mehr veröffentlicht werden: Wir entfernen es von der Website und aus der Instagram-Warteschlange. Einen bereits auf Instagram veröffentlichten Beitrag löschen wir von Hand.',
        'Zu einem veröffentlichten Foto nennt die Website den Ort und den Monat oder Tag der Aufnahme. Die Uhrzeit, die zusammen mit dem Ort verraten würde, wo Sie sich in diesem Moment aufhielten, wird nie standardmäßig gezeigt: nur auf der Seite eines Fotos, für das wir es so gewählt haben.',
        'Die Fotos werden nie zur Gesichtserkennung ausgewertet. Auf unserem Server erkennt ein Programm nur, ob auf einem Foto ein Gesicht ist und wo (ohne herauszufinden, wem es gehört, und ohne etwas zu speichern, das eine Erkennung ermöglicht): So wissen wir, ob wir vor der Veröffentlichung jemandes Einwilligung brauchen.',
        'Um die Fotos nach Serien zu ordnen, kann derselbe Server außerdem einen Fingerabdruck jedes Bildes berechnen (eine Zahlenfolge, die seinen allgemeinen Eindruck beschreibt: Licht, Farben, Motiv). Er dient nur dazu, Fotos miteinander zu vergleichen, kann keine Person erkennen, verlässt den Server nie und wird mit dem Foto gelöscht.',
      ]],
      ['Wenn Sie uns schreiben oder einwilligen', [
        `Über die Seite ${host}/bonjour (den QR-Code unserer Karten und Kleidung), auf einer unterschriebenen Karte oder auf unserem Handy beim Fotografieren erheben wir nur, was Sie uns geben: die Referenz Ihrer Karte, Datum und Ort der Begegnung, Ihren Namen, Ihre E-Mail, wenn Sie das Foto oder eine Antwort erhalten möchten, Ihre Wahl (Foto erhalten, Einwilligung je Nutzung, Ablehnung) und Ihre Nachrichten.`,
        'Auf unserem Handy kommen Ihre Unterschrift, ein Foto von Ihnen zu Ihrer Einwilligung (um zu wissen, wer unterschrieben hat, und die richtigen Bilder zu finden) und der Ort der Begegnung hinzu, auf etwa hundert Meter gerundet.',
        'Unter 18 Jahren wird über die Veröffentlichung eines Fotos mit einem Elternteil entschieden, mit Zustimmung beider Eltern (oder des Elternteils, der das Sorgerecht allein ausübt). Auf der Seite wie auf unserem Handy fragen wir nur nach Ihrer Altersgruppe (nie nach Ihrem Geburtsdatum), wenn Sie einer Veröffentlichung zustimmen, und auch, wenn Sie das Foto erhalten möchten (auf unserem Handy, sobald Sie uns eine Adresse hinterlassen). Unter 18 wird Ihre Einwilligung nur mit dem Namen eines Elternteils gespeichert, der sie mit Ihnen gibt (auf unserem Handy unterschreibt er mit Ihnen); widerspricht sie dem, was wir notiert haben (Ihrem Alter oder Ihrem Elternteil), wartet sie auf unsere Prüfung. Eine Ablehnung dagegen können Sie allein aussprechen.',
        'Unter 15 fragen die Seite und unser Handy, damit Sie das Foto erhalten oder einer Veröffentlichung zustimmen, nach der E-Mail-Adresse eines Elternteils statt nach Ihrer: Das Foto, die Zusammenfassung Ihrer Einwilligung und unsere Antworten gehen an diese Adresse, Ihre eigene Adresse wird nicht gespeichert. Adresse und Name des Elternteils werden verschlüsselt und wie der Rest der Anfrage gleich lange aufbewahrt.',
        'Ihre Einwilligung gilt für die Fotos, die der Fotograf an diesem Tag gemacht hat (der Ausflug; ist der Tag geteilt, der Teil des Tages, an dem Sie sich begegnet sind); Ihre Ablehnung gilt für die Fotos, auf denen Sie zu sehen sind.',
        'Rechtsgrundlage: Ihre Einwilligung, die Sie jederzeit auf derselben Seite ohne Begründung widerrufen können.',
        'Wir schicken Ihnen nur, was Sie angefragt haben: Ihr Foto, eine Antwort, eine Zusammenfassung Ihrer Einwilligung.',
      ]],
      ['„Gefällt mir“, Teilen und Meldungen', [
        'Die Schaltfläche „Gefällt mir“ unter einem Foto ist anonym: kein Konto, kein Cookie. Ihr Browser merkt sich das Foto (lokaler Speicher auf Ihrem Gerät); unser Server behält nur einige Stunden im Arbeitsspeicher, dass Ihre IP-Adresse dieses Foto mag, um Doppelungen zu vermeiden, und speichert sie nie.',
        'Die Schaltfläche „Teilen“ öffnet das Teilen-Menü Ihres Telefons oder einfache Links zu WhatsApp, Facebook, Bluesky, X, Pinterest oder Ihrem E-Mail-Programm: kein Skript dieser Dienste wird auf unserer Website geladen, und nichts wird übertragen, bevor Sie wählen. Wir zählen nur die Anzahl der Teilungen pro Foto und Kanal und Tag, ohne etwas über Sie zu speichern.',
        'Der Link „Melden“ schickt uns Ihre Nachricht und, wenn Sie möchten, Ihre E-Mail-Adresse für eine Antwort: Sie dienen nur der Bearbeitung der Meldung und werden nach 12 Monaten gelöscht.',
      ]],
      ['Kontakt und Lizenzanfragen', [
        `Über die Seite ${host}/contact oder über „Lizenz anfragen“ unter einem Foto (${host}/droits/demande) senden Sie uns Ihren Namen, Ihre E-Mail-Adresse und Ihre Nachricht; für eine Lizenz außerdem das betreffende Foto, die geplante Nutzung, die Verbreitung und, wenn Sie möchten, Ihre Firma oder Ihr Medium.`,
        'Sie dienen nur dazu, Ihnen zu antworten und Ihnen für eine Lizenz Bedingungen anzubieten. Rechtsgrundlage: Ihre Anfrage, die wir beantworten (vorvertragliche Maßnahmen für eine Lizenz), und unser berechtigtes Interesse, denen zu antworten, die uns schreiben (DSGVO, Art. 6 Abs. 1 lit. b und f).',
        'Nur der Fotograf, an den Sie schreiben (der Fotograf des Fotos bei einer Lizenz; wir beide, wenn Sie an beide schreiben), und der Administrator der Website lesen sie; jedes Lesen wird protokolliert. Wir senden Ihnen keine automatische E-Mail: nur unsere Antwort. Der Fotograf wird per E-Mail benachrichtigt, die nichts aus Ihrer Nachricht enthält.',
        `Ihre Nachricht, Ihr Name und Ihre Adresse werden ${fields ? 'in unserer Datenbank verschlüsselt und ' : ''}12 Monate nach dem Senden gelöscht; Sie können uns bitten, sie früher zu löschen.`,
      ]],
      ['Beratende Abstimmung in Ausstellungen', [
        'Eine Ausstellung kann eine Abstimmung über vom Team ausgewählte und bestätigte Fotografien anbieten. Jeder Browser kann einmal für jede Fotografie stimmen. Kein Ergebnis veröffentlicht automatisch ein Werk in der ständigen Sammlung; die Werkstatt zeigt nur Gesamtzahlen, die den Besuchern nicht angezeigt werden.',
        VOTE_UI.de.notice, VOTE_UI.de.free, VOTE_UI.de.retention, VOTE_UI.de.rights, VOTE_UI.de.limit,
        'Rechtsgrundlage: Ihre Einwilligung (DSGVO, Art. 6 Abs. 1 lit. a), die bei der ersten Stimme über ein nicht angekreuztes Feld eingeholt und unter „Meine Stimmen“ widerrufen werden kann. Das Abstimmungs-Cookie ist freiwillig und von den unten genannten funktionalen Cookies getrennt; hierfür wird keine Einwilligungsbefreiung beansprucht. Ohne dieses Cookie können wir Ihre einzelnen Stimmen nicht wiederfinden und verlangen dafür keine zusätzlichen Identitätsangaben.',
        'Die Abstimmung speichert weder Ihre IP-Adresse noch technische Merkmale Ihres Browsers. Die technische Begrenzung der Formulare nutzt das Netz vorübergehend im Arbeitsspeicher, wie bei anderen Formularen der Website; abgelehnte Herkunft, ungültige Formularnachweise, Fallen und Anfragenserien können dem unten beschriebenen Sicherheitsprotokoll gemeldet werden. Weder Cookie, Index noch einzelne Stimmzettel werden dorthin kopiert.',
      ]],
      ['Private Galerien', [
        'Wir können ausgewählten Personen Fotos in einer privaten Galerie zeigen: Jede erhält von uns einen persönlichen Link und auf anderem Weg ein Passwort. Dazu speichern wir den Namen der eingeladenen Person (verschlüsselt, nur für uns sichtbar), die Sprache und die Dauer ihres Zugangs sowie einen Fingerabdruck des Links und des Passworts (nie den Link oder das Passwort selbst).',
        'Wenn Sie eine private Galerie öffnen, speichern wir die Daten Ihrer Besuche, abgelehnte Passwörter, Ihre Favoriten, die Auswahl, die Sie uns senden, und Ihre Downloads, mit dem Netz, aus dem Sie kommen (Ihre gekürzte IP-Adresse), und dem von Cloudflare geschätzten Land; nie Ihren Browser. So wissen wir, ob die Fotos angekommen sind, und schützen die Galerie vor einem an andere weitergegebenen Link.',
        'Ein notwendiges Cookie hält die Galerie in Ihrem Browser geöffnet: 12 Stunden ohne Besuch und höchstens 7 Tage, oder 30 Tage, wenn Sie „Auf diesem Gerät angemeldet bleiben“ ankreuzen; nie über das Ende Ihres Zugangs hinaus. „Galerie verlassen“ schließt sie sofort.',
        ...(securityLog ? ['Das Sicherheitsprotokoll (siehe unten) erhält für jedes akzeptierte Passwort nur das Netz und das Land; für ein abgelehntes Passwort, einen unbekannten Link oder einen nach dem Widerruf versuchten Zugang die vollständige IP-Adresse. Nie Ihren Namen, den Link oder das Passwort.'] : []),
        ...(securityLog ? ['Wenn unser Sicherheitssystem Ihren Zugang sperrt, speichern wir dessen Nummer und die Daten der Entscheidung bis zu ihrem Ablauf, um die Umsetzung nachzuverfolgen und eine Entsperrung durch unser Team zu respektieren. Dieser Nachweis wird bei der nächsten stündlichen Bereinigung nach Ablauf gelöscht, oder sobald Ihr Zugang oder das Sicherheitssystem entfernt wird. Sie können eine Kopie anfordern.'] : []),
        'Alles, was einen Zugang betrifft, wird sechs Monate nach seinem Ende (Ablauf oder Widerruf) gelöscht; Sie können eine frühere Löschung verlangen. Rechtsgrundlage: die Erfüllung des Vertrags bei einem beauftragten Shooting, unser berechtigtes Interesse bei anderen Gästen und für die Sicherheit der Galerie (DSGVO, Art. 6 Abs. 1 lit. b und f).',
      ]],
      ['Wie lange', [
        'Anfrage ohne Einwilligung oder Ablehnung: nach 12 Monaten ohne Nachricht gelöscht.',
        'Über die Kontaktseite gesendete Nachricht oder Lizenzanfrage: 12 Monate nach dem Senden gelöscht.',
        'Foto von Ihnen zu Ihrer Einwilligung: zusammen mit der Einwilligung aufbewahrt; ohne Einwilligung nach 6 Monaten gelöscht (wenn Sie nach einer Einwilligung ablehnen: 6 Monate nach Ihrer Ablehnung).',
        'Einwilligung oder Ablehnung (mit der Unterschrift): so lange aufbewahrt, wie ein Foto von Ihnen bei uns existiert, danach 5 Jahre ab dem Löschen des letzten, solange rechtliche Schritte möglich sind.',
        'Ihre Altersgruppe (18 oder älter, unter 18, unter 15), Name und unter 15 die Adresse Ihres Elternteils: mit der Anfrage oder Einwilligung, zu der sie gehören, gleich lange.',
        'Privater Link zum Herunterladen Ihres Fotos: 30 Tage gültig, einen Monat danach gelöscht.',
        'Sicherungen: Die Datenbank wird täglich gesichert, jede Sicherung wird nach 14 Tagen gelöscht; ein von uns gelöschtes Foto verschwindet nach 90 Tagen aus unseren Sicherungen.',
      ]],
      ['Wer Ihre Daten erhält', [
        'Wir beide und die Personen, die wir mit der Moderation oder dem Korrekturlesen der Fotos betrauen (jede mit eigenem Konto): Sie sehen die Fotos, nie Ihre Kontaktdaten, Ihre Unterschrift, Ihre Einwilligung oder die Nachrichten, die Sie uns senden. Wir verkaufen oder übermitteln keine Daten.',
        'Cloudflare leitet die Verbindungen zu unserem Server (und sorgt für die HTTPS-Verschlüsselung); es handelt in unserem Auftrag, nach seinen Datenschutzbedingungen, mit abgesicherten Übermittlungen außerhalb der Europäischen Union (Data Privacy Framework und Standardvertragsklauseln).',
        'Instagram (Meta) erhält ein Foto nur, wenn Sie dieser Nutzung zugestimmt haben, die auch die Website voraussetzt. Wenn Sie Instagram ablehnen, wird kein Foto dieses Tages, auf dem Sie zu sehen sein könnten, dorthin gesendet.',
        'Wenn wir Ihnen eine E-Mail schreiben, läuft sie über unseren E-Mail-Anbieter.',
      ]],
      ['Reichweitenmessung und Cookies', [
        'Die Website zählt ihre Besuche anonym, ohne Cookies und ohne externe Dienste: Es werden weder IP-Adressen noch Kennungen gespeichert, die Zähler werden nach 25 Monaten gelöscht.',
        'Ein Cookie der öffentlichen Website speichert die Sprache, die Sie mit der Sprachauswahl wählen; ein weiteres, nur wenn Sie eine private Galerie mit ihrem Passwort öffnen, hält die Galerie in Ihrem Browser geöffnet (siehe „Private Galerien“); ein drittes zeigt Ihnen nach dem Senden der Seite /bonjour auf der Dankesseite einmal eine Übersicht Ihrer Wahl (es enthält nur eine Zufallszahl; die Übersicht bleibt auf unserem Server, im Arbeitsspeicher, ohne gespeichert zu werden, enthält weder Ihren Namen noch Ihre Adresse und wird gelöscht, sobald sie angezeigt wurde, spätestens nach 15 Minuten). Alle drei sind für den von Ihnen gewünschten Dienst notwendig. Unsere technischen Protokolle dienen der Sicherheit und enthalten nur gekürzte IP-Adressen.',
        ...(securityLog ? ['Sicherheitsprotokoll: Wenn eine Anfrage bösartig erscheint (Einbruchsversuch, manipulierte Eingabe, Anfragen in schneller Folge, serienweise abgefragte nicht vorhandene Links) und bei jeder Anmeldung im Verwaltungsbereich speichern wir die vollständige IP-Adresse, die von Cloudflare geschätzte Stadt und das Land, den Browsertyp und die aufgerufene Seite in einem von der Website getrennten Protokoll, das nur wir einsehen können. Ein gewöhnlicher Besuch hinterlässt dort in der Regel nichts; ein einzelner Fehler (falsch eingegebener Link, nach der Abmeldung offen gelassene Seite) kann eine Zeile hinterlassen. Auch das Lesen und Exportieren personenbezogener Daten im Verwaltungsbereich wird protokolliert: Datenkategorien, Anzahl angezeigter Objekte, Entschlüsselungsvorgänge und Antwortgröße, dem Konto und seiner Sitzung zugeordnet. Dabei werden keine Namen, E-Mail-Adressen, Nachrichten, Unterschriften oder Datensatzinhalte in diese Angaben kopiert. Dieses Protokoll wird nach 6 Monaten gelöscht. Rechtsgrundlage: unser berechtigtes Interesse am Schutz der Website und der darin enthaltenen Daten (DSGVO, Art. 6 Abs. 1 lit. f und Art. 32).'] : []),
        ...(securityLog && edge ? ['Dieses Protokoll wird durch einen Filter ergänzt, den wir bei Cloudflare betreiben, das die Website bereits ausliefert: Für jede aufgerufene Seite (ohne Bilder) erfasst Cloudflare für uns die IP-Adresse, den Netzbetreiber, das Land, einen technischen Fingerabdruck der verschlüsselten Verbindung (nie deren Inhalt) und den Antwortcode, ohne die genaue Seitenadresse. Unser Sicherheitsprotokoll liest diese Aufzeichnungen jede Minute; Cloudflare löscht sie spätestens nach 3 Monaten. Dieser Filter sperrt außerdem, noch vor der Website, die von uns gesperrten Adressen.'] : []),
      ]],
      ['Sicherheit', [
        `Zugang nur für uns beide und die Personen, die wir dazu berechtigen, jede mit eigenem Konto${mfa ? ', mit Zwei-Faktor-Authentifizierung' : ''}; verschlüsselte Verbindungen (HTTPS); Unterschriften, Erinnerungsfotos und unterschriebene Karten nur für uns beide sichtbar; Daten ${encrypted ? 'auf einer verschlüsselten Festplatte gespeichert und ' : ''}täglich auf einer anderen Festplatte gesichert${fields ? '; Ihr Name, Ihre Adresse, Ihr Alter, Name und Adresse Ihres Elternteils, Ihre Unterschrift und Ihre Nachrichten sind zusätzlich in unserer Datenbank verschlüsselt, mit einem separat aufbewahrten Schlüssel' : ''}.`,
      ]],
      ['Ihre Rechte', [
        `Sie können jederzeit Auskunft über Ihre Daten verlangen (wir schicken Ihnen eine vollständige Kopie), sie berichtigen oder löschen lassen (auf Wunsch einschließlich der Fotos), der Nutzung widersprechen oder Ihre Einwilligung widerrufen: auf der Seite ${host}/bonjour, Abschnitt „Ihre Daten“ (mit der Referenz Ihrer Karte, falls vorhanden), oder unter ${contact}. Wir antworten innerhalb eines Monats.`,
        'Wenn Sie meinen, dass Ihre Rechte nicht gewahrt werden, können Sie sich bei der CNIL, der französischen Datenschutzbehörde (www.cnil.fr/plaintes), oder bei der Aufsichtsbehörde Ihres Landes beschweren.',
      ]],
    ],
  },
};
