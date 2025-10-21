const computeMonthlyKPIs = async ({ pool, userId, year, month, account }) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  let sql = `SELECT id, amount, account_plan_code, account, is_business_expense, transaction_date, description FROM expenses WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?`;
  const params = [userId, startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10)];
  if (account && account !== 'ALL') { sql += ' AND account = ?'; params.push(account); }
  sql += ' ORDER BY transaction_date';
  const [expenses] = await pool.query(sql, params);
  if (!expenses.length) return { expenses: [], message: 'SEM_DADOS', year, month };

  const empresariais = expenses.filter(e => e.is_business_expense === 1 || e.is_business_expense === true);
  const pessoais = expenses.filter(e => e.is_business_expense === 0 || e.is_business_expense === false || e.is_business_expense === null).filter(e => !empresariais.find(b=> b.id===e.id));
  const total = expenses.reduce((s,e)=> s + parseFloat(e.amount), 0);
  const totalEmpresarial = empresariais.reduce((s,e)=> s + parseFloat(e.amount), 0);
  const totalPessoal = pessoais.reduce((s,e)=> s + parseFloat(e.amount), 0);

  const porPlano = {}; const porConta = {}; const porDia = {};
  expenses.forEach(e => { const p=e.account_plan_code || 'Sem Plano'; const c=e.account || 'Sem Conta'; const d=new Date(e.transaction_date).getDate(); porPlano[p]=(porPlano[p]||0)+parseFloat(e.amount); porConta[c]=(porConta[c]||0)+parseFloat(e.amount); porDia[d]=(porDia[d]||0)+parseFloat(e.amount); });

  // Mês anterior
  const prevMonth = month === 1 ? 12 : month - 1; const prevYear = month === 1 ? year - 1 : year;
  const prevStart = new Date(prevYear, prevMonth - 1, 1); const prevEnd = new Date(prevYear, prevMonth, 0);
  const [prevExpenses] = await pool.query(`SELECT amount, account_plan_code FROM expenses WHERE user_id=? AND transaction_date>=? AND transaction_date<=?`, [userId, prevStart.toISOString().slice(0,10), prevEnd.toISOString().slice(0,10)]);
  const prevByPlan = {}; prevExpenses.forEach(e=> { const p=e.account_plan_code || 'Sem Plano'; prevByPlan[p]=(prevByPlan[p]||0)+parseFloat(e.amount); });

  const totalAtual = total || 1; const currByPlan = { ...porPlano };
  const planosUnion = Array.from(new Set([...Object.keys(currByPlan), ...Object.keys(prevByPlan)])).sort((a,b)=> parseInt(a)-parseInt(b));
  const comparativo = planosUnion.map(pl=> { const a=currByPlan[pl]||0; const b=prevByPlan[pl]||0; const delta=a-b; const deltaPct = b===0 ? (a>0?100:0) : (delta/b*100); return { plano: pl, atual: a, anterior: b, delta, deltaPct, share: (a/totalAtual)*100 }; });

  // Eficiência
  const businessDaysInMonth = Array.from({length: endDate.getDate()},(_,i)=> new Date(year, month-1, i+1)).filter(d=> d.getDay()!=0 && d.getDay()!=6).length;
  const custoMedioDiaUtil = businessDaysInMonth? totalEmpresarial / businessDaysInMonth : totalEmpresarial;
  const ticketMedioEmp = empresariais.length ? totalEmpresarial / empresariais.length : 0;

  // Outliers (média + 1 desvio)
  const empValores = empresariais.map(e=> parseFloat(e.amount));
  const mediaEmp = empValores.length? empValores.reduce((a,b)=>a+b,0)/empValores.length : 0;
  const stdEmp = empValores.length? Math.sqrt(empValores.reduce((s,v)=> s + Math.pow(v-mediaEmp,2),0)/empValores.length) : 0;
  const limiteOutlier = mediaEmp + stdEmp;
  const outliers = empresariais.filter(e=> parseFloat(e.amount)>limiteOutlier).sort((a,b)=> parseFloat(b.amount)-parseFloat(a.amount)).slice(0,3).map(o=>({ id:o.id, date:o.transaction_date, amount:parseFloat(o.amount), plan:o.account_plan_code, account:o.account }));

  // Projeção
  const diasComGasto = Object.keys(porDia).length;
  const mediaDiariaGeral = diasComGasto ? total / diasComGasto : total;
  const hoje = new Date(); const isMesAtual = hoje.getFullYear()===year && (hoje.getMonth()+1)===month;
  const projecao = isMesAtual ? (mediaDiariaGeral * endDate.getDate()) : total;
  const crescimentoProj = total ? ((projecao - total)/ total)*100 : 0;

  // Concentração HHI top 5
  const sharesTop = Object.values(porPlano).sort((a,b)=>b-a).slice(0,5).map(v=> v/totalAtual);
  const hhi = sharesTop.reduce((s,sh)=> s + Math.pow(sh,2),0);

  // ====== INTEGRAÇÃO DE BUSINESS INTELLIGENCE ======
  
  // Análise de concentração expandida
  const planAnalysis = Object.entries(porPlano)
    .map(([plan, amount]) => ({ plan, amount: parseFloat(amount) }))
    .sort((a, b) => b.amount - a.amount);
  
  let cumulativeShare = 0;
  const paretoAnalysis = planAnalysis.map((item, index) => {
    const share = totalAtual > 0 ? (item.amount / totalAtual) : 0;
    cumulativeShare += share;
    return {
      rank: index + 1,
      plan: item.plan,
      amount: item.amount,
      share: share * 100,
      cumulativeShare: cumulativeShare * 100,
      isPareto80: cumulativeShare <= 0.8
    };
  });

  const pareto80Count = paretoAnalysis.filter(p => p.isPareto80).length;
  
  // Análise de eficiência expandida
  const efficiencyMetrics = {
    businessDaysInMonth,
    custoMedioDiaUtil,
    ticketMedioEmp,
    costPerTransaction: empresariais.length > 0 ? totalEmpresarial / empresariais.length : 0,
    utilizedDays: Object.keys(porDia).length,
    utilizationRate: businessDaysInMonth > 0 ? (Object.keys(porDia).length / businessDaysInMonth) * 100 : 0
  };

  // Insights de BI automatizados
  const biInsights = {
    concentrationLevel: hhi > 0.25 ? 'ALTA' : hhi > 0.15 ? 'MÉDIA' : 'BAIXA',
    diversificationNeed: pareto80Count <= 3 ? 'ALTA' : pareto80Count <= 5 ? 'MÉDIA' : 'BAIXA',
    spendingPattern: diasComGasto < businessDaysInMonth * 0.7 ? 'CONCENTRADO' : 'DISTRIBUÍDO',
    efficiencyTrend: custoMedioDiaUtil > 0 ? 'CALCULADO' : 'INSUFICIENTE',
    riskFactors: {
      highConcentration: hhi > 0.25,
      fewActiveCategories: pareto80Count <= 3,
      irregularSpending: diasComGasto < businessDaysInMonth * 0.5,
      highDailyCost: custoMedioDiaUtil > totalEmpresarial * 0.1 // 10% do total em um dia
    }
  };

  // Recomendações automáticas
  const recommendations = [];
  if (hhi > 0.25) {
    recommendations.push({
      type: 'DIVERSIFICATION',
      priority: 'HIGH',
      message: 'Alta concentração em poucos planos de conta',
      action: 'Redistribuir orçamento entre mais categorias'
    });
  }
  
  if (pareto80Count <= 3) {
    recommendations.push({
      type: 'BUDGET_PLANNING',
      priority: 'MEDIUM',
      message: '80% dos gastos concentrados em apenas 3 categorias',
      action: 'Revisar distribuição orçamentária'
    });
  }

  if (crescimentoProj > 20) {
    recommendations.push({
      type: 'COST_CONTROL',
      priority: 'HIGH',
      message: `Projeção indica crescimento de ${crescimentoProj.toFixed(1)}%`,
      action: 'Implementar controles adicionais'
    });
  }

  // "outliers" aqui é um array; usar seu length diretamente
  if (outliers.length > 0) {
    recommendations.push({
      type: 'OUTLIER_REVIEW',
      priority: 'MEDIUM',
      message: `${outliers.length} transação(ões) atípica(s) detectada(s)`,
      action: 'Revisar gastos excepcionais'
    });
  }

  return {
    period: { year, month, start: startDate.toISOString().slice(0,10), end: endDate.toISOString().slice(0,10) },
    totals: { total, totalEmpresarial, totalPessoal, despesas: expenses.length },
    distrib: { porPlano, porConta, porDia },
    comparativo,
    eficiencia: efficiencyMetrics,
    outliers: { mediaEmp, stdEmp, limiteOutlier, top: outliers },
    projecao: { isMesAtual, mediaDiariaGeral, projecao, crescimentoProj },
    concentracao: { hhi, hhiScaled: Math.round(hhi*10000), sharesTop, paretoAnalysis, pareto80Count },
    businessIntelligence: {
      insights: biInsights,
      recommendations,
      summary: {
        totalCategories: planAnalysis.length,
        activeSpendingDays: diasComGasto,
        concentrationRisk: hhi > 0.25,
        projectionRisk: crescimentoProj > 15,
        // "outliers" é um array, portanto usar length diretamente
        outlierCount: outliers.length
      }
    },
    meta: { comentario: 'KPIs with integrated Business Intelligence analysis' }
  };
};

