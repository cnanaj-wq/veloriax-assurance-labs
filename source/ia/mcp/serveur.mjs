#!/usr/bin/env node
// VELORIAX ASSURANCE LABS — serveur MCP (stdio, sans dépendance) entre Qlik Sense et un LLM.
// Lecture seule : objets de session uniquement, aucune sélection, aucun SetProperties, aucun DoSave.
// Outils : KPI gouvernés, décomposition de l'écart, scores IA, plan d'action et projection, tâches,
// contrôles de gouvernance, mini RAG (BM25) sur les documents approuvés.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');
const APP = process.env.VX_QLIK_APP || path.join(RACINE, 'Assurance_Decision_Studio_DEV.qvf').replaceAll('\\', '/');
const MOTEUR = process.env.VX_QLIK_URL || 'ws://localhost:4848/app/';
const journal = (...a) => process.stderr.write('[veloriax-mcp] ' + a.join(' ') + '\n');

// ------------------------------------------------------------------ Qlik (lecture seule)
let qlik = null;
async function moteur() {
  if (qlik) return qlik;
  const ws = new WebSocket(MOTEUR + encodeURIComponent(APP));
  let seq = 0; const attente = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (attente.has(m.id)) { const p = attente.get(m.id); attente.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  ws.addEventListener('close', () => { qlik = null; });
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('Qlik Sense Desktop injoignable (port 4848)')), { once: true }); });
  const call = (h, method, params = []) => new Promise((res, rej) => { const id = ++seq; attente.set(id, { res, rej }); ws.send(JSON.stringify({ jsonrpc: '2.0', id, handle: h, method, params })); });
  const app = (await call(-1, 'OpenDoc', [APP])).qReturn.qHandle;
  const fichier = (await call(app, 'GetAppLayout')).qLayout.qFileName.replaceAll('\\', '/');
  if (!fichier.endsWith(path.basename(APP))) { ws.close(); throw new Error('App inattendue : ' + fichier); }
  qlik = { call, app };
  return qlik;
}
const evaluer = async expr => { const { call, app } = await moteur(); return (await call(app, 'Evaluate', [expr])).qReturn; };
// Evaluate renvoie un texte au format local (espaces, virgule décimale) : conversion explicite
const num = async expr => Number(String(await evaluer(expr)).replace(/[\s  ]/g, '').replace(',', '.'));
async function cube(dims, mesures, { tri = 1, haut = 50 } = {}) {
  const { call, app } = await moteur();
  const def = {
    qInfo: { qType: 'vx-mcp' },
    qHyperCubeDef: {
      qDimensions: dims.map(d => ({ qDef: { qFieldDefs: [d] }, qNullSuppression: true })),
      qMeasures: mesures.map(m => ({ qDef: { qDef: m }, qSortBy: { qSortByNumeric: -1 } })),
      qInterColumnSortOrder: [dims.length + tri - 1, ...dims.map((_, i) => i)],
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: dims.length + mesures.length, qHeight: haut }],
    },
  };
  const ret = (await call(app, 'CreateSessionObject', [def])).qReturn;
  try {
    const l = (await call(ret.qHandle, 'GetLayout')).qLayout;
    return l.qHyperCube.qDataPages[0].qMatrix.map(r => r.map((c, i) => (i < dims.length ? c.qText : (typeof c.qNum === 'number' ? c.qNum : null))));
  } finally { await call(app, 'DestroySessionObject', [ret.qGenericId]).catch(() => {}); }
}

