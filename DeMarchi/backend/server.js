// server.js (Versão Final e Completa)

// --- 1. DEPENDÊNCIAS ---
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

// Imports com tratamento robusto de erro para Railway
let ChartJSNodeCanvas;
try {
    ({ ChartJSNodeCanvas } = require('chartjs-node-canvas'));
    console.log('✅ ChartJS carregado com sucesso');
} catch(e) {
    console.warn('⚠️ ChartJS não disponível:', e.message);
    ChartJSNodeCanvas = null;
}

const pdfkit = require('pdfkit');

// Emoji suporte via twemoji (converte para imagem PNG)
let twemoji;
try {
    twemoji = require('twemoji');
    console.log('✅ Twemoji carregado com sucesso');
} catch(e) {
    console.warn('⚠️ Twemoji não disponível:', e.message);
    twemoji = null;
}
const https = require('https');
const { createWriteStream, existsSync, mkdirSync } = require('fs');
const path = require('path');
// Função cache simples para baixar emoji como PNG (32x32) e desenhar no PDF
async function drawEmoji(doc, emoji, x, y, size=18){
    if(!twemoji){ doc.fontSize(size).text(emoji,x,y); return; }
    const code = twemoji.convert.toCodePoint(emoji);
    const cacheDir = path.join(__dirname,'emoji-cache');
    if(!existsSync(cacheDir)) mkdirSync(cacheDir);
    const filePath = path.join(cacheDir, code + '.png');
    const url = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${code}.png`;
    const ensureFile = ()=> new Promise((resolve)=>{
        if(existsSync(filePath)) return resolve();
        const file = createWriteStream(filePath);
        https.get(url,res=>{res.pipe(file); file.on('finish',()=>file.close(()=>resolve()));}).on('error',()=>{try{file.close();}catch{} resolve();});
    });
    await ensureFile();
    try { doc.image(filePath, x, y, { width:size, height:size }); } catch { doc.fontSize(size).text(emoji,x,y); }
}
const fs = require('fs');
const cors = require('cors');
const { pool, testConnection } = require('./config/database');

// Inicialização do Express
const app = express();
app.use(cors());
app.use(express.json());

// Teste de conexão com o banco no start (não bloqueante)
testConnection().catch(() => {});
// ====== API KPIs Mensais (JSON) ======
const { computeMonthlyKPIs, saveMonthlySnapshot, computeTrendAnalysis, computeComparativeAnalysis, generateExecutiveReport } = require('./reporting/monthlyKpis');
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
        // Integrar bloco de controle de tetos por plano (BI)
        try {
            const { computeBudgetControlFromDistribution, tetos } = require('./config/budgets');
            const distr = kpis?.distrib?.porPlano || {};
            kpis.budgetControl = {
                ceilings: tetos,
                ...computeBudgetControlFromDistribution(distr)
            };
        } catch (e) {
            console.warn('⚠️ Erro ao anexar budgetControl aos KPIs mensais:', e.message);
        }

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

// ====== ROTAS DE BUSINESS INTELLIGENCE ======

// 1. Análise de Tendências - múltiplos meses
app.get('/api/bi/trends', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.user?.id || 0);
        const months = parseInt(req.query.months) || 12;
        const redis = getRedis();
        const cacheKey = `bi_trends:${userId}:${months}`;
        
        if (redis) {
            const cached = await redis.get(cacheKey);
            if (cached) return res.json({ cached: true, ...JSON.parse(cached) });
        }

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
                        transactions: kpis.totals.despesas || 0,
                        projection: kpis.projecao?.projecao || 0,
                        hhi: kpis.concentracao?.hhi || 0,
                        averageTicket: kpis.eficiencia?.ticketMedioEmp || 0
                    });
                }
            } catch (monthError) {
                console.warn(`Erro ao processar mês ${year}-${month}:`, monthError.message);
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
            current.personalChange = previous.personal > 0 ? 
                ((current.personal - previous.personal) / previous.personal * 100) : 0;
        }

        const result = { trends, generatedAt: new Date().toISOString() };
        
        if (redis) await redis.setex(cacheKey, 1800, JSON.stringify(result)); // 30 min cache
        res.json(result);

    } catch (error) {
        console.error('Erro BI trends:', error);
        res.status(500).json({ error: 'Erro ao gerar análise de tendências', details: error.message });
    }
});

// 2. Análise de Concentração (Pareto) com insights
app.get('/api/bi/concentration', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.user?.id || 0);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        
        const kpis = await computeMonthlyKPIs({ pool, userId, year, month, account: 'ALL' });
        
        if (!kpis.distrib?.porPlano) {
            return res.status(400).json({ error: 'Dados insuficientes para análise de concentração' });
        }

        // Análise por plano de contas
        const planData = Object.entries(kpis.distrib.porPlano)
            .map(([plan, amount]) => ({ plan, amount: parseFloat(amount) }))
            .sort((a, b) => b.amount - a.amount);

        const total = planData.reduce((sum, item) => sum + item.amount, 0);
        let cumulative = 0;

        const analysis = planData.map((item, index) => {
            cumulative += item.amount;
            const percentage = total > 0 ? (item.amount / total * 100) : 0;
            const cumulativePercentage = total > 0 ? (cumulative / total * 100) : 0;
            
            return {
                rank: index + 1,
                plan: item.plan,
                amount: item.amount,
                percentage: percentage,
                cumulativePercentage: cumulativePercentage,
                isPareto80: cumulativePercentage <= 80
            };
        });

        // Análise por conta
        const accountData = Object.entries(kpis.distrib.porConta || {})
            .map(([account, amount]) => ({ account, amount: parseFloat(amount) }))
            .sort((a, b) => b.amount - a.amount);

        const pareto80Count = analysis.filter(item => item.isPareto80).length;
        
        const result = {
            period: { year, month },
            total,
            planAnalysis: {
                planCount: planData.length,
                pareto80Count,
                pareto80Percentage: planData.length > 0 ? (pareto80Count / planData.length * 100) : 0,
                hhi: kpis.concentracao?.hhi || 0,
                hhiScaled: kpis.concentracao?.hhiScaled || 0,
                details: analysis
            },
            accountAnalysis: {
                accountCount: accountData.length,
                details: accountData.slice(0, 10) // Top 10 contas
            },
            insights: {
                concentrationLevel: kpis.concentracao?.hhi > 0.25 ? 'ALTA' : kpis.concentracao?.hhi > 0.15 ? 'MÉDIA' : 'BAIXA',
                diversificationNeed: pareto80Count <= 3 ? 'ALTA' : pareto80Count <= 5 ? 'MÉDIA' : 'BAIXA',
                topCategory: planData[0]?.plan || 'N/A',
                topCategoryShare: planData.length > 0 ? (planData[0].amount / total * 100) : 0
            }
        };

        res.json(result);

    } catch (error) {
        console.error('Erro BI concentration:', error);
        res.status(500).json({ error: 'Erro ao gerar análise de concentração', details: error.message });
    }
});

// 3. Dashboard Executivo Consolidado
app.get('/api/bi/executive-dashboard', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.user?.id || 0);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const redis = getRedis();
        const cacheKey = `bi_executive:${userId}:${year}:${month}`;
        
        if (redis) {
            const cached = await redis.get(cacheKey);
            if (cached) return res.json({ cached: true, ...JSON.parse(cached) });
        }

        // Buscar dados em paralelo
        const [currentKpis, previousKpis, anomalies] = await Promise.all([
            computeMonthlyKPIs({ pool, userId, year, month, account: 'ALL' }),
            computeMonthlyKPIs({ 
                pool, 
                userId, 
                year: month === 1 ? year - 1 : year, 
                month: month === 1 ? 12 : month - 1, 
                account: 'ALL' 
            }),
            detectAnomalies({ pool, userId, year, month }).catch(() => ({ anomalies: [] }))
        ]);

        // Calcular variações
        const totalChange = previousKpis.totals?.total > 0 ? 
            ((currentKpis.totals.total - previousKpis.totals.total) / previousKpis.totals.total * 100) : 0;
        
        const businessChange = previousKpis.totals?.totalEmpresarial > 0 ? 
            ((currentKpis.totals.totalEmpresarial - previousKpis.totals.totalEmpresarial) / previousKpis.totals.totalEmpresarial * 100) : 0;

        // Análise de risco
        const riskLevel = anomalies.anomalies?.length > 5 ? 'ALTO' : 
                         anomalies.anomalies?.length > 2 ? 'MÉDIO' : 'BAIXO';

        // Análise de eficiência
        const efficiency = {
            costPerBusinessDay: currentKpis.eficiencia?.custoMedioDiaUtil || 0,
            averageTicket: currentKpis.eficiencia?.ticketMedioEmp || 0,
            transactionCount: currentKpis.totals?.despesas || 0
        };

        // Insights e alertas
        const insights = [];
        const alerts = [];

        if (Math.abs(totalChange) > 20) {
            alerts.push({
                type: 'WARNING',
                category: 'VARIAÇÃO_ALTA',
                message: `Variação de ${totalChange.toFixed(1)}% em relação ao mês anterior`,
                impact: 'HIGH'
            });
        }

        if (currentKpis.concentracao?.hhi > 0.25) {
            insights.push({
                type: 'CONCENTRATION',
                message: 'Alta concentração de gastos detectada',
                recommendation: 'Considere diversificar as categorias de despesas'
            });
        }

        if (currentKpis.projecao?.crescimentoProj > 15) {
            alerts.push({
                type: 'PROJECTION',
                category: 'CRESCIMENTO_PROJETADO',
                message: 'Projeção indica crescimento significativo até fim do mês',
                impact: 'MEDIUM'
            });
        }

        const dashboard = {
            period: { year, month },
            summary: {
                totalSpent: currentKpis.totals?.total || 0,
                businessSpent: currentKpis.totals?.totalEmpresarial || 0,
                personalSpent: currentKpis.totals?.totalPessoal || 0,
                projection: currentKpis.projecao?.projecao || 0,
                monthlyChange: totalChange,
                businessChange: businessChange,
                transactionCount: currentKpis.totals?.despesas || 0
            },
            keyMetrics: {
                concentration: {
                    hhi: currentKpis.concentracao?.hhi || 0,
                    level: currentKpis.concentracao?.hhi > 0.25 ? 'ALTA' : 'BAIXA'
                },
                efficiency,
                riskLevel,
                anomalyCount: anomalies.anomalies?.length || 0
            },
            insights,
            alerts,
            generatedAt: new Date().toISOString()
        };

        if (redis) await redis.setex(cacheKey, 900, JSON.stringify(dashboard)); // 15 min cache
        res.json(dashboard);

    } catch (error) {
        console.error('Erro BI executive dashboard:', error);
        res.status(500).json({ error: 'Erro ao gerar dashboard executivo', details: error.message });
    }
});

// 4. Relatório de Performance vs Metas
app.get('/api/bi/performance', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.user?.id || 0);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

        // Buscar KPIs e metas
        const [kpis, goalsResult] = await Promise.all([
            computeMonthlyKPIs({ pool, userId, year, month, account: 'ALL' }),
            pool.query(`SELECT total_goal, business_goal, personal_goal FROM expense_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [userId])
        ]);

        const goals = goalsResult[0]?.[0] || {};

        const performance = {
            period: { year, month },
            actual: {
                total: kpis.totals?.total || 0,
                business: kpis.totals?.totalEmpresarial || 0,
                personal: kpis.totals?.totalPessoal || 0
            },
            goals: {
                total: goals.total_goal || 0,
                business: goals.business_goal || 0,
                personal: goals.personal_goal || 0
            },
            variance: {},
            projection: {
                estimated: kpis.projecao?.projecao || 0,
                growth: kpis.projecao?.crescimentoProj || 0
            },
            status: 'NO_GOALS'
        };

        // Calcular variâncias se há metas
        if (goals.total_goal > 0) {
            performance.variance.total = performance.actual.total - goals.total_goal;
            performance.variance.totalPercent = (performance.variance.total / goals.total_goal) * 100;
            performance.status = performance.variance.totalPercent <= 0 ? 'WITHIN_BUDGET' : 'OVER_BUDGET';
        }

        if (goals.business_goal > 0) {
            performance.variance.business = performance.actual.business - goals.business_goal;
            performance.variance.businessPercent = (performance.variance.business / goals.business_goal) * 100;
        }

        if (goals.personal_goal > 0) {
            performance.variance.personal = performance.actual.personal - goals.personal_goal;
            performance.variance.personalPercent = (performance.variance.personal / goals.personal_goal) * 100;
        }

        // Análise de projeção vs meta
        if (goals.total_goal > 0 && performance.projection.estimated > 0) {
            performance.projection.riskLevel = performance.projection.estimated > goals.total_goal ? 'HIGH' : 'LOW';
            performance.projection.variance = performance.projection.estimated - goals.total_goal;
            performance.projection.variancePercent = (performance.projection.variance / goals.total_goal) * 100;
        }

        res.json(performance);

    } catch (error) {
        console.error('Erro BI performance:', error);
        res.status(500).json({ error: 'Erro ao gerar análise de performance', details: error.message });
    }
});

