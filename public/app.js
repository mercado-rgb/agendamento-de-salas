import { SALAS, SALA_POR_ID, GEO, HORA_INICIO, HORA_FIM, PASSO, DIAS_ANTECEDENCIA, FUSO } from './config.js';
import { LOGO_INNER, LOGO_VIEWBOX } from './logo.js';

/* ================= utilidades ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const toMin = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
const toHM = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const fmtH = m => { const h = Math.floor(m / 60), mm = m % 60; return h + 'h' + (mm ? pad(mm) : ''); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WD_L = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function agora() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
function somarDias(dia, n) { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function diaSemana(dia) { return new Date(dia + 'T12:00:00Z').getUTCDay(); }
function fmtDia(dia, longo) { const d = new Date(dia + 'T12:00:00Z'); return (longo ? WD_L[d.getUTCDay()] + ', ' : '') + d.getUTCDate() + ' de ' + MES[d.getUTCMonth()]; }
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 4000); }
function rotuloLugar(sala, lugar) { if (lugar === 'sala') return 'Sala inteira'; return (SALA_POR_ID[sala].lugares[0]?.banco ? 'Banco ' : 'Cadeira ') + lugar; }
function logoSVG(cls = 'fea-logo') { return `<svg class="${cls}" viewBox="${LOGO_VIEWBOX}" role="img" aria-label="FEA Júnior USP">${LOGO_INNER}</svg>`; }

/* ================= estado ================= */
const hoje0 = agora();
const S = {
  nome: ls('fj-nome') || '', codigo: ls('fj-codigo') || '', dir: ls('fj-diretoria') || '',
  tokens: JSON.parse(ls('fj-tokens') || '{}'),
  dia: hoje0.dia, hora: 0, view: 'mapa', room: null, agRoom: 'aper',
  porDia: {}, sincronizado: null, erroRede: false,
};
S.hora = (hoje0.min >= HORA_INICIO && hoje0.min < HORA_FIM) ? Math.floor(hoje0.min / PASSO) * PASSO : 9 * 60;
if (hoje0.min >= HORA_FIM - PASSO) { S.dia = somarDias(hoje0.dia, 1); S.hora = 9 * 60; }
function salvarTokens() { ls('fj-tokens', JSON.stringify(S.tokens)); }
const reservasDoDia = (dia = S.dia) => S.porDia[dia]?.reservas || [];
const podeCancelar = r => !!S.tokens[r.id] || !!S.dir;
const ehMinha = r => !!S.tokens[r.id] || (S.nome && r.nome.toLowerCase() === S.nome.toLowerCase());
function ocupa(r, sala, lugar) { return r.sala === sala && (lugar === 'sala' || r.lugar === 'sala' || r.lugar === lugar); }
function quemOcupa(sala, lugar, t, dia = S.dia) {
  return reservasDoDia(dia).filter(r => ocupa(r, sala, lugar) && toMin(r.inicio) <= t && t < toMin(r.fim))
    .sort((a, b) => (a.lugar === 'sala' ? -1 : 1))[0] || null;
}
function reservasDoLugar(sala, lugar, dia = S.dia) {
  return reservasDoDia(dia).filter(r => ocupa(r, sala, lugar)).sort((a, b) => toMin(a.inicio) - toMin(b.inicio));
}
// Fim da ocupação contínua a partir de t (se reservas encostam uma na outra, pula todas)
function livreAPartirDe(sala, lugar, t, dia = S.dia) {
  let m = t, guard = 0;
  while (guard++ < 60) { const r = quemOcupa(sala, lugar, m, dia); if (!r) return m < HORA_FIM ? m : null; m = toMin(r.fim); }
  return null;
}
function proximaOcupacao(sala, lugar, t, dia = S.dia) {
  const prox = reservasDoLugar(sala, lugar, dia).filter(r => toMin(r.inicio) > t)[0];
  return prox ? toMin(prox.inicio) : null;
}

/* ================= API ================= */
async function api(method, params = {}, body) {
  const url = '/api/reservas' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
  const headers = { 'x-codigo': S.codigo };
  if (body) headers['content-type'] = 'application/json';
  if (params.id && S.tokens[params.id]) headers['x-token'] = S.tokens[params.id];
  if (S.dir) headers['x-diretoria'] = S.dir;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  let dados = {}; try { dados = await res.json(); } catch {}
  if (res.status === 401 && dados.erro === 'codigo') { pedirNome(true); }
  return { ok: res.ok, status: res.status, dados };
}
async function carregar(dia = S.dia, silencioso = false) {
  try {
    const { ok, dados } = await api('GET', { de: dia, dias: 1 });
    if (!ok) throw new Error(dados.mensagem || 'erro');
    S.porDia[dia] = { reservas: dados.reservas, em: Date.now() };
    S.sincronizado = new Date(); S.erroRede = false;
  } catch (e) { S.erroRede = true; if (!silencioso) toast('Não foi possível atualizar as reservas.'); }
  renderSync(); renderTudo();
}
function renderSync() {
  const s = $('#sync');
  s.classList.toggle('err', S.erroRede);
  $('span', s).textContent = S.erroRede ? 'Sem conexão com o servidor' : S.sincronizado ? `Atualizado às ${pad(S.sincronizado.getHours())}:${pad(S.sincronizado.getMinutes())}` : 'Carregando…';
}

