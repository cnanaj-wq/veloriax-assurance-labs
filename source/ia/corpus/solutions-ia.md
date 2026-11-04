# VELORIAX ASSURANCE LABS — solutions IA et preuves

Ce document accompagne la feuille **06 · Évaluer**. Les 28 propositions ci-dessous sont des solutions à construire et valider ; aucun modèle IA n’est connecté ou déclaré performant dans le prototype. Les preuves techniques disponibles portent sur les données synthétiques, les calculs Qlik et les interactions.

## Choix de pilotes

1. **Qualité et explication des KPI** : base prioritaire, car les contrôles, les définitions et la traçabilité conditionnent les autres usages. Déjà démontré : rapprochement CSV/Qlik, filtres, simulation arithmétique. À ajouter : couche sémantique gouvernée, RAG et évaluation des réponses.
2. **Délais de gestion et parcours client** : instrumenter les événements avant de promettre une réduction de délai. Déjà démontré : visualisation d’une cohorte CRM indépendante. À ajouter : événements réels autorisés, tâches et états de gestion.
3. **Résiliation ou provision ultime** : choisir un seul pilote après vérification des historiques et labels. Les scores de fraude, décisions de souscription et modèles catastrophe ne doivent pas être simulés comme des modèles validés.

## Contrat de mesure du pilote

Le responsable métier gèle la population éligible, l’horizon, la baseline, le comparateur et le coût de l’action avant le test. Mesurer une métrique primaire, sa précision statistique et deux garde-fous métier. Les objectifs chiffrés de gain sont à fixer après baseline ; les sources sectorielles ne fournissent pas une baseline locale. La recette technique exige des rapprochements comptables sans écart inexpliqué, une réponse traçable et une gestion explicite de l’absence de données.

Pour une action, le bénéfice net incrémental = différence de résultats entre groupes comparables, moins les coûts additionnels. Ne pas sommer des gains qui se recouvrent. Pour un score, comparer à une règle simple au même volume de dossiers traités ; utiliser une période future gelée et ne jamais introduire une information postérieure à la date de score. Les modèles d’attrition nécessitent une cohorte complètement observable ou une méthode tenant compte de la censure.

## Architecture cible proposée

Sources métier autorisées → zone brute historisée → contrôles et tables métier → couche sémantique / QVD → Qlik.
En parallèle : features horodatées → entraînement hors ligne → validation temporelle → registre des versions → scores en batch avec date, version, justification et incertitude → Qlik.
Pour le langage naturel : catalogue des KPI et documents approuvés → recherche documentaire → requêtes en lecture seule autorisées → réponse avec calcul, période, filtres et références. Le LLM n’écrit pas directement les primes, provisions ou décisions clients.

La chaîne conserve les versions des jeux, transformations, modèles, règles et décisions de revue. Définir droits par rôle, journal d’accès, suivi de dérive, coût et délai d’inférence, seuil d’abstention, procédure de reprise et retour à la règle précédente. Revue métier humaine pour les décisions ayant un effet sur une personne.

## Déroulé indicatif

0–30 jours : données, définitions, baseline et qualité. 31–60 : benchmark simple, backtest temporel et mode observation. 61–90 : pilote contrôlé, mesure du bénéfice net, revue d’exploitation. Ces durées sont une proposition de cadrage, pas un engagement de livraison ni une estimation fondée sur les systèmes de l’entreprise.


## Sinistres

Responsable proposé : Direction indemnisation.

**Données :** Dossiers identifiés, provisions successives, paiements, tâches et horodatages, décisions de revue.

**Limite / validation :** Mesurer sur dossiers clôturés et cohortes comparables ; contrôler les dossiers encore ouverts pour éviter un biais de survie.

### Détecter les sinistres anormaux

Règles métier + modèle d’anomalies par garantie ; expliquer le score par les variables qui le portent. Revue humaine.

**Mesure :** Précision@K = anomalies confirmées / K dossiers revus ; coût de contrôle par anomalie utile.

**Preuve :** Revue en aveugle d’un échantillon aléatoire et des alertes ; comparer à la file actuelle à capacité K identique.

### Anticiper les dépassements de provision

Modèle de coût ultime avec intervalles, construit uniquement sur les informations disponibles à la date du score.

**Mesure :** MAE du coût ultime ; rappel des dépassements ; couverture de l’intervalle prédictif.

