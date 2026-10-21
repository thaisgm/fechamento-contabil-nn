/**
 * Regras de negócio do Fechamento Contábil (o que cada ação faz e o que ela grava).
 *
 * Não sabe nada de banco de dados: recebe um "repositório" com 5 funções.
 *   repo.listar()                       -> [empresa]
 *   repo.obter(codigo)                  -> empresa | null
 *   repo.salvar(codigo, campos)         -> grava só os campos informados
 *   repo.registrarHistorico(linha)      -> grava uma linha de histórico
 *   repo.listarHistorico({ empresa, limite }) -> [linha] (mais recente primeiro)
 *   repo.transacao(fn)                  -> roda fn() de forma atômica
 * O servidor usa um repositório SQL (src/repositorio-sql.js). O modo
 * demonstração usa um repositório no navegador (public/js/repositorio-demo.js).
 * No NN HUB basta escrever um repositório para o banco oficial.
 *
 * Formato da empresa:
 * { codigo, nome, grupo, plano, regime, periodicidade: {tipo,dia,lag}|null,
 *   conciliado_ate, conferido_ate, colaborador, analista, observacao,
 *   situacao_tipo, situacao_data, situacao_concluida, situacao_concluida_em,
 *   regime_alerta: {anterior,novo,desde,ciencia_por,ciencia_em,exemplo}|null,
 *   atualizado_em }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./regras-fechamento.js"), require("./permissoes.js"));
  } else root.ServicoFechamento = factory(root.RegrasFechamento, root.Permissoes);
})(typeof self !== "undefined" ? self : this, function (R, P) {
  "use strict";

  class ErroNegocio extends Error {
    constructor(status, mensagem) { super(mensagem); this.status = status; }
  }
  const proibido = (m) => new ErroNegocio(403, m);
  const invalido = (m) => new ErroNegocio(400, m);

  const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
  const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
  const REGIMES = ["Simples", "Presumido", "Real"];
  const SITUACOES = ["Transferência", "Baixada"];

  const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const compDe = (d) => iso(d).slice(0, 7);

  function serializarSituacao(s) {
    const out = { status: s.status, rotulo: R.ROTULOS[s.status] };
    if (s.exigida) out.exigida = { competencia: s.exigida.competencia, prazo: iso(s.exigida.prazo) };
    if (s.proxima) out.proxima = { competencia: s.proxima.competencia, prazo: iso(s.proxima.prazo) };
    if (s.primeira_pendente) out.primeira_pendente = { competencia: s.primeira_pendente.competencia, prazo: iso(s.primeira_pendente.prazo) };
    if (s.dias_atraso != null) out.dias_atraso = s.dias_atraso;
    if (s.dias_para_vencer != null) out.dias_para_vencer = s.dias_para_vencer;
    if (s.limite_especial) { out.limite_especial = iso(s.limite_especial); out.dias_restantes_especial = s.dias_restantes_especial; }
    return out;
  }

  function criarServico(repo, opcoes) {
    const agora = (opcoes && opcoes.agora) || (() => new Date());

    function exigirEmpresa(codigo) {
      const e = repo.obter(Number(codigo));
      if (!e) throw new ErroNegocio(404, "Empresa " + codigo + " não encontrada.");
      return e;
    }
    function exigirUsuario(usuario) {
      if (!P.ehDaEquipe(usuario)) throw proibido("Escolha seu nome antes de alterar o fechamento.");
    }
    function gravar(usuario, empresa, campos, tipo, de, para) {
      repo.transacao(() => {
        repo.salvar(empresa.codigo, Object.assign({}, campos, { atualizado_em: agora().toISOString() }));
        repo.registrarHistorico({
          criado_em: agora().toISOString(), usuario, empresa_codigo: empresa.codigo, tipo,
          valor_de: de == null ? "—" : String(de), valor_para: para == null ? "—" : String(para),
        });
      });
      return comSituacao(repo.obter(empresa.codigo));
    }
    function comSituacao(e) {
      return Object.assign({}, e, { situacao: serializarSituacao(R.calcularSituacao(e, agora())) });
    }

    return {
      listarEmpresas() {
        return repo.listar().map(comSituacao).sort((a, b) => a.codigo - b.codigo);
      },
      obterEmpresa(codigo) {
        return comSituacao(exigirEmpresa(codigo));
      },

      atualizarCompetencia(usuario, codigo, competencia) {
        exigirUsuario(usuario);
        const e = exigirEmpresa(codigo);
        if (!RE_COMPETENCIA.test(competencia || "")) throw invalido("Competência inválida. Use mês e ano.");
        if (competencia > compDe(agora())) throw invalido("Não dá para conciliar uma competência futura.");
        if (competencia === e.conciliado_ate) throw invalido("A empresa já está conciliada até " + R.formatarCompetencia(competencia) + ".");
        // Se voltar a competência (retificação), o OK do analista não pode ficar à frente dela.
        const campos = { conciliado_ate: competencia };
        if (e.conferido_ate && e.conferido_ate > competencia) campos.conferido_ate = competencia;
        return gravar(usuario, e, campos, "Competência conciliada", R.formatarCompetencia(e.conciliado_ate), R.formatarCompetencia(competencia));
      },

      darOk(usuario, codigo) {
        exigirUsuario(usuario);
        const e = exigirEmpresa(codigo);
        if (!P.podeDarOk(usuario, e)) throw proibido("Só o analista da carteira ou a coordenação dá o OK.");
        if (!e.conciliado_ate) throw invalido("A empresa ainda não tem competência conciliada.");
        if (e.conferido_ate === e.conciliado_ate) throw invalido("Esta competência já está conferida.");
        return gravar(usuario, e, { conferido_ate: e.conciliado_ate }, "OK do analista", R.formatarCompetencia(e.conferido_ate), R.formatarCompetencia(e.conciliado_ate));
      },

      alterarPeriodicidade(usuario, codigo, per) {
        exigirUsuario(usuario);
        if (!P.podeEditarPeriodicidade(usuario)) throw proibido("Só a coordenação altera a periodicidade.");
        const e = exigirEmpresa(codigo);
        let nova = null;
        if (per) {
          const dia = Number(per.dia), lag = Number(per.lag);
          if (!["M", "T"].includes(per.tipo) || !(dia >= 1 && dia <= 31) || ![1, 2].includes(lag)) throw invalido("Periodicidade inválida.");
          nova = { tipo: per.tipo, dia, lag };
        }
        return gravar(usuario, e, { periodicidade: nova }, "Periodicidade alterada", R.descreverPeriodicidade(e.periodicidade), R.descreverPeriodicidade(nova));
      },

      registrarMudancaRegime(usuario, codigo, novo, desde) {
        exigirUsuario(usuario);
        if (!P.podeRegistrarCadastro(usuario)) throw proibido("Sem permissão para registrar mudança de regime.");
        const e = exigirEmpresa(codigo);
        if (!REGIMES.includes(novo) || novo === e.regime) throw invalido("Escolha um regime diferente do atual.");
        if (!RE_COMPETENCIA.test(desde || "")) throw invalido("Informe a partir de qual competência.");
        const alerta = { anterior: e.regime, novo, desde, ciencia_por: null, ciencia_em: null, exemplo: false };
        return gravar(usuario, e, { regime_alerta: alerta }, "Mudança de regime registrada", e.regime, novo);
      },

      darCiencia(usuario, codigo) {
        exigirUsuario(usuario);
        const e = exigirEmpresa(codigo);
        if (!e.regime_alerta || e.regime_alerta.ciencia_em) throw invalido("Não há mudança de regime pendente nesta empresa.");
        if (!P.podeDarCiencia(usuario, e)) throw proibido("Só o colaborador da carteira ou a coordenação dá ciência.");
        const alerta = Object.assign({}, e.regime_alerta, { ciencia_por: usuario, ciencia_em: agora().toISOString() });
        return gravar(usuario, e, { regime: alerta.novo, regime_alerta: alerta }, "Ciência de regime", alerta.anterior, alerta.novo);
      },

      marcarSituacao(usuario, codigo, tipo, data) {
        exigirUsuario(usuario);
        if (!P.podeRegistrarCadastro(usuario)) throw proibido("Sem permissão para marcar transferência ou baixada.");
        const e = exigirEmpresa(codigo);
        if (!SITUACOES.includes(tipo)) throw invalido("Situação inválida.");
        if (!RE_DATA.test(data || "")) throw invalido("Informe a data.");
        if (e.situacao_tipo && !e.situacao_concluida) throw invalido("A empresa já está marcada como " + e.situacao_tipo.toLowerCase() + ".");
        return gravar(usuario, e, { situacao_tipo: tipo, situacao_data: data, situacao_concluida: false, situacao_concluida_em: null }, "Marcada como " + tipo.toLowerCase(), "Ativa", tipo);
      },

      concluirSituacao(usuario, codigo) {
        exigirUsuario(usuario);
        const e = exigirEmpresa(codigo);
        if (!e.situacao_tipo || e.situacao_concluida) throw invalido("Não há transferência ou baixada em andamento.");
        return gravar(usuario, e, { situacao_concluida: true, situacao_concluida_em: iso(agora()) }, "Transferência/baixada concluída", e.situacao_tipo, "Concluída");
      },

      historico(filtro) {
        return repo.listarHistorico({ empresa: filtro && filtro.empresa ? Number(filtro.empresa) : null, limite: Math.min(Number((filtro && filtro.limite) || 300), 1000) });
      },

      /** Números do painel da coordenação, por regime. */
      painel(usuario) {
        if (!P.podeVerPainel(usuario)) throw proibido("O painel é só para a coordenação.");
        const lista = this.listarEmpresas().filter((e) => e.situacao.status !== R.STATUS.ESPECIAL);
        const regimes = ["Simples", "Presumido", "Real"];
        const vazio = () => ({ atrasada: 0, vencendo: 0, em_dia_conciliada: 0, em_dia_conferida: 0, sem_regra: 0, total: 0, em_dia: 0, com_regra: 0 });
        const porRegime = {}; regimes.forEach((r) => (porRegime[r] = vazio()));
        const total = vazio(); const atrasadasPorCarteira = {};
        for (const e of lista) {
          const alvo = [porRegime[e.regime] || (porRegime[e.regime] = vazio()), total];
          for (const t of alvo) {
            t[e.situacao.status]++; t.total++;
            if (e.situacao.status !== R.STATUS.SEM_REGRA) t.com_regra++;
            if (R.estaEmDia(e.situacao.status)) t.em_dia++;
          }
          if (e.situacao.status === R.STATUS.ATRASADA) {
            const k = (e.colaborador || "—") + " · " + (e.analista || "—");
            atrasadasPorCarteira[k] = (atrasadasPorCarteira[k] || 0) + 1;
          }
        }
        const especiais = this.listarEmpresas().filter((e) => e.situacao.status === R.STATUS.ESPECIAL);
        return {
          data: iso(agora()), porRegime, total,
          atrasadasPorCarteira: Object.entries(atrasadasPorCarteira).sort((a, b) => b[1] - a[1]).map(([carteira, quantidade]) => ({ carteira, quantidade })),
          especiais: {
            em_andamento: especiais.length,
            vencidas: especiais.filter((e) => e.situacao.dias_restantes_especial < 0).length,
            vencem_em_15_dias: especiais.filter((e) => e.situacao.dias_restantes_especial >= 0 && e.situacao.dias_restantes_especial <= 15).length,
          },
          regimes_sem_ciencia: repo.listar().filter((e) => e.regime_alerta && !e.regime_alerta.ciencia_em).length,
        };
      },

      /**
       * Avisos de uma pessoa. No NN HUB, este mesmo cálculo pode rodar uma vez
       * por dia e mandar para a central de notificações.
       */
      avisos(usuario) {
        if (!P.ehDaEquipe(usuario)) return [];
        const lista = this.listarEmpresas(); const out = [];
        if (P.ehCoordenacao(usuario)) {
          const n = lista.filter((e) => e.situacao.status === R.STATUS.ATRASADA).length;
          if (n) out.push({ tipo: "atrasadas", quantidade: n, texto: n + " empresas com competência em atraso" });
        }
        for (const e of lista) {
          if (e.colaborador !== usuario) continue;
          const s = e.situacao;
          if (s.status === R.STATUS.VENCENDO) out.push({ tipo: "vencendo", codigo: e.codigo, texto: e.nome + ": competência " + R.formatarCompetencia(s.proxima.competencia) + " vence em " + s.dias_para_vencer + (s.dias_para_vencer === 1 ? " dia" : " dias") });
          if (e.regime_alerta && !e.regime_alerta.ciencia_em) out.push({ tipo: "regime", codigo: e.codigo, texto: e.nome + ": regime mudou para " + e.regime_alerta.novo + ". Dê ciência." });
          if (s.status === R.STATUS.ESPECIAL && s.dias_restantes_especial <= 15) out.push({ tipo: "especial", codigo: e.codigo, texto: e.nome + ": " + e.situacao_tipo.toLowerCase() + ", concluir até " + s.limite_especial.split("-").reverse().join("/") });
        }
        return out;
      },
    };
  }

  return { criarServico, ErroNegocio };
});
