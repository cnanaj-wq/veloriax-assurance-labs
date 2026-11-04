// VELORIAX ASSURANCE LABS — modes IA de l'extension : carte KPI IA, projection en éventail,
// cascade du plan d'action, panneau copilote. Chargé par veoriax-labs.js.
define([], function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v, d = 1) => Number.isFinite(v) ? (v * 100).toFixed(d).replace('.', ',') + ' %' : '—';
  const eur = v => Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') + ' €' : '—';
  const PONT = 'http://localhost:8787';
  const ICO = {
    water: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>',
    folder: '<path d="M3 7h6l2 2h10v10H3Z"/><path d="M12 12v3m0 2v.01"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-3 3 3 3"/>',
    spark: '<path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6"/>',
    trend: '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',
  };
  const svgIco = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICO[k] || ICO.spark) + '</svg>';
  const STYLE = `
.vxi{box-sizing:border-box;height:100%;width:100%;font-family:Segoe UI,Arial,sans-serif;color:#193650;background:#fff;border-radius:12px;overflow:hidden}
.vxi *{box-sizing:border-box}
.vxi-kpi{padding:9px 14px;border-top:3px solid var(--a,#138995);display:flex;flex-direction:column;gap:3px}
.vxi-kpi-h{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#40566b}
.vxi-kpi-h svg{width:22px;height:22px;color:var(--a,#138995);flex:none}
.vxi-kpi strong{font-size:24px;line-height:1.1;font-weight:700;color:#0f2c44}
.vxi-kpi small{font-size:10.5px;color:#5d7083;line-height:1.3}
.vxi-tag{align-self:flex-start;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:#e6f4f5;color:#0b6f7b}
.vxi-tag.ia{background:#efe9fb;color:#5b3aa8}
.vxi-fan{padding:10px 14px;display:flex;flex-direction:column;height:100%}
.vxi-fan h3,.vxi-plan h3{margin:0;font-size:14px;font-weight:700;color:#0f2c44}
.vxi-fan p,.vxi-plan p{margin:2px 0 4px;font-size:11.5px;color:#5d7083}
.vxi-fan svg{flex:1;min-height:0;width:100%}
.vxi-leg{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:#40566b}
.vxi-leg i{display:inline-block;width:18px;height:8px;border-radius:2px;margin-right:5px;vertical-align:middle}
.vxi-plan{padding:10px 14px;display:flex;flex-direction:column;height:100%}
.vxi-steps{flex:1;display:flex;flex-direction:column;gap:3px;min-height:0;justify-content:space-around}
.vxi-step{display:grid;grid-template-columns:minmax(0,2.3fr) minmax(0,1.6fr) 70px;gap:10px;align-items:center;font-size:11px;line-height:1.25}
.vxi-step b{font-weight:700;color:#0f2c44}
.vxi-step span{display:block;color:#5d7083;font-size:10px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vxi-bar{position:relative;height:14px;background:#f1f5f7;border-radius:3px}
.vxi-bar i{position:absolute;top:2px;bottom:2px;border-radius:2px}
.vxi-bar u{position:absolute;top:6px;height:2px;background:#33495e;opacity:.55}
.vxi-pts{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.vxi-tot{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e3eaee;padding-top:6px;font-size:12px}
.vxi-cop{display:grid;grid-template-rows:auto auto 1fr auto;height:100%;padding:12px 14px;gap:8px;background:linear-gradient(180deg,#0f2c44 0,#16405f 100%);color:#eaf2f7}
.vxi-cop-h{display:flex;justify-content:space-between;align-items:center;gap:8px}
.vxi-cop-h b{font-size:14px}
.vxi-cop-h span{font-size:10.5px;padding:2px 8px;border-radius:999px;background:#ffffff1f}
.vxi-cop-h span.on{background:#2e8b6b}
.vxi-sug{display:flex;flex-wrap:wrap;gap:6px}
.vxi-sug button{font:inherit;font-size:11px;padding:4px 9px;border-radius:999px;border:1px solid #ffffff40;background:transparent;color:#eaf2f7;cursor:pointer}
.vxi-sug button:hover,.vxi-sug button:focus-visible{background:#ffffff1f;outline:none}
.vxi-fil{overflow:auto;background:#ffffff0f;border-radius:8px;padding:10px;font-size:12px;line-height:1.5}
.vxi-q{color:#9fd3dd;font-weight:600;margin:0 0 4px}
.vxi-a{white-space:pre-wrap;margin:0 0 6px;color:#fff}
.vxi-trace{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 10px}
.vxi-trace em{font-style:normal;font-size:10px;padding:1px 6px;border-radius:4px;background:#ffffff1a;color:#cfe3ec}
.vxi-trace em.doc{background:#5b3aa833;color:#e2d6ff}
.vxi-form{display:flex;gap:6px}
.vxi-form input{flex:1;font:inherit;font-size:12px;padding:7px 10px;border-radius:8px;border:1px solid #ffffff40;background:#ffffff14;color:#fff}
.vxi-form input::placeholder{color:#bcd0dc}
.vxi-form button{font:inherit;font-size:12px;font-weight:700;padding:7px 14px;border-radius:8px;border:0;background:#2fb3c2;color:#0f2c44;cursor:pointer}
.vxi-form button:disabled{opacity:.5;cursor:wait}
.vxi-wait{color:#9fd3dd;font-style:italic}
@media (prefers-reduced-motion:no-preference){.vxi-band{animation:vxiIn .9s ease-out both}@keyframes vxiIn{from{opacity:0}to{opacity:1}}}
`;
  const mat = l => (l.qHyperCube && l.qHyperCube.qDataPages && l.qHyperCube.qDataPages[0] ? l.qHyperCube.qDataPages[0].qMatrix : []);

  function kpi($el, l) {
    const tag = l.tagText ? '<span class="vxi-tag ' + (l.tagIA ? 'ia' : '') + '">' + esc(l.tagText) + '</span>' : '';
    $el.html('<style>' + STYLE + '</style><div class="vxi vxi-kpi" style="--a:' + esc(l.accent || '#138995') + '"><div class="vxi-kpi-h">' + svgIco(l.icon) + esc(l.metricLabel) + '</div><strong>' + esc(l.metricValue || '—') + '</strong>' + tag + '<small>' + esc(l.caption || '') + '</small></div>');
  }

  function projection($el, l) {
    // Dimensions : Proj_Mois (dual, ordre), Proj_Scenario ; mesures : P10, P50, P90
    const rows = mat(l).filter(r => Number.isFinite(r[0].qNum));
    const mois = [...new Map(rows.map(r => [r[0].qNum, r[0].qText])).entries()].sort((a, b) => a[0] - b[0]);
    const idx = new Map(mois.map((m, i) => [m[0], i]));
    const serie = nom => rows.filter(r => r[1].qText === nom).map(r => ({ i: idx.get(r[0].qNum), p10: r[2].qNum, p50: r[3].qNum, p90: r[4].qNum })).sort((a, b) => a.i - b.i);
    const hist = serie('Historique'), sans = serie('Sans action'), plan = serie('Avec le plan IA');
    const cible = Number(l.target || 0.68);
    const vals = [...hist.map(p => p.p50), ...sans.flatMap(p => [p.p10, p.p90]), ...plan.flatMap(p => [p.p10, p.p90])].filter(Number.isFinite);
    const pas = (Math.max(...vals) - Math.min(...vals)) > 0.25 ? 0.1 : 0.01;
    const lo = Math.floor(Math.min(...vals) / pas) * pas, hi = Math.ceil(Math.max(...vals) / pas) * pas;
    const W = 640, H = 250, L = 42, R = 118, T = 12, B = 26;
    const x = i => L + i * (W - L - R) / Math.max(1, mois.length - 1), y = v => T + (hi - v) / (hi - lo || 1) * (H - T - B);
    const ligne = (pts, k) => pts.map((p, j) => (j ? 'L' : 'M') + x(p.i).toFixed(1) + ',' + y(p[k]).toFixed(1)).join(' ');
    const bande = pts => ligne(pts, 'p90') + ' ' + pts.slice().reverse().map(p => 'L' + x(p.i).toFixed(1) + ',' + y(p.p10).toFixed(1)).join(' ') + ' Z';
    let grille = '';
    for (let v = lo; v <= hi + 1e-9; v += pas) grille += '<path d="M' + L + ',' + y(v) + ' H' + (W - R) + '" stroke="#e3eaee"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="#7a8b9a">' + (v * 100).toFixed(pas < 0.1 ? 0 : 0) + ' %</text>';
    const debut = sans.length ? sans[0].i : mois.length;
    const xs = mois.map((m, i) => ((i % 2 === 0 && i < debut - 1) || i === debut - 1 || i === mois.length - 1 ? '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9.5" fill="' + (i >= debut ? '#0b6f7b' : '#7a8b9a') + '">' + esc(m[1]) + '</text>' : '')).join('');
    const fin = a => a[a.length - 1];
    const etiquette = (a, coul, nom, dy) => a.length ? '<text x="' + (x(fin(a).i) + 8) + '" y="' + (y(fin(a).p50) + dy) + '" font-size="11" font-weight="700" fill="' + coul + '">' + nom + ' ' + pct(fin(a).p50, 1) + '</text>' : '';
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Projection du ratio S/P à 3 mois, sans action et avec le plan IA">' + grille +
      '<rect x="' + x(debut - 1) + '" y="' + T + '" width="' + (x(mois.length - 1) - x(debut - 1)) + '" height="' + (H - T - B) + '" fill="#f4f9fa"/>' +
      '<text x="' + (x(debut - 1) + 4) + '" y="' + (T + 11) + '" font-size="9.5" fill="#0b6f7b" font-weight="700">PROJECTION</text>' +
      (cible >= lo && cible <= hi ? '<path d="M' + L + ',' + y(cible) + ' H' + (W - R) + '" stroke="#c44910" stroke-dasharray="5 4"/><text x="' + (W - R + 8) + '" y="' + (y(cible) + 4) + '" font-size="10.5" fill="#c44910">Cible ' + pct(cible, 0) + '</text>' : '') +
      (sans.length ? '<path class="vxi-band" d="' + bande(sans) + '" fill="#8a9bab" fill-opacity=".22"/><path d="' + ligne(sans, 'p50') + '" stroke="#5d7083" stroke-width="2" stroke-dasharray="5 3" fill="none"/>' : '') +
      (plan.length ? '<path class="vxi-band" d="' + bande(plan) + '" fill="#109aab" fill-opacity=".25"/><path d="' + ligne(plan, 'p50') + '" stroke="#087f8c" stroke-width="2.6" fill="none"/>' : '') +
      '<path d="' + ligne(hist, 'p50') + '" stroke="#0f2c44" stroke-width="2.2" fill="none"/>' + hist.map(p => '<circle cx="' + x(p.i) + '" cy="' + y(p.p50) + '" r="2.4" fill="#0f2c44"><title>' + esc(mois[p.i][1]) + ' : ' + pct(p.p50) + '</title></circle>').join('') +
      etiquette(sans, '#5d7083', 'Sans action', -7) + etiquette(plan, '#087f8c', 'Avec le plan', 13) + xs + '</svg>';
    $el.html('<style>' + STYLE + '</style><div class="vxi vxi-fan"><h3>' + esc(l.titleText || 'S/P projeté à 3 mois') + '</h3><p>' + esc(l.caption || '') + '</p>' + svg +
      '<div class="vxi-leg"><span><i style="background:#0f2c44"></i>S/P glissant 12 mois réel</span><span><i style="background:#8a9bab55;border:1px dashed #5d7083"></i>Sans action (P10–P90)</span><span><i style="background:#109aab55;border:1px solid #087f8c"></i>Avec le plan IA (P10–P90)</span><span>Bande = 8 chances sur 10 · ce n’est pas une certitude</span></div></div>');
  }

  function plan($el, l) {
    // Dimensions : Act_ID, Act_Action, Act_Cible, Act_Responsable ; mesures : P50, P10, P90 (€), points de S/P
    const rows = mat(l).map(r => ({ id: r[0].qText, action: r[1].qText, cible: r[2].qText, resp: r[3].qText, p50: r[4].qNum, p10: r[5].qNum, p90: r[6].qNum, pts: r[7].qNum })).sort((a, b) => a.id.localeCompare(b.id));
    const m = Math.max(1, ...rows.flatMap(r => [Math.abs(r.p10), Math.abs(r.p90)]));
    const pos = v => 50 + v / m * 48;
    const etapes = rows.map(r => {
      const bon = r.p50 >= 0, a = pos(Math.min(0, r.p50)), b = pos(Math.max(0, r.p50));
      return '<div class="vxi-step"><div><b>' + esc(r.id + ' · ' + r.action) + '</b><span title="' + esc(r.cible) + '">' + esc(r.cible) + '</span><span>' + esc(r.resp) + '</span></div>' +
        '<div class="vxi-bar" title="Effet médian ' + eur(r.p50) + ' · fourchette ' + eur(r.p10) + ' à ' + eur(r.p90) + '"><i style="left:' + a + '%;width:' + Math.max(.8, b - a) + '%;background:' + (bon ? '#2e8b6b' : '#c14953') + '"></i><u style="left:' + pos(Math.min(r.p10, r.p90)) + '%;width:' + Math.abs(pos(r.p90) - pos(r.p10)) + '%"></u><i style="left:50%;width:1px;background:#33495e;top:0;bottom:0"></i></div>' +
        '<div class="vxi-pts" style="color:' + (bon ? '#2e8b6b' : '#c14953') + '">' + (r.pts > 0 ? '−' : '+') + Math.abs(r.pts).toFixed(2).replace('.', ',') + ' pt</div></div>';
    }).join('');
    const tot = rows.reduce((s, r) => s + r.pts, 0);
    $el.html('<style>' + STYLE + '</style><div class="vxi vxi-plan"><h3>' + esc(l.titleText || 'Plan d’action recommandé par l’IA') + '</h3><p>' + esc(l.caption || 'Effet médian sur 3 mois · trait = fourchette P10–P90 · vert = le S/P baisse') + '</p><div class="vxi-steps">' + etapes +
      '</div><div class="vxi-tot"><span>Effet cumulé médian sur le S/P du trimestre</span><b style="color:' + (tot > 0 ? '#2e8b6b' : '#c14953') + '">' + (tot > 0 ? '−' : '+') + Math.abs(tot).toFixed(1).replace('.', ',') + ' point</b></div></div>');
  }

  function copilote($el, l) {
    const id = 'vxi' + Math.random().toString(36).slice(2, 8);
    const sessions = (() => { try { return JSON.parse(l.sessionsJSON || '[]'); } catch (e) { return []; } })();
    const sug = (l.suggestions || 'Briefing de la semaine|Où se forme l’écart à la cible ?|Que dois-je lancer lundi ?|Le S/P peut-il revenir sous 68 % ?|Quelles provisions revoir ?').split('|');
    $el.html('<style>' + STYLE + '</style><div class="vxi vxi-cop" id="' + id + '"><div class="vxi-cop-h"><b>Copilote de décision</b><span class="etat">Connexion…</span></div><div class="vxi-sug">' + sug.map(s => '<button type="button">' + esc(s) + '</button>').join('') + '</div><div class="vxi-fil" aria-live="polite"></div><form class="vxi-form"><input type="text" aria-label="Question au copilote" placeholder="Posez une question sur le portefeuille…"><button type="submit">Demander</button></form></div>');
    const root = $el[0].querySelector('#' + id), fil = root.querySelector('.vxi-fil'), etat = root.querySelector('.etat'), input = root.querySelector('input'), bouton = root.querySelector('form button');
    const rendre = (q, rep) => {
      const trace = (rep.outils || []).map(o => '<em>' + esc(o) + '</em>').join('') + (rep.sources || []).map(s => '<em class="doc">' + esc(s) + '</em>').join('');
      fil.insertAdjacentHTML('beforeend', '<p class="vxi-q">' + esc(q) + '</p><p class="vxi-a">' + esc(rep.reponse) + '</p><div class="vxi-trace">' + trace + (rep.moteur ? '<em>' + esc(rep.moteur) + '</em>' : '') + '</div>');
      fil.scrollTop = fil.scrollHeight;
    };
    let enLigne = false;
    fetch(PONT + '/api/etat').then(r => r.json()).then(e => { enLigne = true; etat.textContent = e.moteur; etat.classList.add('on'); })
      .catch(() => { etat.textContent = 'Hors ligne · sessions enregistrées'; sessions.forEach(s => rendre(s.question, s)); });
    const demander = q => {
      if (!q) return;
      if (!enLigne) { const s = sessions.find(x => x.question === q); rendre(q, s || { reponse: 'Le copilote local n’est pas démarré. Lancez « node ia/pont.mjs » puis actualisez.', outils: [] }); return; }
      bouton.disabled = true; fil.insertAdjacentHTML('beforeend', '<p class="vxi-wait">Le copilote interroge Qlik et les documents…</p>');
      fetch(PONT + '/api/question', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) })
        .then(r => r.json()).then(rep => { fil.querySelector('.vxi-wait')?.remove(); rendre(q, rep); })
        .catch(e => { fil.querySelector('.vxi-wait')?.remove(); rendre(q, { reponse: 'Erreur : ' + e.message, outils: [] }); })
        .finally(() => { bouton.disabled = false; input.value = ''; });
    };
    root.querySelectorAll('.vxi-sug button').forEach(b => b.addEventListener('click', () => demander(b.textContent)));
    root.querySelector('form').addEventListener('submit', e => { e.preventDefault(); demander(input.value.trim()); });
    // Les clics ne doivent pas déclencher la sélection Qlik de l'objet
    root.addEventListener('mousedown', e => e.stopPropagation()); root.addEventListener('touchstart', e => e.stopPropagation());
    root.addEventListener('keydown', e => e.stopPropagation());
  }

  return { modes: { 'ia-kpi': kpi, 'ia-projection': projection, 'ia-plan': plan, 'ia-copilote': copilote } };
});
