// Periodically (every 6h) compute & save monthly KPI snapshots for all users (idempotent)
function initKpiScheduler({ pool, computeMonthlyKPIs, saveMonthlySnapshot }) {
  if (process.env.DISABLE_SCHEDULER === '1') {
    console.log('⏱️ KPI Scheduler desativado por variável de ambiente.');
    return;
  }
  const INTERVAL = (process.env.SNAPSHOT_INTERVAL_HOURS ? Number(process.env.SNAPSHOT_INTERVAL_HOURS) : 6) * 60 * 60 * 1000;

  async function runJob() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // snapshot contínuo do mês corrente
    console.log(`⏱️ Iniciando job de snapshot mensal para ${year}-${month.toString().padStart(2,'0')}`);
    try {
      const [lockRows] = await pool.query("SELECT GET_LOCK('monthly_snapshot_job', 1) AS got");
      if (!lockRows[0].got) {
        console.log('🔒 Não obteve lock, outro processo executando.');
        return;
      }
      try {
        const [users] = await pool.query('SELECT id FROM users');
        for (const u of users) {
          try {
            const kpis = await computeMonthlyKPIs({ pool, userId: u.id, year, month, account: 'ALL' });
            const count = (kpis && kpis.totals && typeof kpis.totals.despesas === 'number') ? kpis.totals.despesas : 0;
            if (count > 0) {
              await saveMonthlySnapshot(pool, u.id, year, month, kpis);
            }
          } catch (e) {
            console.error('Erro snapshot usuário', u.id, e.message);
          }
        }
      } finally {
        await pool.query("SELECT RELEASE_LOCK('monthly_snapshot_job')");
      }
    } catch (e) {
      console.error('Erro no scheduler KPI:', e.message);
    }
  }

  setInterval(runJob, INTERVAL);
  setTimeout(runJob, 10_000); // primeira execução após 10s
  console.log(`✅ KPI Scheduler ativo (intervalo ${INTERVAL/3600000}h)`);
}

module.exports = { initKpiScheduler };
