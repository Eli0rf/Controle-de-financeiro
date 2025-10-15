## Visão geral do sistema

Aplicação full-stack de controle financeiro:

- Backend: Node.js/Express (server.js) com MySQL (mysql2), JWT para autenticação, multer para upload de faturas, pdfkit para relatórios PDF, ChartJSNodeCanvas opcional para gráficos, Twemoji opcional, e Redis (ioredis) opcional para cache.
- Frontend: HTML/CSS/JS puro em `DeMarchi/FrontEnd` usando Chart.js e chamadas REST ao backend hospedado no Railway.
- Infra: Railway (Dockerfile, railway.toml), variáveis de ambiente para DB/Redis/JWT.

URLs padrão de produção (ajuste conforme seu deploy):

- Backend: https://backend-production-a867.up.railway.app
- Frontend: https://controle-de-financeiro-production.up.railway.app


## Arquitetura e módulos

- `backend/server.js`: ponto de entrada Express. Define CORS, health-check, autenticação, rotas de despesas, BI/KPIs, relatórios PDF, gastos recorrentes e inicializa scheduler.
- `backend/config/database.js`: cria pool MySQL a partir de env (Railway ou local). Função `testConnection`.
- `backend/migrations/migrate.js`: cria/ajusta tabelas e índices (idempotente). Atualiza ENUM de `account` para incluir `PIX/Boleto`. Tabelas principais: `users`, `expenses`, `recurring_expenses`, `recurring_expense_processing`, `monthly_snapshots`.
- `backend/middleware/authMiddleware.js`: middleware `authenticateToken` (JWT em Bearer Authorization).
- `backend/reporting/monthlyKpis.js`: cálculo de KPIs mensais (totais, distribuição, projeção, HHI, outliers), snapshots e análises (tendência e comparativo) para endpoints de BI.
- `backend/analytics/anomalyDetector.js`: z-score por plano nos últimos 6 meses (anomalies v1).
- `backend/schedulers/kpiScheduler.js`: job periódico (6h por padrão) para salvar snapshots KPIs por usuário (com GET_LOCK para evitar concorrência).
- `backend/utils/redisClient.js`: inicialização lazy de Redis via `REDIS_URL` (cache de respostas em endpoints de BI/KPI).
- `FrontEnd/Dashboard.html` + `dashboard.js`: UI, filtros, gráficos, login, uploads, relatórios, BI recorrente; `config.js` define `API_BASE_URL` etc.


## Autenticação e CORS

- Registro: `POST /api/register` { username, password }
- Login: `POST /api/login` { username, password } → responde `{ accessToken }` (JWT 8h)
- Proteção: include `Authorization: Bearer <token>` em todas as rotas protegidas.
- CORS: Origem permitida para domínios do frontend no Railway; preflight OPTIONS respondido imediatamente. Headers expostos incluem `Content-Disposition` para downloads.


## Modelo de dados (MySQL)

Tabela `users`:
- id, username (único), password (bcrypt), created_at.

Tabela `expenses` (gastos):
- id, user_id (FK users), transaction_date (DATE), amount (DECIMAL), description (VARCHAR), category (opcional),
- account (ENUM: 'Nu Bank Ketlyn','Nu Vainer','Ourocard Ketlyn','PicPay Vainer','PIX','Boleto','PIX/Boleto'),
- is_business_expense (TINYINT), account_plan_code (INT, plano de contas numérico), has_invoice (TINYINT), invoice_path (VARCHAR),
- total_purchase_amount, installment_number, total_installments (parcelas),
- is_recurring_expense (TINYINT), recurring_expense_id (FK opcional), created_at.

Tabela `recurring_expenses` (configuração de recorrentes):
- id, user_id, description, amount, account (apenas 'PIX/Boleto' permitida nas APIs), account_plan_code, is_business_expense,
- day_of_month (int), is_active, timestamps.

Tabela `recurring_expense_processing` (controle de processamento mensal):
- id, recurring_expense_id, processed_month (YYYY-MM), expense_id, processed_at. Unique por (recurring_expense_id, processed_month).

Tabela `monthly_snapshots` (KPI mensal agregado por usuário):
- user_id, year, month, total, total_business, total_personal, by_plan (JSON), by_account (JSON), projection, hhi, bi_insights, recommendations.
- View auxiliar criada: `monthly_kpi_view` (join com users) para ferramentas de BI externas.

