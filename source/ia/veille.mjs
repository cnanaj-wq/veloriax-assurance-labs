#!/usr/bin/env node
// VELORIAX ASSURANCE LABS — agent de veille proactif (« briefing du lundi »).
// Interroge les mêmes outils MCP que le copilote, applique des règles de déclenchement
// explicites et rédige un briefing court : ce qui a bougé, ce qui mérite une décision, qui agit.
// Sorties : ia/veille/briefing-AAAA-MM-JJ.md et evidence/ia-veille.json. Lecture seule sur Qlik.
// Aucune planification n'est créée ici : la tâche hebdomadaire se programme à part, sur décision.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTILS } from './mcp/serveur.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..');
const run = (nom, args = {}) => OUTILS.find(o => o.name === nom).run(args);
const pc = x => (x * 100).toFixed(1).replace('.', ',') + ' %';
const eur = s => Number(String(s).replace(/[^\d,-]/g, '').replace(',', '.'));

// Règles de déclenchement : seuil, gravité, responsable. Modifiables sans toucher au code des outils.
const REGLES = [
  { id: 'V1', nom: 'S/P glissant 12 mois au-dessus de la cible', seuil: 0.03, unite: 'points', responsable: 'Direction technique' },
  { id: 'V2', nom: 'Dégâts des eaux > 35 % de la charge de l’année', seuil: 0.35, responsable: 'Direction prévention' },
  { id: 'V3', nom: 'Provisions probablement insuffisantes', seuil: 50, responsable: 'Direction indemnisation' },
  { id: 'V4', nom: 'Recours à encaisser', seuil: 300000, responsable: 'Service recours' },
  { id: 'V5', nom: 'Baux GLI en alerte d’impayé', seuil: 150, responsable: 'Gestion GLI' },
];

export async function veille(date = new Date()) {
  const plan = JSON.parse(fs.readFileSync(path.join(RACINE, 'evidence', 'ia-plan.json'), 'utf8'));
  const kpi = await run('kpi_portefeuille', {});
  const gar = await run('expliquer_ecart', { axe: 'garantie', filtres: { annee: 2026 }, top: 20 });
  const reg = await run('expliquer_ecart', { axe: 'region', top: 1 });
  const prov = await run('scores_ia', { modele: 'cout_final', top: 3 });
  const gli = await run('scores_ia', { modele: 'impaye_gli', top: 3 });
  const pa = await run('plan_action', {});
  const ctrl = await run('gouvernance', { sujet: 'controles' });

  const cible = 0.68, spg = plan.sp_glissant_12m_actuel;
  const dde = gar.lignes.find(l => /eaux/i.test(l.garantie));
  const partDDE = dde ? Number(dde.part.replace(/[^\d,]/g, '').replace(',', '.')) / 100 : 0;
  const a3 = pa.actions.find(a => a.id === 'A3'), recours = a3 ? eur((a3.cible.match(/([\d\s  ]+)\s*€/) || [])[1] || 0) : 0;
  const mesures = {
    V1: { valeur: spg - cible, texte: `S/P glissant 12 mois ${pc(spg)} pour une cible de ${pc(cible)} ; le pire écart régional est ${reg.lignes[0].region} (${reg.lignes[0].ecart_cible}).` },
    V2: { valeur: partDDE, texte: `Les dégâts des eaux pèsent ${dde?.part} de la charge 2026 ; l’action A1 cible les contrats sans détecteur.` },
    V3: { valeur: Number(prov.synthese.provisions_insuffisantes), texte: `${prov.synthese.provisions_insuffisantes} dossiers sous-provisionnés (complément ${prov.synthese.complement_estime}) ; ${prov.synthese.reglements_atypiques} règlements atypiques.` },
    V4: { valeur: recours, texte: `${a3?.cible || ''}. Effet médian ${a3?.effet_median_3_mois} sur 3 mois si les relances partent cette semaine.` },
    V5: { valeur: Number(gli.synthese.baux_en_alerte), texte: `${gli.synthese.baux_en_alerte} baux en alerte, ${gli.synthese.loyers_exposes_3_mois} de loyers exposés.` },
  };
  const alertes = REGLES.map(r => ({ ...r, ...mesures[r.id], declenchee: mesures[r.id].valeur > r.seuil }));
  const actives = alertes.filter(a => a.declenchee);
  const controlesOk = ctrl.controles.every(c => c.statut !== 'ÉCART');
  const jour = date.toISOString().slice(0, 10);

  const decisions = [...pa.actions].filter(a => a.points_sp > 0).sort((a, b) => b.points_sp - a.points_sp).slice(0, 3)
    .map(a => `- **${a.id} · ${a.action}** (${a.responsable}) : effet médian ${a.effet_median_3_mois}, fourchette ${a.fourchette}.`);
  const md = [
    `# Briefing de la semaine · ${jour}`,
    '',
    `Rédigé par l’agent de veille à partir des outils MCP (Qlik en lecture seule). ${controlesOk ? 'Contrôles de chargement conformes : les chiffres sont exploitables.' : '**Un contrôle de chargement est en écart : vérifier les données avant toute décision.**'}`,
    '',
    `## ${actives.length} ${actives.length > 1 ? 'signaux' : 'signal'} sur ${alertes.length} ${actives.length > 1 ? 'demandent' : 'demande'} une décision`,
    '',
    ...alertes.map(a => `- ${a.declenchee ? '🔴' : '🟢'} **${a.id} · ${a.nom}** — ${a.texte} → ${a.responsable}`),
    '',
    '## Ce que je propose de lancer',
    '',
    ...decisions,
    '',
    `## Où cela nous mène`,
    '',
    `Fin janvier 2027, S/P glissant 12 mois vers ${pc(plan.sp_glissant_12m_fin_sans[1])} sans action, ${pc(plan.sp_glissant_12m_fin_avec[1])} avec le plan (8 chances sur 10 entre ${pc(plan.sp_glissant_12m_fin_avec[0])} et ${pc(plan.sp_glissant_12m_fin_avec[2])}). C’est une fourchette, pas une promesse : les efficacités sont des hypothèses à mesurer par groupe témoin.`,
    '',
    '_L’IA recommande, l’humain décide. Données synthétiques de démonstration._',
  ].join('\n');

  const resume = `${actives.length} signaux sur ${alertes.length} demandent une décision : ${actives.map(a => `${a.id} ${a.nom} (${a.responsable})`).join(' ; ')}. À lancer d’abord : ${decisions.slice(0, 2).map(d => d.replace(/^- \*\*|\*\*.*$/g, '')).join(' et ')}. ${controlesOk ? 'Contrôles de chargement conformes.' : 'Attention : contrôle en écart.'}`;
  return { jour, alertes, decisions, md, resume };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const v = await veille();
  const dir = path.join(ICI, 'veille'); fs.mkdirSync(dir, { recursive: true });
  const fichier = path.join(dir, `briefing-${v.jour}.md`);
  fs.writeFileSync(fichier, v.md);
  fs.writeFileSync(path.join(RACINE, 'evidence', 'ia-veille.json'), JSON.stringify({ jour: v.jour, alertes: v.alertes, resume: v.resume }, null, 1));
  console.log(v.md);
  process.exit(0);
}
