# Fluxos de Abas e Carregamentos

Este documento descreve, de forma visual, como a navegação por abas funciona no Dashboard e quais carregamentos específicos ocorrem em cada aba.

## Visão Geral da Navegação de Abas

```mermaid
flowchart LR
    A[.tab-button click] --> B{switchMainTab(tabName)}
    B --> C[Ativa botão: adiciona classe active]
    B --> D[Esconde todas .tab-content]
    B --> E[Mostra #${tabName}-tab]
    B --> F{Carregamento específico?}
    F -->|tabName === 'business-analysis'| G[loadBusinessAnalysis()]
    F -->|tabName === 'reports'| H[loadReportsData()]
    F -->|tabName === 'pix-boleto'| I[loadPixBoletoData()]
    F -->|outros| J[Log: aba ativada]
```

- A função `initializeTabs()` associa os cliques aos botões de aba e chama `switchMainTab()` para centralizar a troca.
- A aba inicial é ativada chamando `switchMainTab()` uma vez (evitando duplicidade de lógicas).

## Fluxo: Inicialização do Dashboard

```mermaid
sequenceDiagram
    participant UI as UI
    participant JS as dashboard.js
    participant API as Backend API

    UI->>JS: showDashboard()
    JS->>JS: initializeDashboard()
    JS->>JS: initializeTabs()
    JS->>JS: fetchAllData()
    JS->>API: GET /api/expenses
    JS->>API: GET /api/dashboard?year&month
    JS->>API: GET /api/expenses-goals?year&month
    API-->>JS: despesas, métricas, metas
    JS->>UI: Render KPIs e gráficos iniciais
```

## Fluxo: Aba Relatórios

```mermaid
sequenceDiagram
    participant UI as UI
    participant JS as dashboard.js
    participant API as Backend API

    UI->>JS: switchMainTab('reports')
    JS->>JS: loadReportsData()
    JS->>API: GET /api/expenses?year&month
    JS->>API: GET /api/dashboard?year&month
    JS->>JS: processCategoryData(expenses)
    JS->>UI: renderGoalsChart(expenses)
    JS->>UI: renderGoalsPlanChart(expenses)
    JS->>UI: renderPlanChart(categoryData)
    JS->>UI: updateMainIndicators(expenses)
    JS->>UI: generateAlertsTable(expenses)
```

## Fluxo: Aba PIX & Boleto (BI Recorrentes)

```mermaid
sequenceDiagram
    participant UI as UI
    participant JS as dashboard.js
    participant API as Backend API

    UI->>JS: switchMainTab('pix-boleto')
    JS->>JS: loadPixBoletoData()
    JS->>API: GET /api/recurring-pix-boleto
    API-->>JS: BI consolidado (ou vazio)
    JS->>JS: normalizeRecurringPixBoletoBI()
    alt Sem dados suficientes
        JS->>API: GET /api/recurring-expenses
        JS->>API: GET /api/expenses?account=PIX/Boleto
        JS->>JS: buildRecurringPixBoletoFallback()
    end
    JS->>UI: KPIs, gráficos e tabela recorrentes
```

## Fluxo: Aba Análise Empresarial

```mermaid
sequenceDiagram
    participant UI as UI
    participant JS as dashboard.js
    participant API as Backend API

    UI->>JS: switchMainTab('business-analysis')
    JS->>JS: loadBusinessAnalysis()
    JS->>API: GET /api/business/summary?year&month
    JS->>API: GET /api/business/trends?months=12
    JS->>API: GET /api/expenses (apoio)
    JS->>UI: Atualiza KPIs, gráficos e tabela empresarial
```

## Notas de Implementação

- A lógica de troca de abas foi centralizada em `switchMainTab()`. A `initializeTabs()` apenas registra handlers de clique e chama `switchMainTab()` para ativar a aba inicial.
- Foi adicionado um guard (`data-tab-init="1"`) para evitar múltiplos event listeners no caso de re-inicializações.
- Carregamentos específicos por aba são tratados condicionalmente dentro de `switchMainTab()`.
