/**
 * Regras de prazo do Fechamento Contábil.
 *
 * Arquivo sem dependências, usado igual no servidor (Node) e no navegador.
 * É a parte mais importante para levar para o NN HUB: toda a lógica de
 * "atrasada / vencendo / em dia" mora aqui e tem testes em test/regras.test.js.
 *
 * Conceitos
 * - Competência: mês contábil no formato "AAAA-MM" (ex.: "2026-09").
 * - Periodicidade: { tipo: "M" | "T", dia: 1..31, lag: 1 | 2 }
 *     tipo "M" = mensal, "T" = trimestral (competências 03, 06, 09 e 12)
 *     dia      = dia-limite para fechar
 *     lag      = quantos meses depois da competência vence
 *   Ex.: "Dia 25 de cada mês"           -> { tipo:"M", dia:25, lag:1 } (09/2026 vence 25/10/2026)
 *        "Até 10 do 2º mês subsequente" -> { tipo:"M", dia:10, lag:2 } (08/2026 vence 10/10/2026)
 *        "Dia 30 fechamento trimestre"  -> { tipo:"T", dia:30, lag:1 } (jul-set vence 30/10/2026)
 *   Se o mês não tem o dia (ex.: 30 de fevereiro), vale o último dia do mês.
 * - Transferidas e baixadas: prazo fixo = data da situação + 60 dias.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RegrasFechamento = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DIAS_AVISO = 5;            // "vencendo" = faltam 5 dias ou menos
  const PRAZO_ESPECIAL_DIAS = 60;  // transferidas e baixadas

  const STATUS = {
    ATRASADA: "atrasada",
    VENCENDO: "vencendo",
    EM_DIA_CONCILIADA: "em_dia_conciliada",
    EM_DIA_CONFERIDA: "em_dia_conferida",
    SEM_REGRA: "sem_regra",
    ESPECIAL: "especial",
  };

  const ROTULOS = {
    atrasada: "Atrasada",
    vencendo: "Vencendo",
    em_dia_conciliada: "Em dia · conciliada",
    em_dia_conferida: "Em dia · conferida",
    sem_regra: "Sem regra definida",
    especial: "Transferida/baixada",
  };

  function soData(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function somarMeses(ano, mes, k) {
    const t = ano * 12 + (mes - 1) + k;
    return [Math.floor(t / 12), (t % 12) + 1];
  }
  function chave(ano, mes) {
    return ano + "-" + String(mes).padStart(2, "0");
  }
  function diasEntre(a, b) {
    return Math.round((soData(a) - soData(b)) / 86400000);
  }
  function dataISO(s) {
    const [a, m, d] = s.split("-").map(Number);
    return new Date(a, m - 1, d);
  }

  /** Data-limite de uma competência (ano, mês) para uma periodicidade. */
  function prazoDaCompetencia(ano, mes, per) {
    const [a, m] = somarMeses(ano, mes, per.lag);
    const ultimoDia = new Date(a, m, 0).getDate();
    return new Date(a, m - 1, Math.min(per.dia, ultimoDia));
  }

  /** Competências possíveis (das mais novas para as mais antigas) com seus prazos. */
  function competencias(per, hoje) {
    const lista = [];
    let [a, m] = [hoje.getFullYear() + 1, 12];
    for (let i = 0; i < 120; i++) {
      if (per.tipo !== "T" || m % 3 === 0) lista.push({ competencia: chave(a, m), prazo: prazoDaCompetencia(a, m, per) });
      [a, m] = somarMeses(a, m, -1);
    }
    return lista;
  }

  /**
   * Calcula a situação de uma empresa na data `hoje`.
   * empresa: { periodicidade, conciliado_ate, conferido_ate, situacao_tipo, situacao_data, situacao_concluida }
   * Retorna { status, exigida, proxima, dias_atraso, dias_para_vencer, limite_especial, dias_restantes_especial }
   */
  function calcularSituacao(empresa, hojeParam) {
    const hoje = soData(hojeParam || new Date());

    if (empresa.situacao_tipo && !empresa.situacao_concluida) {
      const limite = dataISO(empresa.situacao_data);
      limite.setDate(limite.getDate() + PRAZO_ESPECIAL_DIAS);
      return { status: STATUS.ESPECIAL, limite_especial: limite, dias_restantes_especial: diasEntre(limite, hoje) };
    }

    const per = empresa.periodicidade;
    if (!per) return { status: STATUS.SEM_REGRA };

    const todas = competencias(per, hoje);
    const vencidas = todas.filter((c) => c.prazo <= hoje);
    const futuras = todas.filter((c) => c.prazo > hoje);
    const exigida = vencidas.reduce((a, b) => (b.prazo > a.prazo ? b : a));
    const proxima = futuras.reduce((a, b) => (b.prazo < a.prazo ? b : a));
    const conciliado = empresa.conciliado_ate || "0000-00";

    if (conciliado < exigida.competencia) {
      const pendentes = vencidas.filter((c) => c.competencia > conciliado);
      const primeira = pendentes.reduce((a, b) => (b.prazo < a.prazo ? b : a));
      return { status: STATUS.ATRASADA, exigida, proxima, primeira_pendente: primeira, dias_atraso: diasEntre(hoje, primeira.prazo) };
    }
    const faltam = diasEntre(proxima.prazo, hoje);
    if (faltam <= DIAS_AVISO && conciliado < proxima.competencia) {
      return { status: STATUS.VENCENDO, exigida, proxima, dias_para_vencer: faltam };
    }
    if (empresa.conferido_ate && empresa.conferido_ate >= exigida.competencia) {
      return { status: STATUS.EM_DIA_CONFERIDA, exigida, proxima };
    }
    return { status: STATUS.EM_DIA_CONCILIADA, exigida, proxima };
  }

  /** "Mensal · dia 25 do mês seguinte" */
  function descreverPeriodicidade(per) {
    if (!per) return "Sem regra definida";
    return (per.tipo === "T" ? "Trimestral" : "Mensal") + " · dia " + per.dia + (per.lag === 2 ? " do 2º mês seguinte" : " do mês seguinte");
  }

  /** "2026-09" -> "09/2026" */
  function formatarCompetencia(c) {
    return c ? c.slice(5) + "/" + c.slice(0, 4) : "—";
  }

  /** Converte o texto da coluna "PERIODICIDADE DE FECHAMENTO" da planilha. */
  function periodicidadeDaPlanilha(texto) {
    if (!texto || !String(texto).trim()) return null;
    const t = String(texto).toUpperCase();
    if (t.includes("TRIMESTRE")) return { tipo: "T", dia: 30, lag: 1 };
    if (t.includes("2M SUB")) return { tipo: "M", dia: 10, lag: 2 };
    const m = t.match(/(\d+)/);
    return m ? { tipo: "M", dia: Number(m[1]), lag: 1 } : null;
  }

  /** Empresa conta como "em dia" no painel (inclui vencendo, que ainda não venceu). */
  function estaEmDia(status) {
    return status === STATUS.EM_DIA_CONCILIADA || status === STATUS.EM_DIA_CONFERIDA || status === STATUS.VENCENDO;
  }

  return {
    DIAS_AVISO, PRAZO_ESPECIAL_DIAS, STATUS, ROTULOS,
    calcularSituacao, prazoDaCompetencia, descreverPeriodicidade,
    formatarCompetencia, periodicidadeDaPlanilha, estaEmDia,
  };
});
