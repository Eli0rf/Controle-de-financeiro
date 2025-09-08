// server.js (Versão Final e Completa)

// --- 1. DEPENDÊNCIAS ---
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const pdfkit = require('pdfkit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- 2. CONFIGURAÇÕES PRINCIPAIS ---
const app = express();
const PORT = process.env.PORT || 3000;

// CORS PRIMEIRO - antes de qualquer outro middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    console.log(`🔍 CORS Debug - ${req.method} ${req.url}`);
    console.log(`📍 Origin: ${origin || 'NO_ORIGIN'}`);
    console.log(`🌐 User-Agent: ${req.headers['user-agent'] || 'NO_USER_AGENT'}`);
    
    // SEMPRE permitir estas origens específicas
    const allowedOrigins = [
        'https://controle-de-financeiro-production.up.railway.app',
        'https://controlegastos-production.up.railway.app'
    ];
    
    // Headers CORS obrigatórios - SEMPRE definir
    res.header('Access-Control-Allow-Origin', origin && allowedOrigins.includes(origin) ? origin : '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '3600');
    
    console.log(`✅ CORS Headers definidos:`);
    console.log(`   Access-Control-Allow-Origin: ${res.getHeader('Access-Control-Allow-Origin')}`);
    console.log(`   Access-Control-Allow-Methods: ${res.getHeader('Access-Control-Allow-Methods')}`);
    
    // Para requisições OPTIONS (preflight), responder imediatamente
    if (req.method === 'OPTIONS') {
        console.log('✅ Respondendo preflight OPTIONS');
        return res.status(200).end();
    }
    
    next();
});

// Importar configurações de banco e migrações
const { pool, testConnection } = require('./config/database');
const { createDatabase } = require('./migrations/migrate');

// --- 3. MIDDLEWARES ---
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 3. Crie o endpoint de Health Check Inteligente
app.get('/health', async (req, res) => {
    try {
        // Tenta pegar uma conexão do pool e fazer uma query simples
        const connection = await pool.getConnection();
        await connection.ping(); // ping() é mais rápido que uma query completa
        connection.release(); // Libera a conexão de volta para o pool
        
        // Se tudo deu certo, retorna 200 OK
        res.status(200).json({ status: 'ok', db: 'connected' });
    } catch (error) {
        // Se a conexão com o banco falhar, o serviço não está saudável
        console.error('Health check falhou:', error);
        res.status(503).json({ status: 'error', db: 'disconnected', details: error.message });
    }
});

// Endpoint de exemplo
app.get('/', (req, res) => {
    res.send('Aplicação rodando!');
});

// Endpoint de teste CORS
app.get('/test-cors', (req, res) => {
    res.json({ 
        message: 'CORS funcionando!', 
        origin: req.headers.origin,
        timestamp: new Date().toISOString()
    });
});

// Endpoint de teste POST para CORS
app.post('/test-cors', (req, res) => {
    res.json({ 
        message: 'POST CORS funcionando!', 
        origin: req.headers.origin,
        body: req.body,
        timestamp: new Date().toISOString()
    });
});
// Cria/atualiza view de snapshots para BI externo
async function ensureKpiView(){
    try {
        await pool.query(`CREATE OR REPLACE VIEW monthly_kpi_view AS 
            SELECT ms.user_id, u.username, ms.year, ms.month, ms.total, ms.total_business, ms.total_personal,
                         ms.projection, ms.hhi, ms.created_at, ms.updated_at
            FROM monthly_snapshots ms
            JOIN users u ON u.id = ms.user_id`);
        console.log('✅ View monthly_kpi_view pronta');
    } catch(e){ console.error('Erro criando view monthly_kpi_view', e.message); }
}
ensureKpiView();
// Inicializa scheduler de KPIs após dependências carregadas
setTimeout(()=>{
    try { initKpiScheduler({ pool, computeMonthlyKPIs, saveMonthlySnapshot }); } catch(e){ console.error('Falha init scheduler', e); }
}, 2000);

// Global error handler (last middleware)
app.use((err, req, res, next) => {
    console.error('🔥 Erro não tratado:', err.stack || err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
});
// ====== API KPIs Mensais (JSON) ======
const { computeMonthlyKPIs, saveMonthlySnapshot } = require('./reporting/monthlyKpis');
const { getRedis } = require('./utils/redisClient');
const { authenticateToken } = require('./middleware/authMiddleware');
const { detectAnomalies } = require('./analytics/anomalyDetector');
const { initKpiScheduler } = require('./schedulers/kpiScheduler');
app.get('/api/kpis/monthly', authenticateToken, async (req, res) => {
    try {
    const userId = parseInt(req.user?.id || req.query.userId || 1);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const account = req.query.account || 'ALL';
        const cacheKey = `kpi:${userId}:${year}:${month}:${account}`;
        const redis = getRedis();
        if (redis) {
            const cached = await redis.get(cacheKey);
            if (cached) return res.json({ cached: true, ...JSON.parse(cached) });
        }
        const kpis = await computeMonthlyKPIs({ pool, userId, year, month, account });
        if (kpis.expenses && kpis.expenses.length === 0) return res.json(kpis);
        // Salva snapshot (não bloqueante)
        saveMonthlySnapshot(pool, userId, year, month, kpis).catch(()=>{});
        if (redis) redis.set(cacheKey, JSON.stringify(kpis), 'EX', 300); // 5min
        res.json(kpis);
    } catch (e) {
        console.error('Erro KPIs mensais:', e);
        res.status(500).json({ error: 'Erro ao calcular KPIs mensais' });
    }
});

// Listar snapshots salvos (paginado simples)
app.get('/api/kpis/snapshots', authenticateToken, async (req,res)=>{
    try {
        const userId = parseInt(req.user?.id || 0);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        // Garante existência da tabela (primeiro uso em ambiente limpo)
        await pool.query(`CREATE TABLE IF NOT EXISTS monthly_snapshots (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        const [rows] = await pool.query(`SELECT year, month, total, total_business, total_personal, projection, hhi, created_at FROM monthly_snapshots WHERE user_id=? AND year=? ORDER BY year DESC, month DESC`, [userId, year]);
        res.json({ year, snapshots: rows });
    } catch(e){
        console.error('Erro listar snapshots', e); res.status(500).json({ error:'Erro ao listar snapshots'});
    }
});

// Esquema para integração Metabase/Superset
app.get('/api/kpis/schema', authenticateToken, async (req,res)=>{
    res.json({
        views: [
            {
                name: 'monthly_kpi_view',
                description: 'KPIs mensais agregados por usuário',
                columns: [
                    { name:'user_id', type:'INT' },
                        { name:'username', type:'VARCHAR' },
                        { name:'year', type:'INT' },
                        { name:'month', type:'INT' },
                        { name:'total', type:'DECIMAL' },
                        { name:'total_business', type:'DECIMAL' },
                        { name:'total_personal', type:'DECIMAL' },
                        { name:'projection', type:'DECIMAL' },
                        { name:'hhi', type:'DECIMAL' },
                        { name:'created_at', type:'TIMESTAMP' },
                        { name:'updated_at', type:'TIMESTAMP' }
                ]
            }
        ],
        notes: 'Conecte sua ferramenta BI ao MySQL e consulte SELECT * FROM monthly_kpi_view. Para granularidade diária usar tabela expenses.'
    });
});

// Endpoint manual para forçar snapshot do mês atual (pode ser usado em cron externo)
app.post('/api/kpis/snapshot/refresh', authenticateToken, async (req,res)=>{
    try {
        const userId = parseInt(req.user?.id || 0);
        const now = new Date();
        const year = parseInt(req.body.year) || now.getFullYear();
        const month = parseInt(req.body.month) || (now.getMonth()+1);
        const kpis = await computeMonthlyKPIs({ pool, userId, year, month, account:'ALL' });
        if (kpis.expenses && kpis.expenses.length===0) return res.status(400).json({ message:'Sem dados para snapshot' });
        await saveMonthlySnapshot(pool, userId, year, month, kpis);
        res.json({ message:'Snapshot atualizado', year, month });
    } catch(e){ console.error('Erro snapshot refresh', e); res.status(500).json({ error:'Erro ao gerar snapshot'}); }
});

// Rota de anomalias com z-score (últimos 6 meses)
app.get('/api/kpis/anomaly', authenticateToken, async (req,res)=>{
    try {
        const userId = parseInt(req.user?.id || 0);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth()+1);
        const result = await detectAnomalies({ pool, userId, year, month });
        res.json(result);
    } catch(e){ console.error('Erro anomaly', e); res.status(500).json({ error:'Erro ao detectar anomalias'}); }
});


// --- 5. CONFIGURAÇÃO DO MULTER (UPLOAD DE FICHEIROS) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/';
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// (auth middleware agora em middleware/authMiddleware.js)

// --- 7. ROTAS PÚBLICAS (AUTENTICAÇÃO) ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Utilizador e senha são obrigatórios.' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        res.status(201).json({ message: 'Utilizador criado com sucesso!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Nome de utilizador já existe.' });
        console.error('Erro no registo:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Utilizador e senha são obrigatórios.' });
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];
        if (!user) return res.status(404).json({ message: 'Utilizador não encontrado.' });
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) return res.status(401).json({ message: 'Senha incorreta.' });
        const accessToken = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET || 'seu_segredo_super_secreto', { expiresIn: '8h' });
        res.json({ accessToken });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
});

// --- 8. ROTAS PROTEGIDAS ---
app.post('/api/expenses', authenticateToken, upload.single('invoice'), async (req, res) => {
    try {
        const {
            transaction_date,
            amount, // Valor da parcela
            description,
            account,
            account_plan_code,
            total_installments // Número total de parcelas
        } = req.body;

            // Barra de progresso visual - linha 3
            const maxValue = Math.max(...Object.values(porPlano));
            const barWidth = maxValue > 0 ? (valor / maxValue) * 180 : 0;
            doc.roundedRect(90, cardY + 65, 180, 6, 3).fill('#FFFFFF40');
            if (barWidth > 0) {
                doc.roundedRect(90, cardY + 65, barWidth, 6, 3).fill('#FFFFFF');
            }
            doc.y += 95; // Espaçamento entre cards

        console.log('📝 Dados de criação de despesa:', {
            account_plan_code,
            is_business_expense,
            finalIsBusiness,
            finalAccountPlanCode,
            rule_applied: !account_plan_code ? 'AUTO_BUSINESS_NO_PLAN' : 'USER_CHOICE'
        });

        // Validação dos campos obrigatórios
        if (!transaction_date || !amount || !description || !account || !total_installments) {
            return res.status(400).json({ message: 'Campos obrigatórios em falta.' });
        }

        const installmentAmount = parseFloat(amount);
        const numberOfInstallments = parseInt(total_installments, 10);

        if (isNaN(installmentAmount) || isNaN(numberOfInstallments)) {
            return res.status(400).json({ message: 'Valor e número de parcelas devem ser números válidos.' });
        }

        const calculatedTotalAmount = installmentAmount * numberOfInstallments;

        for (let i = 0; i < numberOfInstallments; i++) {
            const installmentDate = new Date(transaction_date);
            installmentDate.setMonth(installmentDate.getMonth() + i);

            const installmentDescription = numberOfInstallments > 1
                ? `${description} (Parcela ${i + 1}/${numberOfInstallments})`
                : description;

            const sql = `
                INSERT INTO expenses (
                    user_id, transaction_date, amount, description, account,
                    is_business_expense, account_plan_code, has_invoice, invoice_path,
                    total_purchase_amount, installment_number, total_installments
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            const params = [
                userId,
                installmentDate.toISOString().slice(0, 10),
                installmentAmount.toFixed(2),
                installmentDescription,
                account,
                finalIsBusiness,
                finalAccountPlanCode,
                (finalIsBusiness && i === 0 && has_invoice) ? 1 : null,
                (finalIsBusiness && i === 0 && has_invoice) ? invoicePath : null,
                calculatedTotalAmount.toFixed(2),
                i + 1,
                numberOfInstallments
            ];

            await pool.query(sql, params);
        }

        res.status(201).json({ message: 'Gasto(s) parcelado(s) adicionado(s) com sucesso!' });
    } catch (error) {
        console.error('ERRO AO ADICIONAR GASTO:', error);
        res.status(500).json({ message: 'Ocorreu um erro no servidor ao adicionar o gasto.' });
    }
});

app.get('/api/expenses', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { year, month, account, start_date, end_date, include_recurring } = req.query;

    try {
        let sql = 'SELECT * FROM expenses WHERE user_id = ?';
        const params = [userId];

        // Filtro por conta
        if (account) {
            sql += ' AND account = ?';
            params.push(account);
        }

        // Filtrar gastos recorrentes se não for explicitamente solicitado
        if (include_recurring !== 'true') {
            // Para contas que não são PIX ou Boleto, não incluir gastos recorrentes
            // Para PIX e Boleto, incluir apenas se for busca por fatura
            if (account && ['PIX', 'Boleto'].includes(account)) {
                // Se for busca por período de fatura, incluir recorrentes
                // Se for busca geral, excluir recorrentes
                if (!start_date && !end_date) {
                    sql += ' AND is_recurring_expense = 0';
                }
            }
        }

        // Permite busca por intervalo de datas explícito (usado na busca de fatura)
        if (start_date && end_date) {
            sql += ' AND transaction_date >= ? AND transaction_date <= ?';
            params.push(start_date, end_date);
        } else if (account && billingPeriods[account] && year && month) {
            // Para contas PIX e Boleto, não aplicar filtro de período de fatura
            if (!billingPeriods[account].isRecurring) {
                const { startDay, endDay } = billingPeriods[account];
                const startDate = new Date(year, month - 1, startDay);
                let endMonth = Number(month);
                let endYear = Number(year);
                if (endDay < startDay) {
                    endMonth++;
                    if (endMonth > 12) { endMonth = 1; endYear++; }
                }
                const endDate = new Date(endYear, endMonth - 1, endDay);

                sql += ' AND transaction_date >= ? AND transaction_date <= ?';
                params.push(startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10));
            } else {
                // Para PIX e Boleto, filtrar apenas por mês/ano normal
                sql += ' AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?';
                params.push(year, month);
            }
        } else if (year && month) {
            sql += ' AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?';
            params.push(year, month);
        }

        sql += ' ORDER BY transaction_date DESC';
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar despesas:', error);
        res.status(500).json({ message: 'Erro ao buscar despesas.' });
    }
});

// Rota para buscar uma despesa específica
app.get('/api/expenses/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    try {
        const [rows] = await pool.query('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Despesa não encontrada.' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        console.error('Erro ao buscar despesa:', error);
        res.status(500).json({ message: 'Erro ao buscar despesa.' });
    }
});

