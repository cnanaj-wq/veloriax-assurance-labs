"""VELORIAX ASSURANCE LABS — plan d'action prédictif et projection du S/P à 3 mois.

Ce n'est pas une certitude : c'est une fourchette probable.
- Sans action : charges simulées par tirage (nombre de sinistres de Poisson saisonnier x coûts réels 2026 rééchantillonnés).
- Avec le plan : mêmes tirages, auxquels on applique l'effet de chaque action. L'efficacité de chaque action est
  une HYPOTHÈSE tirée dans une fourchette (à mesurer ensuite par groupe témoin), avec montée en charge progressive.
Entrées : données de l'application + sorties de ia/modeles.py.
Sorties : data_prototype/ia_plan_actions.csv, ia_projection.csv, ia_taches.csv ; evidence/ia-plan.json.
Usage : python -I ia/plan_action.py <racine du projet>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RACINE = Path(sys.argv[1])
D = RACINE / "data_prototype"
GRAINE, TIRAGES = 20261104, 5000
rng = np.random.default_rng(GRAINE)


def lire(f, **k):
    return pd.read_csv(D / f, encoding="utf-8", **k)


mvt = lire("mouvements.csv", parse_dates=["DateMouvement"])
sd = lire("sinistres_dossiers.csv", parse_dates=["Sin_DateSurvenance", "Sin_DateDeclaration", "Sin_DateCloture"])
contrats = lire("contrats.csv").merge(lire("contrats_profil.csv"), on="ContratID")
dde = lire("ia_prevention_dde.csv")
cout = lire("ia_cout_final.csv")
gli = lire("ia_gli_impaye.csv")
sin = mvt[mvt.TypeMouvement == "SINISTRE"].merge(sd, on="MouvementID")
prime = mvt[mvt.TypeMouvement == "PRIME"]
DATE_REF = mvt.DateMouvement.max().normalize()
CIBLE = 0.68
MOIS = pd.period_range(DATE_REF.to_period("M") + 1, periods=3, freq="M")      # nov. 2026 -> janv. 2027
MONTEE = np.array([0.3, 0.7, 1.0])                                              # montée en charge du plan

# ------------------------------------------------------------------ base « sans action »
nb = sin.groupby([sin.DateMouvement.dt.year, sin.DateMouvement.dt.month]).size()
croissance_nb = (sin[sin.DateMouvement.dt.year == 2026].shape[0]
                 / sin[(sin.DateMouvement.dt.year == 2025) & (sin.DateMouvement.dt.month <= 10)].shape[0])
cout_2026 = sin[sin.DateMouvement.dt.year == 2026]
inflation_cout = cout_2026.MontantEUR.mean() / sin[sin.DateMouvement.dt.year == 2025].MontantEUR.mean()
prime_m = prime.groupby(prime.DateMouvement.dt.to_period("M")).MontantEUR.sum()
pas_annuel = prime_m[prime_m.index.year == 2026].mean() - prime_m[prime_m.index.year == 2025].mean()
primes = np.array([prime_m.iloc[-1] + (pas_annuel if m.year > DATE_REF.year else 0) for m in MOIS])
lam = np.array([nb.loc[(m.year - 1, m.month)] * croissance_nb for m in MOIS])
# Coûts propres à chaque mois calendaire (saisonnalité de gravité), pris l'année précédente puis revalorisés
pools = []
for m in MOIS:
    ref = sin[(sin.DateMouvement.dt.month == m.month) & (sin.DateMouvement.dt.year == m.year - 1)]
    pools.append((ref.MontantEUR.values * inflation_cout, (ref.Garantie == "Dégâts des eaux").values))

# Exposition des contrats ciblés par la prévention (part des dégâts des eaux du portefeuille qu'ils portent)
haut = dde[(dde.IA_NiveauDDE == "Élevé")].merge(contrats[["ContratID", "DetecteurFuite"]], on="ContratID")
cible_dde = haut[haut.DetecteurFuite == "Non"]
part_dde_cible = cible_dde.IA_ChargeDDEAttendue.sum() / dde.IA_ChargeDDEAttendue.sum()

# Règlements au-delà de la borne haute attendue (fuite de valeur) : part de la charge concernée
atyp = cout[cout.IA_AlerteProvision == "Règlement atypique à revoir"]
part_fuite = atyp.IA_EcartProvision.sum() / cout_2026.MontantEUR.sum()

# Recours non encaissés sur les dossiers récents
sd["RecoursOuvert"] = (sd.Sin_RecoursPotentiel - sd.Sin_RecoursEncaisse).clip(lower=0)
recours = sd[(sd.Sin_DateSurvenance >= DATE_REF - pd.DateOffset(months=12)) & (sd.RecoursOuvert > 0)]

# Provisions insuffisantes : ajustement prudent (augmente la charge une fois, en mois 1)
insuff = cout[cout.IA_AlerteProvision == "Provision probablement insuffisante"]

# Renouvellement : contrats dont le S/P dépasse 150 % et dont l'échéance tombe dans les 3 mois
sp_c = mvt.pivot_table(index="ContratID", columns="TypeMouvement", values="MontantEUR", aggfunc="sum").fillna(0)
sp_c["SP"] = sp_c.SINISTRE / sp_c.PRIME.replace(0, np.nan)
mois_ech = {m.month: i for i, m in enumerate(MOIS)}
ren = contrats[contrats.MoisEcheance.isin(mois_ech)].merge(sp_c[["SP", "PRIME"]], left_on="ContratID", right_index=True)
ren = ren[ren.SP > 1.5]
prime_mensuelle_ren = ren.PRIME / prime.DateMouvement.dt.to_period("M").nunique()

ACTIONS = [
    dict(id="A1", action="Prévenir les dégâts des eaux", volet="Prévenir", responsable="Direction prévention",
         cible=f"{len(cible_dde)} contrats à risque élevé sans détecteur de fuite", nb=len(cible_dde),
         hypothese="10 à 25 % de dégâts des eaux en moins sur ces contrats (écart observé : -18 %, non causal)",
         kpi="Fréquence dégâts des eaux des contrats équipés vs groupe témoin", lo=.10, hi=.25),
    dict(id="A2", action="Revoir les règlements atypiques avant paiement", volet="Indemniser", responsable="Direction indemnisation",
         cible=f"{len(atyp)} règlements 2026 hors fourchette attendue, puis le flux à venir", nb=len(atyp),
         hypothese="20 à 40 % du dépassement évité par une revue avant paiement",
         kpi="Montant évité par dossier revu ; taux de révision confirmée", lo=.20, hi=.40),
    dict(id="A3", action="Relancer les recours non encaissés", volet="Indemniser", responsable="Service recours",
         cible=f"{len(recours)} dossiers des 12 derniers mois : "
               + f"{recours.RecoursOuvert.sum():,.0f}".replace(",", " ") + " € à encaisser",
         nb=len(recours), hypothese="10 à 25 % du montant encaissé sous 3 mois",
         kpi="Taux d'encaissement des recours", lo=.10, hi=.25),
    dict(id="A4", action="Ajuster les provisions sous-estimées", volet="Fiabiliser", responsable="Actuariat / indemnisation",
         cible=f"{len(insuff)} dossiers ouverts sous la fourchette attendue", nb=len(insuff),
         hypothese="70 à 100 % du complément estimé passé en charge : le S/P se dégrade d'abord, la surprise est évitée",
         kpi="Écart provision / coût final à la clôture", lo=.70, hi=1.0),
    dict(id="A5", action="Réviser le tarif des contrats déficitaires à l'échéance", volet="Renouveler", responsable="Direction technique",
         cible=f"{len(ren)} contrats à S/P > 150 % arrivant à échéance d'ici 3 mois", nb=len(ren),
         hypothese="+5 à +12 % de prime à l'échéance, sans perte de client (à vérifier)",
         kpi="Taux de majoration accepté ; taux de résiliation", lo=.05, hi=.12),
]

# ------------------------------------------------------------------ simulation
sans = np.zeros((TIRAGES, 3))
avec = np.zeros((TIRAGES, 3))
effets = {a["id"]: np.zeros(TIRAGES) for a in ACTIONS}
prime_plus = np.zeros((TIRAGES, 3))
for i in range(TIRAGES):
    eff = {a["id"]: rng.uniform(a["lo"], a["hi"]) for a in ACTIONS}
    for j in range(3):
        n = rng.poisson(lam[j])
        pool, est_dde = pools[j]
        idx = rng.integers(0, len(pool), n)
        montants = pool[idx]
        base = montants.sum()
        sans[i, j] = base
        g1 = montants[est_dde[idx]].sum() * part_dde_cible * eff["A1"] * MONTEE[j]
        g2 = base * part_fuite * eff["A2"] * MONTEE[j]
        g3 = recours.RecoursOuvert.sum() / 3 * eff["A3"] * MONTEE[j]
        c4 = insuff.IA_EcartProvision.sum() * eff["A4"] if j == 0 else 0.0
        p5 = sum(prime_mensuelle_ren[ren.MoisEcheance == MOIS[k].month].sum() for k in range(j + 1)) * eff["A5"]
        avec[i, j] = base - g1 - g2 - g3 + c4
        prime_plus[i, j] = p5
        effets["A1"][i] += g1
        effets["A2"][i] += g2
        effets["A3"][i] += g3
        effets["A4"][i] -= c4
        effets["A5"][i] += p5

sp_sans = sans / primes
sp_avec = avec / (primes + prime_plus)
trim_sans = sans.sum(1) / primes.sum()
trim_avec = avec.sum(1) / (primes.sum() + prime_plus.sum(1))
pct = lambda a: np.percentile(a, [10, 50, 90], axis=0)

# ------------------------------------------------------------------ sorties
# Vue décideur : S/P glissant sur 12 mois (lisse la saisonnalité, c'est l'indicateur suivi en comité)
mens = mvt.pivot_table(index=mvt.DateMouvement.dt.to_period("M"), columns="TypeMouvement", values="MontantEUR", aggfunc="sum")
gl = mens.rolling(12).sum().dropna()
hist = gl.iloc[-12:]
lignes = [dict(Proj_Mois=str(m), Proj_Ordre=k, Proj_Scenario="Historique", Proj_P10=None, Proj_P50=r.SINISTRE / r.PRIME,
               Proj_P90=None) for k, (m, r) in enumerate(hist.iterrows())]
k0 = len(lignes)


def glissant(charges_sim, primes_sim):
    """S/P 12 mois glissants pour chaque mois projeté : mois réels restants + mois simulés."""
    out = np.zeros_like(charges_sim)
    for j in range(3):
        reel = mens.iloc[-(11 - j):] if j < 11 else mens.iloc[0:0]
        out[:, j] = (reel.SINISTRE.sum() + charges_sim[:, :j + 1].sum(1)) / (reel.PRIME.sum() + primes_sim[:, :j + 1].sum(1))
    return out


gl_sans = glissant(sans, np.tile(primes, (TIRAGES, 1)))
gl_avec = glissant(avec, primes + prime_plus)
for nom, arr in (("Sans action", gl_sans), ("Avec le plan IA", gl_avec)):
    q = pct(arr)
    # point de raccord : le dernier mois réel ouvre l'éventail
    last = lignes[-1 if nom == "Sans action" else k0 - 1]
    lignes.append(dict(Proj_Mois=last["Proj_Mois"], Proj_Ordre=k0 - 1, Proj_Scenario=nom,
                       Proj_P10=last["Proj_P50"], Proj_P50=last["Proj_P50"], Proj_P90=last["Proj_P50"]))
    for j, m in enumerate(MOIS):
        lignes.append(dict(Proj_Mois=str(m), Proj_Ordre=k0 + j, Proj_Scenario=nom,
                           Proj_P10=q[0, j], Proj_P50=q[1, j], Proj_P90=q[2, j]))
proj = pd.DataFrame(lignes)
proj.round(4).to_csv(D / "ia_projection.csv", index=False, encoding="utf-8")

pa = []
for a in ACTIONS:
    q = np.percentile(effets[a["id"]], [10, 50, 90])
    pa.append({"Act_ID": a["id"], "Act_Action": a["action"], "Act_Volet": a["volet"], "Act_Responsable": a["responsable"],
               "Act_Cible": a["cible"], "Act_Nb": a["nb"], "Act_Hypothese": a["hypothese"], "Act_KPI": a["kpi"],
               "Act_Effet_P10": round(q[0]), "Act_Effet_P50": round(q[1]), "Act_Effet_P90": round(q[2]),
               "Act_Points_SP": round(q[1] / primes.sum() * 100, 2)})
pd.DataFrame(pa).to_csv(D / "ia_plan_actions.csv", index=False, encoding="utf-8")

# Tâches concrètes, priorisées par le modèle
t1 = cible_dde.sort_values("IA_RangDDE").head(50).assign(
    Tache_Action="A1", Tache_Objet=lambda d: d.ContratID, Tache_Priorite=lambda d: d.IA_ProbaDDE,
    Tache_Motif=lambda d: d.IA_MotifDDE, Tache_Libelle="Proposer la pose d'un détecteur de fuite")
t2 = atyp.merge(sd[["MouvementID", "Sin_Dossier"]], on="MouvementID").sort_values("IA_EcartProvision", ascending=False).assign(
    Tache_Action="A2", Tache_Objet=lambda d: d.Sin_Dossier, Tache_Priorite=lambda d: d.IA_EcartProvision,
    Tache_Motif=lambda d: d.IA_Explication, Tache_Libelle="Revoir le règlement avec le gestionnaire")
t3 = recours.sort_values("RecoursOuvert", ascending=False).head(30).assign(
    Tache_Action="A3", Tache_Objet=lambda d: d.Sin_Dossier, Tache_Priorite=lambda d: d.RecoursOuvert,
    Tache_Motif=lambda d: d.RecoursOuvert.round().astype(int).astype(str) + " € de recours non encaissé",
    Tache_Libelle="Relancer l'assureur adverse")
t4 = insuff.merge(sd[["MouvementID", "Sin_Dossier"]], on="MouvementID").sort_values("IA_EcartProvision", ascending=False).assign(
    Tache_Action="A4", Tache_Objet=lambda d: d.Sin_Dossier, Tache_Priorite=lambda d: d.IA_EcartProvision,
    Tache_Motif=lambda d: d.IA_Explication, Tache_Libelle="Réévaluer la provision")
t5 = ren.sort_values("SP", ascending=False).assign(
    Tache_Action="A5", Tache_Objet=lambda d: d.ContratID, Tache_Priorite=lambda d: d.SP,
    Tache_Motif=lambda d: "S/P " + (d.SP * 100).round().astype(int).astype(str) + " %, échéance en "
    + d.MoisEcheance.map({m.month: m.strftime("%m/%Y") for m in MOIS}),
    Tache_Libelle="Préparer la proposition de renouvellement")
t6 = gli[gli.IA_NiveauImpaye == "Alerte"].sort_values("IA_RangImpaye").head(30).assign(
    Tache_Action="GLI", Tache_Objet=lambda d: d.GLI_BailID, Tache_Priorite=lambda d: d.IA_ProbaImpaye90j,
    Tache_Motif=lambda d: d.IA_MotifImpaye, Tache_Libelle="Contacter le bailleur avant le premier impayé")
cols = ["Tache_Action", "Tache_Objet", "Tache_Libelle", "Tache_Motif", "Tache_Priorite"]
taches = pd.concat([t[cols] for t in (t1, t2, t3, t4, t5, t6)], ignore_index=True)
taches["Tache_Rang"] = taches.groupby("Tache_Action").Tache_Priorite.rank(ascending=False, method="first").astype(int)
taches.round(4).to_csv(D / "ia_taches.csv", index=False, encoding="utf-8")

res = {
    "date_reference": str(DATE_REF.date()), "horizon": [str(m) for m in MOIS], "tirages": TIRAGES,
    "primes_projetees": primes.tolist(), "croissance_nb_sinistres": round(croissance_nb, 3),
    "sp_trimestre_sans_action": [round(float(x), 4) for x in np.percentile(trim_sans, [10, 50, 90])],
    "sp_trimestre_avec_plan": [round(float(x), 4) for x in np.percentile(trim_avec, [10, 50, 90])],
    "gain_points_sp_median": round(float(np.median(trim_sans - trim_avec)) * 100, 2),
    "probabilite_plan_meilleur": round(float((trim_avec < trim_sans).mean()), 3),
    "probabilite_sous_cible_sans": round(float((trim_sans < CIBLE).mean()), 3),
    "probabilite_sous_cible_avec": round(float((trim_avec < CIBLE).mean()), 3),
    "sp_mensuel_sans": pct(sp_sans).round(4).tolist(), "sp_mensuel_avec": pct(sp_avec).round(4).tolist(),
    "sp_glissant_12m_actuel": round(float(hist.iloc[-1].SINISTRE / hist.iloc[-1].PRIME), 4),
    "sp_glissant_12m_fin_sans": [round(float(x), 4) for x in np.percentile(gl_sans[:, -1], [10, 50, 90])],
    "sp_glissant_12m_fin_avec": [round(float(x), 4) for x in np.percentile(gl_avec[:, -1], [10, 50, 90])],
    "actions": pa, "taches": taches.Tache_Action.value_counts().to_dict(),
    "avertissement": "Projection sur données synthétiques ; efficacités = hypothèses de cadrage à mesurer par groupe témoin."}
(RACINE / "evidence" / "ia-plan.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
print("plan :", res["sp_trimestre_sans_action"], res["sp_trimestre_avec_plan"], res["gain_points_sp_median"])
