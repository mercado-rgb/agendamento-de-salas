// Servidor de teste local: `npm run local` e abra http://localhost:8888
// Usa a mesma lógica da função do Netlify, com os dados guardados só na memória.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarHandler } from '../netlify/lib/core.mjs';
import { criarStoreMemoria } from './memoria-store.mjs';

const raiz = fileURLToPath(new URL('../public/', import.meta.url));
const store = criarStoreMemoria();
const api = criarHandler(() => store);
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const porta = Number(process.env.PORT) || 8888;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${porta}`);
  if (url.pathname === '/api/reservas') {
    const corpo = ['POST', 'PUT'].includes(req.method) ? await new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); }) : undefined;
    const resposta = await api(new Request(url, { method: req.method, headers: req.headers, body: corpo }));
    res.writeHead(resposta.status, Object.fromEntries(resposta.headers)); res.end(await resposta.text()); return;
  }
  const caminho = normalize(join(raiz, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!caminho.startsWith(raiz)) { res.writeHead(403); res.end(); return; }
  try { const arq = await readFile(caminho); res.writeHead(200, { 'content-type': tipos[extname(caminho)] || 'application/octet-stream' }); res.end(arq); }
  catch { res.writeHead(404); res.end('Não encontrado'); }
}).listen(porta, () => console.log(`Reserva de salas rodando em http://localhost:${porta}`));
