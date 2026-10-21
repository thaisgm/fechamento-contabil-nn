/**
 * Quem pode fazer o quê no Fechamento Contábil.
 * Usado igual no servidor (que é quem garante de verdade) e nas telas (que só
 * escondem ou desativam botões). No NN HUB, `usuario` deve vir do login e o
 * papel de coordenação da permissão do sistema, não deste arquivo.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Permissoes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Equipe do Contábil hoje (nomes como aparecem na planilha).
  const EQUIPE = ["André", "Edmara", "Gisele", "Guilherme", "João", "Natália"];
  const COORDENACAO = ["Edmara"];

  const ehCoordenacao = (u) => COORDENACAO.includes(u);
  const ehDaEquipe = (u) => EQUIPE.includes(u);

  return {
    EQUIPE,
    COORDENACAO,
    ehCoordenacao,
    ehDaEquipe,
    /** Qualquer pessoa do Contábil atualiza a competência conciliada. */
    podeAtualizarCompetencia: (u) => ehDaEquipe(u),
    /** OK: analista da carteira da empresa, ou a coordenação. */
    podeDarOk: (u, empresa) => ehCoordenacao(u) || (ehDaEquipe(u) && empresa.analista === u),
    /** Periodicidade: só a coordenação. */
    podeEditarPeriodicidade: (u) => ehCoordenacao(u),
    /** Ciência de regime: colaborador da carteira, ou a coordenação. */
    podeDarCiencia: (u, empresa) => ehCoordenacao(u) || (ehDaEquipe(u) && empresa.colaborador === u),
    /** Registrar mudança de regime e transferência/baixada (no NN HUB, vem do cadastro / Societário). */
    podeRegistrarCadastro: (u) => ehDaEquipe(u),
    /** Painel da coordenação: só coordenação (no NN HUB: coordenação, head e diretoria). */
    podeVerPainel: (u) => ehCoordenacao(u),
  };
});
