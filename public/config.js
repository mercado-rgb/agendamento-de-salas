// =====================================================================
// CONFIGURAÇÃO DAS SALAS — arquivo único usado pelo site E pelo servidor.
// Para mudar horários ou a quantidade/posição de cadeiras, edite só aqui.
// As posições (x, y) estão nas coordenadas da planta (0–1000 x 0–720).
// =====================================================================

export const HORA_INICIO = 7 * 60;   // 07:00
export const HORA_FIM = 22 * 60;     // 22:00
export const PASSO = 30;             // blocos de 30 minutos
export const DIAS_ANTECEDENCIA = 60; // até quantos dias à frente dá para reservar
export const FUSO = 'America/Sao_Paulo';

// Retângulo de cada sala na planta (mesma geometria desenhada no site)
export const GEO = {
  cow:  { x: 20,  y: 20,  w: 360, h: 600 },
  est:  { x: 380, y: 20,  w: 200, h: 290 },
  copa: { x: 580, y: 20,  w: 200, h: 290 },
  aper: { x: 780, y: 20,  w: 200, h: 290 },
  rep:  { x: 380, y: 400, w: 230, h: 220 },
};

function lugaresCoworking() {
  const { x: X, y: Y, w: W } = GEO.cow, out = [];
  for (let i = 0; i < 4; i++) {
    const ty = Y + 70 + i * 120, tx = X + 48, tw = W - 110;
    for (let k = 0; k < 5; k++) out.push({ x: tx + 26 + k * ((tw - 52) / 4), y: ty - 13, r: 0 });
    for (let k = 0; k < 5; k++) out.push({ x: tx + 26 + k * ((tw - 52) / 4), y: ty + 49, r: 180 });
  }
  return out;
}
function lugaresRep() {
  const { x: X, y: Y } = GEO.rep, out = [];
  for (let k = 0; k < 3; k++) out.push({ x: X + 86 + k * 36, y: Y + 66, r: 0 });
  out.push({ x: X + 196, y: Y + 111, r: 90 });
  for (let k = 2; k >= 0; k--) out.push({ x: X + 86 + k * 36, y: Y + 156, r: 180 });
  out.push({ x: X + 48, y: Y + 111, r: -90 });
  return out;
}
function lugaresEstudos() {
  const { x: X, y: Y, w: W } = GEO.est, out = [];
  for (let k = 0; k < 4; k++) out.push({ x: X + 38 + k * 42, y: Y + 70, r: 180 });
  for (let k = 0; k < 3; k++) out.push({ x: X + W - 54, y: Y + 100 + k * 40, r: -90 });
  for (let k = 0; k < 3; k++) out.push({ x: X + 54, y: Y + 100 + k * 40, r: 90 });
  return out;
}
function lugaresCopa() {
  const { x: X, y: Y } = GEO.copa;
  return [[0, -44], [42, 14], [0, 44], [-42, 14]].map(([dx, dy]) => ({ x: X + 82 + dx, y: Y + 150 + dy, r: 0, banco: true }));
}
function lugaresAper() {
  const { x: X, y: Y } = GEO.aper, out = [];
  for (let k = 0; k < 4; k++) out.push({ x: X + 48, y: Y + 80 + k * 40, r: -90 });
  out.push({ x: X + 97, y: Y + 242, r: 180 });
  for (let k = 3; k >= 0; k--) out.push({ x: X + 146, y: Y + 80 + k * 40, r: 90 });
  return out;
}

// ATENÇÃO: a quantidade de cadeiras abaixo vem da planta desenhada a partir
// do vídeo e precisa ser conferida com a sede real.
export const SALAS = [
  { id: 'rep',  nome: 'Representatividade', apelido: 'Sala Azul',       cor: '#1F4FD1', escura: false, lugares: lugaresRep() },
  { id: 'copa', nome: 'Profissionalismo',   apelido: 'Copa',            cor: '#B06A2E', escura: false, lugares: lugaresCopa() },
  { id: 'aper', nome: 'Aperfeiçoamento',    apelido: 'Sala Amarela',    cor: '#F2B705', escura: true,  lugares: lugaresAper() },
  { id: 'est',  nome: 'Estudos',            apelido: 'Sala de Estudos', cor: '#2E9C5A', escura: false, lugares: lugaresEstudos() },
  { id: 'cow',  nome: 'Coworking',          apelido: 'Salão aberto',    cor: '#EE6A2C', escura: false, lugares: lugaresCoworking() },
].map(s => ({ ...s, lugares: s.lugares.map((l, i) => ({ ...l, n: i + 1 })) }));

export const SALA_POR_ID = Object.fromEntries(SALAS.map(s => [s.id, s]));
