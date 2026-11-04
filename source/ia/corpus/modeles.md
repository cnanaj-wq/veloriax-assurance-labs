# Fiches des modèles prédictifs

## Prévention dégâts des eaux (version 1.0)

Question : Quels contrats auront un dégât des eaux dans les 10 prochains mois ?
Type : Gradient boosting (classification).
Données : profil du contrat, historique de sinistres sur 12 mois.
Validation : historique 2025 -> dégâts des eaux janv.-oct. 2026 (jamais vu par le modèle) : AUC 0.637 (règle simple 0.571) ; en ciblant 20 % des contrats, 36% des dégâts des eaux captés (règle simple 28%).
Usage autorisé : Prioriser les visites et la pose de détecteurs. Jamais pour tarifer ou refuser un client seul.
Limites : Données synthétiques ; pouvoir discriminant modéré ; un score n'est pas une certitude individuelle.

## Coût final des sinistres (version 1.0)

Question : Combien coûtera réellement un sinistre encore ouvert ?
Type : Gradient boosting (régression quantile).
Données : garantie, cause, expertise, IRSI, délai de déclaration, profil.
Validation : sinistres clos survenus en 2026 (jamais vus) : erreur moyenne 722 € (médiane par cause 849 €) ; fourchette 10–90 % couvrant 69% des cas (visé 80 %).
Usage autorisé : Signaler les provisions à revoir et les règlements atypiques. La décision reste au gestionnaire.
Limites : Fourchette un peu trop étroite (69 % de couverture) : à recalibrer ; aucune donnée de tâche ni de pièce.

## Impayé de loyer à 90 jours (version 1.0)

Question : Quels locataires vont connaître un premier impayé dans les 90 jours ?
Type : Gradient boosting (classification).
Données : historique de paiement sur 6 mois, taux d'effort, profil, bien.
Validation : situations mensuelles janv. - juil. 2026 (jamais vues) : AUC 0.636 (règle de vigilance 0.601) ; avance médiane 58 jours.
Usage autorisé : Contacter le bailleur avant le premier impayé, en complément du score par règles.
Limites : Gain faible sur la règle existante : la règle suffit presque. Résultat conservé et affiché tel quel.

