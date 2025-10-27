// Centraliza limites/limiares para insights, alertas e cores de uso de teto
module.exports = {
  // Uso de teto (orçamento por plano)
  budgetHighUsageYellow: 80,   // >= amarelo
  budgetHighUsageRed: 100,     // > vermelho

  // Insights (resumo e páginas internas)
  insights: {
    avgTransactionHigh: 400,   // média por transação considerada alta
    avgTransactionLow: 70,     // média por transação considerada baixa
    distributedMinPct: 75,     // % de dias com gastos para ser "distribuído"
    concentratedMaxPct: 35     // % de dias com gastos para ser "concentrado"
  },

  // Alertas (resumo e páginas internas)
  alerts: {
    largeTransactionShare: 0.25,     // >25% do total em uma única transação
    personalProportionHigh: 75,      // >75% do total pessoal
    highTransactionsPerDay: 12,      // >12 transações/dia
    monthlyChangeHigh: 25,           // >25% variação m/m
    projectionHighGrowth: 20,        // >20% projeção de crescimento
    hhiVeryHigh: 0.30                // HHI muito alto
  },

  // KPIs/BI (monthlyKpis)
  kpis: {
    hhiHigh: 0.25,           // nível alto de concentração
    hhiMedium: 0.15,         // nível médio de concentração
    pareto80HighMax: 3,      // até 3 categorias para atingir 80% → ALTA necessidade
    pareto80MediumMax: 5,    // até 5 → MÉDIA necessidade
    spendingPatternDistributed: 0.70,  // >=70% dias com gasto
    spendingPatternIrregular: 0.50     // <50% dias com gasto
  }
};
