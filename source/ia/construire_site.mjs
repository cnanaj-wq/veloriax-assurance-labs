// Construit data.js pour la version web (GitHub Pages) à partir de Qlik (lecture seule, outils MCP)
// et des sorties IA. Usage : node ia/construire_site.mjs <dossier du site>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTILS } from './mcp/serveur.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.argv[2] || path.join(RACINE, '..', 'veloriax-assurance-labs');
const D = path.join(RACINE, 'data_prototype'), E = path.join(RACINE, 'evidence');
const run = (n, a = {}) => OUTILS.find(o => o.name === n).run(a);
const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const nombre = s => Number(String(s).replace(/[^\d,.-]/g, '').replace(',', '.'));

function csv(nom) {
  const t = fs.readFileSync(path.join(D, nom), 'utf8').replace(/^﻿/, '');
  const lignes = []; let champ = '', ligne = [], q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') q = false; else champ += c; }
    else if (c === '"') q = true; else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n') { ligne.push(champ.replace(/\r$/, '')); lignes.push(ligne); ligne = []; champ = ''; } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [tete, ...corps] = lignes;
  return corps.filter(l => l.length === tete.length).map(l => Object.fromEntries(tete.map((h, i) => [h, l[i]])));
}

const kpi = await run('kpi_portefeuille', {});
const regions = (await run('expliquer_ecart', { axe: 'region', top: 20 })).lignes;
const garanties = (await run('expliquer_ecart', { axe: 'garantie', filtres: { annee: 2026 }, top: 20 })).lignes;
const controles = (await run('gouvernance', { sujet: 'controles' })).controles;
const plan = json(path.join(E, 'ia-plan.json')), bt = json(path.join(E, 'ia-backtest.json')), veille = json(path.join(E, 'ia-veille.json'));

const donnees = {
  genere_le: new Date().toISOString().slice(0, 10),
  kpi: { primes: nombre(kpi.primes), charges: nombre(kpi.charges), sp: nombre(kpi.charges) / nombre(kpi.primes), cible: 0.68, ecart: nombre(kpi.ecart_cible), contrats: 12000, mouvements: 418863 },
  regions: regions.map(r => ({ nom: r.region, ecart: nombre(r.ecart_cible), primes: nombre(r.primes), charges: nombre(r.charges), sp: nombre(r.charges) / nombre(r.primes) })),
  garanties: garanties.map(g => ({ nom: g.garantie, charges: nombre(g.charges), part: nombre(g.part) / 100 })),
  projection: csv('ia_projection.csv').map(r => ({ mois: r.Proj_Mois, ordre: +r.Proj_Ordre, scenario: r.Proj_Scenario, p10: r.Proj_P10 === '' ? null : +r.Proj_P10, p50: +r.Proj_P50, p90: r.Proj_P90 === '' ? null : +r.Proj_P90 })),
  plan: { trimestre_sans: plan.sp_trimestre_sans_action, trimestre_avec: plan.sp_trimestre_avec_plan, proba_mieux: plan.probabilite_plan_meilleur, tirages: plan.tirages, gain_points: plan.gain_points_sp_median, glissant_actuel: plan.sp_glissant_12m_actuel, glissant_sans: plan.sp_glissant_12m_fin_sans, glissant_avec: plan.sp_glissant_12m_fin_avec },
  actions: csv('ia_plan_actions.csv').map(a => ({ id: a.Act_ID, action: a.Act_Action, volet: a.Act_Volet, responsable: a.Act_Responsable, cible: a.Act_Cible, nb: +a.Act_Nb, hypothese: a.Act_Hypothese, kpi: a.Act_KPI, p10: +a.Act_Effet_P10, p50: +a.Act_Effet_P50, p90: +a.Act_Effet_P90, points: +a.Act_Points_SP })),
  taches: csv('ia_taches.csv').filter(t => +t.Tache_Rang <= 5).map(t => ({ action: t.Tache_Action, objet: t.Tache_Objet, geste: t.Tache_Libelle, motif: t.Tache_Motif, rang: +t.Tache_Rang })),
  modeles: { dde: bt.prevention_dde, cout: bt.cout_final, gli: bt.gli_impaye },
  scores: {
    dde: csv('ia_prevention_dde.csv').filter(r => r.IA_NiveauDDE === 'Élevé').sort((a, b) => b.IA_ProbaDDE - a.IA_ProbaDDE).slice(0, 25).map(r => ({ id: r.ContratID, proba: +r.IA_ProbaDDE, motif: r.IA_MotifDDE })),
    cout: csv('ia_cout_final.csv').filter(r => r.IA_AlerteProvision === 'Provision probablement insuffisante').sort((a, b) => b.IA_EcartProvision - a.IA_EcartProvision).slice(0, 25).map(r => ({ id: r.MouvementID, attendu: +r.IA_CoutFinal, bas: +r.IA_CoutBas, haut: +r.IA_CoutHaut, ecart: +r.IA_EcartProvision, explication: r.IA_Explication })),
    gli: csv('ia_gli_impaye.csv').filter(r => r.IA_NiveauImpaye === 'Alerte').sort((a, b) => b.IA_ProbaImpaye90j - a.IA_ProbaImpaye90j).slice(0, 25).map(r => ({ id: r.GLI_BailID, proba: +r.IA_ProbaImpaye90j, motif: r.IA_MotifImpaye, loyers: +r.IA_LoyersExposes })),
  },
  gouvernance: {
    kpi: csv('gouv_kpi.csv').map(k => ({ nom: k.Gouv_Nom, definition: k.Gouv_Definition, regle: k.Gouv_Regle, proprietaire: k.Gouv_Proprietaire, controle: k.Gouv_Controle })),
    modeles: csv('gouv_modeles.csv').map(m => ({ nom: m.Mod_Nom, type: m.Mod_Type, question: m.Mod_Question, validation: m.Mod_Validation, usage: m.Mod_Usage, limites: m.Mod_Limites })),
    controles: controles.map(c => ({ id: c.id, controle: c.controle, statut: c.statut })),
    charte: fs.readFileSync(path.join(RACINE, 'ia', 'corpus', 'charte-ia.md'), 'utf8').split('\n').filter(l => /^\d+\./.test(l)).map(l => l.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim()),
  },
  veille,
  sessions: json(path.join(RACINE, 'ia', 'sessions', 'sessions-copilote.json')).map(({ question, reponse, outils, sources }) => ({ question, reponse, outils, sources })),
};
fs.mkdirSync(SITE, { recursive: true });
fs.writeFileSync(path.join(SITE, 'data.js'), '// Données générées par ia/construire_site.mjs · données synthétiques\nwindow.VX = ' + JSON.stringify(donnees) + ';\n');
console.log('data.js', Math.round(fs.statSync(path.join(SITE, 'data.js')).size / 1024) + ' Ko', donnees.regions.length, 'régions', donnees.actions.length, 'actions', donnees.gouvernance.charte.length, 'règles de charte');
process.exit(0);
