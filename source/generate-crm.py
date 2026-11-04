import csv,random,json
from datetime import date,timedelta
from pathlib import Path
rng=random.Random(20261029);root=Path('data_prototype');clients=[];events=[]
regions=['Île-de-France','Auvergne-Rhône-Alpes','Nouvelle-Aquitaine','Occitanie','Provence-Alpes-Côte d’Azur']
for i in range(1,1201):
 cid=f'CRM-{i:05d}';state=['Résilié','Actif','Abandon'][i%3];start=date(2025,1,1)+timedelta(days=rng.randrange(330));steps=[]
 def add(label,dt,detail):steps.append({'CRM_Client':cid,'CRM_Ordre':len(steps)+1,'CRM_Etape':label,'CRM_DateEvenement':str(dt),'CRM_Detail':detail})
 add('Demande de devis',start,'Besoin déclaré · multirisque habitation');docs=start+timedelta(days=rng.randrange(1,5));add('Pièces reçues',docs,'Pièces complètes dans le scénario synthétique')
 if state=='Abandon':
  end=docs+timedelta(days=14);add('Relance conseiller',docs+timedelta(days=5),'Relance sans réponse');add('Devis abandonné',end,'Absence de suite · motif simulé');signed='';delay=''
 else:
  sign=docs+timedelta(days=rng.randrange(1,5));signed=str(sign);delay=(sign-start).days;add('Signature',sign,'Contrat fictif signé');effect=sign+timedelta(days=1);add('Prise d’effet',effect,'Garanties activées dans le scénario');add('Suivi du contrat',effect+timedelta(days=30),'Point de suivi du conseiller')
  if state=='Résilié':
   request=effect+timedelta(days=rng.randrange(70,180));add('Demande de résiliation',request,'Motif déclaré : changement de situation');end=request+timedelta(days=30);add('Résiliation effective',end,'Contrat clôturé · délai synthétique de 30 jours, sans portée juridique')
  else:
   end=date(2026,10,28);add('Contrat toujours actif',end,'Aucune résiliation observée à la date d’arrêté')
 clients.append({'CRM_Client':cid,'CRM_Region':regions[(i-1)%5],'CRM_Agence':f'Agence CRM {(i-1)%60+1:03d}','CRM_Canal':['Web','Agence','Courtier'][i%3],'CRM_Statut':state,'CRM_DateDevis':str(start),'CRM_DateSignature':signed,'CRM_DelaiSignature':delay,'CRM_DateFinObservation':str(end)})
 events.extend(steps)
for name,rows in [('crm_clients.csv',clients),('crm_evenements.csv',events)]:
 with open(root/name,'w',newline='',encoding='utf-8') as f:w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
assert len({r['CRM_Client'] for r in clients})==1200
for c in clients:
 ds=[e['CRM_DateEvenement'] for e in events if e['CRM_Client']==c['CRM_Client']];assert ds==sorted(ds);assert max(ds)<='2026-10-28'
json.dump({'clients':len(clients),'events':len(events),'statuses':{s:sum(c['CRM_Statut']==s for c in clients) for s in ['Actif','Résilié','Abandon']},'scope':'Cohorte CRM indépendante du portefeuille financier, 100% synthétique'},open('evidence/crm-source-audit.json','w'),ensure_ascii=False,indent=2)
print(len(clients),len(events))
