"""VELORIAX ASSURANCE LABS — couche prédictive.

Trois modèles entraînés sur les données synthétiques de l'application, chacun validé sur une période future
qu'il n'a jamais vue (backtest temporel), puis appliqués à la date de référence.
Sorties : data_prototype/ia_*.csv (chargés dans Qlik) et evidence/ia-backtest.json.
Usage : python -I ia/modeles.py <racine du projet>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, roc_auc_score

RACINE = Path(sys.argv[1])
D = RACINE / "data_prototype"
GRAINE = 20261104
ALEA = np.random.default_rng(GRAINE)


def lire(f, **k):
    return pd.read_csv(D / f, encoding="utf-8", **k)


contrats = lire("contrats.csv").merge(lire("contrats_profil.csv", parse_dates=["DateEffet"]), on="ContratID")
mvt = lire("mouvements.csv", parse_dates=["DateMouvement"])
sin = mvt[mvt.TypeMouvement == "SINISTRE"].merge(
    lire("sinistres_dossiers.csv", parse_dates=["Sin_DateSurvenance", "Sin_DateDeclaration", "Sin_DateCloture"]),
    on="MouvementID")
DATE_REF = mvt.DateMouvement.max().normalize()
preuves = {"date_reference": str(DATE_REF.date()), "graine": GRAINE, "donnees": "synthétiques"}


def cat(df, cols):
    for c in cols:
        df[c] = df[c].astype("category")
    return df


def part_captee(y, score, part):
    """Part des cas réels captés en traitant la fraction `part` des dossiers les mieux scorés."""
    n = max(1, int(len(score) * part))
    idx = np.argsort(-(score + ALEA.random(len(score)) * 1e-9))[:n]
    return float(y[idx].sum() / max(1, y.sum()))


def classif():
    return HistGradientBoostingClassifier(max_iter=250, learning_rate=0.05, max_depth=4,
                                          categorical_features="from_dtype", random_state=GRAINE)


# =========================================================== 1. Prévention : dégât des eaux par contrat
PROFIL = ["Region", "Activite", "TrancheSurface", "CanalDistribution", "DetecteurFuite"]


def base_dde(t, fin):
    h = sin[(sin.DateMouvement < t) & (sin.DateMouvement >= t - pd.DateOffset(months=12))]
    f = contrats[["ContratID", "Franchise", "DateEffet"] + PROFIL].copy()
    f["Anciennete"] = (t - f.DateEffet).dt.days / 365.25
    f = f.merge(h.groupby("ContratID").size().rename("Nb_12m"), on="ContratID", how="left")
    f = f.merge(h[h.Garantie == "Dégâts des eaux"].groupby("ContratID").size().rename("NbDDE_12m"),
                on="ContratID", how="left")
    f = f.merge(h.groupby("ContratID").MontantEUR.sum().rename("Cout_12m"), on="ContratID", how="left")
    f[["Nb_12m", "NbDDE_12m", "Cout_12m"]] = f[["Nb_12m", "NbDDE_12m", "Cout_12m"]].fillna(0)
    if fin is not None:
        fut = sin[(sin.DateMouvement >= t) & (sin.DateMouvement < fin) & (sin.Garantie == "Dégâts des eaux")]
        f["y"] = f.ContratID.isin(fut.ContratID).astype(int)
    return cat(f, PROFIL)


X_DDE = PROFIL + ["Franchise", "Anciennete", "Nb_12m", "NbDDE_12m", "Cout_12m"]
tr = base_dde(pd.Timestamp("2025-01-01"), pd.Timestamp("2025-11-01"))
te = base_dde(pd.Timestamp("2026-01-01"), pd.Timestamp("2026-11-01"))
mod = classif().fit(tr[X_DDE], tr.y)
p = mod.predict_proba(te[X_DDE])[:, 1]
y = te.y.values
regle = (te.NbDDE_12m > 0).astype(float).values + (te.DetecteurFuite == "Non").astype(float).values * 0.5
preuves["prevention_dde"] = {
    "question": "Quels contrats auront un dégât des eaux dans les 10 prochains mois ?",
    "apprentissage": "historique 2024 -> dégâts des eaux janv.-oct. 2025",
    "test": "historique 2025 -> dégâts des eaux janv.-oct. 2026 (jamais vu par le modèle)",
    "contrats_test": int(len(y)), "taux_reel": round(float(y.mean()), 4),
    "auc_modele": round(roc_auc_score(y, p), 3), "auc_regle_simple": round(roc_auc_score(y, regle), 3),
    "regle_simple": "déjà eu un dégât des eaux sur 12 mois, puis absence de détecteur de fuite",
    "part_captee_top10_modele": round(part_captee(y, p, .10), 3),
    "part_captee_top20_modele": round(part_captee(y, p, .20), 3),
    "part_captee_top20_regle": round(part_captee(y, regle, .20), 3),
    "attendus_vs_observes": [round(float(p.sum())), int(y.sum())]}

full = pd.concat([tr, te])
mod = classif().fit(full[X_DDE], full.y)
sc = base_dde(DATE_REF + pd.Timedelta(days=1), None)
sc["IA_ProbaDDE"] = mod.predict_proba(sc[X_DDE])[:, 1]
cout_moyen_dde = float(sin[sin.Garantie == "Dégâts des eaux"].MontantEUR.mean())
sc["IA_ChargeDDEAttendue"] = sc.IA_ProbaDDE * cout_moyen_dde
sc["IA_RangDDE"] = sc.IA_ProbaDDE.rank(ascending=False, method="first").astype(int)
sc["IA_NiveauDDE"] = np.where(sc.IA_RangDDE <= len(sc) * .1, "Élevé",
                              np.where(sc.IA_RangDDE <= len(sc) * .3, "Modéré", "Faible"))


def motif_dde(r):
    m = []
    if r.NbDDE_12m > 0:
        m.append(f"{int(r.NbDDE_12m)} dégât(s) des eaux sur 12 mois")
    if r.DetecteurFuite == "Non":
        m.append("sans détecteur de fuite")
    if r.TrancheSurface in ("400–1 000 m²", "> 1 000 m²"):
        m.append(f"surface {r.TrancheSurface}")
    if r.Nb_12m >= 2 and r.NbDDE_12m == 0:
        m.append(f"{int(r.Nb_12m)} sinistres sur 12 mois")
    return " · ".join(m[:3]) or "profil d'activité exposé"


sc["IA_MotifDDE"] = sc.apply(motif_dde, axis=1)
sc[["ContratID", "IA_ProbaDDE", "IA_ChargeDDEAttendue", "IA_RangDDE", "IA_NiveauDDE", "IA_MotifDDE"]].round(4) \
    .to_csv(D / "ia_prevention_dde.csv", index=False, encoding="utf-8")
haut = sc[sc.IA_NiveauDDE == "Élevé"]
ob = te.groupby("DetecteurFuite", observed=True).y.mean()
preuves["prevention_dde"]["score"] = {
    "contrats_eleves": int(len(haut)), "dont_sans_detecteur": int((haut.DetecteurFuite == "Non").sum()),
    "charge_dde_attendue_eleves": round(float(haut.IA_ChargeDDEAttendue.sum())),
    "charge_dde_attendue_totale": round(float(sc.IA_ChargeDDEAttendue.sum())),
    "cout_moyen_dde": round(cout_moyen_dde),
    "frequence_observee_2026_par_detecteur": {k: round(float(v), 4) for k, v in ob.items()}}

# =========================================================== 2. Indemnisation : coût final des sinistres
sin["Delai"] = (sin.Sin_DateDeclaration - sin.Sin_DateSurvenance).dt.days
sin["MoisSurv"] = sin.Sin_DateSurvenance.dt.month
s2 = sin.merge(contrats[["ContratID", "Franchise"] + PROFIL], on="ContratID")
C2 = ["Garantie", "Sin_Cause", "Sin_Expertise", "Sin_ConventionIRSI", "Sin_CanalDeclaration"] + PROFIL
s2 = cat(s2, C2)
X2 = C2 + ["Franchise", "Delai", "MoisSurv"]
clos = s2[s2.Sin_Statut == "Clos"]
tr2 = clos[clos.Sin_DateSurvenance < "2026-01-01"]
te2 = clos[clos.Sin_DateSurvenance >= "2026-01-01"]


def quantile(alpha, d):
    return HistGradientBoostingRegressor(loss="quantile", quantile=alpha, max_iter=300, learning_rate=0.05,
                                         max_depth=5, categorical_features="from_dtype",
                                         random_state=GRAINE).fit(d[X2], d.Sin_Regle)


m50, m10, m90 = quantile(.5, tr2), quantile(.1, tr2), quantile(.9, tr2)
p50 = m50.predict(te2[X2])
med_cause = te2.Sin_Cause.astype(str).map(tr2.groupby("Sin_Cause", observed=True).Sin_Regle.median()
                                          .rename(index=str)).astype(float).values
couv = float(((te2.Sin_Regle >= m10.predict(te2[X2])) & (te2.Sin_Regle <= m90.predict(te2[X2]))).mean())
preuves["cout_final"] = {
    "question": "Combien coûtera réellement un sinistre encore ouvert ?",
    "apprentissage": "sinistres clos survenus en 2024-2025", "test": "sinistres clos survenus en 2026 (jamais vus)",
    "sinistres_test": int(len(te2)),
    "erreur_moyenne_modele_eur": round(mean_absolute_error(te2.Sin_Regle, p50)),
    "erreur_moyenne_mediane_par_cause_eur": round(mean_absolute_error(te2.Sin_Regle, med_cause)),
    "couverture_intervalle_80": round(couv, 3)}

m50, m10, m90 = quantile(.5, clos), quantile(.1, clos), quantile(.9, clos)
ouv = s2[s2.Sin_Statut != "Clos"].copy()
ouv["IA_CoutFinal"] = m50.predict(ouv[X2])
ouv["IA_CoutBas"] = m10.predict(ouv[X2])
ouv["IA_CoutHaut"] = m90.predict(ouv[X2])
ouv["ChargeActuelle"] = ouv.Sin_Regle + ouv.Sin_Provision
ouv["IA_EcartProvision"] = ouv.IA_CoutFinal - ouv.ChargeActuelle
ouv["IA_AlerteProvision"] = np.where(ouv.ChargeActuelle < ouv.IA_CoutBas, "Provision probablement insuffisante",
                                     np.where(ouv.ChargeActuelle > ouv.IA_CoutHaut,
                                              "Provision probablement excessive", "Cohérente"))
cl = s2[(s2.Sin_Statut == "Clos") & (s2.Sin_DateSurvenance >= "2026-01-01")].copy()
cl["IA_CoutFinal"] = m50.predict(cl[X2])
cl["IA_CoutBas"] = m10.predict(cl[X2])
cl["IA_CoutHaut"] = m90.predict(cl[X2])
atyp = cl[cl.Sin_Regle > cl.IA_CoutHaut * 1.5].copy()
atyp["IA_EcartProvision"] = atyp.Sin_Regle - atyp.IA_CoutFinal
atyp["IA_AlerteProvision"] = "Règlement atypique à revoir"
cols = ["MouvementID", "IA_CoutFinal", "IA_CoutBas", "IA_CoutHaut", "IA_EcartProvision", "IA_AlerteProvision"]
out2 = pd.concat([ouv[cols], atyp[cols]])
out2["IA_Explication"] = ("Attendu entre " + out2.IA_CoutBas.round(-1).astype(int).astype(str) + " et "
                          + out2.IA_CoutHaut.round(-1).astype(int).astype(str) + " € pour ce profil de dossier")
out2.round(0).to_csv(D / "ia_cout_final.csv", index=False, encoding="utf-8")
ins = ouv[ouv.IA_AlerteProvision == "Provision probablement insuffisante"]
preuves["cout_final"]["score"] = {
    "sinistres_ouverts": int(len(ouv)), "provisions_insuffisantes": int(len(ins)),
    "complement_estime_eur": round(float(ins.IA_EcartProvision.sum())),
    "provisions_excessives": int((ouv.IA_AlerteProvision == "Provision probablement excessive").sum()),
    "ecart_net_dossiers_ouverts_eur": round(float(ouv.IA_EcartProvision.sum())),
    "reglements_atypiques_2026": int(len(atyp)),
    "montant_au_dela_attendu_eur": round(float(atyp.IA_EcartProvision.sum()))}

# =========================================================== 3. GLI : impayé anticipé
baux = lire("gli_baux.csv", parse_dates=["GLI_DateEffet", "GLI_DateFin"])
ech = lire("gli_echeances.csv", parse_dates=["GLI_Echeance"])
dos = lire("gli_dossiers.csv", parse_dates=["GLI_DatePremierImpaye", "GLI_DateCloture"])
ech["Retard"] = ech.GLI_Statut.isin(["Retard", "Partiel", "Impayé"]).astype(int)
ech["Partiel"] = (ech.GLI_Statut == "Partiel").astype(int)
C3 = ["GLI_TypeBien", "GLI_Profil", "GLI_SuiviAuto"]


def base_gli(t, avec_y=True):
    actifs = baux[(baux.GLI_DateEffet <= t - pd.DateOffset(months=6))
                  & (baux.GLI_DateFin.isna() | (baux.GLI_DateFin > t))]
    en_cours = dos[(dos.GLI_DatePremierImpaye <= t)
                   & (dos.GLI_DateCloture.isna() | (dos.GLI_DateCloture > t))].GLI_BailID
    actifs = actifs[~actifs.GLI_BailID.isin(en_cours)]
    e6 = ech[(ech.GLI_Echeance <= t) & (ech.GLI_Echeance > t - pd.DateOffset(months=6))]
    e3 = e6[e6.GLI_Echeance > t - pd.DateOffset(months=3)]
    f = actifs[["GLI_BailID", "GLI_Loyer", "GLI_TauxEffort"] + C3].copy()
    a6 = e6.groupby("GLI_BailID").agg(Ret6=("Retard", "sum"), Part6=("Partiel", "sum"),
                                      JMoy6=("GLI_JoursRetard", "mean"), JMax6=("GLI_JoursRetard", "max"))
    a3 = e3.groupby("GLI_BailID").agg(Ret3=("Retard", "sum"), JMoy3=("GLI_JoursRetard", "mean"))
    f = f.merge(a6, on="GLI_BailID", how="left").merge(a3, on="GLI_BailID", how="left")
    f[["Ret6", "Part6", "Ret3"]] = f[["Ret6", "Part6", "Ret3"]].fillna(0)
    f["Tendance"] = f.JMoy3 - f.JMoy6
    f["DossiersPasses"] = f.GLI_BailID.map(dos[dos.GLI_DatePremierImpaye <= t].groupby("GLI_BailID").size()).fillna(0)
    f["t"] = t
    if avec_y:
        fut = dos[(dos.GLI_DatePremierImpaye > t) & (dos.GLI_DatePremierImpaye <= t + pd.Timedelta(days=90))]
        f = f.merge(fut.groupby("GLI_BailID").GLI_DatePremierImpaye.min().rename("DateImpaye"),
                    on="GLI_BailID", how="left")
        f["y"] = f.DateImpaye.notna().astype(int)
    return cat(f, C3)


X3 = C3 + ["GLI_Loyer", "GLI_TauxEffort", "Ret6", "Part6", "JMoy6", "JMax6", "Ret3", "JMoy3", "Tendance",
           "DossiersPasses"]
tr3 = pd.concat([base_gli(t + pd.Timedelta(days=5)) for t in pd.date_range("2024-10-01", "2025-09-01", freq="MS")])
te3 = pd.concat([base_gli(t + pd.Timedelta(days=5)) for t in pd.date_range("2026-01-01", "2026-07-01", freq="MS")])
m3 = classif().fit(tr3[X3], tr3.y)
p3 = m3.predict_proba(te3[X3])[:, 1]
y3 = te3.y.values
# Règle de vigilance déjà présente dans l'application (score par points) : la référence à battre
r3 = (te3.Ret3.clip(upper=3) * 2 + (te3.Part6 > 0) * 2 + (te3.GLI_TauxEffort > 35) * 2
      + te3.GLI_Profil.isin(["CDD / intérim", "Indépendant"]).astype(int)
      + (te3.JMoy3.fillna(0) > 7) * 2).astype(float).values
k = int(len(p3) * .05)
top = np.argsort(-p3)[:k]
topr = np.argsort(-(r3 + ALEA.random(len(r3)) * 1e-6))[:k]
vus = te3.iloc[top]
vus = vus[vus.y == 1]
avance = (vus.DateImpaye - vus.t).dt.days
preuves["gli_impaye"] = {
    "question": "Quels locataires vont connaître un premier impayé dans les 90 jours ?",
    "apprentissage": "situations mensuelles oct. 2024 - sept. 2025",
    "test": "situations mensuelles janv. - juil. 2026 (jamais vues)",
    "situations_test": int(len(y3)), "taux_reel": round(float(y3.mean()), 4),
    "auc_modele": round(roc_auc_score(y3, p3), 3), "auc_regle_vigilance": round(roc_auc_score(y3, r3), 3),
    "precision_top5_modele": round(float(y3[top].mean()), 3), "precision_top5_regle": round(float(y3[topr].mean()), 3),
    "rappel_top5_modele": round(float(y3[top].sum() / y3.sum()), 3),
    "rappel_top5_regle": round(float(y3[topr].sum() / y3.sum()), 3),
    "avance_mediane_jours": int(avance.median()) if len(avance) else None}

all3 = pd.concat([tr3, te3])
m3 = classif().fit(all3[X3], all3.y)
t0 = ech.GLI_Echeance.max() + pd.Timedelta(days=1)
sg = base_gli(t0, avec_y=False)
sg["IA_ProbaImpaye90j"] = m3.predict_proba(sg[X3])[:, 1]
sg["IA_RangImpaye"] = sg.IA_ProbaImpaye90j.rank(ascending=False, method="first").astype(int)
sg["IA_NiveauImpaye"] = np.where(sg.IA_RangImpaye <= len(sg) * .05, "Alerte",
                                 np.where(sg.IA_RangImpaye <= len(sg) * .15, "À surveiller", "Sans alerte"))


def motif_gli(r):
    m = []
    if r.Ret3 > 0:
        m.append(f"{int(r.Ret3)} retard(s) sur 3 mois")
    if pd.notna(r.Tendance) and r.Tendance > 2:
        m.append("retards qui s'allongent")
    if r.Part6 > 0:
        m.append("paiement partiel récent")
    if r.GLI_TauxEffort > 35:
        m.append(f"taux d'effort {r.GLI_TauxEffort:.0f} %")
    return " · ".join(m[:3]) or "profil fragile"


sg["IA_MotifImpaye"] = sg.apply(motif_gli, axis=1)
sg["IA_LoyersExposes"] = sg.IA_ProbaImpaye90j * sg.GLI_Loyer * 3
sg[["GLI_BailID", "IA_ProbaImpaye90j", "IA_RangImpaye", "IA_NiveauImpaye", "IA_MotifImpaye", "IA_LoyersExposes"]] \
    .round(4).to_csv(D / "ia_gli_impaye.csv", index=False, encoding="utf-8")
al = sg[sg.IA_NiveauImpaye == "Alerte"]
preuves["gli_impaye"]["score"] = {"date_situation": str(t0.date()), "baux_suivis": int(len(sg)),
                                  "baux_en_alerte": int(len(al)),
                                  "loyers_exposes_alerte_eur": round(float(al.IA_LoyersExposes.sum()))}

(RACINE / "evidence" / "ia-backtest.json").write_text(json.dumps(preuves, ensure_ascii=False, indent=1),
                                                       encoding="utf-8")
print(json.dumps(preuves, ensure_ascii=False, indent=1))