**Preuve :** Validation sur une période ultérieure entièrement gelée, par garantie ; comparer aux provisions et à un modèle actuariel simple.

### Réduire le délai d’indemnisation

Process mining sur les événements ; recommandation de prochaine action et synthèse de pièces par IA générative.

**Mesure :** Médiane et P90 des jours déclaration → paiement ; réouvertures et réclamations en garde-fous.

**Preuve :** Pilote avec groupe témoin comparable ; mesurer le temps total, pas seulement le temps de rédaction.

### Prioriser les dossiers

Score combinant urgence vérifiée, complexité estimée et délai restant ; allocation à un gestionnaire avec validation.

**Mesure :** Part des dossiers hors délai ; temps d’attente P90 ; charge par gestionnaire.

**Preuve :** Simulation sur historique puis mode observation ; contrôler les urgences manquées et les écarts entre segments.

### Expliquer la dérive de sinistralité

Décomposition comptable fréquence × sévérité × exposition ; commentaire IA fondé sur agrégats certifiés et leurs références.

**Mesure :** Écart de rapprochement = 0 ; taux de commentaires factuels corrects et sourcés.

**Preuve :** Jeu de questions annotées ; vérifier chaque nombre et distinguer contribution arithmétique et hypothèse causale.

## Rentabilité

Responsable proposé : Direction technique / actuariat.

**Données :** Primes acquises, charges à l’ultime, expositions, frais, commissions, budgets versionnés, avenants tarifaires.

**Limite / validation :** Le prototype calcule un S/P sur mouvements synthétiques. Le ratio combiné exige aussi les frais ; la cible 68 % est une hypothèse du scénario, pas un benchmark sectoriel.

### Surveiller le S/P

Détection de rupture par produit/région, avec seuil métier et intervalle tenant compte de l’exposition.

**Mesure :** S/P = somme charges / somme primes ; précision des alertes confirmées ; délai de détection.

**Preuve :** Rejouer mensuellement l’historique ; comparer aux seuils fixes. S/P et filtres sont opérationnels dans les feuilles actuelles.

### Anticiper le ratio combiné

Prévoir charges et frais séparément, puis consolider avec les primes ; scénarios et intervalles.

**Mesure :** Ratio combiné = (charges + frais) / primes acquises ; erreur en points et couverture des intervalles.

**Preuve :** Backtest à origine glissante ; comparer au budget et au report du dernier réalisé. Non calculable ici sans frais.

### Identifier les segments déficitaires

Estimer le coût du risque par exposition ; agréger avant de classer pour limiter le bruit sur petits contrats.

**Mesure :** Marge technique = primes − charges − frais ; stabilité du classement par segment.

**Preuve :** Contrôle actuariel des segments et incertitudes ; aucune exclusion automatique d’un assuré sur le seul score.

### Expliquer budget / réalisé

Pont de variation volume, mix, prix, fréquence et sévérité ; IA pour la narration de calculs déterministes.

**Mesure :** Somme des contributions = écart total ; taux d’explications validées par le contrôle de gestion.

**Preuve :** Rapprochement au grand livre et au budget gelé ; revue des effets non attribués avant publication.

### Simuler des tarifs

Scénarios de prix avec élasticité explicitée, attrition et contraintes métier ; aucun gain garanti.

**Mesure :** Marge incrémentale nette ; rétention ; volume et incertitude par scénario.

**Preuve :** Backtest puis expérimentation autorisée ; intégrer coûts et effets de sélection. La simulation actuelle porte uniquement sur la prévention eau.

## Fraude

Responsable proposé : Responsable lutte antifraude.

**Données :** Dossiers et justificatifs, décisions d’enquête confirmées, liens assurés/prestataires autorisés et horodatés.

**Limite / validation :** Une anomalie n’est pas une fraude. Aucun score ne doit être présenté comme une accusation ni déclencher seul un refus d’indemnisation.

### Repérer les déclarations suspectes

Règles de cohérence + modèle supervisé calibré ; explicitation et file d’investigation.

**Mesure :** Précision@capacité d’enquête ; rappel sur labels disponibles ; faux positifs.

**Preuve :** Séparer temporellement apprentissage/test ; examiner un échantillon hors alertes pour corriger le biais des enquêtes passées.

### Détecter les doublons

Rapprochement exact et approché de références, montants et documents ; similarité textuelle en appui.

