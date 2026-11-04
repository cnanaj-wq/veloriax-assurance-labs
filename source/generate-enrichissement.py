# Enrichissement synthétique du modèle VELORIAX : dossiers sinistres (1 dossier = 1 écriture SINISTRE, clé MouvementID)
# et profil des contrats (jointure sur ContratID). Ne modifie ni contrats.csv ni mouvements.csv.
import csv, random, datetime as dt, collections, json, hashlib
from pathlib import Path
ROOT=Path(__file__).parent; D=ROOT/'data_prototype'; REF=dt.date(2026,10,28)
rng=random.Random(20261030)
contrats=list(csv.DictReader(open(D/'contrats.csv',encoding='utf-8')))
mv=list(csv.DictReader(open(D/'mouvements.csv',encoding='utf-8')))
prime=collections.Counter(); sin=collections.defaultdict(list)
for r in mv:
    if r['TypeMouvement']=='PRIME': prime[r['ContratID']]+=int(r['MontantEUR'])
    else: sin[r['ContratID']].append(r)
# ---------- Profil contrats
ACT=[("Cabinet d'expertise comptable",.16),("Cabinet d'avocats",.12),("Bureau d'études / ingénierie",.14),
     ("Agence de communication",.11),("Siège administratif PME",.17),("Centre d'affaires / coworking",.10),
     ("Cabinet de conseil",.12),("Professions de santé (cabinet)",.08)]
# biais de scénario : immeubles anciens / accueil du public plus exposés DDE et vandalisme
BIAS={"Centre d'affaires / coworking":{'Dégâts des eaux':2.2,'Vandalisme':1.8,'Vol':1.5},
      "Siège administratif PME":{'Dégâts des eaux':1.5},"Agence de communication":{'Vol':1.7},
      "Professions de santé (cabinet)":{'Vandalisme':1.6,'Vol':1.3},"Cabinet d'avocats":{'Incendie':.7,'Dégâts des eaux':.7}}
names=[a for a,_ in ACT]; w0=[x for _,x in ACT]
qs=sorted(prime.values()); q=lambda p: qs[int(len(qs)*p)]
prof=[]
for c in contrats:
    cid=c['ContratID']; g=collections.Counter(r['Garantie'] for r in sin[cid])
    w=[]
    for a,base in ACT:
        f=1.0
        for gar,k in BIAS.get(a,{}).items(): f*=k**min(g[gar],3)
        w.append(base*f)
    act=rng.choices(names,w)[0]
    p=prime[cid]
    surf='< 150 m²' if p<q(.3) else '150–400 m²' if p<q(.7) else '400–1 000 m²' if p<q(.93) else '> 1 000 m²'
    canal=rng.choices(['Agent général','Courtier','Vente directe'],[.55,.35,.10])[0]
    fr=rng.choices([150,300,500,1000],[.25,.4,.25,.1])[0]
    eff=dt.date(rng.randint(2012,2024),rng.randint(1,12),1)
    prev=rng.random()<(.22 if act in("Centre d'affaires / coworking","Siège administratif PME") else .35)
    prof.append(dict(ContratID=cid,Activite=act,TrancheSurface=surf,CanalDistribution=canal,Franchise=fr,
                     DateEffet=eff.isoformat(),MoisEcheance=eff.month,DetecteurFuite='Oui' if prev else 'Non'))
