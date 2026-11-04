// Captures haute définition des volets IA via Edge sans interface (protocole CDP, sans dépendance).
// node ia/capturer.mjs  ->  article-linkedin/captures/ia-anticiper.png, ia-copilote.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(RACINE, 'article-linkedin', 'captures');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const APP = 'http://localhost:4848/sense/app/C%3A%2FBootcamp_Data_Engineer%2Fqlik-assurance-premium%2FAssurance_Decision_Studio_DEV.qvf/sheet/';
const PORT = 9333, attendre = ms => new Promise(r => setTimeout(r, ms));

const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-capture-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, 'about:blank']);
let cible;
for (let i = 0; i < 40 && !cible; i++) { await attendre(500); try { cible = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch { } }
const ws = new WebSocket(cible.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
let n = 0; const att = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); att.get(m.id)?.(m.result); att.delete(m.id); });
const cdp = (method, params = {}) => new Promise(r => { att.set(++n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluer = async expr => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
const jusqua = async (expr, max = 60000) => { for (let t = 0; t < max; t += 500) { if (await evaluer(expr)) return true; await attendre(500); } return false; };

await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1.5, mobile: false });
const capturer = async nom => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SORTIE, nom), Buffer.from(r.data, 'base64')); console.log('capture', nom); };

// Volet 13 : attendre le graphique et les trois tableaux remplis
await cdp('Page.navigate', { url: APP + 'ads-anticiper/state/analysis' });
await jusqua("document.querySelectorAll('.vxi-kpi').length===4 && !!document.querySelector('.vxi-plan') && [...document.querySelectorAll('.qv-object-table, .sn-table, [data-testid=\"sn-table\"], table')].filter(t=>t.innerText.includes('POL')||t.innerText.includes('SIN-')).length>=2");
await attendre(3000); await capturer('ia-anticiper.png');

// Volet 14 : le copilote produit le briefing de la semaine
await cdp('Page.navigate', { url: APP + 'ads-copilote/state/analysis' });
await jusqua("!!document.querySelector('.vxi-cop .etat.on')");
await evaluer("[...document.querySelectorAll('.vxi-sug button')].find(b=>b.textContent.startsWith('Briefing')).click()");
await jusqua("document.querySelectorAll('.vxi-a').length>=1", 120000);
await evaluer("[...document.querySelectorAll('.vxi-sug button')].find(b=>b.textContent.startsWith('Le S/P')).click()");
await jusqua("document.querySelectorAll('.vxi-a').length>=2", 120000);
await evaluer("(()=>{const f=document.querySelector('.vxi-fil'); f.scrollTop=0; return true})()");
await attendre(1500); await capturer('ia-copilote.png');

ws.close(); edge.kill();
