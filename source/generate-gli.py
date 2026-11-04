# Volet GLI (garantie loyers impayés) — données 100 % synthétiques, scénario pédagogique.
# Liens : GLI_Baux.AgenceID -> Contrats ; Echeances/Dossiers -> GLI_BailID ; Etapes -> GLI_DossierID.
import csv, random, datetime as dt, collections, json, hashlib
from pathlib import Path
ROOT=Path(__file__).parent; D=ROOT/'data_prototype'; REF=dt.date(2026,10,28)
rng=random.Random(20261031)
ag={}
for c in csv.DictReader(open(D/'contrats.csv',encoding='utf-8')): ag[c['AgenceID']]=c['Region']
agences=sorted(ag)
auto={a:(rng.random()<.4) for a in agences}           # hypothèse : suivi automatisé des encaissements
months=[]; y,m=2024,1
while (y,m)<=(2026,10): months.append(dt.date(y,m,5)); m+=1; y,m=(y+1,1) if m>12 else (y,m)
PROF=[('Salarié CDI',.42,.0040),('CDD / intérim',.16,.0110),('Indépendant',.12,.0090),('Étudiant avec garant',.12,.0050),('Retraité',.10,.0025),('Fonctionnaire',.08,.0020)]
TYPES=[('Studio / T1',.25,(420,700)),('T2',.30,(560,900)),('T3',.25,(750,1200)),('T4 et +',.12,(950,1550)),('Maison',.08,(1000,1800))]
def season(d): return {1:1.25,2:1.1,9:1.2,10:1.1}.get(d.month,1.0)
def trend(d): return 1+0.22*((d.year-2024)+ (d.month-1)/12)
baux=[];ech=[];dos=[];eta=[]; nb=0; nd=0
G=[f'Gestionnaire GLI {i:02d}' for i in range(1,7)]
for a in agences:
  for _ in range(rng.randint(35,65)):
    nb+=1; bid=f'BAIL-{nb:05d}'
    tp=rng.choices([t for t,_,_ in TYPES],[w for _,w,_ in TYPES])[0]; lo,hi=dict((t,r) for t,_,r in TYPES)[tp]
    loyer=round(rng.uniform(lo,hi)*(1.35 if ag[a]=='Île-de-France' else 1)/5)*5
    pr,_,hz=rng.choices(PROF,[w for _,w,_ in PROF])[0]
    eff=round(rng.uniform(17,43),1)
    hz*= (1+(eff-30)/12) if eff>30 else 1
    start=dt.date(rng.randint(2018,2026),rng.randint(1,12),1)
    if start>dt.date(2026,8,1): start=dt.date(2026,rng.randint(1,8),1)
    end=None
    if rng.random()<.18: end=dt.date(rng.randint(max(2024,start.year),2026),rng.randint(1,12),1)
    if end and end<=start: end=None
    baux.append(dict(GLI_BailID=bid,AgenceID=a,GLI_TypeBien=tp,GLI_Loyer=loyer,GLI_Profil=pr,GLI_TauxEffort=eff,
       GLI_DateEffet=start.isoformat(),GLI_DateFin=end.isoformat() if end else '',GLI_SuiviAuto='Oui' if auto[a] else 'Non'))
    act=[d for d in months if d>=start.replace(day=5) and (end is None or d<end)]
    i=0; pre=0
    while i<len(act):
      d=act[i]
      h=hz*season(d)*trend(d)
      if rng.random()<h*1.0 and i>=2:
        # épisode d'impayé
        nd+=1; did=f'GLI-{d.year}-{nd:05d}'
        sig=any(e['GLI_Statut'] in('Retard','Partiel') for e in ech[-3:] if e['GLI_BailID']==bid)
        r=rng.random(); k = 1 if r<.40 else 2 if r<.62 else rng.randint(3,5) if r<.86 else rng.randint(6,10)
        k=min(k,len(act)-i)
        for j in range(k): ech.append(dict(GLI_BailID=bid,GLI_Echeance=act[i+j].isoformat(),GLI_Du=loyer,GLI_Paye=0,GLI_JoursRetard='',GLI_Statut='Impayé'))
        first=d; still_open = (i+k>=len(act)) and (end is None)
        det_delay=rng.randint(2,6) if auto[a] else rng.randint(9,35)
        det=first+dt.timedelta(days=det_delay)
        steps=[('Premier impayé',first),('Détection et relance amiable',det)]
        med=det+dt.timedelta(days=rng.randint(8,15))
        imp=loyer*k
        declared = k>=2
        regul = not declared
        decl=ind=clo=None; recv=0; indem=0; proc=False
        complete = rng.random()<.74
        missing='' if complete else rng.choice(['Décompte locatif','Commandement de payer','Bail signé','Justificatifs de solvabilité'])
        if med<=REF and k>=1 and rng.random()<.8: steps.append(('Mise en demeure',med))
        if declared:
          com=first+dt.timedelta(days=rng.randint(32,55))
          if com<=REF: steps.append(('Commandement de payer',com))
          decl=first+dt.timedelta(days=(rng.randint(38,58) if auto[a] else rng.randint(50,95)))
          if decl<=REF:
            steps.append(('Déclaration à l’assureur',decl))
            wait=rng.randint(15,35)+(rng.randint(25,70) if not complete else 0)
            ind=decl+dt.timedelta(days=wait)
            if ind<=REF:
              steps.append(('Indemnisation',ind)); indem=round(imp*rng.uniform(.85,1.0))
              if k>=6 and rng.random()<.7:
                proc=True; pdate=ind+dt.timedelta(days=rng.randint(30,90))
                if pdate<=REF: steps.append(('Procédure d’expulsion',pdate))
              rec=ind+dt.timedelta(days=rng.randint(40,160))
              if rec<=REF and rng.random()<.55:
                recv=round(imp*rng.uniform(.15,.7)); steps.append(('Recouvrement',rec))
                if rng.random()<.6: clo=rec+dt.timedelta(days=rng.randint(5,30))
            else: ind=None
          else: decl=None
        else:
          cure=first+dt.timedelta(days=rng.randint(10,40)+30*(k-1))
          if cure<=REF and not still_open:
            recv=imp; steps.append(('Régularisation',cure)); clo=cure+dt.timedelta(days=rng.randint(1,10))
        if clo and clo>REF: clo=None
        if clo: steps.append(('Clôture',clo))
        etape=steps[-1][0]
        dos.append(dict(GLI_DossierID=did,GLI_BailID=bid,GLI_DatePremierImpaye=first.isoformat(),GLI_DateDetection=det.isoformat() if det<=REF else '',
          GLI_DateDeclaration=decl.isoformat() if decl else '',GLI_DateIndemnisation=ind.isoformat() if ind else '',GLI_DateCloture=clo.isoformat() if clo else '',
          GLI_NbLoyersImpayes=k,GLI_MontantImpaye=imp,GLI_MontantIndemnise=indem,GLI_MontantRecouvre=recv,
          GLI_PiecesCompletes='Oui' if complete else 'Non',GLI_PieceManquante=missing,GLI_EtapeActuelle=etape,
          GLI_Procedure='Oui' if proc else 'Non',GLI_SignalPrealable='Oui' if sig else 'Non',GLI_Gestionnaire=rng.choice(G)))
        for o,(lib,dte) in enumerate(steps,1): eta.append(dict(GLI_DossierID=did,GLI_EtapeOrdre=o,GLI_Etape=lib,GLI_DateEtape=dte.isoformat()))
        i+=k
        if k>=6 and rng.random()<.6: break   # fin de bail après procédure
        continue
      # mois normal (avec signaux faibles avant défaut : on regarde le risque à venir)
      future=hz*season(d)*trend(d)
      risky = rng.random()<min(.9,future*18)
      p_late=.28 if risky else .035; p_part=.14 if risky else .006
      x=rng.random()
      if x<p_part: st='Partiel'; paid=loyer; jr=rng.randint(12,30)  # complément versé en retard
      elif x<p_part+p_late: st='Retard'; paid=loyer; jr=rng.randint(6,28)
      else: st='Payé'; paid=loyer; jr=rng.randint(0,4)
      ech.append(dict(GLI_BailID=bid,GLI_Echeance=d.isoformat(),GLI_Du=loyer,GLI_Paye=paid,GLI_JoursRetard=jr,GLI_Statut=st))
      i+=1
