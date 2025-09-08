// Simple anomaly detector using per-plan monthly z-scores over last 6 months
async function detectAnomalies({ pool, userId, year, month }) {
  const targetYm = year * 100 + month;
  // Range: last 6 months including target
  const fromDate = new Date(year, month - 6, 1); // month-6 handles negative automatically
  const fromYear = fromDate.getFullYear();
  const fromMonth = fromDate.getMonth() + 1;
  const fromYm = fromYear * 100 + fromMonth;
  const [rows] = await pool.query(`
    SELECT (YEAR(transaction_date)*100 + MONTH(transaction_date)) AS ym,
           COALESCE(account_plan_code,'__SEM_PLANO__') AS plano,
           SUM(amount) AS total
    FROM expenses
    WHERE user_id = ?
      AND (YEAR(transaction_date)*100 + MONTH(transaction_date)) BETWEEN ? AND ?
    GROUP BY ym, plano
  `, [userId, fromYm, targetYm]);

  if (!rows.length) return { period: { year, month }, anomalies: [], plans: [] };

  // Organize data per plan
  const perPlan = {};
  for (const r of rows) {
    if (!perPlan[r.plano]) perPlan[r.plano] = {};
    perPlan[r.plano][r.ym] = Number(r.total);
  }

  // Get current month totals per plan & total overall
  let currentTotal = 0;
  const currentPerPlan = {};
  for (const plano of Object.keys(perPlan)) {
    const val = perPlan[plano][targetYm] || 0;
    currentPerPlan[plano] = val;
    currentTotal += val;
  }

  const anomalies = [];
  for (const [plano, serie] of Object.entries(perPlan)) {
    const pastValues = Object.entries(serie)
      .filter(([ym]) => Number(ym) !== targetYm)
      .sort((a,b)=> Number(a[0])-Number(b[0]))
      .map(([,v]) => v);
    if (pastValues.length < 2) continue; // need at least 2 for std
    const mean = pastValues.reduce((a,b)=>a+b,0)/pastValues.length;
    const variance = pastValues.reduce((a,b)=> a + Math.pow(b-mean,2),0)/pastValues.length;
    const std = Math.sqrt(variance) || 0;
    const current = serie[targetYm] || 0;
    if (std === 0) continue;
    const z = (current - mean)/std;
    const share = currentTotal>0 ? current/currentTotal : 0;
    if (z >= 2 && current > 0 && share >= 0.05) {
      anomalies.push({ plano: plano === '__SEM_PLANO__' ? 'SEM_PLANO' : plano, current, mean, std, zScore: Number(z.toFixed(2)), share: Number((share*100).toFixed(2)) });
    }
  }

  anomalies.sort((a,b)=> b.zScore - a.zScore);
  return {
    period: { year, month },
    totalMonth: currentTotal,
    anomalies,
    plans: Object.keys(perPlan).length,
    algorithm: 'zscore-v1',
    threshold: { zScore: '>=2', minSharePercent: 5, minPastMonths: 2 }
  };
}

module.exports = { detectAnomalies };
