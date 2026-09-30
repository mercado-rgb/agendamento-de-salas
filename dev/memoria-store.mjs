// Imitação local do Netlify Blobs (só para testar no computador, sem conta no Netlify).
export function criarStoreMemoria() {
  const dados = new Map(); let versao = 0;
  const clone = v => JSON.parse(JSON.stringify(v));
  return {
    async get(chave) { const d = dados.get(chave); return d ? clone(d.valor) : null; },
    async getWithMetadata(chave) { const d = dados.get(chave); return d ? { data: clone(d.valor), etag: d.etag, metadata: {} } : null; },
    async setJSON(chave, valor, opc = {}) {
      await new Promise(r => setTimeout(r, Math.random() * 15));
      const d = dados.get(chave);
      if (opc.onlyIfNew && d) return { modified: false };
      if (opc.onlyIfMatch && (!d || d.etag !== opc.onlyIfMatch)) return { modified: false };
      const etag = 'v' + (++versao); dados.set(chave, { valor: clone(valor), etag }); return { modified: true, etag };
    },
  };
}
