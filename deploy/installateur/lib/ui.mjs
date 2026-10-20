// Interface du terminal de l'installateur : questions avec valeur par défaut et contrôle, saisie masquée des secrets,
// oui/non, menus, listes de contrôle et journal des étapes. Sans dépendance ; les tests lui passent des flux scriptés.
import readline from 'node:readline';

const CODES = { gras: 1, pale: 2, rouge: 31, vert: 32, jaune: 33, bleu: 34, cyan: 36 };

export class Interruption extends Error {
  constructor() { super('Interrompu.'); this.name = 'Interruption'; }
}

export function creerUI({ entree = process.stdin, sortie = process.stdout, couleurs } = {}) {
  const tty = Boolean(sortie.isTTY);
  const avecCouleurs = couleurs ?? (tty && !process.env.NO_COLOR);
  const teinte = (code, t) => (avecCouleurs ? `\x1b[${CODES[code]}m${t}\x1b[0m` : String(t));
  const c = Object.fromEntries(Object.keys(CODES).map(k => [k, t => teinte(k, t)]));

  // Un seul readline pour toute la session : les lignes tapées d'avance (ou scriptées) ne se perdent pas.
  let masque = false;
  const rl = readline.createInterface({ input: entree, output: sortie, terminal: Boolean(entree.isTTY && tty) });
  // Saisie masquée : readline n'écrit que l'invite suivie de la ligne, ou les caractères insérés ; on n'affiche que des
  // étoiles à leur place (la longueur seule, pour voir qu'un collage a pris).
  const ecrireOrigine = rl._writeToOutput.bind(rl);
  rl._writeToOutput = texte => {
    if (masque && texte !== '\r\n' && texte !== '\n') {
      const invite = rl.getPrompt();
      const debut = texte.startsWith(invite) ? invite : '';
      texte = debut + '*'.repeat([...texte.slice(debut.length)].length);
    }
    ecrireOrigine(texte);
  };
  const lignes = [];
  const attentes = [];
  let ferme = false;
  rl.on('line', l => { const a = attentes.shift(); if (a) a.resoudre(l); else lignes.push(l); });
  rl.on('close', () => { ferme = true; for (const a of attentes.splice(0)) a.rejeter(new Interruption()); });
  rl.on('SIGINT', () => { sortie.write('\n'); rl.close(); });

  // Hors terminal (réponses scriptées), readline n'affiche pas ce qui est lu : on l'écrit (jamais un secret).
  const recu = l => { if (!rl.terminal) sortie.write(masque ? '\n' : `${l}\n`); return l; };
  function lireLigne(invite) {
    rl.setPrompt(invite);
    rl.prompt(true);
    if (lignes.length) return Promise.resolve(recu(lignes.shift()));
    if (ferme) return Promise.reject(new Interruption());
    return new Promise((resoudre, rejeter) => attentes.push({ resoudre: l => resoudre(recu(l)), rejeter }));
  }

  const ui = {
    c,
    ecrire: (t = '') => sortie.write(`${t}\n`),
    titre(t) { sortie.write(`\n${c.gras(c.bleu(`━━ ${t} `))}${c.bleu('━'.repeat(Math.max(3, 60 - t.length)))}\n\n`); },
    note: t => sortie.write(`${c.pale(t)}\n`),
    ok: t => sortie.write(`  ${c.vert('✔')} ${t}\n`),
    echec: t => sortie.write(`  ${c.rouge('✘')} ${t}\n`),
    alerte: t => sortie.write(`  ${c.jaune('⚠')} ${t}\n`),
    info: t => sortie.write(`  ${c.cyan('•')} ${t}\n`),
    etape: t => sortie.write(`  ${c.cyan('→')} ${t}\n`),

    // Question libre. `controle(valeur)` rend un message d'erreur, ou rien si la valeur convient.
    async question(libelle, { defaut = '', controle, aide } = {}) {
      if (aide) ui.note(`  ${aide}`);
      for (;;) {
        const brut = (await lireLigne(`${c.gras('?')} ${libelle}${defaut !== '' ? c.pale(` [${defaut}]`) : ''} : `)).trim();
        const valeur = brut === '' ? String(defaut) : brut;
        const erreur = controle ? await controle(valeur) : (valeur === '' ? 'Une valeur est attendue.' : null);
        if (!erreur) return valeur;
        ui.echec(erreur);
      }
    },

    // Secret : rien n'est affiché pendant la frappe, et la valeur n'est jamais réécrite.
    async secret(libelle, { controle, aide, facultatif = false } = {}) {
      if (aide) ui.note(`  ${aide}`);
      for (;;) {
        masque = true;
        let valeur;
        try { valeur = (await lireLigne(`${c.gras('?')} ${libelle} ${c.pale('(saisie masquée)')} : `)).trim(); } finally { masque = false; }
        if (valeur === '' && facultatif) return '';
        const erreur = valeur === '' ? 'Une valeur est attendue.' : controle ? await controle(valeur) : null;
        if (!erreur) return valeur;
        ui.echec(erreur);
      }
    },

    async ouiNon(libelle, { defaut = true } = {}) {
      for (;;) {
        const r = (await lireLigne(`${c.gras('?')} ${libelle} ${c.pale(defaut ? '[O/n]' : '[o/N]')} : `)).trim().toLowerCase();
        if (r === '') return defaut;
        if (['o', 'oui', 'y', 'yes'].includes(r)) return true;
        if (['n', 'non', 'no'].includes(r)) return false;
        ui.echec('Répondez o (oui) ou n (non).');
      }
    },

    // Menu numéroté : rend la `valeur` de l'option choisie.
    async choix(libelle, options, { defaut = 0 } = {}) {
      ui.ecrire(`${c.gras('?')} ${libelle}`);
      options.forEach((o, i) => ui.ecrire(`    ${c.cyan(`${i + 1})`)} ${o.libelle}${o.detail ? c.pale(` — ${o.detail}`) : ''}`));
      for (;;) {
        const r = (await lireLigne(`  Votre choix ${c.pale(`[${defaut + 1}]`)} : `)).trim();
        const n = r === '' ? defaut + 1 : Number(r);
        if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].valeur;
        ui.echec(`Un nombre entre 1 et ${options.length}.`);
      }
    },

    fermer() { rl.close(); },
  };
  return ui;
}