Migrações: rodadas automaticamente ao iniciar (`createDatabase()`), incluindo criação/ajuste de colunas/índices e unificação retroativa de contas 'PIX'/'Boleto' → 'PIX/Boleto'.


## Lógica de faturamento por conta

Algumas contas têm período de fatura não alinhado ao mês civil. Em `server.js`:

- billingPeriods: mapa com `startDay`, `endDay` e `isRecurring` (quando true usa mês civil). Exemplos:
  - 'Nu Bank Ketlyn' e 'Nu Vainer': 2 → 1 (cruza meses)
  - 'Ourocard Ketlyn': mês civil (isRecurring true)
  - 'PIX/Boleto': mês civil (isRecurring true) e é a conta unificada

Filtros de `/api/expenses` respeitam esse período quando `account`, `year` e `month` são fornecidos e a conta não é marcada como `isRecurring`.


## Fluxos principais da API

Saúde e info:
- GET `/health` → 200 e ping no DB
- GET `/` → texto simples "Aplicação rodando!"
- GET `/api/health/pdf-dependencies` → diagnóstico (ChartJS, pdfkit, twemoji, fontes)

Autenticação:
- POST `/api/register` | POST `/api/login` → ver seção Autenticação

Despesas (CRUD e consultas):
- POST `/api/expenses` (multipart) cria despesas; suporta upload de fatura `invoice`, parcelas via `total_installments` (n registros),
  normaliza conta 'PIX'/'Boleto' para 'PIX/Boleto'. Regra: sem `account_plan_code` ⇒ classifica como empresarial automaticamente.
- GET `/api/expenses` com filtros: `year`, `month`, `account`, `start_date`, `end_date`, `include_recurring`;
  respeita períodos de faturamento (billingPeriods) e mês civil.
- GET `/api/expenses/history` multi-mês; se `aggregate=true` retorna agregação mensal.
- GET `/api/expenses/:id` | PUT `/api/expenses/:id` | DELETE `/api/expenses/:id` (atualização também segue regra de plano/empresarial e normaliza conta).
- GET `/api/invoice/:id` download seguro da fatura do usuário.
- GET `/api/accounts` lista de contas distintas do usuário.
- GET `/api/account-plans` lista estática de planos (IDs e nomes base).

Relatórios e dashboards (dados agregados):
- GET `/api/dashboard` → projeção próximo mês, evolução diária, pie por conta, comparativo Pessoal vs Empresarial, bar por plano.
- GET `/api/reports/monthly` (JSON por conta) e GET `/api/reports/weekly` (JSON por período)
- POST `/api/reports/weekly` (PDF semanal com gráficos via ChartJSNodeCanvas)
- POST `/api/reports/monthly` (PDF BI completo; gera gráficos se ChartJS disponível; possui fallbacks simplificados)

Tetos e alertas por plano:
- GET `/api/expenses-goals` aceita `year`, `month`, `account` e retorna totais vs tetos (`tetos` fixo por PlanoContasID) + alertas (50%, 70%, 80%, 85%, 90%, 95%, 100%, 101%).

Conta unificada PIX/Boleto:
- GET `/api/expenses/pix-boleto` com `year`, `month` → resumo e lista apenas dessa conta. Startup roda `ensurePixBoletoUnification()` para unificar dados legados.

Recorrentes (somente `account='PIX/Boleto'` nas APIs):
- POST `/api/recurring-expenses` cria; GET lista; PUT atualiza; DELETE desativa.
- POST `/api/recurring-expenses/process` gera lançamentos do mês (`YYYY-MM`) conforme `day_of_month` e marca processamento em `recurring_expense_processing`.

KPIs mensais e BI:
- GET `/api/kpis/monthly` → cálculo on-demand (cacheável em Redis por 5min) e snapshot assíncrono.
- GET `/api/kpis/snapshots` lista snapshots de um ano; GET `/api/kpis/schema` (esquema/metadados p/ BI externo)
- POST `/api/kpis/snapshot/refresh` força snapshot do mês.
- GET `/api/kpis/anomaly` → anomalias por z-score (>= 2, share >= 5%) nos últimos 6 meses.

Análises de BI:
- GET `/api/bi/trends?months=12` → série temporal de KPIs; cache Redis 30min.
- GET `/api/bi/concentration` → pareto por plano, top contas, HHI escalado e insights.
- GET `/api/bi/executive-dashboard` → resumo executivo (mudanças m/m, riscos, eficiência, alerts)
- GET `/api/bi/performance` → real vs metas (tabela `expense_goals` se existente)
- GET `/api/bi/full-report` → pacote consolidado (trends, concentração, dashboard, performance, anomalias)
- GET `/api/bi/executive-report` → relatório executivo consolidado (usa `generateExecutiveReport`)
- GET `/api/bi/comparative` → comparação entre períodos (mês atual vs referência)


