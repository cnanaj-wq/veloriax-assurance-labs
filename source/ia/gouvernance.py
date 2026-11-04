"""VELORIAX ASSURANCE LABS — gouvernance des données et de l'IA.

Construit, à partir des sources du projet :
- ia/gouvernance/kpi.json : catalogue des KPI métier (définition, règle de calcul, expression Qlik, propriétaire, seuils) ;
- ia/gouvernance/regles.json : règles métier paramétrées dans le script Qlik (variables commentées) ;
- ia/gouvernance/modeles.json : fiches des modèles (données, validation, limites, usage autorisé) ;
- ia/corpus/*.md : documents approuvés indexés par le mini RAG ;
- data_prototype/gouv_kpi.csv, gouv_modeles.csv : mêmes informations, chargées dans Qlik.
Usage : python -I ia/gouvernance.py <racine du projet>
"""
import csv
import json
import re
import sys
from pathlib import Path

R = Path(sys.argv[1])
G = R / "ia" / "gouvernance"
C = R / "ia" / "corpus"
G.mkdir(parents=True, exist_ok=True)
C.mkdir(parents=True, exist_ok=True)
bt = json.loads((R / "evidence" / "ia-backtest.json").read_text(encoding="utf-8"))
plan = json.loads((R / "evidence" / "ia-plan.json").read_text(encoding="utf-8"))
script = (R / "chargement_prototype.qvs").read_text(encoding="utf-8")

