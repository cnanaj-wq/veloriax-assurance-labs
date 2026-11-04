// Teste le serveur MCP comme le ferait un client : initialize, tools/list, puis un appel de chaque outil.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const srv = spawn(process.execPath, [path.join(ici, 'serveur.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
let tampon = ''; const attente = new Map(); let id = 0;
srv.stdout.on('data', d => { tampon += d; let i; while ((i = tampon.indexOf('\n')) >= 0) { const m = JSON.parse(tampon.slice(0, i)); tampon = tampon.slice(i + 1); attente.get(m.id)?.(m); } });
const rpc = (method, params) => new Promise(r => { attente.set(++id, r); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
console.log('serveur :', init.result.serverInfo.name);
const outils = (await rpc('tools/list', {})).result.tools;
console.log('outils :', outils.map(t => t.name).join(', '));
const essais = [
  ['kpi_portefeuille', {}], ['kpi_portefeuille', { filtres: { annee: 2026 } }], ['expliquer_ecart', { axe: 'region' }],
  ['expliquer_ecart', { axe: 'garantie', filtres: { annee: 2026 } }], ['scores_ia', { modele: 'degats_des_eaux', top: 3 }],
  ['scores_ia', { modele: 'cout_final', top: 3 }], ['scores_ia', { modele: 'impaye_gli', top: 3 }], ['plan_action', {}],
  ['taches', { action: 'A3', top: 3 }], ['gouvernance', { sujet: 'sp' }], ['gouvernance', { sujet: 'controles' }],
  ['rechercher_documents', { question: 'Comment est calculé le ratio S/P ? peut-on faire la moyenne des mois ?', k: 2 }],
];
for (const [name, args] of essais) {
  const r = (await rpc('tools/call', { name, arguments: args })).result;
  const t = r.content[0].text;
  console.log(`\n== ${name} ${JSON.stringify(args)} ${r.isError ? 'ERREUR' : 'ok'}\n${t.slice(0, process.argv[2] ? 4000 : 700)}`);
}
srv.stdin.end();
