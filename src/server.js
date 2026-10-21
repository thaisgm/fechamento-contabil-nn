/**
 * Servidor do Fechamento Contábil (Node.js, sem dependências externas).
 *   npm start   -> http://localhost:3000
 *
 * Usa o módulo http do Node para ficar fácil de ler. No NN HUB, cada rota abaixo
 * vira uma rota do framework que vocês já usam (ex.: Express) chamando as
 * mesmas funções do serviço.
 *
 * IDENTIFICAÇÃO: neste protótipo o usuário vem do cabeçalho "X-Usuario" (o nome
 * escolhido na tela). No NN HUB, troque por quem está logado.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { abrirBanco, cargaInicial, criarRepositorio } = require("./repositorio-sql.js");
const { criarServico, ErroNegocio } = require("../shared/servico-fechamento.js");

const RAIZ = path.join(__dirname, "..");
const EXEMPLOS_REGIME = require("../data/exemplos-regime.json");

function criarApp({ arquivoBanco, agora } = {}) {
  const db = abrirBanco(arquivoBanco || path.join(RAIZ, "dados-locais", "fechamento.db"));
  cargaInicial(db, require("../data/empresas-carga-inicial.json"), EXEMPLOS_REGIME);
  const servico = criarServico(criarRepositorio(db), { agora });

  // Rotas da API: [método, padrão, função(usuario, params, corpo, query)]
  const rotas = [
    ["GET", "/api/empresas", () => servico.listarEmpresas()],
    ["GET", "/api/empresas/:codigo", (u, p) => servico.obterEmpresa(p.codigo)],
    ["PUT", "/api/empresas/:codigo/competencia", (u, p, b) => servico.atualizarCompetencia(u, p.codigo, b.competencia)],
    ["POST", "/api/empresas/:codigo/ok", (u, p) => servico.darOk(u, p.codigo)],
    ["PUT", "/api/empresas/:codigo/periodicidade", (u, p, b) => servico.alterarPeriodicidade(u, p.codigo, b.periodicidade)],
    ["POST", "/api/empresas/:codigo/regime", (u, p, b) => servico.registrarMudancaRegime(u, p.codigo, b.novo, b.desde)],
    ["POST", "/api/empresas/:codigo/regime/ciencia", (u, p) => servico.darCiencia(u, p.codigo)],
    ["POST", "/api/empresas/:codigo/situacao", (u, p, b) => servico.marcarSituacao(u, p.codigo, b.tipo, b.data)],
    ["POST", "/api/empresas/:codigo/situacao/concluir", (u, p) => servico.concluirSituacao(u, p.codigo)],
    ["GET", "/api/historico", (u, p, b, q) => servico.historico({ empresa: q.get("empresa"), limite: q.get("limite") })],
    ["GET", "/api/painel", (u) => servico.painel(u)],
    ["GET", "/api/avisos", (u) => servico.avisos(u)],
  ].map(([metodo, padrao, fn]) => ({ metodo, re: new RegExp("^" + padrao.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), fn }));

  const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

  function enviarJson(res, status, dados) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(dados));
  }

  function arquivoEstatico(req, res, url) {
    // /shared/* e /data/* também são servidos para o navegador usar as mesmas regras e o modo demonstração
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const base = rel.startsWith("/shared/") || rel.startsWith("/data/") ? RAIZ : path.join(RAIZ, "public");
    const alvo = path.normalize(path.join(base, rel));
    if (!alvo.startsWith(base) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Não encontrado");
    }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(alvo)] || "application/octet-stream" });
    fs.createReadStream(alvo).pipe(res);
  }

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return arquivoEstatico(req, res, url);

    const rota = rotas.find((r) => r.metodo === req.method && r.re.test(url.pathname));
    if (!rota) return enviarJson(res, 404, { erro: "Rota não encontrada." });
    const params = url.pathname.match(rota.re).groups || {};
    const usuario = decodeURIComponent(req.headers["x-usuario"] || "");

    let corpo = "";
    req.on("data", (c) => { corpo += c; if (corpo.length > 1e5) req.destroy(); });
    req.on("end", () => {
      try {
        const dados = corpo ? JSON.parse(corpo) : {};
        enviarJson(res, 200, rota.fn(usuario, params, dados, url.searchParams));
      } catch (err) {
        if (err instanceof ErroNegocio) return enviarJson(res, err.status, { erro: err.message });
        if (err instanceof SyntaxError) return enviarJson(res, 400, { erro: "Dados enviados em formato inválido." });
        console.error(err);
        enviarJson(res, 500, { erro: "Erro inesperado no servidor." });
      }
    });
  });

  return { servidor, db, servico };
}

if (require.main === module) {
  const porta = Number(process.env.PORT || 3000);
  criarApp().servidor.listen(porta, () => console.log("Fechamento Contábil rodando em http://localhost:" + porta));
}

module.exports = { criarApp };
