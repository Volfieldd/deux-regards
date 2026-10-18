// Console de la Vigie : thème choisi, appliqué AVANT l'affichage (chargé sans defer dans <head>, sans rien d'autre).
// <html data-theme="light|dark"> si un choix est mémorisé ; sinon rien : la préférence du système (prefers-color-scheme).
// La classe « js » montre ce qui demande un script (.js-seul : bouton du thème, « actualisée chaque minute »).
(function () {
  var d = document.documentElement;
  d.classList.add('js');
  try {
    var t = window.localStorage.getItem('vigie-theme');
    if (t === 'light' || t === 'dark') d.setAttribute('data-theme', t);
  } catch (e) { /* stockage refusé : le thème du système */ }
})();
