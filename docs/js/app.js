/**
 * Telas do Fechamento Contábil.
 * Só desenha e chama a API (js/api.js). Regras de prazo e permissões ficam em
 * shared/ e são conferidas de novo pelo servidor.
 */
(function () {
  "use strict";
  const R = window.RegrasFechamento;
  const P = window.Permissoes;
  const ST = R.STATUS;

  const S = {
    api: null, empresas: [], carregado: false, erro: null,
    aba: "empresas", escopo: "todas", kpi: null,
    f: { q: "", cart: "", st: "", per: "", reg: "", grp: "" },
    sel: null, selHist: [], eu: "",
  };
  try { S.eu = localStorage.getItem("fc_eu") || ""; S.aba = localStorage.getItem("fc_aba") || "empresas"; } catch (e) {}

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtC = R.formatarCompetencia;
  const fmtD = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
  const fmtDH = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const carteira = (e) => (e.colaborador || "—") + " · " + (e.analista || "—");
  const regimePendente = (e) => e.regime_alerta && !e.regime_alerta.ciencia_em;
  const minha = (e) => !S.eu || e.colaborador === S.eu || e.analista === S.eu;
  const mesAtual = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };

  function toast(t) {
    const el = $("#toast"); el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 3000);
  }

  async function recarregar() {
    try {
      S.empresas = await S.api.listarEmpresas();
      S.carregado = true; S.erro = null;
    } catch (e) { S.erro = e.message; }
    render();
    atualizarAvisos();
    if (S.sel != null) carregarHistoricoSel();
  }

  /** Executa uma ação, mostra a mensagem e recarrega a lista. */
  async function acao(fn, msg) {
    if (!S.eu) { toast("Escolha seu nome em Você é, no topo da página, antes de salvar."); return; }
    try { await fn(); toast(msg); await recarregar(); }
    catch (e) { toast(e.message); }
  }

  /* ---------------- render geral ---------------- */
  function render() {
    const coord = P.podeVerPainel(S.eu);
    $('#tabs [data-t="painel"]').hidden = !coord;
    if (S.aba === "painel" && !coord) S.aba = "empresas";
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === S.aba));
    document.querySelectorAll("#escopo button").forEach((b) => b.classList.toggle("on", b.dataset.v === S.escopo));
    $("#quem").classList.toggle("falta", !S.eu);
    renderAvisos();
    const el = $("#content");
    if (!S.carregado) {
      el.innerHTML = S.erro
        ? `<div class="empty"><strong>Não foi possível carregar o fechamento.</strong>${esc(S.erro)}</div>`
        : `<div class="empty"><strong>Carregando empresas…</strong>A lista do fechamento aparece aqui em instantes.</div>`;
    } else if (!S.empresas.length) {
      el.innerHTML = `<div class="empty"><strong>Nenhuma empresa no fechamento ainda.</strong>As empresas entram aqui pela carga inicial da planilha.</div>`;
    } else {
      ({ empresas: abaEmpresas, painel: abaPainel, especiais: abaEspeciais, regime: abaRegime, historico: abaHistorico })[S.aba](el);
    }
    renderGaveta();
  }

  function pill(e) {
    const s = e.situacao;
    switch (s.status) {
      case ST.ATRASADA: return `<span class="pill p-neg">Atrasada · ${s.dias_atraso} dias</span>`;
      case ST.VENCENDO: return `<span class="pill p-warn">Vence ${fmtD(s.proxima.prazo).slice(0, 5)}</span>`;
      case ST.EM_DIA_CONFERIDA: return `<span class="pill p-ok">✓ Em dia · conferida</span>`;
      case ST.EM_DIA_CONCILIADA: return `<span class="pill p-ok2">Em dia · conciliada</span>`;
      case ST.ESPECIAL: {
        const r = s.dias_restantes_especial;
        return r < 0 ? `<span class="pill p-neg">Vencida há ${-r} dias</span>` : `<span class="pill ${r <= 15 ? "p-warn" : "p-off"}">Faltam ${r} dias</span>`;
      }
      default: return `<span class="pill p-off">Sem regra definida</span>`;
    }
  }
  const opcoes = (arr, val, todos) => `<option value="">${todos}</option>` + arr.map((v) => `<option${v === val ? " selected" : ""}>${esc(v)}</option>`).join("");

  /* ---------------- aba Empresas ---------------- */
  function abaEmpresas(el) {
    let L = S.empresas.filter((e) => e.situacao.status !== ST.ESPECIAL);
    if (S.escopo === "minha") L = L.filter(minha);
    const conta = (k) => L.filter((e) => e.situacao.status === k).length;
    const carteiras = [...new Set(L.map(carteira))].sort();
    const grupos = [...new Set(S.empresas.map((e) => e.grupo).filter(Boolean))].sort();
    const f = S.f; let V = L;
    if (S.kpi) V = V.filter((e) => e.situacao.status === S.kpi);
    if (f.q) { const q = f.q.toLowerCase(); V = V.filter((e) => String(e.codigo) === q || e.nome.toLowerCase().includes(q)); }
    if (f.cart) V = V.filter((e) => carteira(e) === f.cart);
    if (f.st) V = V.filter((e) => e.situacao.status === f.st);
    if (f.per) V = V.filter((e) => (f.per === "sem" ? !e.periodicidade : e.periodicidade && e.periodicidade.tipo === f.per));
    if (f.reg) V = V.filter((e) => e.regime === f.reg);
    if (f.grp) V = V.filter((e) => e.grupo === f.grp);
    V.sort((a, b) => a.codigo - b.codigo);

    const kpi = (id, l, cls, n) => `<button type="button" class="kpi${S.kpi === id ? " on" : ""}" data-kpi="${id}"><div class="l">${l}</div><div class="v ${cls}">${conta(id)}</div><div class="n">${n}</div></button>`;
    el.innerHTML = `${S.eu ? "" : `<div class="aviso-eu">Escolha seu nome em <strong>Você é</strong>, no topo da página, para atualizar empresas, dar OK e ver seus avisos.</div>`}
    <div class="kpis">
      ${kpi(ST.ATRASADA, "Atrasadas", "neg", "Prazo da competência já passou")}
      ${kpi(ST.VENCENDO, "Vencendo em até 5 dias", "acc", "Prazo da próxima chegando")}
      ${kpi(ST.EM_DIA_CONCILIADA, "Em dia · conciliada", "", "Esperando OK do analista")}
      ${kpi(ST.EM_DIA_CONFERIDA, "Em dia · conferida", "pos", "Analista deu OK")}
      ${kpi(ST.SEM_REGRA, "Sem regra definida", "", "Coordenação define a periodicidade")}
    </div>
    <div class="panel" style="margin-bottom:var(--gap)"><div class="filtros" style="margin:0">
      <div class="fld"><label for="fq">Empresa ou código</label><input id="fq" value="${esc(f.q)}" placeholder="Ex.: 664"></div>
      <div class="fld"><label for="fcart">Carteira</label><select id="fcart">${opcoes(carteiras, f.cart, "Todas")}</select></div>
      <div class="fld"><label for="fst">Situação</label><select id="fst"><option value="">Todas</option>${[ST.ATRASADA, ST.VENCENDO, ST.EM_DIA_CONCILIADA, ST.EM_DIA_CONFERIDA, ST.SEM_REGRA].map((s) => `<option value="${s}"${f.st === s ? " selected" : ""}>${R.ROTULOS[s]}</option>`).join("")}</select></div>
      <div class="fld"><label for="fper">Periodicidade</label><select id="fper"><option value="">Todas</option><option value="M"${f.per === "M" ? " selected" : ""}>Mensal</option><option value="T"${f.per === "T" ? " selected" : ""}>Trimestral</option><option value="sem"${f.per === "sem" ? " selected" : ""}>Sem regra</option></select></div>
      <div class="fld"><label for="freg">Regime</label><select id="freg">${opcoes(["Simples", "Presumido", "Real"], f.reg, "Todos")}</select></div>
      <div class="fld"><label for="fgrp">Grupo econômico</label><select id="fgrp">${opcoes(grupos, f.grp, "Todos")}</select></div>
    </div></div>
    <section class="panel">
      <div class="ph"><h3>${V.length} empresas, em ordem de código</h3><span class="f">Clique numa empresa para atualizar</span></div>
      ${V.length ? `<div class="tw"><table><thead><tr><th class="r">Cód.</th><th>Empresa</th><th>Periodicidade</th><th>Carteira</th><th class="r">Conciliado até</th><th class="r">Exigido hoje</th><th class="r">OK do analista</th><th>Situação</th></tr></thead><tbody>
      ${V.map((e) => `<tr class="click" data-cod="${e.codigo}"><td class="r num muted">${e.codigo}</td><td><strong>${esc(e.nome)}</strong>${regimePendente(e) ? '<span class="flag">regime alterado</span>' : ""}<div class="sub">${esc(e.regime || "")} · ${esc(e.plano || "")}${e.grupo ? " · " + esc(e.grupo) : ""}</div></td><td>${esc(e.periodicidade ? R.descreverPeriodicidade(e.periodicidade) : "—")}</td><td style="white-space:nowrap">${esc(carteira(e))}</td><td class="r num"><strong>${fmtC(e.conciliado_ate)}</strong></td><td class="r num">${e.situacao.exigida ? fmtC(e.situacao.exigida.competencia) : "—"}</td><td class="r num">${fmtC(e.conferido_ate)}</td><td>${pill(e)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty"><strong>Nenhuma empresa com esses filtros.</strong>Limpe um filtro ou clique de novo no número selecionado.</div>`}
      <div class="foot"><span>“Exigido hoje” é a última competência cujo prazo já passou.</span><span>Docs da competência: aguardando o módulo AC Docs</span></div>
    </section>`;

    el.querySelectorAll("[data-kpi]").forEach((b) => (b.onclick = () => { S.kpi = S.kpi === b.dataset.kpi ? null : b.dataset.kpi; render(); }));
    const ligar = (id, chave, ev) => {
      const i = $("#" + id);
      i.addEventListener(ev, () => {
        S.f[chave] = i.value;
        if (ev === "input") { clearTimeout(ligar.t); ligar.t = setTimeout(() => { render(); const n = $("#fq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); }
        else render();
      });
    };
    ligar("fq", "q", "input"); ligar("fcart", "cart", "change"); ligar("fst", "st", "change"); ligar("fper", "per", "change"); ligar("freg", "reg", "change"); ligar("fgrp", "grp", "change");
    el.querySelectorAll("tr[data-cod]").forEach((r) => (r.onclick = () => abrirEmpresa(Number(r.dataset.cod))));
  }

  /* ---------------- aba Painel ---------------- */
  function barras(itens, max) {
    const mx = Math.max(1, max || Math.max(...itens.map((i) => i[1])));
    return `<div class="bars">${itens.map(([l, v, c]) => `<div class="bar"><span class="lb" title="${esc(l)}">${esc(l)}</span><span class="tr"><span class="fill ${c || ""}" style="width:${Math.round((v / mx) * 85)}%"></span><span class="vl">${v}</span></span></div>`).join("")}</div>`;
  }
  async function abaPainel(el) {
    el.innerHTML = `<div class="empty"><strong>Carregando o painel…</strong></div>`;
    let p;
    try { p = await S.api.painel(); } catch (e) { el.innerHTML = `<div class="empty"><strong>${esc(e.message)}</strong></div>`; return; }
    if (S.aba !== "painel") return;
    const regs = [["Simples", "Simples Nacional"], ["Presumido", "Lucro Presumido"], ["Real", "Lucro Real"]];
    const sts = [[ST.EM_DIA_CONFERIDA, "Em dia · conferida", "ok"], [ST.EM_DIA_CONCILIADA, "Em dia · conciliada", "ok"], [ST.VENCENDO, "Vencendo", "warn"], [ST.ATRASADA, "Atrasadas", "neg"], [ST.SEM_REGRA, "Sem regra", ""]];
    const pc = (t) => (t.com_regra ? Math.round((100 * t.em_dia) / t.com_regra) + "%" : "—");
    const t = p.total;
    el.innerHTML = `<div class="grid">
    ${regs.map(([r, l]) => { const x = p.porRegime[r]; return `<section class="panel s4"><div class="ph"><h3>${l}</h3><span class="f">${x.total} empresas</span></div>
      <div class="big"><b>${pc(x)}</b><span>em dia<br><span class="muted">${x.em_dia} de ${x.com_regra} com regra</span></span></div>
      ${barras(sts.map(([s, sl, c]) => [sl, x[s], c]), x.total)}</section>`; }).join("")}
    <section class="panel s12"><div class="ph"><h3>Resumo por regime: ${pc(t)} das empresas com regra estão em dia</h3><span class="f">Situação de ${fmtD(p.data)}</span></div>
      <div class="tw"><table><thead><tr><th>Regime</th>${sts.map((s) => `<th class="r">${s[1]}</th>`).join("")}<th class="r">Total</th><th class="r">% em dia</th></tr></thead><tbody>
      ${regs.map(([r, l]) => { const x = p.porRegime[r]; return `<tr><td><strong>${l}</strong></td>${sts.map((s) => `<td class="r num">${x[s[0]]}</td>`).join("")}<td class="r num"><strong>${x.total}</strong></td><td class="r num"><strong>${pc(x)}</strong></td></tr>`; }).join("")}
      <tr class="tot"><td>Total</td>${sts.map((s) => `<td class="r num">${t[s[0]]}</td>`).join("")}<td class="r num">${t.total}</td><td class="r num">${pc(t)}</td></tr>
      </tbody></table></div>
      <div class="foot"><span>% em dia = (conferida + conciliada + vencendo) ÷ empresas com periodicidade definida</span></div></section>
    <section class="panel s8"><div class="ph"><h3>Onde estão as ${t[ST.ATRASADA]} atrasadas, por carteira</h3></div>
      ${p.atrasadasPorCarteira.length ? barras(p.atrasadasPorCarteira.map((x, i) => [x.carteira, x.quantidade, i === 0 ? "hi" : ""])) : `<div class="empty"><strong>Nenhuma empresa atrasada.</strong></div>`}</section>
    <section class="panel s4"><div class="ph"><h3>Transferidas, baixadas e regime</h3></div>
      <div class="kv"><span>Transferidas/baixadas em andamento</span><strong>${p.especiais.em_andamento}</strong></div>
      <div class="kv"><span>Prazo de 60 dias vencido</span><strong style="color:var(--neg)">${p.especiais.vencidas}</strong></div>
      <div class="kv"><span>Vencem em até 15 dias</span><strong style="color:var(--terra)">${p.especiais.vencem_em_15_dias}</strong></div>
      <div class="kv"><span>Regimes alterados sem ciência</span><strong>${p.regimes_sem_ciencia}</strong></div>
    </section></div>`;
  }

  /* ---------------- aba Transferidas e baixadas ---------------- */
  function abaEspeciais(el) {
    let L = S.empresas.filter((e) => e.situacao.status === ST.ESPECIAL);
    if (S.escopo === "minha") L = L.filter(minha);
    L.sort((a, b) => a.situacao.dias_restantes_especial - b.situacao.dias_restantes_especial);
    el.innerHTML = `<section class="panel"><div class="ph"><h3>Transferidas e baixadas: concluir o fechamento em até 60 dias</h3><span class="f">Prazo = data da situação + 60 dias</span></div>
    ${L.length ? `<div class="tw"><table><thead><tr><th class="r">Cód.</th><th>Empresa</th><th>Situação</th><th class="r">Data da situação</th><th class="r">Concluir até</th><th>Carteira</th><th>Prazo</th><th></th></tr></thead><tbody>
    ${L.map((e) => `<tr><td class="r num muted">${e.codigo}</td><td><strong>${esc(e.nome)}</strong></td><td>${esc(e.situacao_tipo)}</td><td class="r num">${fmtD(e.situacao_data)}</td><td class="r num"><strong>${fmtD(e.situacao.limite_especial)}</strong></td><td style="white-space:nowrap">${esc(carteira(e))}</td><td>${pill(e)}</td><td class="r"><button type="button" class="btn2 btn-s" data-concluir="${e.codigo}">Concluir</button></td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty"><strong>Nenhuma transferência ou baixada em andamento.</strong>Para marcar uma empresa, abra ela na aba Empresas.</div>`}
    <div class="foot"><span>Concluídas saem desta lista e ficam no histórico.</span></div></section>`;
    el.querySelectorAll("[data-concluir]").forEach((b) => (b.onclick = () => {
      const e = S.empresas.find((x) => x.codigo === Number(b.dataset.concluir));
      b.disabled = true;
      acao(() => S.api.concluirSituacao(e.codigo), "Fechamento de " + e.nome + " concluído.");
    }));
  }

  /* ---------------- aba Mudanças de regime ---------------- */
  function abaRegime(el) {
    let L = S.empresas.filter((e) => e.regime_alerta);
    if (S.escopo === "minha") L = L.filter(minha);
    L.sort((a, b) => regimePendente(b) - regimePendente(a) || a.codigo - b.codigo);
    el.innerHTML = `<section class="panel"><div class="ph"><h3>Mudanças de regime: o colaborador da carteira dá ciência e ajusta a Domínio</h3><span class="f">No NN HUB, quem altera é o Societário no cadastro de clientes</span></div>
    ${L.length ? `<div class="tw"><table><thead><tr><th class="r">Cód.</th><th>Empresa</th><th>Mudança</th><th class="r">A partir de</th><th>Carteira</th><th>Ciência</th><th></th></tr></thead><tbody>
    ${L.map((e) => { const a = e.regime_alerta; const pode = P.podeDarCiencia(S.eu, e); return `<tr><td class="r num muted">${e.codigo}</td><td><strong>${esc(e.nome)}</strong>${a.exemplo ? '<span class="flag">exemplo para teste</span>' : ""}</td><td>${esc(a.anterior)} → ${esc(a.novo)}</td><td class="r num">${fmtC(a.desde)}</td><td style="white-space:nowrap">${esc(carteira(e))}</td>
    <td>${a.ciencia_em ? `<span class="pill p-ok">✓ ${esc(a.ciencia_por)} · ${fmtD(a.ciencia_em)}</span>` : `<span class="pill p-warn">Pendente</span>`}</td>
    <td class="r">${a.ciencia_em ? "" : `<button type="button" class="btn btn-s" data-ciencia="${e.codigo}" ${S.eu && !pode ? "disabled title='Só o colaborador da carteira ou a coordenação'" : ""}>Dar ciência</button>`}</td></tr>`; }).join("")}
    </tbody></table></div>` : `<div class="empty"><strong>Nenhuma mudança de regime registrada.</strong>Quando o regime de uma empresa mudar, ela aparece aqui para o colaborador dar ciência.</div>`}
    <div class="foot"><span>Neste protótipo a mudança é registrada na ficha da empresa. No NN HUB, nasce do cadastro de clientes.</span></div></section>`;
    el.querySelectorAll("[data-ciencia]").forEach((b) => (b.onclick = () => {
      b.disabled = true;
      acao(() => S.api.darCiencia(Number(b.dataset.ciencia)), "Ciência registrada. Lembre de ajustar os parâmetros na Domínio.");
    }));
  }

  /* ---------------- aba Histórico ---------------- */
  async function abaHistorico(el) {
    el.innerHTML = `<section class="panel"><div class="ph"><h3>Tudo o que foi alterado no fechamento</h3></div><div id="logT"><div class="empty"><strong>Carregando…</strong></div></div></section>`;
    let log = [];
    try { log = await S.api.historico({ limite: 300 }); } catch (e) { $("#logT").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const t = $("#logT"); if (!t) return;
    t.innerHTML = log.length
      ? `<div class="tw"><table><thead><tr><th>Quando</th><th>Quem</th><th>Empresa</th><th>O que mudou</th><th>De → Para</th></tr></thead><tbody>${log.map((l) => `<tr><td class="num muted" style="white-space:nowrap">${fmtDH(l.criado_em)}</td><td>${esc(l.usuario)}</td><td>${esc(l.empresa_nome)} <span class="muted">· ${l.empresa_codigo}</span></td><td>${esc(l.tipo)}</td><td class="num">${esc(l.valor_de)} → <strong>${esc(l.valor_para)}</strong></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><strong>Nenhuma alteração ainda.</strong>Cada competência atualizada, OK do analista ou ciência de regime aparece aqui, com quem fez e quando.</div>`;
  }

  /* ---------------- ficha da empresa (gaveta) ---------------- */
  function abrirEmpresa(codigo) { S.sel = codigo; S.selHist = []; renderGaveta(); carregarHistoricoSel(); }
  async function carregarHistoricoSel() {
    const c = S.sel;
    try { const h = await S.api.historico({ empresa: c, limite: 10 }); if (S.sel === c) { S.selHist = h; renderGaveta(); } } catch (e) {}
  }
  function renderGaveta() {
    const root = $("#drawerRoot");
    const e = S.sel != null && S.empresas.find((x) => x.codigo === S.sel);
    if (!e) { root.innerHTML = ""; return; }
    const s = e.situacao;
    const podeOk = P.podeDarOk(S.eu, e);
    const coord = P.podeEditarPeriodicidade(S.eu);
    let sugestao = s.status === ST.ATRASADA ? s.primeira_pendente.competencia : s.proxima ? s.proxima.competencia : e.conciliado_ate || "";
    if (sugestao > mesAtual()) sugestao = mesAtual();
    const p = e.periodicidade || { tipo: "M", dia: 25, lag: 1 };
    root.innerHTML = `<div class="ov" id="ov"></div><aside class="drawer" role="dialog" aria-label="${esc(e.nome)}">
    <div class="dh"><div style="flex:1"><h2>${esc(e.nome)}</h2><div class="sub">Cód. ${e.codigo} · ${esc(e.regime || "")} · ${esc(e.plano || "")} · Carteira ${esc(carteira(e))}</div></div><button type="button" class="btn2 btn-s" id="fechar">Fechar</button></div>
    <div class="db">
      <div>${pill(e)}</div>
      ${!S.eu ? `<p class="msg err">Escolha seu nome em Você é, no topo da página, para registrar alterações.</p>` : ""}
      <div class="box"><h4>Competência conciliada</h4>
        <div class="kv"><span>Conciliado até</span><strong>${fmtC(e.conciliado_ate)}</strong></div>
        <div class="kv"><span>Periodicidade</span><span>${esc(R.descreverPeriodicidade(e.periodicidade))}</span></div>
        ${s.exigida ? `<div class="kv"><span>Exigido hoje</span><span>${fmtC(s.exigida.competencia)} (prazo ${fmtD(s.exigida.prazo)})</span></div><div class="kv"><span>Próxima</span><span>${fmtC(s.proxima.competencia)} (prazo ${fmtD(s.proxima.prazo)})</span></div>` : ""}
        <div class="row" style="margin-top:10px"><div class="fld"><label for="inConc">Conciliado até a competência</label><input type="month" id="inConc" max="${mesAtual()}" value="${sugestao}"></div><button type="button" class="btn" id="bConc">Salvar</button></div>
        <p class="msg" style="margin-top:6px">Pode voltar para uma competência anterior em caso de retificação.</p>
      </div>
      <div class="box"><h4>OK do analista <span class="muted" style="font-weight:400">${esc(e.analista || "")}</span></h4>
        <div class="kv"><span>Último OK</span><strong>${fmtC(e.conferido_ate)}</strong></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn" id="bOk" ${!podeOk || !e.conciliado_ate || e.conferido_ate === e.conciliado_ate ? "disabled" : ""}>Dar OK em ${fmtC(e.conciliado_ate)}</button></div>
        <p class="msg" style="margin-top:6px">${podeOk ? (e.conferido_ate === e.conciliado_ate ? "Esta competência já está conferida." : "Confirma que você verificou a conciliação até esta competência.") : "Só o analista da carteira ou a coordenação dá o OK."}</p>
      </div>
      <div class="box"><h4>Periodicidade <span class="muted" style="font-weight:400">coordenação</span></h4>
        <div class="row"><div class="fld"><label for="pTipo">Tipo</label><select id="pTipo" ${coord ? "" : "disabled"}><option value="">Sem regra</option><option value="M"${e.periodicidade && p.tipo === "M" ? " selected" : ""}>Mensal</option><option value="T"${e.periodicidade && p.tipo === "T" ? " selected" : ""}>Trimestral</option></select></div>
        <div class="fld"><label for="pDia">Dia-limite</label><input id="pDia" type="number" min="1" max="31" value="${p.dia}" ${coord ? "" : "disabled"}></div>
        <div class="fld"><label for="pLag">Meses depois</label><select id="pLag" ${coord ? "" : "disabled"}><option value="1"${p.lag === 1 ? " selected" : ""}>1 (mês seguinte)</option><option value="2"${p.lag === 2 ? " selected" : ""}>2 (2º mês seguinte)</option></select></div></div>
        ${coord ? `<button type="button" class="btn2 btn-s" id="bPer">Salvar periodicidade</button>` : `<p class="msg">Só a coordenação altera a periodicidade.</p>`}
      </div>
      <div class="box"><h4>Mudança de regime</h4>
        ${regimePendente(e) ? `<p class="msg">Pendente: ${esc(e.regime_alerta.anterior)} → ${esc(e.regime_alerta.novo)} a partir de ${fmtC(e.regime_alerta.desde)}. Dê ciência na aba Mudanças de regime.</p>` :
        `<div class="row"><div class="fld"><label for="rNovo">Novo regime</label><select id="rNovo">${["Simples", "Presumido", "Real"].filter((r) => r !== e.regime).map((r) => `<option>${r}</option>`).join("")}</select></div><div class="fld"><label for="rDesde">A partir de</label><input type="month" id="rDesde"></div><button type="button" class="btn2" id="bReg">Registrar</button></div>
        <p class="msg" style="margin-top:6px">Simula o aviso que virá do cadastro de clientes (Societário).</p>`}
      </div>
      <div class="box"><h4>Transferência ou baixada</h4>
        ${s.status === ST.ESPECIAL ? `<p class="msg">${esc(e.situacao_tipo)} em ${fmtD(e.situacao_data)}. Concluir até ${fmtD(s.limite_especial)}.</p>` :
        `<div class="row"><div class="fld"><label for="sTipo">Situação</label><select id="sTipo"><option>Transferência</option><option>Baixada</option></select></div><div class="fld"><label for="sData">Data</label><input type="date" id="sData"></div><button type="button" class="btn2" id="bSit">Marcar</button></div>`}
      </div>
      <div class="box"><h4>Histórico desta empresa</h4>
        ${S.selHist.length ? `<ul class="loglist">${S.selHist.map((l) => `<li><strong>${esc(l.usuario)}</strong> · ${esc(l.tipo)}: ${esc(l.valor_de)} → ${esc(l.valor_para)}<div class="sub">${fmtDH(l.criado_em)}</div></li>`).join("")}</ul>` : `<p class="msg">Nenhuma alteração registrada ainda. Os dados vieram da planilha.</p>`}
      </div>
    </div></aside>`;

    const fechar = () => { S.sel = null; renderGaveta(); };
    $("#ov").onclick = fechar; $("#fechar").onclick = fechar;
    $("#bConc").onclick = () => { const v = $("#inConc").value; if (!v) return toast("Escolha a competência."); acao(() => S.api.atualizarCompetencia(e.codigo, v), "Conciliado até " + fmtC(v) + " salvo."); };
    const bOk = $("#bOk"); if (bOk) bOk.onclick = () => acao(() => S.api.darOk(e.codigo), "OK registrado em " + fmtC(e.conciliado_ate) + ".");
    const bPer = $("#bPer"); if (bPer) bPer.onclick = () => {
      const t = $("#pTipo").value;
      const nova = t ? { tipo: t, dia: Number($("#pDia").value), lag: Number($("#pLag").value) } : null;
      acao(() => S.api.alterarPeriodicidade(e.codigo, nova), "Periodicidade salva.");
    };
    const bReg = $("#bReg"); if (bReg) bReg.onclick = () => { const d = $("#rDesde").value; if (!d) return toast("Informe a partir de qual competência."); acao(() => S.api.registrarMudancaRegime(e.codigo, $("#rNovo").value, d), "Mudança registrada. O colaborador da carteira vai ver o aviso."); };
    const bSit = $("#bSit"); if (bSit) bSit.onclick = () => { const d = $("#sData").value; if (!d) return toast("Informe a data."); const t = $("#sTipo").value; acao(() => S.api.marcarSituacao(e.codigo, t, d), "Empresa marcada como " + t.toLowerCase() + "."); };
  }

  /* ---------------- avisos ---------------- */
  let avisosCache = [];
  async function atualizarAvisos() {
    try { avisosCache = S.api && S.eu ? await S.api.avisos() : []; } catch (e) { avisosCache = []; }
    renderAvisos();
  }
  function renderAvisos() {
    $("#bellN").textContent = avisosCache.length;
    const pop = $("#pop"); if (pop.hidden) return;
    pop.innerHTML = !S.eu ? `<p class="msg">Escolha seu nome em Você é, no topo da página, para ver seus avisos.</p>`
      : avisosCache.length ? `<ul>${avisosCache.map((a, i) => `<li data-i="${i}">${esc(a.texto)}</li>`).join("")}</ul>` : `<p class="msg">Nenhum aviso para você agora.</p>`;
    pop.querySelectorAll("li").forEach((li) => (li.onclick = () => {
      const a = avisosCache[li.dataset.i]; pop.hidden = true;
      if (a.tipo === "atrasadas") { S.aba = "empresas"; S.kpi = ST.ATRASADA; S.escopo = "todas"; render(); }
      else abrirEmpresa(a.codigo);
    }));
  }

  /* ---------------- eventos ---------------- */
  $("#eu").innerHTML = `<option value="">Escolha seu nome</option>` + P.EQUIPE.map((n) => `<option${n === S.eu ? " selected" : ""}>${n}</option>`).join("");
  $("#eu").onchange = (ev) => { S.eu = ev.target.value; try { localStorage.setItem("fc_eu", S.eu); } catch (e) {} render(); atualizarAvisos(); };
  $("#tabs").onclick = (ev) => { const b = ev.target.closest("button"); if (!b) return; S.aba = b.dataset.t; try { localStorage.setItem("fc_aba", S.aba); } catch (e) {} render(); };
  $("#escopo").onclick = (ev) => { const b = ev.target.closest("button"); if (!b) return; S.escopo = b.dataset.v; if (S.escopo === "minha" && !S.eu) toast("Escolha seu nome em Você é, no topo da página."); render(); };
  $("#bell").onclick = (ev) => { ev.stopPropagation(); const p = $("#pop"); p.hidden = !p.hidden; atualizarAvisos(); };
  document.addEventListener("click", (ev) => { const p = $("#pop"); if (!p.hidden && !p.contains(ev.target)) p.hidden = true; });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && S.sel != null) { S.sel = null; renderGaveta(); } });
  $("#restaurar").onclick = () => { window.RepositorioDemo.restaurar(); location.reload(); };

  (async () => {
    S.api = await window.Api.conectar(() => S.eu);
    $("#demo").hidden = S.api.modo !== "demo";
    await recarregar();
    if (S.api.modo === "servidor") setInterval(() => { if (S.sel == null && document.visibilityState === "visible") recarregar(); }, 60000);
  })();
})();