/* ================= barra de data e hora ================= */
function renderWhen() {
  const h = agora().dia, box = $('#dates'); box.innerHTML = '';
  let naLista = false;
  for (let i = 0; i < 7; i++) {
    const d = somarDias(h, i), b = document.createElement('button'), on = d === S.dia; if (on) naLista = true;
    b.className = 'dchip'; b.setAttribute('aria-pressed', on);
    b.innerHTML = `<small>${i === 0 ? 'hoje' : i === 1 ? 'amanhã' : WD[diaSemana(d)]}</small><b>${d.slice(8)}/${d.slice(5, 7)}</b>`;
    b.onclick = () => mudarDia(d); box.appendChild(b);
  }
  $('#dPick').value = naLista ? '' : S.dia; $('#dPick').max = somarDias(h, DIAS_ANTECEDENCIA);
  const sel = $('#hPick'); if (!sel.options.length) for (let m = HORA_INICIO; m < HORA_FIM; m += PASSO) sel.add(new Option(toHM(m), m));
  sel.value = S.hora;
}
function mudarDia(d) { S.dia = d; renderWhen(); if (S.porDia[d]) renderTudo(); carregar(d); }
$('#dPick').onchange = e => { if (e.target.value) mudarDia(e.target.value); };
$('#hPick').onchange = e => { S.hora = Number(e.target.value); renderTudo(); };

