const computeMonthlyKPIs = async ({ pool, userId, year, month, account }) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  let sql = `SELECT id, amount, account_plan_code, account, is_business_expense, is_personal, transaction_date, description FROM expenses WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?`;
  const params = [userId, startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10)];
  if (account && account !== 'ALL') { sql += ' AND account = ?'; params.push(account); }
  sql += ' ORDER BY transaction_date';
  const [expenses] = await pool.query(sql, params);
  if (!expenses.length) return { expenses: [], message: 'SEM_DADOS', year, month };

  const empresariais = expenses.filter(e => e.is_business_expense === 1 || e.is_business_expense === true || e.is_personal === 0);
  const pessoais = expenses.filter(e => (e.is_personal === 1 || e.is_personal === true) || (e.is_business_expense === 0 || e.is_business_expense === false)).filter(e => !empresariais.find(b=> b.id===e.id));
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

  return {
    period: { year, month, start: startDate.toISOString().slice(0,10), end: endDate.toISOString().slice(0,10) },
    totals: { total, totalEmpresarial, totalPessoal, despesas: expenses.length },
    distrib: { porPlano, porConta, porDia },
    comparativo,
    eficiencia: { businessDaysInMonth, custoMedioDiaUtil, ticketMedioEmp },
    outliers: { mediaEmp, stdEmp, limiteOutlier, top: outliers },
    projecao: { isMesAtual, mediaDiariaGeral, projecao, crescimentoProj },
    concentracao: { hhi, hhiScaled: Math.round(hhi*10000), sharesTop },
    meta: { comentario: 'Use estes KPIs no dashboard ou IA.' }
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_month (user_id, year, month)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
  await pool.query(createSQL);
  const insertSQL = `INSERT INTO monthly_snapshots (user_id, year, month, total, total_business, total_personal, by_plan, by_account, projection, hhi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE total=VALUES(total), total_business=VALUES(total_business), total_personal=VALUES(total_personal), by_plan=VALUES(by_plan), by_account=VALUES(by_account), projection=VALUES(projection), hhi=VALUES(hhi);`;
  await pool.query(insertSQL, [userId, year, month, kpis.totals.total, kpis.totals.totalEmpresarial, kpis.totals.totalPessoal, JSON.stringify(kpis.distrib.porPlano), JSON.stringify(kpis.distrib.porConta), kpis.projecao.projecao, kpis.concentracao.hhi]);
};

module.exports = { computeMonthlyKPIs, saveMonthlySnapshot };