P = "Sum({<TypeMouvement={'PRIME'}>} MontantEUR)"
S = "Sum({<TypeMouvement={'SINISTRE'}>} MontantEUR)"
KPI = [
    dict(id="primes", nom="Primes acquises", unite="€", proprietaire="Direction financière", volet="Décider",
         definition="Montant des primes émises sur la période sélectionnée.",
         regle="Somme des mouvements de type PRIME. Les primes ne sont pas réparties par garantie : pas de S/P par garantie.",
         qlik=P, sens="plus haut = mieux", controle="C03 : primes Qlik = référence source"),
    dict(id="charges", nom="Charges de sinistres", unite="€", proprietaire="Direction indemnisation", volet="Décider",
         definition="Montant des sinistres réglés et provisionnés sur la période.",
         regle="Somme des mouvements de type SINISTRE. Une écriture n'est pas forcément un sinistre unique.",
         qlik=S, sens="plus bas = mieux", controle="C04 : charges Qlik = référence source"),
    dict(id="sp", nom="Ratio S/P", unite="%", proprietaire="Direction technique", volet="Décider",
         definition="Charges de sinistres rapportées aux primes acquises.",
         regle="Ratio des sommes (charges / primes), jamais moyenne ni somme de ratios mensuels. "
               "S/P de 70 % = 70 € de sinistres pour 100 € de primes, hors frais de gestion.",
         qlik=f"{S} / {P}", sens="plus bas = mieux", seuil="cible 68 % (vCibleSP), choix de démonstration",
         controle="C03 et C04"),
    dict(id="ecart_cible", nom="Écart à la cible", unite="€", proprietaire="Direction technique", volet="Décider",
         definition="Charges au-delà de ce que permettrait la cible de S/P.",
         regle="Charges - cible x primes. Positif = au-dessus de la cible.",
         qlik=f"{S} - $(vCibleSP) * {P}", sens="plus bas = mieux", seuil="0 €"),
    dict(id="charge_dde", nom="Charge dégâts des eaux", unite="€", proprietaire="Direction indemnisation",
         volet="Comprendre", definition="Charges de la garantie dégâts des eaux.",
         regle="Somme des sinistres de garantie « Dégâts des eaux ». Premier poste de charge du portefeuille.",
         qlik="Sum({<TypeMouvement={'SINISTRE'}, Garantie={'Dégâts des eaux'}>} MontantEUR)", sens="plus bas = mieux"),
    dict(id="recours", nom="Taux d'encaissement des recours", unite="%", proprietaire="Service recours",
         volet="Indemniser", definition="Part des recours potentiels effectivement encaissés.",
         regle="Recours encaissés / recours potentiels, sur les mêmes dossiers.",
         qlik="Sum(Sin_RecoursEncaisse) / Sum(Sin_RecoursPotentiel)", sens="plus haut = mieux",
         seuil="80 % jugé maîtrisé (vRecoursOK)"),
    dict(id="stock_ancien", nom="Part du stock ancien", unite="%", proprietaire="Direction indemnisation",
         volet="Indemniser", definition="Part des dossiers ouverts depuis plus de 180 jours.",
         regle="Dossiers ouverts d'âge > vAgeAncienJ / dossiers ouverts.",
         qlik="Count({<Sin_Ouvert={1}, Sin_AgeJours={\">$(vAgeAncienJ)\"}>} MouvementID) / Count({<Sin_Ouvert={1}>} MouvementID)",
         sens="plus bas = mieux", seuil="25 % rend la revue prioritaire (vPartStockAncien)"),
    dict(id="vigilance_gli", nom="Score de vigilance GLI", unite="points", proprietaire="Direction GLI", volet="Prévenir",
         definition="Score par règles explicites signalant un risque d'impayé de loyer.",
         regle="Points : retards sur 3 mois, partiel sur 6 mois, taux d'effort > 35 %, profil, retard moyen. "
               "Élevée ≥ 50, modérée ≥ 25.", qlik="GLI_ScoreVigilance", sens="plus bas = mieux"),
    dict(id="ia_proba_dde", nom="Probabilité de dégât des eaux (IA)", unite="%", proprietaire="Direction prévention",
         volet="Anticiper", definition="Probabilité qu'un contrat déclare un dégât des eaux dans les 10 prochains mois.",
         regle="Score du modèle « prévention dégâts des eaux ». Classement relatif : à utiliser pour prioriser, "
               "pas comme une certitude individuelle.", qlik="Avg(IA_ProbaDDE)", sens="plus bas = mieux",
         controle="Backtest 2026 : AUC %.3f contre %.3f pour la règle simple" % (
             bt["prevention_dde"]["auc_modele"], bt["prevention_dde"]["auc_regle_simple"])),
    dict(id="ia_cout_final", nom="Coût final estimé (IA)", unite="€", proprietaire="Actuariat",
         volet="Anticiper", definition="Coût final médian attendu d'un sinistre encore ouvert, avec fourchette 10–90 %.",
         regle="Modèle de coût final ; une provision sous la borne basse est signalée « probablement insuffisante ».",
         qlik="Sum(IA_CoutFinal)", sens="information",
         controle="Backtest 2026 : erreur moyenne %d € contre %d € (médiane par cause)" % (
             bt["cout_final"]["erreur_moyenne_modele_eur"], bt["cout_final"]["erreur_moyenne_mediane_par_cause_eur"])),
    dict(id="ia_proba_impaye", nom="Probabilité d'impayé à 90 jours (IA)", unite="%", proprietaire="Direction GLI",
         volet="Anticiper", definition="Probabilité d'un premier impayé de loyer dans les 90 jours.",
         regle="Score du modèle GLI ; complète le score de vigilance par règles, ne le remplace pas.",
         qlik="Avg(IA_ProbaImpaye90j)", sens="plus bas = mieux",
         controle="Backtest 2026 : AUC %.3f contre %.3f pour la règle de vigilance (gain faible)" % (
             bt["gli_impaye"]["auc_modele"], bt["gli_impaye"]["auc_regle_vigilance"])),
    dict(id="sp_projete", nom="S/P projeté à 3 mois", unite="%", proprietaire="Direction technique", volet="Agir",
         definition="Fourchette probable du S/P des trois prochains mois, sans action et avec le plan IA.",
         regle="Simulation de %d tirages : nombre de sinistres saisonnier, coûts réels revalorisés, efficacité des "
               "actions tirée dans une fourchette d'hypothèses. P10–P90 = 8 chances sur 10." % plan["tirages"],
         qlik="Proj_P50 (bornes Proj_P10, Proj_P90)", sens="plus bas = mieux", seuil="cible 68 %"),
]
(G / "kpi.json").write_text(json.dumps(KPI, ensure_ascii=False, indent=1), encoding="utf-8")

# Règles métier : variables commentées du bloc PARAMÈTRES MÉTIER du script Qlik
regles = []
for m in re.finditer(r"^SET (v\w+)\s*=\s*([^;]+);\s*(?://\s*(.*))?$", script, re.M):
    regles.append({"variable": m.group(1), "valeur": m.group(2).strip(), "signification": (m.group(3) or "").strip()})