/* ================= planta ================= */
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
const PLACA = {
  cow: { x: 120, y: 636 }, est: { x: 388, y: 316 }, copa: { x: 588, y: 316 }, aper: { x: 788, y: 316 }, rep: { x: 622, y: 506 },
};
const PORTA = { cow: { x: 325, y: 620 }, est: { x: 545, y: 310 }, copa: { x: 745, y: 310 }, aper: { x: 925, y: 310 }, rep: { x: 610, y: 462 } };
const DENTRO = { cow: { x: 325, y: 548 }, est: { x: 545, y: 236 }, copa: { x: 745, y: 236 }, aper: { x: 925, y: 236 }, rep: { x: 540, y: 462 } };
const PW = 150, PH = 40, INICIO = { x: 40, y: 694 };
function caminho(id) {
  if (id === 'cow') return [INICIO, { x: 325, y: 694 }, PORTA.cow, DENTRO.cow];
  if (id === 'rep') return [INICIO, { x: 900, y: 694 }, { x: 900, y: 462 }, PORTA.rep, DENTRO.rep];
  const d = PORTA[id];
  return [INICIO, { x: 900, y: 694 }, { x: 900, y: 560 }, { x: 670, y: 560 }, { x: 670, y: 378 }, { x: d.x, y: 378 }, d, DENTRO[id]];
}
function mesa(g, x, y, w, h, rx) { el('rect', { x, y, width: w, height: h, rx: rx ?? 6, fill: '#E3C29A', stroke: 'var(--furn-line)', 'stroke-width': 2.2 }, g); }
function janela(g, x1, y1, x2, y2) { el('line', { x1, y1, x2, y2, stroke: 'var(--glass)', 'stroke-width': 7 }, g); el('line', { x1, y1, x2, y2, stroke: 'var(--wall)', 'stroke-width': 1.2 }, g); }
function vao(g, x, y, vertical, len, vidro) {
  const h = len / 2, a = vertical ? { x1: x, y1: y - h, x2: x, y2: y + h } : { x1: x - h, y1: y, x2: x + h, y2: y };
  el('line', { ...a, stroke: 'var(--floor)', 'stroke-width': 9 }, g);
  if (vidro) el('line', { ...a, stroke: 'var(--glass)', 'stroke-width': 3 }, g);
}
function moveis(id, g, cor) {
  const { x: X, y: Y, w: W, h: H } = GEO[id];
  if (id === 'cow') {
    el('rect', { x: X + 4, y: Y + 4, width: W - 8, height: 8, fill: cor }, g); el('rect', { x: X + 4, y: Y + 4, width: 8, height: H - 8, fill: cor }, g);
    el('rect', { x: X + W - 12, y: Y + 120, width: 8, height: 180, rx: 2, fill: '#fff', stroke: 'var(--furn-line)', 'stroke-width': 1.5 }, g);
    el('rect', { x: X + W - 12, y: Y + 340, width: 6, height: 60, rx: 2, fill: 'var(--furn-line)' }, g);
    for (let i = 0; i < 4; i++) mesa(g, X + 48, Y + 70 + i * 120, W - 110, 36);
  }
  if (id === 'rep') {
    el('rect', { x: X + 4, y: Y + 4, width: 18, height: H - 8, fill: 'url(#triBlue)' }, g); el('rect', { x: X + 4, y: Y + 4, width: W - 8, height: 18, fill: 'url(#triBlue)' }, g);
    mesa(g, X + 62, Y + 80, 120, 62, 14);
  }
  if (id === 'est') {
    el('rect', { x: X + 4, y: Y + 4, width: W - 8, height: 12, fill: cor }, g); el('rect', { x: X + 4, y: Y + 16, width: W - 8, height: 8, fill: 'url(#wood)' }, g);
    mesa(g, X + 10, Y + 26, W - 20, 30, 3); mesa(g, X + 10, Y + 56, 30, 150, 3); mesa(g, X + W - 40, Y + 56, 30, 150, 3);
  }
  if (id === 'copa') {
    mesa(g, X + 10, Y + 12, W - 20, 32, 3); mesa(g, X + W - 42, Y + 44, 32, 120, 3);
    el('rect', { x: X + 24, y: Y + 17, width: 26, height: 20, rx: 3, fill: 'var(--furn-line)' }, g);
    el('circle', { cx: X + 80, cy: Y + 28, r: 8, fill: 'none', stroke: 'var(--furn-line)', 'stroke-width': 2 }, g);
    el('rect', { x: X + W - 37, y: Y + 70, width: 22, height: 18, rx: 3, fill: 'var(--furn-line)' }, g);
    el('circle', { cx: X + 82, cy: Y + 150, r: 30, fill: '#E3C29A', stroke: 'var(--furn-line)', 'stroke-width': 2.2 }, g);
  }
  if (id === 'aper') {
    el('rect', { x: X + W - 22, y: Y + 4, width: 18, height: H - 8, fill: 'url(#triYel)' }, g);
    el('rect', { x: X + W - 30, y: Y + 100, width: 6, height: 70, rx: 2, fill: 'var(--furn-line)' }, g);
    mesa(g, X + 62, Y + 56, 70, 170, 12);
  }
}
let visitante, camVB = [0, 0, 1000, 720], movendo = false;
function montarPlanta() {
  const svg = $('#plan'); svg.innerHTML = '';
  const defs = el('defs', {}, svg);
  const tri = (id, c) => { const p = el('pattern', { id, width: 28, height: 28, patternUnits: 'userSpaceOnUse' }, defs); el('rect', { width: 28, height: 28, fill: c[0] }, p); el('path', { d: 'M0 0L28 0L14 14Z', fill: c[1] }, p); el('path', { d: 'M0 28L14 14L28 28Z', fill: c[2] }, p); el('path', { d: 'M0 0L14 14L0 28Z', fill: c[3] }, p); };
  tri('triBlue', ['#EAF0FB', '#1B2A8C', '#7FA4E0', '#3A62C8']); tri('triYel', ['#FFF6D8', '#F2B705', '#F7D35C', '#E59A00']);
  const rub = el('pattern', { id: 'rubber', width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, defs); el('circle', { cx: 4, cy: 4, r: 1.2, fill: '#474C57' }, rub);
  const wood = el('pattern', { id: 'wood', width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, defs); el('rect', { width: 8, height: 8, fill: '#B9844F' }, wood); el('rect', { width: 3, height: 8, fill: '#A87443' }, wood);
  el('symbol', { id: 'fealogo', viewBox: LOGO_VIEWBOX }, defs).innerHTML = LOGO_INNER;

  const decor = el('g', { class: 'decor' }, svg);
  el('rect', { x: 0, y: 626, width: 1000, height: 94, fill: 'var(--street)' }, decor); el('rect', { x: 0, y: 626, width: 1000, height: 94, fill: 'url(#rubber)' }, decor);
  el('text', { x: 990, y: 712, class: 'street-lbl', 'font-size': 11, 'text-anchor': 'end' }, decor).textContent = 'Corredor do prédio';
  el('rect', { x: 20, y: 20, width: 960, height: 600, fill: 'var(--floor)' }, decor);
  el('rect', { x: 380, y: 310, width: 600, height: 90, fill: 'var(--corr)' }, decor);
  el('rect', { x: 610, y: 400, width: 370, height: 220, fill: 'var(--wood-l)' }, decor);
  el('rect', { x: 720, y: 400, width: 260, height: 14, fill: 'url(#wood)' }, decor);
  el('use', { href: '#fealogo', x: 790, y: 419, width: 120, height: 43, style: 'color:#1D2330' }, decor);
  el('rect', { x: 810, y: 478, width: 70, height: 34, rx: 8, fill: '#EFE3CD', stroke: 'var(--furn-line)', 'stroke-width': 2 }, decor);
  el('rect', { x: 806, y: 474, width: 78, height: 10, rx: 4, fill: '#8A5A32' }, decor);
  el('rect', { x: 960, y: 430, width: 14, height: 90, rx: 3, fill: '#2A55C9' }, decor);
  el('rect', { x: 640, y: 590, width: 120, height: 18, rx: 3, fill: '#B9844F' }, decor);
  el('text', { x: 830, y: 604, class: 'plan-lbl', 'font-size': 13, 'text-anchor': 'middle' }, decor).textContent = 'Recepção';
  el('text', { x: 394, y: 392, class: 'plan-lbl', 'font-size': 11 }, decor).textContent = 'Corredor interno';

  const salasG = el('g', {}, svg);
  SALAS.forEach(s => {
    const p = GEO[s.id];
    const g = el('g', { class: 'room-g', 'data-room': s.id, tabindex: 0, role: 'button', 'aria-label': `${s.nome}, ${s.apelido}` }, salasG);
    el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, fill: 'var(--floor)' }, g);
    el('rect', { class: 'tint', x: p.x, y: p.y, width: p.w, height: p.h, fill: s.cor, opacity: .14 }, g);
    moveis(s.id, el('g', {}, g), s.cor);
    el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, fill: 'none', stroke: 'var(--wall)', 'stroke-width': 6 }, g);
    g.addEventListener('click', () => irParaSala(s.id));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irParaSala(s.id); } });
    s.lugares.forEach(l => {
      const c = el('g', { class: 'seat', 'data-sala': s.id, 'data-lugar': l.n, transform: `translate(${l.x} ${l.y}) rotate(${l.r})`, tabindex: 0, role: 'button', 'aria-label': rotuloLugar(s.id, l.n) + ', ' + s.nome }, g);
      if (l.banco) el('circle', { class: 'shape', r: 10, fill: 'var(--free)', stroke: 'var(--furn-line)', 'stroke-width': 1.8 }, c);
      else { el('rect', { class: 'shape', x: -9, y: -8, width: 18, height: 16, rx: 5, fill: 'var(--free)', stroke: 'var(--furn-line)', 'stroke-width': 1.8 }, c); el('rect', { x: -9, y: -12, width: 18, height: 5, rx: 2, fill: 'var(--furn-line)' }, c); }
      el('text', { class: 'seat-num', x: 0, y: 3.5, 'font-size': 9.5, 'text-anchor': 'middle', fill: '#fff', transform: `rotate(${-l.r})` }, c).textContent = l.n;
      const abrir = e => { e.stopPropagation(); if (S.room !== s.id) irParaSala(s.id, true); abrirLugar(s.id, l.n); };
      c.addEventListener('click', abrir);
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(e); } });
    });
  });
  const paredes = el('g', { class: 'decor' }, svg);
  el('rect', { x: 20, y: 20, width: 960, height: 600, fill: 'none', stroke: 'var(--wall)', 'stroke-width': 8 }, paredes);
  el('line', { x1: 610, y1: 400, x2: 610, y2: 620, stroke: 'var(--wall)', 'stroke-width': 6 }, paredes);
  el('line', { x1: 610, y1: 400, x2: 980, y2: 400, stroke: 'var(--wall)', 'stroke-width': 6 }, paredes);
  janela(paredes, 60, 20, 340, 20); janela(paredes, 20, 80, 20, 300); janela(paredes, 610, 20, 760, 20); janela(paredes, 800, 20, 960, 20);
  vao(paredes, 325, 620, false, 48); vao(paredes, 900, 620, false, 70, true); vao(paredes, 670, 400, false, 96);
  vao(paredes, 545, 310, false, 40); vao(paredes, 745, 310, false, 40); vao(paredes, 925, 310, false, 40); vao(paredes, 610, 462, true, 44);
  el('line', { x1: 610, y1: 510, x2: 610, y2: 600, stroke: 'var(--glass)', 'stroke-width': 5 }, paredes);
  el('text', { x: 900, y: 648, class: 'street-lbl', 'font-size': 11, 'text-anchor': 'middle' }, paredes).textContent = 'Entrada';
  const placas = el('g', {}, svg);
  SALAS.forEach(s => {
    const p = PLACA[s.id], g = el('g', { 'data-placa': s.id, transform: `translate(${p.x} ${p.y})`, style: 'cursor:pointer' }, placas);
    el('rect', { width: PW, height: PH, rx: 5, fill: '#fff', stroke: '#C9CCD3' }, g);
    el('rect', { y: PH - 5, width: PW, height: 5, fill: '#002EC7' }, g); el('rect', { x: PW - 38, y: PH - 5, width: 38, height: 5, fill: s.cor }, g);
    el('use', { href: '#fealogo', x: 6, y: 4, width: 30, height: 11, style: 'color:#000207' }, g);
    el('text', { x: 7, y: 28, class: 'plate-name', 'font-size': s.nome.length > 15 ? 9.6 : s.nome.length > 12 ? 10.6 : 12.5 }, g).textContent = s.nome;
    el('text', { class: 'plate-st', x: PW - 8, y: 13, 'font-size': 8.5, 'text-anchor': 'end' }, g).textContent = '';
    g.addEventListener('click', () => irParaSala(s.id));
  });
  visitante = el('g', { transform: `translate(${INICIO.x} ${INICIO.y})`, style: 'pointer-events:none' }, svg);
  el('circle', { r: 16, fill: '#0091FF', opacity: .25 }, visitante); el('circle', { r: 9, fill: '#0091FF', stroke: '#fff', 'stroke-width': 3 }, visitante);
}
function pintarCadeiras() {
  SALAS.forEach(s => {
    let livres = 0;
    s.lugares.forEach(l => {
      const g = $(`.seat[data-sala="${s.id}"][data-lugar="${l.n}"]`); if (!g) return;
      const r = quemOcupa(s.id, l.n, S.hora);
      if (!r) livres++;
      $('.shape', g).setAttribute('fill', !r ? 'var(--free)' : ehMinha(r) ? 'var(--mine)' : 'var(--busy)');
      g.setAttribute('aria-label', `${rotuloLugar(s.id, l.n)}, ${s.nome}: ${r ? 'reservada até ' + fmtH(toMin(r.fim)) + ' por ' + r.nome : 'livre'}`);
    });
    const st = $(`[data-placa="${s.id}"] .plate-st`); if (st) st.textContent = `${livres}/${s.lugares.length} livres`;
  });
}
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function animar(ms, fn) { return new Promise(res => { if (reduceMotion || ms <= 0) { fn(1); return res(); } const t0 = performance.now(); const passo = t => { const k = Math.min(1, (t - t0) / ms); fn(easeIO(k)); k < 1 ? requestAnimationFrame(passo) : res(); }; requestAnimationFrame(passo); }); }
function setVB(v) { camVB = v; $('#plan').setAttribute('viewBox', v.map(n => n.toFixed(1)).join(' ')); }
function camera(alvo, ms) { const de = [...camVB]; return animar(ms, k => setVB(de.map((a, i) => a + (alvo[i] - a) * k))); }
async function andar(pts) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y); if (l > .5) { seg.push({ a, b, l }); total += l; } }
  await animar(Math.min(1400, Math.max(500, total * .9)), k => { let d = k * total; for (const s of seg) { if (d <= s.l) { visitante.setAttribute('transform', `translate(${s.a.x + (s.b.x - s.a.x) * d / s.l} ${s.a.y + (s.b.y - s.a.y) * d / s.l})`); return; } d -= s.l; } });
  const u = pts[pts.length - 1]; visitante.setAttribute('transform', `translate(${u.x} ${u.y})`);
}
function caixaSala(id) { const p = GEO[id], pl = PLACA[id]; const x0 = Math.min(p.x, pl.x) - 20, y0 = Math.min(p.y, pl.y) - 20, x1 = Math.max(p.x + p.w, pl.x + PW) + 20, y1 = Math.max(p.y + p.h, pl.y + PH) + 20; return [x0, y0, x1 - x0, y1 - y0]; }
async function irParaSala(id, rapido) {
  if (movendo || S.room === id) return; movendo = true;
  S.room = id; renderLado(); barraPalco();
  if (camVB[2] < 999) await camera([0, 0, 1000, 720], rapido ? 0 : 400);
  $('#plan').classList.add('dim'); $$('.room-g').forEach(g => g.classList.toggle('active', g.dataset.room === id));
  if (!rapido) await andar(caminho(id)); else { const u = DENTRO[id]; visitante.setAttribute('transform', `translate(${u.x} ${u.y})`); }
  await camera(caixaSala(id), rapido ? 350 : 650);
  movendo = false;
}
async function verSede() {
  if (movendo) return; movendo = true; S.room = null; renderLado(); barraPalco();
  await camera([0, 0, 1000, 720], 500); $('#plan').classList.remove('dim'); $$('.room-g').forEach(g => g.classList.remove('active')); movendo = false;
}
function barraPalco() { const s = S.room && SALA_POR_ID[S.room]; $('#stageTitle').textContent = s ? `${s.nome} · ${s.apelido}` : 'Planta da sede'; $('#zoomOut').hidden = !s; }
$('#zoomOut').onclick = verSede;
function passoSala(d) { const i = S.room ? SALAS.findIndex(s => s.id === S.room) : -1; movendo = false; irParaSala(SALAS[(i + d + SALAS.length) % SALAS.length].id); }
$('#prevRoom').onclick = () => passoSala(-1); $('#nextRoom').onclick = () => passoSala(1);

