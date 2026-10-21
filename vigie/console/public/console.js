/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Console de la Vigie : le seul script de la page (chargé avec defer ; le thème s'applique avant, par theme.js). Rien n'en
// dépend : sans lui, tout se lit et tout se fait (le menu du téléphone s'ouvre par #admin-nav, sans script).
//   - bouton « thème » du pied de la barre latérale : bascule clair / sombre, mémorisée dans ce navigateur ;
//   - rafraîchissement de la vue d'ensemble (#contenu[data-rafraichir]) : toutes les 60 s, une lecture qui ne prolonge pas
//     la session (en-tête x-vigie-rafraichir, le serveur ne touche pas à la dernière activité) ; la réponse est le contenu
//     seul. Au moindre doute (401, 403, redirection, autre chose que du HTML, erreur réseau), le rafraîchissement s'arrête
//     et le dit ; on recharge la page à la main.
// Aucun code évalué, aucun HTML écrit en texte dans la page : le contenu reçu est analysé par DOMParser (document inerte,
// aucun script exécuté) puis ses nœuds sont déplacés.
// Aucune animation (prefers-reduced-motion n'a rien à couper).
(function () {
  'use strict';
  var FINE = ' ';

  // ---------- Thème ----------
  var bouton = document.querySelector('[data-theme-bascule]');
  if (bouton) {
    bouton.addEventListener('click', function () {
      var d = document.documentElement;
      var actuel = d.getAttribute('data-theme') ||
        (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var suivant = actuel === 'light' ? 'dark' : 'light';
      d.setAttribute('data-theme', suivant);
      try { window.localStorage.setItem('vigie-theme', suivant); } catch (e) { /* non mémorisé : vaut pour cette page */ }
    });
  }

  // ---------- Rafraîchissement ----------
  var contenu = document.getElementById('contenu');
  if (!contenu || !contenu.hasAttribute('data-rafraichir') || !window.fetch || !window.DOMParser) return;
  var secondes = parseInt(contenu.getAttribute('data-rafraichir'), 10);
  var periode = (secondes >= 30 && secondes <= 600 ? secondes : 60) * 1000;
  var arrete = false;
  var minuterie = null;

  function planifier() { minuterie = window.setTimeout(rafraichir, periode); }

  // L'utilisateur est dans le contenu (focus sur un lien, texte sélectionné) : on ne lui retire pas la page sous les doigts.
  function occupe() {
    var a = document.activeElement;
    if (a && a !== contenu && contenu.contains(a)) return true;
    var s = window.getSelection && window.getSelection();
    return Boolean(s && !s.isCollapsed && s.anchorNode && contenu.contains(s.anchorNode));
  }

  function arreter() {
    if (arrete) return;
    arrete = true;
    window.clearTimeout(minuterie);
    var meta = contenu.querySelector('.ep-meta .js-seul');
    if (meta) meta.hidden = true;
    if (document.getElementById('rafraichir-arret')) return;
    var p = document.createElement('p');
    p.id = 'rafraichir-arret';
    p.className = 'note-a';
    p.setAttribute('role', 'status');
    p.textContent = 'Rafraîchissement arrêté' + FINE + ': rechargez la page.';
    var ep = contenu.querySelector('.ep');
    if (ep && ep.parentNode === contenu) ep.after(p); else contenu.prepend(p);
  }

  function rafraichir() {
    if (arrete) return;
    if (document.hidden || occupe()) { planifier(); return; }
    window.fetch(window.location.pathname, {
      headers: { 'x-vigie-rafraichir': '1' }, credentials: 'same-origin', redirect: 'manual', cache: 'no-store',
    }).then(function (r) {
      var type = r.headers.get('content-type') || '';
      if (r.type === 'opaqueredirect' || r.status !== 200 || type.indexOf('text/html') !== 0) throw new Error('réponse refusée');
      return r.text();
    }).then(function (html) {
      if (arrete) return;
      var doc = new window.DOMParser().parseFromString(html, 'text/html');
      // Une page entière (connexion, session expirée) n'est pas un contenu : on s'arrête plutôt que de l'imbriquer.
      if (doc.querySelector('#contenu, .shell, .hors, .side') || !doc.body.firstElementChild) throw new Error('pas un contenu');
      var noeuds = Array.prototype.slice.call(doc.body.childNodes).map(function (n) { return document.adoptNode(n); });
      contenu.replaceChildren.apply(contenu, noeuds);
      planifier();
    }).catch(arreter);
  }

  planifier();
})();
