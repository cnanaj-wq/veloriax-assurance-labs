#!/usr/bin/env node
// VELORIAX ASSURANCE LABS — pont local entre le copilote Qlik (volet 14) et les outils MCP.
// http://127.0.0.1:8787  ·  GET /api/etat  ·  POST /api/question {question}
// 1. Routage d'intention déterministe -> appels aux outils MCP (Qlik en lecture seule + mini RAG).
// 2. Réponse rédigée à partir des seuls résultats d'outils, avec les sources citées.
// 3. Si un modèle local Ollama est disponible (VX_OLLAMA_MODEL ou premier modèle installé),
//    il reformule la réponse à partir des mêmes faits ; sinon la réponse déterministe est servie.
// Écoute uniquement sur 127.0.0.1 ; CORS limité à Qlik Sense Desktop.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTILS } from './mcp/serveur.mjs';
import { veille } from './veille.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..');
const PORT = Number(process.env.VX_PONT_PORT || 8787);
const OLLAMA = process.env.VX_OLLAMA_URL || 'http://127.0.0.1:11434';
const ORIGINES = ['http://localhost:4848', 'http://127.0.0.1:4848'];
const outil = async (nom, args = {}) => ({ nom, args, r: await OUTILS.find(o => o.name === nom).run(args) });
const pc = x => (x * 100).toFixed(1).replace('.', ',') + ' %';
const plan = () => JSON.parse(fs.readFileSync(path.join(RACINE, 'evidence', 'ia-plan.json'), 'utf8'));
const sans = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ------------------------------------------------------------------ intentions
const INTENTIONS = [
  {
    id: 'briefing', motifs: /briefing|veille|quoi de neuf|cette semaine|signaux/,
    async faire() {
      const v = await veille();
      return { faits: [{ nom: 'agent_veille', args: { regles: v.alertes.length }, r: { alertes: v.alertes.map(({ id, nom, texte, declenchee, responsable }) => ({ id, nom, texte, declenchee, responsable })) } }], texte: v.resume };
    },
  },
  {
    id: 'ecart', motifs: /ecart|ou se forme|region|derive|pourquoi.*s\/?p/,
    async faire() {
      const k = await outil('kpi_portefeuille', {}), r = await outil('expliquer_ecart', { axe: 'region', top: 3 }), g = await outil('expliquer_ecart', { axe: 'garantie', filtres: { annee: 2026 }, top: 20 });
      const reg = r.r.lignes.slice(0, 3).map(l => `${l.region} (${l.ecart_cible}, S/P ${l.sp})`).join(', ');
      const gar = g.r.lignes.slice(0, 2).map(l => `${l.garantie.toLowerCase()} (${l.part})`).join(' puis ');
      return { faits: [k, r, g], texte: `Le S/P du portefeuille est de ${k.r.sp} pour une cible de ${k.r.cible} : l’écart représente ${k.r.ecart_cible} de charges. Il se concentre sur ${reg}. En 2026, la charge de sinistres vient d’abord : ${gar}. Piste : le volet 13 relie cet écart aux contrats exposés aux dégâts des eaux.` };
    },
  },
  {
    id: 'lundi', motifs: /lundi|lancer|que dois|quoi faire|priorit|cette semaine|action/,
    async faire() {
      const p = await outil('plan_action', {}), t3 = await outil('taches', { action: 'A3', top: 3 }), t1 = await outil('taches', { action: 'A1', top: 3 });
      const top = [...p.r.actions].filter(a => a.points_sp > 0).sort((a, b) => b.points_sp - a.points_sp).slice(0, 2);
      return { faits: [p, t3, t1], texte: `Deux chantiers d’abord. ${top.map(a => `${a.id} ${a.action} (${a.responsable}) : effet médian ${a.effet_median_3_mois} sur 3 mois, fourchette ${a.fourchette}`).join(' ; ')}. Premières tâches : ${t3.r.taches.map(t => t.objet).join(', ')} pour les recours, ${t1.r.taches.map(t => t.objet).join(', ')} pour les détecteurs de fuite. Ces efficacités sont des hypothèses : mesurez-les avec un groupe témoin.` };
    },
  },
  {
    id: 'cible', motifs: /68|sous la cible|revenir|projection|3 mois|trimestre|peut-il|atteindre/,
    async faire() {
      const p = await outil('plan_action', {}), d = await outil('rechercher_documents', { question: 'projection fourchette groupe témoin hypothèse', k: 2 });
      const j = plan();
      return { faits: [p, d], texte: `Pas sur 3 mois. Le S/P glissant 12 mois est à ${pc(j.sp_glissant_12m_actuel)} ; fin janvier 2027 il serait vers ${pc(j.sp_glissant_12m_fin_sans[1])} sans action et ${pc(j.sp_glissant_12m_fin_avec[1])} avec le plan (8 chances sur 10 entre ${pc(j.sp_glissant_12m_fin_avec[0])} et ${pc(j.sp_glissant_12m_fin_avec[2])}). Sur le seul trimestre, le plan gagne environ ${String(j.gain_points_sp_median).replace('.', ',')} point et fait mieux dans ${pc(j.probabilite_plan_meilleur)} des tirages. Revenir à 68 % demande des leviers tarifaires sur plusieurs renouvellements, pas un trimestre.` };
    },
  },
  {
    id: 'provisions', motifs: /provision|reserve|cout final|reglement/,
    async faire() {
      const s = await outil('scores_ia', { modele: 'cout_final', top: 3 });
      const y = s.r.synthese;
      return { faits: [s], texte: `${y.provisions_insuffisantes} dossiers ont une provision probablement insuffisante (complément estimé ${y.complement_estime}), ${y.provisions_excessives} semblent surprovisionnés et ${y.reglements_atypiques} règlements sont atypiques. À revoir en premier : ${s.r.dossiers.map(d => `${d.dossier} (${d.cause}, ${d.ecart})`).join(', ')}. Le modèle couvre 69 % des cas dans son intervalle à 80 % : un gestionnaire valide chaque dossier.` };
    },
  },
  {
    id: 'dde', motifs: /degat|eau|dde|fuite|detecteur/,
    async faire() {
      const s = await outil('scores_ia', { modele: 'degats_des_eaux', top: 3 });
      const y = s.r.synthese;
      return { faits: [s], texte: `${y.contrats_risque_eleve} contrats sont à risque élevé de dégât des eaux, dont ${y.dont_sans_detecteur} sans détecteur de fuite ; charge attendue ${y.charge_dde_attendue_10_mois}. Les plus exposés : ${s.r.contrats.map(c => `${c.contrat} (${c.probabilite}, ${c.motif})`).join(' ; ')}. C’est une probabilité, pas une prédiction de sinistre.` };
    },
  },
  {
    id: 'gli', motifs: /impaye|gli|loyer|bail|baux|locataire/,
    async faire() {
      const s = await outil('scores_ia', { modele: 'impaye_gli', top: 3 });
      return { faits: [s], texte: `${s.r.synthese.baux_en_alerte} baux sont en alerte d’impayé à 90 jours (${s.r.synthese.loyers_exposes_3_mois} de loyers exposés). Exemples : ${s.r.baux.map(b => `${b.bail} (${b.probabilite})`).join(', ')}. Le gain du modèle sur la règle de vigilance actuelle est faible : il complète la règle, il ne la remplace pas.` };
    },
  },
  {
    id: 'gouvernance', motifs: /definition|comment est calcule|regle|gouvern|controle|fiable|source/,
    async faire(q) {
      const qs = sans(q);
      const sujet = /s\/?p|sinistre.*prime|ratio/.test(qs) ? 'sp' : /recours/.test(qs) ? 'recours' : null;
      const k = sujet ? await outil('gouvernance', { sujet }) : null;
      const c = await outil('gouvernance', { sujet: 'controles' }), d = await outil('rechercher_documents', { question: q, k: 2 });
      const ok = c.r.controles.filter(x => x.statut === 'CONFORME').length, ecarts = c.r.controles.filter(x => x.statut === 'ÉCART').length;
      const r = k && k.r.regle ? null : await redigerDocs(q, d.r.passages);
      const defn = k && k.r.regle ? `${k.r.nom} : ${k.r.regle}${k.r.proprietaire ? ` Propriétaire : ${k.r.proprietaire}.` : ''} ` : r?.texte ? r.texte + ' ' : `Selon les documents approuvés : ${d.r.passages.map(p => p.texte.replace(/\s+/g, ' ').slice(0, 220)).join(' … ')} `;
      return { faits: [k, c, d].filter(Boolean), redige: r?.moteur, texte: `${defn}Contrôles : ${ok} recalculés à l’instant et conformes, ${ecarts} écart, ${c.r.controles.length - ok - ecarts} vérifiés au chargement.` };
    },
  },
];