// Rota para editar gasto
app.put('/api/expenses/:id', authenticateToken, upload.single('invoice'), async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    try {
        const {
            transaction_date,
            amount,
            description,
            account,
            account_plan_code
        } = req.body;

        const is_business_expense = req.body.is_business_expense === 'true';
        const has_invoice = req.body.has_invoice === 'true';
        const invoicePath = req.file ? req.file.path : null;

        // REGRA AUTOMÁTICA: Se não tem plano de conta, é automaticamente empresarial
        const finalIsBusiness = !account_plan_code || is_business_expense;
        const finalAccountPlanCode = finalIsBusiness ? null : (account_plan_code || null);

        console.log('📝 Dados de atualização de despesa:', {
            account_plan_code,
            is_business_expense,
            finalIsBusiness,
            finalAccountPlanCode,
            rule_applied: !account_plan_code ? 'AUTO_BUSINESS_NO_PLAN' : 'USER_CHOICE'
        });

        // Validação dos campos obrigatórios
        if (!transaction_date || !amount || !description || !account) {
            return res.status(400).json({ message: 'Campos obrigatórios em falta.' });
        }

        // Verificar se a despesa existe e pertence ao usuário
        const [existingRows] = await pool.query('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);
        if (existingRows.length === 0) {
            return res.status(404).json({ message: 'Despesa não encontrada.' });
        }

        const existingExpense = existingRows[0];

        // Se uma nova fatura foi enviada, remover a antiga
        if (invoicePath && existingExpense.invoice_path) {
            fs.unlink(existingExpense.invoice_path, (err) => {
                if (err) console.error("Erro ao apagar ficheiro antigo:", err);
            });
        }

        // Preparar dados para atualização
        const updateData = [
            transaction_date,
            parseFloat(amount),
            description,
            account,
            finalAccountPlanCode,
            finalIsBusiness,
            has_invoice,
            invoicePath || existingExpense.invoice_path, // Manter fatura existente se não houver nova
            id,
            userId
        ];

        // Atualizar no banco de dados
        const updateQuery = `
            UPDATE expenses SET 
                transaction_date = ?,
                amount = ?,
                description = ?,
                account = ?,
                account_plan_code = ?,
                is_business_expense = ?,
                has_invoice = ?,
                invoice_path = ?
            WHERE id = ? AND user_id = ?
        `;

        const [result] = await pool.query(updateQuery, updateData);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Despesa não encontrada.' });
        }

        res.json({ message: 'Despesa atualizada com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar despesa:', error);
        res.status(500).json({ message: 'Erro ao atualizar despesa.' });
    }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const [rows] = await pool.query('SELECT invoice_path FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);
        if (rows.length > 0 && rows[0].invoice_path) {
            fs.unlink(rows[0].invoice_path, (err) => {
                if (err) console.error("Erro ao apagar ficheiro antigo:", err);
            });
        }
        const [result] = await pool.query('DELETE FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Despesa não encontrada.' });
        res.json({ message: 'Despesa apagada com sucesso!' });
    } catch (error) {
        console.error('Erro ao apagar despesa:', error);
        res.status(500).json({ message: 'Erro ao apagar despesa.' });
    }
});

// Rota para classificação automática de gastos empresariais
app.get('/api/expenses/auto-classify-business', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    
    try {
        console.log('🔄 Iniciando classificação automática de gastos empresariais para usuário:', userId);
        
        // Buscar todos os gastos sem plano de conta que não são empresariais
        const [expensesWithoutPlan] = await pool.query(`
            SELECT id, description, amount, account, account_plan_code, is_business_expense
            FROM expenses 
            WHERE user_id = ? 
            AND (account_plan_code IS NULL OR account_plan_code = '') 
            AND is_business_expense = 0
        `, [userId]);
        
        console.log(`📊 Encontrados ${expensesWithoutPlan.length} gastos sem plano de conta para classificar`);
        
        if (expensesWithoutPlan.length === 0) {
            return res.json({
                message: 'Nenhum gasto encontrado para classificação automática',
                updated: 0,
                details: []
            });
        }
        
        // Atualizar todos os gastos sem plano para serem empresariais
        const [updateResult] = await pool.query(`
            UPDATE expenses 
            SET is_business_expense = 1 
            WHERE user_id = ? 
            AND (account_plan_code IS NULL OR account_plan_code = '') 
            AND is_business_expense = 0
        `, [userId]);
        
        console.log(`✅ ${updateResult.affectedRows} gastos classificados como empresariais`);
        
        // Preparar detalhes dos gastos atualizados
        const updatedDetails = expensesWithoutPlan.map(expense => ({
            id: expense.id,
            description: expense.description,
            amount: expense.amount,
            account: expense.account,
            was_business: expense.is_business_expense,
            now_business: true
        }));
        
        res.json({
            message: `${updateResult.affectedRows} gastos foram classificados automaticamente como empresariais`,
            updated: updateResult.affectedRows,
            details: updatedDetails
        });
        
    } catch (error) {
        console.error('❌ Erro na classificação automática de gastos empresariais:', error);
        res.status(500).json({ 
            message: 'Erro interno do servidor ao classificar gastos',
            error: error.message 
        });
    }
});

// Endpoint para download seguro de faturas
app.get('/api/invoice/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    try {
        console.log(`🔍 Tentativa de download de fatura - Usuário: ${userId}, Despesa ID: ${id}`);
        
        // Verificar se o usuário tem acesso a esta fatura
        const [rows] = await pool.query('SELECT invoice_path FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);
        
        if (rows.length === 0) {
            console.log(`❌ Fatura não encontrada - ID: ${id}, Usuário: ${userId}`);
            return res.status(404).json({ message: 'Fatura não encontrada.' });
        }
        
        const invoicePath = rows[0].invoice_path;
        if (!invoicePath) {
            console.log(`❌ Despesa sem fatura anexada - ID: ${id}`);
            return res.status(404).json({ message: 'Esta despesa não possui fatura anexada.' });
        }
        
        // Verificar se o arquivo existe no servidor
        const fullPath = path.join(__dirname, invoicePath);
        console.log(`📁 Verificando arquivo: ${fullPath}`);
        
        if (!fs.existsSync(fullPath)) {
            console.log(`❌ Arquivo não encontrado no servidor: ${fullPath}`);
            return res.status(404).json({ message: 'Arquivo da fatura não encontrado no servidor.' });
        }
        
        // Obter o nome original do arquivo para o download
        const fileName = path.basename(invoicePath);
        console.log(`📄 Enviando arquivo: ${fileName}`);
        
        // Configurar headers para download
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        
        // Enviar o arquivo
        res.sendFile(fullPath);
        
    } catch (error) {
        console.error('❌ Erro ao baixar fatura:', error);
        res.status(500).json({ message: 'Erro interno do servidor ao baixar fatura.' });
    }
});

app.get('/api/dashboard', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { year, month } = req.query;

    if (!year || !month) {
        return res.status(400).json({ message: 'Ano e mês são obrigatórios.' });
    }

    try {
        const [
            projectionData,
            lineChartData,
            pieChartData,
            mixedTypeChartData,
            planChartData
        ] = await Promise.all([
            // Projeção para o próximo mês
            pool.query(
                `SELECT SUM(amount) AS total FROM expenses WHERE user_id = ? AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?`,
                [userId, parseInt(month, 10) === 12 ? parseInt(year, 10) + 1 : year, parseInt(month, 10) === 12 ? 1 : parseInt(month, 10) + 1]
            ),
            // Evolução dos Gastos (Diário para o mês selecionado)
            pool.query(
                `SELECT DAY(transaction_date) as day, SUM(amount) as total FROM expenses WHERE user_id = ? AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ? GROUP BY DAY(transaction_date) ORDER BY DAY(transaction_date)`,
                [userId, year, month]
            ),
            // Distribuição por Conta (Pie Chart)
            pool.query(
                `SELECT account, SUM(amount) as total FROM expenses WHERE user_id = ? AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ? GROUP BY account`,
                [userId, year, month]
            ),
            // Comparação Pessoal vs. Empresarial (Mixed Chart)
            pool.query(
                `SELECT account,
                        SUM(CASE WHEN is_business_expense = 0 THEN amount ELSE 0 END) as personal_total,
                        SUM(CASE WHEN is_business_expense = 1 THEN amount ELSE 0 END) as business_total
                 FROM expenses
                 WHERE user_id = ? AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
                 GROUP BY account`,
                [userId, year, month]
            ),
            // Gastos por Plano de Conta (Bar Chart)
            pool.query(
                `SELECT account_plan_code, SUM(amount) as total
                 FROM expenses
                 WHERE user_id = ? AND is_business_expense = 0 AND account_plan_code IS NOT NULL AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
                 GROUP BY account_plan_code`,
                [userId, year, month]
            )
        ]);

        const nextMonthProjection = parseFloat(projectionData[0][0]?.total || 0);

        res.json({
            projection: { nextMonthEstimate: nextMonthProjection.toFixed(2) },
            lineChartData: lineChartData[0],
            pieChartData: pieChartData[0],
            mixedTypeChartData: mixedTypeChartData[0],
            planChartData: planChartData[0]
        });

    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        res.status(500).json({ message: 'Erro ao buscar dados do dashboard.' });
    }
});

// --- 8.1. ROTA DE TETOS POR PLANO DE CONTAS (ALERTAS) ---
// Tetos de gastos por plano de contas - baseado na planilha atualizada
const tetos = {
    1: 1000.00, 2: 2782.47, 3: 2431.67, 4: 350.00, 5: 2100.00,
    6: 550.00, 7: 270.00, 8: 1200.00, 9: 1200.00, 10: 270.00,
    11: 1895.40, 12: 2627.60, 13: 270.00, 14: 55.00, 15: 129.90,
    16: 59.90, 17: 4100.00, 18: 1570.00, 19: 500.00, 20: 500.00,
    21: 150.00, 22: 1134.00, 23: 500.00, 24: 1000.00, 25: 350.00,
    26: 1000.00, 27: 500.00, 28: 450.00, 29: 285.00, 30: 700.00,
    31: 200.00, 32: 450.00, 33: 100.00, 34: 54.80, 35: 0.00,
    36: 0.00, 37: 0.00, 38: 0.00, 39: 400.00, 40: 0.00,
    41: 0.00, 42: 0.00, 43: 210.00, 44: 0.00, 45: 12700.00
};

// Rota protegida para tetos por plano de contas
app.get('/api/expenses-goals', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.query;

        let sql = `
            SELECT account_plan_code, SUM(amount) as Total
            FROM expenses
            WHERE user_id = ? AND account_plan_code IS NOT NULL
        `;
        const params = [userId];

        if (year && month) {
            sql += ' AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?';
            params.push(year, month);
        }

        sql += ' GROUP BY account_plan_code ORDER BY Total DESC';

        const [results] = await pool.query(sql, params);

        const dataWithLimits = results.map(item => {
            const planoId = parseInt(item.account_plan_code);
            const teto = tetos[planoId] || 0;
            const percentual = teto > 0 ? (item.Total / teto) * 100 : 0;
            let alerta = null;

            // Mensagens focadas em não ultrapassar o teto
            if (percentual > 101) {
                alerta = {
                    percentual: 101,
                    mensagem: `Atenção! Você ULTRAPASSOU o teto de gastos do plano ${planoId}.`
                };
            } else if (percentual >= 100) {
                alerta = {
                    percentual: 100,
                    mensagem: `Atenção! Você atingiu o teto de gastos do plano ${planoId}.`
                };
            } else if (percentual >= 95) {
                alerta = {
                    percentual: 95,
                    mensagem: `Alerta: Você está em 95% do teto de gastos do plano ${planoId}.`
                };
            } else if (percentual >= 90) {
                alerta = {
                    percentual: 90,
                    mensagem: `Alerta: Você está em 90% do teto de gastos do plano ${planoId}.`
                };
            } else if (percentual >= 85) {
                alerta = {
                    percentual: 85,
                    mensagem: `Alerta: Você está em 85% do teto de gastos do plano ${planoId}.`
                };
            } else if (percentual >= 80) {
                alerta = {
                    percentual: 80,
                    mensagem: `Alerta: Você está em 80% do teto de gastos do plano ${planoId}.`
                };
            } else if (percentual >= 70) {
                alerta = {
                    percentual: 70,
                    mensagem: `Alerta: Você está em 70% do teto de gastos do plano ${planoId}.`
                };
            } else if (percentual >= 50) {
                alerta = {
                    percentual: 50,
                    mensagem: `Alerta: Você está em 50% do teto de gastos do plano ${planoId}.`
                };
            }

            return {
                PlanoContasID: planoId,
                Total: item.Total,
                Teto: teto,
                Percentual: percentual,
                Alerta: alerta
            };
        });

        res.json(dataWithLimits);
    } catch (error) {
        console.error('Erro ao buscar tetos:', error);
        res.status(500).json({ message: 'Erro ao buscar tetos.' });
    }
});