/* ================= painel lateral ================= */
function renderLado() {
  const lado = $('#side'), quando = `${cap(fmtDia(S.dia, true))}, às ${fmtH(S.hora)}`;
  if (!S.room) {
    lado.innerHTML = `<div class="panel"><h3>Ocupação</h3><p class="muted" style="margin:4px 0 0;font-size:14px">${esc(quando)}</p><div class="rows" id="rows"></div></div>
      <div class="panel"><h3 style="font-size:17px">Como funciona</h3><p style="margin:8px 0 0;font-size:14px">Toque numa sala para entrar e depois na cadeira que quer usar. Se ela estiver ocupada, você vê até que horas e por quem, e pode reservar o horário seguinte. No <b>Calendário</b> dá para ver o dia inteiro de cada lugar.</p></div>`;
    SALAS.forEach(s => {
      const inteira = quemOcupa(s.id, 'sala', S.hora) && reservasDoDia().find(r => r.sala === s.id && r.lugar === 'sala' && toMin(r.inicio) <= S.hora && S.hora < toMin(r.fim));
      const livres = s.lugares.filter(l => !quemOcupa(s.id, l.n, S.hora)).length;
      const b = document.createElement('button'); b.className = 'room-row';
      b.innerHTML = `<i class="sw" style="background:${s.cor}"></i><div style="flex:1;min-width:0"><b>${esc(s.nome)}</b><span>${esc(s.apelido)}</span></div><span class="cnt">${inteira ? 'Sala reservada' : `${livres} de ${s.lugares.length} livres`}</span>`;
      b.onclick = () => irParaSala(s.id); $('#rows').appendChild(b);
    });
    return;
  }
  const s = SALA_POR_ID[S.room];
  const inteira = reservasDoDia().find(r => r.sala === s.id && r.lugar === 'sala' && toMin(r.inicio) <= S.hora && S.hora < toMin(r.fim));
  const livres = s.lugares.filter(l => !quemOcupa(s.id, l.n, S.hora)).length;
  const doDia = reservasDoDia().filter(r => r.sala === s.id).sort((a, b) => toMin(a.inicio) - toMin(b.inicio));
  lado.innerHTML = `<div class="panel">
      <span class="chip"><i class="dot" style="background:${s.cor}"></i>${esc(s.apelido)}</span>
      <h3 style="margin-top:8px">${esc(s.nome)}</h3>
      <p style="margin:6px 0 0;font-weight:600">${inteira ? `Sala inteira reservada até ${fmtH(toMin(inteira.fim))} por ${esc(inteira.nome)}` : `${livres} de ${s.lugares.length} lugares livres`} <span class="muted" style="font-weight:500">${esc(quando)}</span></p>
      <div class="seats-grid" id="sgrid"></div>
      <button class="btn btn-ghost" id="bInteira" style="margin-top:14px;width:100%">Reservar a sala inteira</button>
    </div>
    <div class="panel"><h3 style="font-size:17px">Reservas do dia</h3>${doDia.length ? '<ul class="daylist" id="dl"></ul>' : '<p class="muted" style="margin:8px 0 0;font-size:14px">Nenhuma reserva nesta sala no dia.</p>'}</div>`;
  const grid = $('#sgrid');
  s.lugares.forEach(l => {
    const r = quemOcupa(s.id, l.n, S.hora), b = document.createElement('button');
    b.className = 'sg' + (r ? (ehMinha(r) ? ' mine' : ' busy') : '');
    b.innerHTML = `${l.n}<small>${r ? 'até ' + fmtH(toMin(r.fim)) : 'livre'}</small>`;
    b.setAttribute('aria-label', `${rotuloLugar(s.id, l.n)}: ${r ? 'reservada até ' + fmtH(toMin(r.fim)) + ' por ' + r.nome : 'livre'}`);
    b.onclick = () => abrirLugar(s.id, l.n); grid.appendChild(b);
  });
  $('#bInteira').onclick = () => abrirLugar(s.id, 'sala');
  const dl = $('#dl'); if (dl) doDia.forEach(r => { const li = document.createElement('li'); li.innerHTML = `<b>${r.inicio}–${r.fim}</b><span style="flex:1">${esc(rotuloLugar(r.sala, r.lugar))} · ${esc(r.nome)}</span>`; dl.appendChild(li); });
}

