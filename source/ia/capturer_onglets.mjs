// Captures des 15 onglets de l'application via Edge sans interface (CDP, sans dépendance).
// Seule la zone de la feuille est capturée : ni barre d'outils Qlik, ni navigateur, ni chemin.
// node ia/capturer_onglets.mjs <dossier_sortie> [sonde]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SORTIE = process.argv[2];
const SONDE = process.argv[3] === 'sonde';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// Chemin du QVF ouvert dans Qlik Sense Desktop : variable QVF_PATH (ex. C:/Projets/Assurance_Decision_Studio_DEV.qvf).
const QVF = process.env.QVF_PATH || 'Assurance_Decision_Studio_DEV.qvf';
const APP = `http://localhost:4848/sense/app/${encodeURIComponent(QVF)}/sheet/`;
const ONGLETS = [
  ['00-accueil', 'ads-home'], ['01-decider', 'UHHjXj'], ['02-comprendre', 'ads-analyse'], ['03-indemniser', 'ads-claims'],
  ['04-renouveler', 'ads-renewal'], ['05-simuler', 'ads-simulation'], ['06-prevenir', 'ads-gli-detect'], ['07-recouvrer', 'ads-gli-pilot'],
  ['08-rejouer', 'ads-replay'], ['09-cartographier', 'ads-geo'], ['10-fiabiliser', 'ads-quality'], ['11-evaluer', 'ads-ai'],
  ['12-suivre', 'ads-journey'], ['13-anticiper', 'ads-anticiper'], ['14-copiloter', 'ads-copilote'],
];
const PORT = 9334, attendre = ms => new Promise(r => setTimeout(r, ms));
if (SORTIE) fs.mkdirSync(SORTIE, { recursive: true });

const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-onglets-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, 'about:blank']);
let cible;
for (let i = 0; i < 40 && !cible; i++) { await attendre(500); try { cible = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch { } }
const ws = new WebSocket(cible.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
let n = 0; const att = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); att.get(m.id)?.(m.result); att.delete(m.id); });
const cdp = (method, params = {}) => new Promise(r => { att.set(++n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluer = async expr => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
const jusqua = async (expr, max = 60000) => { for (let t = 0; t < max; t += 500) { if (await evaluer(expr)) return true; await attendre(500); } return false; };

const LARGEUR = 1600;
// Zone de la feuille : le conteneur de grille Qlik (sans la barre d'outils ni l'en-tête de feuille).
const ZONE = `(()=>{const e=document.querySelector('.qv-panel-sheet .qvt-sheet-container, .qv-panel-sheet #grid-wrap, .qv-panel-sheet, #grid');if(!e)return null;
 const sc=[e,...e.querySelectorAll('*')].find(x=>x.clientHeight>=600&&x.scrollHeight>x.clientHeight+20&&getComputedStyle(x).overflowY!=='visible');
 const r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height,scroll:sc?sc.scrollHeight:0,client:sc?sc.clientHeight:0,cls:e.className}})()`;

const SEUL = process.argv[3] && !SONDE ? process.argv[3].split(',') : null;
// Repère le défileur propre à la feuille (hauteur visible >= 600 px) et le marque.
const DEFILEUR = `(()=>{const e=document.querySelector('.qv-panel-sheet');const sc=[e,...e.querySelectorAll('*')].find(x=>x.clientHeight>=600&&x.scrollHeight>x.clientHeight+20&&getComputedStyle(x).overflowY!=='visible');
 if(!sc)return null;sc.setAttribute('data-vx-defileur','1');const z=e.getBoundingClientRect(),r=sc.getBoundingClientRect();return {haut:r.top-z.top,client:sc.clientHeight,total:sc.scrollHeight}})()`;
const capture = async z => (await cdp('Page.captureScreenshot', { format: 'png', clip: { x: z.x, y: z.y, width: z.w, height: z.h, scale: 1 } })).data;

for (const [nom, id] of ONGLETS) {
  if (SEUL && !SEUL.includes(nom)) continue;
  await cdp('Emulation.setDeviceMetricsOverride', { width: LARGEUR, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: APP + id + '/state/analysis' });
  await jusqua("!!document.querySelector('.qv-panel-sheet') && !document.querySelector('.qv-loader, .qv-object-loader')", 60000);
  await attendre(5000);
  const z = await evaluer(ZONE);
  if (SONDE) { console.log(nom, JSON.stringify(z)); continue; }
  if (id === 'ads-copilote') {
    await jusqua("!!document.querySelector('.vxi-cop .etat.on')", 15000);
    await evaluer("(()=>{const b=[...document.querySelectorAll('.vxi-sug button')].find(b=>b.textContent.startsWith('Le S/P'));b&&b.click();return !!b})()");
    await jusqua("document.querySelectorAll('.vxi-a').length>=1", 60000); await attendre(1500);
  }
  if (id === 'ads-journey') {
    await evaluer("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Client résilié');b&&b.click();return !!b})()");
    await attendre(6000);
  }
  const d = await evaluer(DEFILEUR);
  let jpeg;
  if (!d) {
    jpeg = (await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 86, clip: { x: z.x, y: z.y, width: z.w, height: z.h, scale: 1 } })).data;
  } else {
    // Vues successives du défileur, recollées dans un canvas de la page.
    const vues = [];
    for (let pos = 0; ; pos += d.client) {
      const p = Math.min(pos, d.total - d.client);
      await evaluer(`(()=>{document.querySelector('[data-vx-defileur]').scrollTop=${p};return 1})()`);
      await attendre(2500);
      vues.push({ p, data: await capture(z) });
      if (p >= d.total - d.client) break;
    }
    await evaluer(`(()=>{document.querySelector('[data-vx-defileur]').scrollTop=0;return 1})()`);
    const H = Math.round(d.haut + d.total + (z.h - d.haut - d.client));
    jpeg = await evaluer(`(async()=>{const vs=${JSON.stringify(vues.map(v => ({ p: v.p, src: 'data:image/png;base64,' + v.data })))};
      const c=document.createElement('canvas');c.width=${Math.round(z.w)};c.height=${H};const g=c.getContext('2d');
      const im=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=s});
      for(const [k,v] of vs.entries()){const i=await im(v.src);
        if(k===0) g.drawImage(i,0,0,i.width,${Math.round(d.haut)},0,0,i.width,${Math.round(d.haut)});
        g.drawImage(i,0,${Math.round(d.haut)},i.width,${d.client},0,${Math.round(d.haut)}+v.p,i.width,${d.client});
        if(k===vs.length-1) g.drawImage(i,0,${Math.round(d.haut + d.client)},i.width,i.height-${Math.round(d.haut + d.client)},0,${Math.round(d.haut)}+${d.total},i.width,i.height-${Math.round(d.haut + d.client)});}
      return c.toDataURL('image/jpeg',0.86).split(',')[1]})()`);
  }
  fs.writeFileSync(path.join(SORTIE, nom + '.jpg'), Buffer.from(jpeg, 'base64'));
  console.log('capture', nom, d ? `${d.total}px en ${Math.ceil(d.total / d.client)} vues` : 'une vue');
}
ws.close(); edge.kill();
