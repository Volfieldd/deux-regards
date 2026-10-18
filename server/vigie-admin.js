// La Vigie dans l'admin du site (maquette MV-10 ; annexe architecture, § 4.3 et § 5.1) : pour les seuls comptes
// securite.voir, quand la Vigie est réglée côté site, l'entrée « Sécurité » de la barre latérale (lien vers la console
// dans un nouvel onglet, avec son badge), une ligne de « Aujourd'hui » et le bandeau d'une alerte critique qui attend sa
// prise en charge. Tout vient du résumé signé que le site lit chaque minute (server/securite/decisions.js) : des nombres
// par gravité, une heure, le numéro de l'alerte en tête ; ni titre de règle, ni adresse, ni compte (un attaquant devenu
// administrateur du site n'apprend pas ce qui l'a vu). Résumé indisponible (plus de 5 minutes, ou jamais reçu) : le
// dernier état connu, daté, et depuis quand l'admin ne sait plus ; jamais un faux « aucune alerte ».
// L'adresse de la console est celle réglée côté site (VIGIE_CONSOLE_URL), jamais celle que porte le résumé.

const TZ = 'Europe/Paris';
const PARTS = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const partsOf = ms => Object.fromEntries(PARTS.formatToParts(ms).map(p => [p.type, p.value]));

