// Centralized plan ceilings (tetos) config to be used across API and reports
// Observação: estendido até o plano 47. Caso não haja teto definido, permanece 0.00.
const tetos = {
  1: 1000.0, 2: 2782.47, 3: 2431.67, 4: 350.0, 5: 2100.0,
  6: 550.0, 7: 270.0, 8: 1200.0, 9: 1200.0, 10: 270.0,
  11: 1895.4, 12: 2627.6, 13: 270.0, 14: 55.0, 15: 129.9,
  16: 59.9, 17: 4100.0, 18: 1570.0, 19: 500.0, 20: 500.0,
  21: 150.0, 22: 1134.0, 23: 500.0, 24: 1000.0, 25: 350.0,
  26: 1000.0, 27: 500.0, 28: 450.0, 29: 285.0, 30: 700.0,
  31: 200.0, 32: 450.0, 33: 100.0, 34: 54.8, 35: 0.0,
  36: 0.0, 37: 0.0, 38: 0.0, 39: 400.0, 40: 0.0,
  41: 0.0, 42: 0.0, 43: 210.0, 44: 0.0, 45: 12700.0,
  46: 1000.0, 47: 1000.0
};

function computeBudgetControlFromDistribution(porPlano = {}) {
  // Ensure all plans appear, even with zero spent
  const plans = Array.from(new Set([...Object.keys(tetos).map(String), ...Object.keys(porPlano)]))
    .sort((a, b) => parseInt(a) - parseInt(b));

  const perPlan = {};
  let overBudget = 0, atRisk = 0, withinBudget = 0, zeroCeiling = 0;

  plans.forEach((pl) => {
    const spent = Number(porPlano[pl] || 0);
    const ceiling = Number(tetos[pl] || tetos[parseInt(pl)] || 0);
    const percent = ceiling > 0 ? (spent / ceiling) * 100 : 0;

    // Status buckets
    let status = 'OK';
    if (ceiling === 0) {
      status = spent > 0 ? 'NO_CEILING_SPENT' : 'NO_CEILING';
      zeroCeiling += 1;
    } else if (percent > 100) {
      status = 'OVER_BUDGET';
      overBudget += 1;
    } else if (percent >= 95) {
      status = 'AT_RISK_95';
      atRisk += 1;
    } else if (percent >= 90) {
      status = 'AT_RISK_90';
      atRisk += 1;
    } else if (percent >= 80) {
      status = 'WATCH_80';
      withinBudget += 1;
    } else if (percent >= 70) {
      status = 'WATCH_70';
      withinBudget += 1;
    } else {
      status = 'OK';
      withinBudget += 1;
    }

    // Recommendation baseline
    let recommendation = null;
    if (status === 'OVER_BUDGET') recommendation = 'Bloquear novas despesas e revisar contratos/fornecedores.';
    else if (status === 'AT_RISK_95') recommendation = 'Congelar despesas neste plano até o fim do ciclo.';
    else if (status === 'AT_RISK_90') recommendation = 'Acompanhar diariamente e postergar despesas não críticas.';
    else if (status === 'WATCH_80' || status === 'WATCH_70') recommendation = 'Monitorar. Ajustes leves podem evitar riscos.';

    perPlan[pl] = {
      plan: pl,
      spent,
      ceiling,
      percent,
      status,
      recommendation
    };
  });

  // Decision insights
  const topRisks = Object.values(perPlan)
    .filter(p => ['OVER_BUDGET', 'AT_RISK_95', 'AT_RISK_90'].includes(p.status))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 5);

  const summary = { overBudget, atRisk, withinBudget, zeroCeiling };

  const insights = {
    topRisks,
    message: topRisks.length > 0
      ? 'Há planos acima ou próximos do teto. Ação corretiva recomendada.'
      : 'Todos os planos estão confortáveis em relação aos tetos.'
  };

  return { perPlan, summary, insights };
}

module.exports = { tetos, computeBudgetControlFromDistribution };