app.get('/api/reports/weekly', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 (domingo) a 6 (sábado)
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23,59,59,999);

    try {
        // Busca gastos da semana
        const [expenses] = await pool.query(
            `SELECT * FROM expenses WHERE user_id = ? AND transaction_date BETWEEN ? AND ? ORDER BY transaction_date`,
            [userId, start.toISOString().slice(0,10), end.toISOString().slice(0,10)]
        );

        // Resumo
        const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const porConta = {};
        const porTipo = { Pessoal: 0, Empresarial: 0 };
        const porDia = {};
        expenses.forEach(e => {
            porConta[e.account] = (porConta[e.account] || 0) + parseFloat(e.amount);
            if (e.is_business_expense) porTipo.Empresarial += parseFloat(e.amount);
            else porTipo.Pessoal += parseFloat(e.amount);

            const dia = new Date(e.transaction_date).toLocaleDateString('pt-BR');
            porDia[dia] = (porDia[dia] || 0) + parseFloat(e.amount);
        });

        // Top 5 maiores gastos
        const topGastos = [...expenses]
            .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
            .slice(0, 5);

        // Gráfico de barras por conta
        const chartCanvas = new ChartJSNodeCanvas({ width: 600, height: 300 });
        const chartBarBuffer = await chartCanvas.renderToBuffer({
            type: 'bar',
            data: {
                labels: Object.keys(porConta),
                datasets: [{
                    label: 'Gastos por Conta',
                    data: Object.values(porConta),
                    backgroundColor: [
                        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1'
                    ]
                }]
            },
            options: { plugins: { legend: { display: false } } }
        });

        // Gráfico de pizza por tipo
        const chartPieBuffer = await chartCanvas.renderToBuffer({
            type: 'pie',
            data: {
                labels: Object.keys(porTipo),
                datasets: [{
                    data: Object.values(porTipo),
                    backgroundColor: ['#3B82F6', '#EF4444']
                }]
            }
        });

        // Gráfico de linha por dia
        const diasLabels = Object.keys(porDia);
        const diasValores = diasLabels.map(d => porDia[d]);
        const chartLineBuffer = await chartCanvas.renderToBuffer({
            type: 'line',
            data: {
                labels: diasLabels,
                datasets: [{
                    label: 'Gastos por Dia',
                    data: diasValores,
                    borderColor: '#6366F1',
                    backgroundColor: 'rgba(99,102,241,0.2)',
                    fill: true,
                    tension: 0.3
                }]
            }
        });

        // Gera PDF
        const doc = new pdfkit({ autoFirstPage: false });
        doc.registerFont('NotoSans', path.join(__dirname, 'fonts', 'NotoSans-Regular.ttf'));
        doc.font('NotoSans');

        // Página de capa
        doc.addPage({ margin: 40, size: 'A4', layout: 'portrait', bufferPages: true });
        doc.rect(0, 0, doc.page.width, 90).fill('#3B82F6');
        doc.fillColor('white').fontSize(32).text('📅 Relatório Semanal de Gastos', 0, 30, { align: 'center', width: doc.page.width });
        doc.moveDown(2);
        doc.fillColor('#222').fontSize(16).text(`Período: ${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).fillColor('#10B981').text(`Total gasto: R$ ${total.toFixed(2)}`, { align: 'center' });
        doc.moveDown(2);
        doc.fillColor('#6B7280').fontSize(12).text('Relatório gerado automaticamente pelo sistema Controle de Gastos', { align: 'center' });

        // Gráfico de barras por conta
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 40).fill('#6366F1');
        doc.fillColor('white').fontSize(20).text('💳 Gastos por Conta', 0, 10, { align: 'center', width: doc.page.width });
        doc.moveDown(2);
        doc.image(chartBarBuffer, { fit: [500, 200], align: 'center' });
        doc.moveDown();
        Object.entries(porConta).forEach(([conta, valor]) => {
            doc.fontSize(12).fillColor('#222').text(`- ${conta}: R$ ${valor.toFixed(2)}`);
        });

        // Gráfico de pizza por tipo
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 40).fill('#F59E0B');
        doc.fillColor('white').fontSize(20).text('🏷️ Distribuição por Tipo', 0, 10, { align: 'center', width: doc.page.width });
        doc.moveDown(2);
        doc.image(chartPieBuffer, { fit: [300, 200], align: 'center' });
        doc.moveDown();
        Object.entries(porTipo).forEach(([tipo, valor]) => {
            doc.fontSize(12).fillColor(tipo === 'Empresarial' ? '#EF4444' : '#3B82F6').text(`- ${tipo}: R$ ${valor.toFixed(2)}`);
        });

        // Gráfico de linha por dia
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 40).fill('#10B981');
        doc.fillColor('white').fontSize(20).text('📈 Evolução Diária dos Gastos', 0, 10, { align: 'center', width: doc.page.width });
        doc.moveDown(2);
        doc.image(chartLineBuffer, { fit: [500, 200], align: 'center' });

        // Top 5 maiores gastos
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 40).fill('#EF4444');
        doc.fillColor('white').fontSize(20).text('🔥 Top 5 Maiores Gastos da Semana', 0, 10, { align: 'center', width: doc.page.width });
        doc.moveDown(2);
        topGastos.forEach((e, idx) => {
            doc.fontSize(13).fillColor('#222').text(
                `${idx + 1}. ${new Date(e.transaction_date).toLocaleDateString('pt-BR')} | ${e.account} | R$ ${parseFloat(e.amount).toFixed(2)} | ${e.description}`
            );
        });

        // Lista de todas as transações
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 40).fill('#3B82F6');
        doc.fillColor('white').fontSize(20).text('📋 Todas as Transações da Semana', 0, 10, { align: 'center', width: doc.page.width });
        doc.moveDown(2);
        expenses.forEach(e => {
            doc.fontSize(10).fillColor('#222').text(
                `🗓️ ${new Date(e.transaction_date).toLocaleDateString('pt-BR')} | R$ ${parseFloat(e.amount).toFixed(2)} | ${e.account} | ${e.description} | ${e.is_business_expense ? 'Empresarial 💼' : 'Pessoal 🏠'}`
            );
        });

        // Rodapé
        doc.fontSize(10).fillColor('#6B7280').text('Obrigado por usar o Controle de Gastos! 🚀', 0, doc.page.height - 40, { align: 'center', width: doc.page.width });

        doc.end();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=relatorio-semanal.pdf');
        doc.pipe(res);
    } catch (error) {
        console.error('Erro ao gerar relatório semanal:', error);
        res.status(500).json({ message: 'Erro ao gerar relatório semanal.' });
    }
});

// Função para gerar gráficos para o PDF
async function generateChartsForPDF(porPlano, porConta, expenses, chartJSNodeCanvas) {
    const charts = {};
    
    try {
        // 1. Gráfico de pizza - Distribuição por Plano de Conta
        const planLabels = Object.keys(porPlano);
        const planValues = Object.values(porPlano);
        
        if (planLabels.length > 0) {
            const planConfig = {
                type: 'pie',
                data: {
                    labels: planLabels.map((p, index) => {
                        const valor = planValues[index];
                        const total = planValues.reduce((a, b) => a + b, 0);
                        const percentage = ((valor / total) * 100).toFixed(1);
                        return `Plano ${p}: R$ ${valor.toFixed(2)} (${percentage}%)`;
                    }),
                    datasets: [{
                        data: planValues,
                        backgroundColor: [
                            '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                            '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
                        ],
                        borderWidth: 3,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 20,
                            bottom: 20,
                            left: 20,
                            right: 20
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 15,
                                usePointStyle: true,
                                font: {
                                    size: 12,
                                    weight: 'bold'
                                },
                                color: '#374151'
                            }
                        },
                        title: {
                            display: true,
                            text: '📊 DISTRIBUIÇÃO POR PLANO DE CONTA',
                            font: { 
                                size: 18, 
                                weight: 'bold' 
                            },
                            color: '#1F2937',
                            padding: {
                                top: 10,
                                bottom: 20
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${label}: R$ ${value.toFixed(2)} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            };
            charts.planChart = await chartJSNodeCanvas.renderToBuffer(planConfig);
        }

        // 2. Gráfico de barras - Distribuição por Conta
        const accountLabels = Object.keys(porConta);
        const accountValues = Object.values(porConta);
        
        if (accountLabels.length > 0) {
            const accountConfig = {
                type: 'bar',
                data: {
                    labels: accountLabels,
                    datasets: [{
                        label: 'Valor (R$)',
                        data: accountValues,
                        backgroundColor: [
                            '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                            '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
                        ],
                        borderColor: [
                            '#1E40AF', '#047857', '#D97706', '#DC2626', '#7C3AED',
                            '#0891B2', '#65A30D', '#EA580C', '#DB2777', '#4F46E5'
                        ],
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 20,
                            bottom: 20,
                            left: 20,
                            right: 20
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: '🏦 GASTOS POR CONTA',
                            font: { 
                                size: 18, 
                                weight: 'bold' 
                            },
                            color: '#1F2937',
                            padding: {
                                top: 10,
                                bottom: 20
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.parsed.y;
                                    return `${context.label}: R$ ${value.toFixed(2)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                font: {
                                    size: 11,
                                    weight: 'bold'
                                },
                                color: '#374151'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: '#E5E7EB',
                                lineWidth: 1
                            },
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value.toFixed(2);
                                },
                                font: {
                                    size: 11
                                },
                                color: '#6B7280'
                            }
                        }
                    }
                }
            };
            charts.accountChart = await chartJSNodeCanvas.renderToBuffer(accountConfig);
        }

        // 3. Gráfico de comparação - Pessoal vs Empresarial
        const totalPessoal = expenses.filter(e => !e.is_business_expense).reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const totalEmpresarial = expenses.filter(e => e.is_business_expense).reduce((sum, e) => sum + parseFloat(e.amount), 0);
        
        if (totalPessoal > 0 || totalEmpresarial > 0) {
            const comparisonConfig = {
                type: 'doughnut',
                data: {
                    labels: [
                        `🏠 Pessoal: R$ ${totalPessoal.toFixed(2)}`,
                        `💼 Empresarial: R$ ${totalEmpresarial.toFixed(2)}`
                    ],
                    datasets: [{
                        data: [totalPessoal, totalEmpresarial],
                        backgroundColor: ['#10B981', '#F59E0B'],
                        borderWidth: 4,
                        borderColor: '#ffffff',
                        hoverBackgroundColor: ['#059669', '#D97706'],
                        hoverBorderWidth: 6
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    layout: {
                        padding: {
                            top: 20,
                            bottom: 20,
                            left: 20,
                            right: 20
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 15,
                                usePointStyle: true,
                                font: {
                                    size: 14,
                                    weight: 'bold'
                                },
                                color: '#374151'
                            }
                        },
                        title: {
                            display: true,
                            text: '💼 PESSOAL vs EMPRESARIAL',
                            font: { 
                                size: 18, 
                                weight: 'bold' 
                            },
                            color: '#1F2937',
                            padding: {
                                top: 10,
                                bottom: 20
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.parsed;
                                    const total = totalPessoal + totalEmpresarial;
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${context.label} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            };
            charts.comparisonChart = await chartJSNodeCanvas.renderToBuffer(comparisonConfig);
        }

        // 4. Gráfico de linha - Evolução diária (se houver dados suficientes)
        const dailyData = {};
        expenses.forEach(e => {
            const day = new Date(e.transaction_date).getDate();
            dailyData[day] = (dailyData[day] || 0) + parseFloat(e.amount);
        });

        const days = Object.keys(dailyData).map(Number).sort((a, b) => a - b);
        if (days.length > 3) {
            const evolutionConfig = {
                type: 'line',
                data: {
                    labels: days.map(d => `Dia ${d}`),
                    datasets: [{
                        label: 'Gastos Diários (R$)',
                        data: days.map(d => dailyData[d]),
                        borderColor: '#3B82F6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 4,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#3B82F6',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 3,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 20,
                            bottom: 20,
                            left: 20,
                            right: 20
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: '📈 EVOLUÇÃO DIÁRIA DOS GASTOS',
                            font: { 
                                size: 18, 
                                weight: 'bold' 
                            },
                            color: '#1F2937',
                            padding: {
                                top: 10,
                                bottom: 20
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                color: '#E5E7EB',
                                lineWidth: 1
                            },
                            ticks: {
                                font: {
                                    size: 11,
                                    weight: 'bold'
                                },
                                color: '#374151'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: '#E5E7EB',
                                lineWidth: 1
                            },
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value.toFixed(2);
                                },
                                font: {
                                    size: 11
                                },
                                color: '#6B7280'
                            }
                        }
                    }
                }
            };
            charts.evolutionChart = await chartJSNodeCanvas.renderToBuffer(evolutionConfig);
        }

    } catch (error) {
        console.error('Erro ao gerar gráficos para PDF:', error);
    }
    
    return charts;
}

app.post('/api/reports/monthly', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { year, month, account } = req.body;

    if (!year || !month) {
        return res.status(400).json({ message: 'Ano e mês são obrigatórios.' });
    }

    try {
        console.log(`🎯 Iniciando geração de relatório mensal - User: ${userId}, Ano: ${year}, Mês: ${month}, Conta: ${account || 'Todas'}`);

        // Determina período vigente se for por conta
        let startDate, endDate;
        let contaNome = account || 'Todas as Contas';
        
        if (account && billingPeriods[account]) {
            const { startDay, endDay } = billingPeriods[account];
            startDate = new Date(year, month - 1, startDay);
            let endMonth = Number(month);
            let endYear = Number(year);
            if (endDay <= startDay) {
                endMonth++;
                if (endMonth > 12) { endMonth = 1; endYear++; }
            }
            endDate = new Date(endYear, endMonth - 1, endDay);
        } else {
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 0);
        }

        // Busca despesas do período - incluindo PIX e Boleto
        let sql = `SELECT * FROM expenses WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?`;
        let params = [userId, startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10)];
        
        // Se conta específica foi solicitada, filtrar por ela
        if (account && account !== 'ALL') {
            sql += ' AND account = ?';
            params.push(account);
        }
        
        sql += ' ORDER BY transaction_date';
        const [expenses] = await pool.query(sql, params);

        console.log(`📊 Encontradas ${expenses.length} despesas para o período`);

        if (expenses.length === 0) {
            // Criar PDF simples para período sem gastos
            const doc = new pdfkit();
            doc.registerFont('NotoSans', path.join(__dirname, 'fonts', 'NotoSans-Regular.ttf'));
            doc.font('NotoSans');

            // Capa colorida para período sem gastos
            doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F0FDF4');
            doc.fillColor('#059669').fontSize(48).text('🎉', 250, 200);
            doc.moveDown(2);
            doc.fontSize(24).fillColor('#065F46').text('Parabéns!', { align: 'center' });
            doc.moveDown(1);
            doc.fontSize(16).fillColor('#047857').text('Nenhum gasto registrado neste período', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(14).fillColor('#059669').text(`Período: ${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`, { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(12).fillColor('#065F46').text(`Conta: ${contaNome}`, { align: 'center' });
            
            doc.end();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio-vazio-${year}-${month}.pdf`);
            doc.pipe(res);
            return;
        }

        // Análise dos dados
    // Classificação mais robusta: prioridade flags explícitas
    const empresariais = expenses.filter(e => e.is_business_expense === 1 || e.is_business_expense === true || e.is_personal === 0);
    const pessoais = expenses.filter(e => (e.is_personal === 1 || e.is_personal === true) || (e.is_business_expense === 0 || e.is_business_expense === false) );
    // Evitar sobreposição duplicada caso flags inconsistentes
    const empresarialIds = new Set(empresariais.map(e=>e.id));
    const pessoaisFiltrados = pessoais.filter(e => !empresarialIds.has(e.id));
        
        const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const totalEmpresarial = empresariais.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const totalPessoal = pessoaisFiltrados.reduce((sum, e) => sum + parseFloat(e.amount), 0);

        // ===== Dados do mês anterior para comparativo =====
    // Agrupamentos para gráficos (definir antes de usar comparativos)
    const porPlano = {};
        const porConta = {};
        const porDia = {};
        
        expenses.forEach(e => {
            const plano = e.account_plan_code || 'Sem Plano';
            const conta = e.account || 'Sem Conta';
            const dia = new Date(e.transaction_date).getDate();
            
            porPlano[plano] = (porPlano[plano] || 0) + parseFloat(e.amount);
            porConta[conta] = (porConta[conta] || 0) + parseFloat(e.amount);
            porDia[dia] = (porDia[dia] || 0) + parseFloat(e.amount);
        });

    // Após popular porPlano podemos calcular comparativo mês anterior
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevStart = new Date(prevYear, prevMonth - 1, 1);
    const prevEnd = new Date(prevYear, prevMonth, 0);
    let prevSql = `SELECT id, amount, account_plan_code, is_business_expense, transaction_date FROM expenses WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?`;
    const [prevExpenses] = await pool.query(prevSql, [userId, prevStart.toISOString().slice(0,10), prevEnd.toISOString().slice(0,10)]);
    const prevByPlan = {};
    prevExpenses.forEach(e => { const plano = e.account_plan_code || 'Sem Plano'; prevByPlan[plano] = (prevByPlan[plano] || 0) + parseFloat(e.amount); });
    const currByPlan = {}; Object.entries(porPlano).forEach(([p,v])=> currByPlan[p]=v);

    // Maior gasto e menor gasto
        const maiores = expenses.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
        const maiorGasto = maiores[0];
        const menorGasto = maiores[maiores.length - 1];

        // 🎨 GERAR GRÁFICOS
        console.log('📊 Gerando gráficos para o PDF...');
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
            width: 800, 
            height: 500, 
            backgroundColour: 'white'
        });

        const chartImages = await generateChartsForPDF(porPlano, porConta, expenses, chartJSNodeCanvas);
        console.log('✅ Gráficos gerados com sucesso!');

        // Gera PDF estilizado
    const doc = new pdfkit();
        doc.registerFont('NotoSans', path.join(__dirname, 'fonts', 'NotoSans-Regular.ttf'));
        // Registro opcional de fontes de emoji (se presentes na pasta fonts)
        const emojiFontCandidates = ['NotoColorEmoji.ttf','NotoEmoji-Regular.ttf','Symbola.ttf','DejaVuSans.ttf'];
        let emojiFontFound = false;
    for (const fname of emojiFontCandidates) {
            const fpath = path.join(__dirname,'fonts',fname);
            if (fs.existsSync(fpath)) {
                try { doc.registerFont('EmojiCapable', fpath); emojiFontFound = true; break; } catch(_) {}
            }
        }
        // Helper simples para texto com possíveis emojis (usa fonte fallback se existir)
        const useEmojiFont = (text) => emojiFontFound && /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
        // Renderização simples com fallback de fonte para emojis (sem criação de imagens).
        const originalTextFn = doc.text.bind(doc);
        doc.text = function(text, x, y, options = {}) {
            return originalTextFn(text, x, y, options);
        };
        doc.font('NotoSans');

        // 🎨 CAPA SUPER ESTILIZADA
        doc.rect(0, 0, doc.page.width, doc.page.height)
           .fill('#1E293B'); // Fundo escuro elegante

        // Gradiente simulado com retângulos
        doc.rect(0, 0, doc.page.width, 200).fill('#3B82F6');
        doc.rect(0, 150, doc.page.width, 100).fill('#6366F1');
        doc.rect(0, 200, doc.page.width, 50).fill('#8B5CF6');

    // Título principal com emoji grande (centralizado absoluto)
    doc.fillColor('#FFFFFF').fontSize(60).text('📊', 0, 80, { align: 'center', width: doc.page.width });
    doc.fontSize(30).fillColor('#FFFFFF').text('RELATÓRIO FINANCEIRO', 0, 155, { align: 'center', width: doc.page.width });
    doc.fontSize(22).fillColor('#E0E7FF').text('✨ MENSAL PREMIUM ✨', 0, 190, { align: 'center', width: doc.page.width });
        
        // Período em destaque
    doc.moveDown(2.2);
    const periodoBoxY = doc.y;
    doc.roundedRect(70, periodoBoxY, doc.page.width - 140, 60, 18).fill('#FFFFFF');
    doc.fillColor('#1E293B').fontSize(18).text(`🗓️ Período: ${startDate.toLocaleDateString('pt-BR')} → ${endDate.toLocaleDateString('pt-BR')}`, 0, periodoBoxY + 20, { align: 'center', width: doc.page.width });
    doc.moveDown(3.2);

        // Total em destaque gigante
    const totalBoxY = doc.y;
    doc.roundedRect(40, totalBoxY, doc.page.width - 80, 130, 24).fill('#10B981');
    doc.fillColor('#FFFFFF').fontSize(56).text('💰', 70, totalBoxY + 32);
    doc.fontSize(28).text(`R$ ${total.toFixed(2)}`, 150, totalBoxY + 25, { width: 300, align: 'left' });
    doc.fontSize(14).text('TOTAL GASTO NO PERÍODO', 150, totalBoxY + 60, { width: 300, align: 'left' });
    doc.fontSize(12).fillColor('#E6FFFA').text(`Pessoal: R$ ${totalPessoal.toFixed(2)}  |  Empresarial: R$ ${totalEmpresarial.toFixed(2)}`, 150, totalBoxY + 82, { width: 350, align: 'left' });
    doc.y = totalBoxY + 150;

        // Conta em foco
    const contaBoxY = doc.y;
    doc.roundedRect(140, contaBoxY, doc.page.width - 280, 55, 14).fill('#F59E0B');
    doc.fillColor('#FFFFFF').fontSize(18).text(`🏦 Conta: ${contaNome}`, 0, contaBoxY + 18, { align: 'center', width: doc.page.width });
    doc.y = contaBoxY + 90;

        // Rodapé da capa
    doc.fillColor('#CBD5E1').fontSize(12).text('Gerado pelo Sistema de Controle Financeiro 🚀', 0, doc.page.height - 60, { align: 'center', width: doc.page.width });

        // 📈 PÁGINA DE RESUMO EXECUTIVO
        doc.addPage();
        
        // Cabeçalho colorido
        doc.rect(0, 0, doc.page.width, 80).fill('#EF4444');
        doc.fillColor('#FFFFFF').fontSize(24).text('🎯 RESUMO EXECUTIVO', 50, 25);
        doc.moveDown(3);

        // Cards de resumo estilizados
        const cardY = doc.y;
        
        // Card Total
        doc.roundedRect(50, cardY, 150, 100, 10).fill('#3B82F6');
        doc.fillColor('#FFFFFF').fontSize(12).text('TOTAL GERAL', 60, cardY + 15, { width: 130, align: 'left' });
        doc.fontSize(16).text(`R$ ${total.toFixed(2)}`, 60, cardY + 35, { width: 130, align: 'left' });
        doc.fontSize(10).text(`${expenses.length} transações`, 60, cardY + 65, { width: 130, align: 'left' });

        // Card Pessoal
        doc.roundedRect(220, cardY, 150, 100, 10).fill('#10B981');
        doc.fillColor('#FFFFFF').fontSize(12).text('PESSOAL 🏠', 230, cardY + 15, { width: 130, align: 'left' });
        doc.fontSize(16).text(`R$ ${totalPessoal.toFixed(2)}`, 230, cardY + 35, { width: 130, align: 'left' });
        doc.fontSize(10).text(`${pessoais.length} transações`, 230, cardY + 65, { width: 130, align: 'left' });

        // Card Empresarial
        doc.roundedRect(390, cardY, 150, 100, 10).fill('#F59E0B');
        doc.fillColor('#FFFFFF').fontSize(12).text('EMPRESARIAL 💼', 400, cardY + 15, { width: 130, align: 'left' });
        doc.fontSize(16).text(`R$ ${totalEmpresarial.toFixed(2)}`, 400, cardY + 35, { width: 130, align: 'left' });
        doc.fontSize(10).text(`${empresariais.length} transações`, 400, cardY + 65, { width: 130, align: 'left' });

        doc.y = cardY + 120;
        doc.moveDown(1);

        // Destaques importantes
        doc.fontSize(16).fillColor('#1E293B').text('🌟 DESTAQUES DO PERÍODO', { underline: true });
        doc.moveDown(0.5);

        if (maiorGasto) {
            doc.roundedRect(50, doc.y, 490, 40, 8).fill('#FEF3C7');
            doc.fillColor('#92400E').fontSize(12).text(`🔥 MAIOR GASTO: R$ ${parseFloat(maiorGasto.amount).toFixed(2)} - ${maiorGasto.description}`, 60, doc.y + 12, { width: 470, align: 'left' });
            doc.y += 50;
        }

        if (menorGasto && menorGasto !== maiorGasto) {
            doc.roundedRect(50, doc.y, 490, 40, 8).fill('#D1FAE5');
            doc.fillColor('#065F46').fontSize(12).text(`💚 MENOR GASTO: R$ ${parseFloat(menorGasto.amount).toFixed(2)} - ${menorGasto.description}`, 60, doc.y + 12, { width: 470, align: 'left' });
            doc.y += 50;
        }

        // Média diária
        const mediaDiaria = total / new Date(year, month, 0).getDate();
        doc.roundedRect(50, doc.y, 490, 40, 8).fill('#DBEAFE');
        doc.fillColor('#1E40AF').fontSize(12).text(`📊 MÉDIA DIÁRIA: R$ ${mediaDiaria.toFixed(2)}`, 60, doc.y + 12, { width: 470, align: 'left' });
        doc.y += 60;

        // 📘 PÁGINA DE RESUMO CONSOLIDADO (reposicionada para evitar variáveis não definidas)
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 70).fill('#3B82F6');
        doc.fillColor('#FFFFFF').fontSize(22).text('📘 RESUMO CONSOLIDADO', 0, 25, { align: 'center', width: doc.page.width });
        doc.moveDown(2);
        const resumoStartY = doc.y;
        const boxWidth = (doc.page.width - 140) / 2;
        const leftX = 60;
        const rightX = leftX + boxWidth + 20;
        // Bloco Totais
        doc.roundedRect(leftX, resumoStartY, boxWidth, 110, 14).fill('#F0F9FF');
        doc.fillColor('#0C4A6E').fontSize(14).text('Totais Gerais', leftX + 15, resumoStartY + 12);
        doc.fontSize(11).fillColor('#0369A1').text(`💰 Total: R$ ${total.toFixed(2)}`, leftX + 15, resumoStartY + 38);
        doc.text(`🏠 Pessoal: R$ ${totalPessoal.toFixed(2)}`, leftX + 15, resumoStartY + 56);
        doc.text(`💼 Empresarial: R$ ${totalEmpresarial.toFixed(2)}`, leftX + 15, resumoStartY + 74);
        // Bloco Distribuição
        doc.roundedRect(rightX, resumoStartY, boxWidth, 110, 14).fill('#F1F5F9');
        doc.fillColor('#111827').fontSize(14).text('Distribuição (%)', rightX + 15, resumoStartY + 12);
        const pessoalPerc = total > 0 ? ((totalPessoal/total)*100).toFixed(1) : '0.0';
        const empPerc = total > 0 ? ((totalEmpresarial/total)*100).toFixed(1) : '0.0';
        doc.fontSize(11).fillColor('#059669').text(`🏠 Pessoal: ${pessoalPerc}%`, rightX + 15, resumoStartY + 38);
        doc.fillColor('#D97706').text(`💼 Empresarial: ${empPerc}%`, rightX + 15, resumoStartY + 56);
        doc.fillColor('#6366F1').text(`📊 Média diária: R$ ${mediaDiaria.toFixed(2)}`, rightX + 15, resumoStartY + 74);
        // Bloco Extremos
        const bloco2Y = resumoStartY + 130;
        doc.roundedRect(leftX, bloco2Y, boxWidth, 110, 14).fill('#FEF3C7');
        doc.fillColor('#92400E').fontSize(14).text('Extremos', leftX + 15, bloco2Y + 12);
        if (maiorGasto) {
            doc.fontSize(11).text(`🔥 Maior: R$ ${parseFloat(maiorGasto.amount).toFixed(2)}`, leftX + 15, bloco2Y + 38);
        }
        if (menorGasto && menorGasto !== maiorGasto) {
            doc.fontSize(11).text(`💚 Menor: R$ ${parseFloat(menorGasto.amount).toFixed(2)}`, leftX + 15, bloco2Y + 56);
        }
        doc.fontSize(11).fillColor('#0F172A').text(`💳 Planos ativos: ${Object.keys(porPlano).length}`, leftX + 15, bloco2Y + 74);
        // Bloco Alertas de Tetos
        doc.roundedRect(rightX, bloco2Y, boxWidth, 110, 14).fill('#FFF1F2');
        doc.fillColor('#BE123C').fontSize(14).text('Alertas de Teto', rightX + 15, bloco2Y + 12);
        const planosCriticos = Object.entries(porPlano)
              .filter(([p,v]) => tetos[p] && v / tetos[p] >= 0.9)
              .sort((a,b) => (b[1]/tetos[b[0]]) - (a[1]/tetos[a[0]]))
              .slice(0,4);
        if (planosCriticos.length === 0) {
            doc.fontSize(11).fillColor('#4B5563').text('Nenhum plano acima de 90% 👍', rightX + 15, bloco2Y + 42);
        } else {
            let offsetY = bloco2Y + 34;
            planosCriticos.forEach(([p,v]) => {
                const perc = ((v / tetos[p]) * 100).toFixed(1);
                doc.fontSize(11).fillColor('#DC2626').text(`⚠️ Plano ${p}: ${perc}%`, rightX + 15, offsetY);
                offsetY += 18;
            });
        }
        // Legenda final
        doc.fontSize(10).fillColor('#475569').text('Resumo consolidado para visão rápida de desempenho financeiro.', 0, bloco2Y + 130, { align: 'center', width: doc.page.width });

        // 📊 PÁGINA DE GRÁFICO - DISTRIBUIÇÃO POR PLANO
        if (chartImages.planChart) {
            doc.addPage();
            doc.rect(0, 0, doc.page.width, 80).fill('#3B82F6');
            doc.fillColor('#FFFFFF').fontSize(24).text('📊 DISTRIBUIÇÃO POR PLANO', 50, 25);
            doc.moveDown(3);

            // Centralizar e ajustar gráfico
            const chartWidth = 480;
            const chartHeight = 300;
            const chartX = (doc.page.width - chartWidth) / 2;
            
            doc.image(chartImages.planChart, chartX, doc.y, { 
                width: chartWidth, 
                height: chartHeight
            });
            doc.y += chartHeight + 40;

            // Dados detalhados por plano
            if (doc.y > 550) {
                doc.addPage();
                doc.moveDown(2);
            }
            
            // Título da seção com fundo
            doc.roundedRect(50, doc.y, 490, 40, 8).fill('#1E293B');
            doc.fillColor('#FFFFFF').fontSize(18).text('📋 DETALHAMENTO POR PLANO', 70, doc.y + 12, { width: 400, align: 'left' });
            doc.y += 50;
            doc.moveDown(0.5);
            
            // Verificar se existem planos
            if (Object.keys(porPlano).length === 0) {
                doc.roundedRect(50, doc.y, 490, 50, 8).fill('#F3F4F6');
                doc.fillColor('#6B7280').fontSize(14).text('📝 Nenhum plano de conta encontrado neste período', 70, doc.y + 18, { width: 400, align: 'center' });
                doc.y += 60;
            } else {
                Object.entries(porPlano).forEach(([plano, valor], index) => {
                    if (doc.y > 620) {
                        doc.addPage();
                        doc.moveDown(2);
                    }
                    
                    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];
                    const color = colors[index % colors.length];
                    
                    // ----- CARD PLANO (layout revisado) -----
                    const cardHeight = 100;
                    doc.roundedRect(52, doc.y + 2, 490, cardHeight, 14).fill('#00000025'); // sombra
                    const bgColor = ['#F8FAFC', '#EEF2FF', '#F0FDF4', '#FEF9C3', '#EFF6FF', '#FFF7ED', '#F1F5F9'][index % 7];
                    doc.roundedRect(50, doc.y, 490, cardHeight, 14).fill(bgColor);
                    const cardY = doc.y;
                    const isRecorrente = expenses.some(e => e.account_plan_code == plano && e.is_recurring_expense);
                    // Linha 1
                    doc.font('NotoSans').fillColor('#1E293B').fontSize(18).text(`PLANO ${plano}`, 95, cardY + 18, { width: 240 });
                    doc.fontSize(16).fillColor('#1E293B').text(isRecorrente ? '🔁' : '💳', 65, cardY + 20);
                    doc.fontSize(24).fillColor('#059669').text(`R$ ${valor.toFixed(2)}`, 300, cardY + 15, { width: 200, align: 'right' });
                    // Linha 2 combinada
                    const percentual = ((valor/total)*100).toFixed(1);
                    const transacoesPlano = expenses.filter(e => e.installment_plan == plano).length;
                    doc.fontSize(11).fillColor('#334155').text(`📊 ${percentual}%  •  📝 ${transacoesPlano} transação${transacoesPlano !== 1 ? 's' : ''}`, 95, cardY + 50, { width: 300 });
                    // Uso vs teto (linha 2 direita)
                    if (tetos && tetos[plano] !== undefined && tetos[plano] > 0) {
                        const teto = tetos[plano];
                        const usoPercent = (valor / teto) * 100;
                        let statusColor = '#10B981'; let statusEmoji = '✅';
                        if (usoPercent >= 100) { statusColor = '#DC2626'; statusEmoji = '🔥'; }
                        else if (usoPercent >= 90) { statusColor = '#F97316'; statusEmoji = '⚠️'; }
                        else if (usoPercent >= 75) { statusColor = '#F59E0B'; statusEmoji = '🟡'; }
                        doc.fontSize(10).fillColor(statusColor).text(`${statusEmoji} ${usoPercent.toFixed(1)}% do teto`, 320, cardY + 52, { width: 170, align: 'right' });
                    }
                    // Barra (linha 3)
                    const maxValue = Math.max(...Object.values(porPlano));
                    const barWidth = maxValue > 0 ? (valor / maxValue) * 260 : 0;
                    doc.roundedRect(95, cardY + 70, 260, 8, 4).fill('#E2E8F0');
                    if (barWidth > 0) doc.roundedRect(95, cardY + 70, barWidth, 8, 4).fill('#6366F1');
                    if (isRecorrente) doc.fontSize(10).fillColor('#F59E0B').text('Recorrente', 365, cardY + 70, { width: 130, align: 'right' });
                    doc.y += cardHeight + 15;
                });
            }
        }

        // 🏦 PÁGINA DE GRÁFICO - DISTRIBUIÇÃO POR CONTA (reposicionada / harmonizada)
        if (chartImages.accountChart) {
            doc.addPage();
            doc.rect(0, 0, doc.page.width, 90).fill('#1D4ED8');
            doc.fontSize(26).fillColor('#FFFFFF').text('🏦 DISTRIBUIÇÃO POR CONTA', 50, 30, { width: 500, align: 'center' });
            const chartWidth = 420; const chartHeight = 260; const chartX = (doc.page.width - chartWidth)/2; const startY = 120;
            doc.image(chartImages.accountChart, chartX, startY, { width: chartWidth, height: chartHeight });
            let y = startY + chartHeight + 30;
            doc.fontSize(18).fillColor('#1E293B').text('💳 DETALHAMENTO POR CONTA', 50, y, { width: 500, align: 'left' });
            y += 40;
            const entriesConta = Object.entries(porConta).sort((a,b)=> b[1]-a[1]);
            const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
            entriesConta.forEach(([conta, valor], index) => {
                if (y + 70 > doc.page.height - 60) { doc.addPage(); y = 80; doc.fontSize(18).fillColor('#1E293B').text('💳 DETALHAMENTO POR CONTA (cont.)', 50, y); y += 40; }
                const color = colors[index % colors.length];
                doc.roundedRect(60, y, 480, 62, 14).fill(color);
                doc.fillColor('#FFFFFF').fontSize(16).text(`🏦 ${conta}`, 80, y + 14, { width: 250 });
                doc.fontSize(22).text(`R$ ${valor.toFixed(2)}`, 300, y + 10, { width: 220, align: 'right' });
                doc.fontSize(11).text(`${((valor/total)*100).toFixed(1)}%  •  ${expenses.filter(e=>e.account===conta).length} transações`, 80, y + 40, { width: 380 });
                y += 80;
            });
        }

        // 💼 PÁGINA DE GRÁFICO - PESSOAL VS EMPRESARIAL (reposicionada)
        if (chartImages.comparisonChart) {
            doc.addPage();
            doc.rect(0, 0, doc.page.width, 90).fill('#0D9488');
            doc.fillColor('#FFFFFF').fontSize(26).text('💼 PESSOAL VS EMPRESARIAL', 50, 30, { width: 500, align: 'center' });
            const chartWidth = 380; const chartHeight = 260; const chartX = (doc.page.width - chartWidth)/2; const startY = 120;
            doc.image(chartImages.comparisonChart, chartX, startY, { width: chartWidth, height: chartHeight });
            let y = startY + chartHeight + 30;
            doc.fontSize(18).fillColor('#1E293B').text('📈 ANÁLISE COMPARATIVA', 50, y, { width: 500, align: 'left' });
            y += 30;
            // Cards lado a lado
            const cardHeight = 90; const cardWidth = 230; const leftX = 70; const rightX = 320;
            // Pessoal
            doc.roundedRect(leftX, y, cardWidth, cardHeight, 14).fill('#10B981');
            doc.fillColor('#FFFFFF').fontSize(13).text('GASTOS PESSOAIS 🏠', leftX + 15, y + 15);
            doc.fontSize(20).text(`R$ ${totalPessoal.toFixed(2)}`, leftX + 15, y + 38);
            doc.fontSize(10).text(`${pessoaisFiltrados.length} transações`, leftX + 15, y + 63);
            // Empresarial
            doc.roundedRect(rightX, y, cardWidth, cardHeight, 14).fill('#F59E0B');
            doc.fillColor('#FFFFFF').fontSize(13).text('GASTOS EMPRESARIAIS 💼', rightX + 15, y + 15);
            doc.fontSize(20).text(`R$ ${totalEmpresarial.toFixed(2)}`, rightX + 15, y + 38);
            doc.fontSize(10).text(`${empresariais.length} transações`, rightX + 15, y + 63);
        }

        // 📅 PÁGINA DE GRÁFICO - EVOLUÇÃO DIÁRIA
        if (chartImages.evolutionChart) {
            doc.addPage();
            doc.rect(0, 0, doc.page.width, 80).fill('#F59E0B');
            doc.fillColor('#FFFFFF').fontSize(24).text('📈 EVOLUÇÃO DIÁRIA', 50, 25);
            doc.moveDown(3);

            // Centralizar e ajustar gráfico
            const chartWidth = 480;
            const chartHeight = 300;
            const chartX = (doc.page.width - chartWidth) / 2;
            
            doc.image(chartImages.evolutionChart, chartX, doc.y, { 
                width: chartWidth, 
                height: chartHeight
            });
            doc.y += chartHeight + 40;

            // Análise da evolução
            if (doc.y > 650) {
                doc.addPage();
                doc.moveDown(1);
            }
            doc.fontSize(16).fillColor('#1E293B').text('📊 ANÁLISE DA EVOLUÇÃO', { underline: true });
            doc.moveDown(0.5);

            const diasComGastos = Object.keys(porDia).length;
            const maiorDia = Object.entries(porDia).reduce((max, [dia, valor]) => valor > max.valor ? {dia, valor} : max, {dia: '', valor: 0});

            doc.roundedRect(50, doc.y, 490, 35, 8).fill('#DBEAFE');
            doc.fillColor('#1E40AF').fontSize(12).text(`📅 Dias com gastos: ${diasComGastos}`, 60, doc.y + 8, { width: 470, align: 'left' });
            doc.y += 40;

            if (maiorDia.dia) {
                doc.roundedRect(50, doc.y, 490, 35, 8).fill('#FEF3C7');
                doc.fillColor('#92400E').fontSize(12).text(`🔥 Dia com maior gasto: ${maiorDia.dia} - R$ ${maiorDia.valor.toFixed(2)}`, 60, doc.y + 8, { width: 470, align: 'left' });
                doc.y += 40;
            }
        }

        // 💼 PÁGINA DE GASTOS EMPRESARIAIS DETALHADOS
        // === GASTOS EMPRESARIAIS (layout aprimorado tipo BI) ===
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 90).fill('#334155');
        doc.fillColor('#FFFFFF').fontSize(26).text('💼 GASTOS EMPRESARIAIS', 50, 30, { width: 500, align: 'center' });

        if (empresariais.length === 0) {
            doc.moveDown(4);
            doc.fontSize(16).fillColor('#6B7280').text('Nenhum gasto empresarial registrado no período.', { align: 'center' });
        } else {
            // KPIs rápidos (cards)
            const diasUnicosEmp = new Set(empresariais.map(e => new Date(e.transaction_date).toISOString().slice(0,10))).size;
            const mediaDiariaEmp = diasUnicosEmp ? totalEmpresarial / diasUnicosEmp : totalEmpresarial;
            const maiorEmp = empresariais.reduce((m,e)=> parseFloat(e.amount) > m ? parseFloat(e.amount) : m, 0);
            const menorEmp = empresariais.reduce((m,e)=> parseFloat(e.amount) < m ? parseFloat(e.amount) : m, parseFloat(empresariais[0].amount));
            const kpiY = 120;
            const kCard = (x, titulo, valor, cor) => {
                doc.roundedRect(x, kpiY, 155, 70, 12).fill(cor);
                doc.fillColor('#FFFFFF').fontSize(11).text(titulo, x + 12, kpiY + 12, { width: 140 });
                doc.fontSize(14).text(valor, x + 12, kpiY + 38, { width: 140 });
            };
            kCard(55, 'Total Empresarial', `R$ ${totalEmpresarial.toFixed(2)}`, '#0D9488');
            kCard(220, 'Dias c/ Gastos', diasUnicosEmp.toString(), '#6366F1');
            kCard(385, 'Média por Dia', `R$ ${mediaDiariaEmp.toFixed(2)}`, '#F59E0B');
            const kpi2Y = 200;
            const kCard2 = (x, titulo, valor, cor) => { doc.roundedRect(x, kpi2Y, 230, 60, 10).fill(cor); doc.fillColor('#FFFFFF').fontSize(11).text(titulo, x+12, kpi2Y+10, {width:210}); doc.fontSize(14).text(valor, x+12, kpi2Y+32, {width:210}); };
            kCard2(55, 'Maior Despesa', `R$ ${maiorEmp.toFixed(2)}`, '#DC2626');
            kCard2(305, 'Menor Despesa', `R$ ${menorEmp.toFixed(2)}`, '#10B981');
            // Top 5 planos
            const byPlanoEmp = {};
            empresariais.forEach(e=> { const p = e.account_plan_code || 'N/A'; byPlanoEmp[p] = (byPlanoEmp[p]||0) + parseFloat(e.amount); });
            const top5 = Object.entries(byPlanoEmp).sort((a,b)=>b[1]-a[1]).slice(0,5);
            let tableY = 280;
            doc.fontSize(16).fillColor('#1E293B').text('🏆 Top 5 Planos (Empresarial)', 50, tableY); tableY += 30;
            doc.fontSize(11);
            doc.roundedRect(50, tableY, 490, 22, 6).fill('#E2E8F0');
            doc.fillColor('#1E293B').text('Plano', 60, tableY + 7, {width:120});
            doc.text('Valor', 200, tableY + 7, {width:100});
            doc.text('% Total Emp.', 320, tableY + 7, {width:100});
            doc.text('Share', 420, tableY + 7, {width:100});
            tableY += 30;
            top5.forEach(([pl, val], i) => {
                if (tableY + 24 > doc.page.height - 120) { doc.addPage(); tableY = 80; }
                const pct = (val/totalEmpresarial)*100;
                doc.roundedRect(50, tableY, 490, 20, 4).fill(i%2? '#F8FAFC':'#FFFFFF');
                doc.fillColor('#1E293B').fontSize(10).text(pl, 60, tableY + 5, {width:120});
                doc.text(`R$ ${val.toFixed(2)}`, 200, tableY + 5, {width:100});
                doc.text(`${pct.toFixed(1)}%`, 320, tableY + 5, {width:100});
                // Barra share
                const barW = Math.min(120, (pct/100)*120);
                doc.roundedRect(420, tableY + 7, 120, 6, 3).fill('#E2E8F0');
                doc.roundedRect(420, tableY + 7, barW, 6, 3).fill('#6366F1');
                tableY += 28;
            });
            // Tabela detalhada
            let detY = tableY + 30;
            if (detY > doc.page.height - 160) { doc.addPage(); detY = 80; }
            doc.fontSize(16).fillColor('#1E293B').text('📄 Detalhamento (Empresarial)', 50, detY); detY += 28;
            doc.fontSize(9);
            const header = (y) => { doc.roundedRect(50, y, 490, 20, 4).fill('#0D9488'); doc.fillColor('#FFFFFF').text('Data',60,y+6,{width:60}); doc.text('Plano',120,y+6,{width:50}); doc.text('Conta',170,y+6,{width:90}); doc.text('Descrição',260,y+6,{width:150}); doc.text('Valor',415,y+6,{width:60}); doc.text('NF',470,y+6,{width:40}); };
            header(detY); detY += 26;
            empresariais.sort((a,b)=> new Date(b.transaction_date)-new Date(a.transaction_date)).forEach(e=> {
                if (detY + 18 > doc.page.height - 60) { doc.addPage(); detY = 60; header(detY); detY += 26; }
                const bg = detY % 2 === 0 ? '#FFFFFF' : '#F1F5F9';
                doc.roundedRect(50, detY, 490, 18, 2).fill(bg);
                doc.fillColor('#1E293B').text(new Date(e.transaction_date).toLocaleDateString('pt-BR'),60,detY+5,{width:60});
                doc.text(e.account_plan_code || '-',120,detY+5,{width:50});
                doc.text(e.account || '-',170,detY+5,{width:90});
                const desc = (e.description || '').substring(0,30);
                doc.text(desc,260,detY+5,{width:150});
                doc.text(parseFloat(e.amount).toFixed(2),415,detY+5,{width:60});
                doc.text(e.has_invoice? '✔':'',470,detY+5,{width:40});
                detY += 22;
            });
            // Nota explicativa
            if (detY + 60 > doc.page.height) { doc.addPage(); detY = 80; }
            doc.fontSize(9).fillColor('#475569').text('Nota: Para melhor visualização BI, considere integrar estes dados a um dashboard interativo com filtros por período, conta e plano.', 50, detY + 10, { width: 490 });
        }

        // === FIM EMPRESARIAL ===

        // 🏠 PÁGINA DE GASTOS PESSOAIS DETALHADOS (layout harmonizado tipo tabela)
        doc.addPage();
        doc.rect(0,0,doc.page.width,90).fill('#065F46');
        doc.fillColor('#FFFFFF').fontSize(26).text('🏠 GASTOS PESSOAIS DETALHADOS',50,30,{width:500,align:'center'});
        if (pessoaisFiltrados.length === 0) {
            doc.fontSize(16).fillColor('#6B7280').text('Nenhum gasto pessoal registrado no período.',0,150,{align:'center'});
        } else {
            const headerY = 130;
            const drawHeader = (y) => {
                doc.roundedRect(50,y,490,22,6).fill('#10B981');
                doc.fillColor('#FFFFFF').fontSize(10);
                doc.text('Data',60,y+7,{width:55});
                doc.text('Plano',115,y+7,{width:50});
                doc.text('Conta',165,y+7,{width:90});
                doc.text('Descrição',255,y+7,{width:180});
                doc.text('Valor',440,y+7,{width:80,align:'right'});
            };
            drawHeader(headerY);
            let rowY = headerY + 28;
            const sorted = [...pessoaisFiltrados].sort((a,b)=> new Date(b.transaction_date)-new Date(a.transaction_date));
            sorted.forEach((e,i)=>{
                if (rowY + 20 > doc.page.height - 60) { doc.addPage(); rowY = 60; drawHeader(rowY); rowY += 28; }
                const bg = i % 2 === 0 ? '#F1F5F9' : '#FFFFFF';
                doc.roundedRect(50,rowY,490,18,3).fill(bg);
                doc.fillColor('#1E293B').fontSize(9);
                doc.text(new Date(e.transaction_date).toLocaleDateString('pt-BR'),60,rowY+5,{width:55});
                doc.text(e.account_plan_code || '-',115,rowY+5,{width:50});
                doc.text(e.account || '-',165,rowY+5,{width:90});
                const desc = (e.description || '').substring(0,40);
                doc.text(desc,255,rowY+5,{width:180});
                doc.text(parseFloat(e.amount).toFixed(2),440,rowY+5,{width:80,align:'right'});
                rowY += 22;
            });
            if (rowY + 40 > doc.page.height) { doc.addPage(); rowY = 80; }
            const totalP = sorted.reduce((s,e)=> s + parseFloat(e.amount),0);
            doc.roundedRect(50,rowY,490,26,6).fill('#DCFCE7');
            doc.fillColor('#065F46').fontSize(11).text('TOTAL PESSOAL',60,rowY+8,{width:380});
            doc.text(`R$ ${totalP.toFixed(2)}`,440,rowY+8,{width:80,align:'right'});
        }

        // 🏦 PÁGINA POR CONTAS (LISTA RESUMIDA)
    // (Removida página antiga de resumo por contas para evitar página solta redundante)

    // 📋 PÁGINA DE TODAS AS TRANSAÇÕES (tabela compacta)
    doc.addPage();
    doc.rect(0,0,doc.page.width,90).fill('#0F766E');
    doc.fillColor('#FFFFFF').fontSize(26).text('📋 TODAS AS TRANSAÇÕES',50,30,{width:500,align:'center'});
    const drawTransHeader = (y)=>{doc.roundedRect(40,y,510,22,6).fill('#14B8A6');doc.fillColor('#FFFFFF').fontSize(10);doc.text('Data',50,y+7,{width:50});doc.text('Tipo',100,y+7,{width:40});doc.text('Plano',140,y+7,{width:50});doc.text('Conta',190,y+7,{width:90});doc.text('Descrição',280,y+7,{width:190});doc.text('Valor',470,y+7,{width:70,align:'right'});};
    let ty=130; drawTransHeader(ty); ty+=28; doc.fontSize(9);
    const sortedAll=[...expenses].sort((a,b)=> new Date(b.transaction_date)-new Date(a.transaction_date));
    sortedAll.forEach((e,i)=>{ if(ty+18>doc.page.height-60){doc.addPage(); ty=60; drawTransHeader(ty); ty+=28;} const bg=i%2===0?'#F8FAFC':'#FFFFFF'; doc.roundedRect(40,ty,510,18,3).fill(bg); const tipo = e.is_business_expense ? 'Emp' : 'Pes'; doc.fillColor(e.is_business_expense ? '#92400E':'#1E3A8A'); doc.text(new Date(e.transaction_date).toLocaleDateString('pt-BR'),50,ty+5,{width:50}); doc.text(tipo,100,ty+5,{width:40}); doc.text(e.account_plan_code||'-',140,ty+5,{width:50}); doc.text(e.account||'-',190,ty+5,{width:90}); const desc=(e.description||'').substring(0,40); doc.text(desc,280,ty+5,{width:190}); doc.text(parseFloat(e.amount).toFixed(2),470,ty+5,{width:70,align:'right'}); ty+=22; });
    // Totais finais
    if (ty+40>doc.page.height){doc.addPage(); ty=60;}
    doc.roundedRect(40,ty,510,24,6).fill('#ECFDF5');
    doc.fillColor('#065F46').fontSize(10).text('TOTAL GERAL',50,ty+7,{width:410});
    doc.text(`R$ ${total.toFixed(2)}`,470,ty+7,{width:70,align:'right'});

        // 📊 BI PESSOAL (resumo similar ao empresarial)
        doc.addPage();
        doc.rect(0,0,doc.page.width,90).fill('#1E3A8A');
        doc.fillColor('#FFFFFF').fontSize(26).text('🏠 BI GASTOS PESSOAIS',50,30,{width:500,align:'center'});
        const diasUnicosPes = new Set(pessoaisFiltrados.map(e => new Date(e.transaction_date).toISOString().slice(0,10))).size;
        const mediaDiariaPes = diasUnicosPes ? totalPessoal/diasUnicosPes : totalPessoal;
        const maiorPes = pessoaisFiltrados.length ? pessoaisFiltrados.reduce((m,e)=> parseFloat(e.amount)>m?parseFloat(e.amount):m,0):0;
        const menorPes = pessoaisFiltrados.length ? pessoaisFiltrados.reduce((m,e)=> parseFloat(e.amount)<m?parseFloat(e.amount):m,parseFloat(pessoaisFiltrados[0].amount)):0;
        const kpiYp = 120;
        const pCard = (x,t,v,c)=>{doc.roundedRect(x,kpiYp,155,70,12).fill(c);doc.fillColor('#FFFFFF').fontSize(11).text(t,x+12,kpiYp+12,{width:140});doc.fontSize(14).text(v,x+12,kpiYp+38,{width:140});};
        pCard(55,'Total Pessoal',`R$ ${totalPessoal.toFixed(2)}`,'#2563EB');
        pCard(220,'Dias c/ Gastos',diasUnicosPes.toString(),'#6366F1');
        pCard(385,'Média por Dia',`R$ ${mediaDiariaPes.toFixed(2)}`,'#10B981');
        const byPlanoPes={}; pessoaisFiltrados.forEach(e=>{const p=e.account_plan_code||'N/A';byPlanoPes[p]=(byPlanoPes[p]||0)+parseFloat(e.amount)});
        const top5p=Object.entries(byPlanoPes).sort((a,b)=>b[1]-a[1]).slice(0,5);
        let tY=200; doc.fontSize(16).fillColor('#1E293B').text('🏆 Top 5 Planos (Pessoal)',50,tY); tY+=30; doc.fontSize(11);
        doc.roundedRect(50,tY,490,22,6).fill('#E2E8F0'); doc.fillColor('#1E293B').text('Plano',60,tY+7,{width:120});doc.text('Valor',200,tY+7,{width:100});doc.text('% Total Pes.',320,tY+7,{width:100});doc.text('Share',420,tY+7,{width:100});tY+=30;
        top5p.forEach(([pl,val],i)=>{if(tY+24>doc.page.height-120){doc.addPage();tY=80;}const pct=(val/totalPessoal)*100;doc.roundedRect(50,tY,490,20,4).fill(i%2?'#F8FAFC':'#FFFFFF');doc.fillColor('#1E293B').fontSize(10).text(pl,60,tY+5,{width:120});doc.text(`R$ ${val.toFixed(2)}`,200,tY+5,{width:100});doc.text(`${pct.toFixed(1)}%`,320,tY+5,{width:100});const barW=Math.min(120,(pct/100)*120);doc.roundedRect(420,tY+7,120,6,3).fill('#E2E8F0');doc.roundedRect(420,tY+7,barW,6,3).fill('#2563EB');tY+=28;});
        let detYp=tY+30; if(detYp>doc.page.height-160){doc.addPage();detYp=80;} doc.fontSize(16).fillColor('#1E293B').text('📄 Detalhamento (Pessoal)',50,detYp);detYp+=28; doc.fontSize(9);
        const headerP=(y)=>{doc.roundedRect(50,y,490,20,4).fill('#2563EB');doc.fillColor('#FFFFFF').text('Data',60,y+6,{width:60});doc.text('Plano',120,y+6,{width:50});doc.text('Conta',170,y+6,{width:90});doc.text('Descrição',260,y+6,{width:150});doc.text('Valor',415,y+6,{width:60});}; headerP(detYp); detYp+=26;
        pessoaisFiltrados.sort((a,b)=> new Date(b.transaction_date)-new Date(a.transaction_date)).forEach(e=>{if(detYp+18>doc.page.height-60){doc.addPage();detYp=60;headerP(detYp);detYp+=26;} const bg=detYp%2===0?'#FFFFFF':'#F1F5F9'; doc.roundedRect(50,detYp,490,18,2).fill(bg); doc.fillColor('#1E293B').text(new Date(e.transaction_date).toLocaleDateString('pt-BR'),60,detYp+5,{width:60}); doc.text(e.account_plan_code||'-',120,detYp+5,{width:50}); doc.text(e.account||'-',170,detYp+5,{width:90}); const desc=(e.description||'').substring(0,30); doc.text(desc,260,detYp+5,{width:150}); doc.text(parseFloat(e.amount).toFixed(2),415,detYp+5,{width:60}); detYp+=22;});
        if(detYp+60>doc.page.height){doc.addPage();detYp=80;} doc.fontSize(9).fillColor('#475569').text('Nota: KPIs pessoais auxiliam decisões de redução de despesas e metas de economia.',50,detYp+10,{width:490});

    // ===== PÁGINA COMPARATIVO MÊS A MÊS POR PLANO =====
    doc.addPage();
    doc.rect(0,0,doc.page.width,80).fill('#1E40AF');
    doc.fillColor('#FFFFFF').fontSize(24).text('📊 Comparativo Mês a Mês por Plano',50,25,{width:500,align:'center'});
    doc.fontSize(10).fillColor('#E0E7FF').text(`Mês Atual: ${month}/${year}  •  Mês Anterior: ${prevMonth}/${prevYear}`,50,70,{width:500,align:'center'});
    const compHeaderY = 110;
    const drawCompHeader = (y)=>{doc.roundedRect(50,y,490,22,6).fill('#3B82F6'); doc.fillColor('#FFFFFF').fontSize(10).text('Plano',60,y+7,{width:80}); doc.text('Atual',140,y+7,{width:80}); doc.text('Anterior',210,y+7,{width:80}); doc.text('Δ Valor',280,y+7,{width:90}); doc.text('Δ %',370,y+7,{width:70}); doc.text('Share Atual',440,y+7,{width:90});};
    drawCompHeader(compHeaderY); let cy=compHeaderY+28;
    const totalAtual = Object.values(currByPlan).reduce((a,b)=>a+b,0)||1;
    const planosUnion = Array.from(new Set([...Object.keys(currByPlan),...Object.keys(prevByPlan)])).sort((a,b)=> parseInt(a)-parseInt(b));
    const linhasComp = planosUnion.map(pl=>{const a=currByPlan[pl]||0; const b=prevByPlan[pl]||0; const delta=a-b; const deltaPct = b===0 ? (a>0?100:0) : (delta/b*100); return {pl,a,b,delta,deltaPct,share:a/totalAtual};});
    linhasComp.sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta));
    linhasComp.slice(0,25).forEach((r,i)=>{ if(cy+20>doc.page.height-60){doc.addPage(); cy=60; drawCompHeader(cy); cy+=28;} const bg=i%2===0?'#F1F5F9':'#FFFFFF'; doc.roundedRect(50,cy,490,18,3).fill(bg); doc.fillColor('#1E293B').fontSize(9); doc.text(r.pl,60,cy+5,{width:80}); doc.text(`R$ ${r.a.toFixed(2)}`,140,cy+5,{width:70}); doc.text(`R$ ${r.b.toFixed(2)}`,210,cy+5,{width:70}); const sign = r.delta>=0?'+':''; doc.text(`${sign}R$ ${r.delta.toFixed(2)}`,280,cy+5,{width:80}); const pctSign = r.deltaPct>=0?'+':''; doc.text(`${pctSign}${r.deltaPct.toFixed(1)}%`,370,cy+5,{width:70}); doc.text(`${(r.share*100).toFixed(1)}%`,440,cy+5,{width:90}); cy+=22; });
    if(cy+40>doc.page.height){doc.addPage(); cy=60;}
    doc.fontSize(9).fillColor('#475569').text('Δ % calculado sobre o mês anterior. Quando anterior=0 e atual>0, assume 100%.',50,cy+10,{width:490});

    // ===== PÁGINA EFICIÊNCIA & OUTLIERS =====
    doc.addPage();
    doc.rect(0,0,doc.page.width,80).fill('#0F766E');
    doc.fillColor('#FFFFFF').fontSize(24).text('⚙️ Eficiência & Outliers (Empresarial)',50,25,{width:500,align:'center'});
    // Eficiência
    const businessDaysInMonth = Array.from({length: endDate.getDate()},(_,i)=> new Date(year, month-1, i+1)).filter(d=> d.getDay()!=0 && d.getDay()!=6).length;
    const custoMedioDiaUtil = businessDaysInMonth? totalEmpresarial / businessDaysInMonth : totalEmpresarial;
    const ticketMedioEmp = empresariais.length ? totalEmpresarial / empresariais.length : 0;
    doc.fontSize(12).fillColor('#FFFFFF').text(`Dias Úteis: ${businessDaysInMonth}  •  Custo Médio por Dia Útil: R$ ${custoMedioDiaUtil.toFixed(2)}  •  Ticket Médio: R$ ${ticketMedioEmp.toFixed(2)}`,60,80,{width:470,align:'left'});
    // Outliers (acima de média + 1 desvio padrão)
    const empValores = empresariais.map(e=>parseFloat(e.amount));
    const mediaEmp = empValores.length ? empValores.reduce((a,b)=>a+b,0)/empValores.length : 0;
    const stdEmp = empValores.length ? Math.sqrt(empValores.reduce((s,v)=> s + Math.pow(v-mediaEmp,2),0)/empValores.length) : 0;
    const limiteOutlier = mediaEmp + stdEmp;
    const outliers = empresariais.filter(e=> parseFloat(e.amount) > limiteOutlier).sort((a,b)=> parseFloat(b.amount)-parseFloat(a.amount)).slice(0,3);
    let oy = 130; doc.fontSize(14).fillColor('#FFFFFF').text('Top 3 Outliers (> média + 1 desvio)',60,oy); oy+=30; doc.fontSize(10);
    if(outliers.length===0){ doc.text('Nenhum outlier detectado.',60,oy); oy+=20; } else { outliers.forEach(o=>{ doc.text(`• ${new Date(o.transaction_date).toLocaleDateString('pt-BR')} | Plano ${o.account_plan_code||'-'} | R$ ${parseFloat(o.amount).toFixed(2)} | ${o.account}`,60,oy,{width:470}); oy+=16;}); }
    doc.fontSize(9).fillColor('#D1FAE5').text(`Média: R$ ${mediaEmp.toFixed(2)}  •  Desvio Padrão: R$ ${stdEmp.toFixed(2)}  •  Limite: R$ ${limiteOutlier.toFixed(2)}`,60,oy+10,{width:470});

    // ===== PÁGINA PROJEÇÃO & CONCENTRAÇÃO =====
    doc.addPage();
    doc.rect(0,0,doc.page.width,80).fill('#9333EA');
    doc.fillColor('#FFFFFF').fontSize(24).text('🔮 Projeção & Concentração',50,25,{width:500,align:'center'});
    const daysInMonth = endDate.getDate();
    const diasComGasto = Object.keys(porDia).length;
    const mediaDiariaGeral = diasComGasto ? total / diasComGasto : total;
    const hoje = new Date();
    const isMesAtual = (hoje.getFullYear()===year && (hoje.getMonth()+1)===month);
    const diaHoje = isMesAtual ? hoje.getDate() : daysInMonth; // se não é mês atual, usar mês fechado
    const projecao = isMesAtual ? (mediaDiariaGeral * daysInMonth) : total;
    const crescimentoProj = total ? ((projecao - total)/ total)*100 : 0;
    doc.fontSize(12).fillColor('#F5F3FF').text(`Dias no mês: ${daysInMonth} • Dias com gasto: ${diasComGasto} • Média diária observada: R$ ${mediaDiariaGeral.toFixed(2)}`,60,80,{width:470});
    doc.fontSize(12).text(`Projeção de Encerramento: R$ ${projecao.toFixed(2)} (${crescimentoProj>=0?'+':''}${crescimentoProj.toFixed(1)}% vs gasto atual)`,60,100,{width:470});
    if(!isMesAtual) doc.fontSize(9).fillColor('#DDD6FE').text('Mês encerrado: projeção = total realizado.',60,118,{width:470});
    // Concentração (Herfindahl dos 5 maiores planos)
    const shares = Object.values(currByPlan).sort((a,b)=>b-a).slice(0,5).map(v=> v/totalAtual);
    const hhi = shares.reduce((s,sh)=> s + Math.pow(sh,2),0); // 0-1
    let cx = 60; let cy2 = 160; doc.fontSize(14).fillColor('#FFFFFF').text('Índice de Concentração (HHI Top 5)',cx,cy2); cy2+=30; doc.fontSize(11).text(`HHI: ${(hhi*10000).toFixed(0)} (escala 0-10000)  •  Interpretação: ${hhi<0.15?'Baixa':'Alta'}`,cx,cy2); cy2+=25;
    shares.forEach((s,i)=>{ const barW = s*300; doc.roundedRect(cx,cy2,320,12,6).fill('#F3E8FF'); doc.roundedRect(cx,cy2,barW,12,6).fill('#C084FC'); doc.fillColor('#4C1D95').fontSize(9).text(`#${i+1} ${(s*100).toFixed(1)}%`,cx+5,cy2+2); cy2+=22; });
    doc.fontSize(9).fillColor('#E9D5FF').text('HHI < 1500 baixa concentração; 1500-2500 moderada; >2500 alta (escala convertida).',cx,cy2+5,{width:470});

        // 🎊 PÁGINA FINAL MOTIVACIONAL (centralizada revisada)
        doc.addPage();
        doc.rect(0,0,doc.page.width,doc.page.height).fill('#F0FDF4');
        const centerX = doc.page.width/2;
        doc.fillColor('#059669').fontSize(80).text('🎉', centerX-40, 140);
        doc.fontSize(30).fillColor('#065F46').text('PARABÉNS!', 0, 230, { align: 'center' });
        doc.fontSize(16).fillColor('#047857').text('Você está no controle das suas finanças!', 0, 270, { align: 'center' });
        doc.fontSize(14).fillColor('#059669').text('Mantenha a consistência e alcance objetivos maiores! 🚀', 0, 300, { align: 'center' });
        doc.fontSize(12).fillColor('#065F46').text('💡 Foco no próximo mês', 0, 350, { align: 'center', underline:true });
        const dicas = [
            '🗓️ Registre micro despesas diariamente',
            '📊 Compare variação vs. mês anterior',
            '🎯 Ataque o plano acima de 80% do teto',
            '💾 Faça backup dos relatórios',
            '🔁 Revise e negocie gastos recorrentes'
        ];
        let dy = 380; doc.fontSize(10).fillColor('#047857');
        dicas.forEach(d=> { doc.text(d, 0, dy, { align: 'center' }); dy += 18; });
        doc.fontSize(10).fillColor('#6B7280').text('Relatório gerado com ❤️ • Sistema de Controle Financeiro', 0, dy+30, { align: 'center' });

        doc.end();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio-completo-graficos-${year}-${month}${account ? '-' + account : ''}.pdf`);
        doc.pipe(res);

    } catch (error) {
        console.error('❌ Erro ao gerar relatório mensal:', error);
        res.status(500).json({ 
            message: 'Erro ao gerar relatório mensal.', 
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// --- 8.2. ROTAS PARA GASTOS RECORRENTES MENSAIS ---

// Criar novo gasto recorrente
app.post('/api/recurring-expenses', authenticateToken, async (req, res) => {
    try {
        const {
            description,
            amount,
            account,
            account_plan_code,
            is_business_expense,
            day_of_month
        } = req.body;

        const userId = req.user.id;

        // Validação
        if (!description || !amount || !account) {
            return res.status(400).json({ message: 'Descrição, valor e conta são obrigatórios.' });
        }

        // Verificar se é conta que permite gastos recorrentes (PIX ou Boleto)
        if (!['PIX', 'Boleto'].includes(account)) {
            return res.status(400).json({ message: 'Gastos recorrentes só são permitidos para contas PIX e Boleto.' });
        }

        await pool.query(
            `INSERT INTO recurring_expenses (user_id, description, amount, account, account_plan_code, is_business_expense, day_of_month) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, description, amount, account, account_plan_code || null, is_business_expense || 0, day_of_month || 1]
        );

        res.status(201).json({ message: 'Gasto recorrente criado com sucesso!' });
    } catch (error) {
        console.error('Erro ao criar gasto recorrente:', error);
        res.status(500).json({ message: 'Erro ao criar gasto recorrente.' });
    }
});