/* ================= calendário por lugar ================= */
function renderAgenda() {
  $('#agTitle').textContent = cap(fmtDia(S.dia, true));
  const tabs = $('#roomTabs'); tabs.innerHTML = '';
  SALAS.forEach(s => { const b = document.createElement('button'); b.className = 'rtab'; b.setAttribute('aria-pressed', S.agRoom === s.id); b.innerHTML = `<i class="dot" style="background:${s.cor}"></i>${esc(s.nome)}`; b.onclick = () => { S.agRoom = s.id; renderAgenda(); }; tabs.appendChild(b); });
  const s = SALA_POR_ID[S.agRoom], cal = $('#cal'), W = HORA_FIM - HORA_INICIO;
  const pct = m => ((m - HORA_INICIO) / W * 100) + '%';
  let h = `<div class="hd"></div><div class="hd hours">`;
  for (let m = HORA_INICIO + 60; m < HORA_FIM; m += 60) h += `<span style="left:${pct(m)}">${m / 60}h</span>`;
  h += `</div>`;
  const linhas = [{ lugar: 'sala' }, ...s.lugares.map(l => ({ lugar: l.n }))];
  const a = agora(), mostrarAgora = S.dia === a.dia && a.min > HORA_INICIO && a.min < HORA_FIM;
  linhas.forEach(({ lugar }) => {
    const all = lugar === 'sala';
    h += `<div class="rl ${all ? 'all' : ''}">${esc(rotuloLugar(s.id, lugar))}</div><div class="tr ${all ? 'all' : ''}" data-lugar="${lugar}"><div class="ghost"></div>`;
    reservasDoDia().filter(r => r.sala === s.id && (all ? r.lugar === 'sala' : (r.lugar === lugar || r.lugar === 'sala'))).forEach(r => {
      const sombra = !all && r.lugar === 'sala';
      h += `<button class="blk ${s.escura ? 'dark' : ''} ${ehMinha(r) ? 'mine' : ''} ${sombra ? 'shadow' : ''}" data-id="${r.id}" style="left:${pct(toMin(r.inicio))};width:calc(${(toMin(r.fim) - toMin(r.inicio)) / W * 100}% - 2px);background:${s.cor}" title="${esc(`${r.inicio}–${r.fim} ${r.nome}${r.motivo ? ' · ' + r.motivo : ''}`)}">${sombra ? '' : esc(`${r.inicio}–${r.fim} · ${r.nome}`)}</button>`;
    });
    if (mostrarAgora) h += `<span class="nowline" style="left:${pct(a.min)}"></span>`;
    h += `</div>`;
  });
  cal.innerHTML = h;
  $$('.tr', cal).forEach(tr => {
    const lugar = tr.dataset.lugar === 'sala' ? 'sala' : Number(tr.dataset.lugar), ghost = $('.ghost', tr);
    const slotDe = e => { const r = tr.getBoundingClientRect(); const m = HORA_INICIO + Math.floor(((e.clientX - r.left) / r.width) * W / PASSO) * PASSO; return Math.max(HORA_INICIO, Math.min(HORA_FIM - PASSO, m)); };
    tr.addEventListener('mousemove', e => { const m = slotDe(e); ghost.style.left = pct(m); ghost.style.width = `calc(${60 / W * 100}% - 2px)`; ghost.textContent = toHM(m); });
    tr.addEventListener('click', e => { const b = e.target.closest('.blk'); if (b) { const r = reservasDoDia().find(x => x.id === b.dataset.id); abrirLugar(r.sala, r.lugar === 'sala' ? 'sala' : lugar, toMin(r.fim)); return; } abrirLugar(s.id, lugar, slotDe(e)); });
  });
}