**Mesure :** Précision des paires dupliquées ; rappel sur jeu annoté ; euros indus confirmés.

**Preuve :** Paires positives et négatives annotées en double revue ; éviter de confondre paiements fractionnés et doublons.

### Analyser les réseaux

Graphe des relations autorisées ; détection de communautés et motifs inhabituels, avec chemins explicables.

**Mesure :** Part de réseaux signalés confirmés utiles ; délai d’enquête ; taux de liens erronés.

**Preuve :** Revue experte de chaque lien ; benchmark contre règles simples ; limiter accès et durée de conservation.

### Prioriser les enquêtes

Classement par valeur attendue d’investigation, confiance et coût de traitement, sans décision automatique.

**Mesure :** Montant confirmé évité/récupéré − coût des enquêtes ; précision@K.

**Preuve :** Pilote à capacité identique et groupe témoin ; compter uniquement les montants confirmés, sans double comptage.

## Client & réseau

Responsable proposé : Direction relation client / distribution.

**Données :** CRM, devis, signatures, résiliations et motifs, contacts, réclamations, campagnes et consentements applicables.

**Limite / validation :** La feuille Parcours utilise une cohorte CRM indépendante et synthétique. Aucun modèle de résiliation ni bénéfice de rétention n’est validé.

### Prévoir les résiliations

Modèle de risque de départ à horizon défini ; variables strictement antérieures au score, calibration et explications.

**Mesure :** PR-AUC, précision@capacité de contact, Brier ; rétention incrémentale nette à 90 jours.

**Preuve :** Test temporel sans fuite d’information puis groupe témoin aléatoire ; observer les clients sur tout l’horizon.

### Analyser les réclamations

Classification thématique et résumé IA ; extraction de verbatims justifiant chaque motif.

**Mesure :** Macro-F1 sur catégories annotées ; délai de traitement ; erreurs critiques.

**Preuve :** Double annotation métier, revue par canal et langue ; aucun résumé sans lien vers le texte source.

### Identifier les besoins de couverture

Recommandations fondées sur besoins déclarés et adéquation, avec conseiller et explication.

**Mesure :** Conversion incrémentale parmi contacts éligibles ; rétractations, réclamations et adéquation.

**Preuve :** Expérience avec témoin et mesure du besoin couvert ; ne pas optimiser uniquement le chiffre d’affaires.

### Suivre le parcours de souscription

Journal d’événements, entonnoir par cohorte et process mining ; repérer l’étape d’abandon.

**Mesure :** Signatures / devis éligibles ; médiane/P90 devis → signature ; abandon par étape.

**Preuve :** Réconcilier événements et états CRM. Le prototype montre les chronologies et trois exemples contrastés.

### Piloter les canaux et agences

Comparaisons ajustées sur mix produit/exposition ; détection de ruptures et commentaire sourcé.

**Mesure :** Conversion, rétention et marge par canal ; stabilité après ajustement du mix.

**Preuve :** Comparer des cohortes et durées d’observation identiques ; pas de classement brut sur petits effectifs.

## Climat & prévention

Responsable proposé : Direction risques / prévention.

**Données :** Adresses géocodées, capitaux assurés, expositions par péril, historiques météo et sinistres, actions de prévention.

**Limite / validation :** Les cartes actuelles montrent la sinistralité régionale ; elles ne mesurent pas un aléa climatique et ne constituent pas un modèle catastrophe.

### Cartographier les expositions

Croiser géométrie des biens et couches d’aléa validées ; afficher résolution, date et incertitude.

**Mesure :** Part de capitaux géocodés ; capitaux exposés par péril ; erreurs de localisation.

**Preuve :** Échantillon d’adresses vérifié et rapprochement aux capitaux du portefeuille ; respecter la précision réelle des cartes.

### Anticiper un événement

Croiser empreinte prévisionnelle d’événement et exposition ; estimer une plage de pertes.

**Mesure :** Erreur de perte agrégée ; couverture des intervalles ; temps d’alerte utile.

**Preuve :** Rejouer événements passés en ne prenant que les prévisions disponibles à l’époque ; benchmark catastrophe validé.

### Repérer les concentrations

Clusters spatiaux ajustés sur exposition ; séparation fréquence, coût moyen et montant total.

**Mesure :** Fréquence par unité exposée ; ratio observé/attendu ; stabilité des zones identifiées.