def w(name,rows):
  with open(D/name,'w',encoding='utf-8',newline='') as f:
    wr=csv.DictWriter(f,fieldnames=rows[0].keys()); wr.writeheader(); wr.writerows(rows)
w('gli_baux.csv',baux); w('gli_echeances.csv',ech); w('gli_dossiers.csv',dos); w('gli_etapes.csv',eta)
st=collections.Counter(e['GLI_Statut'] for e in ech)
rep=dict(seed=20261031,reference=str(REF),baux=len(baux),echeances=len(ech),dossiers=len(dos),etapes=len(eta),statuts=st,
 appele=sum(e['GLI_Du'] for e in ech),paye=sum(e['GLI_Paye'] for e in ech),impaye_dossiers=sum(d['GLI_MontantImpaye'] for d in dos),
 indemnise=sum(d['GLI_MontantIndemnise'] for d in dos),recouvre=sum(d['GLI_MontantRecouvre'] for d in dos),
 ouverts=sum(1 for d in dos if not d['GLI_DateCloture']),etapes_actuelles=collections.Counter(d['GLI_EtapeActuelle'] for d in dos),
 signal=collections.Counter(d['GLI_SignalPrealable'] for d in dos),par_annee=collections.Counter(d['GLI_DatePremierImpaye'][:4] for d in dos),
 hashes={n:hashlib.sha256((D/n).read_bytes()).hexdigest()[:16] for n in ['gli_baux.csv','gli_echeances.csv','gli_dossiers.csv','gli_etapes.csv']})
(ROOT/'evidence/gli-source-audit.json').write_text(json.dumps(rep,ensure_ascii=False,indent=1),encoding='utf-8')
print(json.dumps(rep,ensure_ascii=False,indent=1))
