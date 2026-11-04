// Connexion à l'Engine API de Qlik Sense Desktop (WebSocket, port 4848).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.dirname(fileURLToPath(import.meta.url)).split(path.sep).join('/');
export const ORIGINAL = process.env.VX_QLIK_ORIGINAL || '';
export const DEV = process.env.VX_QLIK_APP || ROOT + '/Assurance_Decision_Studio_DEV.qvf';
export async function connect(path='') {
 const ws=new WebSocket('ws://localhost:4848/app/'+encodeURIComponent(path));
 let seq=0; const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.t);m.error?p.reject(new Error(p.method+": "+JSON.stringify(m.error))):p.resolve(m.result)}});
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});setTimeout(()=>reject(new Error('Connection timeout')),15000).unref()});
 const call=(handle,method,params=[])=>new Promise((resolve,reject)=>{const id=++seq;const t=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timed out'))},120000);pending.set(id,{resolve,reject,t,method});ws.send(JSON.stringify({jsonrpc:'2.0',id,handle,method,params}))});
 return {ws,call,close:()=>ws.close()};
}