/* ================= minhas reservas ================= */
async function renderMinhas() {
  const box = $('#minhas');
  box.innerHTML = '<div class="empty"><h3>Carregando…</h3></div>';
  const a = agora(), { ok, dados } = await api('GET', { de: a.dia, dias: 31 });
  if (!ok) { box.innerHTML = `<div class="empty"><h3>Não foi possível carregar</h3><p>${esc(dados.mensagem || 'Confira sua conexão.')}</p></div>`; return; }
  const minhas = dados.reservas.filter(r => ehMinha(r) && !(r.data === a.dia && toMin(r.fim) <= a.min)).sort((x, y) => (x.data + x.inicio).localeCompare(y.data + y.inicio));
  if (!minhas.length) { box.innerHTML = `<div class="empty"><h3>Você não tem reservas nos próximos 30 dias</h3><p style="margin:0">As reservas feitas com o nome "${esc(S.nome)}" aparecem aqui.</p></div>`; return; }
  box.innerHTML = '';
  minhas.forEach(r => {
    const s = SALA_POR_ID[r.sala], c = document.createElement('div'); c.className = 'mcard';
    c.innerHTML = `<div class="band" style="background:${s.cor}"></div><div class="body"><span class="ttl">${esc(s.nome)} · ${esc(rotuloLugar(r.sala, r.lugar))}</span>
      <span class="w">${esc(cap(fmtDia(r.data, true)))}, ${r.inicio}–${r.fim}</span>${r.motivo ? `<span class="muted" style="font-size:14px">${esc(r.motivo)}</span>` : ''}
      <div>${podeCancelar(r) ? '<button class="btn btn-bad">Cancelar reserva</button>' : '<span class="muted" style="font-size:13px">Feita em outro aparelho: cancele por lá.</span>'}</div></div>`;
    const b = $('button', c); if (b) b.onclick = async () => { if (await cancelar(r)) renderMinhas(); };
    box.appendChild(c);
  });
}
async function cancelar(r) {
  if (!confirm(`Cancelar a reserva de ${rotuloLugar(r.sala, r.lugar).toLowerCase()} (${SALA_POR_ID[r.sala].nome}) em ${fmtDia(r.data)}, ${r.inicio}–${r.fim}?`)) return false;
  const { ok, dados } = await api('DELETE', { id: r.id, data: r.data });
  if (!ok) { toast(dados.mensagem || 'Não foi possível cancelar.'); return false; }
  delete S.tokens[r.id]; salvarTokens(); toast('Reserva cancelada'); carregar(r.data, true); return true;
}