// 5. Relatório Completo de BI (export/download)
app.get('/api/bi/full-report', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.user?.id || 0);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const format = req.query.format || 'json'; // json, pdf (futuro)

        // Coletar todos os dados em paralelo
    const [trends, concentration, dashboard, performance, anomalies] = await Promise.all([
            // Trends dos últimos 6 meses
            (async () => {
                const trendsData = [];
                for (let i = 5; i >= 0; i--) {
                    const date = new Date(year, month - 1 - i, 1);
                    const y = date.getFullYear();
                    const m = date.getMonth() + 1;
                    try {
                        const kpis = await computeMonthlyKPIs({ pool, userId, year: y, month: m, account: 'ALL' });
                        if (kpis.totals) {
                            trendsData.push({
                                period: `${y}-${m.toString().padStart(2, '0')}`,
                                total: kpis.totals.total || 0,
                                business: kpis.totals.totalEmpresarial || 0,
                                personal: kpis.totals.totalPessoal || 0
                            });
                        }
                    } catch (e) { console.warn(`Erro trend ${y}-${m}:`, e.message); }
                }
                return trendsData;
            })(),
            // Concentração do mês atual
            (async () => {
                const kpis = await computeMonthlyKPIs({ pool, userId, year, month, account: 'ALL' });
                return {
                    hhi: kpis.concentracao?.hhi || 0,
                    planDistribution: kpis.distrib?.porPlano || {},
                    accountDistribution: kpis.distrib?.porConta || {}
                };
            })(),
            // Dashboard executivo
            (async () => {
                const kpis = await computeMonthlyKPIs({ pool, userId, year, month, account: 'ALL' });
                return {
                    summary: kpis.totals || {},
                    efficiency: kpis.eficiencia || {},
                    projection: kpis.projecao || {}
                };
            })(),
            // Performance
            (async () => {
                const [kpis, goalsResult] = await Promise.all([
                    computeMonthlyKPIs({ pool, userId, year, month, account: 'ALL' }),
                    pool.query(`SELECT total_goal, business_goal FROM expense_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [userId])
                ]);
                const goals = goalsResult[0]?.[0] || {};
                return { actual: kpis.totals || {}, goals };
            })(),
            // Anomalias
            detectAnomalies({ pool, userId, year, month }).catch(() => ({ anomalies: [] }))
        ]);

        // Compute budget control for decision support
        let budgetControl = null;
        try {
            const { computeBudgetControlFromDistribution, tetos } = require('./config/budgets');
            budgetControl = {
                ceilings: tetos,
                ...computeBudgetControlFromDistribution(concentration.planDistribution || {})
            };
        } catch (e) {
            console.warn('⚠️ Erro ao calcular budgetControl:', e.message);
        }

        const report = {
            metadata: {
                generatedAt: new Date().toISOString(),
                period: { year, month },
                userId,
                reportType: 'BUSINESS_INTELLIGENCE_COMPLETE'
            },
            executiveSummary: {
                totalSpent: dashboard.summary.total || 0,
                businessSpent: dashboard.summary.totalEmpresarial || 0,
                personalSpent: dashboard.summary.totalPessoal || 0,
                projection: dashboard.projection.projecao || 0,
                efficiency: {
                    costPerDay: dashboard.efficiency.custoMedioDiaUtil || 0,
                    averageTicket: dashboard.efficiency.ticketMedioEmp || 0
                },
                riskFactors: {
                    concentration: concentration.hhi > 0.25,
                    anomalies: anomalies.anomalies?.length > 0,
                    projection: dashboard.projection.crescimentoProj > 20
                }
            },
            trends: {
                historical: trends,
                analysis: trends.length >= 2 ? {
                    growth: trends[trends.length - 1].total > trends[0].total,
                    avgGrowthRate: trends.length > 1 ? 
                        (trends[trends.length - 1].total / trends[0].total - 1) * 100 / (trends.length - 1) : 0
                } : {}
            },
            concentration,
            performance,
            anomalies: {
                count: anomalies.anomalies?.length || 0,
                details: anomalies.anomalies?.slice(0, 10) || [] // Top 10 anomalias
            },
            recommendations: [],
            budgetControl
        };

        // Gerar recomendações
        if (concentration.hhi > 0.25) {
            report.recommendations.push({
                category: 'DIVERSIFICATION',
                priority: 'HIGH',
                message: 'Alta concentração de gastos detectada',
                action: 'Redistribuir orçamento entre mais categorias'
            });
        }

        if (trends.length >= 2 && trends[trends.length - 1].total > trends[trends.length - 2].total * 1.15) {
            report.recommendations.push({
                category: 'COST_CONTROL',
                priority: 'MEDIUM',
                message: 'Crescimento acelerado de gastos',
                action: 'Revisar processos de aprovação'
            });
        }

        if (anomalies.anomalies?.length > 0) {
            report.recommendations.push({
                category: 'GOVERNANCE',
                priority: 'HIGH',
                message: `${anomalies.anomalies.length} anomalia(s) detectada(s)`,
                action: 'Investigar transações anômalas'
            });
        }

        res.json(report);

    } catch (error) {
        console.error('Erro BI full report:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório completo de BI', details: error.message });
    }
});

// 6. Relatório Executivo Integrado (KPIs + BI)
app.get('/api/bi/executive-report', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.user?.id || 0);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const redis = getRedis();
        const cacheKey = `bi_executive_report:${userId}:${year}:${month}`;
        
        if (redis) {
            const cached = await redis.get(cacheKey);
            if (cached) return res.json({ cached: true, ...JSON.parse(cached) });
        }

        const report = await generateExecutiveReport(pool, userId, year, month);
        
        if (redis) await redis.setex(cacheKey, 1800, JSON.stringify(report)); // 30 min cache
        res.json(report);

    } catch (error) {
        console.error('Erro BI executive report:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório executivo', details: error.message });
    }
});

// 7. Análise Comparativa de Períodos
app.get('/api/bi/comparative', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.user?.id || 0);
        const currentYear = parseInt(req.query.currentYear) || new Date().getFullYear();
        const currentMonth = parseInt(req.query.currentMonth) || (new Date().getMonth() + 1);
        const compareYear = parseInt(req.query.compareYear) || (currentMonth === 1 ? currentYear - 1 : currentYear);
        const compareMonth = parseInt(req.query.compareMonth) || (currentMonth === 1 ? 12 : currentMonth - 1);

        const comparison = await computeComparativeAnalysis(pool, userId, currentYear, currentMonth, compareYear, compareMonth);
        res.json(comparison);

    } catch (error) {
        console.error('Erro BI comparative:', error);
        res.status(500).json({ error: 'Erro ao gerar análise comparativa', details: error.message });
    }
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
        // Campos enviados pelo formulário
    const { transaction_date, amount, description, account, account_plan_code, total_installments } = req.body;
        const userId = req.user.id;
        const has_invoice = req.body.has_invoice === 'true' || req.body.has_invoice === true;
        const invoicePath = req.file ? req.file.path : null;
        // Regra: se não informar plano de contas, classifica como empresarial automaticamente
        const explicitBusiness = req.body.is_business_expense === 'true' || req.body.is_business_expense === true;
        const finalIsBusiness = explicitBusiness || !account_plan_code ? 1 : 0;
        const finalAccountPlanCode = finalIsBusiness ? null : (account_plan_code || null);

        // Validação básica
    if (!transaction_date || !amount || !description || !account) {
            return res.status(400).json({ message: 'Campos obrigatórios em falta.' });
        }
    // Normaliza conta obsoleta para enum válido
    const normalizedAccount = (account || '').toUpperCase() === 'PIX' || (account || '').toUpperCase() === 'BOLETO' ? 'PIX/Boleto' : account;
        const numberOfInstallments = parseInt(total_installments || '1', 10);
        const installmentAmount = parseFloat(amount);
        if (isNaN(installmentAmount) || isNaN(numberOfInstallments) || numberOfInstallments < 1) {
            return res.status(400).json({ message: 'Valor ou parcelas inválidos.' });
        }

        const calculatedTotalAmount = installmentAmount * numberOfInstallments;
        for (let i = 0; i < numberOfInstallments; i++) {
            const installmentDate = new Date(transaction_date);
            installmentDate.setMonth(installmentDate.getMonth() + i);
            const installmentDescription = numberOfInstallments > 1 ? `${description} (Parcela ${i + 1}/${numberOfInstallments})` : description;
            await pool.query(
                `INSERT INTO expenses (user_id, transaction_date, amount, description, account, is_business_expense, account_plan_code, has_invoice, invoice_path, total_purchase_amount, installment_number, total_installments)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    userId,
                    installmentDate.toISOString().slice(0,10),
                    installmentAmount.toFixed(2),
                    installmentDescription,
                    normalizedAccount,
                    finalIsBusiness,
                    finalAccountPlanCode,
                    (i === 0 && has_invoice) ? 1 : 0,
                    (i === 0 && has_invoice) ? invoicePath : null,
                    calculatedTotalAmount.toFixed(2),
                    i + 1,
                    numberOfInstallments
                ]
            );
        }

        console.log('📝 Despesa criada', { userId, parcelas: numberOfInstallments, finalIsBusiness, finalAccountPlanCode });
        res.status(201).json({ message: numberOfInstallments > 1 ? 'Gastos parcelados adicionados com sucesso!' : 'Gasto adicionado com sucesso!' });
    } catch (error) {
        console.error('ERRO AO ADICIONAR GASTO:', error);
        const msg = (error && (error.message || '')).toLowerCase();
        // Mapear erros comuns para feedback claro
        if (msg.includes('enum') || msg.includes('truncated') || msg.includes('incorrect')) {
            return res.status(400).json({ 
                error: 'INVALID_ACCOUNT_ENUM', 
                message: "Conta inválida. Use 'PIX/Boleto' ou recarregue a página para atualizar.",
                details: error.message 
            });
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2' || msg.includes('foreign key')) {
            return res.status(400).json({ 
                error: 'INVALID_USER', 
                message: 'Sessão expirada ou usuário inválido. Faça login novamente.',
                details: error.message 
            });
        }
        if (error.code === 'ER_BAD_NULL_ERROR') {
            return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Campos obrigatórios ausentes.', details: error.message });
        }
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
            // Para conta unificada PIX/Boleto: só incluir recorrentes quando buscar intervalo de fatura explícito
            if (account === 'PIX/Boleto') {
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
            // Para conta unificada PIX/Boleto, não aplicar filtro de período de fatura customizado de cartão
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
                // Para conta unificada PIX/Boleto filtrar apenas por mês/ano normal
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

// Histórico multi-mês de despesas para projeções
// Parâmetros: startYear, startMonth, endYear, endMonth, plan (opcional), aggregate=true|false
// Retorna lista de despesas ou (se aggregate=true) agregação mensal por quantidade e valor
app.get('/api/expenses/history', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    let { startYear, startMonth, endYear, endMonth, plan, aggregate } = req.query;
    try {
        const now = new Date();
        startYear = parseInt(startYear) || now.getFullYear();
        startMonth = parseInt(startMonth) || (now.getMonth() + 1) - 5; // padrão 6 meses
        endYear = parseInt(endYear) || now.getFullYear();
        endMonth = parseInt(endMonth) || (now.getMonth() + 1);
        if (startMonth < 1) { startMonth = 1; }
        if (startMonth > 12) { startMonth = 12; }
        if (endMonth < 1) { endMonth = 1; }
        if (endMonth > 12) { endMonth = 12; }

        // Construir data inicial e final
        const startDate = new Date(startYear, startMonth - 1, 1);
        const endDate = new Date(endYear, endMonth, 0); // último dia do mês fim

        let sql = `SELECT id, transaction_date, amount, account_plan_code, account, description 
                   FROM expenses 
                   WHERE user_id = ? AND transaction_date BETWEEN ? AND ?`;
        const params = [userId, startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10)];
        if (plan) {
            sql += ' AND account_plan_code = ?';
            params.push(plan);
        }
        sql += ' ORDER BY transaction_date ASC';

        const [rows] = await pool.query(sql, params);

        if (aggregate === 'true') {
            const aggregation = {};
            rows.forEach(r => {
                const d = new Date(r.transaction_date);
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                if (!aggregation[key]) {
                    aggregation[key] = { month: key, count: 0, total: 0 };
                }
                aggregation[key].count += 1;
                aggregation[key].total += parseFloat(r.amount) || 0;
            });
            const result = Object.values(aggregation).sort((a,b)=> a.month.localeCompare(b.month));
            return res.json({
                plan: plan || null,
                start: startDate.toISOString().slice(0,10),
                end: endDate.toISOString().slice(0,10),
                months: result
            });
        }

        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar histórico de despesas:', error);
        res.status(500).json({ message: 'Erro ao buscar histórico de despesas', error: error.message });
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
    const normalizedAccount = (account || '').toUpperCase() === 'PIX' || (account || '').toUpperCase() === 'BOLETO' ? 'PIX/Boleto' : account;

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
            normalizedAccount,
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
// Centraliza tetos em config/budgets.js para reuso em BI e PDF
const { tetos, computeBudgetControlFromDistribution } = require('./config/budgets');

// Rota protegida para tetos por plano de contas
app.get('/api/expenses-goals', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month, account } = req.query;

        let sql = `
            SELECT account_plan_code, SUM(amount) as Total
            FROM expenses
            WHERE user_id = ? AND account_plan_code IS NOT NULL
        `;
        const params = [userId];

        // Filtro opcional por conta (ex.: PIX/Boleto)
        if (account) {
            // Normaliza valores legados para a conta unificada
            let normalized = account.trim();
            const upper = normalized.toUpperCase();
            if (upper === 'PIX' || upper === 'BOLETO' || upper === 'PIX/BOLETO') {
                normalized = 'PIX/Boleto';
            }
            sql += ' AND account = ?';
            params.push(normalized);
        }

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

// 8.2. BI - Controle de planos vs tetos para tomada de decisão
app.get('/api/bi/budget-control', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.user?.id || 0);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const account = req.query.account || 'ALL';

        const kpis = await computeMonthlyKPIs({ pool, userId, year, month, account });
        const control = computeBudgetControlFromDistribution(kpis.distrib?.porPlano || {});

        res.json({
            period: { year, month, account },
            totals: kpis.totals || {},
            distribution: kpis.distrib?.porPlano || {},
            ceilings: tetos,
            control
        });
    } catch (error) {
        console.error('Erro BI budget-control:', error);
        res.status(500).json({ error: 'Erro ao gerar controle de tetos', details: error.message });
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
// Função para gerar gráficos modernos e estéticos para o PDF
async function generateChartsForPDF(porPlano, porConta, expenses, chartJSNodeCanvas) {
    const charts = {};
    
    try {
        // Verificar se chartJSNodeCanvas está disponível
        if (!chartJSNodeCanvas) {
            console.log('⚠️ ChartJS não disponível - retornando charts vazios');
            return charts;
        }
        
        // Configurações globais para charts modernos
        const modernColors = {
            primary: ['#3B82F6', '#1E40AF', '#1D4ED8', '#2563EB', '#60A5FA'],
            success: ['#10B981', '#059669', '#047857', '#065F46', '#34D399'],
            warning: ['#F59E0B', '#D97706', '#B45309', '#92400E', '#FBBF24'],
            danger: ['#EF4444', '#DC2626', '#B91C1C', '#991B1B', '#F87171'],
            purple: ['#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#A78BFA'],
            gradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe']
        };
        // 1. 📊 GRÁFICO DE PIZZA MODERNO - Distribuição por Plano de Conta
        const planLabels = Object.keys(porPlano);
        const planValues = Object.values(porPlano);
        
        if (planLabels.length > 0) {
            const total = planValues.reduce((sum, val) => sum + val, 0);
            
            // Ordenar e agrupar planos menores
            const planData = planLabels.map((label, index) => ({
                label: label.length > 15 ? label.substring(0, 12) + '...' : label,
                value: planValues[index],
                percentage: ((planValues[index] / total) * 100).toFixed(1)
            })).sort((a, b) => b.value - a.value);

            // Agrupar planos pequenos (< 3% do total)
            const threshold = total * 0.03;
            const mainPlans = planData.filter(item => item.value >= threshold);
            const otherPlans = planData.filter(item => item.value < threshold);
            
            let finalData = [...mainPlans];
            if (otherPlans.length > 0) {
                const otherTotal = otherPlans.reduce((sum, item) => sum + item.value, 0);
                finalData.push({
                    label: 'Outros',
                    value: otherTotal,
                    percentage: ((otherTotal / total) * 100).toFixed(1)
                });
            }

            const planConfig = {
                type: 'doughnut',
                data: {
                    labels: finalData.map(item => `${item.label} (${item.percentage}%)`),
                    datasets: [{
                        data: finalData.map(item => item.value),
                        backgroundColor: modernColors.primary.concat(modernColors.success, modernColors.warning),
                        borderWidth: 3,
                        borderColor: '#ffffff',
                        hoverBorderWidth: 5,
                        hoverOffset: 15
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    layout: { padding: 20 },
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                padding: 15,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                font: { size: 12, weight: 'bold' },
                                color: '#1F2937',
                                generateLabels: function(chart) {
                                    const data = chart.data;
                                    return data.labels.map((label, i) => ({
                                        text: `${finalData[i].label}: R$ ${finalData[i].value.toFixed(2)}`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: '#ffffff',
                                        lineWidth: 3,
                                        hidden: false,
                                        index: i
                                    }));
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: ['📊 DISTRIBUIÇÃO POR PLANO DE CONTA', `💰 Total: R$ ${total.toFixed(2)}`],
                            font: { size: 18, weight: 'bold' },
                            color: '#1F2937',
                            padding: { top: 10, bottom: 20 }
                        }
                    }
                }
            };
            charts.planChart = await chartJSNodeCanvas.renderToBuffer(planConfig);
        }

        // 2. 📈 GRÁFICO DE BARRAS HORIZONTAIS - Top 10 Categorias
        const accountLabels = Object.keys(porConta);
        const accountValues = Object.values(porConta);
        
        if (accountLabels.length > 0) {
            // Ordenar contas por valor para melhor visualização
            const accountData = accountLabels.map((label, index) => ({
                label,
                value: accountValues[index]
            })).sort((a, b) => b.value - a.value);

            const sortedLabels = accountData.map(item => item.label);
            const sortedValues = accountData.map(item => item.value);
            const totalAccount = sortedValues.reduce((a, b) => a + b, 0);

            // Cores graduais baseadas no valor
            const generateColors = (count) => {
                const baseColors = ['#1E40AF', '#059669', '#DC2626', '#7C3AED', '#EA580C'];
                const colors = [];
                for (let i = 0; i < count; i++) {
                    colors.push(baseColors[i % baseColors.length]);
                }
                return colors;
            };

            const accountConfig = {
                type: 'bar',
                data: {
                    labels: sortedLabels.map(label => label.length > 15 ? label.substring(0, 12) + '...' : label),
                    datasets: [{
                        label: 'Gastos por Conta',
                        data: sortedValues,
                        backgroundColor: generateColors(sortedValues.length),
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        borderRadius: 12,
                        borderSkipped: false,
                        hoverBackgroundColor: generateColors(sortedValues.length).map(color => color + 'CC'),
                        hoverBorderWidth: 3
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 30,
                            bottom: 30,
                            left: 30,
                            right: 30
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: [`🏦 GASTOS POR CONTA`, `Total: R$ ${totalAccount.toFixed(2)}`],
                            font: { 
                                size: 16, 
                                weight: 'bold' 
                            },
                            color: '#1F2937',
                            padding: {
                                top: 15,
                                bottom: 25
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#ffffff',
                            bodyColor: '#ffffff',
                            borderColor: '#374151',
                            borderWidth: 1,
                            callbacks: {
                                title: function(context) {
                                    return sortedLabels[context[0].dataIndex];
                                },
                                label: function(context) {
                                    const value = context.parsed.y;
                                    const percentage = ((value / totalAccount) * 100).toFixed(1);
                                    return [
                                        `Valor: R$ ${value.toFixed(2)}`,
                                        `Percentual: ${percentage}% do total`
                                    ];
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
                                    weight: '600'
                                },
                                color: '#374151',
                                maxRotation: 45,
                                minRotation: 0
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)',
                                lineWidth: 1
                            },
                            ticks: {
                                font: {
                                    size: 11,
                                    weight: '500'
                                },
                                color: '#6B7280',
                                callback: function(value) {
                                    return 'R$ ' + value.toFixed(0);
                                }
                            }
                        }
                    },
                    elements: {
                        bar: {
                            borderWidth: 2
                        }
                    }
                }
            };
            charts.accountChart = await chartJSNodeCanvas.renderToBuffer(accountConfig);
        }

        // 3. 🥧 GRÁFICO DE COMPARAÇÃO - Pessoal vs Empresarial
        const totalPessoal = expenses.filter(e => !e.is_business_expense).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const totalEmpresarial = expenses.filter(e => e.is_business_expense).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        
        if (totalPessoal > 0 || totalEmpresarial > 0) {
            const comparisonConfig = {
                type: 'pie',
                data: {
                    labels: ['🏠 Pessoal', '💼 Empresarial'],
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
                    layout: { padding: 20 },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true,
                                font: { size: 14, weight: 'bold' },
                                color: '#374151',
                                generateLabels: function(chart) {
                                    const data = chart.data;
                                    const total = totalPessoal + totalEmpresarial;
                                    return data.labels.map((label, i) => {
                                        const value = data.datasets[0].data[i];
                                        const percentage = ((value / total) * 100).toFixed(1);
                                        return {
                                            text: `${label}: R$ ${value.toFixed(2)} (${percentage}%)`,
                                            fillStyle: data.datasets[0].backgroundColor[i],
                                            strokeStyle: '#ffffff',
                                            lineWidth: 4,
                                            hidden: false,
                                            index: i
                                        };
                                    });
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: '💼 DIVISÃO: PESSOAL vs EMPRESARIAL',
                            font: { size: 18, weight: 'bold' },
                            color: '#1F2937',
                            padding: { top: 10, bottom: 20 }
                        }
                    }
                }
            };
            charts.comparisonChart = await chartJSNodeCanvas.renderToBuffer(comparisonConfig);
        }

        // 4. 📈 GRÁFICO DE LINHA - Evolução Diária dos Gastos com Média Móvel
        const dailyData = {};
        expenses.forEach(e => {
            const day = new Date(e.transaction_date).getDate();
            dailyData[day] = (dailyData[day] || 0) + parseFloat(e.amount || 0);
        });

        const days = Object.keys(dailyData).map(Number).sort((a, b) => a - b);
        if (days.length > 2) {
            // Calcular média móvel de 3 dias
            const movingAverage = [];
            for (let i = 0; i < days.length; i++) {
                const start = Math.max(0, i - 1);
                const end = Math.min(days.length - 1, i + 1);
                const avg = days.slice(start, end + 1).reduce((sum, day) => sum + dailyData[day], 0) / (end - start + 1);
                movingAverage.push(avg);
            }

            const evolutionConfig = {
                type: 'line',
                data: {
                    labels: days.map(d => `Dia ${d}`),
                    datasets: [
                        {
                            label: 'Gastos Diários',
                            data: days.map(d => dailyData[d]),
                            borderColor: '#3B82F6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#3B82F6',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 3,
                            pointRadius: 5,
                            pointHoverRadius: 8
                        },
                        {
                            label: 'Média Móvel',
                            data: movingAverage,
                            borderColor: '#EF4444',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            fill: false,
                            tension: 0.4,
                            pointRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    layout: { padding: 20 },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                usePointStyle: true,
                                font: { size: 12, weight: 'bold' },
                                color: '#374151'
                            }
                        },
                        title: {
                            display: true,
                            text: '📈 EVOLUÇÃO DIÁRIA DOS GASTOS',
                            font: { size: 18, weight: 'bold' },
                            color: '#1F2937',
                            padding: { top: 10, bottom: 20 }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: '#E5E7EB' },
                            ticks: {
                                font: { size: 10, weight: 'bold' },
                                color: '#374151'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: '#E5E7EB' },
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value.toFixed(0);
                                },
                                font: { size: 10 },
                                color: '#6B7280'
                            }
                        }
                    }
                }
            };
            charts.evolutionChart = await chartJSNodeCanvas.renderToBuffer(evolutionConfig);
        }

        // 5. 📊 GRÁFICO DE BARRAS EMPILHADAS - Comparativo Semanal
        const weeklyData = { personal: {}, business: {} };
        expenses.forEach(e => {
            const date = new Date(e.transaction_date);
            const week = Math.ceil(date.getDate() / 7);
            const weekLabel = `Sem ${week}`;
            const amount = parseFloat(e.amount || 0);
            
            if (e.is_business_expense) {
                weeklyData.business[weekLabel] = (weeklyData.business[weekLabel] || 0) + amount;
            } else {
                weeklyData.personal[weekLabel] = (weeklyData.personal[weekLabel] || 0) + amount;
            }
        });

        const weeks = [...new Set([...Object.keys(weeklyData.personal), ...Object.keys(weeklyData.business)])].sort();
        if (weeks.length > 1) {
            const weeklyConfig = {
                type: 'bar',
                data: {
                    labels: weeks,
                    datasets: [
                        {
                            label: '🏠 Pessoal',
                            data: weeks.map(week => weeklyData.personal[week] || 0),
                            backgroundColor: '#10B981',
                            borderColor: '#ffffff',
                            borderWidth: 2
                        },
                        {
                            label: '💼 Empresarial',
                            data: weeks.map(week => weeklyData.business[week] || 0),
                            backgroundColor: '#F59E0B',
                            borderColor: '#ffffff',
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    layout: { padding: 20 },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                usePointStyle: true,
                                font: { size: 12, weight: 'bold' },
                                color: '#374151'
                            }
                        },
                        title: {
                            display: true,
                            text: '📅 COMPARATIVO SEMANAL: PESSOAL vs EMPRESARIAL',
                            font: { size: 18, weight: 'bold' },
                            color: '#1F2937',
                            padding: { top: 10, bottom: 20 }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            grid: { display: false },
                            ticks: {
                                font: { size: 11, weight: 'bold' },
                                color: '#374151'
                            }
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            grid: { color: '#E5E7EB' },
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value.toFixed(0);
                                },
                                font: { size: 10 },
                                color: '#6B7280'
                            }
                        }
                    }
                }
            };
            charts.weeklyChart = await chartJSNodeCanvas.renderToBuffer(weeklyConfig);
        }

        console.log(`✅ Gráficos modernos gerados: ${Object.keys(charts).length} charts`);

    } catch (error) {
        console.error('Erro ao gerar gráficos para PDF:', error);
    }
    
    return charts;
}