// Le LLM local a deux rôles bornés : (1) comprendre une question libre et choisir l'intention ;
// (2) rédiger une réponse à partir des seuls passages documentaires, sous contrôle des chiffres.
// Les réponses chiffrées (KPI, scores, plan) restent le texte calculé : un modèle de 3 Mds de
// paramètres inversait des conclusions lors des essais du 04/11/2026 (« oui, sous 68 % »).
async function llm(modele, messages, json = false) {
  const r = await fetch(OLLAMA + '/api/chat', { method: 'POST', signal: AbortSignal.timeout(90000), body: JSON.stringify({ model: modele, stream: false, keep_alive: '30m', ...(json ? { format: 'json' } : {}), options: { temperature: 0 }, messages }) });
  return (await r.json()).message?.content?.trim() || '';
}
const nombres = t => (t.match(/\d[\d\s  ]*(?:[.,]\d+)?/g) || []).map(n => n.replace(/[\s  ]/g, '').replace(',', '.')).filter(n => n.length > 1 || Number(n) > 9);
const chiffresSourcés = (sortie, source) => { const ok = new Set(nombres(source)); return nombres(sortie).every(n => ok.has(n)); };

async function redigerDocs(question, passages) {
  const modele = await modeleOllama(); if (!modele || !passages.length) return null;
  const extrait = passages.slice(0, 3).map(p => `[${p.source}] ${p.texte.replace(/\s+/g, ' ').slice(0, 600)}`).join(String.fromCharCode(10));
  try {
    const sortie = await llm(modele, [
      { role: 'system', content: 'Tu réponds à un dirigeant d’assurance en français, en 3 phrases maximum, uniquement à partir des passages fournis. Si les passages ne répondent pas, dis-le. N’ajoute aucun chiffre absent des passages.' },
      { role: 'user', content: `Question : ${question}

Passages :
${extrait}` }]);
    return sortie && chiffresSourcés(sortie, extrait) ? { texte: sortie, moteur: `LLM local ${modele} · rédigé depuis les documents, chiffres contrôlés` } : { texte: null, moteur: 'Copilote local · texte du LLM rejeté (chiffre non sourcé), extrait affiché' };
  } catch { return null; }
}