(G / "regles.json").write_text(json.dumps(regles, ensure_ascii=False, indent=1), encoding="utf-8")

MODELES = [
    dict(id="prevention_dde", nom="Prévention dégâts des eaux", version="1.0", type="Gradient boosting (classification)",
         question=bt["prevention_dde"]["question"], donnees="profil du contrat, historique de sinistres sur 12 mois",
         validation=f"{bt['prevention_dde']['test']} : AUC {bt['prevention_dde']['auc_modele']} "
                    f"(règle simple {bt['prevention_dde']['auc_regle_simple']}) ; en ciblant 20 % des contrats, "
                    f"{bt['prevention_dde']['part_captee_top20_modele']:.0%} des dégâts des eaux captés "
                    f"(règle simple {bt['prevention_dde']['part_captee_top20_regle']:.0%})",
         usage="Prioriser les visites et la pose de détecteurs. Jamais pour tarifer ou refuser un client seul.",
         limites="Données synthétiques ; pouvoir discriminant modéré ; un score n'est pas une certitude individuelle."),
    dict(id="cout_final", nom="Coût final des sinistres", version="1.0", type="Gradient boosting (régression quantile)",
         question=bt["cout_final"]["question"], donnees="garantie, cause, expertise, IRSI, délai de déclaration, profil",
         validation=f"{bt['cout_final']['test']} : erreur moyenne {bt['cout_final']['erreur_moyenne_modele_eur']} € "
                    f"(médiane par cause {bt['cout_final']['erreur_moyenne_mediane_par_cause_eur']} €) ; "
                    f"fourchette 10–90 % couvrant {bt['cout_final']['couverture_intervalle_80']:.0%} des cas (visé 80 %)",
         usage="Signaler les provisions à revoir et les règlements atypiques. La décision reste au gestionnaire.",
         limites="Fourchette un peu trop étroite (69 % de couverture) : à recalibrer ; aucune donnée de tâche ni de pièce."),
    dict(id="gli_impaye", nom="Impayé de loyer à 90 jours", version="1.0", type="Gradient boosting (classification)",
         question=bt["gli_impaye"]["question"], donnees="historique de paiement sur 6 mois, taux d'effort, profil, bien",
         validation=f"{bt['gli_impaye']['test']} : AUC {bt['gli_impaye']['auc_modele']} "
                    f"(règle de vigilance {bt['gli_impaye']['auc_regle_vigilance']}) ; "
                    f"avance médiane {bt['gli_impaye']['avance_mediane_jours']} jours",
         usage="Contacter le bailleur avant le premier impayé, en complément du score par règles.",
         limites="Gain faible sur la règle existante : la règle suffit presque. Résultat conservé et affiché tel quel."),
]
(G / "modeles.json").write_text(json.dumps(MODELES, ensure_ascii=False, indent=1), encoding="utf-8")

CHARTE = """# Charte d'usage de l'IA — VELORIAX ASSURANCE LABS

1. L'IA recommande, l'humain décide. Aucune décision sur un client, un sinistre ou un tarif n'est prise automatiquement.
2. Le copilote lit les données en lecture seule. Il ne modifie ni primes, ni provisions, ni décisions.
3. Chaque chiffre cité par le copilote vient d'un calcul Qlik ou d'un modèle versionné, avec sa période et ses filtres.
4. Chaque KPI a une définition, une règle de calcul, un propriétaire et un contrôle. Le copilote utilise ces définitions.
5. Un score est une probabilité, pas une certitude. Il sert à prioriser une file de travail, pas à juger une personne.
6. Une projection est une fourchette : P50 = valeur médiane, P10–P90 = 8 chances sur 10.
7. L'efficacité des actions est une hypothèse tant qu'elle n'a pas été mesurée contre un groupe témoin.
8. Les modèles sont revalidés à chaque nouvelle période, sur des données qu'ils n'ont pas vues.
9. Le LLM léger tourne en local : les données ne quittent pas le poste.
10. Les données de ce démonstrateur sont synthétiques. Aucun assureur réel n'est représenté.
"""
(C / "charte-ia.md").write_text(CHARTE, encoding="utf-8")

