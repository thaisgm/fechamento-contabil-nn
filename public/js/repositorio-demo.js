/**
 * Repositório do MODO DEMONSTRAÇÃO: guarda empresas e histórico no navegador
 * (localStorage), para o protótipo funcionar publicado no GitHub Pages, sem servidor.
 * Tem as mesmas funções do repositório SQL (src/repositorio-sql.js).
 * Não vai para o NN HUB: lá os dados ficam no banco oficial.
 */
(function () {
  "use strict";
  const CHAVE = "fechamento-contabil-demo-v1";

  function ler() {
    try { const t = localStorage.getItem(CHAVE); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }

  async function criarRepositorioDemo() {
    let estado = ler();
    if (!estado) estado = await dadosIniciais();
    const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { /* navegador sem armazenamento: segue em memória */ } };
    gravar();
    const porCodigo = (c) => estado.empresas.find((e) => e.codigo === c) || null;
    const copia = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);

    return {
      listar: () => copia(estado.empresas),
      obter: (c) => copia(porCodigo(c)),
      salvar: (c, campos) => { const e = porCodigo(c); if (e) Object.assign(e, copia(campos)); },
      registrarHistorico: (h) => {
        const e = porCodigo(h.empresa_codigo);
        estado.historico.unshift(Object.assign({ id: ++estado.ultimoId, empresa_nome: e ? e.nome : "" }, h));
        if (estado.historico.length > 1000) estado.historico.length = 1000;
      },
      listarHistorico: ({ empresa, limite }) => copia(estado.historico.filter((h) => !empresa || h.empresa_codigo === empresa).slice(0, limite)),
      transacao: (fn) => {
        const antes = JSON.stringify(estado);
        try { const r = fn(); gravar(); return r; } catch (err) { estado = JSON.parse(antes); throw err; }
      },
    };
  }

  async function dadosIniciais() {
    const [empresas, exemplos] = await Promise.all([
      fetch("data/empresas-carga-inicial.json").then((r) => r.json()),
      fetch("data/exemplos-regime.json").then((r) => r.json()),
    ]);
    for (const x of exemplos) {
      const e = empresas.find((y) => y.codigo === x.codigo);
      if (e) e.regime_alerta = { anterior: x.anterior, novo: x.novo, desde: x.desde, ciencia_por: null, ciencia_em: null, exemplo: true };
    }
    empresas.forEach((e) => { if (!("regime_alerta" in e)) e.regime_alerta = null; });
    return { empresas, historico: [], ultimoId: 0 };
  }

  function restaurar() { try { localStorage.removeItem(CHAVE); } catch (e) {} }

  window.RepositorioDemo = { criarRepositorioDemo, restaurar };
})();