/* ================= reservar um lugar ================= */
let F = null;
function abrirLugar(sala, lugar, inicioPref) {
  if (!S.nome) { pedirNome(false, () => abrirLugar(sala, lugar, inicioPref)); return; }
  const a = agora();
  let ini = inicioPref ?? S.hora;
  if (S.dia === a.dia) ini = Math.max(ini, Math.ceil(a.min / PASSO) * PASSO);
  const livre = livreAPartirDe(sala, lugar, Math.max(HORA_INICIO, ini));
  ini = livre ?? ini;
  const prox = proximaOcupacao(sala, lugar, ini);
  const fim = Math.min(HORA_FIM, ini + 60, prox ?? HORA_FIM);
  F = { sala, lugar, inicio: ini, fim: Math.max(fim, ini + PASSO), motivo: '', pick: 'start' };
  $('#drTitle').textContent = `${rotuloLugar(sala, lugar)} · ${SALA_POR_ID[sala].nome}`;
  renderForm(); abrirDrawer();
}
function estadoSlot(m) {
  const a = agora();
  if (S.dia < a.dia || (S.dia === a.dia && m + PASSO <= a.min)) return 'past';
  const r = quemOcupa(F.sala, F.lugar, m); if (!r) return 'free';
  return ehMinha(r) ? 'mine' : 'busy';
}
function selecaoLivre() { for (let m = F.inicio; m < F.fim; m += PASSO) if (estadoSlot(m) !== 'free') return false; return true; }
function renderForm(msgErro = '') {
  const s = SALA_POR_ID[F.sala], r = quemOcupa(F.sala, F.lugar, S.hora), a = agora();
  let estado;
  if (r) {
    const livre = livreAPartirDe(F.sala, F.lugar, S.hora);
    estado = `<div class="state busy"><h4>Reservada até ${fmtH(toMin(r.fim))} por ${esc(r.nome)}</h4><p>Não está disponível às ${fmtH(S.hora)}${r.lugar === 'sala' && F.lugar !== 'sala' ? ' (a sala inteira foi reservada' + (r.motivo ? ': ' + esc(r.motivo) : '') + ')' : r.motivo ? ` · ${esc(r.motivo)}` : ''}.</p>
      ${livre != null ? `<button class="btn btn-primary" id="bDepois">Reservar a partir das ${fmtH(livre)}</button>` : '<p style="margin-top:8px">Não há mais horário livre neste dia.</p>'}</div>`;
  } else {
    const prox = proximaOcupacao(F.sala, F.lugar, S.hora);
    estado = `<div class="state free"><h4>Livre às ${fmtH(S.hora)}</h4><p>${prox != null ? `Disponível até ${fmtH(prox)}.` : 'Disponível pelo resto do dia.'}</p></div>`;
  }
  let barra = '<div class="avail" role="group" aria-label="Horários do dia">';
  for (let m = HORA_INICIO; m < HORA_FIM; m += PASSO) {
    const st = estadoSlot(m), sel = m >= F.inicio && m < F.fim, oc = quemOcupa(F.sala, F.lugar, m);
    barra += `<button type="button" class="av ${st === 'free' ? '' : st} ${sel && st === 'free' ? 'sel' : ''}" data-m="${m}" data-h="${m % 60 === 0 ? m / 60 + 'h' : ''}" title="${toHM(m)} ${oc ? '· ' + esc(oc.nome) : ''}" aria-label="${toHM(m)}: ${st === 'free' ? 'livre' : st === 'past' ? 'já passou' : 'reservado por ' + esc(oc?.nome || '')}"></button>`;
  }
  barra += '</div><div class="avticks">'; for (let m = HORA_INICIO; m < HORA_FIM; m += 60) barra += `<span>${m / 60}h</span>`; barra += '</div>';
  const doLugar = reservasDoLugar(F.sala, F.lugar);
  const opts = (de, ate, v) => { let o = ''; for (let m = de; m <= ate; m += PASSO) o += `<option value="${m}" ${m === v ? 'selected' : ''}>${toHM(m)}</option>`; return o; };
  $('#drBody').innerHTML = `${estado}
    <div class="q"><span class="lbl">Horários de ${esc(fmtDia(S.dia, true))}</span><p class="help">Toque no início e depois no fim do período. Vermelho já está reservado.</p>${barra}
      <div class="times2"><div class="field"><label for="fIni">Das</label><select class="inp" id="fIni">${opts(HORA_INICIO, HORA_FIM - PASSO, F.inicio)}</select></div>
      <div class="field"><label for="fFim">Até</label><select class="inp" id="fFim">${opts(HORA_INICIO + PASSO, HORA_FIM, F.fim)}</select></div></div>
      ${doLugar.length ? `<ul class="daylist">${doLugar.map(x => `<li><b>${x.inicio}–${x.fim}</b><span style="flex:1">${esc(x.nome)}${x.lugar === 'sala' && F.lugar !== 'sala' ? ' (sala inteira)' : x.lugar !== 'sala' && F.lugar === 'sala' ? ' (' + esc(rotuloLugar(x.sala, x.lugar).toLowerCase()) + ')' : ''}</span>${podeCancelar(x) ? `<button class="btn btn-bad" style="padding:5px 12px;font-size:13px" data-cancel="${x.id}">Cancelar</button>` : ''}</li>`).join('')}</ul>` : ''}</div>
    <div class="q field"><label for="fNome" class="lbl" style="color:var(--ink);font-size:15.5px">Seu nome</label><input class="inp" id="fNome" maxlength="60" value="${esc(S.nome)}"></div>
    <div class="q field"><label for="fMot" class="lbl" style="color:var(--ink);font-size:15.5px">Motivo ${F.lugar === 'sala' ? '' : '<span class="muted" style="font-weight:500">(opcional)</span>'}</label><input class="inp" id="fMot" maxlength="200" placeholder="${F.lugar === 'sala' ? 'Ex.: reunião da área comercial' : 'Ex.: projeto X'}" value="${esc(F.motivo)}"></div>
    <p class="err" id="fErr">${esc(msgErro)}</p>`;
  const livreSel = selecaoLivre();
  $('#drFoot').innerHTML = `<button class="btn btn-ghost" id="fCancel">Fechar</button><button class="btn btn-primary" id="fOk" ${livreSel && S.dia >= a.dia ? '' : 'disabled'}>Reservar ${toHM(F.inicio)}–${toHM(F.fim)}</button>`;
  if (!livreSel && !msgErro) $('#fErr').textContent = 'O período escolhido cruza com uma reserva. Escolha só horários verdes.';
  $('#fCancel').onclick = fecharDrawer; $('#fOk').onclick = enviar;
  $('#fMot').oninput = e => F.motivo = e.target.value;
  const bd = $('#bDepois'); if (bd) bd.onclick = () => { const l = livreAPartirDe(F.sala, F.lugar, S.hora); const p = proximaOcupacao(F.sala, F.lugar, l); F.inicio = l; F.fim = Math.min(HORA_FIM, l + 60, p ?? HORA_FIM); renderForm(); $('#fOk').focus(); };
  $('#fIni').onchange = e => { F.inicio = Number(e.target.value); if (F.fim <= F.inicio) F.fim = Math.min(HORA_FIM, F.inicio + 60); renderForm(); };
  $('#fFim').onchange = e => { F.fim = Number(e.target.value); if (F.fim <= F.inicio) F.inicio = F.fim - PASSO; renderForm(); };
  $$('.av').forEach(b => b.onclick = () => {
    const m = Number(b.dataset.m); if (estadoSlot(m) !== 'free') return;
    if (F.pick === 'end' && m >= F.inicio) { F.fim = m + PASSO; F.pick = 'start'; }
    else { F.inicio = m; const p = proximaOcupacao(F.sala, F.lugar, m); F.fim = Math.min(HORA_FIM, m + 60, p ?? HORA_FIM); F.pick = 'end'; }
    renderForm();
  });
  $$('[data-cancel]').forEach(b => b.onclick = async () => { const r = reservasDoDia().find(x => x.id === b.dataset.cancel); if (r && await cancelar(r)) setTimeout(() => F && renderForm(), 400); });
}
async function enviar() {
  const nome = $('#fNome').value.trim().replace(/\s+/g, ' ');
  if (nome.length < 2) { $('#fErr').textContent = 'Informe seu nome.'; return; }
  if (F.lugar === 'sala' && !F.motivo.trim()) { $('#fErr').textContent = 'Para reservar a sala inteira, informe o motivo.'; return; }
  S.nome = nome; ls('fj-nome', nome); renderMe();
  const b = $('#fOk'); b.disabled = true; b.textContent = 'Reservando…';
  const corpo = { nome, sala: F.sala, lugar: F.lugar, data: S.dia, inicio: toHM(F.inicio), fim: toHM(F.fim), motivo: F.motivo.trim() };
  const { ok, status, dados } = await api('POST', {}, corpo).catch(() => ({ ok: false, status: 0, dados: {} }));
  if (ok) {
    S.tokens[dados.reserva.id] = dados.token; salvarTokens();
    (S.porDia[S.dia] ||= { reservas: [] }).reservas.push(dados.reserva);
    fecharDrawer(); renderTudo();
    toast(`Reservado: ${rotuloLugar(F?.sala ?? corpo.sala, corpo.lugar)} da ${SALA_POR_ID[corpo.sala].nome}, ${corpo.inicio}–${corpo.fim}`);
    carregar(S.dia, true); return;
  }
  if (status === 409) {
    await carregar(S.dia, true);
    const c = dados.conflitos?.[0];
    renderForm(c ? `Alguém reservou antes de você: ${c.nome}, das ${c.inicio} às ${c.fim}. Escolha outro horário.` : dados.mensagem);
    return;
  }
  renderForm(dados.mensagem || 'Não foi possível reservar. Confira sua conexão e tente de novo.');
}