// Filtres -> modificateur d'ensemble (set analysis). Aucune sélection n'est posée.
const CHAMPS = { region: 'Region', annee: 'Annee', mois: 'Mois', garantie: 'Garantie', agence: 'Agence' };
function ensemble(filtres = {}, extra = '') {
  const parts = Object.entries(filtres).filter(([k, v]) => CHAMPS[k] && v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${CHAMPS[k]}={${[].concat(v).map(x => (typeof x === 'number' ? x : `'${String(x).replaceAll("'", "''")}'`)).join(',')}}`);
  if (extra) parts.push(extra);
  return parts.length ? `{<${parts.join(', ')}>}` : '';
}
const P = f => `Sum(${ensemble(f, "TypeMouvement={'PRIME'}")} MontantEUR)`;
const S = f => `Sum(${ensemble(f, "TypeMouvement={'SINISTRE'}")} MontantEUR)`;
const euros = n => Math.round(n).toLocaleString('fr-FR') + ' €';
const pct = n => (n * 100).toFixed(1).replace('.', ',') + ' %';

// ------------------------------------------------------------------ Gouvernance
const G = path.join(RACINE, 'ia', 'gouvernance');
const lireJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const KPI = lireJSON(path.join(G, 'kpi.json'));
const MODELES = lireJSON(path.join(G, 'modeles.json'));
const REGLES = lireJSON(path.join(G, 'regles.json'));
const cible = Number((REGLES.find(r => r.variable === 'vCibleSP') || { valeur: '0.68' }).valeur);

// ------------------------------------------------------------------ Mini RAG (BM25, en mémoire)
const VIDES = new Set('le la les de des du un une et en à a au aux pour par sur dans est sont ce ces que qui ou ne pas plus son sa ses leur on il elle avec'.split(' '));
const jetons = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9%]+/).filter(w => w.length > 1 && !VIDES.has(w));
const PASSAGES = [];
for (const f of fs.readdirSync(path.join(RACINE, 'ia', 'corpus')).filter(f => f.endsWith('.md'))) {
  const texte = fs.readFileSync(path.join(RACINE, 'ia', 'corpus', f), 'utf8');
  const titreDoc = (texte.match(/^# (.+)$/m) || [, f])[1];
  for (const bloc of texte.split(/\n(?=## )/)) {
    const titre = (bloc.match(/^## (.+)$/m) || [, titreDoc])[1];
    const contenu = bloc.replace(/^#+ .+$/gm, '').trim();
    if (contenu.length > 30) PASSAGES.push({ source: `${f} › ${titre}`, texte: contenu.slice(0, 1200), j: jetons(titre + ' ' + contenu) });
  }
}
const DF = new Map(); PASSAGES.forEach(p => new Set(p.j).forEach(w => DF.set(w, (DF.get(w) || 0) + 1)));
const LMOY = PASSAGES.reduce((s, p) => s + p.j.length, 0) / PASSAGES.length;
function rag(question, k = 4) {
  const q = jetons(question); const N = PASSAGES.length;
  return PASSAGES.map(p => {
    const tf = new Map(); p.j.forEach(w => tf.set(w, (tf.get(w) || 0) + 1));
    const score = q.reduce((s, w) => { const f = tf.get(w) || 0; if (!f) return s; const idf = Math.log(1 + (N - DF.get(w) + .5) / (DF.get(w) + .5)); return s + idf * f * 2.2 / (f + 1.2 * (.25 + .75 * p.j.length / LMOY)); }, 0);
    return { source: p.source, texte: p.texte, score: +score.toFixed(2) };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

// ------------------------------------------------------------------ Outils
const filtresSchema = {
  type: 'object', description: 'Filtres facultatifs (appliqués par set analysis, sans toucher aux sélections de l\'utilisateur)',
  properties: { region: { type: 'string' }, annee: { type: 'integer' }, mois: { type: 'integer', description: '1 à 12' }, garantie: { type: 'string' }, agence: { type: 'string' } },
};
const OUTILS = [
  {
    name: 'kpi_portefeuille', description: 'Primes, charges, ratio S/P et écart à la cible, calculés par Qlik selon les définitions gouvernées.',
    inputSchema: { type: 'object', properties: { filtres: filtresSchema } },
    run: async ({ filtres } = {}) => {
      const [p, s] = [(await num(P(filtres))), (await num(S(filtres)))];
      return { perimetre: filtres || 'portefeuille complet', primes: euros(p), charges: euros(s), sp: pct(s / p), cible: pct(cible), ecart_cible: euros(s - cible * p), regle: KPI.find(k => k.id === 'sp').regle };
    },
  },
  {
    name: 'expliquer_ecart', description: 'Décompose l\'écart à la cible de S/P par région, garantie, mois, agence ou activité : où se forme l\'écart.',
    inputSchema: { type: 'object', properties: { axe: { type: 'string', enum: ['region', 'garantie', 'mois', 'agence', 'activite'] }, filtres: filtresSchema, top: { type: 'integer' } }, required: ['axe'] },
    run: async ({ axe, filtres, top = 8 }) => {
      const champ = { region: 'Region', garantie: 'Garantie', mois: 'MoisDate', agence: 'Agence', activite: 'Activite' }[axe];
      if (axe === 'garantie') {
        const l = await cube([champ], [S(filtres)], { haut: top });
        const tot = l.reduce((a, r) => a + r[1], 0);
        return { axe, note: 'Les primes ne sont pas réparties par garantie : on compare les charges, pas un S/P par garantie.', lignes: l.map(r => ({ garantie: r[0], charges: euros(r[1]), part: pct(r[1] / tot) })) };
      }
      const l = await cube([champ], [`${S(filtres)} - ${cible} * ${P(filtres)}`, P(filtres), S(filtres)], { haut: axe === 'mois' ? 60 : top });
      return { axe, cible: pct(cible), lignes: l.map(r => ({ [axe]: r[0], ecart_cible: euros(r[1]), primes: euros(r[2]), charges: euros(r[3]), sp: pct(r[3] / r[2]) })) };
    },
  },
  {
    name: 'scores_ia', description: 'Résultats des modèles prédictifs : contrats exposés aux dégâts des eaux, provisions à revoir, baux à risque d\'impayé. Chaque ligne donne la probabilité et le motif.',
    inputSchema: { type: 'object', properties: { modele: { type: 'string', enum: ['degats_des_eaux', 'cout_final', 'impaye_gli'] }, region: { type: 'string' }, top: { type: 'integer' } }, required: ['modele'] },
    run: async ({ modele, region, top = 10 }) => {
      const r = region ? `, Region={'${region.replaceAll("'", "''")}'}` : '';
      if (modele === 'degats_des_eaux') {
        const synthese = { contrats_risque_eleve: await evaluer(`Count({<IA_NiveauDDE={'Élevé'}${r}>} DISTINCT ContratID)`), dont_sans_detecteur: await evaluer(`Count({<IA_NiveauDDE={'Élevé'}, DetecteurFuite={'Non'}${r}>} DISTINCT ContratID)`), charge_dde_attendue_10_mois: euros((await num(`Sum({<IA_NiveauDDE={'Élevé'}${r}>} IA_ChargeDDEAttendue)`))) };
        const l = await cube(['ContratID', 'Region', 'Activite', 'IA_MotifDDE'], [`Max({<IA_NiveauDDE={'Élevé'}${r}>} IA_ProbaDDE)`], { haut: top });
        return { modele: MODELES[0], synthese, contrats: l.map(x => ({ contrat: x[0], region: x[1], activite: x[2], motif: x[3], probabilite: pct(x[4]) })) };
      }
      if (modele === 'cout_final') {
        const synthese = { provisions_insuffisantes: await evaluer(`Count({<IA_AlerteProvision={'Provision probablement insuffisante'}${r}>} MouvementID)`), complement_estime: euros((await num(`Sum({<IA_AlerteProvision={'Provision probablement insuffisante'}${r}>} IA_EcartProvision)`))), provisions_excessives: await evaluer(`Count({<IA_AlerteProvision={'Provision probablement excessive'}${r}>} MouvementID)`), reglements_atypiques: await evaluer(`Count({<IA_AlerteProvision={'Règlement atypique à revoir'}${r}>} MouvementID)`) };
        const l = await cube(['Sin_Dossier', 'Sin_Cause', 'IA_AlerteProvision', 'IA_Explication'], [`Sum({<IA_AlerteProvision-={'Cohérente'}${r}>} IA_EcartProvision)`], { haut: top });
        return { modele: MODELES[1], synthese, dossiers: l.map(x => ({ dossier: x[0], cause: x[1], alerte: x[2], explication: x[3], ecart: euros(x[4]) })) };
      }
      const synthese = { baux_en_alerte: await evaluer("Count({<IA_NiveauImpaye={'Alerte'}>} GLI_BailID)"), loyers_exposes_3_mois: euros((await num("Sum({<IA_NiveauImpaye={'Alerte'}>} IA_LoyersExposes)"))) };
      const l = await cube(['GLI_BailID', 'GLI_Profil', 'IA_MotifImpaye'], ["Max({<IA_NiveauImpaye={'Alerte'}>} IA_ProbaImpaye90j)"], { haut: top });
      return { modele: MODELES[2], synthese, baux: l.map(x => ({ bail: x[0], profil: x[1], motif: x[2], probabilite: pct(x[3]) })) };
    },
  },
  {
    name: 'plan_action', description: 'Plan d\'action prédictif : actions recommandées, effet attendu sur 3 mois, et projection du S/P (fourchette P10–P90) sans action et avec le plan.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const a = await cube(['Act_ID', 'Act_Action', 'Act_Cible', 'Act_Responsable', 'Act_Hypothese', 'Act_KPI'], ['Sum(Act_Effet_P50)', 'Sum(Act_Effet_P10)', 'Sum(Act_Effet_P90)', 'Sum(Act_Points_SP)'], { tri: 1, haut: 10 });
      const p = await cube(['Proj_Scenario', 'Proj_Mois'], ['Only(Proj_P10)', 'Only(Proj_P50)', 'Only(Proj_P90)'], { haut: 60 });
      const plan = lireJSON(path.join(RACINE, 'evidence', 'ia-plan.json'));
      return {
        avertissement: plan.avertissement,
        trimestre: { sans_action: plan.sp_trimestre_sans_action.map(pct), avec_plan: plan.sp_trimestre_avec_plan.map(pct), gain_median_points: plan.gain_points_sp_median, probabilite_plan_meilleur: pct(plan.probabilite_plan_meilleur) },
        actions: a.map(x => ({ id: x[0], action: x[1], cible: x[2], responsable: x[3], hypothese: x[4], indicateur: x[5], effet_median_3_mois: euros(x[6]), fourchette: `${euros(x[7])} à ${euros(x[8])}`, points_sp: x[9] })),
        projection: p.filter(x => x[0] !== 'Historique').map(x => ({ scenario: x[0], mois: x[1], p10: pct(x[2]), p50: pct(x[3]), p90: pct(x[4]) })),
      };
    },
  },
  {
    name: 'taches', description: 'Tâches concrètes priorisées par l\'IA pour une action du plan (A1 à A5, ou GLI) : objet, geste à faire, motif.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['A1', 'A2', 'A3', 'A4', 'A5', 'GLI'] }, top: { type: 'integer' } }, required: ['action'] },
    run: async ({ action, top = 10 }) => {
      const l = await cube(['Tache_Objet', 'Tache_Libelle', 'Tache_Motif'], [`Min({<Tache_Action={'${action}'}>} Tache_Rang)`], { haut: 200 });
      return { action, taches: l.filter(x => typeof x[3] === 'number').sort((a, b) => a[3] - b[3]).slice(0, top).map(x => ({ rang: x[3], objet: x[0], geste: x[1], motif: x[2] })) };
    },
  },
  {
    name: 'gouvernance', description: 'Définition gouvernée d\'un KPI ou d\'un modèle (règle de calcul, propriétaire, seuil, validation, limites) et état des contrôles de chargement.',
    inputSchema: { type: 'object', properties: { sujet: { type: 'string', description: 'identifiant ou nom de KPI / modèle, ou « controles »' } }, required: ['sujet'] },
    run: async ({ sujet }) => {
      const s = sujet.toLowerCase();
      if (s.startsWith('contr')) {
        const l = await cube(['Ctrl_ID', 'Ctrl_Description'], ['Sum(Ctrl_Attendu)'], { tri: 1, haut: 20 });
        const reel = { C01: 'Count(DISTINCT ContratID)', C02: 'Count(MouvementID)', C03: P(), C04: S() };
        const out = [];
        for (const [id, desc, att] of l) { const r = reel[id] ? (await num(reel[id])) : null; out.push({ id, controle: desc, attendu: att, constate: r, statut: r === null ? 'vérifié au chargement' : Math.abs(r - att) <= 0.005 ? 'CONFORME' : 'ÉCART' }); }
        return { controles: out };
      }
      const k = KPI.find(x => x.id === s || x.nom.toLowerCase().includes(s));
      const m = MODELES.find(x => x.id === s || x.nom.toLowerCase().includes(s));
      return k || m || { introuvable: sujet, kpi_disponibles: KPI.map(x => x.nom), modeles: MODELES.map(x => x.nom) };
    },
  },
  {
    name: 'rechercher_documents', description: 'Mini RAG : cherche dans les documents approuvés (catalogue KPI, règles métier, fiches modèles, charte IA, plan d\'action, lignage) et renvoie les passages avec leur source.',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, k: { type: 'integer' } }, required: ['question'] },
    run: async ({ question, k = 4 }) => ({ passages: rag(question, k) }),
  },
];

