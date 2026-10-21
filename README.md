# Fechamento Contábil — protótipo para o NN HUB

Protótipo funcional da tela de **Fechamento Contábil** do departamento Contábil,
para substituir a planilha *CONTROLE FECHAMENTO DAS EMPRESAS*. Foi desenhado
pela Thais (Sucesso do Cliente) com a equipe do Contábil e programado com ajuda
do Claude. **Não é o sistema oficial:** serve para o desenvolvimento revisar e
levar o que fizer sentido para a base do NN HUB.

- Linguagem: **JavaScript (Node.js 22.5 ou mais novo)**
- Banco: **SQL** (o protótipo usa o SQLite que já vem no Node, então não precisa
  instalar nada; o esquema está em SQL padrão)
- **Sem dependências externas** (não precisa rodar `npm install`)

## Sobre os dados

Nesta versão pública, os **nomes das empresas foram trocados** por "Empresa Exemplo + código" e os grupos por letras. Códigos, regimes, periodicidades, competências e carteiras são os reais da planilha. O arquivo com os nomes reais está com a Thais.

## Ver a demonstração

A pasta `docs/` é a versão pronta para o GitHub Pages (Settings → Pages → Deploy from a branch → `main` / `/docs`). Para atualizar depois de mudar o código: `npm run demo` e copiar `_site/` para `docs/`.

## Como rodar

```bash
npm start   # abre em http://localhost:3000 (cria dados-locais/fechamento.db com a planilha)
npm test    # 30 testes: regras de prazo e API
npm run demo  # monta a versão sem servidor em _site/ (é a que vai para o GitHub Pages)
```

Para começar do zero, apague a pasta `dados-locais/`.

## O que a tela faz

| Função | Quem pode |
|---|---|
| Informar até qual competência a empresa está conciliada (pode voltar, em retificação) | Qualquer pessoa do Contábil |
| Dar o OK na competência conciliada | Analista da carteira ou coordenação |
| Definir a periodicidade (mensal/trimestral, dia-limite, meses depois) | Coordenação |
| Dar ciência de mudança de regime | Colaborador da carteira ou coordenação |
| Marcar e concluir transferência/baixada (prazo de 60 dias) | Contábil (no NN HUB: vem do cadastro) |
| Painel por regime (Simples, Presumido, Real) para a reunião de equipe | Coordenação (no NN HUB: + head e diretoria) |
| Histórico: quem mudou o quê, quando, de → para | Todos veem |
| Avisos: 5 dias antes do prazo (colaborador), atraso (coordenação), regime alterado (colaborador) | — |

## Regras de prazo

Todas em `shared/regras-fechamento.js` e testadas em `test/regras.test.js`.

- **Competência** é o mês contábil (`AAAA-MM`).
- **Periodicidade** = tipo + dia-limite + meses depois:
  - "Dia 25 de cada mês" → 09/2026 vence em 25/10/2026
  - "Até 10 do 2º mês subsequente" → 08/2026 vence em 10/10/2026
  - "Dia 30 fechamento do trimestre" → jul–set vence em 30/10/2026
  - Dia que não existe no mês → último dia do mês
- **Exigido hoje** = última competência cujo prazo já passou.
- **Atrasada**: conciliado até < exigido. Dias de atraso contam do prazo da primeira competência pendente.
- **Vencendo**: em dia, mas faltam 5 dias ou menos para o prazo da próxima competência.
- **Em dia · conferida**: em dia e com OK do analista numa competência igual ou posterior à exigida.
- **Em dia · conciliada**: em dia, sem esse OK.
- **Sem regra definida**: sem periodicidade. Não entra em atraso.
- **Transferida/baixada**: prazo fixo = data da situação + 60 dias.

Conferência: com a planilha em 21/10/2026, o cálculo dá 183 atrasadas, 5 vencendo,
45 em dia conciliadas, 9 conferidas, 46 sem regra e 16 transferidas/baixadas
em andamento (há um teste que confere esses números).

## Como o código está organizado