export function createVigieAdmin({ decisions, consoleUrl, startedAt = Date.now() }) {
  const home = `${consoleUrl}/`;
  // t : traducteur de l'admin (request.t). now : l'heure de l'affichage.
  return function view(t, now = Date.now()) {
    const today = partsOf(now);
    const hour = ms => { const p = partsOf(ms); return t.lang === 'fr' ? `${Number(p.hour)} h ${p.minute}` : t.lang === 'de' ? `${p.hour}:${p.minute} Uhr` : `${p.hour}:${p.minute}`; };
    const sameDay = ms => { const p = partsOf(ms); return p.year === today.year && p.month === today.month && p.day === today.day; };
    const day = ms => new Intl.DateTimeFormat(t.locale, { timeZone: TZ, day: 'numeric', month: 'short' }).format(ms);
    // « 14 h 10 » (ou « 17 oct., 14 h 10 » un autre jour) ; « à 14 h 10 » (ou « le 17 oct. à 14 h 10 »).
    const since = ms => (sameDay(ms) ? hour(ms) : t('{d}, {h}', { d: day(ms), h: hour(ms) }));
    const at = ms => (sameDay(ms) ? t('à {h}', { h: hour(ms) }) : t('le {d} à {h}', { d: day(ms), h: hour(ms) }));

    const fresh = decisions.summary;                   // lu il y a moins de 5 minutes, sinon null
    const s = fresh || decisions.lastSummary;          // dernier état connu, même périmé
    const stale = !fresh;
    const down = stale ? (decisions.summaryFailedAt ?? (s ? s.recu_a + 60e3 : startedAt)) : null;
    const o = s ? s.ouvertes : { critique: 0, haut: 0, moyen: 0, bas: 0 };
    const high = o.critique + o.haut, low = o.moyen + o.bas;
    const worst = s?.plus_grave || null;
    const href = worst ? `${consoleUrl}/alertes/${worst.id}` : home;
    const action = worst ? t('Ouvrir l’alerte #{id}', { id: worst.id }) : t('Ouvrir la Vigie');

    // « 2 alertes critiques, 1 haute et 1 moyenne » : la gravité la plus haute porte le nom, les suivantes l'adjectif.
    const alerts = () => {
      const parts = [];
      const add = (n, first, next) => { if (n) parts.push(parts.length ? next(n) : first(n)); };
      add(o.critique, n => (n > 1 ? t('{n} alertes critiques', { n }) : t('{n} alerte critique', { n })), n => (n > 1 ? t('{n} critiques', { n }) : t('{n} critique', { n })));
      add(o.haut, n => (n > 1 ? t('{n} alertes hautes', { n }) : t('{n} alerte haute', { n })), n => (n > 1 ? t('{n} hautes', { n }) : t('{n} haute', { n })));
      add(o.moyen, n => (n > 1 ? t('{n} alertes moyennes', { n }) : t('{n} alerte moyenne', { n })), n => (n > 1 ? t('{n} moyennes', { n }) : t('{n} moyenne', { n })));
      add(o.bas, n => (n > 1 ? t('{n} alertes basses', { n }) : t('{n} alerte basse', { n })), n => (n > 1 ? t('{n} basses', { n }) : t('{n} basse', { n })));
      return parts.length > 1 ? t('{list} et {last}', { list: parts.slice(0, -1).join(', '), last: parts.at(-1) }) : parts[0];
    };

    // Badge de l'entrée : ▲ et le nombre des hautes et critiques ; le nombre seul pour moyennes et basses ; ▲ seul
    // quand le résumé manque ; rien quand aucune alerte n'est ouverte.
    let badge = null;
    if (stale) badge = { text: '▲', attention: true, sr: t('résumé indisponible depuis {when}', { when: since(down) }) };
    else if (high) badge = { text: `▲ ${high}`, attention: true, sr: high > 1 ? t('{n} alertes hautes ou critiques ouvertes', { n: high }) : t('1 alerte haute ou critique ouverte') };
    else if (low) badge = { text: String(low), attention: false, sr: low > 1 ? t('{n} alertes ouvertes', { n: low }) : t('1 alerte ouverte') };

    // Ligne de « Aujourd'hui » : urgent pour haute et critique, bientôt pour moyenne ou pour un résumé indisponible.
    let task = null;
    const relay = t('la Vigie, elle, envoie toujours ses alertes par Signal ou par e-mail');
    if (!stale && high + low) {
      let detail = worst?.depuis ? (worst.gravite === 'critique' ? (o.critique > 1 ? t('la dernière critique ouverte {when}', { when: at(worst.depuis) }) : t('critique ouverte {when}', { when: at(worst.depuis) })) : t('la plus grave ouverte {when}', { when: at(worst.depuis) })) : '';
      if (s.critique_a_prendre) detail = detail ? t('{a} ; une au moins n’est pas prise en charge', { a: detail }) : t('une critique au moins n’est pas prise en charge');
      task = { level: high ? 'urgent' : o.moyen ? 'bientot' : 'plus-tard', title: t('Sécurité : {alerts} dans la Vigie', { alerts: alerts() }), detail, href, action };
    } else if (stale && s && high + low) {
      task = { level: high ? 'urgent' : 'bientot', title: t('Sécurité : au dernier résumé ({h}), {alerts} dans la Vigie', { h: since(s.recu_a), alerts: alerts() }),
        detail: t('résumé de la Vigie indisponible depuis {when} : l’admin ne sait plus où elles en sont ; {relay}', { when: since(down), relay }), href, action };
    } else if (stale) {
      task = { level: 'bientot', title: t('Sécurité : résumé de la Vigie indisponible depuis {when}', { when: since(down) }),
        detail: s ? t('dernier résumé reçu {when}, sans alerte ouverte ; l’admin ne peut plus le confirmer', { when: at(s.recu_a) }) : t('aucun résumé reçu depuis le démarrage du site ; {relay}', { relay }),
        href: home, action: t('Ouvrir la Vigie') };
    }
    if (task) task.external = true;

    // Bandeau : une critique ouverte sans intervenant (critique_a_prendre). Résumé indisponible : il reste, daté.
    let banner = null;
    if (s?.critique_a_prendre) {
      const n = Math.max(1, o.critique);
      let title = n > 1 ? t('{n} alertes critiques dans la Vigie', { n }) : t('1 alerte critique dans la Vigie');
      if (worst?.gravite === 'critique' && worst.depuis) title = n > 1 ? t('{a} · la dernière ouverte {when}', { a: title, when: at(worst.depuis) }) : t('{a} · ouverte {when}', { a: title, when: at(worst.depuis) });
      banner = stale
        ? { title: t('Au dernier résumé, {h} : {a}', { h: since(s.recu_a), a: title }), detail: t('Résumé de la Vigie indisponible depuis {when} : l’admin ne peut plus le confirmer.', { when: since(down) }), href, action }
        : { title, detail: t('Une au moins attend sa prise en charge ; ce bandeau reste tant qu’une critique attend.'), href, action };
    }
    return { href: home, badge, task, banner };
  };
}
