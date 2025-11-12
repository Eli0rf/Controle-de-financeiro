const { generateExecutiveReport } = require('../reporting/monthlyKpis');
const { getRedis } = require('../utils/redisClient');
const { sendMail } = require('../utils/mailer');

function initRecurringScheduler({ pool, intervalHours } = {}) {
  if (process.env.DISABLE_SCHEDULER === '1') {
    console.log('⏱️ Recurring Scheduler desativado por variável de ambiente.');
    return;
  }

  const INTERVAL = (intervalHours ? Number(intervalHours) : (process.env.RECURRING_INTERVAL_HOURS ? Number(process.env.RECURRING_INTERVAL_HOURS) : 24)) * 60 * 60 * 1000;

  async function runJob() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    console.log(`⏱️ Iniciando job de processamento de recorrentes para ${year}-${month.toString().padStart(2,'0')}`);
    try {
      const [lockRows] = await pool.query("SELECT GET_LOCK('recurring_process_job', 1) AS got");
      if (!lockRows[0].got) {
        console.log('🔒 Não obteve lock para recorrentes, outro processo executando.');
        return;
      }
      try {
        const [users] = await pool.query('SELECT id, username, email FROM users');
        for (const u of users) {
          try {
            const [recurringExpenses] = await pool.query(`
              SELECT * FROM recurring_expenses WHERE user_id = ? AND is_active = 1
            `, [u.id]);

            let processedCount = 0;
            for (const expense of recurringExpenses) {
              const [existing] = await pool.query(`
                SELECT id FROM expenses 
                WHERE user_id = ? AND recurring_expense_id = ? 
                AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
              `, [u.id, expense.id, year, month]);

              if (existing.length === 0) {
                const transactionDate = new Date(year, month - 1, expense.day_of_month);
                await pool.query(`
                  INSERT INTO expenses 
                  (user_id, description, amount, account, category, is_business_expense, transaction_date, recurring_expense_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                  u.id,
                  expense.description,
                  expense.amount,
                  expense.account,
                  expense.category,
                  expense.is_business_expense,
                  transactionDate,
                  expense.id
                ]);
                processedCount++;
              }
            }

            if (processedCount > 0) console.log(`✅ Usuário ${u.id} - ${processedCount} recorrentes processados.`);

            // Optionally send a small executive report summary email
            if (process.env.SEND_MONTHLY_REPORTS === '1' && (u.email || u.username)) {
              try {
                const report = await generateExecutiveReport(pool, u.id, year, month);
                const subject = `Relatório executivo - ${year}-${month.toString().padStart(2,'0')}`;
                const text = `Olá,\n\nSegue o resumo executivo para ${year}-${month.toString().padStart(2,'0')}:\nTotal gasto: ${report.executiveSummary.totalSpent}\nGasto empresarial: ${report.executiveSummary.businessSpent}\nProjeção: ${report.executiveSummary.projection}\n\nAbraços.`;
                const to = u.email || u.username;
                await sendMail({ to, subject, text });
                console.log(`✉️ Relatório enviado para ${to}`);
              } catch (emailErr) {
                console.warn('Falha ao enviar relatório por email para', u.id, emailErr.message);
              }
            }

          } catch (userErr) {
            console.error('Erro processando recorrentes usuário', u.id, userErr.message);
          }
        }
      } finally {
        await pool.query("SELECT RELEASE_LOCK('recurring_process_job')");
      }
    } catch (e) {
      console.error('Erro no scheduler de recorrentes:', e.message);
    }
  }

  setInterval(runJob, INTERVAL);
  setTimeout(runJob, 15_000); // primeira execução após 15s
  console.log(`✅ Recurring Scheduler ativo (intervalo ${INTERVAL/3600000}h)`);
}

module.exports = { initRecurringScheduler };
