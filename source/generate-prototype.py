from pathlib import Path
import csv,random,json,hashlib,datetime,collections
ROOT=Path(__file__).parent;out=ROOT/'data_prototype';out.mkdir(exist_ok=True)
base=ROOT/'sources/desktop/data';contracts=list(csv.DictReader((base/'contrats.csv').open(encoding='utf-8-sig')));mov=list(csv.DictReader((base/'mouvements.csv').open(encoding='utf-8-sig')))
rng=random.Random(20261029);clookup={c['ContratID']:c for c in contracts};expanded=[]
for c in contracts:
 for n in range(1,101):expanded.append({**c,'ContratID':c['ContratID']+'-'+str(n).zfill(3)})
with (out/'contrats.csv').open('w',encoding='utf-8',newline='') as f:
 w=csv.DictWriter(f,fieldnames=contracts[0].keys());w.writeheader();w.writerows(expanded)
def split(total,n,seed):
 r=random.Random(seed);weights=[r.uniform(.45,1.8) for _ in range(n)];s=sum(weights);parts=[int(total*x/s) for x in weights];rem=total-sum(parts)
 for i in range(rem):parts[i%n]+=1
 return parts
fields=['MouvementID','ContratID','DateMouvement','TypeMouvement','Garantie','MontantEUR']
groups=collections.defaultdict(lambda:[0,0]);years=collections.defaultdict(lambda:{'primes':0,'charges':0,'rows':0,'claims':0});ids=set();zeros=0;negative=0;count=0
with (out/'mouvements.csv').open('w',encoding='utf-8',newline='') as f:
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for year in [2024,2025,2026]:
  for j,m in enumerate(mov):
   month=int(m['DateMouvement'][5:7])
   if year==2026 and month>10:continue
   prime=m['TypeMouvement']=='PRIME';factor=({2024:.88,2025:.94,2026:1}[year] if prime else {2024:.78,2025:.90,2026:1}[year]);total=round(int(m['MontantEUR'])*factor)
   n=100 if prime else random.Random(year*10000+j).randint(10,22)
   parts=split(total,n,j if prime else year*100000+j)
   choices=list(range(1,101)) if prime else random.Random(year*100000+j+1).sample(range(1,101),n)
   for k,(amount,sub) in enumerate(zip(parts,choices)):
    mid=f'{year}-{m["MouvementID"]}-{k+1:03d}';row=dict(MouvementID=mid,ContratID=m['ContratID']+'-'+str(sub).zfill(3),DateMouvement=str(year)+m['DateMouvement'][4:],TypeMouvement=m['TypeMouvement'],Garantie=m['Garantie'],MontantEUR=amount);w.writerow(row)
    if mid in ids:raise ValueError('Duplicate movement')
    ids.add(mid);zeros+=amount==0;negative+=amount<0;count+=1;reg=clookup[m['ContratID']]['Region'];g=(year,month,reg,m['TypeMouvement'],m['Garantie']);groups[g][0]+=amount;groups[g][1]+=1
    years[year]['primes' if prime else 'charges']+=amount;years[year]['rows']+=1;years[year]['claims']+=not prime
report={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'seed':20261029,'synthetic':True,'period':'2024-01-01 / 2026-10-28','contracts':len(expanded),'agencies':120,'movements':count,'years':dict(years),'duplicates':0,'negative':negative,'zero':zeros,'missing':0,'groups':[dict(year=k[0],month=k[1],region=k[2],type=k[3],guarantee=k[4],amount=v[0],rows=v[1]) for k,v in groups.items()],'hashes':{n:hashlib.sha256((out/n).read_bytes()).hexdigest() for n in ['contrats.csv','mouvements.csv']}}
(ROOT/'evidence/prototype-source-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
controls=[('C01','Nombre de contrats',len(expanded)),('C02','Nombre de mouvements',count),('C03','Somme des primes',sum(v['primes'] for v in years.values())),('C04','Somme des charges',sum(v['charges'] for v in years.values())),('C05','Doublons de mouvements',0),('C06','Montants manquants',0),('C07','Types non reconnus',0),('C08','Contrats orphelins',0)]
with (out/'controles.csv').open('w',encoding='utf-8',newline='') as f:
 w=csv.writer(f);w.writerow(['Ctrl_ID','Ctrl_Description','Ctrl_Attendu']);w.writerows(controls)
print(json.dumps({k:v for k,v in report.items() if k!='groups'},ensure_ascii=False,indent=2))