// 🤖 FUNÇÃO PRINCIPAL: RELATÓRIO BI INTELIGENTE
async function generateIntelligentBIReport(data) {
    const { expenses, total, totalPessoal, totalEmpresarial, startDate, endDate, contaNome, year, month, porPlano, porConta, userId } = data;

    // Tema/estilo do relatório (ex.: 'modern' padrão, 'nubank' inspirado no anexo)
    function resolveTheme(theme) {
        if ((theme || '').toLowerCase() === 'nubank') {
            return {
                name: 'nubank',
                headerGradient: ['#8A05BE', '#C572E0'],
                headerSolid: '#8A05BE',
                headerText: '#FFFFFF',
                kpiBg: ['#FFFFFF', '#FFFFFF', '#FFFFFF'],
                kpiText: '#0F172A',
                kpiBorder: '#E5E7EB',
                barPalette: ['#8A05BE', '#A13DC7', '#BE7DE1', '#C2410C', '#0E7490'],
                barBorder: '#E5E7EB',
                zebra1: '#FAF5FF',
                zebra2: '#FFFFFF',
                accent: '#8A05BE',
                darkText: '#0F172A',
                lightText: '#FFFFFF'
            };
        }
        return {
            name: 'modern',
            headerGradient: ['#667eea', '#764ba2', '#3B82F6'],
            headerSolid: '#0F172A',
            headerText: '#FFFFFF',
            kpiBg: ['#E5F3FF', '#E6FFFA', '#FFF7ED'],
            kpiText: '#0F172A',
            kpiBorder: '#E5E7EB',
            barPalette: ['#2563EB', '#059669', '#EA580C', '#DC2626', '#7C3AED'],
            barBorder: '#94A3B8',
            zebra1: '#F9FAFB',
            zebra2: '#FFFFFF',
            accent: '#2563EB',
            darkText: '#0F172A',
            lightText: '#FFFFFF'
        };
    }
    const themeCfg = resolveTheme(data.theme);
    data.themeCfg = themeCfg;
    
    console.log('🎯 Gerando relatório BI inteligente...');
    
    // CRIAR DOCUMENTO PDF
    const doc = new pdfkit({ margin: 30, size: 'A4' });
    
    // Configurar fonte com fallback para Railway
    try {
        const fontPath = path.join(__dirname, 'fonts', 'NotoSans-Regular.ttf');
        if (fs.existsSync(fontPath)) {
            doc.registerFont('NotoSans', fontPath);
            doc.font('NotoSans');
        } else {
            doc.font('Helvetica');
        }
    } catch (fontError) {
        doc.font('Helvetica');
    }

    // === 📊 PÁGINA 1: DASHBOARD EXECUTIVO ===
    await createExecutiveDashboard(doc, data);

    // === 🎯 PÁGINA 2: CONTROLE DE TETOS POR PLANO (FOCO) ===
    doc.addPage();
    await createBudgetControlPage(doc, data);

    // === 📋 PÁGINA 3: DETALHAMENTO DE GASTOS POR PLANO ===
    doc.addPage();
    await createExpenseDetailPage(doc, data);

    // === 🧾 (Opcional) PÁGINA DE EXTRATO ESTILO CONTA/NUBANK ===
    if (themeCfg.name === 'nubank') {
        doc.addPage();
        await createStatementStylePage(doc, data);
    }

    // === 📈 PÁGINA 4: ANÁLISES BI E INSIGHTS ===
    doc.addPage();
    await createBIAnalyticsPage(doc, data);

    // === 📋 PÁGINA 5: DETALHAMENTO INTELIGENTE ===
    doc.addPage();
    await createIntelligentDetailPage(doc, data);

    // === 📊 PÁGINA 6: GRÁFICOS MODERNOS ===
    doc.addPage();
    await createModernChartsPage(doc, data);
    
    return doc;
}