// Listar gastos recorrentes
app.get('/api/recurring-expenses', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(
            'SELECT * FROM recurring_expenses WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC',
            [userId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar gastos recorrentes:', error);
        res.status(500).json({ message: 'Erro ao buscar gastos recorrentes.' });
    }
});

// Atualizar gasto recorrente
app.put('/api/recurring-expenses/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const {
            description,
            amount,
            account,
            account_plan_code,
            is_business_expense,
            day_of_month
        } = req.body;

        // Verificar se o gasto recorrente pertence ao usuário
        const [existing] = await pool.query(
            'SELECT id FROM recurring_expenses WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Gasto recorrente não encontrado.' });
        }

        await pool.query(
            `UPDATE recurring_expenses 
             SET description = ?, amount = ?, account = ?, account_plan_code = ?, 
                 is_business_expense = ?, day_of_month = ? 
             WHERE id = ? AND user_id = ?`,
            [description, amount, account, account_plan_code || null, is_business_expense || 0, day_of_month || 1, id, userId]
        );

        res.json({ message: 'Gasto recorrente atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar gasto recorrente:', error);
        res.status(500).json({ message: 'Erro ao atualizar gasto recorrente.' });
    }
});

// Deletar gasto recorrente
app.delete('/api/recurring-expenses/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const [result] = await pool.query(
            'UPDATE recurring_expenses SET is_active = 0 WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Gasto recorrente não encontrado.' });
        }

        res.json({ message: 'Gasto recorrente removido com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover gasto recorrente:', error);
        res.status(500).json({ message: 'Erro ao remover gasto recorrente.' });
    }
});

