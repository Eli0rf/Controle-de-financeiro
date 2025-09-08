# Controle de Gastos - Backend

## Deploy no Railway

### Problema Resolvido: Canvas/ChartJS
O erro `invalid ELF header` relacionado ao canvas foi resolvido com as seguintes estratégias:

1. **Fallback Graceful**: O sistema agora funciona sem gráficos caso o canvas não esteja disponível
2. **Configuração Docker**: Dockerfile otimizado para instalar dependências nativas
3. **Dependências Opcionais**: Canvas movido para dependências opcionais

### Configuração das Variáveis de Ambiente

No Railway, configure as seguintes variáveis:

```
DB_HOST=seu_host_mysql
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=nome_do_banco
JWT_SECRET=sua_chave_secreta_jwt
NODE_ENV=production
```

### Deploy

1. Conecte o repositório ao Railway
2. Configure as variáveis de ambiente
3. O deploy será automático

### Funcionalidades

- ✅ API REST completa
- ✅ Autenticação JWT
- ✅ Upload de arquivos
- ✅ Relatórios PDF (com ou sem gráficos)
- ✅ Gastos recorrentes
- ✅ Health checks
- ✅ KPIs Mensais (API + Snapshots + Cache Redis)
- ✅ Scheduler automático de snapshots
- ✅ Detecção de anomalias (z-score)
- ✅ View SQL para integração BI (Metabase / Superset)

### Rotas Principais

- `GET /` - Health check principal
- `GET /health` - Status da aplicação
- `POST /api/login` - Login
- `POST /api/register` - Registro
- `GET /api/expenses` - Listar gastos
- `POST /api/expenses` - Criar gasto
- `GET /api/reports/weekly` - Relatório semanal
- `POST /api/reports/monthly` - Relatório mensal
- `GET /api/kpis/monthly` - KPIs do mês atual ou especificado (?year=YYYY&month=M&account=ALL)
- `GET /api/kpis/snapshots` - Lista snapshots salvos do ano (?year=YYYY)
- `POST /api/kpis/snapshot/refresh` - Gera/atualiza snapshot manualmente (body opcional {year,month})
- `GET /api/kpis/anomaly` - Detecção de anomalias por plano (parâmetros ?year&month)
- `GET /api/kpis/schema` - Metadados de integração BI

## Novos Módulos Analíticos

### 1. KPIs Mensais (`/api/kpis/monthly`)
Retorna objeto JSON com:
```
period { year, month, start, end }
totals { total, totalEmpresarial, totalPessoal, despesas }
distrib { porPlano, porConta, porDia }
comparativo [ { plano, atual, anterior, delta, deltaPct, share } ]
eficiencia { businessDaysInMonth, custoMedioDiaUtil, ticketMedioEmp }
outliers { mediaEmp, stdEmp, limiteOutlier, top:[...] }
projecao { isMesAtual, mediaDiariaGeral, projecao, crescimentoProj }
concentracao { hhi, hhiScaled, sharesTop }
```
Cache Redis (se configurado) por 5 minutos.

### 2. Snapshots Mensais
Armazenados na tabela `monthly_snapshots` (UPSERT idempotente). Campos resumidos: totais, distribuição por plano/conta (JSON), projeção, HHI. Úteis para consultas rápidas sem recálculo pesado.

### 3. Scheduler Automático
Job periódico (default cada 6h) varre todos usuários e salva snapshot do mês corrente. Controlado por variáveis:
```
SNAPSHOT_INTERVAL_HOURS=6
DISABLE_SCHEDULER=1  # desativa
```

### 4. Detecção de Anomalias (`/api/kpis/anomaly`)
Algoritmo z-score simples sobre últimos até 6 meses por plano:
- Marca anomalias com zScore >= 2
- Participação mínima no mês >= 5% do total
- Necessário ao menos 2 meses históricos além do atual
Retorno inclui threshold usado e lista ordenada por zScore.

### 5. Integração BI Externa
View `monthly_kpi_view` criada automaticamente:
```
SELECT * FROM monthly_kpi_view;
```
Colunas: user_id, username, year, month, total, total_business, total_personal, projection, hhi, created_at, updated_at.

Para granularidade diária / drill-down usar a tabela `expenses`.

### 6. Endpoint de Esquema (`/api/kpis/schema`)
Facilita exploração automática em ferramentas de BI listando colunas da view.

## Variáveis de Ambiente Adicionais
```
REDIS_URL=redis://usuario:senha@host:6379/0  # opcional
SNAPSHOT_INTERVAL_HOURS=6                    # intervalo do scheduler
DISABLE_SCHEDULER=0                          # 1 para desligar
JWT_SECRET=chave_super_secreta               # obrigatório para auth
```

## Fluxo Recomendado para Dashboards
1. Consumir `/api/kpis/monthly` para cards em tempo quase real (usa cache).
2. Para séries históricas, usar `monthly_kpi_view` ou `/api/kpis/snapshots`.
3. Exibir alertas usando `/api/kpis/anomaly` (z-score).
4. Programar coleta externa (Metabase) via conexão direta MySQL.

## Segurança & Performance
- Todas as novas rotas exigem JWT via header `Authorization: Bearer <token>`.
- Cache reduz leituras de banco quando Redis disponível.
- Snapshots evitam recálculo completo em análises históricas.
- Scheduler possui lock (`GET_LOCK`) para evitar concorrência múltipla.

## Exemplo de Consumo Rápido (fetch)
```
fetch('/api/kpis/monthly?year=2025&month=9', { headers:{ Authorization:`Bearer ${token}` }})
	.then(r=>r.json())
	.then(console.log);
```

## Próximas Extensões Sugeridas
- Isolation Forest (Python microservice) para anomalias mais sofisticadas
- KPI semanal derivado (rolling window)
- Limiares configuráveis por usuário (alertas customizados)
- Métricas de recorrência/duração de planos

