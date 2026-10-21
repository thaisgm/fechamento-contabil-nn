-- Fechamento Contábil — estrutura do banco de dados
-- Escrito em SQL padrão. Roda como está no SQLite (usado para testar localmente).
-- Para PostgreSQL / MySQL / SQL Server, ver as notas no README (só muda o
-- auto-incremento do histórico e o tipo booleano).

-- Uma linha por empresa no controle de fechamento.
-- No NN HUB, `codigo` é o mesmo código do cadastro de clientes: o ideal é
-- ligar esta tabela ao cadastro (chave estrangeira) em vez de copiar nome,
-- regime e plano.
CREATE TABLE IF NOT EXISTS empresas (
  codigo                 INTEGER      PRIMARY KEY,
  nome                   VARCHAR(200) NOT NULL,
  grupo                  VARCHAR(100),
  plano                  VARCHAR(30),
  regime                 VARCHAR(20),              -- Simples | Presumido | Real

  -- Periodicidade do fechamento (NULL nos três = "sem regra definida")
  periodicidade_tipo     CHAR(1),                  -- 'M' mensal | 'T' trimestral
  periodicidade_dia      INTEGER,                  -- dia-limite (1..31)
  periodicidade_meses    INTEGER,                  -- meses depois da competência (1 ou 2)

  conciliado_ate         CHAR(7),                  -- competência 'AAAA-MM'
  conferido_ate          CHAR(7),                  -- último OK do analista 'AAAA-MM'

  -- Carteira (no NN HUB, vem do módulo Carteiras)
  colaborador            VARCHAR(60),
  analista               VARCHAR(60),
  observacao             TEXT,

  -- Transferência / baixada (prazo = situacao_data + 60 dias)
  situacao_tipo          VARCHAR(20),              -- 'Transferência' | 'Baixada'
  situacao_data          DATE,
  situacao_concluida     BOOLEAN      NOT NULL DEFAULT FALSE,
  situacao_concluida_em  DATE,

  -- Mudança de regime aguardando ciência do colaborador
  -- (no NN HUB, preenchida quando o Societário altera o cadastro de clientes)
  regime_anterior        VARCHAR(20),
  regime_novo            VARCHAR(20),
  regime_desde           CHAR(7),
  regime_ciencia_por     VARCHAR(60),
  regime_ciencia_em      TIMESTAMP,
  regime_exemplo         BOOLEAN      NOT NULL DEFAULT FALSE,

  atualizado_em          TIMESTAMP
);

-- Histórico: cada alteração feita na tela vira uma linha (quem, quando, o quê, de -> para).
CREATE TABLE IF NOT EXISTS historico (
  id             INTEGER      PRIMARY KEY AUTOINCREMENT,
  criado_em      TIMESTAMP    NOT NULL,
  usuario        VARCHAR(60)  NOT NULL,
  empresa_codigo INTEGER      NOT NULL REFERENCES empresas(codigo),
  tipo           VARCHAR(60)  NOT NULL,
  valor_de       VARCHAR(100),
  valor_para     VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_historico_empresa ON historico (empresa_codigo);
CREATE INDEX IF NOT EXISTS idx_historico_data    ON historico (criado_em);
