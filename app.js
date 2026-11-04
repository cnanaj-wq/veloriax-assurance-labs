/* Veloriax Assurance Labs · version web. Aucune dépendance ; toutes les données viennent de data.js. */
(() => {
  "use strict";
  const VX = window.VX;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = (n, d = 0) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (n) => nf(Math.round(n)) + " €";
  const keur = (n) => nf(n / 1000, 0) + " k€";
  const pct = (x, d = 1) => nf(x * 100, d) + " %";

  if (!VX) { $("#contenu").innerHTML = '<p class="info">Les données n\'ont pas pu être chargées. Rechargez la page.</p>'; return; }

  /* ---------- onglets ---------- */
  const onglets = [...document.querySelectorAll('[role="tab"]')];
  function ouvrir(nom, focus) {
    onglets.forEach((b) => {
      const actif = b.dataset.page === nom;
      b.setAttribute("aria-selected", actif); b.tabIndex = actif ? 0 : -1;
      document.getElementById("page-" + b.dataset.page).hidden = !actif;
      if (actif && focus) b.focus();
    });
    try { history.replaceState(null, "", "#" + nom); } catch (e) { /* page locale */ }
  }
  onglets.forEach((b, i) => {
    b.addEventListener("click", () => ouvrir(b.dataset.page));
    b.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return;
      e.preventDefault(); ouvrir(onglets[(i + d + onglets.length) % onglets.length].dataset.page, true);
    });
  });
  const initial = location.hash.slice(1);
  ouvrir(onglets.some((b) => b.dataset.page === initial) ? initial : "synthese");

  const kpi = (libelle, valeur, note, couleur, ia) => `<div class="kpi" style="--k:${couleur || "var(--encre)"}"><div class="kpi__libelle">${esc(libelle)}</div><div class="kpi__valeur">${esc(valeur)}</div><div class="kpi__note">${esc(note)}</div>${ia ? `<span class="kpi__ia">${esc(ia)}</span>` : ""}</div>`;

  /* ---------- Synthèse ---------- */
  const k = VX.kpi;
  $("#kpis-synthese").innerHTML =
    kpi("Primes acquises", keur(k.primes), nf(k.contrats) + " contrats") +
    kpi("Charges de sinistres", keur(k.charges), nf(k.mouvements) + " mouvements") +
    kpi("Ratio S/P", pct(k.sp), "cible " + pct(k.cible, 0), "var(--orange)") +
    kpi("Écart à la cible", eur(k.ecart), "charges au-delà de 68 % des primes", "var(--rouge)");

  function barres(cible, lignes, { valeur, libelle, couleur, format, clic }) {
    const W = 560, H = lignes.length * 38 + 10, L = 190, R = 90, max = Math.max(...lignes.map(valeur), 1);
    const svg = lignes.map((l, i) => {
      const y = 6 + i * 38, w = Math.max(2, (valeur(l) / max) * (W - L - R));
      return `<g class="barre" role="button" tabindex="0" aria-pressed="false" data-i="${i}" aria-label="${esc(libelle(l) + " : " + format(l))}">
        <text x="${L - 10}" y="${y + 18}" text-anchor="end" font-size="13" fill="#40566b">${esc(libelle(l))}</text>
        <rect x="${L}" y="${y + 4}" width="${W - L - R}" height="22" rx="4" fill="#eef1f3"/>
        <rect class="plein" x="${L}" y="${y + 4}" width="${w}" height="22" rx="4" fill="${couleur(l)}"/>
        <text x="${L + w + 8}" y="${y + 20}" font-size="13" font-weight="700" fill="#0f2c44">${esc(format(l))}</text></g>`;
    }).join("");
    cible.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Graphique en barres">${svg}</svg>`;
    if (clic) cible.querySelectorAll(".barre").forEach((g) => {
      const agir = () => { cible.querySelectorAll(".barre").forEach((x) => x.setAttribute("aria-pressed", x === g)); clic(lignes[+g.dataset.i]); };
      g.addEventListener("click", agir);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); agir(); } });
    });
  }
  barres($("#g-regions"), VX.regions, {
    valeur: (r) => Math.abs(r.ecart), libelle: (r) => r.nom, format: (r) => (r.ecart < 0 ? "−" + keur(-r.ecart) + " sous la cible" : "+" + keur(r.ecart)),
    couleur: (r) => (r.sp > k.cible ? "#c14953" : "#2e8b6b"),
    clic: (r) => { $("#detail-region").textContent = `${r.nom} : S/P ${pct(r.sp)}, ${keur(r.charges)} de charges pour ${keur(r.primes)} de primes, soit ${eur(Math.abs(r.ecart))} ${r.ecart < 0 ? "sous" : "au-delà de"} la cible.`; },
  });
  barres($("#g-garanties"), VX.garanties, { valeur: (g) => g.part, libelle: (g) => g.nom, format: (g) => pct(g.part), couleur: (g, i) => (/eaux/i.test(g.nom) ? "#087f8c" : "#9fb6c6") });

  /* ---------- Anticiper ---------- */
  const m = VX.modeles;
  const duel = (lignes) => `<div class="duel">${lignes.map(([nom, v, max, c, txt]) => `<div class="duel__ligne"><span>${esc(nom)}</span><span class="duel__piste"><span class="duel__barre" style="display:block;width:${(v / max) * 100}%;background:${c}"></span></span><span class="duel__valeur">${esc(txt)}</span></div>`).join("")}</div>`;
  $("#modeles").innerHTML = [
    `<article class="modele"><span class="verdict verdict--net">Gain net sur la règle</span><h3>Prévenir les dégâts des eaux</h3><p class="modele__question">${esc(m.dde.question)}</p>
      <p class="modele__chiffre">${nf(m.dde.score.dont_sans_detecteur)} contrats</p><p class="sous-titre">à risque élevé et sans détecteur de fuite, sur ${nf(m.dde.score.contrats_eleves)}</p>
      <p class="sous-titre">Part des dégâts des eaux captée en ciblant 20 % des contrats :</p>
      ${duel([["Modèle", m.dde.part_captee_top20_modele, 0.4, "#087f8c", pct(m.dde.part_captee_top20_modele, 0)], ["Règle simple", m.dde.part_captee_top20_regle, 0.4, "#9fb6c6", pct(m.dde.part_captee_top20_regle, 0)]])}
      <p class="limite">Probabilité, pas prédiction : ${nf(m.dde.attendus_vs_observes[0])} cas attendus, ${nf(m.dde.attendus_vs_observes[1])} observés en test.</p></article>`,
    `<article class="modele"><span class="verdict verdict--prudent">Utile, à recalibrer</span><h3>Coût final des sinistres</h3><p class="modele__question">${esc(m.cout.question)}</p>
      <p class="modele__chiffre">${nf(m.cout.score.provisions_insuffisantes)} provisions</p><p class="sous-titre">probablement insuffisantes · complément estimé ${keur(m.cout.score.complement_estime_eur)}</p>
      <p class="sous-titre">Erreur moyenne sur les sinistres clos jamais vus :</p>
      ${duel([["Modèle", m.cout.erreur_moyenne_modele_eur, 900, "#087f8c", eur(m.cout.erreur_moyenne_modele_eur)], ["Médiane par cause", m.cout.erreur_moyenne_mediane_par_cause_eur, 900, "#9fb6c6", eur(m.cout.erreur_moyenne_mediane_par_cause_eur)]])}
      <p class="limite">Intervalle à 80 % qui ne couvre que ${pct(m.cout.couverture_intervalle_80, 0)} des cas : un gestionnaire valide chaque dossier.</p></article>`,
    `<article class="modele"><span class="verdict verdict--faible">Gain faible, affiché tel quel</span><h3>Impayés de loyers (GLI)</h3><p class="modele__question">${esc(m.gli.question)}</p>
      <p class="modele__chiffre">${nf(m.gli.score.baux_en_alerte)} baux</p><p class="sous-titre">en alerte · ${eur(m.gli.score.loyers_exposes_alerte_eur)} de loyers exposés · signal ${m.gli.avance_mediane_jours} jours avant (médiane)</p>
      <p class="sous-titre">Précision sur les 5 % de baux les plus risqués :</p>
      ${duel([["Modèle", m.gli.precision_top5_modele, 0.06, "#087f8c", pct(m.gli.precision_top5_modele)], ["Règle de vigilance", m.gli.precision_top5_regle, 0.06, "#9fb6c6", pct(m.gli.precision_top5_regle)]])}
      <p class="limite">Le modèle complète la règle existante, il ne la remplace pas.</p></article>`,
  ].join("");

  const LISTES = {
    dde: { st: "Contrats à risque élevé de dégât des eaux, classés par probabilité (25 premiers)", tete: ["Contrat", "Probabilité", "Pourquoi"], ligne: (r) => [esc(r.id), `<span class="nombre">${pct(r.proba)}</span>`, esc(r.motif)], donnees: VX.scores.dde },
    cout: { st: "Provisions probablement insuffisantes, classées par complément estimé (25 premières)", tete: ["Mouvement", "Coût final attendu", "Fourchette", "Complément", "Explication"], ligne: (r) => [esc(r.id), `<span class="nombre">${eur(r.attendu)}</span>`, `<span class="nombre">${eur(r.bas)} – ${eur(r.haut)}</span>`, `<span class="nombre">${eur(r.ecart)}</span>`, esc(r.explication)], donnees: VX.scores.cout },
    gli: { st: "Baux en alerte d'impayé à 90 jours, classés par probabilité (25 premiers)", tete: ["Bail", "Probabilité", "Loyers exposés", "Pourquoi"], ligne: (r) => [esc(r.id), `<span class="nombre">${pct(r.proba)}</span>`, `<span class="nombre">${eur(r.loyers)}</span>`, esc(r.motif)], donnees: VX.scores.gli },
  };
  function liste(nom) {
    const l = LISTES[nom];
    $("#st-liste").textContent = l.st;
    $("#t-liste").innerHTML = `<thead><tr>${l.tete.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${l.donnees.map((r) => `<tr>${l.ligne(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
    document.querySelectorAll("[data-liste]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.liste === nom));
  }
  document.querySelectorAll("[data-liste]").forEach((b) => b.addEventListener("click", () => liste(b.dataset.liste)));
  liste("dde");

  /* ---------- Plan d'action ---------- */
  const p = VX.plan;
  $("#kpis-plan").innerHTML =
    kpi("S/P glissant 12 mois aujourd'hui", pct(p.glissant_actuel), "fin octobre 2026", "var(--encre)") +
    kpi("Fin janvier 2027 sans action", pct(p.glissant_sans[1]), `8 chances sur 10 entre ${pct(p.glissant_sans[0])} et ${pct(p.glissant_sans[2])}`, "#9fb6c6") +
    kpi("Fin janvier 2027 avec le plan", pct(p.glissant_avec[1]), `8 chances sur 10 entre ${pct(p.glissant_avec[0])} et ${pct(p.glissant_avec[2])}`, "var(--sarcelle)") +
    kpi("Le plan fait mieux", pct(p.proba_mieux, 0), `des ${nf(p.tirages)} simulations du trimestre`, "var(--violet)", "≈ " + nf(p.gain_points, 1) + " point de S/P sur le trimestre");

  (function projection() {
    const pr = VX.projection, hist = pr.filter((x) => x.scenario === "Historique"), sans = pr.filter((x) => x.scenario === "Sans action"), plan = pr.filter((x) => x.scenario !== "Historique" && x.scenario !== "Sans action");
    const ordres = [...new Set(pr.map((x) => x.ordre))].sort((a, b) => a - b), mois = Object.fromEntries(pr.map((x) => [x.ordre, x.mois]));
    const vals = pr.flatMap((x) => [x.p10, x.p50, x.p90]).filter((v) => v != null), lo = Math.floor(Math.min(...vals) * 100) / 100, hi = Math.ceil(Math.max(...vals) * 100) / 100;
    const W = 620, H = 300, L = 46, R = 120, T = 16, B = 34;
    const x = (o) => L + ((o - ordres[0]) / (ordres.at(-1) - ordres[0])) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const ligne = (a, k) => a.map((p2, i) => (i ? "L" : "M") + x(p2.ordre).toFixed(1) + "," + y(p2[k]).toFixed(1)).join(" ");
    const bande = (a) => ligne(a, "p90") + " " + [...a].reverse().map((p2) => "L" + x(p2.ordre).toFixed(1) + "," + y(p2.p10).toFixed(1)).join(" ") + " Z";
    const nomMois = (s) => { const [a, mm] = s.split("-"); return ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."][+mm - 1] + " " + a.slice(2); };
    let g = "";
    for (let v = lo; v <= hi + 1e-9; v += 0.01) g += `<path d="M${L},${y(v)} H${W - R}" stroke="#e3eaee"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#5d7083">${nf(v * 100, 0)} %</text>`;
    ordres.filter((o, i) => i % 3 === 0 || o === ordres.at(-1)).forEach((o) => { g += `<text x="${x(o)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#5d7083">${nomMois(mois[o])}</text>`; });
    const debut = sans[0].ordre;
    const fin = (a) => a.at(-1);
    $("#g-projection").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="S/P glissant 12 mois : historique puis projection à 3 mois sans action et avec le plan">
      <rect x="${x(debut)}" y="${T}" width="${x(ordres.at(-1)) - x(debut)}" height="${H - T - B}" fill="#f2f8f9"/>
      <text x="${x(debut) + 6}" y="${T + 14}" font-size="11" font-weight="700" fill="#087f8c">Projection</text>${g}
      <path d="${bande(sans)}" fill="#c9d3db" opacity="0.55"/><path d="${bande(plan)}" fill="#087f8c" opacity="0.28"/>
      <path class="trace-hist" d="${ligne(hist, "p50")}" fill="none" stroke="#0f2c44" stroke-width="2.5"/>
      <path d="${ligne(sans, "p50")}" fill="none" stroke="#5d7083" stroke-width="2" stroke-dasharray="5 4"/>
      <path d="${ligne(plan, "p50")}" fill="none" stroke="#087f8c" stroke-width="2.5"/>
      <text x="${x(fin(sans).ordre) + 8}" y="${y(fin(sans).p50) - 4}" font-size="12" font-weight="700" fill="#5d7083">Sans action ${pct(fin(sans).p50)}</text>
      <text x="${x(fin(plan).ordre) + 8}" y="${y(fin(plan).p50) + 14}" font-size="12" font-weight="700" fill="#087f8c">Avec le plan ${pct(fin(plan).p50)}</text></svg>`;
  })();

  (function actions() {
    const A = VX.actions, max = Math.max(...A.flatMap((a) => [Math.abs(a.p10), Math.abs(a.p90)]));
    const html = A.map((a) => {
      const degrade = a.points < 0, c = degrade ? "#c14953" : "#2e8b6b", w = (v) => (Math.abs(v) / max) * 100;
      return `<div class="action"><div><div class="action__nom">${esc(a.id + " · " + a.action)}</div><div class="action__cible">${esc(a.cible)} · ${esc(a.responsable)}</div></div>
        <svg viewBox="0 0 100 22" preserveAspectRatio="none" role="img" aria-label="${esc(`${a.id} : effet médian ${eur(a.p50)} de charge ${degrade ? "en plus" : "évitée"}, fourchette ${eur(a.p10)} à ${eur(a.p90)}`)}"><rect x="0" y="5" width="100" height="12" rx="3" fill="#eef1f3"/><rect x="0" y="5" width="${w(a.p50)}" height="12" rx="3" fill="${c}"/><path d="M${w(a.p10)},11 H${w(a.p90)}" stroke="#0f2c44" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>
        <div class="action__points" style="color:${c}">${degrade ? "+" : "−"}${nf(Math.abs(a.points), 2)} pt</div></div>`;
    }).join("");
    const tot = A.reduce((s, a) => s + a.points, 0);
    $("#g-actions").innerHTML = `<div class="actions">${html}</div><div class="total"><span>Effet cumulé médian sur le S/P du trimestre</span><span>−${nf(tot, 1)} point</span></div>
      <p class="info">L'action A4 augmente la charge tout de suite : provisionner juste est la bonne décision, même si le ratio du mois se dégrade.</p>`;
  })();

  $("#t-taches").innerHTML = `<thead><tr><th scope="col">Action</th><th scope="col">Objet</th><th scope="col">Geste</th><th scope="col">Motif</th></tr></thead><tbody>${VX.taches.filter((t) => t.rang <= 3).map((t) => `<tr><td>${esc(t.action)}</td><td>${esc(t.objet)}</td><td>${esc(t.geste)}</td><td>${esc(t.motif)}</td></tr>`).join("")}</tbody>`;

  /* ---------- Copilote ---------- */
  const fil = $("#fil");
  $("#suggestions").innerHTML = VX.sessions.map((s, i) => `<button type="button" data-s="${i}" aria-pressed="false">${esc(s.question)}</button>`).join("");
  document.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => {
    const s = VX.sessions[+b.dataset.s];
    document.querySelectorAll("[data-s]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    fil.innerHTML = `<div class="ecrire"><p class="fil__q">${esc(s.question)}</p><p class="fil__r">${esc(s.reponse)}</p><div class="trace">${s.outils.map((o) => `<span>${esc(o)}</span>`).join("")}${s.sources.map((o) => `<span class="doc">${esc(o)}</span>`).join("")}</div></div>`;
  }));
  const v = VX.veille, actives = v.alertes.filter((a) => a.declenchee).length;
  $("#st-veille").textContent = `Agent de veille · ${actives} signaux sur ${v.alertes.length} demandent une décision · contrôles conformes`;
  $("#alertes").innerHTML = v.alertes.map((a) => `<li class="alerte${a.declenchee ? "" : " alerte--calme"}"><b>${esc(a.id + " · " + a.nom)}</b><p>${esc(a.texte)}</p><small>${esc(a.responsable)}</small></li>`).join("");

  /* ---------- Gouvernance ---------- */
  const G = VX.gouvernance;
  $("#charte").innerHTML = G.charte.map((c) => `<li>${esc(c)}</li>`).join("");
  $("#t-controles").innerHTML = `<thead><tr><th scope="col">Contrôle</th><th scope="col">Statut</th></tr></thead><tbody>${G.controles.map((c) => `<tr><td>${esc(c.id + " · " + c.controle)}</td><td class="statut ${c.statut === "ÉCART" ? "statut--ko" : "statut--ok"}">${esc(c.statut)}</td></tr>`).join("")}</tbody>`;
  $("#t-kpi").innerHTML = `<thead><tr><th scope="col">KPI</th><th scope="col">Règle de calcul</th><th scope="col">Propriétaire</th><th scope="col">Contrôle</th></tr></thead><tbody>${G.kpi.map((x) => `<tr><td>${esc(x.nom)}</td><td>${esc(x.regle)}</td><td>${esc(x.proprietaire)}</td><td>${esc(x.controle)}</td></tr>`).join("")}</tbody>`;
  $("#t-modeles").innerHTML = `<thead><tr><th scope="col">Modèle</th><th scope="col">Validation</th><th scope="col">Usage</th><th scope="col">Limites</th></tr></thead><tbody>${G.modeles.map((x) => `<tr><td>${esc(x.nom)}</td><td>${esc(x.validation)}</td><td>${esc(x.usage)}</td><td>${esc(x.limites)}</td></tr>`).join("")}</tbody>`;
})();