// Processar gastos recorrentes para um mês específico
app.post('/api/recurring-expenses/process', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.body;

        if (!year || !month) {
            return res.status(400).json({ message: 'Ano e mês são obrigatórios.' });
        }

        const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
        
        // Buscar gastos recorrentes ativos que ainda não foram processados para este mês
        const [recurringExpenses] = await pool.query(`
            SELECT re.* FROM recurring_expenses re
            LEFT JOIN recurring_expense_processing rep ON re.id = rep.recurring_expense_id AND rep.processed_month = ?
            WHERE re.user_id = ? AND re.is_active = 1 AND rep.id IS NULL
        `, [monthKey, userId]);

        let processedCount = 0;

        for (const recurring of recurringExpenses) {
            // Criar a data baseada no dia configurado
            const transactionDate = new Date(year, month - 1, recurring.day_of_month);
            
            // Se o dia não existe no mês (ex: 31 em fevereiro), usar o último dia do mês
            if (transactionDate.getMonth() !== month - 1) {
                transactionDate.setDate(0); // Vai para o último dia do mês anterior
            }

            const formattedDate = transactionDate.toISOString().split('T')[0];

            // Inserir na tabela de expenses
            const [expenseResult] = await pool.query(
                `INSERT INTO expenses (user_id, transaction_date, amount, description, account, 
                 is_business_expense, account_plan_code, is_recurring_expense, total_installments) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
                [userId, formattedDate, recurring.amount, recurring.description, 
                 recurring.account, recurring.is_business_expense, recurring.account_plan_code]
            );

            // Registrar o processamento
            await pool.query(
                'INSERT INTO recurring_expense_processing (recurring_expense_id, processed_month, expense_id) VALUES (?, ?, ?)',
                [recurring.id, monthKey, expenseResult.insertId]
            );

            processedCount++;
        }

        res.json({ 
            message: 'Gastos recorrentes processados para ' + month + '/' + year + ': ' + processedCount,
            processedCount 
        });
    } catch (error) {
        console.error('Erro ao processar gastos recorrentes:', error);
        res.status(500).json({ message: 'Erro ao processar gastos recorrentes.' });
    }
});

// --- 9. INICIALIZAÇÃO DO SERVIDOR ---
const HOST = '0.0.0.0'; // Essencial para Railway
app.listen(PORT, HOST, async () => {
    try {
        // Testar conexão com banco
        await testConnection();
        
        // Executar migração do banco
        console.log('🔄 Verificando e criando estrutura do banco...');
        await createDatabase();
        
        console.log(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
        console.log('✅ Sistema inicializado com sucesso!');
    } catch (error) {
        console.error('❌ ERRO CRÍTICO AO INICIALIZAR:', error.message);
        process.exit(1);
    }
});

const billingPeriods = {
    'Nu Bank Ketlyn': { startDay: 2, endDay: 1 },
    'Nu Vainer': { startDay: 2, endDay: 1 },
    'Ourocard Ketlyn': { startDay: 17, endDay: 16 },
    'PicPay Vainer': { startDay: 1, endDay: 30 },
    'PIX': { startDay: 1, endDay: 30, isRecurring: true },
    'Boleto': { startDay: 1, endDay: 30, isRecurring: true }
};

app.get('/api/accounts', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(
            'SELECT DISTINCT account FROM expenses WHERE user_id = ? ORDER BY account',
            [userId]
        );
        res.json(rows.map(r => r.account));
    } catch (error) {
        console.error('Erro ao buscar contas:', error);
        res.status(500).json({ message: 'Erro ao buscar contas.' });
    }
});

// Rota para buscar planos de conta disponíveis
app.get('/api/account-plans', authenticateToken, async (req, res) => {
    try {
        console.log('📋 Buscando planos de conta disponíveis...');
        
        // Retornar lista fixa de planos de conta baseada no sistema existente
        const accountPlans = [
            { PlanoContasID: 1, NomePlanoConta: 'Alimentação' },
            { PlanoContasID: 2, NomePlanoConta: 'Transporte' },
            { PlanoContasID: 3, NomePlanoConta: 'Moradia' },
            { PlanoContasID: 4, NomePlanoConta: 'Saúde' },
            { PlanoContasID: 5, NomePlanoConta: 'Educação' },
            { PlanoContasID: 6, NomePlanoConta: 'Lazer' },
            { PlanoContasID: 7, NomePlanoConta: 'Vestuário' },
            { PlanoContasID: 8, NomePlanoConta: 'Serviços' },
            { PlanoContasID: 9, NomePlanoConta: 'Investimentos' },
            { PlanoContasID: 10, NomePlanoConta: 'Diversos' }
        ];
        
        console.log(`✅ Retornando ${accountPlans.length} planos de conta`);
        res.json(accountPlans);
        
    } catch (error) {
        console.error('❌ Erro ao buscar planos de conta:', error);
        res.status(500).json({ 
            message: 'Erro interno do servidor ao buscar planos de conta',
            error: error.message 
        });
    }
});

// --- ROTAS PARA RELATÓRIOS ---
app.get('/api/reports/monthly', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.query;
        
        const [rows] = await pool.query(`
            SELECT 
                account,
                SUM(CASE WHEN is_business_expense = 0 THEN amount ELSE 0 END) as personal_total,
                SUM(CASE WHEN is_business_expense = 1 THEN amount ELSE 0 END) as business_total,
                COUNT(*) as transaction_count
            FROM expenses 
            WHERE user_id = ? AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
            GROUP BY account
            ORDER BY (personal_total + business_total) DESC
        `, [userId, year, month]);
        
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar relatório mensal:', error);
        res.status(500).json({ message: 'Erro ao buscar relatório mensal.' });
    }
});

app.get('/api/reports/weekly', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate } = req.query;
        
        const [rows] = await pool.query(`
            SELECT * FROM expenses 
            WHERE user_id = ? AND transaction_date BETWEEN ? AND ?
            ORDER BY transaction_date DESC
        `, [userId, startDate, endDate]);
        
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar relatório semanal:', error);
        res.status(500).json({ message: 'Erro ao buscar relatório semanal.' });
    }
});

// Rota para análise de tendências em PDF
app.post('/api/reports/trend-analysis', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, period, analysis, expenses, charts } = req.body;
        
        console.log('📊 Gerando análise de tendências PDF para usuário:', userId);
        
        // Criar documento PDF
        const doc = new pdfkit({ size: 'A4', margin: 50 });
        
        // Headers para download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="analise_tendencias_${Date.now()}.pdf"`);
        
        // Pipe do PDF para a resposta
        doc.pipe(res);
        
        // --- CABEÇALHO ---
        doc.fontSize(24).fillColor('#4A5568').text('📊 Análise de Tendências Financeiras', 50, 50);
        doc.fontSize(12).fillColor('#718096').text(`Período: ${period || 'N/A'}`, 50, 80);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 50, 95);
        
        // Linha separadora
        doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#E2E8F0').stroke();
        
        let yPosition = 140;
        
        // --- RESUMO EXECUTIVO ---
        doc.fontSize(16).fillColor('#2D3748').text('📈 Resumo Executivo', 50, yPosition);
        yPosition += 25;
        
        if (analysis) {
            doc.fontSize(11).fillColor('#4A5568');
            
            // Tendência
            const trendIcon = analysis.trend === 'increasing' ? '📈' : analysis.trend === 'decreasing' ? '📉' : '📊';
            const trendText = analysis.trend === 'increasing' ? 'Crescente' : analysis.trend === 'decreasing' ? 'Decrescente' : 'Estável';
            doc.text(`${trendIcon} Tendência Atual: ${trendText} (${analysis.growth}%)`, 70, yPosition);
            yPosition += 15;
            
            // Métricas
            doc.text(`💰 Média Mensal: R$ ${analysis.avgMonthly}`, 70, yPosition);
            yPosition += 15;
            doc.text(`🎯 Projeção Próximo Mês: R$ ${analysis.projection}`, 70, yPosition);
            yPosition += 15;
            doc.text(`📊 Total do Período: R$ ${analysis.totalPeriod}`, 70, yPosition);
            yPosition += 30;
        }
        
        // --- INSIGHTS ---
        if (analysis && analysis.insights && analysis.insights.length > 0) {
            doc.fontSize(16).fillColor('#2D3748').text('💡 Insights Principais', 50, yPosition);
            yPosition += 20;
            
            analysis.insights.forEach((insight, index) => {
                doc.fontSize(10).fillColor('#4A5568').text(`• ${insight}`, 70, yPosition);
                yPosition += 15;
            });
            yPosition += 15;
        }
        
        // --- RECOMENDAÇÕES ---
        if (analysis && analysis.recommendations && analysis.recommendations.length > 0) {
            doc.fontSize(16).fillColor('#2D3748').text('🎯 Recomendações', 50, yPosition);
            yPosition += 20;
            
            analysis.recommendations.forEach((rec, index) => {
                doc.fontSize(10).fillColor('#4A5568').text(`• ${rec}`, 70, yPosition);
                yPosition += 15;
            });
            yPosition += 15;
        }
        
        // --- TOP CATEGORIAS ---
        if (analysis && analysis.topCategories && analysis.topCategories.length > 0) {
            doc.fontSize(16).fillColor('#2D3748').text('📊 Principais Categorias', 50, yPosition);
            yPosition += 20;
            
            analysis.topCategories.forEach((cat, index) => {
                doc.fontSize(10).fillColor('#4A5568')
                   .text(`${index + 1}. ${cat.category}: R$ ${cat.value} (${cat.percentage}%)`, 70, yPosition);
                yPosition += 15;
            });
            yPosition += 15;
        }
        
        // --- DADOS MENSAIS ---
        if (analysis && analysis.monthlyData && analysis.monthlyData.length > 0) {
            // Nova página se necessário
            if (yPosition > 650) {
                doc.addPage();
                yPosition = 50;
            }
            
            doc.fontSize(16).fillColor('#2D3748').text('📅 Evolução Mensal', 50, yPosition);
            yPosition += 20;
            
            // Cabeçalho da tabela
            doc.fontSize(11).fillColor('#2D3748')
               .text('Mês', 70, yPosition)
               .text('Valor', 200, yPosition);
            yPosition += 20;
            
            // Linha separadora
            doc.moveTo(70, yPosition - 5).lineTo(350, yPosition - 5).strokeColor('#E2E8F0').stroke();
            
            analysis.monthlyData.forEach((monthData, index) => {
                doc.fontSize(10).fillColor('#4A5568')
                   .text(monthData.month, 70, yPosition)
                   .text(`R$ ${monthData.value}`, 200, yPosition);
                yPosition += 15;
            });
        }
        
        // --- RODAPÉ ---
        doc.fontSize(8).fillColor('#A0AEC0')
           .text('Relatório gerado automaticamente pelo Sistema de Controle Financeiro', 50, 750, {
               align: 'center'
           });
        
        // Finalizar documento
        doc.end();
        
        console.log('✅ PDF de análise de tendências gerado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao gerar PDF de análise:', error);
        res.status(500).json({ 
            message: 'Erro ao gerar análise de tendências',
            error: error.message 
        });
    }
});