// 📊 PÁGINA 1: DASHBOARD EXECUTIVO
async function createExecutiveDashboard(doc, data) {
    const { expenses, total, totalPessoal, totalEmpresarial, startDate, endDate, contaNome, year, month, themeCfg } = data;
    
    // === CABEÇALHO EXECUTIVO MODERNO ===
    const gradient = doc.linearGradient(0, 0, doc.page.width, 100);
    const headerStops = themeCfg?.headerGradient || ['#667eea', '#764ba2', '#3B82F6'];
    const stopsCount = headerStops.length;
    headerStops.forEach((col, idx) => {
        gradient.stop(idx / Math.max(1, stopsCount - 1), col);
    });
    
    doc.rect(0, 0, doc.page.width, 100).fill(gradient);
    
    // Logo e título principal
    doc.fontSize(32).fillColor('#FFFFFF').text('💼', 40, 25);
    doc.fontSize(24).text('DASHBOARD EXECUTIVO', 90, 25, { width: 400 });
    
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    doc.fontSize(14).fillColor('#E5E7EB').text(`${monthNames[month-1]} ${year} • ${contaNome}`, 90, 55);
    
    // Data de geração e timestamp
    const now = new Date();
    doc.fontSize(10).fillColor('#D1D5DB').text(
        `Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`, 
        0, 75, { width: doc.page.width - 40, align: 'right' }
    );

    doc.y = 120;

    // === KPIs PRINCIPAIS COM DESIGN MODERNO ===
    doc.fontSize(20).fillColor('#1F2937').text('📊 INDICADORES-CHAVE DE PERFORMANCE', { underline: true });
    doc.moveDown(1);

    const kpiY = doc.y;
    const kpiWidth = 160;
    const kpiHeight = 120;
    const spacing = 20;

    // Calcular métricas inteligentes
    const mediaDiaria = total / new Date(year, month, 0).getDate();
    const percentualPessoal = total > 0 ? (totalPessoal / total * 100) : 0;
    const percentualEmpresarial = total > 0 ? (totalEmpresarial / total * 100) : 0;
    
    // KPI 1: Total Geral (usa paleta de tema)
    const kpiBg1 = themeCfg?.kpiBg?.[0] || '#E5F3FF';
    const kpiFg = themeCfg?.kpiText || '#0F172A';
    doc.roundedRect(40, kpiY, kpiWidth, kpiHeight, 15).fill(kpiBg1).stroke(themeCfg?.kpiBorder || '#E5E7EB');
    doc.fillColor(kpiFg).fontSize(14).text('💰 TOTAL GERAL', 50, kpiY + 20, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(20).text(`R$ ${(total || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, 50, kpiY + 45, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(11).text(`${expenses.length} transações`, 50, kpiY + 75, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(10).text(`Média: R$ ${(total/expenses.length || 0).toFixed(2)}`, 50, kpiY + 90, { width: kpiWidth - 20, align: 'center' });

    // KPI 2: Pessoal
    const kpi2X = 40 + kpiWidth + spacing;
    const kpiBg2 = themeCfg?.kpiBg?.[1] || '#E6FFFA';
    doc.roundedRect(kpi2X, kpiY, kpiWidth, kpiHeight, 15).fill(kpiBg2).stroke(themeCfg?.kpiBorder || '#E5E7EB');
    doc.fillColor(kpiFg).fontSize(14).text('🏠 PESSOAL', kpi2X + 10, kpiY + 20, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(20).text(`R$ ${(totalPessoal || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, kpi2X + 10, kpiY + 45, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(11).text(`${percentualPessoal.toFixed(1)}% do total`, kpi2X + 10, kpiY + 75, { width: kpiWidth - 20, align: 'center' });
    const pessoaisCount = expenses.filter(e => !e.is_business_expense).length;
    doc.fontSize(10).text(`${pessoaisCount} transações`, kpi2X + 10, kpiY + 90, { width: kpiWidth - 20, align: 'center' });

    // KPI 3: Empresarial
    const kpi3X = kpi2X + kpiWidth + spacing;
    const kpiBg3 = themeCfg?.kpiBg?.[2] || '#FFF7ED';
    doc.roundedRect(kpi3X, kpiY, kpiWidth, kpiHeight, 15).fill(kpiBg3).stroke(themeCfg?.kpiBorder || '#E5E7EB');
    doc.fillColor(kpiFg).fontSize(14).text('💼 EMPRESARIAL', kpi3X + 10, kpiY + 20, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(20).text(`R$ ${(totalEmpresarial || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, kpi3X + 10, kpiY + 45, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(11).text(`${percentualEmpresarial.toFixed(1)}% do total`, kpi3X + 10, kpiY + 75, { width: kpiWidth - 20, align: 'center' });
    const empresariaisCount = expenses.filter(e => e.is_business_expense).length;
    doc.fontSize(10).text(`${empresariaisCount} transações`, kpi3X + 10, kpiY + 90, { width: kpiWidth - 20, align: 'center' });

    doc.y = kpiY + kpiHeight + 30;

    // === INSIGHTS INTELIGENTES ===
    doc.fontSize(18).fillColor('#1F2937').text('🧠 INSIGHTS INTELIGENTES', { underline: true });
    doc.moveDown(1);

    // Análise de tendências
    const insights = generateIntelligentInsights(expenses, total, totalPessoal, totalEmpresarial, year, month);
    
    insights.forEach((insight, index) => {
        const colors = ['#EFF6FF', '#F0F9FF', '#ECFDF5', '#FFFBEB', '#FEF2F2'];
        const textColors = ['#1E40AF', '#0C4A6E', '#065F46', '#92400E', '#DC2626'];
        
        doc.roundedRect(40, doc.y, doc.page.width - 80, 50, 10).fill(colors[index % colors.length]);
        doc.fillColor(textColors[index % textColors.length]).fontSize(12)
           .text(`${insight.icon} ${insight.title}`, 55, doc.y + 12, { width: doc.page.width - 110 });
        doc.fontSize(10).fillColor('#374151')
           .text(insight.description, 55, doc.y + 30, { width: doc.page.width - 110 });
        
        doc.y += 65;
    });

    // === ALERTAS E RECOMENDAÇÕES ===
    doc.moveDown(1);
    doc.fontSize(18).fillColor('#DC2626').text('⚠️ ALERTAS & RECOMENDAÇÕES', { underline: true });
    doc.moveDown(0.5);

    const alerts = generateSmartAlerts(expenses, total, totalPessoal, totalEmpresarial, year, month);
    
    if (alerts.length === 0) {
        doc.roundedRect(40, doc.y, doc.page.width - 80, 40, 8).fill('#D1FAE5');
        doc.fillColor('#065F46').fontSize(12).text('✅ Nenhum alerta crítico identificado. Ótimo controle financeiro!', 55, doc.y + 12);
        doc.y += 50;
    } else {
        alerts.forEach(alert => {
            const alertColor = alert.level === 'critico' ? '#FEF2F2' : alert.level === 'atencao' ? '#FFFBEB' : '#F0F9FF';
            const alertTextColor = alert.level === 'critico' ? '#DC2626' : alert.level === 'atencao' ? '#D97706' : '#2563EB';
            
            doc.roundedRect(40, doc.y, doc.page.width - 80, 50, 8).fill(alertColor);
            doc.fillColor(alertTextColor).fontSize(12).text(`${alert.icon} ${alert.message}`, 55, doc.y + 12, { width: doc.page.width - 110 });
            doc.fontSize(10).fillColor('#374151').text(alert.recommendation, 55, doc.y + 30, { width: doc.page.width - 110 });
            doc.y += 65;
        });
    }
}

// 📈 PÁGINA 2: ANÁLISES BI E INSIGHTS
async function createBIAnalyticsPage(doc, data) {
    const {
        expenses = [],
        total = 0,
        totalPessoal = 0,
        totalEmpresarial = 0,
        porPlano = {},
        porConta = {},
        year,
        month
    } = data;
    
    // Utilitários de contraste de cor para melhorar legibilidade
    function hexToRgb(hex) {
        try {
            let c = (hex || '').replace('#', '');
            if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
            const num = parseInt(c, 16);
            return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
        } catch { return { r: 0, g: 0, b: 0 }; }
    }
    function relativeLuminance({ r, g, b }) {
        const srgb = [r, g, b].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    }
    function textColorForBg(hex) {
        try {
            const lum = relativeLuminance(hexToRgb(hex));
            return lum > 0.5 ? '#111827' : '#FFFFFF';
        } catch { return '#FFFFFF'; }
    }

    // Cabeçalho da página
    doc.rect(0, 0, doc.page.width, 80).fill('#764ba2');
    doc.fontSize(24).fillColor('#FFFFFF').text('📈 ANÁLISES BUSINESS INTELLIGENCE', 0, 25, { align: 'center', width: doc.page.width });
    doc.fontSize(14).fillColor('#E5E7EB').text('Insights Avançados & Análises Preditivas', 0, 50, { align: 'center', width: doc.page.width });
    
    doc.y = 100;
    
    // === COMPARATIVO EMPRESARIAL VS PESSOAL ===
    doc.fontSize(18).fillColor('#1F2937').text('💼 COMPARATIVO: EMPRESARIAL VS PESSOAL', { underline: true });
    doc.moveDown(1);
    
    const propEmpresarial = total > 0 ? (totalEmpresarial / total * 100) : 0;
    const propPessoal = total > 0 ? (totalPessoal / total * 100) : 0;
    
    // Gráfico de barras horizontais comparativo
    const barWidth = 400;
    const barHeight = 30;
    const startX = 80;
    let currentY = doc.y;
    
    // Barra Empresarial
    doc.fillColor('#E5E7EB').rect(startX, currentY, barWidth, barHeight).fill();
    const empWidth = (barWidth * propEmpresarial) / 100;
    doc.fillColor('#3B82F6').rect(startX, currentY, empWidth, barHeight).fill();
    doc.fillColor('#FFFFFF').fontSize(12).text('💼 EMPRESARIAL', startX + 10, currentY + 8);
    doc.fillColor('#1F2937').text(`R$ ${totalEmpresarial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${propEmpresarial.toFixed(1)}%)`, startX + barWidth + 20, currentY + 8);
    
    currentY += barHeight + 20;
    
    // Barra Pessoal
    doc.fillColor('#E5E7EB').rect(startX, currentY, barWidth, barHeight).fill();
    const pesWidth = (barWidth * propPessoal) / 100;
    doc.fillColor('#EF4444').rect(startX, currentY, pesWidth, barHeight).fill();
    doc.fillColor('#FFFFFF').fontSize(12).text('🏠 PESSOAL', startX + 10, currentY + 8);
    doc.fillColor('#1F2937').text(`R$ ${totalPessoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${propPessoal.toFixed(1)}%)`, startX + barWidth + 20, currentY + 8);
    
    doc.y = currentY + 50;
    
    // === GRÁFICO DE UTILIZAÇÃO POR PLANO DE CONTA ===
    doc.fontSize(18).fillColor('#1F2937').text('📊 UTILIZAÇÃO POR PLANO DE CONTA', { underline: true });
    doc.moveDown(1);
    
    // Obter dados dos planos com utilização
    const budgetConfig = require('./config/budgets');
    const planosComGastos = [];
    
    for (let planId = 1; planId <= 47; planId++) {
        const planData = porPlano[planId];
        const ceiling = budgetConfig.tetos[planId] || 0;
        const spent = planData ? planData.total : 0;
        
        if (spent > 0 || ceiling > 0) {
            const percent = ceiling > 0 ? (spent / ceiling * 100) : 0;
            planosComGastos.push({
                plan: planId,
                spent: spent,
                ceiling: ceiling,
                percent: Math.min(percent, 150) // Cap at 150% for visualization
            });
        }
    }
    
    // Ordenar por maior utilização
    planosComGastos.sort((a, b) => b.percent - a.percent);
    
    // Mostrar top 15 planos com maior utilização
    const topPlanos = planosComGastos.slice(0, 15);
    
    if (topPlanos.length > 0) {
        doc.fontSize(12).fillColor('#6B7280').text('Top 15 Planos por Utilização do Teto:');
        doc.moveDown(0.5);
        
        const chartStartY = doc.y;
        const chartHeight = 300;
        const chartWidth = 500;
        const chartX = 60;
        
        // Background do gráfico
        doc.rect(chartX, chartStartY, chartWidth, chartHeight).stroke('#E5E7EB');
        
        // Barras do gráfico
        const barSpacing = chartHeight / topPlanos.length;
        const maxBarWidth = chartWidth - 100;
        
        topPlanos.forEach((plano, index) => {
            const y = chartStartY + (index * barSpacing) + 5;
            const barWidth = (plano.percent / 150) * maxBarWidth; // Scale to 150%
            
            // Cor baseada na utilização
            let color = '#10B981'; // Verde para OK
            if (plano.percent >= 100) color = '#EF4444'; // Vermelho para over budget
            else if (plano.percent >= 90) color = '#F59E0B'; // Amarelo para at risk
            else if (plano.percent >= 70) color = '#3B82F6'; // Azul para watch
            
            // Barra de fundo
            doc.fillColor('#F3F4F6').rect(chartX + 80, y, maxBarWidth, barSpacing - 8).fill();
            
            // Barra de progresso
            doc.fillColor(color).rect(chartX + 80, y, Math.max(2, barWidth), barSpacing - 8).fill();
            
            // Label do plano
            doc.fillColor('#374151').fontSize(10).text(`Plano ${plano.plan}`, chartX + 5, y + 3, { width: 70 });
            
            // Percentual
            doc.fillColor('#1F2937').text(`${plano.percent.toFixed(1)}%`, chartX + 85 + Math.min(barWidth + 5, maxBarWidth - 50), y + 3);
        });
        
        // Legenda
        doc.y = chartStartY + chartHeight + 20;
        doc.fontSize(10).fillColor('#6B7280');
        const legendItems = [
            { color: '#10B981', text: '■ OK (<70%)' },
            { color: '#3B82F6', text: '■ ATENÇÃO (70-89%)' },
            { color: '#F59E0B', text: '■ RISCO (90-99%)' },
            { color: '#EF4444', text: '■ EXCEDIDO (≥100%)' }
        ];
        
        legendItems.forEach((item, index) => {
            const x = 80 + (index * 120);
            doc.fillColor(item.color).text(item.text, x, doc.y);
        });
        
        doc.moveDown(2);
    }
    
    // === ANÁLISE TEMPORAL ===
    doc.fontSize(18).fillColor('#1F2937').text('📅 ANÁLISE TEMPORAL', { underline: true });
    doc.moveDown(1);
    
    const temporalAnalysis = analyzeTemporalPatterns(expenses, year, month);
    
    // Gráfico de distribuição semanal
    doc.fontSize(14).fillColor('#4B5563').text('Distribuição por Semanas do Mês:');
    doc.moveDown(0.5);
    
    temporalAnalysis.weekly.forEach((week, index) => {
        const weekWidth = (doc.page.width - 120) * (total > 0 ? (week.total / total) : 0);
        const barColor = ['#2563EB', '#059669', '#EA580C', '#DC2626', '#7C3AED'][index];
        const barY = doc.y;

        // Desenha a barra (mínimo visual de 2px quando houver valor)
        const effectiveWidth = week.total > 0 ? Math.max(2, weekWidth) : 0;
        if (effectiveWidth > 0) {
            // Fill com borda fina para contraste
            doc.roundedRect(60, barY, effectiveWidth, 25, 5).fill(barColor);
            doc.roundedRect(60, barY, effectiveWidth, 25, 5).stroke('#94A3B8');
        }

        const label = `Sem ${index + 1}: R$ ${week.total.toFixed(2)} (${week.count} trans.)`;
        if (effectiveWidth >= 120) {
            // Texto dentro da barra com contraste automático
            const insideColor = textColorForBg(barColor);
            doc.fillColor(insideColor).fontSize(10).text(label, 70, barY + 7, { width: effectiveWidth - 20 });
        } else {
            // Texto fora da barra em cor escura
            const textX = 60 + effectiveWidth + 10;
            doc.fillColor('#1F2937').fontSize(10).text(label, textX, barY + 7, { width: doc.page.width - textX - 40 });
        }
        // Reset de cor para escuro por padrão
        doc.fillColor('#1F2937');
        doc.y += 35;
    });
    
    doc.moveDown(1);
    
    // === ANÁLISE CATEGORÍAS TOP ===
    doc.fontSize(18).fillColor('#1F2937').text('🏆 TOP CATEGORIAS', { underline: true });
    doc.moveDown(1);
    
    const topCategories = Object.entries(porConta || {})
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    topCategories.forEach(([categoria, valor], index) => {
        const totalTop = topCategories.length ? topCategories[0][1] : 0;
        const share = totalTop > 0 ? (valor / totalTop) : 0;
        const percentage = total > 0 ? (valor / total * 100).toFixed(1) : '0.0';
        const barWidth = (doc.page.width - 220) * share;
        const colors = ['#1E40AF', '#047857', '#B91C1C', '#6D28D9', '#C2410C', '#0E7490', '#3F6212', '#9D174D', '#3730A3', '#115E59'];

        // Nome da categoria
        doc.fontSize(11).fillColor('#374151').text(`${index + 1}. ${categoria}`, 40, doc.y);

        // Barra
        const baseX = 200;
        const baseY = doc.y - 2;
        const effectiveBar = valor > 0 ? Math.max(2, barWidth) : 0;
        if (effectiveBar > 0) {
            const barCol = colors[index];
            doc.roundedRect(baseX, baseY, effectiveBar, 18, 3).fill(barCol);
            doc.roundedRect(baseX, baseY, effectiveBar, 18, 3).stroke('#CBD5E1');
        }

        const valueLabel = `R$ ${valor.toFixed(2)} (${percentage}%)`;
        if (effectiveBar >= 100) {
            // Texto dentro da barra com contraste automático
            const insideColor = textColorForBg(colors[index]);
            doc.fillColor(insideColor).fontSize(9).text(valueLabel, baseX + 5, doc.y + 2, { width: effectiveBar - 10 });
        } else {
            // Texto fora da barra em cor escura
            const labelX = baseX + effectiveBar + 8;
            doc.fillColor('#1F2937').fontSize(9).text(valueLabel, labelX, doc.y + 2, { width: doc.page.width - labelX - 40 });
        }
        // Reset de cor
        doc.fillColor('#1F2937');
        doc.y += 25;
    });
    
    doc.moveDown(1);
    
    // === ANÁLISE COMPARATIVA ===
    doc.fontSize(18).fillColor('#1F2937').text('⚖️ ANÁLISE COMPARATIVA', { underline: true });
    doc.moveDown(1);
    
    const comparative = generateComparativeAnalysis(expenses || [], total || 0, totalPessoal || 0, totalEmpresarial || 0);
    
    comparative.forEach(comp => {
        doc.roundedRect(40, doc.y, doc.page.width - 80, 60, 8).fill('#F8FAFC');
        doc.fillColor('#1E293B').fontSize(12).text(`${comp.icon} ${comp.title}`, 55, doc.y + 12);
        doc.fontSize(10).fillColor('#475569').text(comp.description, 55, doc.y + 30, { width: doc.page.width - 110 });
        doc.y += 75;
    });
}

// 📋 PÁGINA 3: DETALHAMENTO INTELIGENTE
async function createIntelligentDetailPage(doc, data) {
    const { expenses = [], porPlano = {}, year, month } = data;
    
    // Cabeçalho
    doc.rect(0, 0, doc.page.width, 80).fill('#4F46E5');
    doc.fontSize(24).fillColor('#FFFFFF').text('📋 DETALHAMENTO INTELIGENTE', 0, 25, { align: 'center', width: doc.page.width });
    doc.fontSize(14).fillColor('#E5E7EB').text('Análise Detalhada por Planos de Conta', 0, 50, { align: 'center', width: doc.page.width });
    
    doc.y = 100;
    
    // Agrupar por planos e analisar
    const detailedAnalysis = Object.entries(porPlano || {})
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8); // Top 8 planos
    
    doc.fontSize(16).fillColor('#1F2937').text('📊 ANÁLISE POR PLANO DE CONTA', { underline: true });
    doc.moveDown(1);
    
    detailedAnalysis.forEach(([plano, total], index) => {
        const planoStr = String(plano);
        const planoExpenses = (expenses || []).filter(e => String(e.account_plan_code || '') === planoStr);
        const count = planoExpenses.length || 1;
        const avgTransaction = total / count;
        
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];
        
    doc.roundedRect(40, doc.y, doc.page.width - 80, 80, 10).fill('#F8FAFC');
        
        // Header do plano
    doc.roundedRect(50, doc.y + 10, doc.page.width - 100, 25, 5).fill('#E5E7EB');
    doc.fillColor('#111827').fontSize(12).text(`Plano ${plano}`, 60, doc.y + 18, { width: 200 });
    doc.fillColor('#111827').text(`R$ ${total.toFixed(2)}`, 0, doc.y + 18, { width: doc.page.width - 110, align: 'right' });
        
        // Detalhes
    doc.fillColor('#111827').fontSize(10)
           .text(`• ${planoExpenses.length || 0} transações`, 60, doc.y + 45)
           .text(`• Média por transação: R$ ${avgTransaction.toFixed(2)}`, 60, doc.y + 60)
           .text(`• Percentual do total: ${((total / ((expenses||[]).reduce((sum, e) => sum + parseFloat(e.amount||0), 0) || 1)) * 100).toFixed(1)}%`, 280, doc.y + 45)
           .text(`• Maior transação: R$ ${((planoExpenses.length? Math.max(...planoExpenses.map(e => parseFloat(e.amount||0))) : 0)).toFixed(2)}`, 280, doc.y + 60);
        
        doc.y += 95;
    });
}
// 📊 PÁGINA 4: GRÁFICOS MODERNOS
async function createModernChartsPage(doc, data) {
    const { expenses = [], porPlano = {}, porConta = {} } = data;
    
    // Cabeçalho
    doc.rect(0, 0, doc.page.width, 80).fill('#059669');
    doc.fontSize(24).fillColor('#FFFFFF').text('📊 VISUALIZAÇÕES AVANÇADAS', 0, 25, { align: 'center', width: doc.page.width });
    doc.fontSize(14).fillColor('#E5E7EB').text('Gráficos Inteligentes & Dashboards Visuais', 0, 50, { align: 'center', width: doc.page.width });
    
    doc.y = 100;
    
    // Gerar gráficos se ChartJS disponível
    if (ChartJSNodeCanvas) {
        try {
            const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
                width: 500, 
                height: 300, 
                backgroundColour: 'white'
            });
            const charts = await generateChartsForPDF(porPlano, porConta, expenses, chartJSNodeCanvas);
            
            // Inserir gráficos no PDF
            if (charts.planChart) {
                doc.fontSize(14).fillColor('#1F2937').text('📊 Distribuição por Plano de Conta', { underline: true });
                doc.image(charts.planChart, 50, doc.y + 20, { width: 500, height: 300 });
                doc.y += 340;
            }
            
            if (doc.y > 600) {
                doc.addPage();
                doc.y = 50;
            }
            
            if (charts.accountChart) {
                doc.fontSize(14).fillColor('#1F2937').text('🏆 Top Categorias de Gastos', { underline: true });
                doc.image(charts.accountChart, 50, doc.y + 20, { width: 500, height: 300 });
                doc.y += 340;
            }
            if (doc.y > 600) { doc.addPage(); doc.y = 50; }

            if (charts.comparisonChart) {
                doc.fontSize(14).fillColor('#1F2937').text('🍩 Pessoal vs Empresarial', { underline: true });
                doc.image(charts.comparisonChart, 50, doc.y + 20, { width: 400, height: 300 });
                doc.y += 340;
            }
            if (doc.y > 600) { doc.addPage(); doc.y = 50; }

            if (charts.evolutionChart) {
                doc.fontSize(14).fillColor('#1F2937').text('📈 Evolução diária de gastos', { underline: true });
                doc.image(charts.evolutionChart, 50, doc.y + 20, { width: 500, height: 300 });
                doc.y += 340;
            }
            if (doc.y > 600) { doc.addPage(); doc.y = 50; }

            if (charts.weeklyChart) {
                doc.fontSize(14).fillColor('#1F2937').text('📅 Comparativo semanal', { underline: true });
                doc.image(charts.weeklyChart, 50, doc.y + 20, { width: 500, height: 300 });
                doc.y += 340;
            }
            
        } catch (chartError) {
            console.error('Erro ao inserir gráficos no PDF:', chartError);
            doc.fontSize(12).fillColor('#DC2626').text('⚠️ Gráficos não disponíveis no momento', 50, doc.y);
        }
    } else {
        doc.fontSize(12).fillColor('#6B7280').text('📊 Gráficos não disponíveis (ChartJS não carregado)', 50, doc.y);
    }
}

// 🧾 Página estilo extrato bancário (inspirado no anexo)
async function createStatementStylePage(doc, data) {
    const { expenses = [], contaNome, startDate, endDate, themeCfg } = data;
    try {
        // Header sólido com a cor principal do tema
        const headerColor = (themeCfg && themeCfg.headerSolid) || '#8A05BE';
        doc.rect(0, 0, doc.page.width, 70).fill(headerColor);
        doc.fillColor('#FFFFFF').fontSize(18).text('Extrato do Período', 40, 20);
        const periodText = `${new Date(startDate).toLocaleDateString('pt-BR')} a ${new Date(endDate).toLocaleDateString('pt-BR')}`;
        doc.fontSize(12).fillColor('#F3E8FF').text(`${contaNome} • ${periodText}`, 40, 45);

        // Tabela
        const startY = 90;
        const colX = [40, 120, 320, 430, 520]; // Data, Descrição, Conta, Tipo, Valor
        doc.fillColor('#111827').fontSize(11).text('Data', colX[0], startY);
        doc.text('Descrição', colX[1], startY);
        doc.text('Conta', colX[2], startY);
        doc.text('Tipo', colX[3], startY);
        doc.text('Valor (R$)', colX[4], startY);
        doc.moveTo(40, startY + 14).lineTo(doc.page.width - 40, startY + 14).stroke('#E5E7EB');

        // Linhas com zebra - paginação completa
        let y = startY + 20;
        const rows = expenses.slice().sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
        rows.forEach((e, idx) => {
            if (y > doc.page.height - 60) {
                doc.addPage();
                // re-render header row on new page
                const headerY = 40;
                doc.fillColor('#111827').fontSize(11).text('Data', colX[0], headerY);
                doc.text('Descrição', colX[1], headerY);
                doc.text('Conta', colX[2], headerY);
                doc.text('Tipo', colX[3], headerY);
                doc.text('Valor (R$)', colX[4], headerY);
                doc.moveTo(40, headerY + 14).lineTo(doc.page.width - 40, headerY + 14).stroke('#E5E7EB');
                y = headerY + 20;
            }
            const bg = idx % 2 === 0 ? (themeCfg?.zebra1 || '#FAF5FF') : (themeCfg?.zebra2 || '#FFFFFF');
            doc.rect(40, y - 4, doc.page.width - 80, 18).fill(bg);
            doc.fillColor('#111827').fontSize(10);
            doc.text(new Date(e.transaction_date).toLocaleDateString('pt-BR'), colX[0], y);
            const descricao = (e.description || '').slice(0, 48);
            doc.text(descricao, colX[1], y, { width: colX[2] - colX[1] - 10 });
            doc.text(e.account || '-', colX[2], y, { width: colX[3] - colX[2] - 10 });
            doc.text(e.is_business_expense ? 'Empresarial' : 'Pessoal', colX[3], y);
            const valStr = (parseFloat(e.amount || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            doc.text(valStr, colX[4], y, { width: 60, align: 'right' });
            y += 20;
        });
    } catch (err) {
        console.warn('⚠️ Erro ao gerar página estilo extrato:', err.message);
    }
}

// 📋 Página de listagem detalhada de gastos por plano
async function createExpenseDetailPage(doc, data) {
    const { expenses = [], porPlano = {}, total = 0, year, month, themeCfg } = data;
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    try {
        // Header
        const headerColor = (themeCfg && themeCfg.headerSolid) || '#0F172A';
        doc.rect(0, 0, doc.page.width, 70).fill(headerColor);
        doc.fillColor('#FFFFFF').fontSize(20).text('📋 Detalhamento de Gastos por Plano', 40, 22);
        doc.fontSize(12).fillColor('#E5E7EB').text(`${monthNames[month-1]} ${year}`, 40, 48);
        
        doc.y = 90;
        
        // Resumo geral
        doc.fillColor('#0B1220').fontSize(14).text('Resumo Geral:', 40, doc.y);
        doc.moveDown(0.5);
        doc.fontSize(12)
           .text(`• Total de gastos: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
           .text(`• Total de transações: ${expenses.length}`)
           .text(`• Ticket médio: R$ ${(total / Math.max(1, expenses.length)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        
        doc.moveDown(1);
        
        // Agrupar gastos por plano e ordenar
        const plansWithExpenses = Object.entries(porPlano)
            .filter(([_, value]) => value > 0)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10); // Top 10 planos com gastos
        
        plansWithExpenses.forEach(([planCode, planTotal], planIdx) => {
            if (doc.y > doc.page.height - 100) {
                doc.addPage();
                doc.y = 40;
            }
            
            // Header do plano
            doc.roundedRect(40, doc.y, doc.page.width - 80, 40, 8).fill('#F1F5F9');
            doc.fillColor('#0F172A').fontSize(13)
               .text(`Plano ${planCode}`, 50, doc.y + 10)
               .text(`R$ ${planTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 0, doc.y + 10, { width: doc.page.width - 90, align: 'right' });
            
            const planExpenses = expenses.filter(e => String(e.account_plan_code || '') === String(planCode));
            doc.fontSize(11).text(`${planExpenses.length} transações • ${((planTotal/total)*100).toFixed(1)}% do total`, 50, doc.y + 25);
            
            doc.y += 50;
            
            // Listagem das transações deste plano (limitado a 8 por plano)
            const topTransactions = planExpenses
                .sort((a, b) => parseFloat(b.amount || 0) - parseFloat(a.amount || 0))
                .slice(0, 8);
            
            topTransactions.forEach((expense, expIdx) => {
                if (doc.y > doc.page.height - 30) {
                    doc.addPage();
                    doc.y = 40;
                }
                
                const bg = expIdx % 2 === 0 ? '#FAFAFA' : '#FFFFFF';
                doc.rect(50, doc.y - 2, doc.page.width - 100, 20).fill(bg);
                
                doc.fillColor('#374151').fontSize(10);
                const dateStr = new Date(expense.transaction_date).toLocaleDateString('pt-BR');
                const description = (expense.description || '').slice(0, 40);
                const amount = parseFloat(expense.amount || 0);
                
                doc.text(dateStr, 55, doc.y);
                doc.text(description, 140, doc.y, { width: 280 });
                doc.text(`R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 0, doc.y, { width: doc.page.width - 95, align: 'right' });
                
                doc.y += 22;
            });
            
            if (planExpenses.length > 8) {
                doc.fillColor('#6B7280').fontSize(9)
                   .text(`... e mais ${planExpenses.length - 8} transações`, 55, doc.y);
                doc.y += 15;
            }
            
            doc.y += 10;
        });
        
    } catch (err) {
        console.warn('⚠️ Erro ao gerar página de detalhes:', err.message);
    }
}

// New: Budget Control Page (Plan ceilings vs spent) for decision support
async function createBudgetControlPage(doc, data) {
    try {
        const { porPlano = {}, year, month } = data;
        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const { computeBudgetControlFromDistribution, tetos } = require('./config/budgets');
        const control = computeBudgetControlFromDistribution(porPlano);
        // desenha na página atual (a página já foi adicionada pelo chamador)
        // Header
        doc.rect(0, 0, doc.page.width, 70).fill('#0F172A');
        doc.fillColor('#FFFFFF').fontSize(22).text('📏 Controle de Tetos por Plano', 40, 22);
        doc.fontSize(12).fillColor('#E5E7EB').text(`${monthNames[month-1]} ${year}`, 40, 48);

        doc.moveDown(1);
    doc.fillColor('#0B1220').fontSize(13).text('Resumo de status:', 40, 90);
    const s = control.summary || {};
    doc.fontSize(12)
           .text(`• Acima do teto: ${s.overBudget || 0}`)
           .text(`• Em risco (≥90%): ${s.atRisk || 0}`)
           .text(`• Dentro do orçamento: ${s.withinBudget || 0}`)
           .text(`• Sem teto definido: ${s.zeroCeiling || 0}`);

        // Table header
        doc.moveDown(1);
    const tableTop = doc.y + 10;
    const colX = [40, 140, 280, 400, 510];
        doc.fontSize(12).fillColor('#111827');
    const colW = [colX[1]-colX[0]-10, colX[2]-colX[1]-10, colX[3]-colX[2]-10, colX[4]-colX[3]-10, doc.page.width-40-colX[4]];
    doc.text('Plano', colX[0], tableTop, { width: colW[0] });
    doc.text('Gasto (R$)', colX[1], tableTop, { width: colW[1], align: 'right' });
    doc.text('Teto (R$)', colX[2], tableTop, { width: colW[2], align: 'right' });
    doc.text('% do Teto', colX[3], tableTop, { width: colW[3], align: 'right' });
    doc.text('Status', colX[4], tableTop, { width: colW[4] });
        doc.moveTo(40, tableTop + 14).lineTo(doc.page.width - 40, tableTop + 14).stroke('#E5E7EB');

        // Rows - show ALL plans 1-47 with utilization
        const budgetConfig = require('./config/budgets');
        const allPlans = [];
        
        // Create entries for ALL plans 1-47
        for (let planId = 1; planId <= 47; planId++) {
            const planData = (control.perPlan || {})[planId];
            const ceiling = budgetConfig.tetos[planId] || 0;
            const spent = planData ? planData.spent : 0;
            const percent = ceiling > 0 ? (spent / ceiling * 100) : 0;
            
            let status = 'OK';
            if (percent >= 100) status = 'OVER_BUDGET';
            else if (percent >= 90) status = 'AT_RISK';
            else if (percent >= 70) status = 'WATCH';
            
            allPlans.push({
                plan: planId,
                spent: spent,
                ceiling: ceiling,
                percent: percent,
                status: status
            });
        }
        
        const rows = allPlans; // All 47 plans
        const rowsPerPage = 16;
        const totalPages = Math.ceil(rows.length / rowsPerPage);
        
        let y = tableTop + 20;
        
        for (let page = 0; page < totalPages; page++) {
            const startIdx = page * rowsPerPage;
            const pageRows = rows.slice(startIdx, startIdx + rowsPerPage);
            
            if (page > 0) {
                doc.addPage({ margin: 40, size: 'A4' });
                // Header for continuation pages
                doc.rect(0, 0, doc.page.width, 50).fill('#0F172A');
                doc.fillColor('#FFFFFF').fontSize(18).text('📏 Controle de Tetos por Plano (cont.)', 40, 15);
                doc.fontSize(10).fillColor('#E5E7EB').text(`Página ${page + 1} de ${totalPages}`, 40, 35);
                
                // Redraw table header
                const headerY = 70;
                doc.fontSize(12).fillColor('#111827');
                doc.text('Plano', colX[0], headerY, { width: colW[0] });
                doc.text('Gasto (R$)', colX[1], headerY, { width: colW[1], align: 'right' });
                doc.text('Teto (R$)', colX[2], headerY, { width: colW[2], align: 'right' });
                doc.text('% do Teto', colX[3], headerY, { width: colW[3], align: 'right' });
                doc.text('Status', colX[4], headerY, { width: colW[4] });
                doc.moveTo(40, headerY + 14).lineTo(doc.page.width - 40, headerY + 14).stroke('#E5E7EB');
                y = headerY + 20;
            }
            
            pageRows.forEach((row, idx) => {
                const bg = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
                doc.rect(40, y - 6, doc.page.width - 80, 30).fill(bg);
                // Barra de progresso primeiro (para não cobrir textos)
                const barX = colX[1];
                const barW = (colX[4] - 10) - barX; // até antes da coluna Status
                const usedPct = Math.max(0, Math.min(150, row.percent || 0));
                const fillW = (barW * usedPct) / 100;
                doc.rect(barX, y + 14, barW, 6).fill('#E5E7EB');
                const fillColor = (row.status === 'OVER_BUDGET') ? '#DC2626' : (row.status || '').startsWith('AT_RISK') ? '#D97706' : '#10B981';
                doc.rect(barX, y + 14, Math.max(2, fillW), 6).fill(fillColor);
                doc.fillColor('#0B1220').fontSize(9).text(`${usedPct.toFixed(1)}%`, barX + Math.min(fillW + 6, barW - 30), y + 12, { width: 40 });

                // Textos sobre a área da linha
                doc.fillColor('#0B1220').fontSize(11);
                doc.text(String(row.plan), colX[0], y, { width: colW[0] });
                doc.text((row.spent || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), colX[1], y, { width: colW[1], align: 'right' });
                doc.text((row.ceiling || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), colX[2], y, { width: colW[2], align: 'right' });
                doc.text(`${(row.percent || 0).toFixed(1)}%`, colX[3], y, { width: colW[3], align: 'right' });
                let color = '#065F46', status = row.status || 'OK';
                if (status === 'OVER_BUDGET') color = '#B91C1C';
                else if (status.startsWith('AT_RISK')) color = '#92400E';
                else if (status.startsWith('WATCH')) color = '#2563EB';
                doc.fillColor(color).text(status.replace('_', ' '), colX[4], y, { width: colW[4] });
                y += 34;
            });
        }

        // Insights / Recommendations (after all pages)
        doc.moveDown(1);
        const insights = control.insights || {};
        if (insights.topRisks && insights.topRisks.length) {
            doc.fillColor('#111827').fontSize(12).text('Recomendações de ação prioritária:', 40, y + 10);
            insights.topRisks.forEach((r, i) => {
                doc.fontSize(10).fillColor('#111827')
                   .text(`• Plano ${r.plan}: ${(r.percent || 0).toFixed(1)}% do teto — ${r.recommendation || 'Revisar gastos.'}`);
            });
        }

        // Legend
        doc.moveDown(1);
        doc.fontSize(10).fillColor('#374151').text('Legenda: OVER_BUDGET >100% • AT_RISK ≥90% • WATCH 70–89% • OK <70%');
        
        // Add detailed expense listing with improved styling
        doc.addPage({ margin: 40, size: 'A4' });
        
        // Header for expense listing
        doc.rect(0, 0, doc.page.width, 60).fill('#1E293B');
        doc.fillColor('#FFFFFF').fontSize(20).text('� DETALHAMENTO POR PLANO DE CONTA', 40, 15);
        doc.fontSize(12).fillColor('#CBD5E1').text(`Análise detalhada dos gastos - ${monthNames[month - 1]} ${year}`, 40, 40);
        
        let currentY = 80;
        
        // Group expenses by plan
        const expensesByPlan = {};
        if (Array.isArray(expenses)) {
            expenses.forEach(expense => {
                const planId = expense.plano_conta || 'Sem Plano';
                if (!expensesByPlan[planId]) {
                    expensesByPlan[planId] = {
                        expenses: [],
                        total: 0
                    };
                }
                expensesByPlan[planId].expenses.push(expense);
                expensesByPlan[planId].total += parseFloat(expense.valor || 0);
            });
        }
        
        // Sort plans and display
        const sortedPlans = Object.keys(expensesByPlan).sort((a, b) => {
            const numA = parseInt(a) || 999;
            const numB = parseInt(b) || 999;
            return numA - numB;
        });
        
        for (const planId of sortedPlans) {
            const planData = expensesByPlan[planId];
            
            // Check if we need a new page
            if (currentY > doc.page.height - 120) {
                doc.addPage({ margin: 40, size: 'A4' });
                // Mini header for continuation
                doc.rect(40, 20, doc.page.width - 80, 35).fill('#F8FAFC');
                doc.fillColor('#1E293B').fontSize(14).text('📋 Detalhamento (continuação)', 50, 32);
                currentY = 70;
            }
            
            // Plan header with modern styling
            const headerHeight = 40;
            const gradient = doc.linearGradient(40, currentY, doc.page.width - 40, currentY + headerHeight);
            gradient.stop(0, '#3B82F6').stop(1, '#1E40AF');
            doc.rect(40, currentY, doc.page.width - 80, headerHeight).fill(gradient);
            
            // Plan info in header
            doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
               .text(`📊 PLANO ${planId}`, 50, currentY + 8);
            doc.fontSize(12).font('Helvetica')
               .text(`Total: R$ ${planData.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 50, currentY + 25);
            
            // Expense count
            doc.text(`${planData.expenses.length} ${planData.expenses.length === 1 ? 'lançamento' : 'lançamentos'}`, 
                     doc.page.width - 180, currentY + 25, { width: 120, align: 'right' });
            
            currentY += headerHeight + 10;
            
            // Expense items with alternating background
            planData.expenses.forEach((expense, idx) => {
                if (currentY > doc.page.height - 80) {
                    doc.addPage({ margin: 40, size: 'A4' });
                    // Mini header for continuation
                    doc.rect(40, 20, doc.page.width - 80, 35).fill('#F8FAFC');
                    doc.fillColor('#1E293B').fontSize(14).text(`📋 Plano ${planId} (continuação)`, 50, 32);
                    currentY = 70;
                }
                
                const itemHeight = 25;
                const bg = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
                
                // Background for item
                doc.rect(50, currentY - 3, doc.page.width - 100, itemHeight).fill(bg);
                
                // Expense details with better formatting
                doc.fillColor('#1F2937').fontSize(11).font('Helvetica-Bold')
                   .text(`${expense.descricao || 'Sem descrição'}`, 60, currentY + 2, { width: 300 });
                
                // Value with emphasis
                const valor = parseFloat(expense.valor || 0);
                doc.fillColor('#DC2626').fontSize(12).font('Helvetica-Bold')
                   .text(`R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
                         doc.page.width - 150, currentY + 2, { width: 100, align: 'right' });
                
                // Date with better formatting
                if (expense.data_gasto) {
                    const dataFormatada = new Date(expense.data_gasto).toLocaleDateString('pt-BR');
                    doc.fillColor('#6B7280').fontSize(9).font('Helvetica')
                       .text(`📅 ${dataFormatada}`, 60, currentY + 14);
                }
                
                // Type indicator
                const tipo = expense.tipo || 'N/A';
                const tipoColor = tipo.toLowerCase().includes('empresarial') ? '#3B82F6' : '#EF4444';
                doc.fillColor(tipoColor).fontSize(9)
                   .text(`🏷️ ${tipo}`, doc.page.width - 280, currentY + 14, { width: 120 });
                
                currentY += itemHeight + 2;
            });
            
            // Summary box for the plan
            const summaryHeight = 30;
            doc.rect(50, currentY + 5, doc.page.width - 100, summaryHeight).fill('#E0F2FE');
            doc.fillColor('#0C4A6E').fontSize(11).font('Helvetica-Bold')
               .text(`💰 Subtotal do Plano ${planId}: R$ ${planData.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
                     60, currentY + 15);
            
            currentY += summaryHeight + 20; // Space between plans
        }
        
        // Summary totals at the end
        if (currentY > doc.page.height - 80) {
            doc.addPage({ margin: 40, size: 'A4' });
            currentY = 40;
        }
        
        doc.rect(40, currentY, doc.page.width - 80, 40).fill('#E2E8F0');
        doc.fillColor('#1E293B').fontSize(14).font('Helvetica-Bold')
           .text('TOTAIS GERAIS', 45, currentY + 5);
        doc.fontSize(12)
           .text(`Total Geral: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 45, currentY + 22);
    } catch (err) {
        console.warn('⚠️ Erro ao gerar página de tetos:', err.message);
    }
}

// 🧠 GERADOR DE INSIGHTS INTELIGENTES
function generateIntelligentInsights(expenses, total, totalPessoal, totalEmpresarial, year, month) {
    const insights = [];
    
    // Insight 1: Análise de proporção
    const proporcaoPessoal = totalPessoal / total * 100;
    if (proporcaoPessoal > 70) {
        insights.push({
            icon: '🏠',
            title: 'Foco nos Gastos Pessoais',
            description: `${proporcaoPessoal.toFixed(1)}% dos gastos são pessoais. Considere revisar despesas pessoais para otimização.`
        });
    } else if (proporcaoPessoal < 30) {
        insights.push({
            icon: '💼',
            title: 'Predominância Empresarial',
            description: `${(100 - proporcaoPessoal).toFixed(1)}% dos gastos são empresariais. Boa gestão de custos pessoais.`
        });
    }
    
    // Insight 2: Análise de transações
    const mediaTransacao = total / expenses.length;
    if (mediaTransacao > 500) {
        insights.push({
            icon: '💰',
            title: 'Transações de Alto Valor',
            description: `Média de R$ ${mediaTransacao.toFixed(2)} por transação. Transações de grande valor dominam o período.`
        });
    } else if (mediaTransacao < 50) {
        insights.push({
            icon: '🪙',
            title: 'Micro Transações Frequentes',
            description: `Média baixa de R$ ${mediaTransacao.toFixed(2)} por transação. Muitas pequenas despesas do dia a dia.`
        });
    }
    
    // Insight 3: Análise temporal
    const diasComGastos = [...new Set(expenses.map(e => new Date(e.transaction_date).getDate()))].length;
    const diasNoMes = new Date(year, month, 0).getDate();
    const frequenciaGastos = diasComGastos / diasNoMes * 100;
    
    if (frequenciaGastos > 80) {
        insights.push({
            icon: '📅',
            title: 'Gastos Distribuídos',
            description: `Gastos em ${diasComGastos} de ${diasNoMes} dias (${frequenciaGastos.toFixed(1)}%). Boa distribuição temporal.`
        });
    } else if (frequenciaGastos < 40) {
        insights.push({
            icon: '⚡',
            title: 'Gastos Concentrados',
            description: `Gastos concentrados em ${diasComGastos} dias. Pode indicar padrão sazonal ou pontual.`
        });
    }
    
    return insights;
}

// 🚨 GERADOR DE ALERTAS INTELIGENTES
function generateSmartAlerts(expenses, total, totalPessoal, totalEmpresarial, year, month) {
    const alerts = [];
    
    // Alerta 1: Concentração de gastos
    const maiorGasto = Math.max(...expenses.map(e => parseFloat(e.amount)));
    if (maiorGasto / total > 0.3) {
        alerts.push({
            level: 'atencao',
            icon: '⚠️',
            message: 'Concentração de Gastos Detectada',
            recommendation: `Uma única transação representa ${(maiorGasto/total*100).toFixed(1)}% do total. Verifique se é um gasto recorrente ou pontual.`
        });
    }
    
    // Alerta 2: Desequilíbrio pessoal vs empresarial
    const proporcaoPessoal = totalPessoal / total * 100;
    if (proporcaoPessoal > 85) {
        alerts.push({
            level: 'atencao',
            icon: '🏠',
            message: 'Gastos Pessoais Dominantes',
            recommendation: 'Gastos pessoais representam mais de 85% do total. Considere revisar estratégias de economia pessoal.'
        });
    }
    
    // Alerta 3: Volume de transações
    const diasNoMes = new Date(year, month, 0).getDate();
    const transacoesPorDia = expenses.length / diasNoMes;
    if (transacoesPorDia > 10) {
        alerts.push({
            level: 'info',
            icon: '📊',
            message: 'Alto Volume de Transações',
            recommendation: `Média de ${transacoesPorDia.toFixed(1)} transações por dia. Considere consolidar pequenas despesas.`
        });
    }
    
    return alerts;
}

// 📈 ANÁLISE TEMPORAL
function analyzeTemporalPatterns(expenses = [], year, month) {
    const weekly = [
        { total: 0, count: 0 },
        { total: 0, count: 0 },
        { total: 0, count: 0 },
        { total: 0, count: 0 },
        { total: 0, count: 0 }
    ];
    
    (expenses || []).forEach(expense => {
        const day = new Date(expense.transaction_date).getDate();
        const weekIndex = Math.min(Math.floor((day - 1) / 7), 4);
        
        weekly[weekIndex].total += parseFloat(expense.amount);
        weekly[weekIndex].count++;
    });
    
    return { weekly };
}

// ⚖️ ANÁLISE COMPARATIVA
function generateComparativeAnalysis(expenses = [], total = 0, totalPessoal = 0, totalEmpresarial = 0) {
    const analysis = [];
    
    // Comparação de volumes
    if (totalPessoal > totalEmpresarial) {
        const diferenca = totalPessoal - totalEmpresarial;
        analysis.push({
            icon: '🏠',
            title: 'Gastos Pessoais Superiores',
            description: `Gastos pessoais excedem empresariais em R$ ${diferenca.toFixed(2)}. Representam ${(totalPessoal/total*100).toFixed(1)}% do total.`
        });
    } else {
        const diferenca = totalEmpresarial - totalPessoal;
        analysis.push({
            icon: '💼',
            title: 'Gastos Empresariais Superiores',
            description: `Gastos empresariais excedem pessoais em R$ ${diferenca.toFixed(2)}. Representam ${(totalEmpresarial/total*100).toFixed(1)}% do total.`
        });
    }
    
    // Análise de frequência
    const pessoaisCount = (expenses || []).filter(e => !e.is_business_expense).length;
    const empresariaisCount = (expenses || []).filter(e => e.is_business_expense).length;
    
    const mediaPessoal = totalPessoal / pessoaisCount || 0;
    const mediaEmpresarial = totalEmpresarial / empresariaisCount || 0;
    
    if (mediaPessoal > mediaEmpresarial) {
        analysis.push({
            icon: '📊',
            title: 'Transações Pessoais Maiores',
            description: `Média pessoal: R$ ${mediaPessoal.toFixed(2)} vs empresarial: R$ ${mediaEmpresarial.toFixed(2)}. Gastos pessoais são mais concentrados.`
        });
    } else {
        analysis.push({
            icon: '📈',
            title: 'Transações Empresariais Maiores',
            description: `Média empresarial: R$ ${mediaEmpresarial.toFixed(2)} vs pessoal: R$ ${mediaPessoal.toFixed(2)}. Gastos empresariais são mais significativos.`
        });
    }
    
    return analysis;
}

// Função auxiliar para gerar PDF simplificado em caso de erro
async function generateFallbackPDF(expenses, total, startDate, endDate, contaNome) {
    console.log(`🆘 [FALLBACK] Gerando PDF simplificado...`);
    
    try {
        const doc = new pdfkit();
        
        // Fonte mais simples
        try {
            doc.font('Helvetica');
        } catch {
            doc.font('Times-Roman');
        }
        
        // Cabeçalho simples
        doc.fontSize(20).text('RELATÓRIO FINANCEIRO MENSAL', { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Período: ${(startDate || new Date()).toLocaleDateString('pt-BR')} a ${(endDate || new Date()).toLocaleDateString('pt-BR')}`, { align: 'center' });
        doc.text(`Conta: ${contaNome}`, { align: 'center' });
        doc.moveDown(2);
        
        // Total principal
        doc.fontSize(18).text(`TOTAL GERAL: R$ ${total.toFixed(2)}`, { align: 'center' });
        doc.moveDown(2);
        
        // Lista simples de despesas (máximo 20)
        doc.fontSize(12).text('RESUMO DAS DESPESAS:', { underline: true });
        doc.moveDown();
        
        const displayExpenses = expenses.slice(0, 20);
        displayExpenses.forEach((expense, index) => {
            const date = new Date(expense.transaction_date).toLocaleDateString('pt-BR');
            const amount = parseFloat(expense.amount || 0).toFixed(2);
            const description = (expense.description || 'Sem descrição').substring(0, 40);
            
            doc.text(`${index + 1}. ${date} - R$ ${amount} - ${description}`);
        });
        
        if (expenses.length > 20) {
            doc.moveDown();
            doc.text(`... e mais ${expenses.length - 20} despesas.`);
        }
        
        // Rodapé
        doc.moveDown(2);
        doc.fontSize(10).text('Relatório gerado em modo simplificado devido a limitações técnicas.', { align: 'center' });
        
        return doc;
    } catch (simplePdfError) {
        console.error(`❌ [ERRO] Falha até no PDF simplificado:`, simplePdfError);
        throw new Error(`Erro crítico na geração de PDF: ${simplePdfError.message}`);
    }
}

app.post('/api/reports/monthly', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { year, month, account, theme } = req.body;

    console.log(`🎯 [INÍCIO] Relatório mensal - User: ${userId}, Ano: ${year}, Mês: ${month}, Conta: ${account || 'Todas'}`);

    if (!year || !month) {
        console.log(`❌ [ERRO] Parâmetros inválidos - Ano: ${year}, Mês: ${month}`);
        return res.status(400).json({ message: 'Ano e mês são obrigatórios.' });
    }

    // Declarar variáveis que podem ser usadas no fallback (escopo da função)
    let expenses = [];
    let total = 0;
    let totalEmpresarial = 0;
    let totalPessoal = 0;
    let startDate, endDate;
    let contaNome = account || 'Todas as Contas';
    let empresariais = [];
    let pessoais = [];
    let pessoaisFiltrados = [];

    try {
        console.log(`📊 [STEP 1] Iniciando processamento de dados...`);

        // Determina período vigente se por conta
        console.log(`📅 [STEP 2] Calculando período...`);
        
        if (account && billingPeriods[account]) {
            console.log(`📊 [STEP 2.1] Usando período personalizado para conta: ${account}`);
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
            console.log(`📊 [STEP 2.2] Usando período padrão mensal`);
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 0);
        }

        console.log(`📅 [STEP 2.3] Período calculado: ${startDate.toISOString().slice(0,10)} até ${endDate.toISOString().slice(0,10)}`);

        // Busca despesas do período - incluindo PIX e Boleto
        console.log(`🔍 [STEP 3] Consultando banco de dados...`);
        let sql = `SELECT * FROM expenses WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?`;
        let params = [userId, startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10)];
        
        // Se conta específica foi solicitada, filtrar por ela
        if (account && account !== 'ALL') {
            sql += ' AND account = ?';
            params.push(account);
            console.log(`🏦 [STEP 3.1] Filtrando por conta: ${account}`);
        }
        
        sql += ' ORDER BY transaction_date';
        console.log(`📊 [STEP 3.2] Executando SQL: ${sql}`);
        console.log(`📊 [STEP 3.3] Parâmetros: ${JSON.stringify(params)}`);
        
        try {
            expenses = (await pool.query(sql, params))[0];
            console.log(`✅ [STEP 3.4] Consulta executada com sucesso`);
        } catch (dbError) {
            console.error(`❌ [ERRO] Falha na consulta ao banco:`, dbError);
            throw new Error(`Erro ao consultar despesas: ${dbError.message}`);
        }

        // Garantir que expenses seja um array válido
        if (!expenses || !Array.isArray(expenses)) {
            console.log(`⚠️ [STEP 3.5] Expenses não é um array válido, inicializando array vazio`);
            expenses = [];
        }

        console.log(`📊 [STEP 4] Encontradas ${expenses.length} despesas para o período`);

        if (expenses.length === 0) {
            console.log(`📄 [STEP 5] Gerando PDF vazio (sem despesas)...`);
            
            try {
                // Criar PDF simples para período sem gastos
                const doc = new pdfkit();
                
                // Tentar registrar fonte com fallback robusto para Railway
                try {
                    const fontPath = path.join(__dirname, 'fonts', 'NotoSans-Regular.ttf');
                    if (fs.existsSync(fontPath)) {
                        doc.registerFont('NotoSans', fontPath);
                        doc.font('NotoSans');
                        console.log('✅ [STEP 5.1] Fonte NotoSans carregada para PDF vazio');
                    } else {
                        console.log('⚠️ [STEP 5.1] Fonte NotoSans não encontrada no Railway para PDF vazio, usando Helvetica');
                        doc.font('Helvetica');
                    }
                } catch (fontError) {
                console.warn('⚠️ Erro ao carregar fonte para PDF vazio:', fontError.message);
                try {
                    doc.font('Helvetica');
                } catch (fallbackError) {
                    console.warn('⚠️ Erro com Helvetica para PDF vazio, usando Times-Roman');
                    doc.font('Times-Roman');
                }
            }

            // Capa colorida para período sem gastos
            doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F0FDF4');
            doc.fillColor('#059669').fontSize(48).text('🎉', 250, 200);
            doc.moveDown(2);
            doc.fontSize(24).fillColor('#065F46').text('Parabéns!', { align: 'center' });
            doc.moveDown(1);
            doc.fontSize(16).fillColor('#047857').text('Nenhum gasto registrado neste período', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(14).fillColor('#059669').text(`Período: ${(startDate || new Date()).toLocaleDateString('pt-BR')} a ${(endDate || new Date()).toLocaleDateString('pt-BR')}`, { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(12).fillColor('#065F46').text(`Conta: ${contaNome}`, { align: 'center' });
            
            console.log(`✅ [STEP 5.2] PDF vazio criado com sucesso`);
            
            doc.end();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio-vazio-${year}-${month}.pdf`);
            doc.pipe(res);
            return;
            
            } catch (emptyPdfError) {
                console.error(`❌ [ERRO] Falha ao gerar PDF vazio:`, emptyPdfError);
                throw new Error(`Erro ao gerar PDF vazio: ${emptyPdfError.message}`);
            }
        }

        console.log(`📊 [STEP 6] Iniciando análise dos dados...`);
        
        try {
            // Análise dos dados
            // Classificação mais robusta: prioridade flags explícitas
            console.log(`📊 [STEP 6.1] Classificando despesas empresariais/pessoais...`);
            empresariais = expenses.filter(e => e.is_business_expense === 1 || e.is_business_expense === true);
            pessoais = expenses.filter(e => e.is_business_expense === 0 || e.is_business_expense === false || e.is_business_expense === null);
            // Evitar sobreposição duplicada caso flags inconsistentes
            const empresarialIds = new Set(empresariais.map(e=>e.id));
            pessoaisFiltrados = pessoais.filter(e => !empresarialIds.has(e.id));
            
            console.log(`📊 [STEP 6.2] Calculando totais - Empresariais: ${empresariais.length}, Pessoais: ${pessoaisFiltrados.length}`);
                
            total = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            totalEmpresarial = empresariais.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            totalPessoal = pessoaisFiltrados.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

            console.log(`💰 [STEP 6.3] Totais calculados - Total: R$ ${total.toFixed(2)}, Empresarial: R$ ${totalEmpresarial.toFixed(2)}, Pessoal: R$ ${totalPessoal.toFixed(2)}`);
        } catch (dataProcessError) {
            console.error(`❌ [ERRO] Falha no processamento dos dados:`, dataProcessError);
            throw new Error(`Erro ao processar dados das despesas: ${dataProcessError.message}`);
        }

        // ===== Dados do mês anterior para comparativo =====
    // Agrupamentos para gráficos (definir antes de usar comparativos)
    const porPlano = {};
        const porConta = {};
        const porDia = {};
        
        expenses.forEach(e => {
            const plano = e.account_plan_code || 'Sem Plano';
            const conta = e.account || 'Sem Conta';
            const dia = new Date(e.transaction_date).getDate();
            
            porPlano[plano] = (porPlano[plano] || 0) + parseFloat(e.amount || 0);
            porConta[conta] = (porConta[conta] || 0) + parseFloat(e.amount || 0);
            porDia[dia] = (porDia[dia] || 0) + parseFloat(e.amount || 0);
        });

        console.log(`📊 [STEP 7] Preparando dados comparativos...`);

        // Após popular porPlano podemos calcular comparativo mês anterior
        try {
            const prevMonth = month === 1 ? 12 : month - 1;
            const prevYear = month === 1 ? year - 1 : year;
            const prevStart = new Date(prevYear, prevMonth - 1, 1);
            const prevEnd = new Date(prevYear, prevMonth, 0);
            let prevSql = `SELECT id, amount, account_plan_code, is_business_expense, transaction_date FROM expenses WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?`;
            
            console.log(`📊 [STEP 7.1] Consultando dados do mês anterior...`);
            const [prevExpenses] = await pool.query(prevSql, [userId, prevStart.toISOString().slice(0,10), prevEnd.toISOString().slice(0,10)]);
            const prevByPlan = {};
            prevExpenses.forEach(e => { const plano = e.account_plan_code || 'Sem Plano'; prevByPlan[plano] = (prevByPlan[plano] || 0) + parseFloat(e.amount || 0); });
            const currByPlan = {}; Object.entries(porPlano).forEach(([p,v])=> currByPlan[p]=v);
            
            console.log(`📊 [STEP 7.2] Dados comparativos processados`);
        } catch (prevDataError) {
            console.error(`⚠️ [AVISO] Erro ao buscar dados do mês anterior:`, prevDataError);
            // Continuar sem comparativo
        }

        console.log(`📊 [STEP 8] Identificando maiores e menores gastos...`);
        
        // Maior gasto e menor gasto
        const maiores = expenses.sort((a, b) => parseFloat(b.amount || 0) - parseFloat(a.amount || 0));
        const maiorGasto = maiores[0];
        const menorGasto = maiores[maiores.length - 1];

        // 🎨 GERAR GRÁFICOS (se ChartJS disponível)
        let chartImages = {};
        if (ChartJSNodeCanvas) {
            try {
                console.log('📊 Gerando gráficos para o PDF...');
                const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
                    width: 800, 
                    height: 500, 
                    backgroundColour: 'white'
                });
                chartImages = await generateChartsForPDF(porPlano, porConta, expenses, chartJSNodeCanvas);
                console.log('✅ Gráficos gerados com sucesso!');
            } catch (chartError) {
                console.error('❌ Erro ao gerar gráficos:', chartError);
                console.error('Stack trace gráficos:', chartError.stack);
                // Continuar sem gráficos se falhar
                chartImages = {};
            }
        } else {
            console.log('⚠️ Gráficos desabilitados - ChartJS não disponível no Railway');
        }

        // 📊 AGRUPAR DESPESAS POR PLANO DE CONTAS PARA MELHOR ORGANIZAÇÃO
        console.log('📊 Agrupando despesas por plano de contas...');
        const expensesByPlan = {};
        console.log(`📊 [STEP 10] Agrupando despesas por plano de contas...`);
        
        expenses.forEach(expense => {
            const planCode = expense.account_plan_code || 'Sem Plano';
            if (!expensesByPlan[planCode]) {
                expensesByPlan[planCode] = {
                    planCode,
                    total: 0,
                    count: 0,
                    expenses: []
                };
            }
            expensesByPlan[planCode].total += parseFloat(expense.amount || 0);
            expensesByPlan[planCode].count++;
            expensesByPlan[planCode].expenses.push(expense);
        });

        // Ordenar planos por valor total (maior para menor)
        const sortedPlanGroups = Object.values(expensesByPlan)
            .sort((a, b) => b.total - a.total);

        console.log(`📋 [STEP 10.1] Despesas agrupadas em ${sortedPlanGroups.length} planos de contas`);

        console.log(`🧠 [STEP 11] Iniciando geração do relatório BI inteligente...`);
        
        try {
            // Gerar relatório BI completo usando a nova função (objeto de dados)
            // Compute budget control for the PDF
            let budgetControl = null;
            try {
                const { computeBudgetControlFromDistribution, tetos } = require('./config/budgets');
                budgetControl = {
                    ceilings: tetos,
                    ...computeBudgetControlFromDistribution(porPlano)
                };
            } catch (e) {
                console.warn('⚠️ Erro ao calcular budgetControl para PDF:', e.message);
            }

            const biReport = await generateIntelligentBIReport({
                expenses,
                total,
                totalPessoal,
                totalEmpresarial,
                startDate,
                endDate,
                contaNome,
                year,
                month,
                porPlano,
                porConta,
                theme: theme || 'modern',
                budgetControl,
                userId
            });
            
            console.log(`✅ [STEP 11] Relatório BI inteligente gerado com sucesso!`);
            
            // Configurar headers de resposta
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio-bi-inteligente-${year}-${month}${account ? '-' + account : ''}.pdf`);
            
            // Enviar o documento BI
            biReport.pipe(res);
            // Finaliza o documento e encerra a execução desta rota
            try { biReport.end(); } catch(_) {}
            return;
            
            console.log(`🎉 [SUCESSO] Relatório BI inteligente enviado com sucesso! 
            📊 Dados processados: ${expenses.length} despesas totalizando R$ ${total.toFixed(2)}
            🧠 Sistema BI: Análise inteligente com insights automatizados
            📄 Dashboard: 4 páginas executivas com visualizações avançadas
            ⏱️ Processamento concluído`);

        } catch (biError) {
            console.error(`❌ [ERRO] Falha na geração do relatório BI:`, biError);
            throw new Error(`Erro ao gerar relatório BI inteligente: ${biError.message}`);
        }
    // Código legado abaixo não deve executar quando usamos o relatório BI acima
    // Mantido apenas como referência; retornamos antes.
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
    doc.roundedRect(50, cardY, 150, 100, 10).fill('#E5F3FF');
    doc.fillColor('#0F172A').fontSize(12).text('TOTAL GERAL', 60, cardY + 15, { width: 130, align: 'left' });
    doc.fontSize(16).text(`R$ ${total.toFixed(2)}`, 60, cardY + 35, { width: 130, align: 'left' });
    doc.fontSize(10).fillColor('#334155').text(`${expenses.length} transações`, 60, cardY + 65, { width: 130, align: 'left' });

        // Card Pessoal
    doc.roundedRect(220, cardY, 150, 100, 10).fill('#E6FFFA');
    doc.fillColor('#0F172A').fontSize(12).text('PESSOAL 🏠', 230, cardY + 15, { width: 130, align: 'left' });
    doc.fontSize(16).text(`R$ ${totalPessoal.toFixed(2)}`, 230, cardY + 35, { width: 130, align: 'left' });
    doc.fontSize(10).fillColor('#334155').text(`${pessoais.length || 0} transações`, 230, cardY + 65, { width: 130, align: 'left' });

        // Card Empresarial
    doc.roundedRect(390, cardY, 150, 100, 10).fill('#FFF7ED');
    doc.fillColor('#0F172A').fontSize(12).text('EMPRESARIAL 💼', 400, cardY + 15, { width: 130, align: 'left' });
    doc.fontSize(16).text(`R$ ${totalEmpresarial.toFixed(2)}`, 400, cardY + 35, { width: 130, align: 'left' });
    doc.fontSize(10).fillColor('#334155').text(`${empresariais.length || 0} transações`, 400, cardY + 65, { width: 130, align: 'left' });

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
        if (chartImages && chartImages.planChart) {
            console.log('🎨 Adicionando gráfico de distribuição por plano...');
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
        if (chartImages && chartImages.accountChart) {
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
        if (chartImages && chartImages.comparisonChart) {
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
        if (chartImages && chartImages.evolutionChart) {
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
            // Página 1: Gráfico de distribuição por planos (se imagem já gerada disponível)
            if (chartImages && chartImages.planChart) {
                doc.image(chartImages.planChart, 60, 270, { width: 480 });
            }
            // Página 2: Lista completa por planos com paginação otimizada
            doc.addPage();
            doc.rect(0,0,doc.page.width,80).fill('#0F172A');
            doc.fillColor('#FFFFFF').fontSize(22).text('📊 Distribuição por Planos (Empresarial)',0,30,{width:doc.page.width,align:'center'});
            
            const byPlanoEmp = {}; 
            empresariais.forEach(e=>{
                const p = e.account_plan_code || 'N/A'; 
                if (!byPlanoEmp[p]) {
                    byPlanoEmp[p] = {
                        planCode: p,
                        total: 0,
                        count: 0,
                        expenses: []
                    };
                }
                byPlanoEmp[p].total += parseFloat(e.amount);
                byPlanoEmp[p].count++;
                byPlanoEmp[p].expenses.push(e);
            });
            
            const planosOrdenadosEmp = Object.values(byPlanoEmp).sort((a,b)=>b.total-a.total);
            let tableY = 110; // inicia abaixo do header
            
            // Paginação inteligente para planos empresariais
            const maxItemsPerPage = 12; // Máximo de planos por página
            const minItemsPerPage = 4;  // Mínimo para evitar páginas quase vazias
            let itemsOnCurrentPage = 0;
            
            // Ajuste dinâmico de densidade baseado no número total de planos
            let headerH = 16; 
            let rowH = 13; 
            let fontRow = 8; 
            let barHeight = 6; 
            let barWidth = 140;
            
            if (planosOrdenadosEmp.length > 15) {
                // Compactar mais para muitos planos
                rowH = 11; 
                fontRow = 7; 
                barHeight = 5; 
                barWidth = 120;
            }
            
            const drawHeader = (y) => {
                doc.fontSize(fontRow);
                doc.roundedRect(50,y,490,headerH,4).fill('#CBD5E1');
                doc.fillColor('#0F172A');
                doc.text('Plano',58,y+4,{width:70});
                doc.text('R$',128,y+4,{width:38,align:'right'});
                doc.text('%Tot',166,y+4,{width:32,align:'right'});
                doc.text('Teto',198,y+4,{width:50,align:'right'});
                doc.text('%Teto',248,y+4,{width:42,align:'right'});
                doc.text('Uso',290,y+4,{width:110});
                doc.text('Status',400,y+4,{width:50});
                doc.text('Share',450,y+4,{width:80});
                return y + headerH + 2;
            };
            
            tableY = drawHeader(tableY);
            
            planosOrdenadosEmp.forEach((planGroup, i) => {
                const availableHeight = doc.page.height - 100 - tableY;
                
                // Se não cabe na página atual E já temos itens suficientes, nova página
                if ((tableY + rowH > doc.page.height - 100) && itemsOnCurrentPage >= minItemsPerPage) {
                    doc.addPage();
                    tableY = 60;
                    tableY = drawHeader(tableY);
                    itemsOnCurrentPage = 0;
                }
                
                // Se mesmo após nova página não cabe, compactar ou finalizar
                if (tableY + rowH > doc.page.height - 100) {
                    doc.fillColor('#64748B').fontSize(fontRow).text(`...${planosOrdenadosEmp.length - i} planos restantes ocultos por limite de espaço...`,50,tableY+2,{width:490,align:'center'});
                    return;
                }
                
                const val = planGroup.total;
                const pctTotal = (val/totalEmpresarial)*100;
                const id = parseInt(planGroup.planCode); 
                const teto = tetos[id] || 0; 
                const pctTeto = teto > 0 ? (val/teto)*100 : 0;
                
                const bg = i % 2 === 0 ? '#FFFFFF':'#F1F5F9';
                doc.roundedRect(50,tableY,490,rowH-1,2).fill(bg);
                doc.fillColor('#1E293B').fontSize(fontRow);
                
                const labelPlano = planGroup.planCode.toString().length > 10 ? 
                    planGroup.planCode.toString().slice(0,9)+'…' : planGroup.planCode;
                
                doc.text(labelPlano,58,tableY+rowH/3-1,{width:70});
                doc.text(val.toFixed(0),128,tableY+rowH/3-1,{width:38,align:'right'});
                doc.text(pctTotal.toFixed(1),166,tableY+rowH/3-1,{width:32,align:'right'});
                doc.text(teto>0?teto.toFixed(0):'-',198,tableY+rowH/3-1,{width:50,align:'right'});
                doc.text(teto>0?Math.min((val/teto)*100,999).toFixed(0):'-',248,tableY+rowH/3-1,{width:42,align:'right'});
                
                // Barra de uso
                const barX=290; 
                const barY=tableY+ (rowH-barHeight)/2; 
                const pctClamped=Math.min(100,(val/(tetos[id]||val))*100);
                doc.roundedRect(barX,barY,barWidth,barHeight,barHeight/2).fill('#E2E8F0');
                doc.roundedRect(barX,barY,(pctClamped/100)*barWidth,barHeight,barHeight/2).fill(pctClamped>100?'#DC2626':pctClamped>85?'#F59E0B':'#10B981');
                
                // Status
                let statusEmoji='✅';
                if(pctTeto>100) statusEmoji='🔥'; 
                else if(pctTeto>85) statusEmoji='⚠️';
                doc.text(statusEmoji,400,tableY+rowH/3-1,{width:50});
                
                // Share
                doc.text(pctTotal.toFixed(1)+'%',450,tableY+rowH/3-1,{width:80});
                
                tableY += rowH;
                itemsOnCurrentPage++;
            });
            
            // Mini BI (resumo de concentração) se couber
            if (tableY < doc.page.height - 80) {
                const hhi = planosOrdenadosEmp.reduce((acc, planGroup) => {
                    const s = planGroup.total / totalEmpresarial; 
                    return acc + s * s;
                }, 0);
                const maiorShare = planosOrdenadosEmp.length ? (planosOrdenadosEmp[0].total / totalEmpresarial) * 100 : 0;
                
                doc.fontSize(8).fillColor('#1E293B').text(`Concentração (HHI): ${(hhi*10000).toFixed(0)}`,50,tableY+6,{width:160});
                doc.text(`Maior Plano: ${maiorShare.toFixed(1)}%`,210,tableY+6,{width:150});
                
                const acima85 = planosOrdenadosEmp.filter(planGroup => {
                    const id = parseInt(planGroup.planCode); 
                    const teto = tetos[id] || 0; 
                    return teto > 0 && (planGroup.total / teto) * 100 >= 85;
                }).length;
                
                doc.text(`Planos >=85% do teto: ${acima85}`,370,tableY+6,{width:170});
            }
            // Tabela detalhada
            let detY = tableY + 30;
            if (detY > doc.page.height - 160) { doc.addPage(); detY = 80; }
            doc.fontSize(13).fillColor('#1E293B').text('📄 Detalhamento (Empresarial)', 50, detY); detY += 20;
            // Tabela empresarial ultra compacta
            let rowHDet=12; let fontDet=7; const header = (y) => { doc.roundedRect(50, y, 490, 14, 3).fill('#0D9488'); doc.fillColor('#FFFFFF').fontSize(7).text('Data',56,y+3,{width:40}); doc.text('Pl',96,y+3,{width:20}); doc.text('Ct',116,y+3,{width:26}); doc.text('Desc',142,y+3,{width:240}); doc.text('R$',382,y+3,{width:50,align:'right'}); doc.text('NF',432,y+3,{width:30}); };
            header(detY); detY += 16;
            const descLimit = 42;
            empresariais.sort((a,b)=> new Date(b.transaction_date)-new Date(a.transaction_date)).forEach(e=> {
                if (detY + rowHDet > doc.page.height - 55) { doc.addPage(); detY = 55; header(detY); detY += 16; }
                const bg = (Math.floor(detY/rowHDet)%2===0)?'#FFFFFF':'#F1F5F9';
                doc.roundedRect(50, detY, 490, rowHDet-1, 2).fill(bg);
                doc.fillColor('#1E293B').fontSize(fontDet);
                doc.text(new Date(e.transaction_date).toLocaleDateString('pt-BR'),56,detY+3,{width:40});
                doc.text(e.account_plan_code||'-',96,detY+3,{width:20});
                const conta=(e.account||'-').slice(0,6);
                doc.text(conta,116,detY+3,{width:26});
                const desc=(e.description||'').replace(/\s+/g,' ').slice(0,descLimit);
                doc.text(desc,142,detY+3,{width:240});
                doc.text(parseFloat(e.amount).toFixed(2),382,detY+3,{width:50,align:'right'});
                doc.text(e.has_invoice?'✔':'',432,detY+3,{width:30});
                detY += rowHDet;
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
            // Garante que o ponteiro lógico de escrita avance além do bloco recém desenhado.
            // Sem isso, doc.y ainda refletia posição anterior, permitindo que a próxima seção
            // com header fixo em y=0 fosse desenhada sobre conteúdo existente.
            doc.y = rowY + 60;
        }

        // 🏦 PÁGINA POR CONTAS (LISTA RESUMIDA)
    // (Removida página antiga de resumo por contas para evitar página solta redundante)

    // 📋 PÁGINA DE DESPESAS AGRUPADAS POR PLANO DE CONTAS (OTIMIZADA)
    doc.addPage();
    doc.rect(0,0,doc.page.width,78).fill('#0F766E');
    doc.fillColor('#FFFFFF').fontSize(24).text('📋 DESPESAS POR PLANO DE CONTAS',0,26,{width:doc.page.width,align:'center'});
    doc.fontSize(12).fillColor('#E0F2FE').text(`${sortedPlanGroups.length} planos • ${expenses.length} transações`,0,55,{width:doc.page.width,align:'center'});
    
    let currentY = 110;
    const pageBottomLimit = doc.page.height - 80;
    const minItemsPerPage = 3; // Mínimo de itens por página para evitar páginas quase vazias
    const planHeaderHeight = 45;
    const itemHeight = 18;
    
    // Função para verificar se um grupo de plano cabe na página atual
    const planFitsOnPage = (planGroup, startY) => {
        const requiredHeight = planHeaderHeight + (planGroup.count * itemHeight) + 20; // +20 para margem
        return (startY + requiredHeight) <= pageBottomLimit;
    };
    
    // Função para verificar se vale a pena começar um novo plano na página atual
    const shouldStartPlanOnNewPage = (planGroup, currentY) => {
        const availableSpace = pageBottomLimit - currentY;
        const planTotalHeight = planHeaderHeight + (planGroup.count * itemHeight);
        
        // Se o plano não cabe completo E temos pouco espaço, vai para nova página
        if (planTotalHeight > availableSpace && availableSpace < (planHeaderHeight + (minItemsPerPage * itemHeight))) {
            return true;
        }
        return false;
    };
    
    sortedPlanGroups.forEach((planGroup, planIndex) => {
        // Verificar se devemos começar este plano em uma nova página
        if (shouldStartPlanOnNewPage(planGroup, currentY) || currentY === 110 && planIndex > 0) {
            doc.addPage();
            currentY = 60;
        }
        
        // Cabeçalho do plano
        const planBgColor = ['#1E40AF', '#059669', '#DC2626', '#7C3AED', '#EA580C'][planIndex % 5];
        doc.roundedRect(50, currentY, 490, planHeaderHeight, 8).fill(planBgColor);
        doc.fillColor('#FFFFFF').fontSize(16).text(`📊 PLANO ${planGroup.planCode}`, 70, currentY + 8);
        doc.fontSize(20).text(`R$ ${planGroup.total.toFixed(2)}`, 300, currentY + 5, {width: 180, align: 'right'});
        doc.fontSize(11).text(`${planGroup.count} transação${planGroup.count !== 1 ? 's' : ''}`, 70, currentY + 28);
        
        // Percentual do total
        const percentage = ((planGroup.total / total) * 100).toFixed(1);
        doc.fontSize(11).text(`${percentage}% do total`, 300, currentY + 28, {width: 180, align: 'right'});
        
        currentY += planHeaderHeight + 5;
        
        // Listar despesas do plano (com paginação inteligente)
        const sortedExpenses = planGroup.expenses.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
        
        sortedExpenses.forEach((expense, expenseIndex) => {
            // Verificar se precisamos de nova página
            if (currentY + itemHeight > pageBottomLimit) {
                doc.addPage();
                currentY = 60;
                
                // Repetir cabeçalho do plano na nova página
                doc.roundedRect(50, currentY, 490, 35, 8).fill('#F3F4F6');
                doc.fillColor('#374151').fontSize(14).text(`📊 PLANO ${planGroup.planCode} (cont.)`, 70, currentY + 10);
                currentY += 40;
            }
            
            // Linha da despesa
            const rowBg = expenseIndex % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
            doc.roundedRect(70, currentY, 450, itemHeight, 3).fill(rowBg);
            
            doc.fillColor('#1F2937').fontSize(9);
            const expenseDate = new Date(expense.transaction_date).toLocaleDateString('pt-BR');
            const expenseDesc = (expense.description || '').substring(0, 50) + (expense.description && expense.description.length > 50 ? '...' : '');
            
            doc.text(expenseDate, 80, currentY + 5, {width: 80});
            doc.text(expense.account || '-', 160, currentY + 5, {width: 100});
            doc.text(expenseDesc, 260, currentY + 5, {width: 200});
            doc.text(`R$ ${parseFloat(expense.amount).toFixed(2)}`, 460, currentY + 5, {width: 50, align: 'right'});
            
            currentY += itemHeight;
        });
        
        currentY += 15; // Espaço entre planos
    });
    
    // Resumo final se houver espaço
    if (currentY + 60 <= pageBottomLimit) {
        doc.roundedRect(50, currentY, 490, 45, 8).fill('#ECFDF5');
        doc.fillColor('#047857').fontSize(14).text('RESUMO GERAL', 70, currentY + 8);
        doc.fontSize(18).text(`R$ ${total.toFixed(2)}`, 300, currentY + 5, {width: 180, align: 'right'});
        doc.fontSize(10).text(`${expenses.length} transações em ${sortedPlanGroups.length} planos`, 70, currentY + 28);
    }

        // 📊 BI PESSOAL (resumo similar ao empresarial)
    // BI Pessoal: só quebra se faltar espaço
    // ===== BI GASTOS PESSOAIS (sem sobreposição) =====
    // Seção seguinte também sempre em nova página para impedir sobreposição visual.
    doc.addPage();
    doc.rect(0,0,doc.page.width,78).fill('#1E3A8A');
    doc.fillColor('#FFFFFF').fontSize(24).text('🏠 BI GASTOS PESSOAIS',0,26,{width:doc.page.width,align:'center'});
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
    // Distribuição completa planos pessoais (compacta 1 página)
    let tY=190; doc.fontSize(13).fillColor('#1E293B').text('📊 Distribuição por Planos (Pessoal)',50,tY); tY+=16;
        const planosOrdenadosPes = Object.entries(byPlanoPes).sort((a,b)=>b[1]-a[1]);
        const maxHeightPes = doc.page.height - 150; let headerHP=14; let rowHP=11; let fontRowP=7; let barHP=5; let barWP=110;
        if(tY + headerHP + planosOrdenadosPes.length*rowHP > maxHeightPes){ rowHP=9; fontRowP=6; barHP=4; barWP=90; }
        if(tY + headerHP + planosOrdenadosPes.length*rowHP > maxHeightPes){ rowHP=8; fontRowP=5.5; barHP=4; barWP=80; }
        doc.fontSize(fontRowP);
        doc.roundedRect(50,tY,490,headerHP,4).fill('#BFDBFE');
        doc.fillColor('#0F172A');
        doc.text('Plano',58,tY+4,{width:80});
        doc.text('R$',138,tY+4,{width:42,align:'right'});
        doc.text('%Tot',180,tY+4,{width:38,align:'right'});
        doc.text('Uso',218,tY+4,{width:150});
        doc.text('Status',368,tY+4,{width:60});
        doc.text('Share',428,tY+4,{width:90});
        tY+=headerHP+2;
        planosOrdenadosPes.forEach(([pl,val],i)=>{
            if(tY+rowHP>maxHeightPes){doc.fillColor('#64748B').fontSize(fontRowP).text('...compressão máxima atingida, alguns planos ocultos...',50,tY+2,{width:490,align:'center'}); tY=maxHeightPes+5; return;}
            const pct = (val/totalPessoal)*100;
            const bg = i%2===0?'#FFFFFF':'#F1F5F9';
            doc.roundedRect(50,tY,490,rowHP-1,2).fill(bg);
            doc.fillColor('#1E293B').fontSize(fontRowP);
            const label = pl.length>12?pl.slice(0,11)+'…':pl;
            doc.text(label,58,tY+rowHP/3-1,{width:80});
            doc.text(val.toFixed(0),138,tY+rowHP/3-1,{width:42,align:'right'});
            doc.text(pct.toFixed(1),180,tY+rowHP/3-1,{width:38,align:'right'});
            // Barra proporcional
            const barX=218; const barY=tY+(rowHP-barHP)/2; const pctClamped=Math.min(100,pct);
            doc.roundedRect(barX,barY,barWP,barHP,barHP/2).fill('#E2E8F0');
            doc.roundedRect(barX,barY,(pctClamped/100)*barWP,barHP,barHP/2).fill(pct>40?'#2563EB':pct>20?'#60A5FA':'#93C5FD');
            // Status relativo (sem teto): baseia-se no share
            let emoji='✅'; if(pct>40) emoji='🔥'; else if(pct>25) emoji='⚠️';
            doc.text(emoji,368,tY+rowHP/3-1,{width:60});
            doc.text(pct.toFixed(1)+'%',428,tY+rowHP/3-1,{width:90});
            tY+=rowHP;
        });
    let detYp=tY+22; if(detYp>doc.page.height-130){doc.addPage();detYp=55;} doc.fontSize(13).fillColor('#1E293B').text('📄 Detalhamento (Pessoal)',50,detYp);detYp+=18; doc.fontSize(7);
    const headerP=(y)=>{doc.roundedRect(50,y,490,13,3).fill('#2563EB');doc.fillColor('#FFFFFF').fontSize(6.5);textCell('Data',56,y+3,{width:42});textCell('Pl',98,y+3,{width:18});textCell('Ct',116,y+3,{width:26});textCell('Desc',142,y+3,{width:250});textCell('R$',392,y+3,{width:60,align:'right'});}; headerP(detYp); detYp+=15;
    let rowHeightP=10;
        pessoaisFiltrados.sort((a,b)=> new Date(b.transaction_date)-new Date(a.transaction_date)).forEach(e=>{
            if(detYp+rowHeightP>doc.page.height-50){doc.addPage();detYp=50;headerP(detYp);detYp+=15;}
            const bg = (Math.floor(detYp/rowHeightP)%2===0)?'#FFFFFF':'#F1F5F9';
            doc.roundedRect(50,detYp,490,rowHeightP-1,1).fill(bg);
            const baseY = detYp+2;
            const desc=(e.description||'').replace(/\s+/g,' ').slice(0,45);
            doc.fillColor('#1E293B').fontSize(6.5);
            textCell(new Date(e.transaction_date).toLocaleDateString('pt-BR'),56,baseY,{width:42});
            textCell(e.account_plan_code||'-',98,baseY,{width:18});
            const conta=(e.account||'-').slice(0,6);
            textCell(conta,116,baseY,{width:26});
            textCell(desc,142,baseY,{width:250});
            textCell(parseFloat(e.amount).toFixed(2),392,baseY,{width:60,align:'right'});
            detYp+=rowHeightP;
        });
    if(detYp+28>doc.page.height){doc.addPage();detYp=55;}
    doc.fontSize(7).fillColor('#475569').text('Nota: tabela pessoal compactada (BRL).',50,detYp+4,{width:490});

    // ===== PÁGINA COMPARATIVO MÊS A MÊS POR PLANO =====
    if (doc.y > doc.page.height - 500) doc.addPage(); else doc.moveDown(2);
    doc.rect(0,0,doc.page.width,80).fill('#1E40AF');
    try { await drawEmoji(doc,'📊',50,20,30); } catch {}
    doc.fillColor('#FFFFFF').fontSize(24).text(' Comparativo Mês a Mês por Plano',85,25,{width:465,align:'left'});
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
    if (doc.y > doc.page.height - 480) doc.addPage(); else doc.moveDown(2);
    doc.rect(0,0,doc.page.width,85).fill('#0F766E');
    try { await drawEmoji(doc,'⚙️',(doc.page.width/2)-165,26,28); } catch {}
    doc.fillColor('#FFFFFF').fontSize(22).text(' Eficiência & Outliers (Empresarial)',0,30,{width:doc.page.width,align:'center'});
    // Eficiência cards
    const businessDaysInMonth = Array.from({length: endDate.getDate()},(_,i)=> new Date(year, month-1, i+1)).filter(d=> d.getDay()!=0 && d.getDay()!=6).length;
    const custoMedioDiaUtil = businessDaysInMonth? totalEmpresarial / businessDaysInMonth : totalEmpresarial;
    const ticketMedioEmp = empresariais.length ? totalEmpresarial / empresariais.length : 0;
    const baseY=110;
    const effCard=(x,t,v,c)=>{doc.roundedRect(x,baseY,170,70,10).fill(c);doc.fillColor('#FFFFFF').fontSize(11).text(t,x+12,baseY+12,{width:150});doc.fontSize(14).text(v,x+12,baseY+36,{width:150});};
    effCard(55,'Dias Úteis',businessDaysInMonth.toString(),'#0284C7');
    effCard(235,'Custo Médio Dia Útil',`R$ ${custoMedioDiaUtil.toFixed(2)}`,'#7C3AED');
    effCard(415,'Ticket Médio',`R$ ${ticketMedioEmp.toFixed(2)}`,'#F59E0B');
    // Outliers
    const empValores = empresariais.map(e=>parseFloat(e.amount));
    const mediaEmp = empValores.length ? empValores.reduce((a,b)=>a+b,0)/empValores.length : 0;
    const stdEmp = empValores.length ? Math.sqrt(empValores.reduce((s,v)=> s + Math.pow(v-mediaEmp,2),0)/empValores.length) : 0;
    const limiteOutlier = mediaEmp + stdEmp;
    const outliers = empresariais.filter(e=> parseFloat(e.amount) > limiteOutlier).sort((a,b)=> parseFloat(b.amount)-parseFloat(a.amount)).slice(0,5);
    let oy = baseY + 100; doc.fontSize(14).fillColor('#0F766E').roundedRect(50,oy-10,490,26,8).fill('#CCFBF1'); doc.fillColor('#134E4A').text('Outliers (> média + 1 desvio)',60,oy-2); oy+=28; doc.fontSize(9).fillColor('#1E293B');
    if(outliers.length===0){ doc.text('Nenhum outlier detectado.',60,oy); oy+=16; } else { outliers.forEach(o=>{ if(oy+14>doc.page.height-50){doc.addPage();oy=60;} doc.text(`${new Date(o.transaction_date).toLocaleDateString('pt-BR')} • Plano ${o.account_plan_code||'-'} • R$ ${parseFloat(o.amount).toFixed(2)} • ${o.account}`,60,oy,{width:470}); oy+=14;}); }
    doc.fontSize(8).fillColor('#475569').text(`Média R$ ${mediaEmp.toFixed(2)} | Desvio ${stdEmp.toFixed(2)} | Limite R$ ${limiteOutlier.toFixed(2)}`,60,oy+6,{width:470});

    // ===== PÁGINA PROJEÇÃO & CONCENTRAÇÃO =====
    // Força sempre nova página para evitar sobreposição quando a seção anterior (Outliers) cresce.
    doc.addPage();
    doc.rect(0,0,doc.page.width,90).fill('#6D28D9');
    // Título com emoji desenhado para garantir consistência cross-plataforma
    const titleText = ' Projeção & Concentração';
    try { await drawEmoji(doc,'🔮', (doc.page.width/2)-160, 22, 22); } catch {}
    doc.fillColor('#FFFFFF').fontSize(22).text(titleText,0,24,{width:doc.page.width,align:'center'});
    // Emojis: pdfkit usa fonte atual. A fonte NotoSans-Regular.ttf já cobre vários emojis básicos monocromáticos.
    // Para suporte mais amplo, poderia-se carregar NotoColorEmoji ou Twemoji convertida em fonte e registrar via doc.registerFont('emoji','caminho.ttf') e alternar doc.font('emoji') temporariamente.
    const daysInMonth = endDate.getDate();
    const diasComGasto = Object.keys(porDia).length;
    const mediaDiariaGeral = diasComGasto ? total / diasComGasto : total;
    const hoje = new Date();
    const isMesAtual = (hoje.getFullYear()===year && (hoje.getMonth()+1)===month);
    const projecao = isMesAtual ? (mediaDiariaGeral * daysInMonth) : total;
    const crescimentoProj = total ? ((projecao - total)/ total)*100 : 0;
    // Mini Cards compactos em uma única linha
    const projY=108; const miniCard=(x,w,t,v,c)=>{doc.roundedRect(x,projY,w,58,10).fill(c);doc.fillColor('#F1F5F9').fontSize(8).text(t,x+8,projY+8,{width:w-16});doc.fontSize(14).fillColor('#FFFFFF').text(v,x+8,projY+26,{width:w-16});};
    miniCard(55,150,'Média Diária',`R$ ${mediaDiariaGeral.toFixed(2)}`,'#7C3AED');
    miniCard(215,150,'Projeção Fim',`R$ ${projecao.toFixed(2)}`,'#9333EA');
    miniCard(375,165,'Crescimento',`${crescimentoProj>=0?'+':''}${crescimentoProj.toFixed(1)}%`,'#A855F7');
    if(!isMesAtual) doc.fontSize(7).fillColor('#DDD6FE').text('Mês encerrado: projeção = total realizado.',55,projY+64,{width:500});
    // Resumo de Tetos (Top 4 por % de utilização)
    const usoTetos = Object.entries(currByPlan).map(([pl,val])=>{ const id=parseInt(pl); const teto = tetos[id]||0; return {pl,val,teto,pct: teto>0?(val/teto)*100:0}; }).filter(o=>o.teto>0).sort((a,b)=> b.pct - a.pct).slice(0,4);
    let chipY = projY + 74; doc.fontSize(11).fillColor('#EDE9FE').text('Utilização de Tetos (Top)',55,chipY); chipY+=16; doc.fontSize(7.5);
    usoTetos.forEach((o,i)=>{ const chipW= (o.pct>100?210:200); const x=55 + i* (chipW+10); if(x+chipW>540) return; const cor = o.pct>100?'#DC2626':o.pct>85?'#F59E0B':'#10B981'; doc.roundedRect(x,chipY,chipW,30,8).fill('#1E1B4B'); doc.fillColor('#F8FAFC').fontSize(8).text(`Plano ${o.pl}`,x+10,chipY+6,{width:chipW-20}); doc.fontSize(10).fillColor(cor).text(`${Math.min(o.pct,999).toFixed(0)}%`,x+10,chipY+16,{width:chipW-20}); doc.roundedRect(x+chipW-70,chipY+16,60,8,4).fill('#334155'); const barW = Math.min(60,(o.pct/100)*60); doc.roundedRect(x+chipW-70,chipY+16,barW,8,4).fill(cor); });
    // Concentração (Top 5) ultracompacta lateral
    const topPlans = Object.entries(currByPlan).sort((a,b)=> b[1]-a[1]).slice(0,5); const totalAtualLocal = Object.values(currByPlan).reduce((a,b)=>a+b,0)||1; const shares = topPlans.map(([p,v])=>({p, s:v/totalAtualLocal})); const hhi = shares.reduce((s,o)=> s + o.s*o.s,0);
    let concY = chipY + 42; doc.fontSize(11).fillColor('#FDF4FF').text('Concentração Top 5',55,concY); doc.fontSize(8).fillColor('#E9D5FF').text(`HHI ${(hhi*10000).toFixed(0)}`,200,concY,{width:80}); concY+=14; doc.fontSize(7.5);
    shares.forEach(o=>{ const barMax=150; const barW=o.s*barMax; if(concY+10>doc.page.height-70) return; doc.roundedRect(55,concY,barMax,6,3).fill('#4C1D95'); doc.roundedRect(55,concY,barW,6,3).fill('#C084FC'); doc.fillColor('#FFFFFF').fontSize(7).text(`${o.p} ${(o.s*100).toFixed(1)}%`,60,concY-1); concY+=10; });
    doc.fontSize(6.5).fillColor('#DDD6FE').text('HHI <1500 baixa, 1500-2500 moderada, >2500 alta.',55,concY+4,{width:300});

        // 🎊 PÁGINA FINAL MOTIVACIONAL (centralizada revisada)
        doc.addPage();
        doc.rect(0,0,doc.page.width,doc.page.height).fill('#F0FDF4');
        const centerX = doc.page.width/2;
    try { await drawEmoji(doc,'🎉', centerX-45, 140, 90); } catch { doc.fillColor('#059669').fontSize(70).text('🎉', centerX-35, 150); }
        doc.fontSize(28).fillColor('#065F46').text('PARABÉNS!', 0, 230, { align: 'center' });
        doc.fontSize(15).fillColor('#047857').text('Você está no controle das suas finanças!', 0, 262, { align: 'center' });
        try {
            doc.fontSize(14).fillColor('#059669').text('Mantenha a consistência e alcance objetivos maiores!  ', 0, 300, { align: 'center' });
            await drawEmoji(doc,'🚀', centerX+200, 296, 24);
        } catch {
            doc.fontSize(14).fillColor('#059669').text('Mantenha a consistência e alcance objetivos maiores! 🚀', 0, 300, { align: 'center' });
        }
    try { await drawEmoji(doc,'💡', (centerX-90), 335, 18); } catch {}
    doc.fontSize(11).fillColor('#065F46').text('  Foco no próximo mês', 0, 338, { align: 'center', underline:true });
        const dicas = [
            {e:'🗓️',t:'Registre micro despesas diariamente'},
            {e:'📊',t:'Compare variação vs. mês anterior'},
            {e:'🎯',t:'Ataque o plano acima de 80% do teto'},
            {e:'💾',t:'Faça backup dos relatórios'},
            {e:'🔁',t:'Revise e negocie gastos recorrentes'}
        ];
        let dy = 380; doc.fontSize(10).fillColor('#047857');
        for(const item of dicas){
            try { await drawEmoji(doc,item.e, centerX-160, dy-4, 16); } catch { doc.text(item.e, 0, dy, {align:'center'}); }
            doc.text(item.t,0,dy,{align:'center'}); dy+=18;
        }
        doc.fontSize(10).fillColor('#6B7280').text('Relatório gerado com ❤️ • Sistema de Controle Financeiro', 0, dy+30, { align: 'center' });

        doc.end();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio-completo-graficos-${year}-${month}${account ? '-' + account : ''}.pdf`);
        doc.pipe(res);

    } catch (error) {
        console.error('❌ [ERRO PRINCIPAL] Erro ao gerar relatório mensal:', error);
        console.error('Stack trace completo:', error.stack);
        console.error('Detalhes do ambiente:', {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            memoryUsage: process.memoryUsage()
        });
        
        // TENTAR GERAR PDF SIMPLIFICADO COMO FALLBACK
        console.log('🆘 [FALLBACK] Tentando gerar relatório simplificado...');
        
        try {
            // Verificar se temos os dados mínimos necessários
            console.log(`🔍 [FALLBACK] Verificando dados disponíveis - expenses: ${expenses?.length || 0}, total: ${total}, startDate: ${startDate}, endDate: ${endDate}`);
            
            if (expenses && Array.isArray(expenses) && expenses.length > 0 && total !== undefined && startDate && endDate) {
                console.log('📊 [FALLBACK] Dados suficientes disponíveis, gerando PDF simplificado...');
                
                const simpleDoc = generateSimplePDF(expenses, total, startDate, endDate, contaNome, year, month);
                
                simpleDoc.end();
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=relatorio-simplificado-${year}-${month}${account ? '-' + account : ''}.pdf`);
                simpleDoc.pipe(res);
                
                console.log('✅ [FALLBACK] PDF simplificado gerado com sucesso!');
                return;
                
            } else if (startDate && endDate) {
                console.log('📄 [FALLBACK] Dados limitados, gerando PDF vazio...');
                
                // Gerar PDF vazio se não há despesas mas temos as datas
                const emptyDoc = new pdfkit();
                try { emptyDoc.font('Helvetica'); } catch { emptyDoc.font('Times-Roman'); }
                
                emptyDoc.fontSize(20).text('RELATÓRIO FINANCEIRO MENSAL', { align: 'center' });
                emptyDoc.moveDown();
                emptyDoc.fontSize(14).text(`Período: ${(startDate || new Date()).toLocaleDateString('pt-BR')} a ${(endDate || new Date()).toLocaleDateString('pt-BR')}`, { align: 'center' });
                emptyDoc.text(`Conta: ${contaNome}`, { align: 'center' });
                emptyDoc.moveDown(2);
                emptyDoc.fontSize(16).text('Nenhuma despesa encontrada para este período.', { align: 'center' });
                emptyDoc.moveDown();
                emptyDoc.fontSize(12).text('Relatório gerado em modo de recuperação.', { align: 'center' });
                
                emptyDoc.end();
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=relatorio-fallback-${year}-${month}.pdf`);
                emptyDoc.pipe(res);
                
                console.log('✅ [FALLBACK] PDF vazio gerado com sucesso!');
                return;
                
            } else {
                console.log('❌ [FALLBACK] Dados insuficientes para qualquer tipo de PDF');
            }
        } catch (fallbackError) {
            console.error('❌ [FALLBACK] Erro até no PDF simplificado:', fallbackError);
        }
        
        // Se chegou até aqui, responder com erro JSON
        const errorResponse = { 
            message: 'Erro ao gerar relatório mensal.', 
            details: error.message,
            errorType: error.name,
            timestamp: new Date().toISOString(),
            environment: 'Railway',
            fallbackAttempted: true
        };
        
        // Se o error tem mais informações específicas, incluir
        if (error.code) errorResponse.code = error.code;
        if (error.errno) errorResponse.errno = error.errno;
        if (error.syscall) errorResponse.syscall = error.syscall;
        
        res.status(500).json(errorResponse);
    }
});

// Rota de diagnóstico para verificar dependências do Railway
app.get('/api/health/pdf-dependencies', (req, res) => {
    const diagnostics = {
        timestamp: new Date().toISOString(),
        environment: 'Railway',
        dependencies: {}
    };

    // Verificar ChartJS
    try {
        diagnostics.dependencies.chartjs = {
            available: !!ChartJSNodeCanvas,
            version: ChartJSNodeCanvas ? 'loaded' : 'not available',
            canCreateInstance: false
        };
        
        if (ChartJSNodeCanvas) {
            const testCanvas = new ChartJSNodeCanvas({ width: 100, height: 100 });
            diagnostics.dependencies.chartjs.canCreateInstance = !!testCanvas;
        }
    } catch (error) {
        diagnostics.dependencies.chartjs = {
            available: false,
            error: error.message
        };
    }

    // Verificar PDFKit
    try {
        const testDoc = new pdfkit();
        diagnostics.dependencies.pdfkit = {
            available: true,
            canCreateDocument: !!testDoc
        };
    } catch (error) {
        diagnostics.dependencies.pdfkit = {
            available: false,
            error: error.message
        };
    }

    // Verificar Twemoji
    diagnostics.dependencies.twemoji = {
        available: !!twemoji,
        version: twemoji ? 'loaded' : 'not available'
    };

    // Verificar fontes
    const fontPath = path.join(__dirname, 'fonts', 'NotoSans-Regular.ttf');
    diagnostics.dependencies.fonts = {
        notoSansExists: fs.existsSync(fontPath),
        fontPath: fontPath
    };

    // Verificar memória
    diagnostics.system = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryUsage: process.memoryUsage()
    };

    res.json(diagnostics);
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

        // Verificar se é conta que permite gastos recorrentes (apenas conta unificada PIX/Boleto)
        if (account !== 'PIX/Boleto') {
            return res.status(400).json({ message: 'Gastos recorrentes só são permitidos para a conta unificada PIX/Boleto.' });
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
    // Garantir unificação retroativa de registros PIX/Boleto
    await ensurePixBoletoUnification();
        
        console.log(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
        console.log('✅ Sistema inicializado com sucesso!');
    } catch (error) {
        console.error('❌ ERRO CRÍTICO AO INICIALIZAR:', error.message);
        process.exit(1);
    }
});

// Função de unificação retroativa de contas PIX e Boleto para PIX/Boleto
async function ensurePixBoletoUnification() {
    try {
        // Case-insensitive cleanup para qualquer variação de PIX / Boleto
        const [expBefore] = await pool.query("SELECT \
            SUM(CASE WHEN UPPER(account)='PIX' THEN 1 ELSE 0 END) AS pix_cnt, \
            SUM(CASE WHEN UPPER(account)='BOLETO' THEN 1 ELSE 0 END) AS boleto_cnt \
            FROM expenses");
        const needUpdate = (expBefore[0]?.pix_cnt || 0) + (expBefore[0]?.boleto_cnt || 0) > 0;
        if (needUpdate) console.log(`🔄 Unificando contas antigas em expenses (PIX=${expBefore[0].pix_cnt}, Boleto=${expBefore[0].boleto_cnt})`);
        if (needUpdate) {
            await pool.query("UPDATE expenses SET account='PIX/Boleto' WHERE UPPER(account) IN ('PIX','BOLETO')");
        }
        const [legacyRec] = await pool.query("SHOW TABLES LIKE 'recurring_expenses'");
        if (legacyRec.length) {
            const [recBefore] = await pool.query("SELECT \
                SUM(CASE WHEN UPPER(account)='PIX' THEN 1 ELSE 0 END) AS pix_cnt, \
                SUM(CASE WHEN UPPER(account)='BOLETO' THEN 1 ELSE 0 END) AS boleto_cnt \
                FROM recurring_expenses");
            const needUpdateRec = (recBefore[0]?.pix_cnt || 0) + (recBefore[0]?.boleto_cnt || 0) > 0;
            if (needUpdateRec) console.log(`🔄 Unificando contas antigas em recurring_expenses (PIX=${recBefore[0].pix_cnt}, Boleto=${recBefore[0].boleto_cnt})`);
            if (needUpdateRec) {
                await pool.query("UPDATE recurring_expenses SET account='PIX/Boleto' WHERE UPPER(account) IN ('PIX','BOLETO')");
            }
        }
        if (needUpdate) {
            const [after] = await pool.query("SELECT COUNT(*) AS cnt FROM expenses WHERE account='PIX/Boleto'");
            console.log(`✅ Unificação concluída. Registros agora como PIX/Boleto: ${after[0].cnt}`);
        } else {
            console.log('✅ Nenhuma conta antiga PIX ou Boleto encontrada para unificação');
        }
    } catch (e) {
        console.error('❌ Erro na unificação de contas PIX/Boleto (ignorado na execução):', e.message);
    }
}

// Rota dedicada para obter gastos da conta unificada PIX/Boleto com resumo agregado
app.get('/api/expenses/pix-boleto', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.query;
        const filters = ['user_id = ?', "account = 'PIX/Boleto'"];
        const params = [userId];
        if (year) { filters.push('YEAR(transaction_date) = ?'); params.push(year); }
        if (month) { filters.push('MONTH(transaction_date) = ?'); params.push(month); }
        const where = filters.join(' AND ');
        const [rows] = await pool.query(`SELECT * FROM expenses WHERE ${where} ORDER BY transaction_date DESC`, params);
        const total = rows.reduce((s,r)=> s + parseFloat(r.amount),0);
        const count = rows.length;
        const ticket = count ? total / count : 0;
        const recur = rows.filter(r=> r.is_recurring_expense).reduce((s,r)=> s + parseFloat(r.amount),0);
        res.json({
            account: 'PIX/Boleto',
            year: year ? parseInt(year) : undefined,
            month: month ? parseInt(month) : undefined,
            total: parseFloat(total.toFixed(2)),
            count,
            ticket: parseFloat(ticket.toFixed(2)),
            recurring_total: parseFloat(recur.toFixed(2)),
            expenses: rows
        });
    } catch (e) {
        console.error('Erro ao buscar gastos PIX/Boleto:', e);
        res.status(500).json({ message: 'Erro ao buscar gastos PIX/Boleto.' });
    }
});

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
// Relatório Mensal (JSON detalhado, compatível com Railway)
app.get('/api/reports/monthly', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.user.id);
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const account = req.query.account || 'ALL';

        // Usa a engine de KPIs para compor um resumo mensal robusto sem dependências nativas
        const kpis = await computeMonthlyKPIs({ pool, userId, year, month, account });

        // Complementa com um pequeno resumo agregador para facilitar consumo no frontend
        const summary = {
            period: kpis.period,
            totals: kpis.totals,
            distribution: {
                byPlan: kpis.distrib?.porPlano || {},
                byAccount: kpis.distrib?.porConta || {},
                byDay: kpis.distrib?.porDia || {}
            },
            comparison: kpis.comparativo || [],
            efficiency: kpis.eficiencia || {},
            outliers: kpis.outliers || { top: [] },
            projection: kpis.projecao || {},
            concentration: kpis.concentracao || {},
            bi: kpis.businessIntelligence || {}
        };

        return res.json({
            source: 'monthly-summary',
            userId,
            account,
            ...summary
        });
    } catch (error) {
        console.error('Erro ao buscar relatório mensal (JSON):', error);
        res.status(500).json({ message: 'Erro ao buscar relatório mensal.', details: error.message });
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

// Endpoint para comparação trimestral (últimos 3 meses) e projeção simples próximos 3 meses
app.get('/api/business/quarterly-comparison', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Últimos 6 meses para base (3 passados + mês atual para tendência)
        const [rows] = await pool.query(`
            SELECT YEAR(transaction_date) AS year, MONTH(transaction_date) AS month, SUM(amount) AS total
            FROM expenses
            WHERE user_id = ? AND is_business_expense = 1
              AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY YEAR(transaction_date), MONTH(transaction_date)
            ORDER BY year, month
        `, [userId]);
        const ordered = rows.map(r=>({year:r.year, month:r.month, total: parseFloat(r.total)}));
        const last3 = ordered.slice(-3);
        const avg = last3.length ? last3.reduce((a,b)=>a+b.total,0)/last3.length : 0;
        // Parcelas futuras reaproveitando lógica de predictions
        const [installments] = await pool.query(`
            SELECT SUM(amount * (total_installments - COALESCE(installment_number,1))) AS future_total
            FROM expenses
            WHERE user_id=? AND is_business_expense=1 AND total_installments>1 AND COALESCE(installment_number,1) < total_installments
        `,[userId]);
        const futureInstallments = parseFloat(installments[0]?.future_total)||0;
        const projectionNext3 = Array.from({length:3},()=> Math.max(0, avg + (futureInstallments/3)));
        res.json({ last3, average:last3.length?avg:0, futureInstallments, projectionNext3 });
    } catch (e){
        console.error('Erro quarterly-comparison:', e);
        res.status(500).json({ message:'Erro ao calcular comparação trimestral.' });
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

// --- 12. GASTOS RECORRENTES PIX/BOLETO BI ---
app.get('/api/recurring-pix-boleto', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.query;
        const currentYear = year ? parseInt(year) : new Date().getFullYear();
        const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

        // 1. Buscar gastos recorrentes PIX/Boleto
        const [recurringExpenses] = await pool.query(`
            SELECT * FROM recurring_expenses 
            WHERE user_id = ? AND (account = 'PIX/Boleto' OR account = 'PIX' OR account = 'Boleto')
            AND is_active = 1
            ORDER BY day_of_month, description
        `, [userId]);

        // 2. Buscar histórico dos últimos 12 meses para cada recorrente
        const results = [];
        
        for (const recurring of recurringExpenses) {
            const history = [];
            
            // Buscar 12 meses de histórico
            for (let i = 11; i >= 0; i--) {
                const date = new Date(currentYear, currentMonth - 1 - i);
                const histYear = date.getFullYear();
                const histMonth = date.getMonth() + 1;
                
                const [monthlyExpenses] = await pool.query(`
                    SELECT * FROM expenses 
                    WHERE user_id = ? AND recurring_expense_id = ?
                    AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
                `, [userId, recurring.id, histYear, histMonth]);
                
                const monthData = {
                    year: histYear,
                    month: histMonth,
                    monthLabel: date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
                    planned: parseFloat(recurring.amount),
                    actual: monthlyExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0),
                    transactions: monthlyExpenses.length,
                    paid: monthlyExpenses.length > 0
                };
                
                monthData.variation = monthData.planned > 0 ? 
                    ((monthData.actual - monthData.planned) / monthData.planned * 100) : 0;
                monthData.status = monthData.paid ? 
                    (Math.abs(monthData.variation) <= 5 ? 'on-track' : 
                     monthData.variation > 5 ? 'over-budget' : 'under-budget') : 'pending';
                
                history.push(monthData);
            }
            
            // 3. Calcular estatísticas BI
            const paidMonths = history.filter(h => h.paid);
            const avgActual = paidMonths.length > 0 ? 
                paidMonths.reduce((sum, h) => sum + h.actual, 0) / paidMonths.length : 0;
            const avgVariation = paidMonths.length > 0 ?
                paidMonths.reduce((sum, h) => sum + h.variation, 0) / paidMonths.length : 0;
            
            const variations = paidMonths.map(h => h.variation);
            const stdDev = variations.length > 1 ? 
                Math.sqrt(variations.reduce((sum, v) => sum + Math.pow(v - avgVariation, 2), 0) / (variations.length - 1)) : 0;
            
            // Tendência (regressão linear simples)
            const trend = calculateTrend(paidMonths.map((h, i) => ({ x: i, y: h.actual })));
            
            results.push({
                id: recurring.id,
                description: recurring.description,
                account: recurring.account,
                category: recurring.category,
                dayOfMonth: recurring.day_of_month,
                plannedAmount: parseFloat(recurring.amount),
                isBusinessExpense: recurring.is_business_expense,
                
                // Estatísticas BI
                statistics: {
                    avgActual,
                    avgVariation,
                    stdDev,
                    reliability: Math.max(0, 100 - Math.abs(avgVariation) - stdDev),
                    trend: trend.slope,
                    trendDirection: trend.slope > 0.1 ? 'up' : trend.slope < -0.1 ? 'down' : 'stable',
                    paymentConsistency: (paidMonths.length / 12) * 100,
                    lastPayment: paidMonths.length > 0 ? paidMonths[paidMonths.length - 1] : null
                },
                
                // Histórico mensal
                history,
                
                // Projeções
                projections: {
                    nextMonth: avgActual,
                    next3Months: avgActual * 3,
                    yearEnd: avgActual * (12 - (currentMonth - 1)),
                    confidenceLevel: Math.min(100, Math.max(50, 100 - stdDev))
                }
            });
        }

        // 4. Resumo geral
        const summary = {
            totalRecurring: results.length,
            totalPlanned: results.reduce((sum, r) => sum + r.plannedAmount, 0),
            totalActualAvg: results.reduce((sum, r) => sum + r.statistics.avgActual, 0),
            avgReliability: results.length > 0 ? 
                results.reduce((sum, r) => sum + r.statistics.reliability, 0) / results.length : 0,
            
            categoryBreakdown: results.reduce((acc, r) => {
                const cat = r.category || 'Outros';
                if (!acc[cat]) acc[cat] = { count: 0, planned: 0, avgActual: 0 };
                acc[cat].count++;
                acc[cat].planned += r.plannedAmount;
                acc[cat].avgActual += r.statistics.avgActual;
                return acc;
            }, {}),
            
            trends: {
                increasing: results.filter(r => r.statistics.trendDirection === 'up').length,
                decreasing: results.filter(r => r.statistics.trendDirection === 'down').length,
                stable: results.filter(r => r.statistics.trendDirection === 'stable').length
            }
        };

        res.json({
            period: { year: currentYear, month: currentMonth },
            summary,
            expenses: results
        });

    } catch (error) {
        console.error('Erro ao buscar gastos recorrentes PIX/Boleto:', error);
        res.status(500).json({ message: 'Erro ao buscar gastos recorrentes PIX/Boleto.' });
    }
});

// Função auxiliar para calcular tendência
function calculateTrend(points) {
    if (points.length < 2) return { slope: 0, intercept: 0 };
    
    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return { slope: isNaN(slope) ? 0 : slope, intercept: isNaN(intercept) ? 0 : intercept };
}

// --- MIDDLEWARE DE TRATAMENTO DE ERROS ---
app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
});

// --- ROTA PARA ARQUIVOS ESTÁTICOS ---
// Nota: Arquivos de fatura agora são servidos através do endpoint autenticado /api/invoice/:id

module.exports = app;