```
shared/                       ← roda igual no servidor e no navegador (o que mais vale levar)
  regras-fechamento.js        cálculo de prazos e status
  permissoes.js               quem pode fazer o quê
  servico-fechamento.js       cada ação: valida, grava e registra no histórico
src/
  server.js                   rotas HTTP (http do Node; em Express é 1 linha por rota)
  repositorio-sql.js          SQL de leitura/gravação (troque pela conexão oficial)
db/schema.sql                 tabelas empresas e historico
data/
  empresas-carga-inicial.json 304 empresas da planilha (288 ativas + 16 transferências/baixadas em andamento)
  exemplos-regime.json        3 mudanças de regime reais (das observações da planilha) para teste
public/                       telas (HTML, CSS e JavaScript sem framework)
  js/api.js                   cliente da API; sem servidor, entra em modo demonstração
  js/repositorio-demo.js      só para a demonstração no GitHub Pages (localStorage)
test/                         testes (node:test)
```

O serviço recebe um **repositório** com 6 funções (`listar`, `obter`, `salvar`,
`registrarHistorico`, `listarHistorico`, `transacao`). Para ligar no banco
oficial, basta escrever esse repositório.

## API

Todas as alterações exigem o cabeçalho `X-Usuario` (nome da pessoa). **No NN HUB,
troque pelo usuário logado.**

| Método | Rota | Corpo |
|---|---|---|
| GET | `/api/empresas` | — |
| GET | `/api/empresas/:codigo` | — |
| PUT | `/api/empresas/:codigo/competencia` | `{ "competencia": "2026-09" }` |
| POST | `/api/empresas/:codigo/ok` | — |
| PUT | `/api/empresas/:codigo/periodicidade` | `{ "periodicidade": { "tipo": "M", "dia": 25, "lag": 1 } }` ou `null` |
| POST | `/api/empresas/:codigo/regime` | `{ "novo": "Presumido", "desde": "2026-02" }` |
| POST | `/api/empresas/:codigo/regime/ciencia` | — |
| POST | `/api/empresas/:codigo/situacao` | `{ "tipo": "Transferência", "data": "2026-10-01" }` |
| POST | `/api/empresas/:codigo/situacao/concluir` | — |
| GET | `/api/historico?empresa=664&limite=50` | — |
| GET | `/api/painel` | — |
| GET | `/api/avisos` | — |

Erros voltam como `{ "erro": "mensagem" }` com status 400, 403 ou 404.

## Para levar ao NN HUB (o que o protótipo não faz)

1. **Login e permissões:** usar o usuário logado no lugar de `X-Usuario` e a
   permissão do sistema no lugar das listas em `shared/permissoes.js`
   (painel: coordenação, head e diretoria).
2. **Cadastro de clientes:** ligar `empresas.codigo` ao cadastro (os códigos são
   os mesmos). Empresa ativada no cadastro deve entrar sozinha no fechamento,
   como "sem regra definida" até a coordenação definir a periodicidade.
3. **Carteiras:** colaborador e analista devem vir do módulo Carteiras.
4. **Mudança de regime:** criar o alerta quando o Societário alterar o regime no
   cadastro (hoje é registrado na ficha da empresa).
5. **Notificações:** rodar `servico.avisos(usuario)` uma vez por dia e mandar
   para a central de notificações.
6. **AC Docs:** coluna "Docs da competência" ainda não ligada.
7. **Banco oficial:** ajustar `db/schema.sql` ao banco usado:
   - PostgreSQL: `id SERIAL PRIMARY KEY` no histórico; `BOOLEAN` funciona como está.
   - MySQL: `id INT AUTO_INCREMENT PRIMARY KEY`; `TIMESTAMP` → `DATETIME`.
   - SQL Server: `id INT IDENTITY(1,1) PRIMARY KEY`; `BOOLEAN` → `BIT`; `TEXT` → `NVARCHAR(MAX)`.
8. **Carga inicial:** `data/empresas-carga-inicial.json` já está limpo (textos
   padronizados, periodicidade convertida, datas inválidas de "Conferido"
   descartadas). A coluna "Balanço fechado 2025" não foi usada: o balanço é
   fechado pelo analista em dezembro, junto das competências do ano.

## Fora do escopo do MVP

- Guardar a foto diária dos números para comparar reuniões (combinado: depois).
- Exportar para Excel (combinado: não precisa).
