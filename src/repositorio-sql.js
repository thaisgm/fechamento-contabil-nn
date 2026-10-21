/**
 * Repositório SQL: lê e grava empresas e histórico no banco.
 * Para testar localmente usa o SQLite que já vem no Node (node:sqlite), sem
 * instalar nada. No NN HUB, troque por uma conexão com o banco oficial
 * mantendo as mesmas 6 funções (ver shared/servico-fechamento.js).
 */
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// Colunas de empresas <-> campos do objeto usado pelo serviço
function linhaParaEmpresa(l) {
  if (!l) return null;
  return {
    codigo: l.codigo, nome: l.nome, grupo: l.grupo, plano: l.plano, regime: l.regime,
    periodicidade: l.periodicidade_tipo ? { tipo: l.periodicidade_tipo, dia: l.periodicidade_dia, lag: l.periodicidade_meses } : null,
    conciliado_ate: l.conciliado_ate, conferido_ate: l.conferido_ate,
    colaborador: l.colaborador, analista: l.analista, observacao: l.observacao,
    situacao_tipo: l.situacao_tipo, situacao_data: l.situacao_data,
    situacao_concluida: !!l.situacao_concluida, situacao_concluida_em: l.situacao_concluida_em,
    regime_alerta: l.regime_novo ? {
      anterior: l.regime_anterior, novo: l.regime_novo, desde: l.regime_desde,
      ciencia_por: l.regime_ciencia_por, ciencia_em: l.regime_ciencia_em, exemplo: !!l.regime_exemplo,
    } : null,
    atualizado_em: l.atualizado_em,
  };
}

function camposParaColunas(c) {
  const col = {};
  const direto = ["nome", "grupo", "plano", "regime", "conciliado_ate", "conferido_ate", "colaborador", "analista",
    "observacao", "situacao_tipo", "situacao_data", "situacao_concluida_em", "atualizado_em"];
  for (const k of direto) if (k in c) col[k] = c[k];
  if ("situacao_concluida" in c) col.situacao_concluida = c.situacao_concluida ? 1 : 0;
  if ("periodicidade" in c) {
    const p = c.periodicidade;
    col.periodicidade_tipo = p ? p.tipo : null;
    col.periodicidade_dia = p ? p.dia : null;
    col.periodicidade_meses = p ? p.lag : null;
  }
  if ("regime_alerta" in c) {
    const a = c.regime_alerta || {};
    col.regime_anterior = a.anterior || null; col.regime_novo = a.novo || null; col.regime_desde = a.desde || null;
    col.regime_ciencia_por = a.ciencia_por || null; col.regime_ciencia_em = a.ciencia_em || null;
    col.regime_exemplo = a.exemplo ? 1 : 0;
  }
  return col;
}

function abrirBanco(arquivo) {
  if (arquivo !== ":memory:") fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8"));
  return db;
}

/** Carga inicial: empresas da planilha + 3 exemplos de mudança de regime para teste. */
function cargaInicial(db, empresas, exemplosRegime) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM empresas").get().n;
  if (n > 0) return 0;
  const repo = criarRepositorio(db);
  repo.transacao(() => {
    for (const e of empresas) {
      const col = Object.assign({ codigo: e.codigo }, camposParaColunas(Object.assign({}, e, { regime_alerta: null })));
      const nomes = Object.keys(col);
      db.prepare(`INSERT INTO empresas (${nomes.join(", ")}) VALUES (${nomes.map(() => "?").join(", ")})`).run(...nomes.map((k) => col[k]));
    }
    for (const x of exemplosRegime || []) {
      repo.salvar(x.codigo, { regime_alerta: { anterior: x.anterior, novo: x.novo, desde: x.desde, exemplo: true } });
    }
  });
  return empresas.length;
}

function criarRepositorio(db) {
  let emTransacao = false;
  return {
    listar() {
      return db.prepare("SELECT * FROM empresas ORDER BY codigo").all().map(linhaParaEmpresa);
    },
    obter(codigo) {
      return linhaParaEmpresa(db.prepare("SELECT * FROM empresas WHERE codigo = ?").get(codigo));
    },
    salvar(codigo, campos) {
      const col = camposParaColunas(campos);
      const nomes = Object.keys(col);
      if (!nomes.length) return;
      db.prepare(`UPDATE empresas SET ${nomes.map((k) => k + " = ?").join(", ")} WHERE codigo = ?`).run(...nomes.map((k) => col[k]), codigo);
    },
    registrarHistorico(h) {
      db.prepare("INSERT INTO historico (criado_em, usuario, empresa_codigo, tipo, valor_de, valor_para) VALUES (?, ?, ?, ?, ?, ?)")
        .run(h.criado_em, h.usuario, h.empresa_codigo, h.tipo, h.valor_de, h.valor_para);
    },
    listarHistorico({ empresa, limite }) {
      const sql = `SELECT h.*, e.nome AS empresa_nome FROM historico h JOIN empresas e ON e.codigo = h.empresa_codigo
                   ${empresa ? "WHERE h.empresa_codigo = ?" : ""} ORDER BY h.id DESC LIMIT ?`;
      return db.prepare(sql).all(...(empresa ? [empresa, limite] : [limite]));
    },
    transacao(fn) {
      if (emTransacao) return fn();
      emTransacao = true;
      db.exec("BEGIN");
      try { const r = fn(); db.exec("COMMIT"); return r; }
      catch (err) { db.exec("ROLLBACK"); throw err; }
      finally { emTransacao = false; }
    },
  };
}

module.exports = { abrirBanco, cargaInicial, criarRepositorio };