// Salvar snapshot mensal (idempotente)
const saveMonthlySnapshot = async (pool, userId, year, month, kpis) => {
  const createSQL = `CREATE TABLE IF NOT EXISTS monthly_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    total_business DECIMAL(12,2) NOT NULL,
    total_personal DECIMAL(12,2) NOT NULL,
    by_plan JSON,
    by_account JSON,
    projection DECIMAL(12,2) DEFAULT 0,
    hhi DECIMAL(10,5) DEFAULT 0,
    bi_insights JSON,
    recommendations JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_month (user_id, year, month)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
  await pool.query(createSQL);
  const insertSQL = `INSERT INTO monthly_snapshots (user_id, year, month, total, total_business, total_personal, by_plan, by_account, projection, hhi, bi_insights, recommendations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE total=VALUES(total), total_business=VALUES(total_business), total_personal=VALUES(total_personal), by_plan=VALUES(by_plan), by_account=VALUES(by_account), projection=VALUES(projection), hhi=VALUES(hhi), bi_insights=VALUES(bi_insights), recommendations=VALUES(recommendations);`;
  await pool.query(insertSQL, [
    userId, year, month, 
    kpis.totals.total, 
    kpis.totals.totalEmpresarial, 
    kpis.totals.totalPessoal, 
    JSON.stringify(kpis.distrib.porPlano), 
    JSON.stringify(kpis.distrib.porConta), 
    kpis.projecao.projecao, 
    kpis.concentracao.hhi,
    JSON.stringify(kpis.businessIntelligence?.insights || {}),
    JSON.stringify(kpis.businessIntelligence?.recommendations || [])
  ]);
};

// ====== FUNÇÕES DE BUSINESS INTELLIGENCE PARA RELATÓRIOS ======

// Análise de tendência multi-período
const computeTrendAnalysis = async (pool, userId, months = 6) => {
  try {
    const currentDate = new Date();
    const trends = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      try {
        const kpis = await computeMonthlyKPIs({ pool, userId, year, month, account: 'ALL' });
        if (kpis && kpis.totals) {
          trends.push({
            period: `${year}-${month.toString().padStart(2, '0')}`,
            year,
            month,
            total: kpis.totals.total || 0,
            business: kpis.totals.totalEmpresarial || 0,
            personal: kpis.totals.totalPessoal || 0,
            hhi: kpis.concentracao?.hhi || 0,
            projection: kpis.projecao?.projecao || 0,
            recommendations: kpis.businessIntelligence?.recommendations || []
          });
        }
      } catch (monthError) {
        console.warn(`Erro trend analysis mês ${year}-${month}:`, monthError.message);
      }
    }

    // Calcular variações percentuais
    for (let i = 1; i < trends.length; i++) {
      const current = trends[i];
      const previous = trends[i - 1];
      
      current.totalChange = previous.total > 0 ? 
        ((current.total - previous.total) / previous.total * 100) : 0;
      current.businessChange = previous.business > 0 ? 
        ((current.business - previous.business) / previous.business * 100) : 0;
      current.concentrationChange = previous.hhi > 0 ? 
        ((current.hhi - previous.hhi) / previous.hhi * 100) : 0;
    }

    return {
      trends,
      analysis: {
        periodCount: trends.length,
        avgMonthlySpend: trends.length > 0 ? trends.reduce((sum, t) => sum + t.total, 0) / trends.length : 0,
        volatility: trends.length > 1 ? calculateVolatility(trends.map(t => t.total)) : 0,
        overallTrend: trends.length >= 2 ? 
          (trends[trends.length - 1].total > trends[0].total ? 'CRESCENTE' : 'DECRESCENTE') : 'ESTÁVEL'
      }
    };

  } catch (error) {
    console.error('Erro computeTrendAnalysis:', error);
    return { trends: [], analysis: {} };
  }
};

// Análise comparativa de períodos
const computeComparativeAnalysis = async (pool, userId, currentYear, currentMonth, compareYear, compareMonth) => {
  try {
    const [currentKpis, compareKpis] = await Promise.all([
      computeMonthlyKPIs({ pool, userId, year: currentYear, month: currentMonth, account: 'ALL' }),
      computeMonthlyKPIs({ pool, userId, year: compareYear, month: compareMonth, account: 'ALL' })
    ]);

    const comparison = {
      current: {
        period: { year: currentYear, month: currentMonth },
        total: currentKpis.totals?.total || 0,
        business: currentKpis.totals?.totalEmpresarial || 0,
        personal: currentKpis.totals?.totalPessoal || 0,
        categories: Object.keys(currentKpis.distrib?.porPlano || {}).length,
        hhi: currentKpis.concentracao?.hhi || 0
      },
      compare: {
        period: { year: compareYear, month: compareMonth },
        total: compareKpis.totals?.total || 0,
        business: compareKpis.totals?.totalEmpresarial || 0,
        personal: compareKpis.totals?.totalPessoal || 0,
        categories: Object.keys(compareKpis.distrib?.porPlano || {}).length,
        hhi: compareKpis.concentracao?.hhi || 0
      },
      variance: {},
      insights: []
    };

    // Calcular variações
    comparison.variance.total = comparison.current.total - comparison.compare.total;
    comparison.variance.totalPercent = comparison.compare.total > 0 ? 
      (comparison.variance.total / comparison.compare.total * 100) : 0;

    comparison.variance.business = comparison.current.business - comparison.compare.business;
    comparison.variance.businessPercent = comparison.compare.business > 0 ? 
      (comparison.variance.business / comparison.compare.business * 100) : 0;

    comparison.variance.categories = comparison.current.categories - comparison.compare.categories;
    comparison.variance.hhi = comparison.current.hhi - comparison.compare.hhi;

    // Gerar insights
    if (Math.abs(comparison.variance.totalPercent) > 15) {
      comparison.insights.push({
        type: comparison.variance.totalPercent > 0 ? 'INCREASE' : 'DECREASE',
        category: 'TOTAL_SPENDING',
        message: `Variação de ${comparison.variance.totalPercent.toFixed(1)}% no gasto total`,
        impact: Math.abs(comparison.variance.totalPercent) > 25 ? 'HIGH' : 'MEDIUM'
      });
    }

    if (comparison.variance.hhi > 0.1) {
      comparison.insights.push({
        type: 'CONCENTRATION_INCREASE',
        category: 'RISK_MANAGEMENT',
        message: 'Aumento significativo na concentração de gastos',
        impact: 'MEDIUM'
      });
    }

    if (comparison.variance.categories < -2) {
      comparison.insights.push({
        type: 'CATEGORY_REDUCTION',
        category: 'BUDGET_MANAGEMENT',
        message: 'Redução no número de categorias utilizadas',
        impact: 'LOW'
      });
    }

    return comparison;

  } catch (error) {
    console.error('Erro computeComparativeAnalysis:', error);
    return { current: {}, compare: {}, variance: {}, insights: [] };
  }
};

// Relatório executivo consolidado para o sistema mensal
const generateExecutiveReport = async (pool, userId, year, month) => {
  try {
    const [currentKpis, trendAnalysis, previousKpis] = await Promise.all([
      computeMonthlyKPIs({ pool, userId, year, month, account: 'ALL' }),
      computeTrendAnalysis(pool, userId, 6),
      computeMonthlyKPIs({ 
        pool, userId, 
        year: month === 1 ? year - 1 : year, 
        month: month === 1 ? 12 : month - 1, 
        account: 'ALL' 
      }).catch(() => ({ totals: { total: 0, totalEmpresarial: 0 } }))
    ]);

    const report = {
      executiveSummary: {
        period: { year, month },
        totalSpent: currentKpis.totals?.total || 0,
        businessSpent: currentKpis.totals?.totalEmpresarial || 0,
        personalSpent: currentKpis.totals?.totalPessoal || 0,
        projection: currentKpis.projecao?.projecao || 0,
        monthlyChange: previousKpis.totals?.total > 0 ? 
          ((currentKpis.totals.total - previousKpis.totals.total) / previousKpis.totals.total * 100) : 0
      },
      keyMetrics: {
        concentration: {
          hhi: currentKpis.concentracao?.hhi || 0,
          level: currentKpis.businessIntelligence?.insights?.concentrationLevel || 'BAIXA',
          pareto80Categories: currentKpis.concentracao?.pareto80Count || 0
        },
        efficiency: {
          costPerBusinessDay: currentKpis.eficiencia?.custoMedioDiaUtil || 0,
          averageTicket: currentKpis.eficiencia?.ticketMedioEmp || 0,
          utilizationRate: currentKpis.eficiencia?.utilizationRate || 0
        },
        riskFactors: currentKpis.businessIntelligence?.insights?.riskFactors || {}
      },
      trends: {
        historical: trendAnalysis.trends || [],
        analysis: trendAnalysis.analysis || {},
        sixMonthAverage: trendAnalysis.analysis?.avgMonthlySpend || 0
      },
      recommendations: currentKpis.businessIntelligence?.recommendations || [],
      alerts: generateAlerts(currentKpis, previousKpis),
      generatedAt: new Date().toISOString()
    };

    return report;

  } catch (error) {
    console.error('Erro generateExecutiveReport:', error);
    return {
      executiveSummary: {},
      keyMetrics: {},
      trends: {},
      recommendations: [],
      alerts: [],
      generatedAt: new Date().toISOString()
    };
  }
};

// Função auxiliar para calcular volatilidade
const calculateVolatility = (values) => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / mean * 100; // Coeficiente de variação em %
};

// Função auxiliar para gerar alertas
const generateAlerts = (currentKpis, previousKpis) => {
  const alerts = [];
  
  const currentTotal = currentKpis.totals?.total || 0;
  const previousTotal = previousKpis.totals?.total || 0;
  
  if (previousTotal > 0) {
    const change = ((currentTotal - previousTotal) / previousTotal) * 100;
    
    if (change > 25) {
      alerts.push({
        type: 'HIGH_INCREASE',
        severity: 'HIGH',
        message: `Aumento de ${change.toFixed(1)}% nos gastos em relação ao mês anterior`,
        action: 'Revisar aprovações e controles de gastos'
      });
    }
    
    if (change < -25) {
      alerts.push({
        type: 'SIGNIFICANT_DECREASE',
        severity: 'MEDIUM',
        message: `Redução de ${Math.abs(change).toFixed(1)}% nos gastos`,
        action: 'Verificar se houve subregistro de despesas'
      });
    }
  }
  
  const hhi = currentKpis.concentracao?.hhi || 0;
  if (hhi > 0.3) {
    alerts.push({
      type: 'HIGH_CONCENTRATION',
      severity: 'MEDIUM',
      message: 'Concentração muito alta de gastos em poucas categorias',
      action: 'Diversificar distribuição orçamentária'
    });
  }
  
  const projectionGrowth = currentKpis.projecao?.crescimentoProj || 0;
  if (projectionGrowth > 20) {
    alerts.push({
      type: 'PROJECTION_RISK',
      severity: 'HIGH',
      message: `Projeção indica crescimento de ${projectionGrowth.toFixed(1)}% até fim do mês`,
      action: 'Implementar controles para conter gastos'
    });
  }

  return alerts;
};

module.exports = { 
  computeMonthlyKPIs, 
  saveMonthlySnapshot,
  computeTrendAnalysis,
  computeComparativeAnalysis,
  generateExecutiveReport
};