with open(D/'contrats_profil.csv','w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=prof[0].keys()); w.writeheader(); w.writerows(prof)
# ---------- Dossiers sinistres
CAUSE={'Dégâts des eaux':[('Fuite canalisation encastrée',.30),('Infiltration toiture / terrasse',.20),('Origine voisine (IRSI)',.25),('Débordement appareil',.12),('Joints / étanchéité sanitaire',.13)],
       'Incendie':[('Court-circuit électrique',.42),('Surtension / foudre',.18),('Appareil de chauffage',.15),('Origine voisine',.15),('Cause indéterminée',.10)],
       'Vol':[('Effraction porte / fenêtre',.55),('Vol de matériel informatique',.30),('Vol sans effraction',.15)],
       'Vandalisme':[('Bris de vitrage',.40),('Tags / dégradation façade',.35),('Dégradation après tentative d\'effraction',.25)]}
DECL={'Dégâts des eaux':(2.0,.9),'Incendie':(.3,.6),'Vol':(.6,.7),'Vandalisme':(1.0,.7)}
reg={c['ContratID']:c['Region'] for c in contrats}
GEST={}
rows=[]; seq=collections.Counter()
sev=sorted(int(r['MontantEUR']) for rs in sin.values() for r in rs)
for cid,rs in sin.items():
    for r in rs:
        gar=r['Garantie']; m=int(r['MontantEUR']); dm=dt.date.fromisoformat(r['DateMouvement'])
        cause=rng.choices([a for a,_ in CAUSE[gar]],[b for _,b in CAUSE[gar]])[0]
        mu,sg=DECL[gar]; dd=min(60,int(rng.lognormvariate(mu,sg)))
        if cause.startswith('Origine voisine') or cause.startswith('Infiltration'): dd+=rng.randint(3,15)
        surv=dm-dt.timedelta(days=dd+rng.randint(0,6)); decl=surv+dt.timedelta(days=dd)
        expert='Oui' if (m>=3500 or gar=='Incendie') else 'Non'
        dur=int(rng.lognormvariate(3.6 if expert=='Non' else 4.3,.55))   # ~37 j / ~75 j
        clo=decl+dt.timedelta(days=dur); reouv=False
        age=(REF-decl).days
        if clo>REF or rng.random()<(.02 if age>365 else 0): clo=None
        if clo and rng.random()<.025: reouv=True; clo=None
        paid=m if clo else int(m*rng.uniform(0,.65))
        irsi='Oui' if cause=='Origine voisine (IRSI)' else 'Non'
        rec_pot=int(m*rng.uniform(.45,.85)) if (irsi=='Oui' or cause=='Origine voisine') else 0
        rec_enc=int(rec_pot*rng.uniform(.3,1)) if (rec_pot and clo and rng.random()<.6) else 0
        canal=rng.choices(['Téléphone','Espace client','Intermédiaire','E-mail'],[.36,.28,.30,.06])[0]
        g=reg[cid]; GEST.setdefault(g,len(GEST)); gnum=GEST[g]*3+rng.randint(1,3)
        seq[surv.year]+=1
        rows.append(dict(MouvementID=r['MouvementID'],Sin_Dossier=f"SIN-{surv.year}-{seq[surv.year]:05d}",
            Sin_DateSurvenance=surv.isoformat(),Sin_DateDeclaration=decl.isoformat(),Sin_DateCloture=clo.isoformat() if clo else '',
            Sin_Statut='Clos' if clo else ('Rouvert' if reouv else 'Ouvert'),Sin_Cause=cause,Sin_Regle=paid,Sin_Provision=m-paid,
            Sin_Expertise=expert,Sin_ConventionIRSI=irsi,Sin_RecoursPotentiel=rec_pot,Sin_RecoursEncaisse=rec_enc,
            Sin_CanalDeclaration=canal,Sin_Gestionnaire=f"Gestionnaire {gnum:02d}"))
with open(D/'sinistres_dossiers.csv','w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
st=collections.Counter(r['Sin_Statut'] for r in rows)
rep=dict(seed=20261030,reference=str(REF),dossiers=len(rows),charge=sum(r['Sin_Regle']+r['Sin_Provision'] for r in rows),
  regle=sum(r['Sin_Regle'] for r in rows),provision=sum(r['Sin_Provision'] for r in rows),statuts=st,
  recours_pot=sum(r['Sin_RecoursPotentiel'] for r in rows),recours_enc=sum(r['Sin_RecoursEncaisse'] for r in rows),
  contrats_profil=len(prof),activites=collections.Counter(p['Activite'] for p in prof),
  hashes={n:hashlib.sha256((D/n).read_bytes()).hexdigest() for n in ['contrats_profil.csv','sinistres_dossiers.csv']})
(ROOT/'evidence/enrichissement-source-audit.json').write_text(json.dumps(rep,ensure_ascii=False,indent=1),encoding='utf-8')
print(json.dumps(rep,ensure_ascii=False,indent=1))
