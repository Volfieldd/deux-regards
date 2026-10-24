# Références et méthode de qualification

Sources officielles consultées le **24 octobre 2026**. Les conclusions du dossier appliquent ces références au code identifié ; elles ne valent pas validation de la CNIL ni vérification de la production.

| Référence | Source primaire | Utilisation dans le dossier |
|---|---|---|
| R01 | [Article 82 de la loi Informatique et Libertés](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037813978) | Opérations du terminal et exceptions ; indépendant du chiffrement ou du caractère personnel de l’information |
| R02 | [Lignes directrices CNIL du 17 septembre 2020](https://www.cnil.fr/sites/cnil/files/atoms/files/lignes_directrices_de_la_cnil_sur_les_cookies_et_autres_traceurs.pdf), § 46–52 | Finalités exemptées, usage exclusif, authentification, personnalisation et audience |
| R03 | [Recommandation CNIL consolidée du 16 janvier 2026](https://www.cnil.fr/sites/default/files/2026-01/recommandation_cookies_consolidee.pdf), § 5 | Transparence recommandée pour les usages exemptés et repères de durée d’audience ; pas une durée universelle |
| R04 | [FAQ CNIL, état du 29 avril 2026](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ), questions 7–18 | Intranet/extranet, anonymisation, sécurité, prestataires et information |
| R05 | [CNIL, solutions de mesure d’audience](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience) | Conditions, portée de l’auto-évaluation, absence de certification et vérification de la configuration |
| R06 | [Grille officielle d’auto-évaluation, juillet 2025](https://www.cnil.fr/sites/default/files/2025-07/outil_d_auto-evaluation_mesure_d_audience.pdf), p. 2–4 et annexe | Pointage du mécanisme interne Nicephos ; mesures recommandées et alternatives à démontrer |
| R07 | [RGPD, chapitre II](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2), art. 5–7 | Finalités, minimisation, conservation, base légale et conditions du consentement |
| R08 | [RGPD, chapitre III](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3), art. 12–22 | Information et exercice des droits, notamment opposition lorsqu’elle est applicable |
| R09 | [RGPD, chapitre IV](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4), art. 24–35 | Responsabilité, conception, sous-traitance, registre, sécurité et examen des risques |
| R10 | [CNIL, intérêt légitime](https://www.cnil.fr/fr/les-bases-legales/interet-legitime) | Examen de l’intérêt poursuivi, de la nécessité et de l’équilibre avec les droits des personnes |
| R11 | [RGPD, chapitre V](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre5) | Garanties des transferts à vérifier pour les services réellement utilisés |
| R12 | [Documentation officielle des cookies Cloudflare](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/) | Exemples dépendant des services activés ; aucune preuve de leur présence sur Nicephos |
| R13 | [Cloudflare, Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/), état du 12 septembre 2025, §§ 2.5–2.6 et 6.1 | Services gratuits, données réseau et incorporation du DPA ; rattachement au compte à établir |
| R14 | [Cloudflare, DPA version 6.4 du 3 avril 2026](https://www.cloudflare.com/cloudflare-customer-dpa/) | Traitement pour le client, sous-traitance et transferts ; ne prouve pas une résidence européenne |
| R15 | [Cloudflare, sous-traitants](https://www.cloudflare.com/gdpr/subprocessors/) | Liste officielle à rapprocher des services utilisés et de leurs garanties |
| R16 | [Cloudflare, Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/) | Produit gratuit, activation et limites ; aucune activation Nicephos présumée |
| R17 | [Cloudflare, RUM beacon](https://developers.cloudflare.com/speed/observatory/rum-beacon/), état du 5 octobre 2026 | Comportement Free annoncé, exclusion géographique, injection et traitement ; réglages réels à relever |
| R18 | [Cloudflare Access, offres](https://www.cloudflare.com/sase/products/access/) | Existence d’une offre gratuite ; ne prouve pas son utilisation sur un domaine |
| R19 | [Cloudflare Access, cookies](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/) | Attributs et options de sécurité à relever, compatibilités à préserver |
| R20 | [Zitadel, TOS](https://zitadel.com/docs/legal/terms-of-service), état du 15 novembre 2023 | Formation du contrat Cloud, annexes et plans gratuits ; version du compte à confirmer |
| R21 | [Zitadel, DPA](https://zitadel.com/docs/legal/data-processing-agreement), état du 8 mai 2025 | Portée du rôle de sous-traitant, optimisation et transferts ; application effective à vérifier |
| R22 | [Zitadel, entités contractantes](https://help.zitadel.com/corporate-structure-contracting-entities), 25 juin 2026 | Aide désignant CAOS AG pour Cloud self-service, sans preuve de la région des données |
| R23 | [Zitadel Customer Portal, Instances](https://help.zitadel.com/customer-portal-instances), 7 mai 2026 | Région affichée, limites Free et choix spécifique décrit comme fonction Pro |
| R24 | [Zitadel Cloud et auto-hébergement](https://zitadel.com/docs/legal/service-description/cloud-service-description), état du 5 avril 2024 | Responsabilités distinctes, localisation et limites de transit ; description générale à rapprocher du tier réel |
| R25 | [Zitadel, sous-traitants](https://zitadel.com/docs/legal/subprocessors), état du 5 décembre 2025 | Accès à la liste du Trust Center et services à rapprocher de l’instance réelle |

R13–R25 ont été ajoutées après la déclaration du propriétaire « Cloudflare gratuit, Zitadel gratuit ». Les pages commerciales, contractuelles et d’aide ont des dates différentes : aucune fonctionnalité ou garantie n’est attribuée au compte sans vérifier sa configuration et les conditions applicables. Ces sources ne démontrent ni publicité imposée par la gratuité, ni nécessité générale d’un abonnement payant pour être conforme.

## Statut des conclusions

- **Exemption étayée dans son principe** : catégorie juridique et fonction identifiables ; des conditions d’exploitation, de sécurité ou de durée peuvent rester ouvertes. Ce statut ne clôt pas une conformité globale.
- **Justification à compléter** : nécessité, usage ou proportionnalité encore insuffisamment démontrés. Cela n’est pas un constat automatique d’illégalité.
- **Hors article 82 pour l’état serveur seul** : pas de dépôt/lecture du terminal attribué à cet état ; le RGPD reste à examiner s’il existe des données personnelles. Un cookie permettant d’y accéder est qualifié séparément.
- **Non vérifié en exploitation** : configuration ou contrat absent des preuves autorisées ; ni présence ni absence déduite du dépôt.

Dans l’auto-évaluation d’audience, « écart à une mesure recommandée » ne signifie pas à lui seul « violation certaine ». Une alternative doit toutefois être expliquée et démontrée ; son existence supposée ne permet pas de marquer le critère respecté.

## Séparer quatre décisions

1. Qualification de l’opération du terminal au titre de l’article 82.
2. Base légale et garanties d’un éventuel traitement personnel, y compris au serveur.
3. Choix de sécurité propre au projet : chiffrement en base/cookies, authenticité et maîtrise des copies.
4. Conception technique qui conserve le service demandé.

Le responsable doit arrêter et dater les décisions de traitement. Un avis juridique peut étayer une interprétation discutée ; les tests prouvent un comportement technique. Ni l’un ni les autres ne constituent une autorisation préalable générale. Le dossier distingue le code présent, les propositions et les décisions restant ouvertes.
