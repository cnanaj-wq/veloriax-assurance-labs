// Ajoute les volets « 13 · Anticiper » et « 14 · Copiloter » à Assurance_Decision_Studio_DEV.qvf
// et étend la navigation commune de toutes les feuilles. Sauvegarde préalable du QVF ; idempotent.
import fs from 'node:fs';
import { connect, DEV, ROOT } from '../engine.mjs';

const plan = JSON.parse(fs.readFileSync(`${ROOT}/evidence/ia-plan.json`, 'utf8'));
const bt = JSON.parse(fs.readFileSync(`${ROOT}/evidence/ia-backtest.json`, 'utf8'));
const sessionsFichier = `${ROOT}/ia/sessions/sessions-copilote.json`;
const sessions = fs.existsSync(sessionsFichier) ? fs.readFileSync(sessionsFichier, 'utf8') : '[]';
const pc = v => (v * 100).toFixed(1).replace('.', ',') + ' %';

const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
fs.mkdirSync(`${ROOT}/backups/avant-volets-ia-${stamp}`, { recursive: true });
fs.copyFileSync(DEV, `${ROOT}/backups/avant-volets-ia-${stamp}/Assurance_Decision_Studio_DEV.qvf`);

const NOUVELLES = [
  { id: 'ads-anticiper', rank: 12, label: '13 Anticiper', titre: '13 · Anticiper | Ce que l’IA voit venir, et ce qu’il faut faire', description: 'Modèles prédictifs validés sur 2026 · plan d’action et S/P projeté · données synthétiques' },
  { id: 'ads-copilote', rank: 13, label: '14 Copiloter', titre: '14 · Copiloter | Demander, vérifier, décider', description: 'Copilote Qlik → MCP → LLM · KPI gouvernés · mini RAG · données synthétiques' },
];
const L = 24, N = 15, LARG = +(L / N).toFixed(4);
const bornes = (c, rows) => ({ ...c, bounds: { x: c.col / L * 100, y: c.row / rows * 100, width: c.colspan / L * 100, height: c.rowspan / rows * 100 } });
const dim = (champ, label, pctW) => ({ qDef: { qFieldDefs: [champ], qFieldLabels: [label], qSortCriterias: [{ qSortByNumeric: 1, qSortByAscii: 1 }], columnWidth: pctW ? { type: 'percentage', percentage: pctW } : undefined }, qNullSuppression: true });
const mes = (expr, label, fmt, tri) => ({ qDef: { qDef: expr, qLabel: label, qNumFormat: fmt ? { qType: 'F', qnDec: 0, qUseThou: 1, qFmt: fmt, qDec: ',', qThou: ' ' } : undefined }, qSortBy: tri ? { qSortByNumeric: tri } : undefined });
const table = (id, titre, sousTitre, dims, mesures, tri) => ({
  qInfo: { qId: id, qType: 'sn-table' }, visualization: 'sn-table', showTitles: true, title: titre, subtitle: sousTitre, footnote: '',
  qHyperCubeDef: { qDimensions: dims, qMeasures: mesures, qSuppressZero: true, qInterColumnSortOrder: tri, qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: dims.length + mesures.length, qHeight: 200 }] },
  totals: { show: false }, components: [{ key: 'theme', content: { fontSize: 11 } }],
});
const extension = (id, props, cube) => ({ qInfo: { qId: id, qType: 'veoriax-labs' }, visualization: 'veoriax-labs', showTitles: false, title: '', ...props, qHyperCubeDef: cube || { qDimensions: [], qMeasures: [], qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 1 }] } });
const chaine = e => ({ qStringExpression: { qExpr: e } });

