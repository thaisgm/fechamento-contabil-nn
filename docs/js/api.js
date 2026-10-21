/**
 * Cliente da API usado pelas telas.
 * - Com o servidor rodando (npm start): conversa com /api/...
 * - Sem servidor (GitHub Pages): entra no modo demonstração, que roda as mesmas
 *   regras (shared/) no próprio navegador.
 * As telas (app.js) só chamam as funções abaixo e não sabem qual modo está ativo.
 */
(function () {
  "use strict";

  function clienteServidor(obterUsuario) {
    async function chamar(metodo, caminho, corpo) {
      const r = await fetch("api" + caminho, {
        method: metodo,
        headers: Object.assign({ "Content-Type": "application/json" }, obterUsuario() ? { "X-Usuario": encodeURIComponent(obterUsuario()) } : {}),
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados.erro || "Não foi possível concluir. Tente de novo.");
      return dados;
    }
    return {
      modo: "servidor",
      listarEmpresas: () => chamar("GET", "/empresas"),
      atualizarCompetencia: (c, competencia) => chamar("PUT", `/empresas/${c}/competencia`, { competencia }),
      darOk: (c) => chamar("POST", `/empresas/${c}/ok`),
      alterarPeriodicidade: (c, periodicidade) => chamar("PUT", `/empresas/${c}/periodicidade`, { periodicidade }),
      registrarMudancaRegime: (c, novo, desde) => chamar("POST", `/empresas/${c}/regime`, { novo, desde }),
      darCiencia: (c) => chamar("POST", `/empresas/${c}/regime/ciencia`),
      marcarSituacao: (c, tipo, data) => chamar("POST", `/empresas/${c}/situacao`, { tipo, data }),
      concluirSituacao: (c) => chamar("POST", `/empresas/${c}/situacao/concluir`),
      historico: (f) => chamar("GET", "/historico?" + new URLSearchParams(Object.entries(f || {}).filter(([, v]) => v != null))),
      painel: () => chamar("GET", "/painel"),
      avisos: () => chamar("GET", "/avisos"),
    };
  }

  async function clienteDemo(obterUsuario) {
    const repo = await window.RepositorioDemo.criarRepositorioDemo();
    const s = window.ServicoFechamento.criarServico(repo);
    const u = obterUsuario;
    const rodar = (fn) => new Promise((ok, erro) => { try { ok(fn()); } catch (e) { erro(new Error(e.message)); } });
    return {
      modo: "demo",
      listarEmpresas: () => rodar(() => s.listarEmpresas()),
      atualizarCompetencia: (c, comp) => rodar(() => s.atualizarCompetencia(u(), c, comp)),
      darOk: (c) => rodar(() => s.darOk(u(), c)),
      alterarPeriodicidade: (c, p) => rodar(() => s.alterarPeriodicidade(u(), c, p)),
      registrarMudancaRegime: (c, n, d) => rodar(() => s.registrarMudancaRegime(u(), c, n, d)),
      darCiencia: (c) => rodar(() => s.darCiencia(u(), c)),
      marcarSituacao: (c, t, d) => rodar(() => s.marcarSituacao(u(), c, t, d)),
      concluirSituacao: (c) => rodar(() => s.concluirSituacao(u(), c)),
      historico: (f) => rodar(() => s.historico(f)),
      painel: () => rodar(() => s.painel(u())),
      avisos: () => rodar(() => s.avisos(u())),
    };
  }

  /** Descobre se há servidor; se não houver, usa o modo demonstração. */
  async function conectar(obterUsuario) {
    try {
      const r = await fetch("api/empresas", { method: "GET" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) return clienteServidor(obterUsuario);
    } catch (e) { /* sem servidor */ }
    return clienteDemo(obterUsuario);
  }

  window.Api = { conectar };
})();