// --- ROTAS PARA ANÁLISE EMPRESARIAL ---
app.get('/api/business/summary', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.query;
        
        // Query principal para resumo
        let summaryQuery = `
            SELECT 
                SUM(amount) as total,
                COUNT(*) as count,
                AVG(amount) as average,
                SUM(CASE WHEN invoice_path IS NOT NULL THEN amount ELSE 0 END) as invoiced_total,
                SUM(CASE WHEN invoice_path IS NULL THEN amount ELSE 0 END) as non_invoiced_total,
                COUNT(CASE WHEN invoice_path IS NOT NULL THEN 1 END) as invoiced_count,
                COUNT(CASE WHEN invoice_path IS NULL THEN 1 END) as non_invoiced_count
            FROM expenses 
            WHERE user_id = ? AND is_business_expense = 1
        `;
        
        const queryParams = [userId];
        
        if (year) {
            summaryQuery += ' AND YEAR(transaction_date) = ?';
            queryParams.push(year);
        }
        if (month) {
            summaryQuery += ' AND MONTH(transaction_date) = ?';
            queryParams.push(month);
        }
        
        const [summary] = await pool.query(summaryQuery, queryParams);
        
        // Query para dados por conta
        let accountQuery = `
            SELECT account, SUM(amount) as total
            FROM expenses 
            WHERE user_id = ? AND is_business_expense = 1
        `;
        
        const accountParams = [userId];
        if (year) {
            accountQuery += ' AND YEAR(transaction_date) = ?';
            accountParams.push(year);
        }
        if (month) {
            accountQuery += ' AND MONTH(transaction_date) = ?';
            accountParams.push(month);
        }
        
        accountQuery += ' GROUP BY account ORDER BY total DESC';
        const [accountData] = await pool.query(accountQuery, accountParams);
        
        // Query para dados por categoria
        let categoryQuery = `
            SELECT description as category, SUM(amount) as total
            FROM expenses 
            WHERE user_id = ? AND is_business_expense = 1
        `;
        
        const categoryParams = [userId];
        if (year) {
            categoryQuery += ' AND YEAR(transaction_date) = ?';
            categoryParams.push(year);
        }
        if (month) {
            categoryQuery += ' AND MONTH(transaction_date) = ?';
            categoryParams.push(month);
        }
        
        categoryQuery += ' GROUP BY description ORDER BY total DESC LIMIT 10';
        const [categoryData] = await pool.query(categoryQuery, categoryParams);
        
        // Organizar dados
        const byAccount = {};
        accountData.forEach(item => {
            byAccount[item.account] = parseFloat(item.total);
        });
        
        const byCategory = {};
        categoryData.forEach(item => {
            byCategory[item.category] = parseFloat(item.total);
        });
        
        const result = {
            ...summary[0],
            total: parseFloat(summary[0]?.total) || 0,
            count: parseInt(summary[0]?.count) || 0,
            average: parseFloat(summary[0]?.average) || 0,
            invoiced_total: parseFloat(summary[0]?.invoiced_total) || 0,
            non_invoiced_total: parseFloat(summary[0]?.non_invoiced_total) || 0,
            invoiced_count: parseInt(summary[0]?.invoiced_count) || 0,
            non_invoiced_count: parseInt(summary[0]?.non_invoiced_count) || 0,
            byAccount,
            byCategory
        };
        
        res.json(result);
    } catch (error) {
        console.error('Erro ao buscar resumo empresarial:', error);
        res.status(500).json({ message: 'Erro ao buscar resumo empresarial.' });
    }
});