**Preuve :** Validation hors période et revue des zones peu exposées ; ne pas confondre taille du portefeuille et niveau de risque.

### Simuler une catastrophe et la prévention

Scénarios d’intensité, vulnérabilité et franchise ; analyse de sensibilité et coût du programme.

**Mesure :** Perte brute/nette par scénario ; gain net hypothétique ; efficacité mesurée du pilote.

**Preuve :** Valider les fonctions de dommage et réassurance ; groupe comparable pour prouver l’effet de prévention. Aucun modèle catastrophe connecté.

## Qualité & conformité

Responsable proposé : Data owner / conformité / actuariat.

**Données :** Contrats, référentiels, journal de chargement, règles versionnées, provisions, documents approuvés et habilitations.

**Limite / validation :** Les contrôles du prototype prouvent un rapprochement technique du jeu synthétique ; ils ne certifient pas la conformité réglementaire d’un système de production.

### Détecter les incohérences contractuelles

Règles explicites et extraction documentaire assistée ; séparer valeurs absentes et non applicables.

**Mesure :** Taux d’incomplétude par champ obligatoire ; précision des exceptions confirmées.

**Preuve :** Catalogue signé par les métiers ; cas valides/invalides et gestion des dérogations tracées.

### Surveiller la qualité et l’alimentation

Contrôles de schéma, clés, volumes et montants ; distinguer date source et date de reload.

**Mesure :** Écart de rapprochement ; doublons/orphelins ; âge du dernier succès et durée de reload.

**Preuve :** 8 contrôles et 600 groupes CSV/Qlik vérifiés ici ; alertes et reprise à tester dans l’environnement cible.

### Contrôler les provisions

Détecter des mouvements atypiques et comparer aux modèles actuariels validés, avec revue.

**Mesure :** Écart provision/ultime ; rappel des écarts matériels ; couverture des intervalles.

**Preuve :** Backtest par année de survenance et maturité ; comité actuariel avant tout usage comptable.

### Suivre les exceptions de conformité

Moteur de règles versionné, responsable, échéance et justification ; IA pour rechercher les références approuvées.

**Mesure :** Exceptions échues / exceptions ouvertes ; délai de régularisation ; faux positifs.

**Preuve :** Piste d’audit complète et tests sur règles applicables validées par la conformité ; pas d’avis juridique autonome.

### Interroger les KPI en langage naturel

RAG sur définitions approuvées + requêtes en lecture seule sur couche sémantique ; réponse liée au calcul exécuté.

**Mesure :** Exactitude des nombres ; taux de réponses correctement sourcées ; abstention sur questions non couvertes.

**Preuve :** Jeu de questions métier gelé, contrôle des accès et tests d’injection ; aucune réponse chiffrée sans résultat vérifiable. Aucun LLM connecté au prototype.

## Sources consultées le 29 octobre 2026

- [France Assureurs — bilan 2025](https://www.franceassureurs.fr/espace-presse/lassurance-en-2025-proteger-aujourdhui-pour-construire-demain/) : contexte de sinistralité et de risques climatiques.
- [ACPR — situation fin 2025](https://acpr.banque-france.fr/fr/publications-et-statistiques/publications/ndeg-181-la-situation-des-assureurs-en-france-fin-2025) : contexte de rentabilité technique ; le ratio combiné sectoriel n’est pas comparable au seul S/P synthétique de ce POC.
- [EIOPA — enquête GenAI](https://www.eiopa.europa.eu/document/download/bec886e2-dea0-4bbe-9624-d5f23f85700a_en?filename=EIOPA-BoS-25-679-GenAI-Report.pdf) : cas d’usage, risques et supervision humaine.
- [Observatoire des métiers — annonce du baromètre 2026](https://fr.linkedin.com/posts/observatoireassurance_assurance-rh-comp%C3%A9tences-activity-7468184882033328129-TCqn) : transformations des métiers et compétences. Seule la publication LinkedIn a été consultée, pas le baromètre intégral.
- [McKinsey — transformation IA, juillet 2025](https://www.mckinsey.com/industries/financial-services/our-insights/the-future-of-ai-in-the-insurance-industry) : transformation des processus et économie unitaire. Source de cadrage, pas validation des gains locaux.

Ces références étayent le contexte. Les choix de modèles, métriques et protocoles sont des propositions de conception pour ce projet. Aucun gain sectoriel n’est transposé au prototype.