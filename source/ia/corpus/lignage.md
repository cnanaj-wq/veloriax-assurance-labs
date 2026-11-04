# Lignage des données

## Chaîne de données
Sources métier (contrats, mouvements, sinistres, GLI, CRM) -> fichiers sources contrôlés -> script Qlik
(chargement, règles métier paramétrées, contrôles C01 à C08) -> modèle associatif Qlik -> 12 volets métier.

## Chaîne IA
Mêmes sources -> modèles prédictifs (ia/modeles.py), validés sur une période jamais vue -> scores ia_*.csv
-> plan d'action et projection (ia/plan_action.py) -> chargés dans Qlik -> volets Anticiper et Agir.
Le serveur MCP lit Qlik en lecture seule ; le LLM rédige à partir des résultats d'outils et des documents approuvés.

## Contrôles de chargement
C01 nombre de contrats, C02 nombre de mouvements, C03 primes, C04 charges, C05 doublons de mouvements,
C06 montants manquants, C07 types non reconnus, C08 contrats orphelins. Tolérance : 0,005 €.