// ------------------------------------------------------------------ Protocole MCP (JSON-RPC sur stdio)
const envoyer = m => process.stdout.write(JSON.stringify(m) + '\n');
async function traiter(m) {
  if (m.method === 'initialize') return envoyer({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'veloriax-assurance-labs', version: '1.0.0' }, instructions: 'Copilote de décision assurance IARD. Lecture seule. Citer chaque chiffre avec sa source (outil ou document). Un score est une probabilité, une projection est une fourchette. L\'humain décide.' } });
  if (m.method === 'tools/list') return envoyer({ jsonrpc: '2.0', id: m.id, result: { tools: OUTILS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
  if (m.method === 'tools/call') {
    const o = OUTILS.find(t => t.name === m.params.name);
    try {
      if (!o) throw new Error('Outil inconnu : ' + m.params.name);
      const r = await o.run(m.params.arguments || {});
      return envoyer({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(r, null, 1) }] } });
    } catch (e) { journal(e.stack); return envoyer({ jsonrpc: '2.0', id: m.id, result: { isError: true, content: [{ type: 'text', text: 'Erreur : ' + e.message }] } }); }
  }
  if (m.method === 'ping') return envoyer({ jsonrpc: '2.0', id: m.id, result: {} });
  if (m.id !== undefined) envoyer({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Méthode inconnue' } });
}
export { OUTILS, rag };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let tampon = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { tampon += d; let i; while ((i = tampon.indexOf('\n')) >= 0) { const l = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1); if (l) traiter(JSON.parse(l)).catch(e => journal(e.stack)); } });
  process.stdin.on('end', () => process.exit(0));
  journal(`prêt — app ${path.basename(APP)}, ${PASSAGES.length} passages indexés`);
}