## Cálculo de KPIs (monthlyKpis.js)

Entrada: `{ pool, userId, year, month, account }`.

Saída (principais campos):
- `totals`: total, totalEmpresarial, totalPessoal, despesas (count)
- `distrib`: porPlano, porConta, porDia
- `projecao`: média diária do mês, projeção até fim do mês, crescimento projetado
- `concentracao`: HHI (top5 shares), pareto por plano e `pareto80Count`
- `eficiencia`: dias úteis, custo médio por dia útil, ticket médio empresarial, taxa de utilização
- `outliers`: média/STD e top outliers empresariais (média + 1 desvio)
- `comparativo`: atual vs mês anterior por plano (valor, delta, delta%)
- `businessIntelligence`: insights (risco concentração, padrão temporal, etc.) e recomendações automáticas
- Snapshots: persistidos em `monthly_snapshots` (idempotente) com JSONs de distribuição e insights


## Geração de PDFs

- `pdfkit` para compor relatórios (seções, cards, tabelas, gráficos embutidos). Quando `chartjs-node-canvas` não estiver disponível (ex.: ambientes restritos), há fallbacks textuais/compactos.
- Twemoji opcional para ícones consistentes (cache em `emoji-cache`). Fonte `NotoSans-Regular.ttf` embutida no repo para melhor cobertura unicode.


## Cache (Redis)

- Opcional via `REDIS_URL` ou `REDIS_CONNECTION_STRING`. Usado em `/api/kpis/monthly`, BI trends/executive para reduzir recomputo.


## Frontend (Dashboard)

- `Dashboard.html` inclui Bootstrap/Tailwind/Chart.js e diversos modais. `dashboard.js` implementa:
  - Login e armazenamento do token; fetch autenticado; filtros de ano/mês/conta; CRUD de despesas + upload de faturas; geração de relatórios.
  - Gráficos principais: evolução diária, pizza por conta, barras por plano, comparativo Pessoal vs Empresarial, metas/alertas.
  - Análises: projeção por plano (contagem), BI recorrentes (PIX/Boleto), IR (relatório interativo), exportações.
- `config.js` define `API_BASE_URL` e ajustes visuais.


## Execução local

Pré-requisitos: Node >= 18, MySQL acessível localmente (ou URL do Railway), opcional Redis.

1) Backend
- Copie `.env.example` para `.env` e configure: `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME` (ou variáveis Railway), `JWT_SECRET`, opcional `REDIS_URL`.
- Instale deps e rode o servidor:

```
npm --prefix DeMarchi/backend install
npm --prefix DeMarchi/backend start
```

2) Frontend
- Abra `DeMarchi/FrontEnd/Dashboard.html` no navegador (ou sirva via um servidor estático). Ajuste `API_BASE_URL` em `config.js` se necessário.

Task no VS Code: "Executar Servidor Backend" já configurada para `cd DeMarchi/backend && npm start`.


## Observações e edge cases

- Regras de classificação: sem `account_plan_code` ⇒ marca como empresarial (is_business_expense=1) automaticamente.
- Normalização de contas legadas: entradas 'PIX' e 'Boleto' são unificadas para 'PIX/Boleto' em startup e nos endpoints de escrita.
- Parcelas: `POST /api/expenses` cria N registros com datas incrementando mês a mês; apenas a primeira parcela carrega a fatura (has_invoice/invoice_path).
- CORS: em ambientes com proxies/CDNs, confira o header `Origin` e a lista `allowedOrigins` no início do `server.js`.
- Ambientes sem ChartJS/canvas nativo (ex.: Railway sem build do canvas): PDFs continuam com fallbacks textuais/numéricos.
- Scheduler: pode ser desativado com `DISABLE_SCHEDULER=1`; intervalo ajustável via `SNAPSHOT_INTERVAL_HOURS`.


## Próximos passos sugeridos

- Centralizar nomes e limites de planos de contas em uma tabela (hoje `tetos` é literal no código) e oferecer CRUD.
- Completar/limpar rotas em `backend/routes/*` (arquivos vazios para futura modularização).
- Adicionar testes básicos (ex.: autenticação, CRUD de despesas, endpoints de BI) e GitHub Actions.
- Habilitar paginação/limites nos endpoints de listagem para volumes maiores.