// Nova API para análise empresarial avançada com metadatabase
app.get('/api/business/advanced-analysis', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { 
            year, 
            month, 
            account, 
            category, 
            minAmount, 
            maxAmount, 
            invoiceStatus,
            search 
        } = req.query;
        
        // Query base com filtros
        let baseQuery = `
            SELECT 
                id,
                transaction_date,
                description,
                amount,
                account,
                account_plan_code,
                invoice_path,
                total_installments,
                current_installment,
                has_invoice
            FROM expenses 
            WHERE user_id = ? AND is_business_expense = 1
        `;
        
        const queryParams = [userId];
        
        // Aplicar filtros de metadatabase
        if (year) {
            baseQuery += ' AND YEAR(transaction_date) = ?';
            queryParams.push(year);
        }
        if (month) {
            baseQuery += ' AND MONTH(transaction_date) = ?';
            queryParams.push(month);
        }
        if (account) {
            baseQuery += ' AND account = ?';
            queryParams.push(account);
        }
        if (category) {
            baseQuery += ' AND description LIKE ?';
            queryParams.push(`%${category}%`);
        }
        if (minAmount) {
            baseQuery += ' AND amount >= ?';
            queryParams.push(parseFloat(minAmount));
        }
        if (maxAmount) {
            baseQuery += ' AND amount <= ?';
            queryParams.push(parseFloat(maxAmount));
        }
        if (invoiceStatus === 'with') {
            baseQuery += ' AND invoice_path IS NOT NULL';
        } else if (invoiceStatus === 'without') {
            baseQuery += ' AND invoice_path IS NULL';
        }
        if (search) {
            baseQuery += ' AND (description LIKE ? OR account LIKE ?)';
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        
        baseQuery += ' ORDER BY transaction_date DESC';
        
        const [expenses] = await pool.query(baseQuery, queryParams);
        
        // Calcular estatísticas
        const total = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
        const count = expenses.length;
        const average = count > 0 ? total / count : 0;
        
        // Agrupar por conta
        const byAccount = {};
        expenses.forEach(exp => {
            const account = exp.account;
            byAccount[account] = (byAccount[account] || 0) + parseFloat(exp.amount);
        });
        
        // Agrupar por categoria
        const byCategory = {};
        expenses.forEach(exp => {
            const category = exp.description || 'Sem categoria';
            byCategory[category] = (byCategory[category] || 0) + parseFloat(exp.amount);
        });
        
        res.json({
            expenses,
            summary: {
                total,
                count,
                average,
                byAccount,
                byCategory
            }
        });
        
    } catch (error) {
        console.error('Erro na análise empresarial avançada:', error);
        res.status(500).json({ message: 'Erro na análise empresarial avançada.' });
    }
});