const OBJETS = [
  extension('ia-k-dde', { mode: 'ia-kpi', icon: 'water', accent: '#138995', metricLabel: 'Contrats à risque élevé de dégât des eaux',
    metricValue: chaine("=Num(Count({<IA_NiveauDDE={'Élevé'}>} DISTINCT ContratID),'# ##0')"),
    caption: chaine("='dont '&Num(Count({<IA_NiveauDDE={'Élevé'},DetecteurFuite={'Non'}>} DISTINCT ContratID),'# ##0')&' sans détecteur de fuite · '&Num(Sum({<IA_NiveauDDE={'Élevé'}>} IA_ChargeDDEAttendue)/1000,'# ##0')&' k€ de charge attendue sur 10 mois'"),
    tagText: `IA · cibler 20 % des contrats capte ${Math.round(bt.prevention_dde.part_captee_top20_modele * 100)} % des dégâts des eaux (règle : ${Math.round(bt.prevention_dde.part_captee_top20_regle * 100)} %)`, tagIA: true }),
  extension('ia-k-prov', { mode: 'ia-kpi', icon: 'folder', accent: '#c44910', metricLabel: 'Provisions probablement insuffisantes',
    metricValue: chaine("=Num(Count({<IA_AlerteProvision={'Provision probablement insuffisante'}>} MouvementID),'# ##0')"),
    caption: chaine("='complément estimé '&Num(Sum({<IA_AlerteProvision={'Provision probablement insuffisante'}>} IA_EcartProvision)/1000,'# ##0')&' k€ · '&Num(Count({<IA_AlerteProvision={'Règlement atypique à revoir'}>} MouvementID),'0')&' règlements atypiques à revoir'"),
    tagText: `IA · erreur moyenne ${bt.cout_final.erreur_moyenne_modele_eur} € contre ${bt.cout_final.erreur_moyenne_mediane_par_cause_eur} € (médiane par cause)`, tagIA: true }),
  extension('ia-k-gli', { mode: 'ia-kpi', icon: 'key', accent: '#5b3aa8', metricLabel: 'Baux en alerte d’impayé à 90 jours',
    metricValue: chaine("=Num(Count({<IA_NiveauImpaye={'Alerte'}>} GLI_BailID),'# ##0')"),
    caption: chaine("='loyers exposés '&Num(Sum({<IA_NiveauImpaye={'Alerte'}>} IA_LoyersExposes)/1000,'# ##0')&' k€ · signal '&" + `'${bt.gli_impaye.avance_mediane_jours} jours avant l’impayé (médiane)'`),
    tagText: 'IA · gain faible sur la règle de vigilance : affiché tel quel', tagIA: true }),
  extension('ia-k-sp', { mode: 'ia-kpi', icon: 'trend', accent: '#087f8c', metricLabel: `S/P glissant 12 mois fin ${plan.horizon[2].slice(5)}/${plan.horizon[2].slice(2, 4)} avec le plan`,
    metricValue: pc(plan.sp_glissant_12m_fin_avec[1]),
    caption: `aujourd’hui ${pc(plan.sp_glissant_12m_actuel)} · sans action ${pc(plan.sp_glissant_12m_fin_sans[1])} · 8 chances sur 10 entre ${pc(plan.sp_glissant_12m_fin_avec[0])} et ${pc(plan.sp_glissant_12m_fin_avec[2])}`,
    tagText: `Sur le trimestre, le plan fait mieux dans ${Math.round(plan.probabilite_plan_meilleur * 100)} % des ${plan.tirages} simulations`, tagIA: true }),
  extension('ia-fan', { mode: 'ia-projection', target: '0.68', titleText: 'S/P glissant 12 mois : la tendance, et ce que le plan peut infléchir',
    caption: 'Projection à 3 mois · 5 000 tirages (sinistres saisonniers, coûts réels revalorisés) · efficacité des actions = hypothèse à mesurer par groupe témoin' },
    { qDimensions: [dim('Proj_Mois', 'Mois'), dim('Proj_Scenario', 'Scénario')], qMeasures: [mes('Only(Proj_P10)', 'P10'), mes('Only(Proj_P50)', 'P50'), mes('Only(Proj_P90)', 'P90')], qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 5, qHeight: 100 }] }),
  extension('ia-plan', { mode: 'ia-plan', titleText: 'Le plan d’action recommandé par l’IA' },
    { qDimensions: [dim('Act_ID', 'Action'), dim('Act_Action', 'Libellé'), dim('Act_Cible', 'Cible'), dim('Act_Responsable', 'Responsable')], qMeasures: [mes('Sum(Act_Effet_P50)', 'P50'), mes('Sum(Act_Effet_P10)', 'P10'), mes('Sum(Act_Effet_P90)', 'P90'), mes('Sum(Act_Points_SP)', 'Points')], qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 8, qHeight: 20 }] }),
  table('ia-t-dde', 'Contrats à équiper en priorité', 'Risque élevé, sans détecteur de fuite · classés par probabilité',
    [dim('ContratID', 'Contrat', 18), dim('Region', 'Région', 22), dim('IA_MotifDDE', 'Pourquoi', 40)],
    [mes("Max({<IA_NiveauDDE={'Élevé'}, DetecteurFuite={'Non'}>} IA_ProbaDDE)", 'Probabilité', '0,0 %', -1)], [3, 0, 1, 2]),
  table('ia-t-prov', 'Provisions à revoir', 'Coût final attendu au-dessus de la charge actuelle',
    [dim('Sin_Dossier', 'Dossier', 22), dim('Sin_Cause', 'Cause', 33)],
    [mes("Sum({<IA_AlerteProvision={'Provision probablement insuffisante'}>} Sin_Charge)", 'Charge actuelle', '# ##0 €'),
     mes("Sum({<IA_AlerteProvision={'Provision probablement insuffisante'}>} IA_CoutFinal)", 'Coût final estimé', '# ##0 €'),
     mes("Sum({<IA_AlerteProvision={'Provision probablement insuffisante'}>} IA_EcartProvision)", 'Complément', '# ##0 €', -1)], [4, 0, 1, 2, 3]),
  table('ia-t-taches', 'Les tâches de la semaine', 'Trois premières tâches de chaque action, priorisées par l’IA',
    [dim('Tache_Action', 'Action', 10), dim('Tache_Objet', 'Objet', 20), dim('Tache_Libelle', 'Geste', 32), dim('Tache_Motif', 'Motif', 38)],
    [mes('Min({<Tache_Rang={"<=3"}>} Tache_Rang)', 'Rang', '0', 1)], [0, 4, 1, 2, 3]),
  extension('ia-copilote', { mode: 'ia-copilote', sessionsJSON: sessions,
    suggestions: 'Briefing de la semaine|Où se forme l’écart à la cible ?|Que dois-je lancer lundi ?|Le S/P peut-il revenir sous 68 % ?|Quelles provisions revoir ?|Comment est calculé le ratio S/P ?' }),
  table('ia-t-gouv', 'KPI gouvernés', 'Une définition, une règle, un propriétaire : le copilote utilise ces définitions',
    [dim('Gouv_Nom', 'KPI', 20), dim('Gouv_Regle', 'Règle de calcul', 52), dim('Gouv_Proprietaire', 'Propriétaire', 28)], [], [0, 1, 2]),
  table('ia-t-modeles', 'Fiches des modèles', 'Validés sur une période jamais vue · limites affichées',
    [dim('Mod_Nom', 'Modèle', 20), dim('Mod_Validation', 'Validation', 45), dim('Mod_Limites', 'Limites', 35)], [], [0, 1, 2]),
  { qInfo: { qId: 'ia-charte', qType: 'text-image' }, visualization: 'text-image', showTitles: false, title: '',
    markdown: '<b>ARCHITECTURE</b><br>Qlik Sense → serveur MCP Node.js (lecture seule, 7 outils) → LLM : Claude Code ou LLM léger local (Ollama).<br>Mini RAG sur les documents approuvés : catalogue KPI, 47 règles métier, fiches modèles, charte IA, lignage.<br><br><b>CHARTE</b><br>■ L’IA recommande, l’humain décide.<br>■ Lecture seule : aucune prime, provision ou décision modifiée.<br>■ Chaque chiffre cité vient d’un outil ou d’un document, avec sa source.<br>■ Un score est une probabilité ; une projection est une fourchette.<br>■ Efficacité d’une action = hypothèse jusqu’à la mesure par groupe témoin.<br>■ LLM local : les données ne quittent pas le poste.<br>■ Données synthétiques : aucun assureur réel.' },
];

