// Ajoute la couche IA (chargement_ia.qvs) au script de Assurance_Decision_Studio_DEV.qvf, recharge et vérifie.
// Garde-fous : sauvegarde préalable du QVF, ouverture par adresse dédiée, contrôle du nom de fichier,
// script de l'app identique au fichier de référence, totaux et absence de clé synthétique vérifiés avant DoSave.
import fs from 'node:fs';
import { connect, DEV, ROOT } from '../engine.mjs';

const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const dossier = `${ROOT}/backups/avant-ia-${stamp}`;
fs.mkdirSync(dossier, { recursive: true });
fs.copyFileSync(DEV, `${dossier}/Assurance_Decision_Studio_DEV.qvf`);
fs.copyFileSync(`${ROOT}/chargement_prototype.qvs`, `${dossier}/chargement_prototype.qvs`);

const MARQUE = '// Durée du script de chargement ; hors sauvegarde QVF.';
const ia = fs.readFileSync(`${ROOT}/chargement_ia.qvs`, 'utf8');
const q = await connect(DEV);
try {
  const a = (await q.call(-1, 'OpenDoc', [DEV])).qReturn.qHandle;
  const fichier = (await q.call(a, 'GetAppLayout')).qLayout.qFileName.replaceAll('\\', '/');
  if (!fichier.endsWith('qlik-assurance-premium/Assurance_Decision_Studio_DEV.qvf')) throw Error('Arrêt : app ouverte = ' + fichier);
  const avant = (await q.call(a, 'GetScript')).qScript;
  const ref = fs.readFileSync(`${ROOT}/chargement_prototype.qvs`, 'utf8');
  if (avant.replace(/\r/g, '') !== ref.replace(/\r/g, '')) throw Error('Arrêt : le script de l\'app diffère de chargement_prototype.qvs');
  let script = avant.replace(/\r/g, '');
  script = script.replace(/\/\/ ===== Couche IA et gouvernance[\s\S]*?\/\/ ===== fin couche IA =====\n?/, '');
  if (!script.includes(MARQUE)) throw Error('Arrêt : marque de fin de script introuvable');
  script = script.replace(MARQUE, ia.replace(/\r/g, '') + '\n' + MARQUE);
  await q.call(a, 'SetScript', [script]);
  const ok = (await q.call(a, 'DoReload', [0, false, false])).qReturn;
  if (!ok) throw Error('Rechargement en échec');
  const tk = (await q.call(a, 'GetTablesAndKeys', [{ qcx: 1000, qcy: 1000 }, { qcx: 0, qcy: 0 }, 30, true, false])).qtr;
  const synth = tk.filter(t => t.qIsSynthetic).map(t => t.qName);
  const ev = async e => (await q.call(a, 'Evaluate', [e])).qReturn;
  const tests = {
    primes: await ev("Sum({<TypeMouvement={'PRIME'}>} MontantEUR)"),
    charges: await ev("Sum({<TypeMouvement={'SINISTRE'}>} MontantEUR)"),
    contrats_scores: await ev('Count(DISTINCT {<IA_ProbaDDE={">=0"}>} ContratID)'),
    provisions_insuffisantes: await ev("Count({<IA_AlerteProvision={'Provision probablement insuffisante'}>} MouvementID)"),
    baux_alerte: await ev("Count({<IA_NiveauImpaye={'Alerte'}>} GLI_BailID)"),
    actions: await ev('Count(DISTINCT Act_ID)'), taches: await ev('Count(Tache_Objet)'), kpi_gouvernes: await ev('Count(Gouv_ID)'),
    tables: tk.map(t => t.qName), cles_synthetiques: synth,
  };
  const attendus = { primes: '31840000', charges: '22465000' };
  for (const [k, v] of Object.entries(attendus)) if (tests[k].replace(/\D/g, '') !== v) throw Error(`Arrêt : ${k} = ${tests[k]}, attendu ${v}`);
  if (synth.length) throw Error('Arrêt : clés synthétiques ' + synth.join(', '));
  await q.call(a, 'DoSave');
  fs.writeFileSync(`${ROOT}/chargement_prototype.qvs`, script);
  fs.writeFileSync(`${ROOT}/evidence/ia-chargement-qlik.json`, JSON.stringify({ sauvegarde: dossier, ...tests }, null, 1));
  console.log(JSON.stringify(tests, null, 1));
} finally { q.close(); }
