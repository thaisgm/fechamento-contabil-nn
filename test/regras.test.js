// Testes das regras de prazo. Rodar com: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../shared/regras-fechamento.js");

const HOJE = new Date(2026, 9, 21); // 21/10/2026
const MENSAL_25 = { tipo: "M", dia: 25, lag: 1 };
const MENSAL_16 = { tipo: "M", dia: 16, lag: 1 };
const DOIS_MESES = { tipo: "M", dia: 10, lag: 2 };
const TRIMESTRAL = { tipo: "T", dia: 30, lag: 1 };

test("prazo mensal: 09/2026 vence dia 25/10/2026", () => {
  assert.deepEqual(R.prazoDaCompetencia(2026, 9, MENSAL_25), new Date(2026, 9, 25));
});

test("prazo 2º mês subsequente: 08/2026 vence 10/10/2026", () => {
  assert.deepEqual(R.prazoDaCompetencia(2026, 8, DOIS_MESES), new Date(2026, 9, 10));
});

test("prazo trimestral: trimestre jul-set vence 30/10/2026", () => {
  assert.deepEqual(R.prazoDaCompetencia(2026, 9, TRIMESTRAL), new Date(2026, 9, 30));
});

test("dia que não existe no mês usa o último dia (30 de fevereiro -> 28)", () => {
  assert.deepEqual(R.prazoDaCompetencia(2026, 1, { tipo: "M", dia: 30, lag: 1 }), new Date(2026, 1, 28));
});

test("sem periodicidade = sem regra definida", () => {
  assert.equal(R.calcularSituacao({ periodicidade: null, conciliado_ate: "2026-06" }, HOJE).status, R.STATUS.SEM_REGRA);
});

test("mensal dia 25 conciliada até 08/2026 em 21/10: vencendo (faltam 4 dias para 09/2026)", () => {
  const r = R.calcularSituacao({ periodicidade: MENSAL_25, conciliado_ate: "2026-08" }, HOJE);
  assert.equal(r.status, R.STATUS.VENCENDO);
  assert.equal(r.dias_para_vencer, 4);
  assert.equal(r.proxima.competencia, "2026-09");
});

test("mensal dia 16 conciliada até 08/2026 em 21/10: atrasada há 5 dias", () => {
  const r = R.calcularSituacao({ periodicidade: MENSAL_16, conciliado_ate: "2026-08" }, HOJE);
  assert.equal(r.status, R.STATUS.ATRASADA);
  assert.equal(r.dias_atraso, 5);
  assert.equal(r.exigida.competencia, "2026-09");
});

test("atraso conta do prazo da PRIMEIRA competência pendente", () => {
  // conciliada até 12/2025, trimestral: 1º tri/2026 venceu 30/04/2026
  const r = R.calcularSituacao({ periodicidade: TRIMESTRAL, conciliado_ate: "2025-12" }, HOJE);
  assert.equal(r.status, R.STATUS.ATRASADA);
  assert.equal(r.primeira_pendente.competencia, "2026-03");
  assert.equal(r.dias_atraso, 174);
});

test("trimestral conciliada até 06/2026 sem OK: em dia conciliada (próximo prazo 30/10 ainda a 9 dias)", () => {
  const r = R.calcularSituacao({ periodicidade: TRIMESTRAL, conciliado_ate: "2026-06" }, HOJE);
  assert.equal(r.status, R.STATUS.EM_DIA_CONCILIADA);
});

test("em dia com OK do analista na competência exigida: em dia conferida", () => {
  const r = R.calcularSituacao({ periodicidade: TRIMESTRAL, conciliado_ate: "2026-07", conferido_ate: "2026-06" }, HOJE);
  assert.equal(r.status, R.STATUS.EM_DIA_CONFERIDA);
});

test("OK antigo não conta como conferida", () => {
  const r = R.calcularSituacao({ periodicidade: TRIMESTRAL, conciliado_ate: "2026-08", conferido_ate: "2025-12" }, HOJE);
  assert.equal(r.status, R.STATUS.EM_DIA_CONCILIADA);
});

test("vencendo aparece 5 dias antes (25/10 visto em 20/10)", () => {
  const r = R.calcularSituacao({ periodicidade: MENSAL_25, conciliado_ate: "2026-08" }, new Date(2026, 9, 20));
  assert.equal(r.status, R.STATUS.VENCENDO);
  const r2 = R.calcularSituacao({ periodicidade: MENSAL_25, conciliado_ate: "2026-08" }, new Date(2026, 9, 19));
  assert.equal(r2.status, R.STATUS.EM_DIA_CONCILIADA);
});

test("no dia do prazo, a competência já é exigida", () => {
  const r = R.calcularSituacao({ periodicidade: MENSAL_25, conciliado_ate: "2026-08" }, new Date(2026, 9, 25));
  assert.equal(r.status, R.STATUS.ATRASADA);
  assert.equal(r.dias_atraso, 0);
});

test("transferida em 31/08/2026: concluir até 30/10/2026, faltam 9 dias", () => {
  const r = R.calcularSituacao({ situacao_tipo: "Transferência", situacao_data: "2026-08-31", situacao_concluida: false }, HOJE);
  assert.equal(r.status, R.STATUS.ESPECIAL);
  assert.deepEqual(r.limite_especial, new Date(2026, 9, 30));
  assert.equal(r.dias_restantes_especial, 9);
});

test("transferência concluída volta para a regra normal", () => {
  const r = R.calcularSituacao({ periodicidade: null, situacao_tipo: "Baixada", situacao_data: "2026-01-01", situacao_concluida: true }, HOJE);
  assert.equal(r.status, R.STATUS.SEM_REGRA);
});

test("leitura da periodicidade da planilha", () => {
  assert.deepEqual(R.periodicidadeDaPlanilha("DIA 30 FECHAMENTO DO TRIMESTRE"), TRIMESTRAL);
  assert.deepEqual(R.periodicidadeDaPlanilha("ATE 10 DO 2M SUB"), DOIS_MESES);
  assert.deepEqual(R.periodicidadeDaPlanilha("DIA 25 DE CADA MES"), MENSAL_25);
  assert.deepEqual(R.periodicidadeDaPlanilha("ATE DIA 16 DE CADA MÊS"), MENSAL_16);
  assert.equal(R.periodicidadeDaPlanilha(null), null);
});

test("planilha completa em 21/10/2026 bate com a análise feita na planilha", () => {
  const empresas = require("../data/empresas-carga-inicial.json");
  const contagem = {};
  for (const e of empresas) {
    const s = R.calcularSituacao(e, HOJE).status;
    contagem[s] = (contagem[s] || 0) + 1;
  }
  assert.deepEqual(contagem, { atrasada: 183, vencendo: 5, em_dia_conciliada: 45, em_dia_conferida: 9, sem_regra: 46, especial: 16 });
});