// API para calcular gastos previstos e parcelas futuras
app.get('/api/business/predictions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.query;
        
        const currentYear = year ? parseInt(year) : new Date().getFullYear();
        const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        
        // 1. Buscar gastos recorrentes empresariais
        const [recurringExpenses] = await pool.query(`
            SELECT * FROM recurring_expenses 
            WHERE user_id = ? AND is_business_expense = 1 AND is_active = 1
        `, [userId]);
        
        const predictedFromRecurring = recurringExpenses.reduce((sum, exp) => 
            sum + parseFloat(exp.amount), 0);
        
        // 2. Calcular média histórica dos últimos 3 meses (excluindo mês atual)
        const [historicalData] = await pool.query(`
            SELECT AVG(monthly_total) as avg_amount
            FROM (
                SELECT SUM(amount) as monthly_total
                FROM expenses 
                WHERE user_id = ? AND is_business_expense = 1
                AND (
                    (YEAR(transaction_date) = ? AND MONTH(transaction_date) < ?) OR
                    (YEAR(transaction_date) = ? AND MONTH(transaction_date) >= ?)
                )
                GROUP BY YEAR(transaction_date), MONTH(transaction_date)
                ORDER BY YEAR(transaction_date) DESC, MONTH(transaction_date) DESC
                LIMIT 3
            ) as monthly_data
        `, [userId, currentYear, currentMonth, currentYear - 1, currentMonth]);
        
        const historicalAverage = parseFloat(historicalData[0]?.avg_amount) || 0;
        
        // 3. Calcular previsão combinada (70% recorrente + 30% histórico)
        const predictedExpenses = (predictedFromRecurring * 0.7) + (historicalAverage * 0.3);
        
        // 4. Calcular parcelas futuras
        const [futureInstallments] = await pool.query(`
            SELECT 
                SUM(amount * (total_installments - COALESCE(current_installment, 1))) as future_total
            FROM expenses 
            WHERE user_id = ? AND is_business_expense = 1
            AND total_installments > 1
            AND COALESCE(current_installment, 1) < total_installments
        `, [userId]);
        
        const futureTotal = parseFloat(futureInstallments[0]?.future_total) || 0;
        
        res.json({
            predicted: predictedExpenses,
            recurring: predictedFromRecurring,
            historical: historicalAverage,
            futureInstallments: futureTotal
        });
        
    } catch (error) {
        console.error('Erro ao calcular previsões:', error);
        res.status(500).json({ message: 'Erro ao calcular previsões.' });
    }
});

// Nova rota para análise de tendências empresariais
app.get('/api/business/trends', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { months = 12 } = req.query;
        
        // Buscar dados dos últimos N meses
        const trendsQuery = `
            SELECT 
                YEAR(transaction_date) as year,
                MONTH(transaction_date) as month,
                SUM(amount) as total,
                COUNT(*) as count,
                AVG(amount) as average
            FROM expenses 
            WHERE user_id = ? AND is_business_expense = 1
            AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
            GROUP BY YEAR(transaction_date), MONTH(transaction_date)
            ORDER BY year, month
        `;
        
        const [trendsData] = await pool.query(trendsQuery, [userId, parseInt(months)]);
        
        res.json(trendsData.map(item => ({
            year: item.year,
            month: item.month,
            total: parseFloat(item.total),
            count: parseInt(item.count),
            average: parseFloat(item.average)
        })));
        
    } catch (error) {
        console.error('Erro ao buscar tendências empresariais:', error);
        res.status(500).json({ message: 'Erro ao buscar tendências empresariais.' });
    }
});

// --- ROTAS PARA GESTÃO DE GASTOS RECORRENTES ---
app.get('/api/recurring-expenses', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(`
            SELECT * FROM recurring_expenses 
            WHERE user_id = ? AND is_active = 1
            ORDER BY description ASC
        `, [userId]);
        
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar gastos recorrentes:', error);
        res.status(500).json({ message: 'Erro ao buscar gastos recorrentes.' });
    }
});

app.post('/api/recurring-expenses', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { description, amount, account, category, is_business_expense, day_of_month } = req.body;
        
        if (!description || !amount || !account || !day_of_month) {
            return res.status(400).json({ message: 'Dados obrigatórios não fornecidos.' });
        }
        
        const [result] = await pool.query(`
            INSERT INTO recurring_expenses 
            (user_id, description, amount, account, category, is_business_expense, day_of_month, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `, [userId, description, amount, account, category, is_business_expense || 0, day_of_month]);
        
        res.json({ 
            message: 'Gasto recorrente criado com sucesso!',
            id: result.insertId 
        });
    } catch (error) {
        console.error('Erro ao criar gasto recorrente:', error);
        res.status(500).json({ message: 'Erro ao criar gasto recorrente.' });
    }
});

app.delete('/api/recurring-expenses/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        
        const [result] = await pool.query(`
            UPDATE recurring_expenses 
            SET is_active = 0 
            WHERE id = ? AND user_id = ?
        `, [id, userId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Gasto recorrente não encontrado.' });
        }
        
        res.json({ message: 'Gasto recorrente removido com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover gasto recorrente:', error);
        res.status(500).json({ message: 'Erro ao remover gasto recorrente.' });
    }
});

app.post('/api/recurring-expenses/process', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.body;
        
        if (!year || !month) {
            return res.status(400).json({ message: 'Ano e mês são obrigatórios.' });
        }
        
        // Buscar gastos recorrentes ativos
        const [recurringExpenses] = await pool.query(`
            SELECT * FROM recurring_expenses 
            WHERE user_id = ? AND is_active = 1
        `, [userId]);
        
        let processedCount = 0;
        
        for (const expense of recurringExpenses) {
            // Verificar se já foi processado neste mês
            const [existing] = await pool.query(`
                SELECT id FROM expenses 
                WHERE user_id = ? AND recurring_expense_id = ? 
                AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
            `, [userId, expense.id, year, month]);
            
            if (existing.length === 0) {
                // Criar a data da transação
                const transactionDate = new Date(year, month - 1, expense.day_of_month);
                
                // Inserir o gasto
                await pool.query(`
                    INSERT INTO expenses 
                    (user_id, description, amount, account, category, is_business_expense, transaction_date, recurring_expense_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    userId, 
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
        
        res.json({ 
            message: `${processedCount} gastos recorrentes processados com sucesso!`,
            processed: processedCount 
        });
    } catch (error) {
        console.error('Erro ao processar gastos recorrentes:', error);
        res.status(500).json({ message: 'Erro ao processar gastos recorrentes.' });
    }
});

// --- MIDDLEWARE DE TRATAMENTO DE ERROS ---
app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
});

// --- ROTA PARA ARQUIVOS ESTÁTICOS ---
// Nota: Arquivos de fatura agora são servidos através do endpoint autenticado /api/invoice/:id

module.exports = app;
