// Faux processus de calcul des descriptions (même protocole que server/describe-worker.js), pour les tests :
//   ok      : répond « A fake caption (n octets). » ;
//   lent    : calcule 1,5 s sans rendre la main (comme ONNX Runtime), puis répond ;
//   charge  : le modèle ne se charge pas ;
//   plante  : s'arrête net pendant le calcul (comme tué par le noyau, faute de mémoire) ;
//   bloque  : commence le calcul et ne répond jamais.
const mode = process.argv[2] || 'ok';
process.on('message', ({ id, jpeg, key }) => {
  if (mode === 'charge') { process.send({ id, error: 'Could not locate file: onnx/vision_encoder_quantized.onnx', model: true }); return; }
  process.send({ id, phase: 'calcul' });
  if (mode === 'plante') { process.kill(process.pid, 'SIGKILL'); return; }
  if (mode === 'bloque') return;
  if (mode === 'lent') { const end = Date.now() + 1500; while (Date.now() < end) { /* calcul */ } }
  process.send({ id, text: `A fake caption (${key}, ${jpeg.length} octets).` });
});
process.on('disconnect', () => process.exit(0));
