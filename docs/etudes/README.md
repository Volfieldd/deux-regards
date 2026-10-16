# Études

Études préalables : elles décrivent ce qui pourrait être fait, avec les sources, avant toute ligne de code. Rien de ce qui est décrit ici n'est développé tant que `PLAN.md` ne le marque pas « fait ».

| Document | Contenu |
|---|---|
| [`blog-galeries-boutique.md`](blog-galeries-boutique.md) | Étude principale (15 octobre 2026, relue le 16 octobre 2026) : carnet (blog), photos et galeries privées (lien temporaire et mot de passe, équipe par Zitadel), boutique de tirages, paiement, facturation et comptabilité, cadre juridique et fiscal, architecture dans le code, plan en phases 34 à 46 (37 et 41 coupées en deux lots), coûts, risques, décisions et questions pour l'expert-comptable, l'URSSAF et un juriste. Se lit seul. |
| [`annexe-cadre-juridique-fiscal.md`](annexe-cadre-juridique-fiscal.md) | Détail sourcé : qui vend (trois montages), statut social par produit, TVA (franchise des auteurs, taux, UE, hors UE), factures, facturation électronique et e-reporting, droit de la consommation (rétractation en ligne depuis le 19/06/2026), accessibilité, logiciel de caisse, RGPD, droit d'auteur, tableau des obligations par scénario. |
| [`annexe-paiement-facturation.md`](annexe-paiement-facturation.md) | Comparatif des prestataires de paiement (frais, versements, webhooks, Wero), intégration de Stripe Checkout (séquences, états, webhook, rapprochement, remboursements, litiges, secrets), outils de facturation et plateformes agréées, SQL du catalogue, des commandes, des paiements et des factures, écrans de comptabilité, tests. |
| [`annexe-galeries-privees-securite.md`](annexe-galeries-privees-securite.md) | Modèle de menace (M1 à M20) et conception de sécurité des espaces privés : jeton, mot de passe et scrypt, limitation des essais, session et cookie, en-têtes, cache Cloudflare, indexation, journaux, SQL, routes, tests T1 à T35. |

Conventions communes : sources numérotées `[n]` identiques dans les quatre documents, consultées le 15 octobre 2026 (les sources [302] à [314] et les mentions « relu le 16/10/2026 » l'ont été le 16 octobre 2026, lors de la contre-vérification juridique et de la revue de conception) ; niveaux **O** (obligatoire, texte cité), **I** (impératif : règle du projet ou sécurité), **R** (recommandé), **C** (choix des auteurs) ; « à confirmer » quand un point n'a pas pu être vérifié.