async function repondre(question) {
  const q = sans(question);
  const modele = await modeleOllama();
  let intention = INTENTIONS.find(i => i.motifs.test(q)), routage = 'règles';
  if (!intention && modele) {
    try {
      const choix = JSON.parse(await llm(modele, [
        { role: 'system', content: 'Classe la question d’un dirigeant d’assurance dans une intention. Réponds en JSON {"intention": "..."}. Intentions : briefing (synthèse de la semaine, alertes), ecart (où se forme l’écart de S/P, régions, garanties), lundi (actions à lancer, priorités), cible (projection, S/P futur, atteindre 68 %), provisions (réserves, coût final, règlements), dde (dégâts des eaux, fuites), gli (impayés de loyers, baux), gouvernance (définition d’un indicateur, règle, contrôles, fiabilité), documents (autre).' },
        { role: 'user', content: question }], true));
      intention = INTENTIONS.find(i => i.id === choix.intention); if (intention) routage = `intention comprise par ${modele}`;
    } catch { }
  }
  let res, moteur = 'Copilote local · réponse calculée' + (modele ? ` · ${routage}` : ', sans LLM');
  if (intention) res = await intention.faire(question);
  else {
    const d = await outil('rechercher_documents', { question, k: 3 });
    res = { faits: [d], texte: d.r.passages.length ? `D’après les documents approuvés : ${d.r.passages.slice(0, 2).map(p => p.texte.replace(/\s+/g, ' ').slice(0, 260)).join(' … ')}` : 'Je n’ai pas de source approuvée pour répondre à cette question.' };
    const r = await redigerDocs(question, d.r.passages); if (r) { if (r.texte) res.texte = r.texte; moteur = r.moteur; }
  }
  if (res.redige) moteur = res.redige;
  const outils = res.faits.map(f => f.nom + (Object.keys(f.args).length ? ' ' + JSON.stringify(f.args) : ''));
  const sources = [...new Set(res.faits.flatMap(f => (f.r.passages || []).map(p => p.source)))];
  return { question, reponse: res.texte, outils, sources, moteur, intention: intention?.id || 'documents' };
}

let cacheModele = { t: 0, v: null };
async function modeleOllama() {
  if (process.env.VX_SANS_LLM) return null;
  if (Date.now() - cacheModele.t < 30000) return cacheModele.v;
  let v = null;
  try { const j = await (await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(1500) })).json(); const noms = (j.models || []).map(m => m.name); v = process.env.VX_OLLAMA_MODEL && noms.includes(process.env.VX_OLLAMA_MODEL) ? process.env.VX_OLLAMA_MODEL : noms[0] || null; } catch { }
  cacheModele = { t: Date.now(), v };
  return v;
}

export { repondre, INTENTIONS };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  http.createServer(async (req, res) => {
    const origine = req.headers.origin;
    if (origine && ORIGINES.includes(origine)) res.setHeader('Access-Control-Allow-Origin', origine);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method === 'OPTIONS') return res.end();
    try {
      if (req.method === 'GET' && req.url === '/api/etat') {
        const m = await modeleOllama();
        return res.end(JSON.stringify({ moteur: m ? `En ligne · calcul + LLM local ${m}` : 'En ligne · calcul sans LLM', outils: OUTILS.map(o => o.name) }));
      }
      if (req.method === 'POST' && req.url === '/api/question') {
        let corps = ''; for await (const c of req) { corps += c; if (corps.length > 4000) throw new Error('Question trop longue'); }
        const q = String(JSON.parse(corps).question || '').trim().slice(0, 500);
        if (!q) { res.statusCode = 400; return res.end(JSON.stringify({ reponse: 'Question vide.' })); }
        return res.end(JSON.stringify(await repondre(q)));
      }
      res.statusCode = 404; res.end(JSON.stringify({ erreur: 'introuvable' }));
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ reponse: 'Erreur : ' + e.message, outils: [] })); }
  }).listen(PORT, '127.0.0.1', () => process.stderr.write(`[veloriax-pont] http://127.0.0.1:${PORT}\n`));
}