const DISPOSITIONS = {
  'ads-anticiper': { rows: 26, cells: [['ia-k-dde', 0, 1.5, 6, 5], ['ia-k-prov', 6, 1.5, 6, 5], ['ia-k-gli', 12, 1.5, 6, 5], ['ia-k-sp', 18, 1.5, 6, 5],
    ['ia-fan', 0, 6.5, 13, 10.5], ['ia-plan', 13, 6.5, 11, 10.5], ['ia-t-dde', 0, 17, 7, 9], ['ia-t-prov', 7, 17, 7, 9], ['ia-t-taches', 14, 17, 10, 9]] },
  'ads-copilote': { rows: 26, cells: [['ia-copilote', 0, 1.5, 13, 24.5], ['ia-t-gouv', 13, 1.5, 11, 9.5], ['ia-t-modeles', 13, 11, 11, 7.5], ['ia-charte', 13, 18.5, 11, 7.5]] },
};

const q = await connect(DEV);
try {
  const a = (await q.call(-1, 'OpenDoc', [DEV])).qReturn.qHandle;
  const fichier = (await q.call(a, 'GetAppLayout')).qLayout.qFileName.replaceAll('\\', '/');
  if (!fichier.endsWith('qlik-assurance-premium/Assurance_Decision_Studio_DEV.qvf')) throw Error('Arrêt : app ouverte = ' + fichier);
  const obtenir = async id => { const h = (await q.call(a, 'GetObject', [id])).qReturn.qHandle; return h ? { h, p: (await q.call(h, 'GetProperties')).qProp } : null; };
  const poser = async p => { const o = await obtenir(p.qInfo.qId); if (o) { await q.call(o.h, 'SetProperties', [{ ...p, qInfo: o.p.qInfo }]); return o.h; } return (await q.call(a, 'CreateObject', [p])).qReturn.qHandle; };

  for (const p of OBJETS) await poser(JSON.parse(JSON.stringify(p)));

  // Feuilles (gabarit : 03 · Indemniser)
  const gab = (await obtenir('ads-claims')).p;
  for (const f of NOUVELLES) {
    const d = DISPOSITIONS[f.id];
    const p = JSON.parse(JSON.stringify(gab));
    p.qInfo = { qId: f.id, qType: 'sheet' }; p.qMetaDef = { title: f.titre, description: f.description }; p.rank = f.rank; p.rows = d.rows;
    p.cells = d.cells.map(([name, col, row, colspan, rowspan]) => bornes({ name, type: OBJETS.find(o => o.qInfo.qId === name).visualization, col, row, colspan, rowspan }, d.rows));
    delete p.qChildList; await poser(p);
  }

  // Navigation commune : 15 boutons sur toutes les feuilles qui en ont
  const liste = (await q.call(a, 'CreateSessionObject', [{ qInfo: { qType: 'SL' }, qAppObjectListDef: { qType: 'sheet', qData: { rank: '/rank' } } }])).qReturn.qHandle;
  const feuilles = (await q.call(liste, 'GetLayout')).qLayout.qAppObjectList.qItems.sort((x, y) => (x.qData.rank ?? 0) - (y.qData.rank ?? 0));
  const cibles = feuilles.map(s => s.qInfo.qId); // ordre : accueil (rank -1), 01..14
  const modele = (await obtenir('vn-ads-claims-12')).p;
  const verif = [];
  for (const s of feuilles) {
    const sh = await obtenir(s.qInfo.qId);
    const navs = sh.p.cells.filter(c => /^vn-/.test(c.name));
    const hauteur = navs[0]?.rowspan ?? 1.5;
    sh.p.cells = sh.p.cells.filter(c => !/^vn-/.test(c.name));
    const prefixe = `vn-${s.qInfo.qId}-`;
    for (let k = 0; k < N; k++) {
      const id = prefixe + k;
      const ex = await obtenir(id);
      const base = JSON.parse(JSON.stringify(ex ? ex.p : modele));
      base.qInfo = { qId: id, qType: 'action-button' };
      base.navigation = { action: 'goToSheet', sheet: cibles[k] };
      base.style.label = NOUVELLES.find(n => n.id === cibles[k])?.label ?? (await obtenir(`vn-ads-claims-${k}`)).p.style.label;
      base.style.background.color.color = base.navigation.sheet === s.qInfo.qId ? '#C44910' : '#181818';
      await poser(base);
      sh.p.cells.push(bornes({ name: id, type: 'action-button', col: +(k * LARG).toFixed(4), row: 0, colspan: LARG, rowspan: hauteur }, sh.p.rows));
    }
    await q.call(sh.h, 'SetProperties', [sh.p]);
    verif.push(`${s.qInfo.qId} : ${sh.p.cells.filter(c => /^vn-/.test(c.name)).length} boutons`);
  }

  // Vérification : rendu des objets IA
  const controles = {};
  for (const id of ['ia-k-dde', 'ia-k-prov', 'ia-k-gli', 'ia-fan', 'ia-plan', 'ia-t-dde', 'ia-t-prov', 'ia-t-taches', 'ia-t-gouv', 'ia-t-modeles']) {
    const o = await obtenir(id); const l = (await q.call(o.h, 'GetLayout')).qLayout;
    controles[id] = l.metricValue ? `${l.metricValue} · ${l.caption}` : `${l.qHyperCube?.qSize?.qcy} lignes`;
  }
  await q.call(a, 'DoSave');
  fs.writeFileSync(`${ROOT}/evidence/ia-volets-qlik.json`, JSON.stringify({ navigation: verif, controles }, null, 1));
  console.log(verif.join('\n')); console.log(JSON.stringify(controles, null, 1));
} finally { q.close(); }