## Lógica de PIX/Boletos recorrentes (detalhada)

Objetivo: permitir o cadastro de despesas recorrentes específicas para a conta unificada `PIX/Boleto` e gerar automaticamente os lançamentos mensais.

Entidades envolvidas:
- `recurring_expenses`: configuração do recorrente (descrição, valor, conta, plano de contas opcional, dia do mês, flag empresarial, ativo).
- `recurring_expense_processing`: controle de idempotência por mês (`processed_month = 'YYYY-MM'`) para cada recorrente, relacionando o `expense_id` criado.
- `expenses`: onde os lançamentos do mês são materializados com `is_recurring_expense = 1` e `recurring_expense_id` preenchido.

Criação/gestão (APIs):
- POST `/api/recurring-expenses` cria um recorrente. Regra de negócio: conta deve ser exatamente `'PIX/Boleto'` (as demais contas são rejeitadas pela API, embora o ENUM permita valores legados por compatibilidade). Campos comuns: `description`, `amount`, `account_plan_code` (opcional), `is_business_expense`, `day_of_month`.
- GET `/api/recurring-expenses` lista os recorrentes ativos do usuário (ordem decrescente de criação).
- PUT `/api/recurring-expenses/:id` atualiza campos do recorrente.
- DELETE `/api/recurring-expenses/:id` apenas marca `is_active = 0` (não apaga histórico).

Processamento mensal (geração de lançamentos):
- Endpoint: POST `/api/recurring-expenses/process` com `{ year, month }` (numéricos).
- Seleção: busca todos os `recurring_expenses` ativos do usuário que ainda não possuem registro em `recurring_expense_processing` para aquele `processed_month` (LEFT JOIN) — isso garante idempotência.
- Data de lançamento: `new Date(year, month-1, day_of_month)`. Se o dia escolhido não existir no mês (ex.: 31/02), o código ajusta automaticamente para o último dia útil do mês via `setDate(0)` (cai para o último dia do mês anterior do objeto Date, que neste caso é o último dia do mês alvo real).
- Inserção em `expenses`: cria o gasto com `is_recurring_expense = 1`, `recurring_expense_id = <id>` e os demais campos herdados do recorrente.
- Registro de processamento: insere em `recurring_expense_processing (recurring_expense_id, processed_month, expense_id)`; existe `UNIQUE (recurring_expense_id, processed_month)`, reforçando a idempotência.

Listagem e filtros (visão do usuário):
- GET `/api/expenses` tem regra específica para `PIX/Boleto`:
  - Por padrão, se `account = 'PIX/Boleto'` e não for informado `start_date/end_date`, despesas recorrentes são filtradas (adiciona `AND is_recurring_expense = 0`).
  - Para incluir recorrentes no resultado, envie `include_recurring=true` no querystring, ou utilize um intervalo explícito `start_date` e `end_date`.
  - Outras contas não têm recorrentes geradas por API (o sistema restringe a criação de recorrentes a `PIX/Boleto`).

Normalização e legado:
- Em startup, `ensurePixBoletoUnification()` unifica registros antigos de `expenses` e `recurring_expenses` onde `account` seja `'PIX'` ou `'BOLETO'` para `'PIX/Boleto'`.
- A criação/edição manual de despesas (`/api/expenses` e `PUT /api/expenses/:id`) também normaliza conta `'PIX'`/`'Boleto'` para `'PIX/Boleto'`.

Impacto nos KPIs/BI:
- Lançamentos recorrentes são tratadas como despesas normais no mês, logo entram em todos os agregados (totais, distribuição por plano/conta, projeções, HHI, etc.).
- O filtro `include_recurring` afeta apenas a listagem do endpoint `/api/expenses` para conveniência de navegação no frontend.

Uso no frontend:
- `dashboard.js` expõe UI para cadastrar/editar/listar recorrentes e possui um botão para acionar o processamento mensal (via `/api/recurring-expenses/process`). O dashboard também oferece gráficos/relatórios considerando a conta unificada.

Erros comuns e dicas:
- Tentar criar recorrente com `account != 'PIX/Boleto'` → 400 (a API rejeita).
- Processar mais de uma vez o mesmo mês → itens já processados são ignorados (JOIN + UNIQUE). Se alterar o valor do recorrente após processar, é preciso ajustar manualmente ou processar meses seguintes.
