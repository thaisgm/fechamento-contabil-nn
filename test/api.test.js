// Testes da API com banco em memória. Rodar com: npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { criarApp } = require("../src/server.js");

let base, app;
const HOJE = () => new Date(2026, 9, 21, 10, 0, 0);

before(async () => {
  app = criarApp({ arquivoBanco: ":memory:", agora: HOJE });
  await new Promise((ok) => app.servidor.listen(0, ok));
  base = "http://localhost:" + app.servidor.address().port;
});
after(() => app.servidor.close());

async function api(metodo, caminho, usuario, corpo) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: Object.assign({ "Content-Type": "application/json" }, usuario ? { "X-Usuario": encodeURIComponent(usuario) } : {}),
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, dados: await r.json() };
}

test("lista as 304 empresas da planilha em ordem de código", async () => {
  const { status, dados } = await api("GET", "/api/empresas");
  assert.equal(status, 200);
  assert.equal(dados.length, 304);
  assert.ok(dados.every((e, i) => i === 0 || dados[i - 1].codigo < e.codigo));
});

test("Empresa 664 está vencendo; Natália concilia 09/2026 e vira em dia", async () => {
  let r = await api("GET", "/api/empresas/664");
  assert.equal(r.dados.situacao.status, "vencendo");
  r = await api("PUT", "/api/empresas/664/competencia", "Natália", { competencia: "2026-09" });
  assert.equal(r.status, 200);
  assert.equal(r.dados.conciliado_ate, "2026-09");
  assert.equal(r.dados.situacao.status, "em_dia_conciliada");
});

test("sem nome escolhido não salva", async () => {
  const r = await api("PUT", "/api/empresas/664/competencia", "", { competencia: "2026-08" });
  assert.equal(r.status, 403);
});

test("competência futura é recusada", async () => {
  const r = await api("PUT", "/api/empresas/664/competencia", "Natália", { competencia: "2026-12" });
  assert.equal(r.status, 400);
});

test("OK: colaborador que não é analista é recusado; analista da carteira consegue", async () => {
  let r = await api("POST", "/api/empresas/664/ok", "Natália");
  assert.equal(r.status, 403);
  r = await api("POST", "/api/empresas/664/ok", "Edmara");
  assert.equal(r.status, 200);
  assert.equal(r.dados.conferido_ate, "2026-09");
  assert.equal(r.dados.situacao.status, "em_dia_conferida");
});

test("retificação: voltar a competência puxa o OK junto", async () => {
  const r = await api("PUT", "/api/empresas/664/competencia", "Natália", { competencia: "2026-07" });
  assert.equal(r.dados.conciliado_ate, "2026-07");
  assert.equal(r.dados.conferido_ate, "2026-07");
});

test("periodicidade: só a coordenação altera", async () => {
  let r = await api("PUT", "/api/empresas/804/periodicidade", "João", { periodicidade: { tipo: "M", dia: 20, lag: 1 } });
  assert.equal(r.status, 403);
  r = await api("PUT", "/api/empresas/804/periodicidade", "Edmara", { periodicidade: { tipo: "M", dia: 20, lag: 1 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.dados.periodicidade, { tipo: "M", dia: 20, lag: 1 });
  assert.notEqual(r.dados.situacao.status, "sem_regra");
});

test("ciência de regime (exemplo 675): só colaborador da carteira; depois o regime muda", async () => {
  let r = await api("GET", "/api/empresas/675");
  assert.equal(r.dados.regime_alerta.novo, "Presumido");
  r = await api("POST", "/api/empresas/675/regime/ciencia", "João");
  assert.equal(r.status, 403);
  r = await api("POST", "/api/empresas/675/regime/ciencia", "Natália");
  assert.equal(r.status, 200);
  assert.equal(r.dados.regime_alerta.ciencia_por, "Natália");
  r = await api("POST", "/api/empresas/675/regime/ciencia", "Natália");
  assert.equal(r.status, 400);
});

test("transferência: marcar, prazo de 60 dias e concluir", async () => {
  let r = await api("POST", "/api/empresas/21/situacao", "Edmara", { tipo: "Transferência", data: "2026-10-01" });
  assert.equal(r.dados.situacao.status, "especial");
  assert.equal(r.dados.situacao.limite_especial, "2026-11-30");
  r = await api("POST", "/api/empresas/21/situacao/concluir", "Edmara");
  assert.equal(r.dados.situacao_concluida, true);
  assert.notEqual(r.dados.situacao.status, "especial");
});

test("histórico registra quem, o quê e de -> para", async () => {
  const r = await api("GET", "/api/historico?empresa=664");
  assert.equal(r.dados.length, 3);
  assert.equal(r.dados[0].tipo, "Competência conciliada");
  assert.equal(r.dados[0].usuario, "Natália");
  assert.equal(r.dados[0].valor_de, "09/2026");
  assert.equal(r.dados[0].valor_para, "07/2026");
});

test("painel: só coordenação; totais por regime", async () => {
  let r = await api("GET", "/api/painel", "Guilherme");
  assert.equal(r.status, 403);
  r = await api("GET", "/api/painel", "Edmara");
  assert.equal(r.status, 200);
  assert.equal(r.dados.porRegime.Simples.total + r.dados.porRegime.Presumido.total + r.dados.porRegime.Real.total, r.dados.total.total);
});

test("avisos da coordenação incluem as atrasadas", async () => {
  const r = await api("GET", "/api/avisos", "Edmara");
  assert.ok(r.dados.some((a) => a.tipo === "atrasadas"));
});

test("empresa inexistente devolve 404", async () => {
  const r = await api("GET", "/api/empresas/999999");
  assert.equal(r.status, 404);
});
