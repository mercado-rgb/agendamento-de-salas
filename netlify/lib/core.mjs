// Lógica do servidor de reservas.
// Guarda um documento por dia ("dias/AAAA-MM-DD") com todas as reservas daquele dia.
// Toda gravação é condicional (ETag): se duas pessoas tentarem reservar o mesmo
// lugar ao mesmo tempo, só a primeira grava; a segunda relê, vê o conflito e recebe 409.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SALA_POR_ID, HORA_INICIO, HORA_FIM, PASSO, DIAS_ANTECEDENCIA, FUSO } from '../../public/config.js';

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function agoraNoFuso(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
export function somarDias(dia, n) {
  const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const paraMin = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
const hash = t => createHash('sha256').update(t).digest('hex');
const chave = dia => `dias/${dia}`;
const esperar = ms => new Promise(r => setTimeout(r, ms));
function json(status, corpo) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
const publico = r => { const { tokenHash, ...resto } = r; return resto; };

// Mesma sala, mesmo dia, horários que se cruzam, e mesmo lugar (ou uma das reservas é a sala inteira)
export function cruza(a, b) {
  return a.sala === b.sala && a.data === b.data &&
    paraMin(a.inicio) < paraMin(b.fim) && paraMin(b.inicio) < paraMin(a.fim) &&
    (a.lugar === b.lugar || a.lugar === 'sala' || b.lugar === 'sala');
}

function validar(c, agora) {
  const erros = [];
  const nome = typeof c.nome === 'string' ? c.nome.trim().replace(/\s+/g, ' ') : '';
  if (nome.length < 2 || nome.length > 60) erros.push('Informe seu nome (2 a 60 caracteres).');
  const sala = SALA_POR_ID[c.sala];
  if (!sala) erros.push('Sala inválida.');
  let lugar = c.lugar;
  if (lugar !== 'sala') {
    lugar = Number(lugar);
    if (!sala || !Number.isInteger(lugar) || lugar < 1 || lugar > sala.lugares.length) erros.push('Lugar inválido para essa sala.');
  }
  if (!RE_DIA.test(c.data || '')) erros.push('Data inválida.');
  if (!RE_HORA.test(c.inicio || '') || !RE_HORA.test(c.fim || '')) erros.push('Horário inválido.');
  if (!erros.length) {
    const i = paraMin(c.inicio), f = paraMin(c.fim);
    if (i < HORA_INICIO || f > HORA_FIM || i % PASSO || f % PASSO) erros.push(`Use horários entre ${HORA_INICIO / 60}h e ${HORA_FIM / 60}h, de ${PASSO} em ${PASSO} minutos.`);
    if (f <= i) erros.push('O término precisa ser depois do início.');
    if (c.data < agora.dia) erros.push('Essa data já passou.');
    if (c.data === agora.dia && f <= agora.min) erros.push('Esse horário já passou.');
    if (c.data > somarDias(agora.dia, DIAS_ANTECEDENCIA)) erros.push(`Só dá para reservar até ${DIAS_ANTECEDENCIA} dias à frente.`);
  }
  const motivo = typeof c.motivo === 'string' ? c.motivo.trim().slice(0, 200) : '';
  if (lugar === 'sala' && !motivo) erros.push('Para reservar a sala inteira, informe o motivo.');
  return { erros, dados: { nome, sala: c.sala, lugar, data: c.data, inicio: c.inicio, fim: c.fim, motivo } };
}

export function criarHandler(obterStore) {
  return async function handler(req) {
    const url = new URL(req.url);
    try {
      const codigo = process.env.CODIGO_ACESSO;
      if (codigo && req.headers.get('x-codigo') !== codigo) return json(401, { erro: 'codigo', mensagem: 'Código de acesso da empresa inválido.' });
      const store = obterStore();
      const agora = agoraNoFuso();

      if (req.method === 'GET') {
        const de = url.searchParams.get('de') || agora.dia;
        const dias = Math.min(31, Math.max(1, Number(url.searchParams.get('dias')) || 1));
        if (!RE_DIA.test(de)) return json(400, { erro: 'data', mensagem: 'Data inválida.' });
        const lista = await Promise.all(Array.from({ length: dias }, (_, i) =>
          store.get(chave(somarDias(de, i)), { type: 'json' }).then(d => d?.reservas || [])));
        return json(200, { agora, reservas: lista.flat().map(publico) });
      }

      if (req.method === 'POST') {
        let corpo; try { corpo = await req.json(); } catch { return json(400, { erro: 'corpo', mensagem: 'Pedido inválido.' }); }
        const { erros, dados } = validar(corpo || {}, agora);
        if (erros.length) return json(400, { erro: 'validacao', mensagem: erros.join(' ') });
        const token = randomBytes(24).toString('base64url');
        const nova = { id: randomUUID(), ...dados, criadoEm: new Date().toISOString(), tokenHash: hash(token) };
        for (let tentativa = 0; tentativa < 8; tentativa++) {
          const atual = await store.getWithMetadata(chave(dados.data), { type: 'json' });
          const reservas = atual?.data?.reservas || [];
          const choque = reservas.filter(r => cruza(r, nova));
          if (choque.length) return json(409, { erro: 'conflito', mensagem: 'Esse lugar já está reservado nesse horário.', conflitos: choque.map(publico) });
          const proximo = { reservas: [...reservas, nova] };
          const res = atual
            ? await store.setJSON(chave(dados.data), proximo, { onlyIfMatch: atual.etag })
            : await store.setJSON(chave(dados.data), proximo, { onlyIfNew: true });
          if (res.modified) return json(201, { reserva: publico(nova), token });
          await esperar(40 + Math.random() * 120); // outra pessoa gravou no mesmo instante: relê e tenta de novo
        }
        return json(503, { erro: 'ocupado', mensagem: 'Muita gente reservando ao mesmo tempo. Tente de novo em alguns segundos.' });
      }

      if (req.method === 'DELETE') {
        const id = url.searchParams.get('id'), data = url.searchParams.get('data');
        if (!id || !RE_DIA.test(data || '')) return json(400, { erro: 'parametros', mensagem: 'Reserva não informada.' });
        const token = req.headers.get('x-token') || '';
        const diretoria = process.env.CODIGO_DIRETORIA && req.headers.get('x-diretoria') === process.env.CODIGO_DIRETORIA;
        for (let tentativa = 0; tentativa < 8; tentativa++) {
          const atual = await store.getWithMetadata(chave(data), { type: 'json' });
          const reservas = atual?.data?.reservas || [];
          const alvo = reservas.find(r => r.id === id);
          if (!alvo) return json(404, { erro: 'nao_encontrada', mensagem: 'Essa reserva não existe mais.' });
          if (!diretoria && hash(token) !== alvo.tokenHash) return json(403, { erro: 'sem_permissao', mensagem: 'Só dá para cancelar no aparelho em que a reserva foi feita.' });
          const res = await store.setJSON(chave(data), { reservas: reservas.filter(r => r.id !== id) }, { onlyIfMatch: atual.etag });
          if (res.modified) return json(200, { ok: true });
          await esperar(40 + Math.random() * 120);
        }
        return json(503, { erro: 'ocupado', mensagem: 'Tente de novo em alguns segundos.' });
      }

      return json(405, { erro: 'metodo', mensagem: 'Método não suportado.' });
    } catch (e) {
      console.error(e);
      return json(500, { erro: 'interno', mensagem: 'Erro no servidor. Tente de novo.' });
    }
  };
}