with open(C / "kpi.md", "w", encoding="utf-8") as f:
    f.write("# Catalogue des KPI métier\n\n")
    for k in KPI:
        f.write(f"## {k['nom']}\n\nDéfinition : {k['definition']}\nRègle de calcul : {k['regle']}\n"
                f"Unité : {k['unite']}. Sens : {k['sens']}. Propriétaire : {k['proprietaire']}. Volet : {k['volet']}.\n")
        if k.get("seuil"):
            f.write(f"Seuil : {k['seuil']}.\n")
        if k.get("controle"):
            f.write(f"Contrôle : {k['controle']}.\n")
        f.write(f"Expression Qlik : `{k['qlik']}`\n\n")
with open(C / "regles-metier.md", "w", encoding="utf-8") as f:
    f.write("# Règles métier paramétrées\n\nModifiables dans le bloc PARAMÈTRES MÉTIER du script, puis rechargement.\n\n")
    for r in regles:
        f.write(f"## {r['variable']}\n\n{r['signification'] or 'Paramètre'} : valeur {r['valeur']}.\n\n")
with open(C / "modeles.md", "w", encoding="utf-8") as f:
    f.write("# Fiches des modèles prédictifs\n\n")
    for m in MODELES:
        f.write(f"## {m['nom']} (version {m['version']})\n\nQuestion : {m['question']}\nType : {m['type']}.\n"
                f"Données : {m['donnees']}.\nValidation : {m['validation']}.\nUsage autorisé : {m['usage']}\n"
                f"Limites : {m['limites']}\n\n")
with open(C / "plan-action.md", "w", encoding="utf-8") as f:
    f.write("# Plan d'action prédictif\n\n")
    f.write(f"Horizon : {', '.join(plan['horizon'])}. S/P du trimestre sans action : médiane "
            f"{plan['sp_trimestre_sans_action'][1]:.1%} (8 chances sur 10 entre {plan['sp_trimestre_sans_action'][0]:.1%} "
            f"et {plan['sp_trimestre_sans_action'][2]:.1%}). Avec le plan : médiane {plan['sp_trimestre_avec_plan'][1]:.1%} "
            f"({plan['sp_trimestre_avec_plan'][0]:.1%} à {plan['sp_trimestre_avec_plan'][2]:.1%}). "
            f"Le plan fait mieux dans {plan['probabilite_plan_meilleur']:.0%} des tirages.\n\n")
    for a in plan["actions"]:
        f.write(f"## {a['Act_ID']} · {a['Act_Action']}\n\nCible : {a['Act_Cible']}. Responsable : {a['Act_Responsable']}.\n"
                f"Hypothèse : {a['Act_Hypothese']}.\nEffet médian sur 3 mois : {a['Act_Effet_P50']} € "
                f"({a['Act_Points_SP']} point de S/P), fourchette {a['Act_Effet_P10']} à {a['Act_Effet_P90']} €.\n"
                f"Indicateur de suivi : {a['Act_KPI']}.\n\n")
src = R / "SOLUTIONS_IA_ET_PREUVES.md"
if src.exists():
    (C / "solutions-ia.md").write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
(C / "lignage.md").write_text("""# Lignage des données

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
""", encoding="utf-8")


def ecrire_csv(nom, lignes, champs):
    with open(R / "data_prototype" / nom, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=champs, extrasaction="ignore")
        w.writeheader()
        for l in lignes:
            w.writerow({c: l.get(c.split("_", 1)[1].lower() if "_" in c else c, "") for c in champs})


ecrire_csv("gouv_kpi.csv", KPI, ["Gouv_ID", "Gouv_Nom", "Gouv_Definition", "Gouv_Regle", "Gouv_Unite", "Gouv_Proprietaire",
                                 "Gouv_Volet", "Gouv_Seuil", "Gouv_Controle", "Gouv_Qlik", "Gouv_Sens"])
ecrire_csv("gouv_modeles.csv", MODELES, ["Mod_ID", "Mod_Nom", "Mod_Version", "Mod_Type", "Mod_Question", "Mod_Donnees",
                                         "Mod_Validation", "Mod_Usage", "Mod_Limites"])
print(len(KPI), "KPI ;", len(regles), "règles ;", len(MODELES), "modèles ;", len(list(C.glob("*.md"))), "documents RAG")