/* ================= drawer, nome, abas ================= */
let focoAnterior = null;
function abrirDrawer() { focoAnterior = document.activeElement; $('#scrim').classList.add('on'); $('#drawer').classList.add('on'); setTimeout(() => $('#drClose').focus(), 60); }
function fecharDrawer() { $('#scrim').classList.remove('on'); $('#drawer').classList.remove('on'); F = null; focoAnterior?.focus?.(); }
$('#scrim').onclick = fecharDrawer; $('#drClose').onclick = fecharDrawer;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#drawer').classList.contains('on')) fecharDrawer(); });

let depoisDoNome = null;
function pedirNome(precisaCodigo, depois) {
  depoisDoNome = depois || null;
  $('#mNome').value = S.nome; $('#mCod').value = S.codigo;
  $('#mCodWrap').hidden = !precisaCodigo && !S.codigo;
  $('#mDirWrap').hidden = !MODO_DIRETORIA; $('#mDir').value = S.dir;
  $('#mErr').textContent = precisaCodigo && S.codigo ? 'Código de acesso inválido.' : '';
  $('#modal').hidden = false; setTimeout(() => (precisaCodigo ? $('#mCod') : $('#mNome')).focus(), 50);
}
$('#mForm').onsubmit = e => {
  e.preventDefault();
  const nome = $('#mNome').value.trim().replace(/\s+/g, ' ');
  if (nome.length < 2) { $('#mErr').textContent = 'Digite seu nome para continuar.'; return; }
  S.nome = nome; ls('fj-nome', nome);
  if (!$('#mCodWrap').hidden) { S.codigo = $('#mCod').value.trim(); ls('fj-codigo', S.codigo); }
  if (MODO_DIRETORIA) { S.dir = $('#mDir').value.trim(); ls('fj-diretoria', S.dir || null); }
  $('#modal').hidden = true; renderMe(); renderTudo();
  if (!$('#mCodWrap').hidden) carregar(S.dia);
  const d = depoisDoNome; depoisDoNome = null; d?.();
};
function renderMe() {
  $('#meNome').textContent = S.nome ? S.nome.split(' ')[0] : 'Entrar';
  $('#meAv').textContent = S.nome ? S.nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : '?';
}
$('#meBtn').onclick = () => pedirNome(false);

function trocarAba(v) {
  S.view = v;
  $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  $('#whenBar').hidden = v === 'minhas';
  renderTudo(); if (v === 'minhas') renderMinhas();
}
$$('.tab').forEach(t => t.onclick = () => trocarAba(t.dataset.view));

function renderTudo() {
  pintarCadeiras();
  if (!movendo) renderLado();
  if (S.view === 'agenda') renderAgenda();
  if (F && $('#drawer').classList.contains('on') && !document.activeElement?.matches?.('#fNome,#fMot')) renderForm();
}

/* ================= início ================= */
const MODO_DIRETORIA = new URLSearchParams(location.search).has('diretoria');
$('#logoTop').innerHTML = logoSVG(); $('#logoModal').innerHTML = logoSVG();
montarPlanta(); renderWhen(); renderMe(); barraPalco(); renderTudo();
if (!S.nome || MODO_DIRETORIA) pedirNome(false);
carregar(S.dia, true);
setInterval(() => { if (document.visibilityState === 'visible') { const a = agora(); if (S.dia < a.dia) mudarDia(a.dia); else carregar(S.dia, true); } }, 45000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') carregar(S.dia, true); });
