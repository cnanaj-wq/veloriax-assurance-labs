# Catalogue des KPI métier

## Primes acquises

Définition : Montant des primes émises sur la période sélectionnée.
Règle de calcul : Somme des mouvements de type PRIME. Les primes ne sont pas réparties par garantie : pas de S/P par garantie.
Unité : €. Sens : plus haut = mieux. Propriétaire : Direction financière. Volet : Décider.
Contrôle : C03 : primes Qlik = référence source.
Expression Qlik : `Sum({<TypeMouvement={'PRIME'}>} MontantEUR)`

## Charges de sinistres

Définition : Montant des sinistres réglés et provisionnés sur la période.
Règle de calcul : Somme des mouvements de type SINISTRE. Une écriture n'est pas forcément un sinistre unique.
Unité : €. Sens : plus bas = mieux. Propriétaire : Direction indemnisation. Volet : Décider.
Contrôle : C04 : charges Qlik = référence source.
Expression Qlik : `Sum({<TypeMouvement={'SINISTRE'}>} MontantEUR)`

## Ratio S/P

Définition : Charges de sinistres rapportées aux primes acquises.
Règle de calcul : Ratio des sommes (charges / primes), jamais moyenne ni somme de ratios mensuels. S/P de 70 % = 70 € de sinistres pour 100 € de primes, hors frais de gestion.
Unité : %. Sens : plus bas = mieux. Propriétaire : Direction technique. Volet : Décider.
Seuil : cible 68 % (vCibleSP), choix de démonstration.
Contrôle : C03 et C04.
Expression Qlik : `Sum({<TypeMouvement={'SINISTRE'}>} MontantEUR) / Sum({<TypeMouvement={'PRIME'}>} MontantEUR)`

## Écart à la cible

Définition : Charges au-delà de ce que permettrait la cible de S/P.
Règle de calcul : Charges - cible x primes. Positif = au-dessus de la cible.
Unité : €. Sens : plus bas = mieux. Propriétaire : Direction technique. Volet : Décider.
Seuil : 0 €.
Expression Qlik : `Sum({<TypeMouvement={'SINISTRE'}>} MontantEUR) - $(vCibleSP) * Sum({<TypeMouvement={'PRIME'}>} MontantEUR)`

## Charge dégâts des eaux

Définition : Charges de la garantie dégâts des eaux.
Règle de calcul : Somme des sinistres de garantie « Dégâts des eaux ». Premier poste de charge du portefeuille.
Unité : €. Sens : plus bas = mieux. Propriétaire : Direction indemnisation. Volet : Comprendre.
Expression Qlik : `Sum({<TypeMouvement={'SINISTRE'}, Garantie={'Dégâts des eaux'}>} MontantEUR)`

## Taux d'encaissement des recours

Définition : Part des recours potentiels effectivement encaissés.
Règle de calcul : Recours encaissés / recours potentiels, sur les mêmes dossiers.
Unité : %. Sens : plus haut = mieux. Propriétaire : Service recours. Volet : Indemniser.
Seuil : 80 % jugé maîtrisé (vRecoursOK).
Expression Qlik : `Sum(Sin_RecoursEncaisse) / Sum(Sin_RecoursPotentiel)`

## Part du stock ancien

Définition : Part des dossiers ouverts depuis plus de 180 jours.
Règle de calcul : Dossiers ouverts d'âge > vAgeAncienJ / dossiers ouverts.
Unité : %. Sens : plus bas = mieux. Propriétaire : Direction indemnisation. Volet : Indemniser.
Seuil : 25 % rend la revue prioritaire (vPartStockAncien).
Expression Qlik : `Count({<Sin_Ouvert={1}, Sin_AgeJours={">$(vAgeAncienJ)"}>} MouvementID) / Count({<Sin_Ouvert={1}>} MouvementID)`

## Score de vigilance GLI

Définition : Score par règles explicites signalant un risque d'impayé de loyer.
Règle de calcul : Points : retards sur 3 mois, partiel sur 6 mois, taux d'effort > 35 %, profil, retard moyen. Élevée ≥ 50, modérée ≥ 25.
Unité : points. Sens : plus bas = mieux. Propriétaire : Direction GLI. Volet : Prévenir.
Expression Qlik : `GLI_ScoreVigilance`

## Probabilité de dégât des eaux (IA)

Définition : Probabilité qu'un contrat déclare un dégât des eaux dans les 10 prochains mois.
Règle de calcul : Score du modèle « prévention dégâts des eaux ». Classement relatif : à utiliser pour prioriser, pas comme une certitude individuelle.
Unité : %. Sens : plus bas = mieux. Propriétaire : Direction prévention. Volet : Anticiper.
Contrôle : Backtest 2026 : AUC 0.637 contre 0.571 pour la règle simple.
Expression Qlik : `Avg(IA_ProbaDDE)`

## Coût final estimé (IA)

Définition : Coût final médian attendu d'un sinistre encore ouvert, avec fourchette 10–90 %.
Règle de calcul : Modèle de coût final ; une provision sous la borne basse est signalée « probablement insuffisante ».
Unité : €. Sens : information. Propriétaire : Actuariat. Volet : Anticiper.
Contrôle : Backtest 2026 : erreur moyenne 722 € contre 849 € (médiane par cause).
Expression Qlik : `Sum(IA_CoutFinal)`

## Probabilité d'impayé à 90 jours (IA)

Définition : Probabilité d'un premier impayé de loyer dans les 90 jours.
Règle de calcul : Score du modèle GLI ; complète le score de vigilance par règles, ne le remplace pas.
Unité : %. Sens : plus bas = mieux. Propriétaire : Direction GLI. Volet : Anticiper.
Contrôle : Backtest 2026 : AUC 0.636 contre 0.601 pour la règle de vigilance (gain faible).
Expression Qlik : `Avg(IA_ProbaImpaye90j)`

## S/P projeté à 3 mois

Définition : Fourchette probable du S/P des trois prochains mois, sans action et avec le plan IA.
Règle de calcul : Simulation de 5000 tirages : nombre de sinistres saisonnier, coûts réels revalorisés, efficacité des actions tirée dans une fourchette d'hypothèses. P10–P90 = 8 chances sur 10.
Unité : %. Sens : plus bas = mieux. Propriétaire : Direction technique. Volet : Agir.
Seuil : cible 68 %.
Expression Qlik : `Proj_P50 (bornes Proj_P10, Proj_P90)`

