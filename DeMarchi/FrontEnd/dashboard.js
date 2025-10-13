/**
 * dashboard.js - Versão Final e Completa
 */
document.addEventListener('DOMContentLoaded', function() {

    // Define a URL base do backend no Railway
    const API_BASE_URL = 'https://backend-production-a867.up.railway.app';

    const RAILWAY_BACKEND_URL = 'https://backend-production-a867.up.railway.app';
    
    const FILE_BASE_URL = 'https://backend-production-a867.up.railway.app';

    // Variáveis globais para gerenciamento de gráficos
    const charts = {};
    let allExpensesCache = [];
    
    // ✅ Configuração global para exibir valores nos gráficos
    const CHART_CONFIG = {
        showValues: true,          // Exibir valores nos gráficos
        valueColor: '#1f2937',     // Cor dos valores
        valueFont: 'bold 11px Arial', // Fonte dos valores
        piValueColor: '#fff'       // Cor dos valores em gráficos de pizza
    };

    const loginSection = document.getElementById('login-section');
    const dashboardContent = document.getElementById('dashboard-content');
    const loginForm = document.getElementById('login-form');
    const logoutButton = document.getElementById('logout-button');
    const welcomeUserSpan = document.getElementById('welcome-user');
    const addExpenseForm = document.getElementById('add-expense-form');
    const businessCheckbox = document.getElementById('form-is-business');
    const personalFields = document.getElementById('personal-fields-container');
    const businessFields = document.getElementById('business-fields-container');
    const expensesTableBody = document.getElementById('expenses-table-body');
    const filterYear = document.getElementById('filter-year');
    const filterMonth = document.getElementById('filter-month');
    const filterSearchInput = document.getElementById('filter-search');
    const filterType = document.getElementById('filter-type');
    const filterMin = document.getElementById('filter-min');
    const filterMax = document.getElementById('filter-max');
    const filterPlan = document.getElementById('filter-plan');
    const totalSpentEl = document.getElementById('total-spent');
    const totalTransactionsEl = document.getElementById('total-transactions');
    const projectionEl = document.getElementById('next-month-projection');
    const monthlyReportBtn = document.getElementById('monthly-report-btn');
    const weeklyReportBtn = document.getElementById('weekly-report-btn');
    const reportModal = document.getElementById('report-modal');
    const reportForm = document.getElementById('report-form');
    const cancelReportBtn = document.getElementById('cancel-report-btn');
    const reportGenerateText = document.getElementById('report-generate-text');
    const reportLoadingText = document.getElementById('report-loading-text');

    // ========== RELATÓRIO INTERATIVO ==========
    const interactiveReportBtn = document.getElementById('interactive-report-btn');
    const interactiveReportModal = document.getElementById('interactive-report-modal');
    const closeIrModalBtn = document.getElementById('close-ir-modal');
    const irForm = document.getElementById('interactive-report-form');
    const irAccount = document.getElementById('ir-account');
    const irCharts = document.getElementById('ir-charts');
    const irDetails = document.getElementById('ir-details');

    // ========== GASTOS RECORRENTES ==========
    const recurringExpensesBtn = document.getElementById('recurring-expenses-btn');
    const recurringModal = document.getElementById('recurring-modal');
    const closeRecurringModalBtn = document.getElementById('close-recurring-modal');
    const recurringForm = document.getElementById('recurring-form');
    const recurringList = document.getElementById('recurring-list');
    const processRecurringBtn = document.getElementById('process-recurring-btn');

    // ========== TESTE DE GRÁFICO ==========
    const testTrendChartBtn = document.getElementById('test-trend-chart-btn');

    // ========== ANÁLISE POR PERÍODO DA FATURA ==========
    const periodAnalysisBtn = document.getElementById('period-analysis-btn');
    const periodAnalysisModal = document.getElementById('period-analysis-modal');
    const closePeriodAnalysisModalBtn = document.getElementById('close-period-analysis-modal');
    const periodAnalysisForm = document.getElementById('period-analysis-form');
    const periodExportPdfBtn = document.getElementById('period-export-pdf-btn');
    const periodTabBtns = document.querySelectorAll('.period-tab-btn');

    // ========== MODAL DE EDIÇÃO DE GASTOS ==========
    const editExpenseModal = document.getElementById('edit-expense-modal');
    const closeEditModalBtn = document.getElementById('close-edit-modal');
    const editExpenseForm = document.getElementById('edit-expense-form');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const editHasInvoiceCheckbox = document.getElementById('edit-has-invoice');
    const editInvoiceUpload = document.getElementById('edit-invoice-upload');
    
    // Charts para análise por período
    let periodCharts = {
        daily: null,
        accounts: null,
        categories: null
    };
    
    // Elementos para alertas de orçamento por plano de contas
    const budgetYear = document.getElementById('budget-year');
    const budgetMonth = document.getElementById('budget-month');
    const checkChartBudgetBtn = document.getElementById('check-chart-budget');
    const chartBudgetAlertsContainer = document.getElementById('chart-budget-alerts');
    const budgetSummary = document.getElementById('budget-summary');
    
    // Elementos para análise de plano de contas
    const chartAnalysisPeriod = document.getElementById('chart-analysis-period');
    const chartAnalysisType = document.getElementById('chart-analysis-type');
    const analyzeChartUsageBtn = document.getElementById('analyze-chart-usage');
    const chartUsageChart = document.getElementById('chart-usage-chart');
    const chartUsageInsights = document.getElementById('chart-usage-insights');
    const chartDetailsTbody = document.getElementById('chart-details-tbody');
    
    // Charts para análise de plano de contas
    let chartAnalysisChart = null;
    
    // Configurações de orçamento (localStorage)
    let budgetConfig = {
        monthlyLimit: 0,
        alertPercentage: 80
    };

    // Dados globais para sorting da tabela de gastos recorrentes
    let currentRecurringExpenses = [];
    let currentSortCriteria = null;
    let currentSortDirection = 'desc'; // 'asc' or 'desc'
    // Cache BI recorrente (chave: year|month ou 'latest')
    const recurringBICache = new Map();
    let lastRecurringBILoad = 0;
    const RECURRING_BI_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos
    // Restaura cache do sessionStorage se válido
    try {
        const persisted = sessionStorage.getItem('recurringBICache');
        if (persisted) {
            const parsed = JSON.parse(persisted);
            const now = Date.now();
            Object.entries(parsed).forEach(([k,v])=>{
                if (v && v.timestamp && (now - v.timestamp) < RECURRING_BI_CACHE_TTL_MS) {
                    recurringBICache.set(k,v);
                }
            });
            if (recurringBICache.size) console.log('♻️ Cache BI restaurado:', recurringBICache.size, 'entradas');
        }
    } catch(e){ console.warn('Falha ao restaurar cache BI', e); }
    function persistRecurringBICache(){
        const obj = {};
        recurringBICache.forEach((v,k)=> obj[k]=v);
        try { sessionStorage.setItem('recurringBICache', JSON.stringify(obj)); } catch(e) { /* ignore */ }
    }

    // ========== SISTEMA DE INSIGHTS ==========
    const refreshInsightsBtn = document.getElementById('refresh-insights-btn');
    const insightTabBtns = document.querySelectorAll('.insight-tab-btn');
    const criticalAlertsContainer = document.getElementById('critical-alerts');
    const financialStatusContainer = document.getElementById('financial-status');
    const riskIndicatorsContainer = document.getElementById('risk-indicators');

    // ========== SISTEMA DE GRÁFICOS - VERSÃO COMPLETA ==========
    
    // Registry central de todas as instâncias de gráficos
    const chartRegistry = {
        // Gráficos principais do dashboard
        expensesLineChart: null,
        expensesPieChart: null,
        planChart: null,
        mixedTypeChart: null,
        goalsChart: null,
        goalsPlanChart: null,
        
        // Gráficos de análise empresarial
        businessEvolutionChart: null,
        businessAccountChart: null,
        businessCategoryChart: null,
    quarterlyComparison: null,
    expenseProjection: null,
        
        // Gráficos de IR
        irChart1: null,
        irChart2: null
    };
    
    // Projeção de gastos por plano (quantidade de lançamentos futuros)
    chartRegistry.planProjectionChart = null;
    
    // ========== PROJEÇÃO DE GASTOS POR PLANO (QUANTIDADE) ==========
    /**
     * Calcula a projeção de número de lançamentos para um plano específico
     * Estratégia: agrupa contagem de lançamentos por mês (YYYY-MM) para o plano selecionado.
     * Usa média dos últimos 3 meses completos disponíveis para projetar próximos 3 meses.
     */
    function computePlanCountProjection(planId) {
        if (!allExpensesCache || allExpensesCache.length === 0) return null;
        const normalizedPlan = String(planId).trim();
        if (!normalizedPlan) return null;

        // Filtrar despesas do plano
        const expenses = allExpensesCache.filter(e => String(e.account_plan_code||'') === normalizedPlan);
        if (expenses.length === 0) return { planId: normalizedPlan, history: [], projections: [] };

        // Agrupar por mês
        const byMonth = {};
        expenses.forEach(e => {
            const rawDate = e.transaction_date || e.date || e.created_at;
            if (!rawDate) return;
            const dt = new Date(rawDate);
            if (isNaN(dt)) return;
            const key = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
            byMonth[key] = (byMonth[key] || 0) + 1;
        });

        const monthKeys = Object.keys(byMonth).sort();
        if (monthKeys.length === 0) return { planId: normalizedPlan, history: [], projections: [] };

        // Considerar últimos até 6 meses para histórico exibido
        const lastMonths = monthKeys.slice(-6);
        const history = lastMonths.map(k => ({ month: k, count: byMonth[k] }));

        // Média dos últimos 3 meses (se não houver 3, usar o que tiver)
        const last3 = monthKeys.slice(-3);
        const avg = last3.length ? last3.reduce((sum, k) => sum + byMonth[k], 0) / last3.length : 0;

        // Calcular próximos 3 meses
        const lastDateParts = monthKeys[monthKeys.length - 1].split('-');
        let year = parseInt(lastDateParts[0]);
        let month = parseInt(lastDateParts[1]);
        const projections = [];
        for (let i=1;i<=3;i++) {
            month += 1;
            if (month > 12) { month = 1; year += 1; }
            const key = year + '-' + String(month).padStart(2,'0');
            projections.push({ month: key, projected: Math.round(avg) });
        }

        return { planId: normalizedPlan, history, projections, average: avg };
    }

    /**
     * Renderiza gráfico de projeção (barras históricas + linha projetada)
     */
    function renderPlanProjectionChart(planId) {
        const canvas = document.getElementById('plan-projection-chart');
        const emptyEl = document.getElementById('plan-projection-empty');
        if (!canvas) return;

        // Validar entrada: somente um plano (número simples)
        const parsed = String(planId||'').trim();
        if (!parsed || /[, ]/.test(parsed)) {
            if (emptyEl) { emptyEl.classList.remove('hidden'); emptyEl.textContent = 'Informe um único plano de conta no filtro para ver a projeção.'; }
            destroyChart('planProjectionChart');
            return;
        }

        if (!isChartJsLoaded()) {
            if (emptyEl) { emptyEl.classList.remove('hidden'); emptyEl.textContent = 'Biblioteca de gráficos não carregada.'; }
            return;
        }

        const result = computePlanCountProjection(parsed);
        if (!result || result.history.length === 0) {
            if (emptyEl) { emptyEl.classList.remove('hidden'); emptyEl.textContent = 'Sem dados históricos suficientes para este plano.'; }
            destroyChart('planProjectionChart');
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');

        const labels = [...result.history.map(h => h.month), ...result.projections.map(p => p.month)];
        const historyCounts = result.history.map(h => h.count);
        const projectionCounts = result.projections.map(p => p.projected);

        // Dados combinados para dataset único (histórico + projeção) com cores diferentes
        const dataCombined = [...historyCounts, ...projectionCounts];
        const historyLen = historyCounts.length;

        destroyChart('planProjectionChart');

        chartRegistry.planProjectionChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Lançamentos Históricos',
                        data: dataCombined,
                        backgroundColor: labels.map((_, idx) => idx < historyLen ? 'rgba(59,130,246,0.7)' : 'rgba(16,185,129,0.4)'),
                        borderColor: labels.map((_, idx) => idx < historyLen ? 'rgba(59,130,246,1)' : 'rgba(16,185,129,0.9)'),
                        borderWidth: 2,
                        borderRadius: 6,
                        showValues: true,
                        valueColor: CHART_CONFIG.valueColor,
                        valueFont: 'bold 10px Arial'
                    },
                    {
                        type: 'line',
                        label: 'Projeção Média (3m)',
                        data: labels.map((_, idx) => idx < historyLen ? null : result.average),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.15)',
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: '#10b981',
                        yAxisID: 'y'
                    }
                ]
            },
            options: mergeChartOptions({
                plugins: {
                    title: { display: true, text: `🔮 Projeção de Lançamentos - Plano ${result.planId}` },
                    subtitle: { display: true, text: `Média base: ${(result.average||0).toFixed(1)} por mês • Próximos 3 meses estimados`, font: { size: 11 } },
                    legend: { position: 'bottom' }
                },
                scales: {
                    x: { stacked: false },
                    y: { beginAtZero: true, title: { display: true, text: 'Qtd. Lançamentos' } }
                }
            })
        });
    }

    // ----- NOVA INTEGRAÇÃO COM INPUTS DEDICADOS -----
    const planProjectionInput = document.getElementById('plan-projection-input');
    const planProjectionMonths = document.getElementById('plan-projection-months');
    const planProjectionGenerateBtn = document.getElementById('load-plan-projection-btn');
    const refreshProjectionBtn = document.getElementById('refresh-plan-projection-btn');

    async function fetchMultiMonthExpenses(planId, monthsWindow) {
        // Tenta endpoint mais abrangente (ex: /api/expenses/history) se existir
        const now = new Date();
        const endYear = now.getFullYear();
        const endMonth = now.getMonth() + 1;
        // Data inicial retrocedendo monthsWindow-1 meses
        const start = new Date(now.getFullYear(), now.getMonth() - (monthsWindow - 1), 1);
        const startYear = start.getFullYear();
        const startMonth = start.getMonth() + 1;
        const params = new URLSearchParams({
            startYear, startMonth, endYear, endMonth, plan: planId
        });
        try {
            const resp = await authenticatedFetch(`${API_BASE_URL}/api/expenses/history?${params.toString()}`);
            if (resp.ok) {
                const json = await resp.json();
                // Esperado: array de expenses com account_plan_code e data
                return Array.isArray(json) ? json : (json.expenses || []);
            }
        } catch (err) {
            console.warn('Endpoint /api/expenses/history indisponível, usando cache local:', err.message);
        }
        // Fallback: usar cache local filtrado (pode não conter todos os meses solicitados)
        return allExpensesCache.filter(e => String(e.account_plan_code||'') === String(planId));
    }

    async function generatePlanProjection() {
        const planId = planProjectionInput?.value.trim();
        const monthsWindow = parseInt(planProjectionMonths?.value || '6');
        if (!planId) {
            renderPlanProjectionChart(null);
            return;
        }
        // Carregar histórico estendido (atualiza allExpensesCache parcial? Não, só local)
        const historyExpenses = await fetchMultiMonthExpenses(planId, monthsWindow);
        if (historyExpenses.length) {
            // Fusão temporária com cache para cálculo sem sobrescrever tudo
            const originalCache = allExpensesCache;
            try {
                // Mesclar mantendo outros planos para não quebrar filtros
                const merged = [...originalCache.filter(e => String(e.account_plan_code||'') !== String(planId)), ...historyExpenses];
                allExpensesCache = merged;
                renderPlanProjectionChart(planId);
            } finally {
                // Restaurar cache original para não afetar outras funções
                allExpensesCache = originalCache;
            }
        } else {
            renderPlanProjectionChart(planId);
        }
    }

    if (planProjectionGenerateBtn) {
        planProjectionGenerateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            generatePlanProjection();
        });
    }
    if (refreshProjectionBtn) {
        refreshProjectionBtn.addEventListener('click', (e) => {
            e.preventDefault();
            generatePlanProjection();
        });
    }
    if (planProjectionInput) {
        planProjectionInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') generatePlanProjection();
        });
    }
    // Chamar quando despesas carregam pela primeira vez
    const originalFetchAndRenderExpenses = fetchAndRenderExpenses;
    fetchAndRenderExpenses = async function() {
        await originalFetchAndRenderExpenses();
        // Auto-gerar se input já preenchido
        if (planProjectionInput && planProjectionInput.value.trim()) {
            generatePlanProjection();
        }
    };

    function getToken() {
        const token = localStorage.getItem('token');
        console.log('Token recuperado:', token ? 'Token presente' : 'Token ausente');
        return token;
    }

    // Função utilitária para formatar valores em Real brasileiro
    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    }

    // ========== PERSONALIZAÇÃO VISUAL PARA CONTA UNIFICADA PIX/Boleto ==========

    function isPixBoletoAccount(account){
        return (account || '').toUpperCase() === 'PIX/BOLETO';
    }

    function getPaymentTypeColor(account, opacity = 1) {
        if (isPixBoletoAccount(account)) return `rgba(56,189,248,${opacity})`; // azul turquesa
        const map = {
            'Nu Bank Ketlyn': `rgba(142, 68, 173, ${opacity})`,
            'Nu Vainer': `rgba(155, 89, 182, ${opacity})`,
            'Ourocard Ketlyn': `rgba(241, 196, 15, ${opacity})`,
            'PicPay Vainer': `rgba(39, 174, 96, ${opacity})`
        };
        return map[account] || `rgba(99,102,106,${opacity})`;
    }

    function getPaymentTypeIcon(account) {
        if (isPixBoletoAccount(account)) return '💳';
        const icons = {
            'Nu Bank Ketlyn': '💜',
            'Nu Vainer': '🟣',
            'Ourocard Ketlyn': '🟡',
            'PicPay Vainer': '💚'
        };
        return icons[account] || '💰';
    }

    function createPaymentGradient(ctx, account) {
        const g = ctx.createLinearGradient(0,0,0,300);
        if (isPixBoletoAccount(account)) {
            g.addColorStop(0,'rgba(56,189,248,0.9)');
            g.addColorStop(1,'rgba(56,189,248,0.15)');
        } else {
            g.addColorStop(0,getPaymentTypeColor(account,0.85));
            g.addColorStop(1,getPaymentTypeColor(account,0.15));
        }
        return g;
    }

    function enhanceLabelsWithIcons(labels, accounts) {
        return labels.map((label, idx)=>`${getPaymentTypeIcon(accounts[idx])} ${label}`);
    }

    // ===== QUARTERLY & PROJECTION (INTEGRAÇÃO NOVO ENDPOINT) =====
    async function loadQuarterlyAndProjection() {
        const qcEl = document.getElementById('quarterly-comparison-chart');
        const projEl = document.getElementById('expense-projection-chart');
        if(!qcEl && !projEl) return; // nada para fazer
        try {
            const resp = await authenticatedFetch(`${API_BASE_URL}/api/business/quarterly-comparison`);
            if(!resp.ok) throw new Error('Falha quarterly API');
            const payload = await resp.json();
            const last3 = payload.last3 || [];
            const labels = last3.map(r=> ('0'+r.month).slice(-2)+ '/' + r.year);
            const totals = last3.map(r=> r.total);
            if(qcEl){
                if(chartRegistry.quarterlyComparison) chartRegistry.quarterlyComparison.destroy();
                chartRegistry.quarterlyComparison = new Chart(qcEl.getContext('2d'), {
                    type:'bar',
                    data:{ labels, datasets:[{ label:'Gastos Empresariais (R$)', data: totals, backgroundColor:['#3b82f6','#6366f1','#8b5cf6'], borderRadius:6 }]},
                    options:{ plugins:{ title:{display:true,text:'Últimos 3 Meses (Empresarial)'}, legend:{display:false}}, scales:{ y:{ beginAtZero:true }}}
                });
            }
            if(projEl){
                if(chartRegistry.expenseProjection) chartRegistry.expenseProjection.destroy();
                const projVals = payload.projectionNext3 || [];
                chartRegistry.expenseProjection = new Chart(projEl.getContext('2d'), {
                    type:'line',
                    data:{ labels:['+1 mês','+2 meses','+3 meses'], datasets:[{label:'Projeção (R$)', data: projVals, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.25)', fill:true, tension:0.3 }]},
                    options:{ plugins:{ title:{display:true,text:'Projeção Próximos 3 Meses'}, legend:{display:false}}, scales:{ y:{ beginAtZero:true }}}
                });
                updateFinancialStatusAI(totals, payload.futureInstallments || 0, projVals);
            }
        } catch(e){ console.error('Erro quarterly/projection front:', e); }
    }

    function updateFinancialStatusAI(lastTotals, futureInstallments, projectionVals){
        const statusEl = document.getElementById('financial-status');
        const riskEl = document.getElementById('risk-indicators');
        if(!statusEl || !riskEl) return;
        statusEl.innerHTML = ''; riskEl.innerHTML='';
        const avg = lastTotals.length? lastTotals.reduce((a,b)=>a+b,0)/lastTotals.length:0;
        const trend = lastTotals.length>=2? (lastTotals[lastTotals.length-1]-lastTotals[0])/(Math.abs(lastTotals[0])||1):0;
        let statusMsg, color;
        if(trend>0.2) { statusMsg='Crescimento acelerado de gastos empresariais'; color='text-red-600'; }
        else if(trend<-0.1){ statusMsg='Redução consistente de gastos'; color='text-green-600'; }
        else { statusMsg='Faixa estável de gastos'; color='text-blue-600'; }
        statusEl.innerHTML = `<div class="border rounded p-3 bg-gray-50"><p class="font-semibold ${color}">${statusMsg}</p><p class="text-sm text-gray-600">Média 3m: ${formatCurrency(avg)} • Último: ${formatCurrency(lastTotals[lastTotals.length-1]||0)}</p></div>`;
        const risks=[];
        const futureLoad = avg? futureInstallments/avg : 0;
        if(futureLoad>1.2) risks.push({t:'Carga de Parcelados Elevada',lvl:'Alto',d:`Parcelados futuros equivalem a ${(futureLoad*100).toFixed(0)}% da média trimestral.`});
        if(trend>0.3) risks.push({t:'Aceleração Forte',lvl:'Alto',d:'Aumento superior a 30% no período observado.'});
        if(!risks.length) risks.push({t:'Sem riscos relevantes',lvl:'Baixo',d:'Estrutura saudável.'});
        riskEl.innerHTML = risks.map(r=>`<div class="p-2 mb-2 rounded border ${r.lvl==='Alto'?'bg-red-50 border-red-300':'bg-green-50 border-green-300'}"><p class="font-medium">${r.t} - ${r.lvl}</p><p class="text-xs text-gray-600">${r.d}</p></div>`).join('');
    }

    // Função para verificar se o usuário está autenticado
    function checkAuthentication() {
        const token = getToken();
        if (!token) {
            console.log('Autenticação falhou - token ausente');
            showLogin();
            return false;
        }
        return true;
    }

    // Função para lidar com erros de autenticação
    function handleAuthError(response) {
        if (response.status === 401 || response.status === 403) {
            console.log('Erro de autenticação detectado:', response.status);
            showNotification('Sessão expirada. Faça login novamente.', 'error');
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            showLogin();
            return true;
        }
        return false;
    }

    // Função melhorada para fazer requests com tratamento de autenticação
    async function authenticatedFetch(url, options = {}) {
        const token = getToken();
        if (!token) {
            console.log('authenticatedFetch: Token não encontrado');
            showLogin();
            throw new Error('Token não encontrado');
        }

        // Headers CORS completos
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            ...options.headers
        };

        // Só adicionar Content-Type se não for FormData
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        console.log('Fazendo request para:', url);
        console.log('Headers:', headers);

        const response = await fetch(url, {
            ...options,
            headers,
            mode: 'cors',
            credentials: 'omit'
        });

        console.log('Response status:', response.status);

        if (response.status === 401 || response.status === 403) {
            handleAuthError(response);
            throw new Error('Autenticação falhou');
        }

        return response;
    }

    // Função para download autenticado de faturas
    window.downloadInvoice = async function(expenseId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                showNotification('Você precisa estar logado para baixar faturas', 'error');
                return;
            }

            // Mostrar loading
            showNotification('Baixando fatura...', 'info');

            const response = await fetch(`${API_BASE_URL}/api/invoice/${expenseId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': '*/*'
                },
                mode: 'cors',
                credentials: 'omit'
            });

            if (response.ok) {
                // Obter o nome do arquivo dos headers
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'fatura.pdf';
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (filenameMatch) {
                        filename = filenameMatch[1].replace(/['"]/g, '');
                    }
                }

                // Criar blob e fazer download
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
 
                showNotification('Fatura baixada com sucesso!', 'success');
            } else if (response.status === 404) {
                const error = await response.json();
                showNotification(error.message || 'Fatura não encontrada', 'error');
            } else if (response.status === 401 || response.status === 403) {
                showNotification('Acesso negado. Faça login novamente.', 'error');
                handleAuthError(response);
            } else {
                const error = await response.json();
                showNotification(error.message || 'Erro ao baixar fatura', 'error');
            }
        } catch (error) {
            console.error('Erro ao baixar fatura:', error);
            showNotification('Erro de conexão ao baixar fatura', 'error');
        }
    }

    function addEventListeners() {
        if (loginForm) loginForm.addEventListener('submit', handleLogin);
        if (logoutButton) logoutButton.addEventListener('click', handleLogout);
        if (filterYear) filterYear.addEventListener('change', fetchAllData);
        if (filterMonth) filterMonth.addEventListener('change', fetchAllData);
        if (addExpenseForm) addExpenseForm.addEventListener('submit', handleAddExpense);
        if (expensesTableBody) expensesTableBody.addEventListener('click', handleTableClick);
        if (weeklyReportBtn) weeklyReportBtn.addEventListener('click', handleWeeklyReportDownload);
        if (monthlyReportBtn) monthlyReportBtn.addEventListener('click', openReportModal);
        if (cancelReportBtn) cancelReportBtn.addEventListener('click', closeReportModal);
        if (reportForm) reportForm.addEventListener('submit', handleMonthlyReportDownload);
        
        // Event listeners para atualizar prévia do relatório
        const reportYear = document.getElementById('report-year');
        const reportMonth = document.getElementById('report-month');
        if (reportYear) reportYear.addEventListener('change', loadReportCeilingPreview);
        if (reportMonth) reportMonth.addEventListener('change', loadReportCeilingPreview);
        if (businessCheckbox) businessCheckbox.addEventListener('change', toggleExpenseFields);
        document.getElementById('filter-account').addEventListener('change', fetchAllData);
        if (filterPlan) filterPlan.addEventListener('input', applyAllFilters);
        if (interactiveReportBtn) interactiveReportBtn.addEventListener('click', () => {
            if (interactiveReportModal) {
                interactiveReportModal.classList.remove('hidden');
                setTimeout(() => interactiveReportModal.classList.remove('opacity-0'), 10);
                populateIrAccounts();
                adjustModalForMobile(interactiveReportModal);
            }
        });
        if (closeIrModalBtn) closeIrModalBtn.addEventListener('click', () => {
            if (interactiveReportModal) {
                interactiveReportModal.classList.add('opacity-0');
                setTimeout(() => interactiveReportModal.classList.add('hidden'), 300);
            }
        });
        
        // Event listeners para gastos recorrentes
        if (recurringExpensesBtn) recurringExpensesBtn.addEventListener('click', openRecurringModal);

        // Event listeners para modal de edição de gastos
        if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditExpenseModal);
        if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditExpenseModal);
        if (editExpenseForm) editExpenseForm.addEventListener('submit', handleEditExpense);
        if (editHasInvoiceCheckbox) editHasInvoiceCheckbox.addEventListener('change', toggleEditInvoiceUpload);
        if (closeRecurringModalBtn) closeRecurringModalBtn.addEventListener('click', closeRecurringModal);
        if (recurringForm) recurringForm.addEventListener('submit', handleRecurringExpenseSubmit);
        if (processRecurringBtn) processRecurringBtn.addEventListener('click', processRecurringExpenses);
        
        // Event listener para teste do gráfico de tendências
        if (testTrendChartBtn) testTrendChartBtn.addEventListener('click', testTrendAnalysisChart);
        
        // Event listeners para análise por período da fatura
        if (periodAnalysisBtn) periodAnalysisBtn.addEventListener('click', openPeriodAnalysisModal);
        if (closePeriodAnalysisModalBtn) closePeriodAnalysisModalBtn.addEventListener('click', closePeriodAnalysisModal);
        if (periodAnalysisForm) periodAnalysisForm.addEventListener('submit', handlePeriodAnalysis);
        if (periodExportPdfBtn) periodExportPdfBtn.addEventListener('click', exportPeriodAnalysisPdf);
        
        // Event listeners para abas de análise por período
        if (periodTabBtns) {
            periodTabBtns.forEach(btn => {
                btn.addEventListener('click', function() {
                    switchPeriodTab(this.dataset.tab);
                });
            });
        }
        
        // Event listeners para alertas de orçamento por plano de contas
        if (checkChartBudgetBtn) checkChartBudgetBtn.addEventListener('click', checkChartBudgetAlerts);
        if (analyzeChartUsageBtn) analyzeChartUsageBtn.addEventListener('click', analyzeChartUsage);
        
        // Inicializar campos de ano e mês
        initializeBudgetFilters();
        
        // Event listener para redimensionamento da janela (ajustar modais em dispositivos móveis)
        window.addEventListener('resize', () => {
            const reportModal = document.getElementById('report-modal');
            const interactiveModal = document.getElementById('interactive-report-modal');
            
            if (reportModal && !reportModal.classList.contains('hidden')) {
                adjustModalForMobile(reportModal);
            }
            
            if (interactiveModal && !interactiveModal.classList.contains('hidden')) {
                adjustModalForMobile(interactiveModal);
            }
        });
        
        // Event listener para refresh de insights
        if (refreshInsightsBtn) refreshInsightsBtn.addEventListener('click', refreshInsights);
        
        // Event listeners para seção de análise por categoria
        const refreshCategoryBtn = document.getElementById('refresh-category-btn');
        const exportCategoryBtn = document.getElementById('export-category-btn');
        
        if (refreshCategoryBtn) {
            refreshCategoryBtn.addEventListener('click', function() {
                console.log('🔄 Atualizando análise por categoria...');
                fetchAndRenderPlanChart();
            });
        }
        
        if (exportCategoryBtn) {
            exportCategoryBtn.addEventListener('click', function() {
                console.log('📤 Exportando dados de categoria...');
                exportCategoryAnalysis();
            });
        }
        
        // Event listeners para menu móvel
        setupMobileMenu();
        
        // Event listeners para as abas de insights
        if (insightTabBtns) {
            insightTabBtns.forEach(btn => {
                btn.addEventListener('click', function() {
                    switchInsightTab(this.dataset.tab);
                });
            });
        }
        
        // Event listener para toggle do tema
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
        
        // Event listener para botão de análise de tendências
        const budgetProjectionBtn = document.getElementById('budget-projection');
        if (budgetProjectionBtn) {
            budgetProjectionBtn.addEventListener('click', showBudgetProjection);
            console.log('📊 Event listener do botão Projeção Mensal adicionado');
        } else {
            console.warn('⚠️ Botão budget-projection não encontrado no DOM');
        }
        
        // Event listeners para botões de refresh dos gráficos
        const refreshBudgetBtn = document.getElementById('refresh-budget-btn');
        if (refreshBudgetBtn) refreshBudgetBtn.addEventListener('click', refreshBudgetChart);
        
        const refreshDistributionBtn = document.getElementById('refresh-distribution-btn');
        if (refreshDistributionBtn) refreshDistributionBtn.addEventListener('click', refreshDistributionChart);
        
        // Event listeners para export de gráficos (será implementado ao clicar com botão direito)
        const chartCanvases = ['goals-chart', 'goals-plan-chart', 'expenses-line-chart', 'expenses-pie-chart'];
        chartCanvases.forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                canvas.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    exportChartAsImage(canvasId);
                });
            }
        });
        
        // Navegação principal: delegada ao initializeTabs para evitar binds duplicados
        // initializeTabs() cuidará de associar os handlers chamando switchMainTab
    }

    async function handleLogin(e) {
        e.preventDefault();
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        if (!usernameInput || !passwordInput) return alert("Erro de configuração do HTML.");
        try {
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Origin': 'https://controle-de-financeiro-production.up.railway.app'
                },
                mode: 'cors',
                credentials: 'include',
                body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            localStorage.setItem('token', data.accessToken);
            localStorage.setItem('username', usernameInput.value);
            showDashboard();
        } catch (error) {
            alert(`Erro no login: ${error.message}`);
        }
    }

    function handleLogout() {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        showLogin();
    }

    function showDashboard() {
        if (loginSection) loginSection.style.display = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
        if (welcomeUserSpan) welcomeUserSpan.textContent = `Bem-vindo, ${localStorage.getItem('username')}!`;
        initializeDashboard();
        checkMonthlyReportReminder();
    }

    function showLogin() {
        if (loginSection) loginSection.style.display = 'flex';
        if (dashboardContent) dashboardContent.style.display = 'none';
    }

    function initializeDashboard() {
        populateAccountFilter();
        populateFilterOptions();
        fetchAllData();
        toggleExpenseFields();
        initializeTabs(); // Adicionar inicialização das tabs
        
        // Inicializar sistema de insights após delay maior para garantir que tudo está pronto
        console.log('✅ Dashboard inicializado, agendando sistema de insights...');
        setTimeout(() => {
            console.log('🚀 Inicializando sistema de insights...');
            initInsightSystem();
        }, 5000);  // 5 segundos de delay
    }

    function populateFilterOptions() {
        if (!filterYear || !filterMonth) return;
        filterYear.innerHTML = '';
        filterMonth.innerHTML = '';
        const currentYear = new Date().getFullYear();
        // Incluir anos futuros até 2027 (currentYear + 2)
        for (let i = currentYear + 2; i >= currentYear - 5; i--) filterYear.add(new Option(i, i));
        const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        months.forEach((month, index) => filterMonth.add(new Option(month, index + 1)));
        filterYear.value = currentYear;
        filterMonth.value = new Date().getMonth() + 1;
    }

    function toggleExpenseFields() {
        if (!personalFields || !businessFields || !businessCheckbox) return;
        personalFields.classList.toggle('hidden', businessCheckbox.checked);
        businessFields.classList.toggle('hidden', !businessCheckbox.checked);
    }

    // ========== GERENCIAMENTO DO CHART.JS ==========
    
    /**
     * Verifica se o Chart.js está carregado e disponível
     */
    function isChartJsLoaded() {
        return typeof Chart !== 'undefined' && Chart.version;
    }

    /**
     * Aguarda o Chart.js estar disponível com retry inteligente
     */
    function waitForChartJs() {
        return new Promise((resolve) => {
            if (isChartJsLoaded()) {
                console.log('✅ Chart.js já carregado:', Chart.version);
                resolve(true);
                return;
            }
            
            console.log('⏳ Aguardando Chart.js carregar...');
            let attempts = 0;
            const maxAttempts = 50; // 5 segundos máximo
            
            const checkInterval = setInterval(() => {
                attempts++;
                
                if (isChartJsLoaded()) {
                    clearInterval(checkInterval);
                    console.log('✅ Chart.js carregado após', attempts * 100, 'ms:', Chart.version);
                    registerValuePlugin(); // ✅ Registrar plugin de valores
                    resolve(true);
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    console.error('❌ Chart.js não carregou após', maxAttempts * 100, 'ms');
                    resolve(false);
                }
            }, 100);
        });
    }

    /**
     * Configurações responsivas e padrões para todos os gráficos
     */
    const defaultChartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        interaction: {
            intersect: false,
            mode: 'index'
        },
        animation: {
            duration: 750,
            easing: 'easeInOutQuart'
        },
        elements: {
            line: {
                tension: 0.4
            },
            point: {
                radius: 4,
                hoverRadius: 6
            }
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    padding: 20,
                    usePointStyle: true,
                    font: {
                        size: 12
                    }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                cornerRadius: 6,
                displayColors: true,
                mode: 'index',
                intersect: false,
                callbacks: {
                    title: function(context) {
                        return context[0].label || '';
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    display: true,
                    color: 'rgba(0, 0, 0, 0.1)'
                },
                ticks: {
                    font: {
                        size: 11
                    }
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    display: true,
                    color: 'rgba(0, 0, 0, 0.1)'
                },
                ticks: {
                    font: {
                        size: 11
                    },
                    callback: function(value) {
                        return 'R$ ' + value.toLocaleString('pt-BR', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                        });
                    }
                }
            }
        }
    };

    /**
     * Plugin para exibir valores nos gráficos
     */
    const chartValuesPlugin = {
        id: 'chartValues',
        afterDatasetsDraw: function(chart) {
            const ctx = chart.ctx;
            const chartType = chart.config.type;
            
            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                
                if (meta.hidden || !dataset.showValues) return;
                
                ctx.save();
                ctx.fillStyle = dataset.valueColor || '#333';
                ctx.font = dataset.valueFont || 'bold 11px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                
                meta.data.forEach((element, index) => {
                    const value = dataset.data[index];
                    if (value === null || value === undefined || value === 0) return;
                    
                    const formatted = 'R$ ' + value.toLocaleString('pt-BR', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    });
                    
                    if (chartType === 'pie') {
                        // Para gráficos de pizza, posicionar no centro dos segmentos
                        const angle = element.startAngle + (element.endAngle - element.startAngle) / 2;
                        const radius = (element.innerRadius + element.outerRadius) / 2;
                        const x = element.x + Math.cos(angle) * radius * 0.8;
                        const y = element.y + Math.sin(angle) * radius * 0.8;
                        
                        ctx.fillStyle = '#fff';
                        ctx.strokeStyle = '#333';
                        ctx.lineWidth = 3;
                        ctx.strokeText(formatted, x, y);
                        ctx.fillText(formatted, x, y);
                    } else {
                        // Para gráficos de barras e linhas
                        const x = element.x;
                        const y = element.y - 5;
                        
                        ctx.fillText(formatted, x, y);
                    }
                });
                
                ctx.restore();
            });
        }
    };

    /**
     * Registra o plugin de valores quando Chart.js estiver disponível
     */
    function registerValuePlugin() {
        if (typeof Chart !== 'undefined' && Chart.register) {
            Chart.register(chartValuesPlugin);
            console.log('✅ Plugin de valores registrado no Chart.js');
            return true;
        }
        return false;
    }

    /**
     * Mescla opções específicas com as padrões
     */
    function mergeChartOptions(specificOptions = {}) {
        return {
            ...defaultChartOptions,
            ...specificOptions,
            plugins: {
                ...defaultChartOptions.plugins,
                ...specificOptions.plugins
            },
            scales: {
                ...defaultChartOptions.scales,
                ...specificOptions.scales
            }
        };
    }

    /**
     * Função principal para carregar todos os dados e gráficos do dashboard
     */
    async function fetchAllData() {
        try {
            if (!checkAuthentication()) {
                console.log('❌ Autenticação falhou em fetchAllData');
                return;
            }

            console.log('🚀 Iniciando fetchAllData...');
            
            // Aguardar Chart.js estar disponível
            const chartJsLoaded = await waitForChartJs();
            
            if (!chartJsLoaded) {
                console.error('❌ Chart.js não está disponível, gráficos serão ignorados');
                showNotification('Biblioteca de gráficos não carregada - alguns recursos podem não funcionar', 'warning', 5000);
            } else {
                console.log('✅ Chart.js carregado, prosseguindo com gráficos');
            }

            // Carregar dados em paralelo para melhor performance
            const promises = [
                fetchAndRenderExpenses(),
                fetchAndRenderDashboardMetrics()
            ];

            // Só adicionar gráficos se Chart.js estiver disponível
            if (chartJsLoaded) {
                promises.push(fetchAndRenderGoalsChart());
            }

            await Promise.all(promises);
            
            console.log('✅ fetchAllData concluído com sucesso');
        } catch (error) {
            console.error('❌ Erro em fetchAllData:', error);
            showNotification('Erro ao carregar dados do dashboard: ' + error.message, 'error');
        }
    }

    // --- Busca tetos e renderiza gráfico de limites/alertas ---
    async function fetchAndRenderGoalsChart() {
        try {
            if (!checkAuthentication()) return;

            const params = new URLSearchParams({
                year: filterYear.value,
                month: filterMonth.value
            });

            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses-goals?${params.toString()}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar limites.');
            }
            
            const data = await response.json();

            // Processar e exibir alertas de limites de gastos
            if (data && data.length > 0) {
                processLimitAlerts(data);
            }

            renderGoalsChart(data);
            renderGoalsPlanChart(data);
        } catch (error) {
            console.error('Erro ao buscar limites:', error);
            showNotification('Erro ao carregar limites de gastos', 'error');
        }
    }

    // ========== RENDERIZAÇÃO DOS GRÁFICOS PRINCIPAIS ==========
    
    /**
     * Renderiza gráfico de metas/limites
     */
    function renderGoalsChart(data = []) {
        const canvasId = 'goals-chart';
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`Canvas ${canvasId} não encontrado`);
            return false;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        
        if (!isChartJsLoaded()) {
            console.error(`Chart.js não está carregado para ${canvasId}`);
            return false;
        }
        
        if (!data || data.length === 0) {
            console.log('❌ Sem dados para o gráfico goals-chart');
            return false;
        }

        try {
            destroyChart('goalsChart');
            
            console.log('📊 Renderizando gráfico de limites vs gastos:', data);
            
            if (!data || data.length === 0) {
                console.log('❌ Nenhum dado recebido para o gráfico de limites');
                return false;
            }

            // Normalizar dados agregados vindos do backend (PlanoContasID, Total, Teto, Percentual)
            const chartData = (data || []).map(item => ({
                PlanoContasID: String(item.PlanoContasID),
                Total: parseFloat(item.Total) || 0,
                Teto: parseFloat(item.Teto) || 0,
                Percentual: parseFloat(item.Percentual) || 0
            }));

            if (chartData.length === 0) {
                console.log('❌ Nenhum plano com gastos ou limites para exibir');
                return false;
            }

            // Ordenar por PlanoContasID para melhor visualização
            const sortedData = chartData.sort((a, b) => parseInt(a.PlanoContasID) - parseInt(b.PlanoContasID));
            const filteredData = sortedData; // Para usar no subtitle

            console.log('📊 Dados do gráfico:', sortedData);

            const labels = sortedData.map(d => `Plano ${d.PlanoContasID}`);
            const limitData = sortedData.map(d => d.Teto);
            const currentData = sortedData.map(d => d.Total);

            chartRegistry.goalsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: '🎯 Teto de Gastos',
                            data: limitData,
                            type: 'line',
                            fill: false,
                            borderColor: 'rgba(34, 197, 94, 1)',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            borderWidth: 3,
                            pointRadius: 6,
                            pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            tension: 0.1,
                            yAxisID: 'y'
                        },
                        {
                            label: '💰 Gastos Atuais',
                            data: currentData,
                            showValues: CHART_CONFIG.showValues,  // ✅ Usar configuração global
                            valueColor: CHART_CONFIG.valueColor,
                            valueFont: CHART_CONFIG.valueFont,
                            backgroundColor: sortedData.map(item => {
                                const percentage = item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0);
                                if (percentage > 100) return 'rgba(239, 68, 68, 0.8)';
                                if (percentage >= 90) return 'rgba(251, 146, 60, 0.8)';
                                if (percentage >= 70) return 'rgba(250, 204, 21, 0.8)';
                                return 'rgba(34, 197, 94, 0.8)';
                            }),
                            borderColor: sortedData.map(item => {
                                const percentage = item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0);
                                if (percentage > 100) return 'rgba(239, 68, 68, 1)';
                                if (percentage >= 90) return 'rgba(251, 146, 60, 1)';
                                if (percentage >= 70) return 'rgba(250, 204, 21, 1)';
                                return 'rgba(34, 197, 94, 1)';
                            }),
                            borderWidth: 2,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: '🎯 Controle de Limites vs Gastos por Plano de Conta',
                            color: getThemeColor('#374151', '#f9fafb'),
                            font: { size: 16, weight: 'bold' }
                        },
                        subtitle: {
                            display: true,
                            text: `${filteredData.length} planos monitorados - Vermelho: ultrapassou, Laranja: próximo do limite`,
                            color: getThemeColor('#6b7280', '#d1d5db'),
                            font: { size: 12 }
                        },
                        legend: {
                            position: 'bottom',
                            labels: { 
                                color: getThemeColor('#374151', '#f9fafb'),
                                usePointStyle: true,
                                padding: 20
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            borderColor: '#374151',
                            borderWidth: 1,
                            callbacks: {
                                title: function(context) {
                                    const index = context[0].dataIndex;
                                    const item = sortedData[index];
                                    return `Plano de Conta ${item.PlanoContasID}`;
                                },
                                label: function(context) {
                                    const value = context.parsed.y;
                                    const index = context.dataIndex;
                                    const item = sortedData[index];
                                    const percentage = (item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0)).toFixed(1);
                                    
                                    if (context.dataset.label.includes('Teto')) {
                                        return `${context.dataset.label}: ${formatCurrency(value)}`;
                                    } else {
                                        return `${context.dataset.label}: ${formatCurrency(value)} (${percentage}% do limite)`;
                                    }
                                },
                                footer: function(context) {
                                    if (context.length > 0) {
                                        const index = context[0].dataIndex;
                                        const item = sortedData[index];
                                        const remaining = Math.max(0, item.Teto - item.Total);
                                        const percentage = (item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0)).toFixed(1);
                                        
                                        let status = '';
                                        if (current > limit) {
                                            status = `⚠️ ULTRAPASSOU em ${formatCurrency(current - limit)}`;
                                        } else {
                                            status = `✅ Disponível: ${formatCurrency(remaining)}`;
                                        }
                                        
                                        return [
                                            `Utilização: ${percentage}%`,
                                            status
                                        ];
                                    }
                                    return '';
                                }
                            }
                        },
                        datalabels: {
                            display: function(context) {
                                return context.parsed && context.parsed.y && context.parsed.y > 0;
                            },
                            color: '#374151',
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 10 },
                            formatter: function(value, context) {
                                if (!value || value <= 0) return '';
                                
                                if (context.dataset.label && context.dataset.label.includes('Limite')) {
                                    return formatCurrency(value).replace('R$ ', 'R$');
                                } else {
                                    const index = context.dataIndex;
                                    const item = sortedData[index];
                                    const percentage = (item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0)).toFixed(0);
                                    return value > 0 ? `${percentage}%` : '';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: getThemeColor('#6b7280', '#d1d5db'),
                                maxRotation: 45,
                                minRotation: 0
                            },
                            grid: {
                                color: getThemeColor('#e5e7eb', '#374151')
                            },
                            title: {
                                display: true,
                                text: 'Planos de Conta',
                                color: getThemeColor('#374151', '#f9fafb')
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: getThemeColor('#6b7280', '#d1d5db'),
                                callback: function(value) {
                                    return `R$ ${value.toFixed(0)}`;
                                }
                            },
                            grid: {
                                color: getThemeColor('#e5e7eb', '#374151')
                            },
                            title: {
                                display: true,
                                text: 'Valor (R$)',
                                color: getThemeColor('#374151', '#f9fafb')
                            }
                        }
                    },
                    interaction: {
                        mode: 'index',
                        intersect: false
                    }
                },
                plugins: [ChartDataLabels]
            });
            
            console.log('✅ Gráfico goals-chart renderizado com sucesso');
            return true;
        } catch (error) {
            console.error('❌ Erro ao renderizar goals-chart:', error);
            return false;
        }
    }

    /**
     * Renderiza gráfico de planos de metas (distribuição)
     */
    function renderGoalsPlanChart(data = []) {
        const canvasId = 'goals-plan-chart';
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`Canvas ${canvasId} não encontrado`);
            return false;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        
        if (!isChartJsLoaded()) {
            console.error(`Chart.js não está carregado para ${canvasId}`);
            return false;
        }
        
        if (!data || data.length === 0) {
            console.log('❌ Sem dados para o gráfico goals-plan-chart');
            return false;
        }

        try {
            destroyChart('goalsPlanChart');
            
            console.log('📊 Renderizando gráfico de tetos por plano:', data);
            
            if (!data || data.length === 0) {
                console.log('❌ Nenhum dado recebido para o gráfico de planos');
                return false;
            }

            // Normalizar dados já agregados pelo backend (PlanoContasID, Total, Teto, Percentual)
            const chartData = (data || []).map(item => ({
                PlanoContasID: String(item.PlanoContasID),
                Total: parseFloat(item.Total) || 0,
                Teto: parseFloat(item.Teto) || 0,
                Percentual: parseFloat(item.Percentual) || 0
            }));

            if (chartData.length === 0) {
                console.log('❌ Nenhum plano com dados para exibir');
                return false;
            }

            // Ordenar por PlanoContasID
            const sortedData = chartData.sort((a, b) => parseInt(a.PlanoContasID) - parseInt(b.PlanoContasID));
            const filteredData = sortedData; // Para usar no subtitle

            const labels = sortedData.map(d => `Plano ${d.PlanoContasID}`);
            const limitData = sortedData.map(d => d.Teto);
            const currentData = sortedData.map(d => d.Total);

            charts['goalsPlanChart'] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: '🎯 Limite Configurado',
                            data: limitData,
                            backgroundColor: 'rgba(34, 197, 94, 0.7)',
                            borderColor: 'rgba(34, 197, 94, 1)',
                            borderWidth: 2
                        },
                        {
                            label: '💰 Gasto Atual',
                            data: currentData,
                            backgroundColor: sortedData.map(item => {
                                const percentage = item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0);
                                if (percentage > 100) return 'rgba(239, 68, 68, 0.8)';
                                if (percentage >= 90) return 'rgba(251, 146, 60, 0.8)';
                                if (percentage >= 70) return 'rgba(250, 204, 21, 0.8)';
                                return 'rgba(59, 130, 246, 0.8)';
                            }),
                            borderColor: sortedData.map(item => {
                                const percentage = item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0);
                                if (percentage > 100) return 'rgba(239, 68, 68, 1)';
                                if (percentage >= 90) return 'rgba(251, 146, 60, 1)';
                                if (percentage >= 70) return 'rgba(250, 204, 21, 1)';
                                return 'rgba(59, 130, 246, 1)';
                            }),
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: '📊 Comparativo: Limites vs Gastos por Plano de Conta',
                            color: getThemeColor('#374151', '#f9fafb'),
                            font: { size: 16, weight: 'bold' }
                        },
                        subtitle: {
                            display: true,
                            text: `${filteredData.length} planos com limites configurados`,
                            color: getThemeColor('#6b7280', '#d1d5db'),
                            font: { size: 12 }
                        },
                        legend: {
                            position: 'bottom',
                            labels: { 
                                color: getThemeColor('#374151', '#f9fafb'),
                                usePointStyle: true,
                                padding: 20
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            borderColor: '#374151',
                            borderWidth: 1,
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                title: function(context) {
                                    const index = context[0].dataIndex;
                                    const item = sortedData[index];
                                    return `Plano de Conta ${item.PlanoContasID}`;
                                },
                                label: function(context) {
                                    const value = context.parsed.y;
                                    const index = context.dataIndex;
                                    const item = sortedData[index];
                                    const percentage = (item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0)).toFixed(1);
                                    
                                    if (context.dataset.label.includes('Limite')) {
                                        return `${context.dataset.label}: ${formatCurrency(value)}`;
                                    } else {
                                        return `${context.dataset.label}: ${formatCurrency(value)} (${percentage}%)`;
                                    }
                                },
                                footer: function(context) {
                                    if (context.length > 0) {
                                        const index = context[0].dataIndex;
                                        const item = sortedData[index];
                                        if (item.Total > item.Teto) {
                                            const excess = item.Total - item.Teto;
                                            return `⚠️ Excesso: R$ ${excess.toFixed(2)}`;
                                        } else {
                                            const remaining = item.Teto - item.Total;
                                            return `✅ Disponível: R$ ${remaining.toFixed(2)}`;
                                        }
                                    }
                                    return '';
                                }
                            }
                        },
                        datalabels: {
                            display: function(context) {
                                return context.parsed && context.parsed.y > 0;
                            },
                            color: getThemeColor('#374151', '#f9fafb'),
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 9 },
                            formatter: function(value, context) {
                                if (context.dataset.label.includes('Limite')) {
                                    return value > 0 ? `R$ ${value.toFixed(0)}` : '';
                                } else {
                                    const index = context.dataIndex;
                                    const item = sortedData[index];
                                    const percentage = (item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0)).toFixed(0);
                                    return value > 0 ? `${percentage}%` : '';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: getThemeColor('#6b7280', '#d1d5db'),
                                maxRotation: 45,
                                minRotation: 0
                            },
                            grid: {
                                color: getThemeColor('#e5e7eb', '#374151')
                            },
                            title: {
                                display: true,
                                text: 'Planos de Conta',
                                color: getThemeColor('#374151', '#f9fafb')
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: getThemeColor('#6b7280', '#d1d5db'),
                                callback: function(value) {
                                    return `R$ ${value.toFixed(0)}`;
                                }
                            },
                            grid: {
                                color: getThemeColor('#e5e7eb', '#374151')
                            },
                            title: {
                                display: true,
                                text: 'Valor (R$)',
                                color: getThemeColor('#374151', '#f9fafb')
                            }
                        }
                    },
                    interaction: {
                        mode: 'index',
                        intersect: false
                    }
                },
                plugins: [ChartDataLabels]
            });
            
            console.log('✅ Gráfico goals-plan-chart renderizado com sucesso');
            return true;
        } catch (error) {
            console.error('❌ Erro ao renderizar goals-plan-chart:', error);
            return false;
        }
    }

    // ====== DARK MODE (MODO ESCURO) ======
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');

    function setTheme(mode) {
        if (mode === 'dark') {
            document.body.classList.add('dark-mode');
            if (themeIcon) themeIcon.className = 'bi bi-brightness-high-fill';
        } else {
            document.body.classList.remove('dark-mode');
            if (themeIcon) themeIcon.className = 'bi bi-moon-stars-fill';
        }
        localStorage.setItem('theme', mode);
    }

    // Função para atualizar insights
    async function refreshInsights() {
        const btn = document.getElementById('refresh-insights-btn');
        const originalText = btn.innerHTML;
        
        try {
            btn.innerHTML = '<i class="bi bi-arrow-clockwise animate-spin"></i> Atualizando...';
            btn.disabled = true;
            
            // Simular carregamento por 2 segundos
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Recarregar dados e gráficos
            await fetchAllData();
            
            showNotification('💡 Insights atualizados com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao atualizar insights:', error);
            showNotification('❌ Erro ao atualizar insights', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    // Função para alternar entre abas de insights
    function switchInsightTab(tabName) {
        // Remover classe active de todos os botões
        document.querySelectorAll('.insight-tab-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-blue-500', 'text-white');
            btn.classList.add('bg-gray-200', 'text-gray-700');
        });
        
        // Adicionar classe active ao botão clicado
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.remove('bg-gray-200', 'text-gray-700');
            activeBtn.classList.add('active', 'bg-blue-500', 'text-white');
        }
        
        // Ocultar todos os conteúdos das abas
        document.querySelectorAll('.insight-tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        // Mostrar conteúdo da aba ativa
        const activeContent = document.getElementById(`${tabName}-content`);
        if (activeContent) {
            activeContent.classList.remove('hidden');
        }
        
        console.log(`📊 Aba de insights trocada para: ${tabName}`);
    }

    // Função para atualizar gráfico de orçamento
    async function refreshBudgetChart() {
        const btn = document.getElementById('refresh-budget-btn');
        const originalHTML = btn.innerHTML;
        
        try {
            btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
            btn.disabled = true;
            
            // Recarregar dados dos gráficos de metas
            await fetchAndRenderGoalsChart();
            
            showNotification('🎯 Gráfico de orçamento atualizado!', 'success');
        } catch (error) {
            console.error('Erro ao atualizar gráfico:', error);
            showNotification('❌ Erro ao atualizar gráfico', 'error');
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }

    // Função para atualizar gráfico de distribuição
    async function refreshDistributionChart() {
        const btn = document.getElementById('refresh-distribution-btn');
        const originalHTML = btn.innerHTML;
        
        try {
            btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
            btn.disabled = true;
            
            // Recarregar dados do gráfico de distribuição por plano
            await fetchAndRenderGoalsPlanChart();
            
            showNotification('📊 Gráfico de distribuição atualizado!', 'success');
        } catch (error) {
            console.error('Erro ao atualizar gráfico:', error);
            showNotification('❌ Erro ao atualizar gráfico', 'error');
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }

    // Função para exportar gráfico como imagem
    function exportChartAsImage(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            showNotification('❌ Gráfico não encontrado', 'error');
            return;
        }

        try {
            // Criar um link temporário para download
            const link = document.createElement('a');
            link.download = `grafico_${canvasId}_${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            
            // Simular clique para baixar
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showNotification('📸 Gráfico exportado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao exportar gráfico:', error);
            showNotification('❌ Erro ao exportar gráfico', 'error');
        }
    }

    // Função para exportar análise de categoria
    async function exportCategoryAnalysis() {
        try {
            console.log('📤 Iniciando exportação da análise por categoria...');
            
            // Buscar dados atuais
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses`);
            if (!response.ok) {
                throw new Error('Erro ao buscar dados para exportação');
            }

            const expenses = await response.json();
            if (!expenses || expenses.length === 0) {
                showNotification('⚠️ Nenhum dado disponível para exportação', 'warning');
                return;
            }

            // Processar dados para análise
            const planTotals = {};
            let totalGeral = 0;
            
            expenses.forEach(expense => {
                const planCode = expense.account_plan_code || 'Sem Categoria';
                const amount = parseFloat(expense.amount) || 0;
                totalGeral += amount;
                
                if (!planTotals[planCode]) {
                    planTotals[planCode] = {
                        total: 0,
                        count: 0,
                        expenses: []
                    };
                }
                
                planTotals[planCode].total += amount;
                planTotals[planCode].count += 1;
                planTotals[planCode].expenses.push(expense);
            });
            
            // Ordenar por valor
            const sortedCategories = Object.entries(planTotals)
                .map(([planCode, data]) => ({
                    planCode,
                    total: data.total,
                    count: data.count,
                    percentage: totalGeral > 0 ? (data.total / totalGeral * 100) : 0,
                    expenses: data.expenses
                }))
                .sort((a, b) => b.total - a.total);

            // Criar conteúdo CSV
            let csvContent = 'Plano de Conta,Total (R$),Quantidade,Percentual (%),Média por Gasto (R$)\n';
            
            sortedCategories.forEach(category => {
                const avgPerExpense = category.count > 0 ? (category.total / category.count) : 0;
                csvContent += `"${category.planCode}",${category.total.toFixed(2)},${category.count},${category.percentage.toFixed(2)},${avgPerExpense.toFixed(2)}\n`;
            });
            
            // Adicionar resumo final
            csvContent += '\nResumo Geral\n';
            csvContent += `Total de Categorias,${sortedCategories.length}\n`;
            csvContent += `Total de Gastos,${expenses.length}\n`;
            csvContent += `Valor Total,${totalGeral.toFixed(2)}\n`;
            csvContent += `Média por Categoria,${(totalGeral / sortedCategories.length).toFixed(2)}\n`;
            csvContent += `Data de Exportação,${new Date().toLocaleString('pt-BR')}\n`;

            // Criar e baixar arquivo
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `analise_categoria_${new Date().toISOString().split('T')[0]}.csv`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showNotification('📊 Análise por categoria exportada com sucesso!', 'success');
            
        } catch (error) {
            console.error('❌ Erro ao exportar análise por categoria:', error);
            showNotification('❌ Erro ao exportar dados de categoria', 'error');
        }
    }

    // Função para trocar abas principais
    function switchMainTab(tabName) {
        // Remover classe active de todos os botões
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active', 'bg-blue-500', 'text-white');
            btn.classList.add('hover:bg-gray-50');
        });
        
        // Adicionar classe active ao botão clicado
        const activeBtn = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.remove('hover:bg-gray-50');
            activeBtn.classList.add('active', 'bg-blue-500', 'text-white');
        }
        
        // Ocultar todas as abas
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        // Mostrar aba ativa
        const activeContent = document.getElementById(`${tabName}-tab`);
        if (activeContent) {
            activeContent.classList.remove('hidden');
            
            // Carregar dados específicos da aba se necessário
            if (tabName === 'business-analysis') {
                loadBusinessAnalysis();
            } else if (tabName === 'reports') {
                loadReportsData();
            } else if (tabName === 'pix-boleto') {
                console.log('🔄 Aba PIX-Boleto ativada, carregando dados...');
                // Forçar recarregamento dos dados PIX/Boleto
                loadPixBoletoData();
            }
        }
        
        console.log(`🔄 Aba principal trocada para: ${tabName}`);
    }

    function toggleTheme() {
        const isDark = document.body.classList.contains('dark-mode');
        setTheme(isDark ? 'light' : 'dark');
    }

    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

    // Aplica o tema salvo ao carregar
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') setTheme('dark');
    else setTheme('light');

    // ====== TIPPY TOOLTIP ======
    if (window.tippy) {
        tippy('#theme-toggle', { content: 'Alternar modo claro/escuro', placement: 'bottom' });
        tippy('#monthly-report-btn', { content: 'Gerar relatório mensal em PDF', placement: 'bottom' });
        tippy('#weekly-report-btn', { content: 'Baixar relatório semanal em PDF', placement: 'bottom' });
        tippy('#logout-button', { content: 'Sair do sistema', placement: 'bottom' });
    }

    // ====== SWEETALERT2 PARA NOTIFICAÇÕES ======
    function showNotification(message, type = 'info', duration = 4000) {
        // Controlar número máximo de notificações simultâneas
        const maxNotifications = 3;
        const existingToasts = document.querySelectorAll('.notification-toast').length;
        
        if (existingToasts >= maxNotifications) {
            // Remover a mais antiga se exceder o limite
            const oldestToast = document.querySelector('.notification-toast');
            if (oldestToast) {
                oldestToast.remove();
            }
        }
        
        if (window.Swal && type !== 'info') {
            // Usar SweetAlert2 para alertas importantes (warning/error)
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info',
                title: message,
                showConfirmButton: false,
                timer: duration,
                timerProgressBar: true,
                customClass: {
                    popup: 'notification-toast'
                }
            });
        } else {
            // Usar toast customizado para info e fallback
            createCustomToast(message, type, duration);
        }
    }

    function createCustomToast(message, type, duration) {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            // Criar container de toast se não existir
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed top-4 right-4 z-50 space-y-2';
            document.body.appendChild(toastContainer);
        }
        
        const toast = document.createElement('div');
        toast.className = `notification-toast px-4 py-3 rounded-lg shadow-lg text-white mb-2 animate-fade-in max-w-sm transform transition-all duration-300 ${
            type === 'error' ? 'bg-red-600' : 
            type === 'success' ? 'bg-green-600' : 
            type === 'warning' ? 'bg-yellow-600' :
            'bg-blue-600'
        }`;
        
        // Adicionar ícone baseado no tipo
        const icon = type === 'error' ? '❌' : 
                    type === 'success' ? '✅' : 
                    type === 'warning' ? '⚠️' : 'ℹ️';
        
        toast.innerHTML = `
            <div class="flex items-start space-x-2">
                <span class="text-lg">${icon}</span>
                <div class="flex-1">
                    <p class="text-sm font-medium">${message}</p>
                </div>
                <button class="text-white hover:text-gray-200 font-bold" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remover após duração especificada
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('opacity-0', 'scale-95');
                setTimeout(() => {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, 300);
            }
        }, duration);
    }

    // Processar e exibir alertas de limites de gastos de forma inteligente
    function processLimitAlerts(data) {
        const currentDate = new Date();
        const currentPeriod = `${filterYear.value}-${filterMonth.value}`;
        const alerts = [];
        
        data.forEach(item => {
            if (item.Alerta) {
                const alertKey = `alerta_${item.PlanoContasID}_${item.Alerta.percentual}_${currentPeriod}`;
                const lastShown = sessionStorage.getItem(`${alertKey}_timestamp`);
                const lastShownDate = lastShown ? new Date(parseInt(lastShown)) : null;
                
                // Exibir alerta se:
                // 1. Nunca foi exibido para este período
                // 2. Ou se foi exibido há mais de 24 horas
                const shouldShow = !lastShown || 
                    (lastShownDate && (currentDate.getTime() - lastShownDate.getTime()) > 24 * 60 * 60 * 1000);
                
                if (shouldShow) {
                    alerts.push({
                        planoId: item.PlanoContasID,
                        percentual: item.Alerta.percentual,
                        mensagem: item.Alerta.mensagem,
                        valor: item.Total,
                        limite: item.Teto,
                        alertKey: alertKey
                    });
                }
            }
        });
        
        // Exibir alertas de forma escalonada (não todos de uma vez)
        if (alerts.length > 0) {
            showLimitAlertsSequentially(alerts);
        }
    }

    // Exibir alertas de forma sequencial para não sobrecarregar o usuário
    async function showLimitAlertsSequentially(alerts) {
        for (let i = 0; i < alerts.length; i++) {
            const alert = alerts[i];
            
            // Determinar tipo de alerta baseado no percentual
            let alertType = 'warning';
            let icon = '⚠️';
            if (alert.percentual >= 90) {
                alertType = 'error';
                icon = '🚨';
            } else if (alert.percentual >= 75) {
                alertType = 'warning';
                icon = '⚠️';
            } else {
                alertType = 'info';
                icon = '💡';
            }
            
            // Melhorar a mensagem do alerta
            const valor = parseFloat(alert.valor) || 0;
            const limite = parseFloat(alert.limite) || 0;
            const improvedMessage = `${icon} Plano ${alert.planoId}: ${alert.percentual}% do limite atingido (${formatCurrency(valor)} de ${formatCurrency(limite)})`;
            
            showNotification(improvedMessage, alertType);
            
            // Marcar como exibido
            sessionStorage.setItem(`${alert.alertKey}_timestamp`, Date.now().toString());
            
            // Pequeno delay entre alertas (apenas se houver múltiplos)
            if (i < alerts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }

    /**
     * Processa gastos para classificação automática como empresariais quando sem categoria
     */
    function processExpenseClassification(expenses) {
        let gastosSemCategoria = 0;
        
        const processedExpenses = expenses.map(expense => {
            // Se o gasto não tem plano de conta definido (categoria), marca como empresarial
            if (!expense.account_plan_code || 
                expense.account_plan_code === null || 
                expense.account_plan_code === undefined || 
                expense.account_plan_code === '') {
                
                gastosSemCategoria++;
                console.log(`📋 Gasto sem categoria detectado, classificando como empresarial: ${expense.description}`);
                
                return {
                    ...expense,
                    is_business_expense: true,
                    account_plan_code: null // Manter como null para identificar que precisa de categoria
                };
            }
            
            return expense;
        });
        
        // Mostrar notificação sobre gastos reclassificados
        if (gastosSemCategoria > 0) {
            showNotification(
                `📋 ${gastosSemCategoria} gasto(s) sem categoria foram automaticamente classificados como empresariais. Considere definir planos de contas para melhor organização.`,
                'info',
                8000
            );
        }
        
        return processedExpenses;
    }

    async function fetchAndRenderExpenses() {
        try {
            if (!checkAuthentication()) return;

            const params = new URLSearchParams({
                year: filterYear.value,
                month: filterMonth.value,
                account: document.getElementById('filter-account')?.value || ''
            });

            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses?${params.toString()}`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar despesas.');
            }

            const expenses = await response.json();
            
            // Processar gastos para classificação automática
            const processedExpenses = processExpenseClassification(expenses);
            
            allExpensesCache = processedExpenses; // Salva para filtros
            applyAllFilters(); // Aplica filtros após buscar
        } catch (error) {
            console.error(error);
            showNotification('Erro ao carregar despesas', 'error');
        }
    }

    // FILTRO DE BUSCA NO HISTÓRICO (todas as colunas + tipo + valor min/max + plano de conta)
    function applyAllFilters() {
        let filtered = allExpensesCache;
        const search = filterSearchInput?.value.trim().toLowerCase() || '';
        const type = filterType?.value || '';
        const min = filterMin?.value ? parseFloat(filterMin.value) : null;
        const max = filterMax?.value ? parseFloat(filterMax.value) : null;
        const plan = filterPlan?.value.trim().toLowerCase() || '';
        const filterAccountValue = document.getElementById('filter-account')?.value || '';

        // Contador de filtros ativos
        let activeFilters = [];

        filtered = filtered.filter(e => {
            // Busca texto em todas as colunas
            const data = e.transaction_date ? new Date(e.transaction_date).toLocaleDateString('pt-BR', {timeZone: 'UTC'}).toLowerCase() : '';
            const descricao = e.description ? e.description.toLowerCase() : '';
            const valor = e.amount ? String(e.amount).toLowerCase() : '';
            const conta = e.account ? e.account.toLowerCase() : '';
            const tipo = e.is_business_expense ? 'empresa' : 'pessoal';
            const plano = e.account_plan_code ? String(e.account_plan_code).toLowerCase() : '';
            const nota = e.invoice_path ? 'sim' : 'não';
            
            let match = true;
            
            // Filtro de busca textual mais inteligente
            if (search) {
                const searchTerms = search.split(' ').filter(term => term.length > 0);
                const searchMatch = searchTerms.every(term => 
                    data.includes(term) ||
                    descricao.includes(term) ||
                    valor.includes(term) ||
                    conta.includes(term) ||
                    tipo.includes(term) ||
                    plano.includes(term) ||
                    nota.includes(term) ||
                    // Busca por palavras-chave especiais
                    (term === 'empresarial' && e.is_business_expense) ||
                    (term === 'empresa' && e.is_business_expense) ||
                    (term === 'pessoal' && !e.is_business_expense) ||
                    (term === 'com-nota' && e.invoice_path) ||
                    (term === 'sem-nota' && !e.invoice_path) ||
                    (term === 'sem-categoria' && (!e.account_plan_code || e.account_plan_code === '')) ||
                    (term === 'com-categoria' && e.account_plan_code && e.account_plan_code !== '')
                );
                if (!searchMatch) match = false;
            }
            
            // Filtro de tipo
            if (type && tipo !== type) match = false;
            
            // Filtro de valor mínimo
            if (min !== null && parseFloat(e.amount) < min) match = false;
            
            // Filtro de valor máximo
            if (max !== null && parseFloat(e.amount) > max) match = false;
            
            // Filtro de plano de conta (suporta múltiplos valores separados por vírgula)
            if (plan) {
                const planNumbers = plan.split(',').map(p => p.trim()).filter(p => p);
                const matchesPlan = planNumbers.some(planNum => plano.includes(planNum));
                if (!matchesPlan) match = false;
            }
            
            // Filtro de conta
            if (filterAccountValue && e.account !== filterAccountValue) match = false;
            
            return match;
        });

        // Atualizar indicadores de filtros ativos
        updateActiveFiltersDisplay(search, type, min, max, plan, filterAccountValue);
        
        // Renderizar tabela com resultados filtrados
        renderExpensesTable(filtered);
        
        // Mostrar estatísticas dos resultados
        showFilterStats(filtered);
    }

    // Função para exibir indicadores visuais dos filtros ativos
    function updateActiveFiltersDisplay(search, type, min, max, plan, account) {
        const activeFiltersContainer = document.getElementById('active-filters');
        const filterTagsContainer = document.getElementById('filter-tags');
        
        if (!activeFiltersContainer || !filterTagsContainer) return;
        
        const filters = [];
        
        if (search) filters.push(`Busca: "${search}"`);
        if (type) filters.push(`Tipo: ${type === 'empresa' ? 'Empresarial' : 'Pessoal'}`);
        if (min !== null) filters.push(`Min: R$ ${min.toFixed(2)}`);
        if (max !== null) filters.push(`Max: R$ ${max.toFixed(2)}`);
        if (plan) filters.push(`Plano: ${plan}`);
        if (account) filters.push(`Conta: ${account}`);
        
        if (filters.length > 0) {
            activeFiltersContainer.classList.remove('hidden');
            filterTagsContainer.innerHTML = filters.map(filter => 
                `<span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">${filter}</span>`
            ).join('');
        } else {
            activeFiltersContainer.classList.add('hidden');
        }
    }

    // Função para mostrar estatísticas dos resultados filtrados
    function showFilterStats(filteredData) {
        if (filteredData.length === 0) return;
        
        const total = filteredData.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        const empresariais = filteredData.filter(e => e.is_business_expense).length;
        const pessoais = filteredData.filter(e => !e.is_business_expense).length;
        const comNota = filteredData.filter(e => e.invoice_path).length;
        
        const statsMessage = `
            📊 Resultados: ${filteredData.length} gastos | 
            💰 Total: R$ ${total.toFixed(2)} | 
            🏢 Empresarial: ${empresariais} | 
            👤 Pessoal: ${pessoais} | 
            📄 Com nota: ${comNota}
        `;
        
        // Atualizar ou criar elemento de estatísticas
        let statsElement = document.getElementById('filter-stats');
        if (!statsElement) {
            statsElement = document.createElement('div');
            statsElement.id = 'filter-stats';
            statsElement.className = 'bg-gray-50 border rounded-lg p-2 mb-4 text-sm text-gray-600';
            const tableContainer = document.querySelector('.overflow-x-auto');
            if (tableContainer) {
                tableContainer.parentNode.insertBefore(statsElement, tableContainer);
            }
        }
        
        if (filteredData.length < allExpensesCache.length) {
            statsElement.textContent = statsMessage;
            statsElement.classList.remove('hidden');
        } else {
            statsElement.classList.add('hidden');
        }
    }

    // Função para limpar todos os filtros
    function clearAllFilters() {
        if (filterSearchInput) filterSearchInput.value = '';
        if (filterType) filterType.value = '';
        if (filterMin) filterMin.value = '';
        if (filterMax) filterMax.value = '';
        if (filterPlan) filterPlan.value = '';
        const filterAccount = document.getElementById('filter-account');
        if (filterAccount) filterAccount.value = '';
        
        applyAllFilters();
        showNotification('Todos os filtros foram removidos', 'info', 2000);
    }

    // Event listeners para filtros
    if (filterSearchInput) filterSearchInput.addEventListener('input', applyAllFilters);
    if (filterType) filterType.addEventListener('change', applyAllFilters);
    if (filterMin) filterMin.addEventListener('input', applyAllFilters);
    if (filterMax) filterMax.addEventListener('input', applyAllFilters);
    if (filterPlan) filterPlan.addEventListener('input', applyAllFilters);

    // Event listener para limpar filtros
    const clearFiltersBtn = document.getElementById('clear-filters');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearAllFilters);
    }

    // Função para alternar exibição da ajuda de busca
    window.toggleSearchHelp = function() {
        const helpElement = document.getElementById('search-help');
        if (helpElement) {
            helpElement.classList.toggle('hidden');
        }
    };

    async function fetchAndRenderDashboardMetrics() {
        try {
            if (!checkAuthentication()) return;

            const params = new URLSearchParams({ year: filterYear.value, month: filterMonth.value });
            
            const response = await authenticatedFetch(`${API_BASE_URL}/api/dashboard?${params}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar métricas do dashboard.');
            }
            
            const data = await response.json();

            if (projectionEl) {
                projectionEl.textContent = `R$ ${data.projection?.nextMonthEstimate || '0.00'}`;
            }

            // Limpar gráficos existentes antes de renderizar novos
            console.log('🔄 Atualizando gráficos do dashboard...');

            renderLineChart(data.lineChartData);
            renderPieChart(data.pieChartData);
            renderMixedTypeChart(data.mixedTypeChartData);
            
            // Debug para verificar se o gráfico de categoria está sendo renderizado
            console.log('📊 Dados do gráfico de categoria:', data.planChartData);
            renderPlanChart(data.planChartData);

        } catch (error) {
            console.error('Erro ao buscar métricas do dashboard:', error);
            showNotification('Erro ao carregar métricas', 'error');
        }
    }

    function renderExpensesTable(expenses = []) {
        if (!expensesTableBody) return;
        expensesTableBody.innerHTML = '';
        let totalSpent = 0;
        
        if (expenses.length > 0) {
            expenses.forEach(expense => {
                totalSpent += parseFloat(expense.amount);
                const invoiceLink = expense.invoice_path ? 
                    `<button onclick="downloadInvoice(${expense.id})" class="text-blue-600 hover:text-blue-800" title="Baixar fatura">
                        <i class="fas fa-file-invoice"></i>
                    </button>` : '<span class="text-gray-400">N/A</span>';
                
                // Melhor tratamento do plano de conta
                let planCode = '';
                let planStatus = '';
                let rowClass = 'border-b hover:bg-gray-50';
                
                // Destaque especial para conta unificada PIX/Boleto
                if (expense.account === 'PIX/Boleto') {
                    rowClass = 'border-b hover:bg-cyan-50 border-l-4 border-l-cyan-400';
                }
                
                if (expense.account_plan_code !== null && expense.account_plan_code !== undefined && expense.account_plan_code !== '') {
                    planCode = `<span class="bg-gray-100 text-gray-800 px-2 py-1 rounded font-mono text-sm">${expense.account_plan_code}</span>`;
                } else {
                    if (expense.is_business_expense) {
                        planCode = '<span class="text-orange-600 font-semibold">Sem Categoria</span>';
                        planStatus = '<span class="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">🤖 Auto-classificado</span>';
                        // Manter o destaque de PIX/Boleto mesmo com categoria em falta
                        if (expense.account !== 'PIX/Boleto') {
                            rowClass = 'border-b hover:bg-orange-50 bg-orange-25';
                        }
                    } else {
                        planCode = '<span class="text-gray-400">-</span>';
                    }
                }
                
                // Badge do tipo de gasto mais informativo
                const tipoGasto = expense.is_business_expense ? 
                    '<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-semibold flex items-center"><i class="fas fa-building mr-1"></i>Empresa</span>' : 
                    '<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-semibold flex items-center"><i class="fas fa-user mr-1"></i>Pessoal</span>';
                
                // Valor com indicador visual baseado no valor
                const valorClass = parseFloat(expense.amount) > 1000 ? 'text-red-700 font-bold' : 'text-red-600 font-semibold';
                
                const row = document.createElement('tr');
                row.className = rowClass;
                row.innerHTML = `
                    <td class="p-3 text-sm">${new Date(expense.transaction_date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</td>
                    <td class="p-3">
                        <div class="font-medium">${expense.description}</div>
                        ${planStatus ? `<div class="mt-1">${planStatus}</div>` : ''}
                    </td>
                    <td class="p-3 ${valorClass}">R$ ${parseFloat(expense.amount).toFixed(2)}</td>
                    <td class="p-3 text-sm">
                        <span class="px-2 py-1 rounded text-xs font-medium ${
                            expense.account === 'PIX/Boleto' ? 'bg-cyan-100 text-cyan-800 border border-cyan-200' :
                            'bg-gray-50 text-gray-700'
                        }">
                            ${getPaymentTypeIcon(expense.account)} ${expense.account}
                        </span>
                    </td>
                    <td class="p-3">${tipoGasto}</td>
                    <td class="p-3">${planCode}</td>
                    <td class="p-3 text-center">${invoiceLink}</td>
                    <td class="p-3">
                        <div class="flex gap-1">
                            <button class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 edit-btn" data-id="${expense.id}" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 delete-btn" data-id="${expense.id}" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                expensesTableBody.appendChild(row);
            });
            
            // Mostrar estatísticas resumidas após a tabela
            displayTableSummary(expenses, totalSpent);
            
        } else {
            expensesTableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center p-8 text-gray-500">
                        <i class="fas fa-search text-4xl mb-4"></i>
                        <div class="text-lg font-medium">Nenhuma despesa encontrada</div>
                        <div class="text-sm">Tente ajustar os filtros de busca</div>
                    </td>
                </tr>`;
        }
        
        if (totalSpentEl) totalSpentEl.textContent = `R$ ${totalSpent.toFixed(2)}`;
        if (totalTransactionsEl) totalTransactionsEl.textContent = expenses.length;
    }

    // Função para exibir resumo da tabela
    function displayTableSummary(expenses, totalSpent) {
        const empresariais = expenses.filter(e => e.is_business_expense);
        const pessoais = expenses.filter(e => !e.is_business_expense);
        const semCategoria = expenses.filter(e => e.is_business_expense && (!e.account_plan_code || e.account_plan_code === ''));
        const comNota = expenses.filter(e => e.invoice_path);
        
        // Estatísticas unificadas para PIX/Boleto
        const pixBoletoExpenses = expenses.filter(e => (e.account || '').toUpperCase() === 'PIX/BOLETO');
        const totalPixBoleto = pixBoletoExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        
        const totalEmpresarial = empresariais.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const totalPessoal = pessoais.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        
        // Criar ou atualizar elemento de resumo da tabela
        let summaryElement = document.getElementById('table-summary');
        if (!summaryElement) {
            summaryElement = document.createElement('div');
            summaryElement.id = 'table-summary';
            summaryElement.className = 'mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 bg-gray-50 rounded-lg border';
            
            const tableContainer = document.querySelector('.overflow-x-auto');
            if (tableContainer && tableContainer.parentNode) {
                tableContainer.parentNode.insertBefore(summaryElement, tableContainer.nextSibling);
            }
        }
        
        summaryElement.innerHTML = `
            <div class="text-center">
                <div class="text-sm text-gray-600">Total Empresarial</div>
                <div class="text-lg font-bold text-blue-600">R$ ${totalEmpresarial.toFixed(2)}</div>
                <div class="text-xs text-gray-500">${empresariais.length} gastos</div>
            </div>
            <div class="text-center">
                <div class="text-sm text-gray-600">Total Pessoal</div>
                <div class="text-lg font-bold text-green-600">R$ ${totalPessoal.toFixed(2)}</div>
                <div class="text-xs text-gray-500">${pessoais.length} gastos</div>
            </div>
            <div class="text-center border-l-4 border-l-cyan-400 bg-cyan-50">
                <div class="text-sm text-cyan-700 font-medium">💳 PIX/Boleto</div>
                <div class="text-lg font-bold text-cyan-800">R$ ${totalPixBoleto.toFixed(2)}</div>
                <div class="text-xs text-cyan-600">${pixBoletoExpenses.length} transações</div>
            </div>
            <div class="text-center">
                <div class="text-sm text-gray-600">Sem Categoria</div>
                <div class="text-lg font-bold text-orange-600">${semCategoria.length}</div>
                <div class="text-xs text-gray-500">Auto-classificados</div>
            </div>
            <div class="text-center">
                <div class="text-sm text-gray-600">Com Nota Fiscal</div>
                <div class="text-lg font-bold text-purple-600">${comNota.length}</div>
                <div class="text-xs text-gray-500">${((comNota.length / expenses.length) * 100).toFixed(1)}% do total</div>
            </div>
        `;
    }

    // Função utilitária para obter cor do tema
    function getThemeColor(light, dark) {
        return document.body.classList.contains('dark-mode') ? dark : light;
    }

    // Função para exibir mensagem amigável quando não há dados
    function showNoDataMessage(canvasId, message) {
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '16px Arial';
            ctx.fillStyle = getThemeColor('#222', '#fff');
            ctx.textAlign = 'center';
            ctx.fillText(message, canvas.width / 2, canvas.height / 2);
        }
    }

    function getNumberValue(v) {
        if (typeof v === 'number') return v;
        if (v && typeof v === 'object') {
            if ('y' in v && typeof v.y === 'number') return v.y;
            if ('x' in v && typeof v.x === 'number') return v.x;
        }
        return 0;
    }

    /**
     * Renderiza gráfico de linha da evolução diária dos gastos
     */
    function renderLineChart(data = []) {
        const chartKey = 'expensesLineChart';
        const canvasId = 'expenses-line-chart';
        
        if (!isChartJsLoaded()) {
            console.error('❌ Chart.js não disponível para renderLineChart');
            displayChartFallback(canvasId, 'Chart.js não carregado');
            return;
        }

        const year = parseInt(filterYear.value, 10);
        const month = parseInt(filterMonth.value, 10);
        const daysInMonth = new Date(year, month, 0).getDate();
        const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
        const chartData = new Array(daysInMonth).fill(0);
        
        if (!data || data.length === 0) {
            displayChartFallback(canvasId, 'Sem dados para este período');
            return;
        }
        
        // Processar dados diários
        data.forEach(d => { 
            if (d.day && d.day <= daysInMonth) {
                chartData[d.day - 1] = d.total || 0; 
            }
        });
        
        if (chartData.every(v => v === 0)) {
            displayChartFallback(canvasId, 'Sem gastos registrados neste período');
            return;
        }

        try {
            const max = Math.max(...chartData);
            const min = Math.min(...chartData.filter(v => v > 0));
            const monthName = filterMonth.options[filterMonth.selectedIndex].text;

            const config = {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `Gastos Diários - ${monthName}/${year}`,
                        data: chartData,
                        borderColor: 'rgba(59, 130, 246, 1)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        tension: 0.3,
                        fill: true,
                        showValues: CHART_CONFIG.showValues,  // ✅ Usar configuração global
                        valueColor: CHART_CONFIG.valueColor,
                        valueFont: CHART_CONFIG.valueFont,
                        pointBackgroundColor: chartData.map(v => {
                            if (v === max) return '#22c55e';
                            if (v === min && v > 0) return '#ef4444';
                            return 'rgba(59, 130, 246, 1)';
                        }),
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: chartData.map(v => (v === max || (v === min && v > 0)) ? 6 : 4),
                        pointHoverRadius: 8
                    }]
                },
                options: mergeChartOptions({
                    plugins: {
                        title: {
                            display: true,
                            text: `Evolução dos Gastos Diários - ${monthName}/${year}`
                        },
                        subtitle: {
                            display: true,
                            text: `📈 Maior: R$ ${max.toFixed(2)} | 📉 Menor: R$ ${min ? min.toFixed(2) : '0,00'}`
                        },
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    return `Dia ${context[0].label} de ${monthName}`;
                                },
                                label: function(context) {
                                    return `Gastos: R$ ${context.parsed.y.toFixed(2)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Dia do Mês'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Valor (R$)'
                            }
                        }
                    }
                })
            };

            createChart(chartKey, canvasId, config);

        } catch (error) {
            console.error('❌ Erro ao renderizar Line Chart:', error);
            displayChartFallback(canvasId, 'Erro ao carregar gráfico de linha');
        }
    }

    /**
     * Renderiza gráfico de pizza da distribuição por conta
     */
    function renderPieChart(data = []) {
        const chartKey = 'expensesPieChart';
        const canvasId = 'expenses-pie-chart';
        
        if (!isChartJsLoaded()) {
            console.error('❌ Chart.js não disponível para renderPieChart');
            displayChartFallback(canvasId, 'Chart.js não carregado');
            return;
        }
        
        if (!data || data.length === 0) {
            displayChartFallback(canvasId, 'Sem dados para este período');
            return;
        }

        try {
            const total = data.reduce((sum, d) => sum + (parseFloat(d.total) || 0), 0);
            
            if (total === 0) {
                displayChartFallback(canvasId, 'Nenhum gasto registrado');
                return;
            }

            // Gerar cores personalizadas baseadas no tipo de conta
            const accounts = data.map(d => d.account || 'Conta não especificada');
            const backgroundColors = accounts.map(account => getPaymentTypeColor(account, 0.8));
            const borderColors = accounts.map(account => getPaymentTypeColor(account, 1));
            
            // Adicionar ícones aos labels
            const enhancedLabels = accounts.map(account => {
                const icon = getPaymentTypeIcon(account);
                return `${icon} ${account}`;
            });

            const chartData = {
                labels: enhancedLabels,
                datasets: [{
                    data: data.map(d => parseFloat(d.total) || 0),
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 2,
                    hoverBorderWidth: 3,
                    hoverOffset: 10,
                    showValues: CHART_CONFIG.showValues,  // ✅ Usar configuração global
                    valueColor: CHART_CONFIG.piValueColor,
                    valueFont: CHART_CONFIG.valueFont,
                    // Efeito especial para PIX e Boleto
                    hoverBackgroundColor: accounts.map(account => {
                        if (account === 'PIX/Boleto') return 'rgba(56,189,248,1)';
                        return getPaymentTypeColor(account, 1);
                    })
                }]
            };

            const options = mergeChartOptions({
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribuição de Gastos por Conta'
                    },
                    subtitle: {
                        display: true,
                        text: `💰 Total Geral: R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            usePointStyle: true,
                            font: {
                                size: 11
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: function(context) {
                                const value = context.parsed;
                                const percentage = ((value / total) * 100).toFixed(1);
                                return [
                                    `Valor: R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
                                    `Percentual: ${percentage}%`
                                ];
                            }
                        }
                    }
                },
                scales: {} // Remove scales for pie chart
            });

            createChart(chartKey, canvasId, {
                type: 'pie',
                data: chartData,
                options: options
            });

        } catch (error) {
            console.error('❌ Erro ao renderizar Pie Chart:', error);
            displayChartFallback(canvasId, 'Erro ao carregar gráfico de pizza');
        }
    }

    // Função auxiliar para renderização segura de gráficos
    function safeRenderChart(canvasId, renderFunction, data, fallbackMessage = 'Sem dados disponíveis') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`Canvas ${canvasId} não encontrado`);
            return false;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        
        if (!isChartJsLoaded()) {
            console.error(`Chart.js não está carregado para ${canvasId}`);
            showNoDataMessage(canvasId, 'Biblioteca de gráficos não carregada');
            return false;
        }
        
        if (!data || (Array.isArray(data) && data.length === 0)) {
            showNoDataMessage(canvasId, fallbackMessage);
            return false;
        }
        
        try {
            return renderFunction(canvas, ctx, data);
        } catch (error) {
            console.error(`Erro ao criar gráfico ${canvasId}:`, error);
            showNoDataMessage(canvasId, 'Erro ao carregar gráfico');
            return false;
        }
    }

    function renderMixedTypeChart(data = []) {
        const canvasId = 'mixed-type-chart';
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`Canvas ${canvasId} não encontrado`);
            return false;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        
        if (!isChartJsLoaded()) {
            console.error(`Chart.js não está carregado para ${canvasId}`);
            return false;
        }
        
        if (!data || data.length === 0) {
            console.log('❌ Sem dados para o gráfico mixed-type-chart');
            return false;
        }

        try {
            destroyChart('mixedTypeChart');
            
            console.log('📊 Renderizando gráfico de comparação pessoal vs empresarial:', data);
            
            // Filtrar contas que têm pelo menos um valor > 0
            const filteredData = data.filter(d => 
                (d.personal_total > 0 || d.business_total > 0)
            );

            if (filteredData.length === 0) {
                console.log('❌ Nenhuma conta com gastos para exibir');
                return false;
            }

            const accounts = filteredData.map(d => d.account);
            const personalData = filteredData.map(d => parseFloat(d.personal_total) || 0);
            const businessData = filteredData.map(d => parseFloat(d.business_total) || 0);
            
            // Gerar cores personalizadas para cada conta
            const personalColors = accounts.map(account => {
                // Cores mais claras para gastos pessoais
                if (account === 'PIX/Boleto') return 'rgba(56,189,248,0.6)';
                return getPaymentTypeColor(account, 0.6);
            });
            
            const businessColors = accounts.map(account => {
                // Cores mais escuras para gastos empresariais
                if (account === 'PIX/Boleto') return 'rgba(56,189,248,0.9)';
                return getPaymentTypeColor(account, 0.9);
            });
            
            // Adicionar ícones aos labels
            const enhancedLabels = accounts.map(account => {
                const icon = getPaymentTypeIcon(account);
                return `${icon} ${account}`;
            });
            
            const max = Math.max(...filteredData.map(d => 
                (parseFloat(d.personal_total) || 0) + (parseFloat(d.business_total) || 0)
            ));
            const maxAccount = filteredData.find(d => 
                (parseFloat(d.personal_total) || 0) + (parseFloat(d.business_total) || 0) === max
            )?.account || '-';

            chartRegistry.mixedTypeChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: enhancedLabels,
                    datasets: [
                        {
                            label: '🏠 Gastos Pessoais',
                            data: personalData,
                            backgroundColor: personalColors,
                            borderColor: personalColors.map(color => color.replace('0.6', '1')),
                            borderWidth: 2,
                            // Efeito hover personalizado
                            hoverBackgroundColor: personalColors.map(color => color.replace('0.6', '0.8'))
                        },
                        {
                            label: '💼 Gastos Empresariais',
                            data: businessData,
                            backgroundColor: businessColors,
                            borderColor: businessColors.map(color => color.replace('0.9', '1')),
                            borderWidth: 2,
                            // Efeito hover personalizado
                            hoverBackgroundColor: businessColors.map(color => color.replace('0.9', '1'))
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: '🏠 vs. 💼 Comparação: Pessoal vs. Empresarial por Conta',
                            color: getThemeColor('#374151', '#f9fafb'),
                            font: { size: 16, weight: 'bold' }
                        },
                        subtitle: {
                            display: true,
                            text: `Conta com maior gasto total: ${maxAccount} (R$ ${max.toFixed(2)})`,
                            color: getThemeColor('#6b7280', '#d1d5db'),
                            font: { size: 12 }
                        },
                        legend: {
                            position: 'bottom',
                            labels: { 
                                color: getThemeColor('#374151', '#f9fafb'),
                                usePointStyle: true,
                                padding: 20
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            borderColor: '#374151',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    const value = context.parsed.y;
                                    const total = personalData[context.dataIndex] + businessData[context.dataIndex];
                                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                                    return `${context.dataset.label}: R$ ${value.toFixed(2)} (${percentage}%)`;
                                },
                                footer: function(context) {
                                    if (context.length > 0) {
                                        const index = context[0].dataIndex;
                                        const total = personalData[index] + businessData[index];
                                        return `Total da conta: R$ ${total.toFixed(2)}`;
                                    }
                                    return '';
                                }
                            }
                        },
                        datalabels: {
                            display: function(context) {
                                return context.parsed && context.parsed.y && context.parsed.y > 0;
                            },
                            color: '#374151',
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 10 },
                            formatter: function(value, context) {
                                if (!value || value <= 0) return '';
                                return `R$ ${value.toFixed(0)}`;
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: false,
                            ticks: {
                                color: getThemeColor('#6b7280', '#d1d5db'),
                                maxRotation: 45,
                                minRotation: 0
                            },
                            grid: {
                                color: getThemeColor('#e5e7eb', '#374151')
                            }
                        },
                        y: {
                            beginAtZero: true,
                            stacked: false,
                            ticks: {
                                color: getThemeColor('#6b7280', '#d1d5db'),
                                callback: function(value) {
                                    return `R$ ${value.toFixed(0)}`;
                                }
                            },
                            grid: {
                                color: getThemeColor('#e5e7eb', '#374151')
                            }
                        }
                    },
                    interaction: {
                        mode: 'index',
                        intersect: false
                    }
                },
                plugins: [ChartDataLabels]
            });
            
            console.log('✅ Gráfico mixed-type-chart renderizado com sucesso');
            return true;
        } catch (error) {
            console.error('❌ Erro ao renderizar mixed-type-chart:', error);
            return false;
        }
    }

    // Função auxiliar para atualizar estatísticas da seção de categoria
    function updateCategoryStats(processedData) {
        if (!processedData || !Array.isArray(processedData) || processedData.length === 0) {
            // Limpar estatísticas se não há dados
            const totalCategoriesEl = document.getElementById('total-categories');
            const topCategoryEl = document.getElementById('top-category');
            const uncategorizedCountEl = document.getElementById('uncategorized-count');
            
            if (totalCategoriesEl) totalCategoriesEl.textContent = '0';
            if (topCategoryEl) topCategoryEl.textContent = '-';
            if (uncategorizedCountEl) uncategorizedCountEl.textContent = '0';
            return;
        }
        
        // Calcular estatísticas
        const totalCategories = processedData.length;
        const topCategory = processedData[0]; // Já está ordenado por valor
        const uncategorizedCategory = processedData.find(cat => 
            cat.account_plan_code === 'Sem Categoria' || 
            !cat.account_plan_code || 
            cat.account_plan_code === ''
        );
        const uncategorizedCount = uncategorizedCategory ? uncategorizedCategory.count : 0;
        
        // Atualizar elementos das estatísticas
        const totalCategoriesEl = document.getElementById('total-categories');
        const topCategoryEl = document.getElementById('top-category');
        const uncategorizedCountEl = document.getElementById('uncategorized-count');
        
        if (totalCategoriesEl) {
            totalCategoriesEl.textContent = totalCategories;
        }
        
        if (topCategoryEl && topCategory) {
            const categoryName = topCategory.account_plan_code || 'Sem nome';
            topCategoryEl.textContent = categoryName.length > 12 
                ? categoryName.substring(0, 12) + '...' 
                : categoryName;
            topCategoryEl.title = `${categoryName}: ${formatCurrency(topCategory.total)} (${topCategory.count} gastos)`;
        }
        
        if (uncategorizedCountEl) {
            uncategorizedCountEl.textContent = uncategorizedCount;
        }
        
        console.log('📊 Estatísticas de categoria atualizadas:', {
            totalCategories,
            topCategory: topCategory?.account_plan_code,
            uncategorizedCount
        });
    }

    function renderPlanChart(data = []) {
        console.log('🎯 DEBUG renderPlanChart - início:', { 
            dataRecebido: data, 
            tipoData: typeof data, 
            comprimentoData: Array.isArray(data) ? data.length : 'não é array'
        });
        
        const chartKey = 'planChart';
        const canvasId = 'plan-chart';
        
        if (!isChartJsLoaded()) {
            console.error('❌ Chart.js não disponível para renderPlanChart');
            displayChartFallback(canvasId, 'Chart.js não carregado');
            return;
        }
        
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`⚠️ Canvas ${canvasId} não encontrado`);
            return;
        }

        // Debug: verificar se o canvas está visível
        const canvasRect = canvas.getBoundingClientRect();
        console.log(`📊 Canvas ${canvasId} - visibilidade:`, {
            existe: !!canvas,
            width: canvasRect.width,
            height: canvasRect.height,
            visible: canvasRect.width > 0 && canvasRect.height > 0,
            parent: canvas.parentElement?.id || 'sem parent'
        });

        try {
            // Destruir gráfico existente
            destroyChart(chartKey);
            
            // Processar dados para criar análise por categoria/plano de conta
            let processedData = [];
            
            if (Array.isArray(data) && data.length > 0) {
                // Se data já é um array processado (vem do dashboard)
                if (data[0] && typeof data[0] === 'object' && 'account_plan_code' in data[0]) {
                    processedData = data;
                } else {
                    // Processar gastos brutos agrupando por plano de conta
                    const planTotals = {};
                    
                    data.forEach(expense => {
                        const planCode = expense.account_plan_code || 'Sem Categoria';
                        const amount = parseFloat(expense.amount) || 0;
                        
                        if (!planTotals[planCode]) {
                            planTotals[planCode] = {
                                account_plan_code: planCode,
                                total: 0,
                                count: 0
                            };
                        }
                        
                        planTotals[planCode].total += amount;
                        planTotals[planCode].count += 1;
                    });
                    
                    // Converter para array e ordenar por valor
                    processedData = Object.values(planTotals)
                        .sort((a, b) => b.total - a.total)
                        .slice(0, 15); // Limitar a 15 maiores
                }
            }
            
            if (processedData.length === 0) {
                updateCategoryStats([]); // Limpar estatísticas
                displayChartFallback(canvasId, 'Sem dados para este período');
                return;
            }
            
            // Atualizar estatísticas antes de renderizar o gráfico
            updateCategoryStats(processedData);
            
            console.log('📊 Dados processados para plan-chart:', processedData);
            
            const max = Math.max(...processedData.map(d => d.total));
            const labels = processedData.map(d => {
                const planCode = d.account_plan_code;
                if (planCode === 'Sem Categoria' || !planCode || planCode === '') {
                    return '🔸 Sem Categoria';
                }
                return `📋 Plano ${planCode}`;
            });
            
            const values = processedData.map(d => d.total);
            
            // Cores baseadas no valor (maior = verde, menores = gradiente)
            const colors = processedData.map(d => {
                if (d.total === max) return '#22c55e'; // Verde para maior
                if (d.account_plan_code === 'Sem Categoria') return '#f59e0b'; // Laranja para sem categoria
                const intensity = d.total / max;
                if (intensity > 0.7) return '#3b82f6'; // Azul forte
                if (intensity > 0.4) return '#6366f1'; // Azul médio
                return '#8b5cf6'; // Roxo para menores
            });

            const config = {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Total Gasto (R$)',
                        data: values,
                        backgroundColor: colors,
                        borderColor: colors.map(color => color),
                        borderWidth: 2,
                        borderRadius: 6,
                        borderSkipped: false,
                        showValues: CHART_CONFIG.showValues,  // ✅ Usar configuração global
                        valueColor: CHART_CONFIG.valueColor,
                        valueFont: CHART_CONFIG.valueFont
                    }]
                },
                options: mergeChartOptions({
                    indexAxis: 'y',
                    plugins: {
                        title: {
                            display: true,
                            text: '💰 Análise de Gastos por Categoria/Plano de Conta',
                            font: { size: 16, weight: 'bold' }
                        },
                        subtitle: {
                            display: true,
                            text: `🏆 Maior gasto: ${processedData[0]?.account_plan_code || '-'} (${formatCurrency(max)})`,
                            font: { size: 12 }
                        },
                        legend: { 
                            display: false 
                        },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    const item = processedData[context[0].dataIndex];
                                    return `Plano de Conta: ${item.account_plan_code}`;
                                },
                                label: function(context) {
                                    const item = processedData[context.dataIndex];
                                    return [
                                        `💰 Total: ${formatCurrency(context.parsed.x)}`,
                                        `📊 Transações: ${item.count}`,
                                        `💡 Média: ${formatCurrency(item.total / item.count)}`
                                    ];
                                },
                                footer: function(context) {
                                    if (context.length > 0) {
                                        const item = processedData[context[0].dataIndex];
                                        const percentage = ((item.total / processedData.reduce((sum, d) => sum + d.total, 0)) * 100).toFixed(1);
                                        return `📈 Representa ${percentage}% do total`;
                                    }
                                    return '';
                                }
                            }
                        },
                        datalabels: {
                            display: function(context) {
                                return context.parsed && context.parsed.x > 0;
                            },
                            color: '#374151',
                            anchor: 'end',
                            align: 'right',
                            font: { weight: 'bold', size: 10 },
                            formatter: function(value) {
                                return value > 0 ? formatCurrency(value) : '';
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Valor (R$)'
                            },
                            beginAtZero: true
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Planos de Conta'
                            }
                        }
                    }
                })
            };

            createChart(chartKey, canvasId, config);
            
        } catch (error) {
            console.error('❌ Erro ao criar gráfico de planos:', error);
            displayChartFallback(canvasId, 'Erro ao carregar gráfico');
        }
    }

    async function handleAddExpense(e) {
        e.preventDefault();
        
        try {
            if (!checkAuthentication()) return;

            const formData = new FormData(addExpenseForm);
            formData.set('is_business_expense', businessCheckbox.checked);
            // Normalização de conta: se usuário ainda tiver valor obsoleto 'PIX' ou 'Boleto'
            const originalAccount = (formData.get('account') || '').trim();
            if (originalAccount.toUpperCase() === 'PIX' || originalAccount.toUpperCase() === 'BOLETO') {
                formData.set('account', 'PIX/Boleto');
            }
            
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses`, { 
                method: 'POST', 
                body: formData 
            });
            
            if (!response.ok) { 
                const err = await response.json(); 
                throw new Error(err.message); 
            }
            
            showNotification('Gasto adicionado com sucesso!', 'success');
            addExpenseForm.reset();
            toggleExpenseFields();
            fetchAllData();
        } catch (error) { 
            console.error('Erro ao adicionar gasto:', error);
            showNotification(`Erro: ${error.message}`, 'error');
        }
    }

    function handleTableClick(e) {
        if (e.target.closest('.edit-btn')) {
            const expenseId = e.target.closest('.edit-btn').dataset.id;
            openEditExpenseModal(expenseId);
        }
        if (e.target.closest('.delete-btn')) { 
            if (confirm('Tem a certeza?')) deleteExpense(e.target.closest('.delete-btn').dataset.id); 
        }
    }

    async function deleteExpense(id) {
        try {
            if (!checkAuthentication()) return;

            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses/${id}`, { 
                method: 'DELETE' 
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Falha ao apagar despesa.');
            }
            
            showNotification('Gasto removido com sucesso!', 'success');
            fetchAllData();
        } catch (error) { 
            console.error('Erro ao deletar gasto:', error);
            showNotification(`Erro: ${error.message}`, 'error');
        }
    }

    // ========== FUNÇÕES DO MODAL DE EDIÇÃO DE GASTOS ==========
    
    async function openEditExpenseModal(expenseId) {
        try {
            if (!checkAuthentication()) return;

            // Buscar dados da despesa
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses/${expenseId}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar dados da despesa.');
            }
            
            const expense = await response.json();
            
            // Preencher o formulário
            document.getElementById('edit-expense-id').value = expense.id;
            document.getElementById('edit-transaction-date').value = expense.transaction_date.split('T')[0];
            document.getElementById('edit-amount').value = expense.amount;
            document.getElementById('edit-description').value = expense.description;
            document.getElementById('edit-account').value = expense.account;
            document.getElementById('edit-account-plan-code').value = expense.account_plan_code || '';
            document.getElementById('edit-is-business').checked = expense.is_business_expense;
            document.getElementById('edit-has-invoice').checked = expense.has_invoice;
            
            // Mostrar/esconder upload de fatura
            toggleEditInvoiceUpload();
            
            // Mostrar modal
            editExpenseModal.classList.remove('hidden');
            setTimeout(() => editExpenseModal.classList.remove('opacity-0'), 10);
            
        } catch (error) {
            console.error('Erro ao abrir modal de edição:', error);
            showNotification(`Erro: ${error.message}`, 'error');
        }
    }
    
    function closeEditExpenseModal() {
        editExpenseModal.classList.add('opacity-0');
        setTimeout(() => {
            editExpenseModal.classList.add('hidden');
            editExpenseForm.reset();
        }, 300);
    }
    
    function toggleEditInvoiceUpload() {
        const hasInvoice = document.getElementById('edit-has-invoice').checked;
        const uploadDiv = document.getElementById('edit-invoice-upload');
        
        if (hasInvoice) {
            uploadDiv.classList.remove('hidden');
        } else {
            uploadDiv.classList.add('hidden');
        }
    }
    
    async function handleEditExpense(e) {
        e.preventDefault();
        
        try {
            if (!checkAuthentication()) return;
            
            const formData = new FormData(editExpenseForm);
            const expenseId = document.getElementById('edit-expense-id').value;
            
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses/${expenseId}`, {
                method: 'PUT',
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao atualizar gasto.');
            }
            
            showNotification('Gasto atualizado com sucesso!', 'success');
            closeEditExpenseModal();
            fetchAllData();
            
        } catch (error) {
            console.error('Erro ao editar gasto:', error);
            showNotification(`Erro: ${error.message}`, 'error');
        }
    }

    async function handleWeeklyReportDownload() {
        try {
            if (!checkAuthentication()) return;

            const response = await authenticatedFetch(`${API_BASE_URL}/api/reports/weekly`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao gerar relatório semanal.');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'relatorio-semanal.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showNotification('Relatório semanal gerado com sucesso!', 'success');
        } catch (error) {
            showNotification(error.message, 'error');
        }
    }

    function openReportModal() {
        const filterYear = document.getElementById('filter-year');
        const filterMonth = document.getElementById('filter-month');
        const reportYear = document.getElementById('report-year');
        const reportMonth = document.getElementById('report-month');
        const filterAccount = document.getElementById('filter-account');
        const reportAccount = document.getElementById('report-account');

        // Copia as opções dos filtros principais para o modal
        if (reportYear && filterYear) {
            reportYear.innerHTML = filterYear.innerHTML;
            reportYear.value = filterYear.value;
        }
        if (reportMonth && filterMonth) {
            reportMonth.innerHTML = filterMonth.innerHTML;
            reportMonth.value = filterMonth.value;
        }

        // Preenche as contas disponíveis no filtro do modal
        if (reportAccount && filterAccount) {
            reportAccount.innerHTML = '';
            for (let i = 0; i < filterAccount.options.length; i++) {
                const opt = filterAccount.options[i];
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.textContent;
                reportAccount.appendChild(option);
            }
            // Seleciona a mesma conta do filtro principal, se houver
            reportAccount.value = filterAccount.value;
        }

        // Carrega prévia dos limites de gastos
        loadReportCeilingPreview();

        // Exibe o modal normalmente
        const modal = document.getElementById('report-modal');
        if (modal) {
            modal.classList.remove('hidden', 'opacity-0');
            modal.classList.add('flex');
            setTimeout(() => modal.classList.remove('opacity-0'), 10);
            
            // Melhoria para dispositivos móveis
            adjustModalForMobile(modal);
        }
    }

    // Função para carregar prévia dos limites no modal de relatório
    async function loadReportCeilingPreview() {
        try {
            const year = document.getElementById('report-year')?.value || filterYear.value;
            const month = document.getElementById('report-month')?.value || filterMonth.value;
            
            if (!year || !month) return;

            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses-goals?year=${year}&month=${month}`);
            
            if (!response.ok) return;
            
            const data = await response.json();
            
            const previewContainer = document.getElementById('report-ceiling-preview');
            const previewContent = document.getElementById('ceiling-preview-content');
            
            if (!previewContainer || !previewContent) return;

            if (data && data.length > 0) {
                // Filtrar apenas planos com gastos ou tetos > 0
                const filteredData = data.filter(d => (d.Total > 0 || d.Teto > 0) && d.PlanoContasID);
                
                if (filteredData.length > 0) {
                    // Ordenar por percentual de utilização (maior primeiro)
                    const sortedData = filteredData.sort((a, b) => {
                        const percentA = a.Teto > 0 ? (a.Total / a.Teto) * 100 : 0;
                        const percentB = b.Teto > 0 ? (b.Total / b.Teto) * 100 : 0;
                        return percentB - percentA;
                    });

                    let html = `<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">`;
                    
                    sortedData.slice(0, 8).forEach(item => { // Mostrar apenas os 8 primeiros
                        const percentage = item.Teto > 0 ? ((item.Total / item.Teto) * 100).toFixed(1) : '0.0';
                        let statusIcon = '🟢';
                        let statusClass = 'text-green-700';
                        
                        if (percentage > 100) {
                            statusIcon = '🔴';
                            statusClass = 'text-red-700';
                        } else if (percentage >= 90) {
                            statusIcon = '🟡';
                            statusClass = 'text-yellow-700';
                        } else if (percentage >= 70) {
                            statusIcon = '🟡';
                            statusClass = 'text-yellow-600';
                        }
                        
                        html += `
                            <div class="flex justify-between items-center py-1">
                                <span>Plano ${item.PlanoContasID}:</span>
                                <span class="${statusClass}">
                                    ${statusIcon} ${percentage}%
                                </span>
                            </div>
                        `;
                    });
                    
                    html += `</div>`;
                    
                    if (sortedData.length > 8) {
                        html += `<p class="text-center mt-2 text-green-600">... e mais ${sortedData.length - 8} planos no relatório completo</p>`;
                    }
                    
                    previewContent.innerHTML = html;
                    previewContainer.classList.remove('hidden');
                } else {
                    previewContainer.classList.add('hidden');
                }
            } else {
                previewContainer.classList.add('hidden');
            }
            
        } catch (error) {
            console.error('Erro ao carregar prévia dos limites:', error);
            const previewContainer = document.getElementById('report-ceiling-preview');
            if (previewContainer) {
                previewContainer.classList.add('hidden');
            }
        }
    }

    function closeReportModal() {
        if(reportModal) {
            reportModal.classList.add('opacity-0');
            setTimeout(() => reportModal.classList.add('hidden'), 300);
        }
    }

    // Função para ajustar modais para dispositivos móveis
    function adjustModalForMobile(modal) {
        if (!modal) return;
        
        if (window.innerWidth <= 640) {
            // Em dispositivos móveis, posicionar o modal no topo
            modal.style.alignItems = 'flex-start';
            modal.style.paddingTop = '1rem';
            
            // Garantir que o modal seja rolável
            const modalContent = modal.querySelector('.bg-white');
            if (modalContent) {
                modalContent.style.maxHeight = '85vh';
                modalContent.style.overflowY = 'auto';
            }
        } else {
            // Em desktop, centralizar
            modal.style.alignItems = 'center';
            modal.style.paddingTop = '';
        }
    }

    // Função para configurar o menu móvel
    function setupMobileMenu() {
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileDropdownBtn = document.getElementById('mobile-dropdown-btn');
        const mobileDropdownMenu = document.getElementById('mobile-dropdown-menu');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        
        // Botão de menu hamburger (mobile-menu-btn) para alternar o dropdown
        if (mobileMenuBtn && mobileDropdownMenu) {
            mobileMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = !mobileDropdownMenu.classList.contains('hidden');
                
                if (isOpen) {
                    // Fechar menu
                    mobileDropdownMenu.classList.add('hidden');
                    mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
                    mobileMenuBtn.setAttribute('title', 'Abrir menu de navegação');
                } else {
                    // Abrir menu
                    mobileDropdownMenu.classList.remove('hidden');
                    mobileMenuBtn.innerHTML = '<i class="fas fa-times"></i>';
                    mobileMenuBtn.setAttribute('title', 'Fechar menu de navegação');
                    
                    // Posicionar o menu próximo ao botão
                    const rect = mobileMenuBtn.getBoundingClientRect();
                    mobileDropdownMenu.style.position = 'fixed';
                    mobileDropdownMenu.style.top = `${rect.bottom + 5}px`;
                    mobileDropdownMenu.style.right = '10px';
                    mobileDropdownMenu.style.left = 'auto';
                }
            });
        }
        
        // Botão do menu dropdown móvel (manter funcionalidade existente)
        if (mobileDropdownBtn && mobileDropdownMenu) {
            mobileDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                mobileDropdownMenu.classList.toggle('hidden');
            });
            
            // Fechar menu ao clicar fora
            document.addEventListener('click', (e) => {
                if (!mobileDropdownMenu.contains(e.target) && 
                    !mobileDropdownBtn.contains(e.target) && 
                    !mobileMenuBtn.contains(e.target)) {
                    mobileDropdownMenu.classList.add('hidden');
                    if (mobileMenuBtn) {
                        mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
                        mobileMenuBtn.setAttribute('title', 'Abrir menu de navegação');
                    }
                }
            });
        }
        
        // Event listeners para botões mobile duplicados
        const mobileBtns = [
            { id: 'monthly-report-btn-mobile', original: 'monthly-report-btn' },
            { id: 'weekly-report-btn-mobile', original: 'weekly-report-btn' },
            { id: 'interactive-report-btn-mobile', original: 'interactive-report-btn' },
            { id: 'recurring-expenses-btn-mobile', original: 'recurring-expenses-btn' },
            { id: 'period-analysis-btn-mobile', original: 'period-analysis-btn' },
            { id: 'logout-button-mobile', original: 'logout-button' }
        ];
        
        mobileBtns.forEach(btn => {
            const mobileBtn = document.getElementById(btn.id);
            const originalBtn = document.getElementById(btn.original);
            
            if (mobileBtn && originalBtn) {
                mobileBtn.addEventListener('click', () => {
                    originalBtn.click();
                    // Fechar o menu dropdown
                    if (mobileDropdownMenu) {
                        mobileDropdownMenu.classList.add('hidden');
                        // Resetar ícone do menu hamburger
                        if (mobileMenuBtn) {
                            mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
                            mobileMenuBtn.setAttribute('title', 'Abrir menu de navegação');
                        }
                    }
                });
            }
        });
        
        // Configurar navegação por abas
        setupTabNavigation(mobileDropdownMenu);
        
        // Configurar busca de abas
        setupTabSearch(mobileDropdownMenu);
        
        // Ajustar layout em redimensionamento
        window.addEventListener('resize', adjustLayoutForScreenSize);
        adjustLayoutForScreenSize(); // Executar na inicialização
    }
    
    // Função para configurar navegação por abas no mobile
    function setupTabNavigation(mobileDropdownMenu) {
        const tabButtons = document.querySelectorAll('[data-mobile-tab]');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-mobile-tab');
                
                // Encontrar o botão da aba principal correspondente
                const mainTabBtn = document.querySelector(`[data-tab="${tabName}"]`);
                
                if (mainTabBtn) {
                    // Simular clique no botão principal
                    mainTabBtn.click();
                    
                    // Fechar o menu dropdown
                    if (mobileDropdownMenu) {
                        mobileDropdownMenu.classList.add('hidden');
                        // Resetar ícone do menu hamburger
                        if (mobileMenuBtn) {
                            mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
                            mobileMenuBtn.setAttribute('title', 'Abrir menu de navegação');
                        }
                    }
                    
                    // Scroll suave para o topo
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    
                    // Feedback visual
                    showNotification(`📱 Navegando para: ${btn.textContent.trim()}`, 'success');
                }
            });
        });
    }
    
    // Função para configurar busca de abas
    function setupTabSearch(mobileDropdownMenu) {
        const tabSearchInput = document.getElementById('tab-search-input');
        const tabSearchResults = document.getElementById('tab-search-results');
        
        if (!tabSearchInput || !tabSearchResults) return;
        
        // Lista de todas as abas e funcionalidades disponíveis
        const allTabs = [
            { name: '📊 Dashboard', tab: 'dashboard', description: 'Visão geral e estatísticas principais' },
            { name: '💳 PIX & Boleto', tab: 'pix-boleto', description: 'Pagamentos via PIX e boletos' },
            { name: '💼 Análise Empresarial', tab: 'business-analysis', description: 'Relatórios e análises empresariais' },
            { name: '📝 Gastos', tab: 'expenses', description: 'Listagem e gerenciamento de despesas' },
            { name: '📈 Relatórios', tab: 'reports', description: 'Relatórios detalhados e exportações' },
            { name: '🚨 Alertas Financeiros', section: 'insights', subsection: 'alerts', description: 'Alertas e notificações importantes' },
            { name: '� Alertas de Orçamento', section: 'insights', subsection: 'alerts', description: 'Monitoramento e alertas de limites orçamentários' },
            { name: '📊 Análise Plano de Contas', section: 'insights', subsection: 'alerts', description: 'Análise detalhada do uso de categorias' },
            { name: '�💡 Recomendações', section: 'insights', subsection: 'recommendations', description: 'Sugestões para otimização financeira' },
            { name: '🎯 Decisões Estratégicas', section: 'insights', subsection: 'decisions', description: 'Análises para tomada de decisões' },
            { name: '⚡ Ações Rápidas', section: 'insights', subsection: 'actions', description: 'Ações e comandos rápidos' },
            { name: '📊 Análise por Período', action: 'period-analysis', description: 'Análise detalhada por período da fatura' },
            { name: '🔄 Gastos Recorrentes', action: 'recurring-expenses', description: 'Gerenciamento de despesas recorrentes' },
            { name: '📅 Relatório Mensal', action: 'monthly-report', description: 'Relatório mensal em PDF' },
            { name: '🗓️ Relatório Semanal', action: 'weekly-report', description: 'Relatório semanal em PDF' },
            { name: '📊 Relatório Interativo', action: 'interactive-report', description: 'Relatório interativo com gráficos' },
            { name: '⚙️ Configurar Orçamento', section: 'insights', subsection: 'alerts', description: 'Definir limites e alertas de orçamento mensal' },
            { name: '🔍 Frequência de Uso', section: 'insights', subsection: 'alerts', description: 'Análise de frequência de categorias' },
            { name: '💲 Distribuição de Valores', section: 'insights', subsection: 'alerts', description: 'Análise de distribuição financeira por categoria' },
            { name: '📈 Análise de Tendências', section: 'insights', subsection: 'alerts', description: 'Tendências de uso de plano de contas' },
            { name: '⚡ Eficiência de Categorização', section: 'insights', subsection: 'alerts', description: 'Análise de eficiência do plano de contas' }
        ];
        
        tabSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            if (searchTerm.length === 0) {
                tabSearchResults.classList.add('hidden');
                return;
            }
            
            // Filtrar resultados
            const filteredTabs = allTabs.filter(tab => 
                tab.name.toLowerCase().includes(searchTerm) || 
                tab.description.toLowerCase().includes(searchTerm)
            );
            
            if (filteredTabs.length === 0) {
                tabSearchResults.innerHTML = `
                    <div class="p-3 text-center text-gray-500 text-sm">
                        <i class="fas fa-search"></i> Nenhum resultado encontrado
                    </div>
                `;
                tabSearchResults.classList.remove('hidden');
                return;
            }
            
            // Renderizar resultados
            tabSearchResults.innerHTML = filteredTabs.map(tab => `
                <button class="tab-search-result w-full text-left p-2 rounded hover:bg-blue-50 border-l-2 border-blue-500 mb-1" 
                        data-tab-target="${tab.tab || ''}" 
                        data-section="${tab.section || ''}" 
                        data-subsection="${tab.subsection || ''}"
                        data-action="${tab.action || ''}">
                    <div class="font-medium text-sm">${tab.name}</div>
                    <div class="text-xs text-gray-500 mt-1">${tab.description}</div>
                </button>
            `).join('');
            
            tabSearchResults.classList.remove('hidden');
            
            // Adicionar event listeners aos resultados
            const resultButtons = tabSearchResults.querySelectorAll('.tab-search-result');
            resultButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    handleTabSearchNavigation(btn, mobileDropdownMenu);
                    tabSearchInput.value = '';
                    tabSearchResults.classList.add('hidden');
                });
            });
        });
        
        // Limpar busca ao clicar fora
        document.addEventListener('click', (e) => {
            if (!tabSearchInput.contains(e.target) && !tabSearchResults.contains(e.target)) {
                tabSearchResults.classList.add('hidden');
            }
        });
    }
    
    // Função para navegar baseado na busca
    function handleTabSearchNavigation(btn, mobileDropdownMenu) {
        const tab = btn.getAttribute('data-tab-target');
        const section = btn.getAttribute('data-section');
        const subsection = btn.getAttribute('data-subsection');
        const action = btn.getAttribute('data-action');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        
        // Fechar menu dropdown
        if (mobileDropdownMenu) {
            mobileDropdownMenu.classList.add('hidden');
            // Resetar ícone do menu hamburger
            if (mobileMenuBtn) {
                mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
                mobileMenuBtn.setAttribute('title', 'Abrir menu de navegação');
            }
        }
        
        if (tab) {
            // Navegar para aba principal
            const mainTabBtn = document.querySelector(`[data-tab="${tab}"]`);
            if (mainTabBtn) {
                mainTabBtn.click();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } else if (section && subsection) {
            // Navegar para seção específica (ex: insights)
            const mainTabBtn = document.querySelector('[data-tab="dashboard"]');
            if (mainTabBtn) {
                mainTabBtn.click();
                
                // Aguardar um pouco para garantir que a aba foi carregada
                setTimeout(() => {
                    const insightTabBtn = document.querySelector(`[data-tab="${subsection}"]`);
                    if (insightTabBtn) {
                        insightTabBtn.click();
                        // Scroll para a seção de insights
                        const insightsSection = document.querySelector('.insights-section');
                        if (insightsSection) {
                            insightsSection.scrollIntoView({ behavior: 'smooth' });
                        }
                    }
                }, 100);
            }
        } else if (action) {
            // Executar ação específica
            const actionBtn = document.getElementById(`${action}-btn`);
            if (actionBtn) {
                actionBtn.click();
            }
        }
        
        // Feedback visual
        showNotification(`🎯 Navegando para: ${btn.querySelector('.font-medium').textContent}`, 'success');
    }
    
    // Função para ajustar layout baseado no tamanho da tela
    function adjustLayoutForScreenSize() {
        const isMobile = window.innerWidth <= 768;
        const mainContent = document.querySelector('.main-content');
        
        if (mainContent) {
            if (isMobile) {
                mainContent.style.marginLeft = '0';
                mainContent.style.padding = '0.5rem';
            } else {
                mainContent.style.marginLeft = '';
                mainContent.style.padding = '';
            }
        }
        
        // Redimensionar gráficos quando a tela muda
        if (typeof Chart !== 'undefined') {
            Object.values(chartRegistry).forEach(chart => {
                if (chart && typeof chart.resize === 'function') {
                    setTimeout(() => chart.resize(), 100);
                }
            });
        }
    }

    async function handleMonthlyReportDownload(e) {
        e.preventDefault();
        const year = document.getElementById('report-year')?.value;
        const month = document.getElementById('report-month')?.value;
        // Use o filtro do modal, não o da tela principal
        const account = document.getElementById('report-account')?.value || '';

        if (!year || !month) {
            showNotification('Selecione ano e mês para o relatório.', 'error');
            return;
        }

        const submitButton = e.submitter;

        if(reportGenerateText) reportGenerateText.classList.add('hidden');
        if(reportLoadingText) reportLoadingText.classList.remove('hidden');
        if(submitButton) submitButton.disabled = true;

        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/api/reports/monthly`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, month, account })
            });
            
            if (!response.ok) {
                let errorMessage = 'Falha ao gerar o relatório.';
                try {
                    const errorData = await response.json();
                    console.error('Erro detalhado do servidor:', errorData);
                    
                    // Mensagens mais amigáveis baseadas no tipo de erro
                    if (errorData.environment === 'Railway') {
                        if (errorData.details?.includes('canvas') || errorData.details?.includes('ChartJS')) {
                            errorMessage = `Erro no Railway: Problema com geração de gráficos. O PDF será gerado sem gráficos. Detalhes: ${errorData.details}`;
                        } else if (errorData.details?.includes('font')) {
                            errorMessage = `Erro no Railway: Problema com fontes. Detalhes: ${errorData.details}`;
                        } else {
                            errorMessage = `Erro ${response.status} no Railway: ${errorData.details || errorData.message || errorMessage}`;
                        }
                    } else {
                        errorMessage = `Erro ${response.status}: ${errorData.details || errorData.message || errorMessage}`;
                    }
                } catch (parseError) {
                    console.error('Erro ao parsear resposta de erro:', parseError);
                    if (response.status === 500) {
                        errorMessage = `Erro interno do servidor (${response.status}). Possível problema com dependências no Railway. Tente novamente em alguns minutos.`;
                    } else {
                        errorMessage = `Erro ${response.status}: ${response.statusText}`;
                    }
                }
                throw new Error(errorMessage);
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `relatorio-mensal-${year}-${month}${account ? '-' + account : ''}.pdf`;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
            closeReportModal();
        } catch (error) {
            let errorMsg = error.message;
            
            // Se erro 500, oferecer diagnóstico
            if (error.message.includes('500') || error.message.includes('interno do servidor')) {
                errorMsg += '\n\n🔍 Executando diagnóstico...';
                showNotification(errorMsg, 'error');
                
                // Tentar diagnóstico das dependências
                try {
                    const diagResponse = await authenticatedFetch(`${API_BASE_URL}/api/health/pdf-dependencies`);
                    if (diagResponse.ok) {
                        const diagData = await diagResponse.json();
                        console.log('📊 Diagnóstico das dependências:', diagData);
                        
                        let diagMsg = '\n\n📊 Diagnóstico:\n';
                        if (!diagData.dependencies.chartjs?.available) {
                            diagMsg += '• ❌ ChartJS não disponível (gráficos desabilitados)\n';
                        }
                        if (!diagData.dependencies.fonts?.notoSansExists) {
                            diagMsg += '• ⚠️ Fonte personalizada não encontrada\n';
                        }
                        if (diagData.system?.memoryUsage?.heapUsed > 100000000) {
                            diagMsg += '• ⚠️ Alto uso de memória detectado\n';
                        }
                        
                        showNotification(errorMsg + diagMsg, 'error');
                    }
                } catch (diagError) {
                    console.error('Erro no diagnóstico:', diagError);
                }
            } else {
                showNotification(`Erro: ${errorMsg}`, 'error');
            }
        } finally {
            if(reportGenerateText) reportGenerateText.classList.remove('hidden');
            if(reportLoadingText) reportLoadingText.classList.add('hidden');
            if(submitButton) submitButton.disabled = false;
        }
    }

    function populateYearAndMonthFilters() {
        const yearSelect = document.getElementById('filter-year');
        const monthSelect = document.getElementById('filter-month');
        
        if (yearSelect) {
            const currentYear = new Date().getFullYear();
            yearSelect.innerHTML = '';
            
            // Adicionar anos (atual e próximos 2 anos até 2027, e 3 anos anteriores)
            for (let year = currentYear - 3; year <= currentYear + 3; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                if (year === currentYear) option.selected = true;
                yearSelect.appendChild(option);
            }
        }
        
        if (monthSelect) {
            const currentMonth = new Date().getMonth() + 1;
            const months = [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ];
            
            monthSelect.innerHTML = '';
            months.forEach((month, index) => {
                const option = document.createElement('option');
                option.value = index + 1;
                option.textContent = month;
                if (index + 1 === currentMonth) option.selected = true;
                monthSelect.appendChild(option);
            });
        }
    }

    async function populateAccountFilter() {
        const select = document.getElementById('filter-account');
        if (!select) return;

        try {
            if (!checkAuthentication()) return;

            const response = await authenticatedFetch(`${API_BASE_URL}/api/accounts`);
            
            if (!response.ok) {
                if (response.status === 403 || response.status === 401) {
                    console.log('Erro de autenticação ao carregar contas');
                    // handleAuthError já foi chamado pelo authenticatedFetch
                    return;
                }
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar contas.');
            }
            
            let accounts = await response.json();
            // Garantir que conta unificada exista mesmo que ainda não haja registros
            if (!accounts.includes('PIX/Boleto')) accounts.push('PIX/Boleto');
            // Remover legados se ainda vierem do backend
            accounts = accounts.filter(a => a && a !== 'PIX' && a !== 'Boleto');

            select.innerHTML = '<option value="">Todas as Contas</option>';
            accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account;
                option.textContent = account;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar contas:', error);
            if (!error.message.includes('Autenticação falhou')) {
                showNotification('Erro ao carregar contas.', 'error');
            }
        }
    }

    function checkMonthlyReportReminder() {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const lastDay = new Date(year, month, 0).getDate();
        const daysLeft = lastDay - today.getDate();

        if ([3,2,1].includes(daysLeft)) {
            const key = `toast_report_reminder_${year}_${month}_${daysLeft}`;
            if (!sessionStorage.getItem(key)) {
                showNotification(`Faltam ${daysLeft} dia(s) para o fim do mês. Lembre-se de gerar o relatório mensal!`, 'info');
                sessionStorage.setItem(key, 'shown');
            }
        }
    }

    // Garantir que o plugin ChartDataLabels está registrado globalmente
    if (window.Chart && window.ChartDataLabels) {
        Chart.register(window.ChartDataLabels);
    }

    // ========== RELATÓRIO INTERATIVO ==========
    async function populateIrAccounts() {
        if (!irAccount) return;
        
        try {
            if (!checkAuthentication()) return;

            const response = await authenticatedFetch(`${API_BASE_URL}/api/accounts`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar contas.');
            }
            
            let accounts = await response.json();
            if (!accounts.includes('PIX/Boleto')) accounts.push('PIX/Boleto');
            accounts = accounts.filter(a => a && a !== 'PIX' && a !== 'Boleto');
            irAccount.innerHTML = '<option value="">Todas</option>';
            accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account;
                option.textContent = account;
                irAccount.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar contas IR:', error);
            showNotification('Erro ao carregar contas.', 'error');
        }
    }

    if (irForm) irForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        irCharts.innerHTML = '';
        irDetails.innerHTML = '';
        const period1 = document.getElementById('ir-period-1').value;
        const period2 = document.getElementById('ir-period-2').value;
        const account = irAccount.value;
        const type = document.getElementById('ir-type').value;
        const category = document.getElementById('ir-category').value.trim();
        if (!period1) return showNotification('Selecione ao menos o Período 1.', 'error');
        const [year1, month1] = period1.split('-');
        let year2, month2;
        if (period2) [year2, month2] = period2.split('-');
        // Busca dados dos dois períodos
        const data1 = await fetchIrData(year1, month1, account, type, category);
        let data2 = null;
        if (year2 && month2) data2 = await fetchIrData(year2, month2, account, type, category);
        renderIrCharts(data1, data2, period1, period2);
    });

    async function fetchIrData(year, month, account, type, category) {
        if (!checkAuthentication()) return [];
        
        year = parseInt(year, 10);
        month = parseInt(month, 10);
        const params = new URLSearchParams({ year, month });
        if (account) params.append('account', account);
        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses?${params.toString()}`);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Erro ao buscar despesas:', errorText);
                throw new Error('Erro ao buscar despesas.');
            }
            let expenses = await response.json();
            if (!Array.isArray(expenses)) {
                console.error('Resposta inesperada da API:', expenses);
                expenses = [];
            }
            // Filtro por tipo
            if (type) expenses = expenses.filter(e => (type === 'empresa' ? e.is_business_expense : !e.is_business_expense));
            // Filtro por categoria
            if (category) expenses = expenses.filter(e => String(e.account_plan_code || '').toLowerCase().includes(category.toLowerCase()));
            if (expenses.length === 0) {
                console.warn('Nenhum dado encontrado para os filtros:', {year, month, account, type, category});
            }
            return expenses;
        } catch (error) {
            showNotification('Erro ao buscar dados do relatório: ' + error.message, 'error');
            return [];
        }
    }

    function renderIrCharts(data1, data2, period1, period2) {
        irCharts.innerHTML = '';
        irDetails.innerHTML = '';
        // Gráfico 1
        const canvas1 = document.createElement('canvas');
        canvas1.height = 300;
        irCharts.appendChild(canvas1);
        renderIrBarChart(canvas1, data1, period1, 1);
        // Gráfico 2 (comparação)
        if (data2) {
            const canvas2 = document.createElement('canvas');
            canvas2.height = 300;
            irCharts.appendChild(canvas2);
            renderIrBarChart(canvas2, data2, period2, 2);
        }
    }

    function renderIrBarChart(canvas, data, period, chartNum) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (!data || !data.length) {
            ctx.font = '16px Arial';
            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.fillText('Sem dados para este período.', canvas.width / 2, canvas.height / 2);
            return;
        }
        // Agrupa por categoria/plano de conta
        const grouped = {};
        data.forEach(e => {
            const key = e.account_plan_code || 'Sem Plano';
            if (!grouped[key]) grouped[key] = 0;
            grouped[key] += parseFloat(e.amount);
        });
        const labels = Object.keys(grouped);
        const values = Object.values(grouped);
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: `Total por Plano (${period})`,
                    data: values,
                    backgroundColor: '#6366F1'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Gastos por Plano de Conta (${period})`,
                        font: { size: 16 }
                    },
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `R$ ${ctx.parsed.y.toFixed(2)}`
                        }
                    },
                    datalabels: {
                        color: '#222',
                        anchor: 'end', align: 'top', font: { weight: 'bold' },
                        formatter: v => typeof v === 'number' ? `R$ ${v.toFixed(2)}` : ''
                    }
                },
                onClick: (evt, elements) => {
                    if (elements && elements.length > 0) {
                        const idx = elements[0].index;
                        const plano = labels[idx];
                        showIrDetails(data, plano, chartNum, period);
                    }
                },
                scales: { y: { beginAtZero: true } }
            },
            plugins: [ChartDataLabels]
        });
    }

    function showIrDetails(data, plano, chartNum, period) {
        const filtered = data.filter(e => String(e.account_plan_code || 'Sem Plano') === String(plano));
        let total = filtered.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        let html = `<div class="mb-2 font-bold text-lg flex items-center justify-between">
            <span>Detalhes do Plano <span class='text-blue-600'>${plano}</span> (${period})</span>
            <span class='bg-blue-100 text-blue-800 px-3 py-1 rounded font-mono'>Total: R$ ${total.toFixed(2)}</span>
            <button id="ir-export-csv" class="bg-green-500 text-white px-3 py-1 rounded ml-4"><i class="fa fa-file-csv"></i> Exportar CSV</button>
        </div>`;
        if (filtered.length === 0) {
            html += `<div class='text-gray-500 italic'>Nenhuma transação encontrada para este plano neste período.</div>`;
            irDetails.innerHTML = html;
            return;
        }
        html += `<div style="max-height:320px;overflow:auto;"><table class="table table-sm table-bordered align-middle"><thead class='sticky-top bg-white'><tr><th>Data</th><th>Descrição</th><th class='text-end'>Valor</th><th>Conta</th><th>Tipo</th></tr></thead><tbody>`;
        filtered.forEach(e => {
            html += `<tr><td>${new Date(e.transaction_date).toLocaleDateString('pt-BR')}</td><td>${e.description}</td><td class='text-end'>R$ ${parseFloat(e.amount).toFixed(2)}</td><td>${e.account}</td><td>${e.is_business_expense ? 'Empresarial' : 'Pessoal'}</td></tr>`;
        });
        html += '</tbody></table></div>';
        irDetails.innerHTML = html;
        // Exportar CSV
        const exportBtn = document.getElementById('ir-export-csv');
        if (exportBtn) {
            exportBtn.onclick = () => {
                let csv = 'Data,Descrição,Valor,Conta,Tipo\n';
                filtered.forEach(e => {
                    csv += `"${new Date(e.transaction_date).toLocaleDateString('pt-BR')}","${e.description}","${parseFloat(e.amount).toFixed(2)}","${e.account}","${e.is_business_expense ? 'Empresarial' : 'Pessoal'}"\n`;
                });
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `relatorio_${plano}_${period}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
        }
        irDetails.scrollIntoView({ behavior: 'smooth' });
    }

    // ========== SISTEMA DE CONSULTA DE FATURAMENTO APRIMORADO =========
    const billingForm = document.getElementById('billing-period-form');
    const billingResults = document.getElementById('billing-results');

    // Definição aprimorada dos períodos de fatura para cada conta
    const billingPeriods = {
        'Nu Bank Ketlyn': { 
            type: 'credit_card',
            startDay: 2, 
            endDay: 1,
            description: 'Cartão de Crédito Nubank'
        },
        'Nu Vainer': { 
            type: 'credit_card',
            startDay: 2, 
            endDay: 1,
            description: 'Cartão de Crédito Nubank'
        },
        'Ourocard Ketlyn': { 
            type: 'credit_card',
            startDay: 17, 
            endDay: 16,
            description: 'Cartão de Crédito Ourocard'
        },
        'PicPay Vainer': { 
            type: 'debit_account',
            startDay: 1, 
            endDay: 'last_day',
            description: 'Conta Digital PicPay'
        },
        'Ducatto': { 
            type: 'debit_account',
            startDay: 1, 
            endDay: 'last_day',
            description: 'Conta Ducatto'
        },
        'Master': { 
            type: 'credit_card',
            startDay: 1, 
            endDay: 'last_day',
            description: 'Cartão Master'
        }
    };

    /**
     * Calcula as datas de início e fim do período de fatura
     * @param {string} account - Nome da conta
     * @param {number} year - Ano de referência
     * @param {number} month - Mês de referência (1-12)
     * @returns {Object} Objeto com startDate e endDate
     */
    function calculateBillingPeriod(account, year, month) {
        const period = billingPeriods[account];
        if (!period) {
            throw new Error(`Período de fatura não definido para a conta: ${account}`);
        }

        let startDate, endDate;

        if (period.type === 'credit_card') {
            // Para cartões de crédito, o período vai do dia X do mês anterior até o dia Y do mês atual
            if (period.endDay === 'last_day') {
                // Do primeiro dia do mês até o último dia do mês
                startDate = new Date(year, month - 1, 1);
                endDate = new Date(year, month, 0); // Último dia do mês
            } else {
                // Período personalizado (ex: dia 2 até dia 1 do mês seguinte)
                startDate = new Date(year, month - 1, period.startDay);
                endDate = new Date(year, month, period.endDay);
            }
        } else {
            // Para contas de débito, normalmente é o mês completo
            startDate = new Date(year, month - 1, period.startDay);
            if (period.endDay === 'last_day') {
                endDate = new Date(year, month, 0); // Último dia do mês
            } else {
                endDate = new Date(year, month - 1, period.endDay);
            }
        }

        // Ajustar para timezone UTC para evitar problemas
        startDate.setUTCHours(0, 0, 0, 0);
        endDate.setUTCHours(23, 59, 59, 999);

        return { startDate, endDate };
    }

    /**
     * Busca gastos otimizada que usa parâmetros de data no servidor
     */
    async function fetchExpensesForBillingPeriod(account, startDate, endDate) {
        try {
            const params = new URLSearchParams({
                account: account,
                start_date: startDate.toISOString().slice(0, 10),
                end_date: endDate.toISOString().slice(0, 10)
            });

            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses?${params.toString()}`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }));
                throw new Error(errorData.message || `Erro ${response.status}: ${response.statusText}`);
            }
            
            const expenses = await response.json();
            
            // Filtro adicional no frontend para garantir precisão (com timezone)
            return expenses.filter(expense => {
                const expenseDate = new Date(expense.transaction_date + 'T00:00:00.000Z'); // Forçar UTC
                return expenseDate >= startDate && expenseDate <= endDate;
            });

        } catch (error) {
            console.error(`Erro ao buscar gastos para ${account}:`, error);
            throw error;
        }
    }

    // Event listener aprimorado para o formulário de faturamento
    if (billingForm) {
        billingForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Pegar ano e mês dos filtros principais
            const filterYearEl = document.getElementById('filter-year');
            const filterMonthEl = document.getElementById('filter-month');
            
            const year = filterYearEl && filterYearEl.value ? 
                parseInt(filterYearEl.value, 10) : new Date().getFullYear();
            const month = filterMonthEl && filterMonthEl.value ? 
                parseInt(filterMonthEl.value, 10) : (new Date().getMonth() + 1);

            if (!year || !month || month < 1 || month > 12) {
                showNotification('Por favor, selecione um ano e mês válidos.', 'error');
                return;
            }

            // Lista de contas disponíveis
            const accounts = Object.keys(billingPeriods);
            
            // Mostrar loading
            billingResults.innerHTML = `
                <div class="flex items-center justify-center p-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span class="ml-3 text-gray-600">Buscando dados de faturamento...</span>
                </div>
            `;

            try {
                // Processar cada conta em paralelo com limite de concorrência
                const accountPromises = accounts.map(async (account) => {
                    try {
                        const { startDate, endDate } = calculateBillingPeriod(account, year, month);
                        const expenses = await fetchExpensesForBillingPeriod(account, startDate, endDate);
                        
                        return {
                            account,
                            startDate,
                            endDate,
                            expenses,
                            success: true,
                            period: billingPeriods[account]
                        };
                    } catch (error) {
                        return {
                            account,
                            error: error.message,
                            success: false,
                            period: billingPeriods[account]
                        };
                    }
                });

                const results = await Promise.all(accountPromises);
                
                // Renderizar resultados
                renderBillingResults(results, year, month);

            } catch (error) {
                console.error('Erro geral na consulta de faturamento:', error);
                billingResults.innerHTML = `
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div class="flex">
                            <i class="fas fa-exclamation-triangle text-red-400 mr-3 mt-1"></i>
                            <div>
                                <h3 class="text-red-800 font-medium">Erro na Consulta</h3>
                                <p class="text-red-700 mt-1">${error.message}</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
    }

    /**
     * Renderiza os resultados de faturamento de forma organizada
     */
    function renderBillingResults(results, year, month) {
        if (!billingResults) return;

        // Calcular estatísticas gerais
        const totalExpenses = results
            .filter(r => r.success)
            .reduce((sum, r) => sum + r.expenses.reduce((acc, exp) => acc + parseFloat(exp.amount), 0), 0);
        
        const totalTransactions = results
            .filter(r => r.success)
            .reduce((sum, r) => sum + r.expenses.length, 0);

        let html = `
            <div class="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 class="text-lg font-semibold text-blue-800 mb-2">
                    <i class="fas fa-calendar-alt mr-2"></i>
                    Resumo do Período - ${getMonthName(month)}/${year}
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div class="bg-white rounded p-3 border">
                        <div class="text-gray-600">Total Gasto</div>
                        <div class="text-xl font-bold text-blue-600">R$ ${totalExpenses.toFixed(2)}</div>
                    </div>
                    <div class="bg-white rounded p-3 border">
                        <div class="text-gray-600">Transações</div>
                        <div class="text-xl font-bold text-green-600">${totalTransactions}</div>
                    </div>
                    <div class="bg-white rounded p-3 border">
                        <div class="text-gray-600">Contas Ativas</div>
                        <div class="text-xl font-bold text-purple-600">${results.filter(r => r.success && r.expenses.length > 0).length}</div>
                    </div>
                </div>
            </div>
        `;

        // Renderizar cada conta
        results.forEach(result => {
            if (!result.success) {
                html += renderBillingErrorBlock(result);
            } else {
                html += renderBillingAccountBlock(result);
            }
        });

        billingResults.innerHTML = html;
    }

    /**
     * Renderiza bloco de erro para uma conta
     */
    function renderBillingErrorBlock(result) {
        return `
            <div class="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div class="flex items-start">
                    <i class="fas fa-exclamation-triangle text-red-500 mr-3 mt-1"></i>
                    <div>
                        <h4 class="text-lg font-semibold text-red-800">${result.account}</h4>
                        <p class="text-sm text-gray-600 mb-2">${result.period?.description || 'Conta não identificada'}</p>
                        <p class="text-red-700">${result.error}</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renderiza bloco de dados para uma conta específica
     */
    function renderBillingAccountBlock(result) {
        const { account, expenses, startDate, endDate, period } = result;
        
        if (!expenses || expenses.length === 0) {
            return `
                <div class="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div class="flex items-center">
                        <i class="fas fa-info-circle text-gray-400 mr-3"></i>
                        <div>
                            <h4 class="text-lg font-semibold text-gray-700">${account}</h4>
                            <p class="text-sm text-gray-600 mb-1">${period.description}</p>
                            <p class="text-sm text-gray-500">
                                Período: ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}
                            </p>
                            <p class="text-gray-600 mt-2">Nenhum gasto encontrado neste período.</p>
                        </div>
                    </div>
                </div>
            `;
        }

        // Calcular totais
        const total = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
        const avgTransaction = total / expenses.length;
        
        // Agrupar por dia para melhor visualização
        const groupedByDay = groupExpensesByDay(expenses);
        const sortedDays = Object.keys(groupedByDay).sort((a, b) => {
            const [dayA, monthA, yearA] = a.split('/');
            const [dayB, monthB, yearB] = b.split('/');
            const dateA = new Date(yearA, monthA - 1, dayA);
            const dateB = new Date(yearB, monthB - 1, dayB);
            return dateA - dateB;
        });

        return `
            <div class="mb-6 bg-white border border-gray-200 rounded-lg shadow-sm">
                <!-- Header da Conta -->
                <div class="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-t-lg">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="text-lg font-semibold">${account}</h4>
                            <p class="text-blue-100 text-sm">${period.description}</p>
                            <p class="text-blue-100 text-sm">
                                📅 ${formatDateForDisplay(startDate)} a ${formatDateForDisplay(endDate)}
                            </p>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold">R$ ${total.toFixed(2)}</div>
                            <div class="text-blue-100 text-sm">${expenses.length} transação${expenses.length !== 1 ? 'ões' : ''}</div>
                            <div class="text-blue-100 text-sm">Média: R$ ${avgTransaction.toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                <!-- Conteúdo da Conta -->
                <div class="p-4">
                    <!-- Botões de Ação -->
                    <div class="mb-4 flex gap-2 flex-wrap">
                        <button onclick="exportBillingToCSV('${account}', ${JSON.stringify(expenses).replace(/"/g, '&quot;')})" 
                                class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm transition-colors">
                            <i class="fas fa-file-csv mr-1"></i> Exportar CSV
                        </button>
                        <button onclick="printBillingReport('${account}', ${JSON.stringify(result).replace(/"/g, '&quot;')})"
                                class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors">
                            <i class="fas fa-print mr-1"></i> Imprimir
                        </button>
                        <button onclick="toggleBillingDetails('billing-details-${account.replace(/\s+/g, '-')}')"
                                class="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors">
                            <i class="fas fa-eye mr-1"></i> Ver Detalhes
                        </button>
                    </div>

                    <!-- Resumo por Dia -->
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm border-collapse border border-gray-300">
                            <thead>
                                <tr class="bg-gray-100">
                                    <th class="border border-gray-300 px-3 py-2 text-left">Data</th>
                                    <th class="border border-gray-300 px-3 py-2 text-left">Descrições</th>
                                    <th class="border border-gray-300 px-3 py-2 text-right">Valor Total</th>
                                    <th class="border border-gray-300 px-3 py-2 text-center">Qtd</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sortedDays.map(day => {
                                    const dayExpenses = groupedByDay[day];
                                    const dayTotal = dayExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
                                    return `
                                        <tr class="hover:bg-gray-50">
                                            <td class="border border-gray-300 px-3 py-2 font-medium">${day}</td>
                                            <td class="border border-gray-300 px-3 py-2">
                                                ${dayExpenses.slice(0, 2).map(exp => exp.description).join(', ')}
                                                ${dayExpenses.length > 2 ? ` +${dayExpenses.length - 2} mais` : ''}
                                            </td>
                                            <td class="border border-gray-300 px-3 py-2 text-right font-medium text-green-600">
                                                R$ ${dayTotal.toFixed(2)}
                                            </td>
                                            <td class="border border-gray-300 px-3 py-2 text-center">
                                                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                                                    ${dayExpenses.length}
                                                </span>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                            <tfoot>
                                <tr class="bg-gray-100 font-bold">
                                    <td class="border border-gray-300 px-3 py-2">TOTAL</td>
                                    <td class="border border-gray-300 px-3 py-2">${expenses.length} transação${expenses.length !== 1 ? 'ões' : ''}</td>
                                    <td class="border border-gray-300 px-3 py-2 text-right text-green-700">R$ ${total.toFixed(2)}</td>
                                    <td class="border border-gray-300 px-3 py-2 text-center">${sortedDays.length} dias</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <!-- Detalhes Expansíveis -->
                    <div id="billing-details-${account.replace(/\s+/g, '-')}" class="hidden mt-4 border-t pt-4">
                        <h5 class="font-semibold mb-3 text-gray-700">Detalhes de Todas as Transações</h5>
                        <div class="overflow-x-auto max-h-96">
                            <table class="w-full text-xs border-collapse border border-gray-300">
                                <thead class="sticky top-0 bg-white">
                                    <tr class="bg-gray-200">
                                        <th class="border border-gray-300 px-2 py-1 text-left">Data</th>
                                        <th class="border border-gray-300 px-2 py-1 text-left">Descrição</th>
                                        <th class="border border-gray-300 px-2 py-1 text-right">Valor</th>
                                        <th class="border border-gray-300 px-2 py-1 text-center">Tipo</th>
                                        <th class="border border-gray-300 px-2 py-1 text-center">NF</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${expenses.map(expense => `
                                        <tr class="hover:bg-gray-50">
                                            <td class="border border-gray-300 px-2 py-1">
                                                ${formatDateForDisplay(new Date(expense.transaction_date))}
                                            </td>
                                            <td class="border border-gray-300 px-2 py-1">${expense.description}</td>
                                            <td class="border border-gray-300 px-2 py-1 text-right">R$ ${parseFloat(expense.amount).toFixed(2)}</td>
                                            <td class="border border-gray-300 px-2 py-1 text-center">
                                                <span class="px-1 py-0.5 rounded text-xs ${expense.is_business_expense ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                                                    ${expense.is_business_expense ? 'Empresarial' : 'Pessoal'}
                                                </span>
                                            </td>
                                            <td class="border border-gray-300 px-2 py-1 text-center">
                                                ${expense.invoice_path ? 
                                                    '<i class="fas fa-check text-green-500" title="Com Nota Fiscal"></i>' : 
                                                    '<i class="fas fa-times text-red-500" title="Sem Nota Fiscal"></i>'
                                                }
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Função para agrupar gastos por dia (melhorada)
    function groupExpensesByDay(expenses) {
        return expenses.reduce((acc, expense) => {
            const date = new Date(expense.transaction_date + 'T00:00:00.000Z');
            const day = date.toLocaleDateString('pt-BR');
            if (!acc[day]) acc[day] = [];
            acc[day].push(expense);
            return acc;
        }, {});
    }

    // Funções auxiliares
    function formatDateForDisplay(date) {
        return new Date(date).toLocaleDateString('pt-BR');
    }

    function getMonthName(month) {
        const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        return months[month - 1] || 'Mês Inválido';
    }

    // Funções globais para botões de ação
    window.exportBillingToCSV = function(account, expenses) {
        try {
            const data = typeof expenses === 'string' ? JSON.parse(expenses) : expenses;
            let csv = 'Data,Descrição,Valor,Tipo,Conta,Nota Fiscal\n';
            
            data.forEach(expense => {
                const date = formatDateForDisplay(new Date(expense.transaction_date));
                const description = `"${expense.description.replace(/"/g, '""')}"`;
                const amount = parseFloat(expense.amount).toFixed(2);
                const type = expense.is_business_expense ? 'Empresarial' : 'Pessoal';
                const hasInvoice = expense.invoice_path ? 'Sim' : 'Não';
                
                csv += `${date},${description},${amount},${type},"${account}",${hasInvoice}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `fatura_${account.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showNotification('CSV exportado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao exportar CSV:', error);
            showNotification('Erro ao exportar CSV', 'error');
        }
    };

    window.toggleBillingDetails = function(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.toggle('hidden');
        }
    };

    window.printBillingReport = function(account, resultData) {
        try {
            const data = typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
            const printWindow = window.open('', '_blank');
            
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Relatório de Fatura - ${account}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .header { text-align: center; margin-bottom: 30px; }
                        .period { color: #666; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        .total { font-weight: bold; background-color: #f9f9f9; }
                        .text-right { text-align: right; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Relatório de Fatura</h1>
                        <h2>${account}</h2>
                        <p class="period">Período: ${formatDateForDisplay(data.startDate)} a ${formatDateForDisplay(data.endDate)}</p>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Descrição</th>
                                <th>Valor</th>
                                <th>Tipo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.expenses.map(expense => `
                                <tr>
                                    <td>${formatDateForDisplay(new Date(expense.transaction_date))}</td>
                                    <td>${expense.description}</td>
                                    <td class="text-right">R$ ${parseFloat(expense.amount).toFixed(2)}</td>
                                    <td>${expense.is_business_expense ? 'Empresarial' : 'Pessoal'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr class="total">
                                <td colspan="2">TOTAL</td>
                                <td class="text-right">R$ ${data.expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0).toFixed(2)}</td>
                                <td>${data.expenses.length} transações</td>
                            </tr>
                        </tfoot>
                    </table>
                    
                    <script>
                        window.onload = function() {
                            window.print();
                            window.onafterprint = function() {
                                window.close();
                            };
                        };
                    </script>
                </body>
                </html>
            `);
            
            printWindow.document.close();
        } catch (error) {
            console.error('Erro ao imprimir relatório:', error);
            showNotification('Erro ao gerar relatório para impressão', 'error');
        }
    };

    // ========== SISTEMA DE GERENCIAMENTO DE GRÁFICOS ==========
    
    /**
     * Destrói uma instância de gráfico de forma segura
     */
    function destroyChart(chartKey) {
        // Verificar no registry principal
        if (chartRegistry[chartKey]) {
            try {
                console.log(`🧹 Destruindo gráfico (registry): ${chartKey}`);
                chartRegistry[chartKey].destroy();
            } catch (error) {
                console.warn(`⚠️ Erro ao destruir gráfico ${chartKey}:`, error);
            }
            chartRegistry[chartKey] = null;
        }
        
        // Verificar no objeto charts também
        if (charts[chartKey]) {
            try {
                console.log(`🧹 Destruindo gráfico (charts): ${chartKey}`);
                charts[chartKey].destroy();
            } catch (error) {
                console.warn(`⚠️ Erro ao destruir gráfico ${chartKey}:`, error);
            }
            charts[chartKey] = null;
        }
        
        // Buscar por todos os gráficos do Chart.js e destruir os órfãos
        if (typeof Chart !== 'undefined') {
            // Chart.js 4.x usa Chart.getChart() para obter instâncias por canvas
            try {
                // Mapear chaves do chartRegistry para IDs de canvas
                const canvasIdMap = {
                    'goalsChart': 'goals-chart',
                    'goalsPlanChart': 'goals-plan-chart', 
                    'mixedTypeChart': 'mixed-type-chart',
                    'planChart': 'plan-chart',
                    'expensesLineChart': 'expenses-line-chart',
                    'expensesPieChart': 'expenses-pie-chart',
                    'businessEvolutionChart': 'business-evolution-chart',
                    'businessAccountChart': 'business-account-chart',
                    'businessCategoryChart': 'business-category-chart'
                };
                
                const canvasId = canvasIdMap[chartKey];
                if (canvasId) {
                    const existingChart = Chart.getChart(canvasId);
                    if (existingChart) {
                        console.log(`🧹 Destruindo gráfico existente: ${canvasId}`);
                        existingChart.destroy();
                    }
                }
                
                // Também verificar com o próprio canvasId se foi passado diretamente
                if (typeof chartKey === 'string' && chartKey.includes('-')) {
                    const existingChart = Chart.getChart(chartKey);
                    if (existingChart) {
                        console.log(`🧹 Destruindo gráfico existente por ID: ${chartKey}`);
                        existingChart.destroy();
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Erro ao verificar gráficos existentes:`, error);
            }
        }
    }

    /**
     * Limpa canvas e prepara para novo gráfico
     */
    function prepareCanvas(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`⚠️ Canvas ${canvasId} não encontrado`);
            return null;
        }

        // Definir dimensões padrão se não estiverem definidas
        const parent = canvas.parentElement;
        if (parent) {
            const parentWidth = parent.clientWidth || 400;
            const parentHeight = parent.clientHeight || 300;
            
            // Garantir que o canvas tenha dimensões adequadas
            canvas.style.width = '100%';
            canvas.style.height = '300px';
            canvas.style.maxHeight = '400px';
            canvas.width = parentWidth;
            canvas.height = Math.min(300, parentHeight);
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transformations
        }

        return ctx;
    }

    /**
     * Aguarda o container estar visível antes de criar o gráfico
     */
    function waitForContainerVisible(elementId, maxWait = 3000) {
        return new Promise((resolve) => {
            const element = document.getElementById(elementId);
            if (!element) {
                console.warn(`⚠️ Elemento ${elementId} não encontrado`);
                resolve(false);
                return;
            }

            // Helper robusto para visibilidade real (considera ancestrais)
            const isActuallyVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return false;
                // Verificar ancestrais próximos (até 3 níveis) para display:none
                let p = el.parentElement;
                let depth = 0;
                while (p && depth < 3) {
                    const ps = window.getComputedStyle(p);
                    if (ps.display === 'none' || ps.visibility === 'hidden') return false;
                    p = p.parentElement; depth++;
                }
                return true;
            };

            // Polling com tentativas para aguardar tabs/accordions exibirem o container
            const maxAttempts = 20; // ~5s com delay 250ms
            let attempts = 0;
            const tryCheck = () => {
                attempts++;
                const ok = isActuallyVisible(element.parentElement || element);
                if (ok) {
                    resolve(true);
                } else if (attempts < maxAttempts) {
                    setTimeout(tryCheck, 250);
                } else {
                    // Sem bloquear: permitir criação posterior sob demanda
                    resolve(false);
                }
            };

            if (isActuallyVisible(element.parentElement || element)) {
                resolve(true);
            } else {
                tryCheck();
            }
        });
    }

    /**
     * Cria um gráfico de forma segura
     */
    function createChart(chartKey, canvasId, config) {
        try {
            // Destruir gráfico existente
            destroyChart(chartKey);

            // Preparar canvas
            const ctx = prepareCanvas(canvasId);
            if (!ctx) return null;

            // Verificar se Chart.js está disponível
            if (!isChartJsLoaded()) {
                console.error(`❌ Chart.js não disponível para criar ${chartKey}`);
                return null;
            }

            // Aguardar container estar visível
            return waitForContainerVisible(canvasId).then((isVisible) => {
                if (!isVisible) {
                    // Evitar ruído no console; agenda nova tentativa quando a UI provavelmente já carregou
                    setTimeout(() => {
                        // Tentar novamente silenciosamente
                        createChart(chartKey, canvasId, config);
                    }, 500);
                    return null;
                }

                try {
                    // Verificar se já existe um gráfico com esse canvas e destruir
                    const existingChart = Chart.getChart(canvasId);
                    if (existingChart) {
                        console.log(`🧹 Destruindo gráfico existente no canvas ${canvasId}`);
                        existingChart.destroy();
                    }

                    // Criar novo gráfico
                    console.log(`📊 Criando gráfico: ${chartKey}`);
                    const chart = new Chart(ctx, config);
                    chartRegistry[chartKey] = chart;
                    
                    return chart;
                } catch (error) {
                    console.error(`❌ Erro ao criar gráfico ${chartKey}:`, error);
                    return null;
                }
            });

        } catch (error) {
            console.error(`❌ Erro ao criar gráfico ${chartKey}:`, error);
            return null;
        }
    }

    /**
     * Limpa todos os gráficos do dashboard
     */
    function clearAllCharts() {
        console.log('🧹 Limpando todos os gráficos...');
        
        Object.keys(chartRegistry).forEach(chartKey => {
            destroyChart(chartKey);
        });
        
        console.log('✅ Todos os gráficos foram limpos');
    }

    /**
     * Renderiza gráfico com tratamento de erro robusto
     */
    function safeRenderChart(chartKey, canvasId, renderFunction, data, fallbackMessage = 'Sem dados disponíveis') {
        try {
            if (!isChartJsLoaded()) {
                console.warn(`⚠️ Chart.js não carregado para ${chartKey}`);
                displayChartFallback(canvasId, 'Biblioteca de gráficos não carregada');
                return;
            }

            if (!data || (Array.isArray(data) && data.length === 0)) {
                console.warn(`⚠️ Dados vazios para ${chartKey}`);
                displayChartFallback(canvasId, fallbackMessage);
                return;
            }

            renderFunction(data);
        } catch (error) {
            console.error(`❌ Erro ao renderizar ${chartKey}:`, error);
            displayChartFallback(canvasId, 'Erro ao carregar gráfico');
        }
    }

    /**
     * Exibe mensagem de fallback quando gráfico não pode ser renderizado
     */
    function displayChartFallback(canvasId, message) {
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            const parent = canvas.parentElement;
            if (parent) {
                parent.innerHTML = `
                    <div class="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <div class="text-center text-gray-500">
                            <i class="fas fa-chart-bar text-3xl mb-2"></i>
                            <p>${message}</p>
                        </div>
                    </div>
                `;
            }
        }
    }

    // ========== FUNÇÕES PARA GASTOS RECORRENTES ==========
    
    async function openRecurringModal() {
        if (recurringModal) {
            recurringModal.classList.remove('hidden');
            setTimeout(() => recurringModal.classList.remove('opacity-0'), 10);
            await loadRecurringExpenses();
        }
    }

    function closeRecurringModal() {
        if (recurringModal) {
            recurringModal.classList.add('opacity-0');
            setTimeout(() => recurringModal.classList.add('hidden'), 300);
        }
    }

    async function loadRecurringExpenses() {
        try {
            // Buscar gastos da conta unificada PIX/Boleto pela rota dedicada
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses/pix-boleto`);
            if (response.ok) {
                const payload = await response.json();
                const expenses = Array.isArray(payload?.expenses) ? payload.expenses : [];
                renderRecurringExpensesList(expenses);
                return;
            }

            // Fallback: alguns backends ainda não possuem a rota dedicada. Tenta a rota genérica com filtro de conta.
            if (response.status === 404) {
                console.warn('Rota /api/expenses/pix-boleto ausente no backend. Aplicando fallback /api/expenses?account=PIX/Boleto');
                const fallbackRes = await authenticatedFetch(`${API_BASE_URL}/api/expenses?account=PIX/Boleto`);
                if (fallbackRes.ok) {
                    const list = await fallbackRes.json();
                    const expenses = Array.isArray(list) ? list : [];
                    renderRecurringExpensesList(expenses);
                    return;
                }
            }

            throw new Error(`Erro ao carregar gastos da conta PIX/Boleto (status ${response.status})`);
        } catch (error) {
            console.error('Erro ao carregar gastos PIX/Boleto:', error);
            showNotification('Erro ao carregar gastos PIX/Boleto', 'error');
        }
    }

    function renderRecurringExpensesList(expenses) {
        if (!recurringList) return;

        if (expenses.length === 0) {
            recurringList.innerHTML = '<p class="text-gray-500 text-center">Nenhum gasto encontrado para PIX/Boleto.</p>';
            return;
        }

        // Renderiza itens de despesas (não necessariamente recorrentes) da conta PIX/Boleto
        recurringList.innerHTML = expenses.map(item => {
            const amount = Number(item.amount || item.valor || 0);
            const date = new Date(item.transaction_date || item.date);
            const isRecurring = !!item.is_recurring_expense;
            const business = !!item.is_business_expense;
            const plan = item.account_plan_code;

            return `
            <div class="bg-gray-50 p-4 rounded-lg mb-3">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h4 class="font-medium text-gray-800">${item.description || 'Sem descrição'}</h4>
                        <p class="text-sm text-gray-600">
                            <strong>Valor:</strong> ${formatCurrency(amount)} | 
                            <strong>Conta:</strong> ${item.account || 'PIX/Boleto'} | 
                            <strong>Data:</strong> ${isNaN(date) ? '-' : date.toLocaleDateString('pt-BR')}
                        </p>
                        ${plan ? `<p class="text-sm text-gray-600"><strong>Plano:</strong> ${plan}</p>` : ''}
                        <p class="text-sm ${business ? 'text-blue-600' : 'text-green-600'}">
                            ${business ? '💼 Empresarial' : '🏠 Pessoal'} ${isRecurring ? '• 🔁 Recorrente' : ''}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        ${isRecurring ? `
                        <button onclick="editRecurringExpense(${item.recurring_expense_id || item.id})" 
                                class="bg-blue-500 text-white px-3 py-1 rounded text-sm">
                            Editar
                        </button>
                        <button onclick="deleteRecurringExpense(${item.recurring_expense_id || item.id})" 
                                class="bg-red-500 text-white px-3 py-1 rounded text-sm">
                            Remover
                        </button>` : ''}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    async function handleRecurringExpenseSubmit(e) {
        e.preventDefault();

        const formData = new FormData(recurringForm);
        const data = {
            description: formData.get('description'),
            amount: parseFloat(formData.get('amount')),
            account: formData.get('account'),
            account_plan_code: formData.get('account_plan_code') || null,
            is_business_expense: formData.get('is_business_expense') === 'on',
            day_of_month: parseInt(formData.get('day_of_month')) || 1
        };

        // Validar se é conta permitida
    if (data.account !== 'PIX/Boleto') {
            showNotification('Gastos recorrentes só são permitidos para contas PIX e Boleto', 'error');
            return;
        }

        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/api/recurring-expenses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) throw new Error('Erro ao criar gasto recorrente');

            showNotification('Gasto recorrente criado com sucesso!', 'success');
            recurringForm.reset();
            await loadRecurringExpenses();
        } catch (error) {
            console.error('Erro ao criar gasto recorrente:', error);
            showNotification('Erro ao criar gasto recorrente', 'error');
        }
    }

    async function deleteRecurringExpense(id) {
        if (!confirm('Tem certeza que deseja remover este gasto recorrente?')) return;

        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/api/recurring-expenses/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Erro ao remover gasto recorrente');

            showNotification('Gasto recorrente removido com sucesso!', 'success');
            await loadRecurringExpenses();
        } catch (error) {
            console.error('Erro ao remover gasto recorrente:', error);
            showNotification('Erro ao remover gasto recorrente', 'error');
        }
    }

    async function processRecurringExpenses() {
        const year = filterYear.value;
        const month = filterMonth.value;

        if (!year || !month) {
            showNotification('Selecione ano e mês para processar', 'error');
            return;
        }

        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/api/recurring-expenses/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ year: parseInt(year), month: parseInt(month) })
            });

            const result = await response.json();

            if (!response.ok) throw new Error(result.message);

            showNotification(result.message, 'success');
            await fetchAllData(); // Recarregar dados do dashboard
        } catch (error) {
            console.error('Erro ao processar gastos recorrentes:', error);
            showNotification('Erro ao processar gastos recorrentes', 'error');
        }
    }

    // Tornar funções globais para uso nos botões
    window.editRecurringExpense = async function(id) {
        // Implementar funcionalidade de edição
        showNotification('Funcionalidade de edição em desenvolvimento', 'info');
    };

    window.deleteRecurringExpense = deleteRecurringExpense;

    // ========== SISTEMA DE TABS (DRY, delega em switchMainTab) ==========
    function initializeTabs() {
        // Seleciona apenas botões de abas principais, ignorando botões do sistema de insights
        const tabButtons = Array.from(document.querySelectorAll('.tab-button[data-tab]'))
            .filter(btn => !btn.classList.contains('insight-tab-btn'));
        if (!tabButtons || tabButtons.length === 0) return;

        // Evita múltiplos event listeners em re-inicializações
        tabButtons.forEach(button => {
            if (button.dataset.tabInit === '1') return;
            button.addEventListener('click', () => switchMainTab(button.dataset.tab));
            button.dataset.tabInit = '1';
        });

        // Ativa uma aba inicial de forma centralizada (apenas entre as abas principais)
        const initiallyActive = document.querySelector('.tab-button.active[data-tab]:not(.insight-tab-btn)') || tabButtons[0];
        if (initiallyActive) {
            // Centraliza a troca e os carregamentos condicionais
            switchMainTab(initiallyActive.dataset.tab);
        }
    }

    // ========== ANÁLISE EMPRESARIAL REVISADA ==========
    async function loadBusinessAnalysis() {
        try {
            const token = getToken();
            if (!token) return;

            showNotification('Carregando análise empresarial...', 'info', 2000);

            // Carregar dados básicos e indicadores principais
            await loadBusinessMetrics();
            
            // Carregar gráfico anual principal
            await loadYearlyBusinessChart();
            
            // Carregar gráficos secundários
            await loadBusinessSecondaryCharts();
            
            // Configurar filtros
            setupBusinessFilters();
            
            // Executar análise de categorias automaticamente para preencher "Detalhes por Categoria"
            try {
                const analyzeBtn = document.getElementById('analyze-chart-usage');
                if (analyzeBtn) {
                    await analyzeChartUsage();
                }
            } catch (autoErr) {
                console.warn('Falha ao executar análise automática de categorias:', autoErr);
            }

            showNotification('Análise empresarial carregada com sucesso!', 'success', 3000);

        } catch (error) {
            console.error('Erro ao carregar análise empresarial:', error);
            showNotification('Erro ao carregar dados empresariais: ' + error.message, 'error');
        }
    }

    // Função para carregar métricas principais da análise empresarial
    async function loadBusinessMetrics() {
        try {
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            
            // Carregar dados do mês atual
            const currentData = await fetchBusinessData(currentYear, currentMonth);
            
            // Carregar dados do mês passado para comparação
            const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
            const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
            const lastMonthData = await fetchBusinessData(lastMonthYear, lastMonth);
            
            // Carregar previsões usando nova API
            const predictionsResponse = await authenticatedFetch(
                `${API_BASE_URL}/api/business/predictions?year=${currentYear}&month=${currentMonth}`
            );
            
            let predictions = { predicted: 0, futureInstallments: 0 };
            if (predictionsResponse.ok) {
                predictions = await predictionsResponse.json();
            }
            
            // Atualizar indicadores na interface
            updateBusinessIndicators({
                predicted: predictions.predicted,
                actual: currentData.total,
                count: currentData.count,
                lastMonth: lastMonthData.total,
                future: predictions.futureInstallments
            });
            
        } catch (error) {
            console.error('Erro ao carregar métricas empresariais:', error);
            throw error;
        }
    }

    // Função para aplicar filtros empresariais usando metadatabase
    async function applyBusinessFilters() {
        try {
            showNotification('Aplicando filtros...', 'info', 1000);
            
            const filters = getBusinessFilters();
            
            // Construir parâmetros para a API
            const params = new URLSearchParams();
            if (filters.year) params.append('year', filters.year);
            if (filters.month) params.append('month', filters.month);
            if (filters.account) params.append('account', filters.account);
            if (filters.category) params.append('category', filters.category);
            if (filters.search) params.append('search', filters.search);
            if (filters.minAmount) params.append('minAmount', filters.minAmount);
            if (filters.maxAmount) params.append('maxAmount', filters.maxAmount);
            if (filters.invoiceStatus) params.append('invoiceStatus', filters.invoiceStatus);
            
            // Chamar API de análise avançada
            const response = await authenticatedFetch(
                `${API_BASE_URL}/api/business/advanced-analysis?${params.toString()}`
            );
            
            if (!response.ok) {
                throw new Error('Erro ao aplicar filtros');
            }
            
            const data = await response.json();
            
            // Atualizar gráficos com dados filtrados
            await updateBusinessAccountChart(data.summary);
            await updateBusinessCategoryChart(data.summary);
            
            // Atualizar estatísticas filtradas
            updateFilteredStats(data.summary);
            
            showNotification('Filtros aplicados com sucesso!', 'success', 2000);
            
        } catch (error) {
            console.error('Erro ao aplicar filtros:', error);
            showNotification('Erro ao aplicar filtros', 'error');
        }
    }

    // Função para atualizar estatísticas filtradas
    function updateFilteredStats(summary) {
        // Atualizar os indicadores principais com dados filtrados
        const filteredTotalEl = document.getElementById('actual-expenses');
        const filteredCountEl = document.getElementById('expenses-count');
        
        if (filteredTotalEl) {
            filteredTotalEl.textContent = formatCurrency(summary.total);
        }
        if (filteredCountEl) {
            filteredCountEl.textContent = summary.count;
        }
        
        console.log('Estatísticas filtradas atualizadas:', summary);
    }

    // Função para atualizar indicadores na interface
    function updateBusinessIndicators(data) {
        const predictedEl = document.getElementById('predicted-expenses');
        const actualEl = document.getElementById('actual-expenses');
        const countEl = document.getElementById('expenses-count');
        const comparisonEl = document.getElementById('month-comparison');
        const futureEl = document.getElementById('future-installments');
        
        if (predictedEl) predictedEl.textContent = formatCurrency(data.predicted);
        if (actualEl) actualEl.textContent = formatCurrency(data.actual);
        if (countEl) countEl.textContent = data.count;
        if (futureEl) futureEl.textContent = formatCurrency(data.future);
        
        // Calcular e mostrar comparação com mês passado
        if (comparisonEl && data.lastMonth > 0) {
            const growth = ((data.actual - data.lastMonth) / data.lastMonth * 100);
            const growthText = growth >= 0 ? `+${growth.toFixed(1)}%` : `${growth.toFixed(1)}%`;
            const growthColor = growth >= 0 ? 'text-green-400' : 'text-red-400';
            
            comparisonEl.textContent = growthText;
            comparisonEl.className = `text-2xl font-extrabold ${growthColor} mt-1`;
        }
    }

    // Função para carregar gráfico anual de gastos empresariais
    async function loadYearlyBusinessChart() {
        try {
            if (!await waitForChartJs()) {
                console.warn('Chart.js não carregado para gráfico anual');
                return;
            }

            const yearSelect = document.getElementById('yearly-chart-year');
            const currentYear = new Date().getFullYear();
            
            // Preencher opções de ano (incluindo anos futuros até 2027)
            if (yearSelect) {
                yearSelect.innerHTML = '';
                for (let year = currentYear + 3; year >= currentYear - 5; year--) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    if (year === currentYear) option.selected = true;
                    yearSelect.appendChild(option);
                }
            }
            
            // Carregar dados do ano atual
            await updateYearlyChart(currentYear);
            
        } catch (error) {
            console.error('Erro ao carregar gráfico anual:', error);
        }
    }

    // Função para atualizar gráfico anual
    async function updateYearlyChart(year) {
        try {
            const canvas = document.getElementById('business-yearly-chart');
            if (!canvas) {
                console.warn('Canvas business-yearly-chart não encontrado');
                return;
            }

            // Buscar dados de tendências empresariais
            const response = await authenticatedFetch(`${API_BASE_URL}/api/business/trends?months=12`);
            
            if (!response.ok) {
                throw new Error('Erro ao buscar dados de tendências');
            }
            
            const trendsData = await response.json();
            
            // Filtrar dados para o ano selecionado
            const yearData = trendsData.filter(item => item.year === parseInt(year));
            
            // Preparar dados para o gráfico
            const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                           'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            
            const monthlyData = new Array(12).fill(0);
            const monthlyCount = new Array(12).fill(0);
            
            yearData.forEach(item => {
                const monthIndex = item.month - 1;
                if (monthIndex >= 0 && monthIndex < 12) {
                    monthlyData[monthIndex] = item.total;
                    monthlyCount[monthIndex] = item.count;
                }
            });

            // Destruir gráfico existente se houver
            if (charts['business-yearly']) {
                charts['business-yearly'].destroy();
            }

            const ctx = canvas.getContext('2d');
            
            charts['business-yearly'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{
                        label: 'Gastos Empresariais (R$)',
                        data: monthlyData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: `Evolução de Gastos Empresariais - ${year}`,
                            font: {
                                size: 16,
                                weight: 'bold'
                            }
                        },
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#ffffff',
                            bodyColor: '#ffffff',
                            borderColor: '#3b82f6',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    const value = context.parsed.y;
                                    const count = monthlyCount[context.dataIndex];
                                    return [
                                        `Total: ${formatCurrency(value)}`,
                                        `Transações: ${count}`,
                                        `Média: ${count > 0 ? formatCurrency(value / count) : 'R$ 0,00'}`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value.toLocaleString('pt-BR');
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Erro ao atualizar gráfico anual:', error);
        }
    }

    // Função para carregar gráficos secundários
    async function loadBusinessSecondaryCharts() {
        try {
            const currentDate = new Date();
            const filters = getBusinessFilters();
            
            const businessData = await fetchBusinessData(
                filters.year || currentDate.getFullYear(),
                filters.month || null
            );
            
            await updateBusinessAccountChart(businessData);
            await updateBusinessCategoryChart(businessData);
            
        } catch (error) {
            console.error('Erro ao carregar gráficos secundários:', error);
        }
    }

    // Função para configurar filtros empresariais
    function setupBusinessFilters() {
        const periodSelect = document.getElementById('business-period');
        const customFields = document.getElementById('custom-date-fields');
        const accountSelect = document.getElementById('business-account');
        const categorySelect = document.getElementById('business-category');
        const applyFiltersBtn = document.getElementById('apply-business-filters');
        const refreshYearlyBtn = document.getElementById('refresh-yearly-chart');
        const yearSelect = document.getElementById('yearly-chart-year');

        // Configurar mudança de período
        if (periodSelect) {
            periodSelect.addEventListener('change', function() {
                if (customFields) {
                    customFields.classList.toggle('hidden', this.value !== 'custom');
                }
            });
        }

        // Aplicar filtros
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', async function() {
                await applyBusinessFilters();
            });
        }

        // Atualizar gráfico anual
        if (refreshYearlyBtn && yearSelect) {
            refreshYearlyBtn.addEventListener('click', async function() {
                const selectedYear = parseInt(yearSelect.value);
                await updateYearlyChart(selectedYear);
            });
            
            yearSelect.addEventListener('change', async function() {
                await updateYearlyChart(parseInt(this.value));
            });
        }

        // Preencher opções de contas e categorias
        populateBusinessFilterOptions();
    }

    // Função para obter filtros atuais
    function getBusinessFilters() {
        const period = document.getElementById('business-period')?.value;
        const account = document.getElementById('business-account')?.value;
        const category = document.getElementById('business-category')?.value;
        const search = document.getElementById('business-search')?.value;
        const minAmount = document.getElementById('business-min-amount')?.value;
        const maxAmount = document.getElementById('business-max-amount')?.value;
        const invoiceStatus = document.getElementById('business-invoice-status')?.value;
        
        const currentDate = new Date();
        let year = currentDate.getFullYear();
        let month = null;
        
        // Determinar período baseado na seleção
        switch (period) {
            case 'current-month':
                month = currentDate.getMonth() + 1;
                break;
            case 'last-month':
                const lastMonth = currentDate.getMonth();
                month = lastMonth === 0 ? 12 : lastMonth;
                year = lastMonth === 0 ? year - 1 : year;
                break;
            case 'quarter':
                const quarter = Math.floor(currentDate.getMonth() / 3);
                // Para trimestre, não definimos mês específico
                break;
            case 'year':
                // Ano inteiro, month permanece null
                break;
            case 'custom':
                const dateFrom = document.getElementById('business-date-from')?.value;
                const dateTo = document.getElementById('business-date-to')?.value;
                // Para custom, precisaríamos de lógica adicional
                break;
        }
        
        return {
            period,
            year,
            month,
            account,
            category,
            search,
            minAmount: minAmount ? parseFloat(minAmount) : null,
            maxAmount: maxAmount ? parseFloat(maxAmount) : null,
            invoiceStatus
        };
    }

    // Função para preencher opções de filtros
    async function populateBusinessFilterOptions() {
        try {
            // Buscar todas as despesas empresariais para extrair opções únicas
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses`);
            
            if (!response.ok) return;
            
            const allExpenses = await response.json();
            const businessExpenses = allExpenses.filter(expense => expense.is_business_expense);
            
            // Extrair contas únicas
            const accounts = [...new Set(businessExpenses.map(expense => expense.account))];
            const accountSelect = document.getElementById('business-account');
            
            if (accountSelect) {
                // Limpar opções existentes (exceto "Todas")
                accountSelect.innerHTML = '<option value="">Todas</option>';
                
                accounts.forEach(account => {
                    if (account) {
                        const option = document.createElement('option');
                        option.value = account;
                        option.textContent = account;
                        accountSelect.appendChild(option);
                    }
                });
            }
            
            // Extrair categorias únicas
            const categories = [...new Set(businessExpenses.map(expense => expense.description))];
            const categorySelect = document.getElementById('business-category');
            
            if (categorySelect) {
                categorySelect.innerHTML = '<option value="">Todas</option>';
                
                categories.forEach(category => {
                    if (category) {
                        const option = document.createElement('option');
                        option.value = category;
                        option.textContent = category.length > 30 ? 
                            category.substring(0, 30) + '...' : category;
                        categorySelect.appendChild(option);
                    }
                });
            }
            
        } catch (error) {
            console.error('Erro ao popular opções de filtros:', error);
        }
    }

    async function fetchBusinessData(year, month) {
        try {
            // Usar a nova API de resumo empresarial
            const response = await authenticatedFetch(`${API_BASE_URL}/api/business/summary?year=${year}&month=${month}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar dados empresariais');
            }
            
            const businessSummary = await response.json();
            
            console.log('Resumo empresarial da API:', businessSummary);
            
            return {
                total: parseFloat(businessSummary.total) || 0,
                count: parseInt(businessSummary.count) || 0,
                average: parseFloat(businessSummary.average) || 0,
                invoiced: parseFloat(businessSummary.invoiced_total) || 0,
                nonInvoiced: parseFloat(businessSummary.non_invoiced_total) || 0,
                invoiced_count: parseInt(businessSummary.invoiced_count) || 0,
                non_invoiced_count: parseInt(businessSummary.non_invoiced_count) || 0,
                byAccount: businessSummary.byAccount || {},
                byCategory: businessSummary.byCategory || {}
            };
        } catch (error) {
            console.error('Erro ao buscar dados empresariais:', error);
            
            // Fallback para o método antigo se a nova API falhar
            console.log('Tentando método alternativo...');
            
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses?year=${year}&month=${month}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar dados');
            }
            
            const allExpenses = await response.json();
            const businessExpenses = allExpenses.filter(expense => expense.is_business_expense);
            
            return {
                total: businessExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0),
                count: businessExpenses.length,
                average: businessExpenses.length > 0 ? businessExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0) / businessExpenses.length : 0,
                invoiced: businessExpenses.filter(exp => exp.invoice_path).reduce((sum, exp) => sum + parseFloat(exp.amount), 0),
                nonInvoiced: businessExpenses.filter(exp => !exp.invoice_path).reduce((sum, exp) => sum + parseFloat(exp.amount), 0),
                invoiced_count: businessExpenses.filter(exp => exp.invoice_path).length,
                non_invoiced_count: businessExpenses.filter(exp => !exp.invoice_path).length,
                byAccount: groupByAccount(businessExpenses),
                byCategory: groupByCategory(businessExpenses)
            };
        }
    }

    async function updateBusinessMetrics(data) {
        const businessTotal = document.getElementById('business-total');
        const businessGrowth = document.getElementById('business-growth');
        const businessInvoiced = document.getElementById('business-invoiced');
        const businessNonInvoiced = document.getElementById('business-non-invoiced');

        if (businessTotal) businessTotal.textContent = `R$ ${data.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (businessInvoiced) businessInvoiced.textContent = `R$ ${data.invoiced.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (businessNonInvoiced) businessNonInvoiced.textContent = `R$ ${data.nonInvoiced.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        // Calcular crescimento comparando com mês anterior
        try {
            const currentDate = new Date();
            const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
            const year = lastMonth.getFullYear();
            const month = lastMonth.getMonth() + 1;
            
            const response = await authenticatedFetch(`${API_BASE_URL}/api/business/summary?year=${year}&month=${month}`);
            
            if (response.ok) {
                const lastMonthData = await response.json();
                const lastMonthTotal = parseFloat(lastMonthData.total) || 0;
                
                if (lastMonthTotal > 0) {
                    const growthRate = ((data.total - lastMonthTotal) / lastMonthTotal * 100);
                    const growthText = growthRate >= 0 ? `+${growthRate.toFixed(1)}%` : `${growthRate.toFixed(1)}%`;
                    const growthColor = growthRate >= 0 ? 'text-green-600' : 'text-red-600';
                    
                    if (businessGrowth) {
                        businessGrowth.textContent = growthText;
                        businessGrowth.className = `font-semibold ${growthColor}`;
                    }
                } else {
                    if (businessGrowth) {
                        businessGrowth.textContent = 'N/A';
                        businessGrowth.className = 'font-semibold text-gray-500';
                    }
                }
            } else {
                if (businessGrowth) {
                    businessGrowth.textContent = 'N/A';
                    businessGrowth.className = 'font-semibold text-gray-500';
                }
            }
        } catch (error) {
            console.warn('Erro ao calcular crescimento:', error);
            if (businessGrowth) {
                businessGrowth.textContent = 'N/A';
                businessGrowth.className = 'font-semibold text-gray-500';
            }
        }
    }

    async function updateBusinessCharts(data) {
        try {
            // Aguardar Chart.js estar carregado antes de criar gráficos
            if (!await waitForChartJs()) {
                console.warn('Chart.js não carregado para gráficos empresariais');
                showNotification('Carregando biblioteca de gráficos...', 'info', 3000);
                return;
            }

            console.log('Atualizando gráficos empresariais com dados:', data);

            // Chart de evolução mensal com análise de tendências
            await updateBusinessEvolutionChart(data);
            
            // Chart por conta
            await updateBusinessAccountChart(data);
            
            // Chart por categoria
            await updateBusinessCategoryChart(data);

            console.log('Gráficos empresariais atualizados com sucesso');

        } catch (error) {
            console.error('Erro ao atualizar gráficos empresariais:', error);
            showNotification('Erro ao carregar análise empresarial', 'error');
        }
    }

    // ========== FUNÇÕES UTILITÁRIAS ==========
    
    function formatCurrency(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return 'R$ 0,00';
        }
        
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(numValue);
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }

    function formatNumber(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return '0';
        }
        return new Intl.NumberFormat('pt-BR').format(value);
    }

    // Função para exibir modais customizados
    function showModal(title, content) {
        // Remover modal existente se houver
        const existingModal = document.getElementById('custom-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Criar modal
        const modal = document.createElement('div');
        modal.id = 'custom-modal';
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50';
        modal.innerHTML = `
            <div class="relative top-20 mx-auto p-5 border w-11/12 md:w-1/2 lg:w-1/3 shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-bold text-gray-900">${title}</h3>
                        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 focus:outline-none">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="text-sm text-gray-500">
                        ${content}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Fechar modal ao clicar fora
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // Função para fechar modal
    function closeModal() {
        const modal = document.getElementById('custom-modal');
        if (modal) {
            modal.remove();
        }
    }

    // Tornar função global para uso nos botões
    window.closeModal = closeModal;

    // Função para gerar cores distintas para gráficos
    function generateDistinctColors(count) {
        const colors = [
            'rgba(59, 130, 246, 0.7)',   // Blue
            'rgba(34, 197, 94, 0.7)',    // Green
            'rgba(239, 68, 68, 0.7)',    // Red
            'rgba(251, 146, 60, 0.7)',   // Orange
            'rgba(168, 85, 247, 0.7)',   // Purple
            'rgba(250, 204, 21, 0.7)',   // Yellow
            'rgba(14, 165, 233, 0.7)',   // Light Blue
            'rgba(236, 72, 153, 0.7)',   // Pink
            'rgba(16, 185, 129, 0.7)',   // Emerald
            'rgba(245, 101, 101, 0.7)',  // Light Red
            'rgba(139, 92, 246, 0.7)',   // Violet
            'rgba(6, 182, 212, 0.7)',    // Cyan
        ];

        // Se precisar de mais cores, gerar dinamicamente
        if (count > colors.length) {
            for (let i = colors.length; i < count; i++) {
                const hue = (i * 137.508) % 360; // Golden angle approximation
                colors.push(`hsla(${hue}, 70%, 60%, 0.7)`);
            }
        }

        return colors.slice(0, count);
    }

    // Função para gerar relatório PDF
    async function generatePDFReport() {
        try {
            showNotification('Gerando relatório PDF...', 'info');
            
            const currentYear = filterYear.value;
            const currentMonth = filterMonth.value;
            
            const response = await authenticatedFetch(`${API_BASE_URL}/api/reports/pdf?year=${currentYear}&month=${currentMonth}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Erro ao gerar relatório');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `relatorio_${currentYear}_${currentMonth}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showNotification('Relatório PDF gerado com sucesso!', 'success');
            closeModal();
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            showNotification('Erro ao gerar relatório PDF', 'error');
        }
    }

    // Tornar função global para uso nos botões
    window.generatePDFReport = generatePDFReport;

    // ========== CARREGAMENTO DE DADOS DA ABA RELATÓRIOS ==========
    
    // Função para buscar dados de despesas (faltava essa função)
    async function fetchExpenses() {
        try {
            if (!checkAuthentication()) return [];

            const params = new URLSearchParams({
                year: filterYear.value,
                month: filterMonth.value
            });

            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses?${params.toString()}`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar despesas.');
            }

            const expenses = await response.json();
            console.log('📊 Despesas obtidas:', expenses.length);
            return expenses;
        } catch (error) {
            console.error('❌ Erro ao buscar despesas:', error);
            return [];
        }
    }

    // Função helper para obter ano e mês de forma segura
    function getCurrentPeriod() {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        
        // Tentar obter valores dos filtros, senão usar valores atuais
        const year = (filterYear?.value && filterYear.value !== '') ? filterYear.value : currentYear;
        const month = (filterMonth?.value && filterMonth.value !== '') ? filterMonth.value : currentMonth;
        
        return {
            year: year.toString(),
            month: month.toString()
        };
    }

    // Função para buscar dados do dashboard (normalizado para o sistema de insights)
    async function fetchDashboardData() {
        try {
            const { year, month } = getCurrentPeriod();
            console.log(`📊 Buscando dados p/ insights: ano=${year}, mês=${month}`);

            // Calcular janela de 6 meses para métricas históricas
            const end = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
            const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
            const startYear = start.getFullYear();
            const startMonth = start.getMonth() + 1; // 1-12
            const endYear = end.getFullYear();
            const endMonth = end.getMonth() + 1; // 1-12

            // Buscar despesas do período atual e histórico agregado em paralelo
            const [expensesRes, historyRes] = await Promise.all([
                authenticatedFetch(`${API_BASE_URL}/api/expenses?year=${year}&month=${month}`),
                authenticatedFetch(`${API_BASE_URL}/api/expenses/history?aggregate=true&startYear=${startYear}&startMonth=${startMonth}&endYear=${endYear}&endMonth=${endMonth}`)
            ]);

            if (!expensesRes.ok) {
                const err = await expensesRes.json().catch(() => ({}));
                throw new Error(err.message || 'Erro ao buscar despesas.');
            }

            // expenses: lista detalhada do mês
            const rawExpenses = await expensesRes.json();
            const expenses = (rawExpenses || []).map(exp => ({
                // Campos esperados pelo sistema de insights
                data: exp.transaction_date,
                valor: parseFloat(exp.amount) || 0,
                descricao_conta: exp.description || 'Outros',
                empresarial: !!exp.is_business_expense,
                // Extras úteis
                conta: exp.account,
                plano: exp.account_plan_code,
                fatura: !!exp.invoice_path
            }));

            // history: agregados mensais para calcular médias/variações
            let monthlyAverage = 0;
            let growthRate = 0;
            let variationCoefficient = 0;

            if (historyRes.ok) {
                const hist = await historyRes.json();
                const monthsArr = Array.isArray(hist?.months) ? hist.months : [];
                const totals = monthsArr.map(m => parseFloat(m.total) || 0);

                if (totals.length > 0) {
                    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
                    monthlyAverage = mean;
                    if (totals.length >= 2) {
                        const prev = totals[totals.length - 2];
                        const curr = totals[totals.length - 1];
                        growthRate = prev > 0 ? ((curr / prev) - 1) * 100 : 0;
                    }
                    // Desvio padrão e coeficiente de variação (%): std/mean*100
                    if (mean > 0 && totals.length >= 2) {
                        const variance = totals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / totals.length;
                        const std = Math.sqrt(variance);
                        variationCoefficient = (std / mean) * 100;
                    }
                }
            } else {
                // Fallback simples: usar total do mês atual como média e variação = 0
                const totalAtual = expenses.reduce((s, e) => s + e.valor, 0);
                monthlyAverage = totalAtual;
                growthRate = 0;
                variationCoefficient = 0;
            }

            return {
                expenses,
                monthlyAverage,
                growthRate,
                variationCoefficient
            };
        } catch (error) {
            console.error('❌ Erro ao montar dados para insights:', error);
            // Retornar estrutura vazia porém consistente
            return {
                expenses: [],
                monthlyAverage: 0,
                growthRate: 0,
                variationCoefficient: 0
            };
        }
    }

    async function loadReportsData() {
        try {
            console.log('🔄 Iniciando loadReportsData...');
            
            if (!checkAuthentication()) {
                console.error('❌ Usuário não autenticado');
                return;
            }

            console.log('✅ Usuário autenticado, carregando dados...');
            showNotification('Carregando dashboard executivo...', 'info', 2000);

            // Verificar se os filtros estão disponíveis
            if (!filterYear || !filterMonth) {
                console.error('❌ Filtros de ano/mês não encontrados');
                showNotification('Erro: Filtros não inicializados', 'error');
                return;
            }

            console.log(`📅 Buscando dados para: ${filterYear.value}/${filterMonth.value}`);

            // Aguardar Chart.js estar carregado
            if (!await waitForChartJs()) {
                console.warn('⚠️ Chart.js não carregado para relatórios');
                showNotification('Carregando biblioteca de gráficos...', 'info', 3000);
                return;
            }

            console.log('✅ Chart.js carregado, buscando dados...');

            // Buscar dados atualizados
            const [expenses, dashboardData] = await Promise.all([
                fetchExpenses(),
                fetchDashboardData()
            ]);

            console.log('📊 Dados obtidos:', { 
                expenses: expenses?.length || 0, 
                dashboardData: !!dashboardData,
                expensesType: typeof expenses
            });

            if (!expenses || expenses.length === 0) {
                console.warn('⚠️ Nenhuma despesa encontrada para o período');
                showNotification('Nenhuma despesa encontrada para o período selecionado', 'warning');
            }

            // Atualizar indicadores principais
            console.log('📊 Atualizando indicadores principais...');
            updateMainIndicators(expenses);
            
            // Renderizar todos os gráficos com dados reais
            console.log('🎨 Renderizando gráficos...');
            await renderAllReportsCharts(expenses, dashboardData);
            
            // Atualizar análise empresarial
            console.log('🏢 Atualizando análise empresarial...');
            updateBusinessAnalysis(expenses);
            
            // Gerar tabela de alertas
            console.log('⚠️ Gerando tabela de alertas...');
            generateAlertsTable(expenses);

            console.log('✅ Dashboard executivo carregado com sucesso');
            showNotification('Dashboard executivo atualizado!', 'success', 2000);

        } catch (error) {
            console.error('❌ Erro ao carregar dados de relatórios:', error);
            showNotification(`Erro ao carregar dados: ${error.message}`, 'error');
        }
    }

    function updateMainIndicators(expenses) {
        const tetos = {
            1: 1000.00, 2: 2782.47, 3: 2431.67, 4: 350.00, 5: 2100.00,
                6: 586.23, 7: 270.00, 8: 1200.00, 9: 1200.00, 10: 270.00,
                11: 1895.40, 12: 2027.60, 13: 270.00, 14: 63.54, 15: 129.90,
                16: 59.90, 17: 4096.09, 18: 1410.36, 19: 300.00, 20: 300.00,
                21: 150.00, 22: 1134.00, 23: 500.00, 24: 1000.00, 25: 350.00,
                26: 1000.00, 27: 500.00, 28: 450.00, 29: 285.00, 30: 700.00,
                31: 274.31, 32: 450.00, 33: 100.00, 34: 54.80, 35: 1.00,
                36: 1.00, 37: 1.00, 38: 1.00, 39: 300.00, 40: 1.00, 41: 1.00, 
                42: 1.00, 43: 210.00, 44: 1.00, 45: 13061.75,
                46: 600.00, 47: 600.00
        };

    if (!expenses || expenses.length === 0) {
            console.warn('⚠️ Nenhum dado de despesas para atualizar indicadores');
            // Atualizar UI com valores zero
            const safePlansEl = document.getElementById('safe-plans');
            const warningPlansEl = document.getElementById('warning-plans');
            const exceededPlansEl = document.getElementById('exceeded-plans');
            const generalUsageEl = document.getElementById('general-usage');
            const totalBudgetEl = document.getElementById('total-budget');

            if (safePlansEl) safePlansEl.textContent = '0';
            if (warningPlansEl) warningPlansEl.textContent = '0';
            if (exceededPlansEl) exceededPlansEl.textContent = '0';
            // O símbolo % já está no HTML fora do span
            if (generalUsageEl) generalUsageEl.textContent = '0';
            if (totalBudgetEl) totalBudgetEl.textContent = 'R$ 0,00';
            
            console.log('📊 Indicadores zerados');
            return;
        }

        console.log('📊 Processando', expenses.length, 'despesas...');
        
        // Verificar estrutura das despesas
        if (expenses.length > 0) {
            console.log('📋 Exemplo de despesa:', {
                date: expenses[0].date,
                transaction_date: expenses[0].transaction_date,
                plan_conta: expenses[0].plan_conta,
                account_plan_code: expenses[0].account_plan_code,
                amount: expenses[0].amount
            });
        }

        // Usar período selecionado nos filtros (com fallback seguro)
        const { year: selectedYear, month: selectedMonth } = getCurrentPeriod();
        const targetYear = parseInt(selectedYear, 10);
        const targetMonth = parseInt(selectedMonth, 10);

        console.log(`📅 Filtrando para mês/ano selecionados: ${targetMonth}/${targetYear}`);

        // Filtrar gastos do período selecionado - usar transaction_date se date não existir
        const monthlyExpenses = expenses.filter(expense => {
            const dateField = expense.transaction_date || expense.date;
            if (!dateField) {
                console.warn('⚠️ Despesa sem data:', expense);
                return false;
            }

            const expenseDate = new Date(dateField);
            const matchesMonth = (expenseDate.getMonth() + 1) === targetMonth;
            const matchesYear = expenseDate.getFullYear() === targetYear;

            return matchesMonth && matchesYear;
        });

        console.log(`📅 Gastos do mês atual (${currentMonth}/${currentYear}):`, monthlyExpenses.length);

        // Calcular totais por plano
        const planTotals = {};
        monthlyExpenses.forEach(expense => {
            // Usar account_plan_code se plan_conta não existir
            const planId = expense.account_plan_code || expense.plan_conta;
            if (planId) {
                planTotals[planId] = (planTotals[planId] || 0) + parseFloat(expense.amount || 0);
            }
        });

        console.log('💰 Totais por plano:', planTotals);

        // Analisar status dos planos
        let safePlans = 0;
        let warningPlans = 0;
        let exceededPlans = 0;
        let totalBudget = 0;
        let totalSpent = 0;

        Object.keys(tetos).forEach(planId => {
            const budget = tetos[planId];
            const spent = planTotals[planId] || 0;
            const percentage = budget > 0 ? (spent / budget) * 100 : 0;
            
            totalBudget += budget;
            totalSpent += spent;
            
            if (percentage > 100) {
                exceededPlans++;
            } else if (percentage >= 70) {
                warningPlans++;
            } else {
                safePlans++;
            }
        });

        // Atualizar interface dos indicadores
        const safePlansEl = document.getElementById('safe-plans');
        const warningPlansEl = document.getElementById('warning-plans');
        const exceededPlansEl = document.getElementById('exceeded-plans');
        const generalUsageEl = document.getElementById('general-usage');
        const totalBudgetEl = document.getElementById('total-budget');

        if (safePlansEl) safePlansEl.textContent = safePlans;
        if (warningPlansEl) warningPlansEl.textContent = warningPlans;
        if (exceededPlansEl) exceededPlansEl.textContent = exceededPlans;
    // Apenas número; o símbolo % está no HTML
    if (generalUsageEl) generalUsageEl.textContent = Math.round((totalSpent / totalBudget) * 100);
        if (totalBudgetEl) totalBudgetEl.textContent = formatCurrency(totalBudget);

        console.log('📊 Indicadores atualizados:', { safePlans, warningPlans, exceededPlans, totalBudget, totalSpent });
    }

    async function renderAllReportsCharts(expenses, dashboardData) {
        console.log('🎨 Renderizando gráficos dos relatórios...');
        
        try {
            // Aguardar Chart.js estar disponível
            if (!await waitForChartJs()) {
                console.warn('⚠️ Chart.js não disponível para relatórios');
                return;
            }

            // Processar dados para análise por categoria
            console.log('📊 Processando dados para análise por categoria...');
            const categoryData = processCategoryData(expenses);
            console.log('🎯 DEBUG: categoryData processado:', categoryData);
            
            // Renderizar todos os gráficos com dados atualizados
            await Promise.allSettled([
                renderGoalsChart(expenses),
                renderGoalsPlanChart(expenses),
                renderPlanChart(categoryData) // Usar dados processados para categoria
            ]);
            
            console.log('✅ Gráficos renderizados com sucesso');
        } catch (error) {
            console.error('❌ Erro ao renderizar gráficos:', error);
        }
    }

    // Função para processar dados para análise por categoria
    function processCategoryData(expenses) {
        if (!expenses || expenses.length === 0) {
            return [];
        }

        console.log('🔍 Processando dados de categoria...');

        // Agrupar por plano de conta
        const planTotals = {};
        const planCounts = {};

        expenses.forEach(expense => {
            let planCode = expense.account_plan_code;
            
            // Tratar gastos sem categoria
            if (!planCode || planCode === '' || planCode === null) {
                planCode = 'Sem Categoria';
            }

            const amount = parseFloat(expense.amount) || 0;

            if (!planTotals[planCode]) {
                planTotals[planCode] = 0;
                planCounts[planCode] = 0;
            }

            planTotals[planCode] += amount;
            planCounts[planCode] += 1;
        });

        // Converter para array de objetos
        const categoryData = Object.keys(planTotals).map(planCode => ({
            account_plan_code: planCode,
            total: planTotals[planCode],
            count: planCounts[planCode],
            average: planTotals[planCode] / planCounts[planCode]
        }));

        // Ordenar por total decrescente
        categoryData.sort((a, b) => b.total - a.total);

        console.log('📊 Dados de categoria processados:', categoryData);
        return categoryData;
    }

    function updateBusinessAnalysis(expenses) {
        const analysisContent = document.getElementById('business-analysis-content');
        if (!analysisContent) {
            console.warn('⚠️ Elemento business-analysis-content não encontrado');
            return;
        }
        
        if (!expenses || expenses.length === 0) {
            analysisContent.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-gray-400 text-4xl mb-4">📊</div>
                    <p class="text-gray-600">Nenhum dado disponível para análise</p>
                </div>
            `;
            return;
        }
        
        // Usar período selecionado nos filtros
        const { year: selectedYear, month: selectedMonth } = getCurrentPeriod();
        const targetYear = parseInt(selectedYear, 10);
        const targetMonth = parseInt(selectedMonth, 10);

        // Filtrar gastos do período selecionado
        const monthlyExpenses = expenses.filter(expense => {
            const dateField = expense.transaction_date || expense.date;
            const expenseDate = dateField ? new Date(dateField) : null;
            return expenseDate && (expenseDate.getMonth() + 1) === targetMonth && 
                   expenseDate.getFullYear() === targetYear;
        });

        const totalGastos = monthlyExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        const numTransacoes = monthlyExpenses.length;
        const ticketMedio = numTransacoes > 0 ? totalGastos / numTransacoes : 0;

        // Análise por tipo
        // Determinar tipo usando is_business_expense quando 'type' não existir
        const pessoal = monthlyExpenses
            .filter(e => (typeof e.type === 'string' ? e.type === 'pessoal' : !e.is_business_expense))
            .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const profissional = monthlyExpenses
            .filter(e => (typeof e.type === 'string' ? e.type === 'profissional' : !!e.is_business_expense))
            .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

        analysisContent.innerHTML = `
            <div class="space-y-4">
                <div class="bg-blue-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-blue-800">💼 Gastos Totais</h4>
                    <p class="text-2xl font-bold text-blue-600">${formatCurrency(totalGastos)}</p>
                    <p class="text-sm text-blue-600">${numTransacoes} transações</p>
                </div>
                
                <div class="bg-green-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-green-800">📈 Ticket Médio</h4>
                    <p class="text-xl font-bold text-green-600">${formatCurrency(ticketMedio)}</p>
                </div>
                
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-sm font-medium">Pessoal:</span>
                        <span class="text-sm font-bold">${formatCurrency(pessoal)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-sm font-medium">Profissional:</span>
                        <span class="text-sm font-bold">${formatCurrency(profissional)}</span>
                    </div>
                </div>
                
                <div class="bg-yellow-50 p-3 rounded-lg">
                    <h5 class="font-semibold text-yellow-800 text-sm">🎯 Recomendação</h5>
                    <p class="text-xs text-yellow-700 mt-1">
                        ${getBusinessRecommendation(totalGastos, pessoal, profissional)}
                    </p>
                </div>
            </div>
        `;
        
        console.log('💼 Análise empresarial atualizada:', { totalGastos, numTransacoes, ticketMedio });
    }

    function getBusinessRecommendation(total, pessoal, profissional) {
        const pessoalPerc = total > 0 ? (pessoal / total) * 100 : 0;
        const profissionalPerc = total > 0 ? (profissional / total) * 100 : 0;
        
        if (pessoalPerc > 60) {
            return "Considere reduzir gastos pessoais para melhorar o fluxo de caixa.";
        } else if (profissionalPerc > 70) {
            return "Alto investimento profissional. Monitore o ROI.";
        } else {
            return "Distribuição equilibrada entre gastos pessoais e profissionais.";
        }
    }

    function generateAlertsTable(expenses) {
        const alertsTable = document.getElementById('alerts-table');
        if (!alertsTable) {
            console.warn('⚠️ Elemento alerts-table não encontrado');
            return;
        }

        const tetos = {
            1: 1000.00, 2: 2782.47, 3: 2431.67, 4: 350.00, 5: 2100.00,
                6: 586.23, 7: 270.00, 8: 1200.00, 9: 1200.00, 10: 270.00,
                11: 1895.40, 12: 2027.60, 13: 270.00, 14: 63.54, 15: 129.90,
                16: 59.90, 17: 4096.09, 18: 1410.36, 19: 300.00, 20: 300.00,
                21: 150.00, 22: 1134.00, 23: 500.00, 24: 1000.00, 25: 350.00,
                26: 1000.00, 27: 500.00, 28: 450.00, 29: 285.00, 30: 700.00,
                31: 274.31, 32: 450.00, 33: 100.00, 34: 54.80, 35: 1.00,
                36: 1.00, 37: 1.00, 38: 1.00, 39: 300.00, 40: 1.00, 41: 1.00, 
                42: 1.00, 43: 210.00, 44: 1.00, 45: 12700.75,
                46: 600.00, 47: 600.00
        };

        const planNames = {
            1: "Combustível", 2: "Alimentação", 3: "Moradia", 4: "Transporte Público",
            5: "Educação", 6: "Saúde", 7: "Lazer", 8: "Vestuário", 9: "Tecnologia",
            10: "Comunicação", 11: "Seguros", 12: "Investimentos", 13: "Emergência",
            14: "Manutenção", 15: "Impostos", 16: "Viagens", 17: "Presentes",
            18: "Serviços", 19: "Equipamentos", 20: "Marketing"
        };

        if (!expenses || expenses.length === 0) {
            alertsTable.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-gray-400 text-4xl mb-4">📊</div>
                    <p class="text-gray-600">Nenhum dado disponível para alertas</p>
                </div>
            `;
            return;
        }

        // Usar período selecionado nos filtros
        const { year: selectedYear, month: selectedMonth } = getCurrentPeriod();
        const targetYear = parseInt(selectedYear, 10);
        const targetMonth = parseInt(selectedMonth, 10);

        // Filtrar gastos do período selecionado
        const monthlyExpenses = expenses.filter(expense => {
            const dateField = expense.transaction_date || expense.date;
            const expenseDate = dateField ? new Date(dateField) : null;
            return expenseDate && (expenseDate.getMonth() + 1) === targetMonth && 
                   expenseDate.getFullYear() === targetYear;
        });

        // Calcular totais por plano
        const planTotals = {};
        monthlyExpenses.forEach(expense => {
            const planId = expense.account_plan_code || expense.plan_conta;
            if (!planId) return; // ignorar sem categoria, pois não há teto mapeado
            planTotals[planId] = (planTotals[planId] || 0) + parseFloat(expense.amount || 0);
        });

        // Gerar alertas
        const alerts = [];
        Object.keys(tetos).forEach(planId => {
            const budget = tetos[planId];
            const spent = planTotals[planId] || 0;
            const percentage = budget > 0 ? (spent / budget) * 100 : 0;
            const planName = planNames[planId] || `Plano ${planId}`;
            
            let status = '';
            let statusClass = '';
            let priority = 0;
            
            if (percentage > 100) {
                status = 'Ultrapassado';
                statusClass = 'bg-red-100 text-red-800';
                priority = 3;
            } else if (percentage >= 70) {
                status = 'Atenção';
                statusClass = 'bg-yellow-100 text-yellow-800';
                priority = 2;
            } else if (percentage >= 50) {
                status = 'Monitorar';
                statusClass = 'bg-blue-100 text-blue-800';
                priority = 1;
            }
            
            if (priority > 0) {
                alerts.push({
                    planId,
                    planName,
                    budget,
                    spent,
                    percentage,
                    status,
                    statusClass,
                    priority
                });
            }
        });

        // Ordenar por prioridade
        alerts.sort((a, b) => b.priority - a.priority);

        if (alerts.length === 0) {
            alertsTable.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-green-600 text-6xl mb-4">✅</div>
                    <h3 class="text-xl font-semibold text-green-800">Parabéns!</h3>
                    <p class="text-green-600">Todos os planos estão dentro do orçamento!</p>
                </div>
            `;
            return;
        }

        alertsTable.innerHTML = `
            <table class="min-w-full">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plano</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orçamento</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gasto</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilização</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${alerts.map(alert => `
                        <tr class="hover:bg-gray-50">
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                ${alert.planName}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                ${formatCurrency(alert.budget)}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                ${formatCurrency(alert.spent)}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div class="h-2 rounded-full ${alert.percentage > 100 ? 'bg-red-600' : alert.percentage >= 70 ? 'bg-yellow-500' : 'bg-blue-600'}" 
                                         style="width: ${Math.min(alert.percentage, 100)}%"></div>
                                </div>
                                <span class="text-xs">${alert.percentage.toFixed(1)}%</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${alert.statusClass}">
                                    ${alert.status}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        console.log('⚠️ Alertas gerados:', alerts.length);
    }

        // Event listeners para os botões de refresh dos relatórios
        document.addEventListener('DOMContentLoaded', function() {
            // Botões de refresh dos gráficos
            const refreshBudgetBtn = document.getElementById('refresh-budget-btn');
            if (refreshBudgetBtn) {
                refreshBudgetBtn.addEventListener('click', async () => {
                    console.log('🔄 Atualizando gráfico de orçamento...');
                    const expenses = await fetchExpenses();
                    renderGoalsChart(expenses);
                });
            }
            
            const refreshDistributionBtn = document.getElementById('refresh-distribution-btn');
            if (refreshDistributionBtn) {
                refreshDistributionBtn.addEventListener('click', async () => {
                    console.log('🔄 Atualizando gráfico de distribuição...');
                    const expenses = await fetchExpenses();
                    renderGoalsPlanChart(expenses);
                });
            }
            
            const refreshCategoryBtn = document.getElementById('refresh-category-btn');
            if (refreshCategoryBtn) {
                refreshCategoryBtn.addEventListener('click', async () => {
                    console.log('🔄 Atualizando gráfico de categorias...');
                    
                    // Mostrar loading
                    const originalHTML = refreshCategoryBtn.innerHTML;
                    refreshCategoryBtn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
                    refreshCategoryBtn.disabled = true;
                    
                    try {
                        showNotification('🔄 Atualizando análise por categoria...', 'info', 2000);
                        
                        // Buscar dados atualizados
                        const expenses = await fetchExpenses();
                        
                        // Processar e renderizar
                        const categoryData = processCategoryData(expenses);
                        renderPlanChart(categoryData);
                        
                        showNotification('✅ Análise por categoria atualizada!', 'success', 2000);
                    } catch (error) {
                        console.error('❌ Erro ao atualizar categoria:', error);
                        showNotification('❌ Erro ao atualizar análise', 'error');
                    } finally {
                        // Restaurar botão
                        refreshCategoryBtn.innerHTML = originalHTML;
                        refreshCategoryBtn.disabled = false;
                    }
                });
            }
            
            const refreshAlertsBtn = document.getElementById('refresh-alerts-btn');
            if (refreshAlertsBtn) {
                refreshAlertsBtn.addEventListener('click', async () => {
                    console.log('🔄 Atualizando alertas...');
                    await loadReportsData();
                });
            }

            // Botão de atualização PIX/Boleto
            const refreshPixBoletoBtn = document.getElementById('refresh-pix-boleto');
            if (refreshPixBoletoBtn) {
                refreshPixBoletoBtn.addEventListener('click', () => {
                    console.log('🔄 Atualização manual PIX/Boleto solicitada');
                    refreshPixBoletoBtn.disabled = true;
                    refreshPixBoletoBtn.innerHTML = '<svg class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>Atualizando...';
                    
                    loadPixBoletoData(true).finally(() => {
                        setTimeout(() => {
                            refreshPixBoletoBtn.disabled = false;
                            refreshPixBoletoBtn.innerHTML = '<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>Atualizar';
                        }, 1000);
                    });
                });
            }

            // Ações rápidas
            const exportReportBtn = document.getElementById('export-detailed-report');
            if (exportReportBtn) {
                exportReportBtn.addEventListener('click', () => {
                    generateDetailedReport();
                });
            }
            
            const budgetOptimizerBtn = document.getElementById('budget-optimizer');
            if (budgetOptimizerBtn) {
                budgetOptimizerBtn.addEventListener('click', () => {
                    showBudgetOptimizer();
                });
            }

            // Botão de projeção mensal (gera PDF de tendências)
            const budgetProjectionBtn = document.getElementById('budget-projection');
            if (budgetProjectionBtn) {
                budgetProjectionBtn.addEventListener('click', async () => {
                    await showBudgetProjection();
                });
            }

        function generateDetailedReport() {
            showModal('Relatório Detalhado', `
                <div class="space-y-4">
                    <div class="bg-blue-50 p-4 rounded-lg">
                        <h4 class="font-semibold text-blue-800">📊 Exportando Relatório Completo</h4>
                        <p class="text-sm text-blue-600 mt-2">
                            Gerando análise detalhada com todos os dados financeiros, 
                            comparativos de orçamento e recomendações estratégicas.
                        </p>
                    </div>
                    <div class="text-center">
                        <button onclick="generatePDFReport()" class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700">
                            📄 Gerar PDF Completo
                        </button>
                    </div>
                </div>
            `);
        }

        async function showBudgetProjection() {
            const btn = document.getElementById('budget-projection');
            const originalHTML = btn.innerHTML;
            
            try {
                // Mostrar loading
                btn.innerHTML = `
                    <div class="text-center">
                        <svg class="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p class="font-semibold">Gerando PDF...</p>
                        <p class="text-sm">Análise de tendências</p>
                    </div>
                `;
                btn.disabled = true;
                
                // Buscar dados atuais
                const data = await fetchExpenses();
                
                // Gerar relatório PDF
                await generateTrendAnalysisPDF(data);
                
            } catch (error) {
                console.error('Erro ao gerar projeção:', error);
                showNotification('❌ Erro ao gerar análise de tendências', 'error');
            } finally {
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }
        }

        // Função para gerar PDF de análise de tendências
        async function generateTrendAnalysisPDF(expenseData) {
            try {
                // Analisar dados e calcular tendências
                const analysis = analyzeTrends(expenseData);
                
                // Preparar dados para o backend
                const reportData = {
                    title: 'Análise de Tendências Financeiras',
                    period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
                    generatedAt: new Date().toISOString(),
                    analysis: analysis,
                    expenses: expenseData,
                    charts: {
                        trendChart: await captureChartAsBase64('expenses-line-chart'),
                        distributionChart: await captureChartAsBase64('expenses-pie-chart')
                    }
                };

                // Chamar backend para gerar PDF
                const response = await fetch(`${API_BASE_URL}/api/reports/trend-analysis`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: JSON.stringify(reportData)
                });

                if (!response.ok) {
                    throw new Error(`Erro no servidor: ${response.status}`);
                }

                // Download do PDF
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `analise_tendencias_${new Date().getTime()}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);

                showNotification('📊 Análise de tendências gerada com sucesso!', 'success');
                
            } catch (error) {
                console.error('Erro ao gerar PDF:', error);
                
                // Fallback: gerar versão simplificada
                await generateFallbackTrendReport(expenseData);
            }
        }

        // Função para analisar tendências dos dados
        function analyzeTrends(data) {
            if (!data || data.length === 0) {
                return {
                    trend: 'stable',
                    growth: 0,
                    projection: 0,
                    insights: ['Dados insuficientes para análise'],
                    recommendations: ['Adicione mais dados para obter insights precisos']
                };
            }

            // Agrupar por mês
            const monthlyData = {};
            data.forEach(expense => {
                const date = new Date(expense.transaction_date || expense.date);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = 0;
                }
                monthlyData[monthKey] += parseFloat(expense.amount || 0);
            });

            const months = Object.keys(monthlyData).sort();
            const values = months.map(month => monthlyData[month]);
            
            // Calcular tendência
            let trend = 'stable';
            let growth = 0;
            
            if (values.length >= 2) {
                const firstHalf = values.slice(0, Math.floor(values.length / 2));
                const secondHalf = values.slice(Math.floor(values.length / 2));
                
                const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
                const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
                
                growth = ((avgSecond - avgFirst) / avgFirst) * 100;
                
                if (growth > 5) trend = 'increasing';
                else if (growth < -5) trend = 'decreasing';
            }

            // Calcular projeção para próximos 3 meses
            const lastMonthValue = values[values.length - 1] || 0;
            const projection = lastMonthValue * (1 + (growth / 100));

            // Gerar insights
            const insights = [];
            const recommendations = [];

            if (trend === 'increasing') {
                insights.push(`Gastos em tendência crescente (+${growth.toFixed(1)}%)`);
                insights.push('Aumento observado nos últimos meses');
                recommendations.push('Revisar categorias com maior crescimento');
                recommendations.push('Estabelecer limites mais rigorosos');
            } else if (trend === 'decreasing') {
                insights.push(`Gastos em tendência decrescente (${growth.toFixed(1)}%)`);
                insights.push('Redução observada nos gastos');
                recommendations.push('Manter práticas de economia atuais');
                recommendations.push('Considerar realocar economia para investimentos');
            } else {
                insights.push('Gastos mantendo estabilidade');
                insights.push('Padrão consistente de gastos');
                recommendations.push('Monitorar para manter estabilidade');
                recommendations.push('Buscar oportunidades de otimização');
            }

            // Análise por categoria (top 3 categorias)
            const categoryData = {};
            data.forEach(expense => {
                const category = expense.account_plan_code || expense.plan_conta || 'Outros';
                if (!categoryData[category]) {
                    categoryData[category] = 0;
                }
                categoryData[category] += parseFloat(expense.amount || 0);
            });

            const topCategories = Object.entries(categoryData)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3);

            insights.push(`Top 3 categorias: ${topCategories.map(([cat, val]) => `Plano ${cat} (${formatCurrency(val)})`).join(', ')}`);

            return {
                trend,
                growth: growth.toFixed(1),
                projection: projection.toFixed(2),
                currentMonth: lastMonthValue.toFixed(2),
                totalPeriod: values.reduce((a, b) => a + b, 0).toFixed(2),
                avgMonthly: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
                insights,
                recommendations,
                monthlyData: months.map(month => ({
                    month,
                    value: monthlyData[month].toFixed(2)
                })),
                topCategories: topCategories.map(([category, value]) => ({
                    category: `Plano ${category}`,
                    value: value.toFixed(2),
                    percentage: ((value / values.reduce((a, b) => a + b, 0)) * 100).toFixed(1)
                }))
            };
        }

        // Função para capturar gráfico como base64
        async function captureChartAsBase64(canvasId) {
            try {
                const canvas = document.getElementById(canvasId);
                if (!canvas) return null;
                
                return canvas.toDataURL('image/png', 0.8);
            } catch (error) {
                console.error('Erro ao capturar gráfico:', error);
                return null;
            }
        }

        // Função fallback para gerar relatório simplificado
        async function generateFallbackTrendReport(data) {
            const analysis = analyzeTrends(data);
            
            // Criar conteúdo HTML do relatório
            const reportHTML = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Análise de Tendências Financeiras</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; text-align: center; }
                        .section { margin: 20px 0; padding: 15px; border-left: 4px solid #667eea; background: #f8f9ff; }
                        .metric { display: inline-block; margin: 10px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                        .trend-up { color: #e53e3e; } .trend-down { color: #38a169; } .trend-stable { color: #3182ce; }
                        .insights li { margin: 8px 0; }
                        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>📊 Análise de Tendências Financeiras</h1>
                        <p>Relatório gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
                    </div>
                    
                    <div class="section">
                        <h2>📈 Resumo Executivo</h2>
                        <div class="metric">
                            <strong>Tendência Atual:</strong> 
                            <span class="trend-${analysis.trend}">${analysis.trend === 'increasing' ? '📈 Crescente' : analysis.trend === 'decreasing' ? '📉 Decrescente' : '📊 Estável'}</span>
                        </div>
                        <div class="metric">
                            <strong>Variação:</strong> ${analysis.growth}%
                        </div>
                        <div class="metric">
                            <strong>Projeção Próximo Mês:</strong> ${formatCurrency(analysis.projection)}
                        </div>
                        <div class="metric">
                            <strong>Média Mensal:</strong> ${formatCurrency(analysis.avgMonthly)}
                        </div>
                    </div>
                    
                    <div class="section">
                        <h2>💡 Insights Principais</h2>
                        <ul class="insights">
                            ${analysis.insights.map(insight => `<li>${insight}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div class="section">
                        <h2>🎯 Recomendações</h2>
                        <ul class="insights">
                            ${analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div class="section">
                        <h2>📊 Top Categorias</h2>
                        ${analysis.topCategories.map(cat => `
                            <div class="metric">
                                <strong>${cat.category}:</strong> ${formatCurrency(cat.value)} (${cat.percentage}%)
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="footer">
                        <p>Relatório gerado automaticamente pelo Sistema de Controle Financeiro</p>
                    </div>
                </body>
                </html>
            `;
            
            // Abrir em nova janela para impressão/PDF
            const newWindow = window.open('', '_blank');
            newWindow.document.write(reportHTML);
            newWindow.document.close();
            
            // Aguardar carregamento e imprimir
            setTimeout(() => {
                newWindow.print();
            }, 1000);
            
            showNotification('📄 Relatório de tendências aberto para impressão/PDF', 'success');
        }

        function showBudgetOptimizer() {
            showModal('Otimizador de Orçamento', `
                <div class="space-y-4">
                    <div class="bg-orange-50 p-4 rounded-lg">
                        <h4 class="font-semibold text-orange-800">⚡ Sugestões de Otimização</h4>
                        <p class="text-sm text-orange-600 mt-2">
                            Análise inteligente para identificar oportunidades de economia 
                            e melhor distribuição de recursos.
                        </p>
                    </div>
                    <div class="space-y-3">
                        <div class="border-l-4 border-green-500 pl-3">
                            <p class="font-semibold text-green-800">💡 Economia Potencial</p>
                            <p class="text-sm text-gray-600">Reduza gastos com alimentação em 15% - Economia: R$ 417,37</p>
                        </div>
                        <div class="border-l-4 border-blue-500 pl-3">
                            <p class="font-semibold text-blue-800">📈 Oportunidade</p>
                            <p class="text-sm text-gray-600">Aumente investimentos em 10% para melhor ROI</p>
                        </div>
                        <div class="border-l-4 border-yellow-500 pl-3">
                            <p class="font-semibold text-yellow-800">⚠️ Alerta</p>
                            <p class="text-sm text-gray-600">Gastos com tecnologia acima da média do mercado</p>
                        </div>
                    </div>
                </div>
            `);
        }
    });  // Fim do DOMContentLoaded para event listeners dos botões de refresh

    async function fetchAndRenderPlanChart() {
        try {
            const { year, month } = getCurrentPeriod();
            
            const params = new URLSearchParams({ year, month });

            const response = await authenticatedFetch(`${API_BASE_URL}/api/dashboard?${params}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar dados do plano.');
            }
            
            const data = await response.json();
            renderPlanChart(data.planChartData || []);

        } catch (error) {
            console.error('Erro ao buscar dados do plano:', error);
            showNotification('Erro ao carregar gráfico de planos', 'error');
        }
    }

    // ========== FUNCIONALIDADE PIX E BOLETO ==========
    
    // Função para testar manualmente os dados PIX/Boleto
    window.testPixBoleto = async function() {
        console.log('🧪 === TESTE MANUAL PIX/BOLETO ===');
        
        try {
            // 1. Buscar dados brutos
            const allExpenses = await fetchPixBoletoExpenses();
            console.log('📊 Total de expenses encontradas:', allExpenses.length);
            
            // 2. Filtrar por PIX e Boleto
            const pixBoletoExpenses = allExpenses.filter(expense => 
                expense.account === 'PIX/Boleto'
            );
            console.log('💳 Expenses PIX/Boleto:', pixBoletoExpenses.length);
            
            // 3. Mostrar detalhes
            if (pixBoletoExpenses.length > 0) {
                console.log('📋 DETALHES DOS GASTOS PIX/BOLETO:');
                pixBoletoExpenses.forEach((expense, index) => {
                    console.log(`${index + 1}. ${expense.account} - R$ ${expense.amount} - ${expense.description} - ${expense.transaction_date || expense.date}`);
                });
                
                // 4. Calcular totais
                const pixTotal = pixBoletoExpenses
                    .filter(e => e.account === 'PIX/Boleto')
                    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
                
                const boletoTotal = pixBoletoExpenses
                    .filter(e => e.account === 'Boleto')
                    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
                
                console.log(`💳 PIX Total: R$ ${pixTotal.toFixed(2)}`);
                console.log(`📄 Boleto Total: R$ ${boletoTotal.toFixed(2)}`);
                console.log(`🏆 Total Geral: R$ ${(pixTotal + boletoTotal).toFixed(2)}`);
                
                // 5. Tentar atualizar elementos
                updatePixBoletoStats(pixBoletoExpenses);
                
                // 6. Tentar renderizar gráficos
                renderPixBoletoCharts(pixBoletoExpenses);
                
            } else {
                console.log('⚠️ Nenhum gasto PIX/Boleto encontrado');
            }
            
        } catch (error) {
            console.error('❌ Erro no teste:', error);
        }
        
        console.log('🧪 === FIM DO TESTE ===');
    };

    // ========== PIX & BOLETO - ESTRUTURA REFORMULADA ==========            
    // Helpers robustos para identificar contas PIX / Boleto (normaliza espaços e casing)
    function normalizeAccountName(name) {
        return (name || '').toString().trim();
    }
    function isPixAccount(account) {
        return normalizeAccountName(account).toUpperCase() === 'PIX';
    }
    function isBoletoAccount(account) {
        // Aceita 'BOLETO' ou 'BOLETO(s)' futura variação simples
        const norm = normalizeAccountName(account).toUpperCase();
        return norm === 'BOLETO';
    }
    function parseAmount(val) {
        // Garante número mesmo que backend altere chave futuramente
        const n = parseFloat(val || 0);
        return isNaN(n) ? 0 : n;
    }
    async function loadPixBoletoData(forceRefresh = false) {
        try {
            const token = getToken();
            if (!token) return;

            console.log('🔄 Carregando dados BI PIX/Boleto Recorrentes...');
            showNotification('Carregando analytics de gastos recorrentes...', 'info', 2000);

            // Aguardar Chart.js
            if (!await waitForChartJs()) {
                console.warn('Chart.js não carregado para PIX/Boleto BI');
                setTimeout(() => loadPixBoletoData(), 500);
                return;
            }

            // Carregar dados BI de gastos recorrentes
            await loadRecurringPixBoletoBI();
            setupRecurringPixBoletoEventHandlers();

            showNotification('Dashboard BI PIX/Boleto carregado com sucesso!', 'success', 2000);
            console.log('✅ BI PIX/Boleto Recorrentes carregado');

        } catch (error) {
            console.error('❌ Erro ao carregar BI PIX/Boleto:', error);
            showNotification('Erro ao carregar analytics: ' + error.message, 'error');
        }
    }

    // Helper: normaliza a resposta do backend para o formato esperado pelos gráficos/tabela
    function normalizeRecurringPixBoletoBI(biData) {
        // Versão refatorada: reconstrói série mensal usando valores reais + recorrentes
        if (!biData || typeof biData !== 'object') {
            return { summary:{ totalPlanned:47, avgActual:0, overallReliability:0 }, monthlyHistory:[], categoryBreakdown:[], trendsSummary:{increasing:0,decreasing:0,stable:0}, projections:{ nextMonth:0, threeMonths:0, yearEnd:0 }, expenses:[] };
        }

        const period = biData.period || {};
        const baseYear = Number(period.year) || new Date().getFullYear();
        const baseMonth = Number(period.month) || (new Date().getMonth()+1);
        const rawExpenses = Array.isArray(biData.expenses) ? biData.expenses : [];

        // Se backend já forneceu monthlyHistory consolidado, usaremos como fonte principal
        const backendMonthlyHistory = Array.isArray(biData.monthlyHistory) ? biData.monthlyHistory : null;

        // Normalizar e filtrar contas PIX/Boleto
        const norm = s => (s||'').toString().trim().toUpperCase().replace(/[\s\-]/g,'');
        const isPixLike = acc => { const n=norm(acc); return n.includes('PIX') || n.includes('BOLETO'); };
        const filtered = rawExpenses.filter(r => isPixLike(r.account || r.accountName || r.conta || r.descricaoConta));

        // Construir mapa de histórico mensal real (somando actual de cada recorrente)
        const monthlyHistory = backendMonthlyHistory ? backendMonthlyHistory : (() => {
            const arr = [];
            for (let i=11;i>=0;i--) {
                const d = new Date(baseYear, baseMonth-1 - i,1);
                const y = d.getFullYear();
                const m = d.getMonth()+1;
                const monthLabel = d.toLocaleDateString('pt-BR',{ month:'short', year:'numeric' });
                let totalPlanned=0,totalActual=0;
                filtered.forEach(r=>{ const hist=Array.isArray(r.history)?r.history:[]; const hm=hist.find(h=>h.year===y&&h.month===m); totalPlanned+=Number(hm?.planned||r.plannedAmount||0); totalActual+=Number(hm?.actual||0); });
                const variationPercent = totalPlanned>0?((totalActual-totalPlanned)/totalPlanned)*100:0;
                arr.push({year:y,month:m,monthLabel,totalPlanned,totalActual,variationPercent});
            }
            return arr;
        })();

        // Incorporar discrepância caso backend envie
        const discrepancy = biData.discrepancy || null;

        // KPIs derivados
        const totalPlannedCurrent = monthlyHistory.length ? monthlyHistory[monthlyHistory.length-1].totalPlanned : 0;
        const avgActual12 = monthlyHistory.length ? monthlyHistory.reduce((s,m)=>s+m.totalActual,0)/monthlyHistory.length : 0;
        const avgVariationAbs = monthlyHistory.length ? monthlyHistory.reduce((s,m)=> s + Math.abs(m.variationPercent||0),0)/monthlyHistory.length : 0;
        const reliability = Math.max(0, Math.min(100, 100 - avgVariationAbs));
        const summary = { totalPlanned: totalPlannedCurrent, avgActual: avgActual12, overallReliability: reliability };

        // Category breakdown (último mês com dados reais >0, se não o atual)
        const refMonth = [...monthlyHistory].reverse().find(m=> m.totalActual>0) || monthlyHistory[monthlyHistory.length-1];
        const catAgg = {};
        filtered.forEach(r => {
            const hist = Array.isArray(r.history)? r.history:[];
            const hm = hist.find(h=> h.year===refMonth.year && h.month===refMonth.month);
            const cat = r.category || 'Outros';
            if(!catAgg[cat]) catAgg[cat] = { planned:0, actual:0, count:0 };
            catAgg[cat].planned += Number(hm?.planned || r.plannedAmount || 0);
            catAgg[cat].actual  += Number(hm?.actual || 0);
            catAgg[cat].count++;
        });
        const categoryBreakdown = Object.entries(catAgg).map(([category,v])=> ({ category, totalPlanned:v.planned, avgActual:v.actual, count:v.count }))
            .sort((a,b)=> b.totalPlanned - a.totalPlanned);

        // Tendências simples: comparar média final 3 meses vs inicial 3 meses
        const sliceStart = monthlyHistory.slice(0,3).reduce((s,m)=>s+m.totalActual,0)/3 || 0;
        const sliceEnd = monthlyHistory.slice(-3).reduce((s,m)=>s+m.totalActual,0)/3 || 0;
        let trendDirection = 'stable';
        if (sliceEnd > sliceStart * 1.08) trendDirection = 'increasing'; else if (sliceEnd < sliceStart * 0.92) trendDirection = 'decreasing';
        const trendsSummary = { increasing: trendDirection==='increasing'?1:0, decreasing: trendDirection==='decreasing'?1:0, stable: trendDirection==='stable'?1:0 };

        // Projeções: usar média últimos 3 meses e extrapolar
        const last3Avg = monthlyHistory.slice(-3).reduce((s,m)=>s+m.totalActual,0)/ (monthlyHistory.slice(-3).length || 1);
        const projections = { nextMonth: last3Avg, threeMonths: last3Avg*3, yearEnd: last3Avg * (12 - (baseMonth-1)) };

        // Adaptar despesas (uso atual: tabela)
        const adaptedExpenses = filtered.map(r => {
            const hist = Array.isArray(r.history)? r.history:[];
            const currentHist = hist.find(h=> h.year===baseYear && h.month===baseMonth);
            const stats = r.statistics || {};
            return {
                id: r.id,
                description: r.description,
                category: r.category,
                paymentDay: r.dayOfMonth || r.day_of_month,
                plannedAmount: Number(currentHist?.planned || r.plannedAmount || r.amount || 0),
                avgActual: Number(stats.avgActual || 0),
                variationPercent: Number(stats.avgVariation || 0),
                reliability: Number(stats.reliability || reliability || 0),
                trend: stats.trendDirection || trendDirection,
                currentMonthActual: Number(currentHist?.actual || 0)
            };
        });

        return { summary, monthlyHistory, categoryBreakdown, trendsSummary, projections, expenses: adaptedExpenses, discrepancy };
    }

    // Carregar dados BI de gastos recorrentes PIX/Boleto
    async function loadRecurringPixBoletoBI(force = false, debug = false) {
            try {
                const yearSel = document.getElementById('recurring-year')?.value || '';
                const monthSel = document.getElementById('recurring-month')?.value || '';
                const cacheKey = (yearSel && monthSel) ? `${yearSel}|${monthSel}` : 'latest';
                const now = Date.now();
                const cached = recurringBICache.get(cacheKey);
                if (!force && cached && (now - cached.timestamp) < RECURRING_BI_CACHE_TTL_MS) {
                    console.log('⚡ Usando cache BI recorrente para', cacheKey);
                    applyRecurringBIToUI(cached.data);
                    return;
                }
            console.log('🔄 Iniciando carregamento de dados BI PIX/Boleto...');
            const url = `${API_BASE_URL}/api/recurring-pix-boleto${debug ? '?debug=1' : ''}`;
            const response = await authenticatedFetch(url);
            
            if (!response.ok) {
                console.error('❌ Erro na resposta da API:', response.status, response.statusText);
                throw new Error('Erro ao buscar dados de gastos recorrentes');
            }
            
            const raw = await response.json();
            console.log('📊 Dados BI recebidos (raw):', raw);
            if (raw?.debug) {
                console.group('🔍 Debug Recurring PIX/Boleto');
                console.log('Contas recorrentes:', raw.debug.recurringAccounts);
                console.log('Contas despesas últimos 12m:', raw.debug.expenseAccountsLast12M);
                console.log('Contagens:', raw.debug.counts);
                console.groupEnd();
            }
            const biData = normalizeRecurringPixBoletoBI(raw);
            console.log('📊 Dados BI normalizados:', biData);

            // Se não houver dados suficientes, tentar fallback baseado em endpoints existentes
            const hasAnyData = (biData?.monthlyHistory || []).some(m => (m.totalPlanned || 0) > 0 || (m.totalActual || 0) > 0) || (biData?.expenses || []).length > 0;
            console.log('📊 Tem dados:', hasAnyData, 'monthlyHistory:', biData?.monthlyHistory?.length, 'expenses:', biData?.expenses?.length);
            
            if (!hasAnyData) {
                console.warn('ℹ️ BI retornou vazio, ativando fallback de PIX/Boleto...');
                const fb = await buildRecurringPixBoletoFallback(raw?.period);
                console.log('📊 Dados fallback:', fb);
                if (fb) {
                    // Atualizar KPIs principais
                    updateRecurringKPIs(fb);
                    // Renderizar gráficos BI
                    renderRecurringPlannedVsActualChart(fb.monthlyHistory);
                    renderRecurringVariationChart(fb.monthlyHistory);
                    renderRecurringCategoryChart(fb.categoryBreakdown);
                    // Tendências e projeções básicas
                    updateTrendsAnalysis(fb.trendsSummary);
                    // Garantir que projections existe antes de chamar updateProjections
                    const safeProjections = fb.projections || { nextMonth: 0, threeMonths: 0, yearEnd: 0 };
                    console.log('📊 Projeções do fallback:', safeProjections);
                    updateProjections(safeProjections);
                    // Tabela (minimalmente preenchida)
                    renderRecurringExpensesTable(fb.expenses);
                    showNotification('Exibindo dados PIX/Boleto via fallback', 'warning');
                    return;
                }
            }

            applyRecurringBIToUI(biData);
            recurringBICache.set(cacheKey, { data: biData, timestamp: Date.now() });
            persistRecurringBICache();
            
            // Popular filtros de anos
            populateRecurringYearFilter();
            
            console.log('✅ Dados BI PIX/Boleto carregados com sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados BI:', error);
            // Último recurso: tentar fallback mesmo em erro de rede/404
            try {
                console.log('⚠️ Tentando fallback de emergência...');
                const fb = await buildRecurringPixBoletoFallback();
                console.log('📊 Fallback de emergência:', fb);
                if (fb) {
                    updateRecurringKPIs(fb);
                    renderRecurringPlannedVsActualChart(fb.monthlyHistory);
                    renderRecurringVariationChart(fb.monthlyHistory);
                    renderRecurringCategoryChart(fb.categoryBreakdown);
                    updateTrendsAnalysis(fb.trendsSummary);
                    // Garantir que projections existe no fallback de emergência
                    const safeProjections = fb.projections || { nextMonth: 0, threeMonths: 0, yearEnd: 0 };
                    console.log('📊 Projeções do fallback de emergência:', safeProjections);
                    updateProjections(safeProjections);
                    renderRecurringExpensesTable(fb.expenses);
                    await updateNonRecurringComparison(fb);
                    showNotification('Exibindo dados PIX/Boleto via fallback de emergência', 'warning');
                    return;
                }
            } catch (e) {
                console.error('❌ Fallback falhou:', e);
            }
            showNotification('Erro ao carregar analytics de gastos recorrentes: ' + error.message, 'error');
        }
    }

    async function updateNonRecurringComparison(biData){
        try {
            const recActualEl = document.getElementById('recurring-month-actual');
            const nonRecEl = document.getElementById('nonrecurring-month-actual');
            const shareEl = document.getElementById('recurring-share');
            if(!recActualEl || !nonRecEl || !shareEl) return;
            if(biData && biData.comparison){
                recActualEl.textContent = formatCurrency(biData.comparison.recurringMonthActual||0);
                nonRecEl.textContent = formatCurrency(biData.comparison.nonRecurringMonthActual||0);
                shareEl.textContent = (biData.comparison.recurringShare||0).toFixed(1)+'%';
                return;
            }
            const monthlyHistory = Array.isArray(biData?.monthlyHistory)? biData.monthlyHistory: [];
            if(!monthlyHistory.length) return;
            const target = monthlyHistory[monthlyHistory.length-1];
            const params = new URLSearchParams({year: target.year, month: target.month, account: 'PIX/Boleto', include_recurring: 'true'});
            const resp = await authenticatedFetch(`${API_BASE_URL}/api/expenses?${params.toString()}`);
            let nonRec = 0;
            if(resp.ok){
                const list = await resp.json();
                nonRec = list.filter(e=> !e.recurring_expense_id).reduce((s,e)=> s + Number(e.amount||0),0);
            }
            const recAct = target.totalActual||0;
            const combined = recAct + nonRec;
            const share = combined>0? (recAct/combined)*100:0;
            recActualEl.textContent = formatCurrency(recAct);
            nonRecEl.textContent = formatCurrency(nonRec);
            shareEl.textContent = share.toFixed(1)+'%';
        } catch(e){ console.warn('updateNonRecurringComparison falhou:', e.message); }
    }

    // Atualizar KPIs principais do dashboard
    function updateRecurringKPIs(biData) {
        console.log('📊 Atualizando KPIs com dados:', biData);
        
        // Total Programado: soma planejada (não o realizado) do mês alvo
        // Regra: se houver período selecionado, usa aquele mês/ano; senão, último mês da série
        const totalPlannedEl = document.getElementById('recurring-total-planned');
        if (totalPlannedEl) {
            const monthlyHistory = Array.isArray(biData?.monthlyHistory) ? biData.monthlyHistory : [];
            let selectedYear = Number(document.getElementById('recurring-year')?.value || 0) || null;
            let selectedMonth = Number(document.getElementById('recurring-month')?.value || 0) || null;

            console.log('📊 KPI Total Programado - History:', monthlyHistory.length, 'Filtros:', selectedYear, selectedMonth);

            // Encontrar entrada alvo
            let target = null;
            if (selectedYear && selectedMonth) {
                target = monthlyHistory.find(m => m.year === selectedYear && m.month === selectedMonth) || null;
                console.log('📊 Target por filtro:', target);
            }
            if (!target && monthlyHistory.length) {
                target = monthlyHistory[monthlyHistory.length - 1]; // último é o mês base mais recente
                console.log('📊 Target padrão (último):', target);
            }

            const monthlyPlanned = Number(target?.totalPlanned || 0);
            console.log('📊 Valor planejado mensal calculado:', monthlyPlanned);
            totalPlannedEl.textContent = formatCurrency(monthlyPlanned);
        }

    // Média realizada (últimos 12 meses)
        const avgActualEl = document.getElementById('recurring-avg-actual');
        if (avgActualEl && biData.summary) {
            const avgValue = biData.summary.avgActual || 0;
            console.log('📊 Média realizada:', avgValue);
            avgActualEl.textContent = formatCurrency(avgValue);
        }

        // Confiabilidade
        const reliabilityEl = document.getElementById('recurring-reliability');
        if (reliabilityEl && biData.summary) {
            const reliability = biData.summary.overallReliability || 0;
            console.log('📊 Confiabilidade:', reliability);
            reliabilityEl.textContent = `${reliability.toFixed(1)}%`;
            // Cor baseada na confiabilidade
            reliabilityEl.className = reliability >= 80 ? 'text-xl font-bold text-green-300' :
                                    reliability >= 60 ? 'text-xl font-bold text-yellow-300' :
                                    'text-xl font-bold text-red-300';
        }

        // Total de gastos ativos
        const countEl = document.getElementById('recurring-count');
        if (countEl && biData.expenses) {
            const count = biData.expenses.length;
            console.log('📊 Total de gastos ativos:', count);
            countEl.textContent = count.toString();
        }
        
        // % Executado (mês alvo)
        const execRateEl = document.getElementById('recurring-execution-rate');
        if (execRateEl) {
            const monthlyHistory = Array.isArray(biData?.monthlyHistory) ? biData.monthlyHistory : [];
            let selectedYear = Number(document.getElementById('recurring-year')?.value || 0) || null;
            let selectedMonth = Number(document.getElementById('recurring-month')?.value || 0) || null;
            let target = null;
            if (selectedYear && selectedMonth) {
                target = monthlyHistory.find(m => m.year === selectedYear && m.month === selectedMonth) || null;
            }
            if (!target && monthlyHistory.length) target = monthlyHistory[monthlyHistory.length - 1];
            const planned = Number(target?.totalPlanned || 0);
            const actual = Number(target?.totalActual || 0);
            const rate = planned > 0 ? (actual / planned) * 100 : 0;
            execRateEl.textContent = rate.toFixed(1) + '%';
            execRateEl.className = 'text-xl font-bold ' + (rate >= 100 ? 'text-green-300' : rate >= 80 ? 'text-yellow-200' : 'text-red-200');
        }

        console.log('✅ KPIs atualizados');
    }

    // Fallback builder para BI de recorrentes PIX/Boleto quando a rota dedicada não estiver disponível
    async function buildRecurringPixBoletoFallback(period) {
        try {
            console.log('🔧 Construindo fallback PIX/Boleto...', period);
            
            // 1) Buscar lista de recorrências para obter o total planejado mensal
            let plannedSum = 0;
            let recurringItems = [];
            try {
                console.log('🔧 Buscando gastos recorrentes...');
                const r = await authenticatedFetch(`${API_BASE_URL}/api/recurring-expenses`);
                if (r.ok) {
                    const rec = await r.json();
                    console.log('🔧 Gastos recorrentes recebidos:', rec);
                    recurringItems = (Array.isArray(rec) ? rec : []).filter(x => {
                        const acc = (x.account || '').toUpperCase();
                        return acc === 'PIX/BOLETO' || acc === 'PIX' || acc === 'BOLETO';
                    });
                    plannedSum = recurringItems.reduce((s, it) => s + Number(it.amount || 0), 0);
                    console.log('🔧 Itens PIX/Boleto filtrados:', recurringItems.length, 'Soma planejada:', plannedSum);
                }
            } catch (e) {
                console.warn('⚠️ Falha ao buscar recorrentes (fallback continuará):', e.message);
            }

            // 2) Buscar todas despesas PIX/Boleto (rota dedicada) e filtrar últimos 12 meses
            let all = [];
            console.log('🔧 Buscando despesas PIX/Boleto...');
            const expResp = await authenticatedFetch(`${API_BASE_URL}/api/expenses/pix-boleto`);
            if (expResp.ok) {
                const expRaw = await expResp.json();
                all = Array.isArray(expRaw?.expenses) ? expRaw.expenses : [];
                console.log('🔧 Despesas PIX/Boleto da rota dedicada:', all.length);
            } else {
                // Fallback adicional: usar rota genérica filtrando por conta
                console.warn('⚠️ Rota /api/expenses/pix-boleto indisponível; usando /api/expenses?account=PIX/Boleto para construir fallback BI');
                const generic = await authenticatedFetch(`${API_BASE_URL}/api/expenses?account=PIX/Boleto`);
                if (!generic.ok) {
                    console.error('❌ Falha na rota genérica também');
                    return null;
                }
                const list = await generic.json();
                all = Array.isArray(list) ? list : [];
                console.log('🔧 Despesas PIX/Boleto da rota genérica:', all.length);
            }
            // Removido filtro por categoria "Alimentação" para não distorcer totais

            // Determinar período base
            const baseYear = Number(period?.year) || new Date().getFullYear();
            const baseMonth = Number(period?.month) || (new Date().getMonth() + 1);
            console.log('🔧 Período base:', baseYear, baseMonth);

            // Agrupar últimos 12 meses
            const monthlyHistory = [];
            for (let i = 11; i >= 0; i--) {
                const d = new Date(baseYear, baseMonth - 1 - i, 1);
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                const label = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                const monthActual = all.filter(e => {
                    const dt = new Date(e.transaction_date || e.date);
                    return dt.getFullYear() === y && (dt.getMonth() + 1) === m;
                }).reduce((s, e) => s + Number(e.amount || e.valor || e.value || 0), 0);

                const totalPlanned = plannedSum; // usar soma das recorrências como planejado mensal
                const variationPercent = totalPlanned > 0 ? ((monthActual - totalPlanned) / totalPlanned) * 100 : 0;
                monthlyHistory.push({
                    year: y,
                    month: m,
                    monthLabel: label,
                    totalPlanned,
                    totalActual: monthActual,
                    variationPercent
                });
            }
            
            console.log('🔧 Histórico mensal construído:', monthlyHistory.length, 'meses');
            console.log('🔧 Amostra histórico:', monthlyHistory.slice(-3));

            // 3) Quebra por categoria (últimos 12 meses)
            const last12Start = new Date(baseYear, baseMonth - 12, 1);
            const last12 = all.filter(e => new Date(e.transaction_date || e.date) >= last12Start);
            const categoryTotals = {};
            last12.forEach(e => {
                const cat = e.category || 'Outros';
                const amt = Number(e.amount || e.valor || e.value || 0);
                if (!categoryTotals[cat]) categoryTotals[cat] = 0;
                categoryTotals[cat] += amt;
            });
            const categoryBreakdown = Object.entries(categoryTotals).map(([category, total]) => ({
                category,
                totalPlanned: total, // aqui usamos total como indicador visual
                avgActual: total,
                count: last12.filter(e => (e.category || 'Outros') === category).length
            })).sort((a,b) => b.totalPlanned - a.totalPlanned);

            console.log('🔧 Quebra por categoria:', categoryBreakdown.length, 'categorias');

            // 4) KPIs e projeções simples
            const monthsWithData = monthlyHistory.filter(m => m.totalActual > 0);
            const avgActual = monthsWithData.length ? monthsWithData.reduce((s,m)=> s + m.totalActual, 0) / monthsWithData.length : 0;
            const avgVariation = monthsWithData.length ? monthsWithData.reduce((s,m)=> s + m.variationPercent, 0) / monthsWithData.length : 0;
            const reliability = Math.max(0, Math.min(100, 100 - Math.abs(avgVariation)));
            const projections = {
                nextMonth: avgActual,
                threeMonths: avgActual * 3,
                yearEnd: avgActual * (12 - (baseMonth - 1))
            };

            console.log('🔧 KPIs calculados - Planejado:', plannedSum, 'Média real:', avgActual, 'Confiabilidade:', reliability);

            // 5) Tabela: mapear recorrentes (se houver) com dados mínimos
            const expensesRows = (recurringItems.length ? recurringItems : []).map(r => ({
                id: r.id,
                description: r.description,
                category: r.category,
                paymentDay: r.day_of_month,
                plannedAmount: Number(r.amount || 0),
                avgActual: 0,
                variationPercent: 0,
                reliability: 0,
                trend: 'stable',
                currentMonthActual: 0
            }));

            // Comparação com não recorrentes (mês atual)
            let nonRecurringMonthActual = 0;
            try {
                const params = new URLSearchParams({ year: baseYear, month: baseMonth, account: 'PIX/Boleto', include_recurring: 'true' });
                const allMonthResp = await authenticatedFetch(`${API_BASE_URL}/api/expenses?${params.toString()}`);
                if (allMonthResp.ok) {
                    const monthList = await allMonthResp.json();
                    nonRecurringMonthActual = monthList.filter(e => !e.recurring_expense_id).reduce((s,e)=> s + Number(e.amount||0),0);
                }
            } catch (e) { console.warn('Falha ao calcular não recorrentes mês alvo:', e.message); }
            const currentMonthEntry = monthlyHistory.find(m => m.year === baseYear && m.month === baseMonth) || { totalActual: 0 };
            const recurringMonthActual = currentMonthEntry.totalActual;
            const combinedMonth = recurringMonthActual + nonRecurringMonthActual;
            const recurringShare = combinedMonth > 0 ? (recurringMonthActual / combinedMonth) * 100 : 0;

            const result = {
                summary: { totalPlanned: plannedSum, avgActual, overallReliability: reliability },
                monthlyHistory,
                categoryBreakdown,
                trendsSummary: { increasing: 0, decreasing: 0, stable: expensesRows.length },
                projections,
                expenses: expensesRows,
                comparison: { recurringMonthActual, nonRecurringMonthActual, recurringShare }
            };
            
            console.log('🔧 Fallback construído com sucesso:', result);
            return result;
        } catch (e) {
            console.error('❌ Erro no fallback de PIX/Boleto:', e);
            return null;
        }
    }

    // Renderizar gráfico Programado vs Realizado
    function renderRecurringPlannedVsActualChart(monthlyHistory) {
        const canvas = document.getElementById('recurring-planned-vs-actual-chart');
        if (!canvas || !monthlyHistory) return;

        const ctx = canvas.getContext('2d');
        destroyChart('recurringPlannedVsActualChart');

        const labels = monthlyHistory.map(m => m.monthLabel);
        const plannedData = monthlyHistory.map(m => m.totalPlanned);
        const actualData = monthlyHistory.map(m => m.totalActual);
        // Média móvel 3 meses sobre realizado
        const movingAvg = actualData.map((v,i,arr)=>{
            const slice = arr.slice(Math.max(0,i-2), i+1);
            const sum = slice.reduce((s,x)=>s+x,0);
            return sum / slice.length;
        });

        chartRegistry.recurringPlannedVsActualChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '📋 Programado',
                        data: plannedData,
                        borderColor: 'rgba(59, 130, 246, 1)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.1
                    },
                    {
                        label: '💰 Realizado',
                        data: actualData,
                        borderColor: 'rgba(34, 197, 94, 1)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.1
                    },
                    {
                        label: '📈 Média Móvel (3m)',
                        data: movingAvg,
                        borderColor: 'rgba(234,179,8,0.9)',
                        backgroundColor: 'rgba(234,179,8,0.15)',
                        borderDash: [6,4],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                        tension: 0.2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Evolução: Programado vs Realizado',
                        font: { size: 14, weight: 'bold' }
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }

    // Renderizar gráfico de variação percentual
    function renderRecurringVariationChart(monthlyHistory) {
        const canvas = document.getElementById('recurring-variation-chart');
        if (!canvas || !monthlyHistory) return;

        const ctx = canvas.getContext('2d');
        destroyChart('recurringVariationChart');

        const labels = monthlyHistory.map(m => m.monthLabel);
        const variationData = monthlyHistory.map(m => m.variationPercent);

        chartRegistry.recurringVariationChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '📊 Variação %',
                        data: variationData,
                        backgroundColor: variationData.map(v => 
                            v > 0 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)'
                        ),
                        borderColor: variationData.map(v => 
                            v > 0 ? 'rgba(239, 68, 68, 1)' : 'rgba(34, 197, 94, 1)'
                        ),
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Variação Mensal (%)',
                        font: { size: 14, weight: 'bold' }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                const sign = value >= 0 ? '+' : '';
                                return `Variação: ${sign}${value.toFixed(1)}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    // Renderizar gráfico por categoria
    function renderRecurringCategoryChart(categoryBreakdown) {
        const canvas = document.getElementById('recurring-category-chart');
        if (!canvas || !categoryBreakdown) return;

        const ctx = canvas.getContext('2d');
        destroyChart('recurringCategoryChart');

        const labels = categoryBreakdown.map(c => c.category);
        const data = categoryBreakdown.map(c => c.totalPlanned);
        const colors = generateDistinctColors(labels.length);

        chartRegistry.recurringCategoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [
                    {
                        data: data,
                        backgroundColor: colors,
                        borderColor: colors.map(c => c.replace('0.7', '1')),
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribuição por Categoria',
                        font: { size: 14, weight: 'bold' }
                    },
                    legend: {
                        display: true,
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label;
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Atualizar análise de tendências
    function updateTrendsAnalysis(trendsSummary) {
        if (!trendsSummary) return;

        const increasingEl = document.getElementById('trends-increasing');
        const decreasingEl = document.getElementById('trends-decreasing');
        const stableEl = document.getElementById('trends-stable');

        if (increasingEl) increasingEl.textContent = trendsSummary.increasing || 0;
        if (decreasingEl) decreasingEl.textContent = trendsSummary.decreasing || 0;
        if (stableEl) stableEl.textContent = trendsSummary.stable || 0;
    }

    // Atualizar projeções
    function updateProjections(projections) {
        console.log('🎯 updateProjections chamada com dados:', projections);
        
        if (!projections) {
            console.warn('⚠️ updateProjections: projections é null/undefined');
            return;
        }

        const nextMonthEl = document.getElementById('projection-next-month');
        const threeMonthsEl = document.getElementById('projection-3-months');
        const yearEndEl = document.getElementById('projection-year-end');

        console.log('🎯 Elementos encontrados:', {
            nextMonth: !!nextMonthEl,
            threeMonths: !!threeMonthsEl,
            yearEnd: !!yearEndEl
        });

        if (nextMonthEl) {
            const value = formatCurrency(projections.nextMonth || 0);
            console.log('🎯 Atualizando próximo mês:', value);
            nextMonthEl.textContent = value;
        } else {
            console.error('❌ Elemento projection-next-month não encontrado');
        }
        
        if (threeMonthsEl) {
            const value = formatCurrency(projections.threeMonths || 0);
            console.log('🎯 Atualizando 3 meses:', value);
            threeMonthsEl.textContent = value;
        } else {
            console.error('❌ Elemento projection-3-months não encontrado');
        }
        
        if (yearEndEl) {
            const value = formatCurrency(projections.yearEnd || 0);
            console.log('🎯 Atualizando fim do ano:', value);
            yearEndEl.textContent = value;
        } else {
            console.error('❌ Elemento projection-year-end não encontrado');
        }
    }

    // Renderizar tabela inteligente de gastos recorrentes
    function renderRecurringExpensesTable(expenses) {
        const tableBody = document.getElementById('recurring-expenses-table');
        if (!tableBody || !expenses) return;

        // Armazenar dados atuais para sorting
        currentRecurringExpenses = [...expenses];

        tableBody.innerHTML = '';

        expenses.forEach(expense => {
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-gray-50';

            // Status color based on budget performance
            const statusClass = getExpenseStatusClass(expense);
            const reliabilityColor = getReliabilityColor(expense.reliability);
            const trendIcon = getTrendIcon(expense.trend);

            const paidThisMonth = !!expense.currentMonthActual && expense.currentMonthActual > 0;
            const paidIcon = paidThisMonth ? '✅' : '⏳';
            const paidTitle = paidThisMonth ? 'Pago neste mês' : 'Ainda não pago';
            const currentMonth = expense.currentMonthActual || 0;
            const execRate = expense.plannedAmount > 0 ? (currentMonth / expense.plannedAmount) * 100 : 0;
            const barColor = execRate >= 100 ? 'bg-green-600' : execRate >= 80 ? 'bg-emerald-400' : execRate >= 50 ? 'bg-yellow-400' : 'bg-red-400';
            const overCap = execRate > 100;
            const barExtraStyle = overCap ? 'background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 6px, rgba(255,255,255,0.15) 6px 12px);' : '';
            row.innerHTML = `
                <td class="p-3">
                    <div class="font-medium">${expense.description || 'N/A'}</div>
                    <div class="text-xs text-gray-500">${expense.category || 'Sem categoria'}</div>
                </td>
                <td class="p-3 text-center">${expense.paymentDay || 'Variável'}</td>
                <td class="p-3 text-right font-medium">${formatCurrency(expense.plannedAmount || 0)}</td>
                <td class="p-3 text-right">${formatCurrency(expense.avgActual || 0)}</td>
                <td class="p-3 text-right">
                    <div class="flex flex-col items-end gap-1">
                        <span class="text-sm font-medium" title="Realizado mês atual">${formatCurrency(currentMonth)}</span>
                        <div class="w-28 h-2 rounded bg-gray-200 overflow-hidden" title="${formatCurrency(currentMonth)} / ${formatCurrency(expense.plannedAmount || 0)} = ${execRate.toFixed(1)}%">
                            <div class="h-full ${barColor}" style="width:${Math.min(execRate,130).toFixed(1)}%;${barExtraStyle}"></div>
                        </div>
                        <span class="text-[10px] text-gray-500" title="Percentual executado">${execRate.toFixed(1)}%</span>
                    </div>
                </td>
                <td class="p-3 text-right">
                    <span class="font-medium ${expense.variationPercent >= 0 ? 'text-red-600' : 'text-green-600'}">
                        ${expense.variationPercent >= 0 ? '+' : ''}${(expense.variationPercent || 0).toFixed(1)}%
                    </span>
                </td>
                <td class="p-3 text-center">
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${reliabilityColor}">
                        ${(expense.reliability || 0).toFixed(0)}%
                    </span>
                </td>
                <td class="p-3 text-center">${trendIcon}</td>
                <td class="p-3 text-center" title="${paidTitle}">${paidIcon}</td>
                <td class="p-3">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full ${statusClass}"></div>
                        <span class="text-xs">${getStatusText(expense)}</span>
                    </div>
                </td>
                <td class="p-3">
                    <button onclick="showDetailedAnalysis(${expense.id})" 
                            class="text-blue-600 hover:text-blue-800 text-sm">
                        🔍 Analisar
                    </button>
                </td>
            `;

            tableBody.appendChild(row);
        });
    }

    // Obter classe de status do gasto
    function getExpenseStatusClass(expense) {
        if (!expense.currentMonthActual) return 'bg-gray-400'; // Pendente
        
        const variation = expense.variationPercent || 0;
        if (Math.abs(variation) <= 10) return 'bg-green-500'; // No orçamento
        if (variation > 10) return 'bg-orange-500'; // Acima do orçamento
        return 'bg-blue-500'; // Abaixo do orçamento
    }

    // Obter cor da confiabilidade
    function getReliabilityColor(reliability) {
        const rel = reliability || 0;
        if (rel >= 80) return 'bg-green-100 text-green-800';
        if (rel >= 60) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    }

    // Obter ícone de tendência
    function getTrendIcon(trend) {
        switch (trend) {
            case 'increasing': return '📈';
            case 'decreasing': return '📉';
            case 'stable': return '➡️';
            default: return '❓';
        }
    }

    // Obter texto do status
    function getStatusText(expense) {
        if (!expense.currentMonthActual) return 'Pendente';
        
        const variation = expense.variationPercent || 0;
        if (Math.abs(variation) <= 10) return 'No Orçamento';
        if (variation > 10) return 'Acima';
        return 'Abaixo';
    }

    // Popular filtro de anos
    function populateRecurringYearFilter() {
        const yearSelect = document.getElementById('recurring-year');
        if (!yearSelect) return;

        const currentYear = new Date().getFullYear();
        yearSelect.innerHTML = '';

        // Incluir anos futuros até 2027
        for (let year = currentYear + 3; year >= currentYear - 3; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            if (year === currentYear) option.selected = true;
            yearSelect.appendChild(option);
        }
    }

    // Configurar event handlers para BI de gastos recorrentes
    function setupRecurringPixBoletoEventHandlers() {
        // Botão de refresh
        const refreshBtn = document.getElementById('refresh-recurring-pix-boleto');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadRecurringPixBoletoBI();
            });
        }

        // Filtros de período
        const applyFiltersBtn = document.getElementById('apply-recurring-filters');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', applyRecurringFilters);
        }

        // Ordenação da tabela
        const reliabilitySortBtn = document.getElementById('toggle-reliability-sort');
        const variationSortBtn = document.getElementById('toggle-variation-sort');
        
        if (reliabilitySortBtn) {
            reliabilitySortBtn.addEventListener('click', () => sortRecurringTable('reliability'));
        }
        
        if (variationSortBtn) {
            variationSortBtn.addEventListener('click', () => sortRecurringTable('variation'));
        }

        // Fechar análise detalhada
        const closeDetailedBtn = document.getElementById('close-detailed-analysis');
        if (closeDetailedBtn) {
            closeDetailedBtn.addEventListener('click', () => {
                document.getElementById('detailed-analysis-section').classList.add('hidden');
            });
        }

        // Export BI report
        const exportBtn = document.getElementById('export-recurring-report');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportRecurringReport);
        }
    }

    // Aplicar filtros de período
    async function applyRecurringFilters() {
        const year = document.getElementById('recurring-year')?.value;
        const month = document.getElementById('recurring-month')?.value;

        try {
            let url = `${API_BASE_URL}/api/recurring-pix-boleto`;
            const params = new URLSearchParams();
            
            if (year) params.append('year', year);
            if (month) params.append('month', month);
            
            if (params.toString()) {
                url += '?' + params.toString();
            }

            // Tenta cache primeiro
            const cacheKey = (year && month) ? `${year}|${month}` : 'latest';
            const cached = recurringBICache.get(cacheKey);
            const now = Date.now();
            if (cached && (now - cached.timestamp) < RECURRING_BI_CACHE_TTL_MS) {
                console.log('⚡ Usando cache em filtros para', cacheKey);
                applyRecurringBIToUI(cached.data);
                showNotification('Filtros aplicados (cache)', 'success');
                return;
            }
            const response = await authenticatedFetch(url);
            if (!response.ok) throw new Error('Erro ao aplicar filtros');

            const raw = await response.json();
            const biData = normalizeRecurringPixBoletoBI(raw);
            const hasAnyData = (biData?.monthlyHistory || []).some(m => (m.totalPlanned || 0) > 0 || (m.totalActual || 0) > 0) || (biData?.expenses || []).length > 0;
            if (!hasAnyData) {
                const fb = await buildRecurringPixBoletoFallback({ year: Number(year), month: Number(month) });
                if (fb) {
                    updateRecurringKPIs(fb);
                    renderRecurringPlannedVsActualChart(fb.monthlyHistory);
                    renderRecurringVariationChart(fb.monthlyHistory);
                    renderRecurringCategoryChart(fb.categoryBreakdown);
                    updateTrendsAnalysis(fb.trendsSummary);
                    const safeProjections = fb.projections || { nextMonth: 0, threeMonths: 0, yearEnd: 0 };
                    updateProjections(safeProjections);
                    renderRecurringExpensesTable(fb.expenses);
                    showNotification('Filtros aplicados (fallback)', 'warning');
                    return;
                }
            }
            
            // Atualizar dashboard com dados filtrados
            applyRecurringBIToUI(biData);
            recurringBICache.set(cacheKey, { data: biData, timestamp: Date.now() });

            showNotification('Filtros aplicados com sucesso!', 'success');

        } catch (error) {
            console.error('Erro ao aplicar filtros:', error);
            // Tentar fallback com os filtros selecionados
            try {
                const fb = await buildRecurringPixBoletoFallback({ year: Number(year), month: Number(month) });
                if (fb) {
                    applyRecurringBIToUI(fb);
                    showNotification('Filtros aplicados via fallback', 'warning');
                    return;
                }
    // Função central para aplicar dados BI na UI
    function applyRecurringBIToUI(data){
        if(!data) return;
        updateRecurringKPIs(data);
        renderRecurringPlannedVsActualChart(data.monthlyHistory);
        renderRecurringVariationChart(data.monthlyHistory);
        renderRecurringCategoryChart(data.categoryBreakdown);
        updateTrendsAnalysis(data.trendsSummary);
        const safeProjections = data.projections || { nextMonth: 0, threeMonths: 0, yearEnd: 0 };
        updateProjections(safeProjections);
        renderRecurringExpensesTable(data.expenses);
        updateNonRecurringComparison(data); // sem await para não bloquear
    }

    // Botão de forçar atualização ignorando cache
    document.getElementById('force-refresh-recurring')?.addEventListener('click', (e) => {
        const debug = e.shiftKey;
        showNotification(debug ? 'Forçando atualização BI (debug)...' : 'Forçando atualização BI...', 'info');
        loadRecurringPixBoletoBI(true, debug);
    });
            } catch (e) {
                console.error('Fallback (filtros) falhou:', e);
            }
            showNotification('Erro ao aplicar filtros', 'error');
        }
    }

    // Ordenar tabela de gastos recorrentes
    function sortRecurringTable(criteria) {
        if (!currentRecurringExpenses || currentRecurringExpenses.length === 0) {
            console.log('Nenhum dado de gastos recorrentes para ordenar');
            return;
        }

        // Toggle direction if same criteria, otherwise default to descending
        if (currentSortCriteria === criteria) {
            currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
        } else {
            currentSortDirection = 'desc';
        }
        currentSortCriteria = criteria;

        // Create a copy and sort
        const sortedExpenses = [...currentRecurringExpenses];

        sortedExpenses.sort((a, b) => {
            let valueA, valueB;

            switch (criteria) {
                case 'reliability':
                    valueA = Number(a.reliability || 0);
                    valueB = Number(b.reliability || 0);
                    break;
                case 'variation':
                    valueA = Number(a.variationPercent || 0);
                    valueB = Number(b.variationPercent || 0);
                    break;
                case 'plannedAmount':
                    valueA = Number(a.plannedAmount || 0);
                    valueB = Number(b.plannedAmount || 0);
                    break;
                case 'avgActual':
                    valueA = Number(a.avgActual || 0);
                    valueB = Number(b.avgActual || 0);
                    break;
                default:
                    return 0;
            }

            // Handle special sorting for PIX/Boleto expenses
            // PIX/Boleto expenses get priority in ascending order
            const aIsPixBoleto = isPixBoletoAccount(a.account);
            const bIsPixBoleto = isPixBoletoAccount(b.account);
            
            if (aIsPixBoleto && !bIsPixBoleto) return -1; // PIX/Boleto first
            if (!aIsPixBoleto && bIsPixBoleto) return 1;

            // Sort by the actual criteria
            if (currentSortDirection === 'desc') {
                return valueB - valueA;
            } else {
                return valueA - valueB;
            }
        });

        // Update button states
        updateSortButtonStates(criteria);

        // Re-render table with sorted data
        renderRecurringExpensesTable(sortedExpenses);

        console.log(`Tabela ordenada por: ${criteria} (${currentSortDirection})`);
        showNotification(`Ordenado por ${criteria === 'reliability' ? 'confiabilidade' : 'variação'} (${currentSortDirection === 'desc' ? 'maior para menor' : 'menor para maior'})`, 'success', 2000);
    }

    // Update sort button states
    function updateSortButtonStates(activeCriteria) {
        const reliabilityBtn = document.getElementById('toggle-reliability-sort');
        const variationBtn = document.getElementById('toggle-variation-sort');

        // Reset all buttons
        [reliabilityBtn, variationBtn].forEach(btn => {
            if (btn) {
                btn.classList.remove('bg-green-600', 'bg-blue-600');
                btn.classList.add('bg-blue-500');
                btn.innerHTML = btn.innerHTML.replace(/↑|↓/g, '');
            }
        });

        // Update active button
        let activeBtn = null;
        if (activeCriteria === 'reliability' && reliabilityBtn) {
            activeBtn = reliabilityBtn;
        } else if (activeCriteria === 'variation' && variationBtn) {
            activeBtn = variationBtn;
        }

        if (activeBtn) {
            activeBtn.classList.remove('bg-blue-500');
            activeBtn.classList.add('bg-green-600');
            
            // Add sort direction indicator
            const arrow = currentSortDirection === 'desc' ? '↓' : '↑';
            if (!activeBtn.innerHTML.includes(arrow)) {
                activeBtn.innerHTML += ` ${arrow}`;
            }
        }
    }

    // Exportar relatório BI
    function exportRecurringReport() {
        // Implementation for BI report export
        console.log('Exportando relatório BI de gastos recorrentes...');
        showNotification('Funcionalidade de export em desenvolvimento', 'info');
    }

    // Função global para análise detalhada (chamada pelos botões da tabela)
    window.showDetailedAnalysis = function(expenseId) {
        console.log(`Mostrando análise detalhada para gasto ID: ${expenseId}`);
        document.getElementById('detailed-analysis-section').classList.remove('hidden');
        // Carregar dados específicos do gasto e renderizar gráficos detalhados
    };

    // ========== GRÁFICOS PIX/BOLETO (UNIFICADO) ==========
    // Função para renderizar gráfico de evolução (unificado)
    function renderPixBoletoEvolutionChartUnified(monthlyData) {
        const canvas = document.getElementById('pix-boleto-evolution-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // Destruir gráfico existente
        if (window.pixBoletoEvolutionChartUnified) {
            window.pixBoletoEvolutionChartUnified.destroy();
        }

        window.pixBoletoEvolutionChartUnified = new Chart(ctx, {
            type: 'line',
            data: {
                labels: monthlyData.map(item => item.month),
                datasets: [{
                    label: 'PIX/Boleto',
                    data: monthlyData.map(item => item.total),
                    borderColor: '#06B6D4',
                    backgroundColor: '#06B6D420',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }

    // Função para renderizar gráfico de distribuição (unificado)
    async function renderPixBoletoDistributionChartUnified(year, month) {
        const canvas = document.getElementById('pix-boleto-distribution-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = await fetchPixBoletoData(year, month);
        const personalTotal = data.filter(i => (i.type || '').toLowerCase().includes('pessoal') || (i.type === 'personal'))
                                  .reduce((s, i) => s + parseAmount(i.amount ?? i.valor ?? i.value), 0);
        const businessTotal = data.filter(i => (i.type || '').toLowerCase().includes('prof') || (i.type === 'business'))
                                  .reduce((s, i) => s + parseAmount(i.amount ?? i.valor ?? i.value), 0);
        const othersTotal = data.reduce((s, i) => s + parseAmount(i.amount ?? i.valor ?? i.value), 0) - (personalTotal + businessTotal);

        // Destruir gráfico existente
        if (window.pixBoletoDistributionChartUnified) {
            window.pixBoletoDistributionChartUnified.destroy();
        }

        window.pixBoletoDistributionChartUnified = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Pessoal', 'Empresarial', 'Outros'],
                datasets: [{
                    data: [personalTotal, businessTotal, Math.max(0, othersTotal)],
                    backgroundColor: ['#10B981', '#7C3AED', '#9CA3AF'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = personalTotal + businessTotal + Math.max(0, othersTotal);
                                const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${formatCurrency(context.parsed)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Função para renderizar gráfico de categorias (unificado)
    async function renderPixBoletoCategoryChartUnified(year, month) {
        const canvas = document.getElementById('pix-boleto-category-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = await fetchPixBoletoData(year, month);
        const categoryTotals = {};
        data.forEach(item => {
            const category = (item.category && item.category.trim() !== '') ? item.category : 'Outros';
            const amt = parseAmount(item.amount ?? item.valor ?? item.value);
            categoryTotals[category] = (categoryTotals[category] || 0) + amt;
        });

        const categories = Object.keys(categoryTotals);
        const totals = categories.map(cat => categoryTotals[cat]);

        // Destruir gráfico existente
        if (window.pixBoletoCategoryChartUnified) {
            window.pixBoletoCategoryChartUnified.destroy();
        }

        window.pixBoletoCategoryChartUnified = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [{
                    label: 'PIX/Boleto',
                    data: totals,
                    backgroundColor: '#06B6D4',
                    borderColor: '#0891B2',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { stacked: false },
                    y: {
                        beginAtZero: true,
                        stacked: false,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }

    // Gráfico de Teto x Gasto por Plano (PIX/Boleto)
    async function renderPixBoletoLimitsChart(year, month) {
        const canvas = document.getElementById('pix-boleto-limits-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        try {
            const params = new URLSearchParams({ year, month, account: 'PIX/Boleto' });
            const resp = await authenticatedFetch(`${API_BASE_URL}/api/expenses-goals?${params.toString()}`);
            if (!resp.ok) throw new Error('Falha ao buscar tetos/gastos PIX/Boleto');
            const data = await resp.json();

            if (!Array.isArray(data) || data.length === 0) {
                console.log('Sem dados de tetos/gastos para PIX/Boleto');
                return;
            }

            const sorted = [...data].sort((a,b)=> parseInt(a.PlanoContasID) - parseInt(b.PlanoContasID));
            const labels = sorted.map(d => `Plano ${d.PlanoContasID}`);
            const gastos = sorted.map(d => Number(d.Total || 0));
            const tetosVals = sorted.map(d => Number(d.Teto || 0));

            // Destrói gráfico anterior, se houver
            if (window.pixBoletoLimitsChart) window.pixBoletoLimitsChart.destroy();

            window.pixBoletoLimitsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            type: 'line',
                            label: 'Teto',
                            data: tetosVals,
                            borderColor: '#16a34a',
                            backgroundColor: 'rgba(22,163,74,0.15)',
                            tension: 0.2,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Gasto',
                            data: gastos,
                            backgroundColor: gastos.map((val, i)=>{
                                const limit = tetosVals[i] || 0;
                                const p = limit>0 ? (val/limit)*100 : 0;
                                if (p>100) return 'rgba(239,68,68,0.85)';
                                if (p>=90) return 'rgba(251,146,60,0.85)';
                                if (p>=70) return 'rgba(250,204,21,0.85)';
                                return 'rgba(6,182,212,0.85)';
                            }),
                            borderColor: '#0e7490',
                            borderWidth: 1,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function(ctx){
                                    return `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: v => formatCurrency(v) }
                        }
                    }
                }
            });

            const periodEl = document.getElementById('pix-boleto-limits-period');
            if (periodEl) {
                periodEl.textContent = `${('0'+month).slice(-2)}/${year}`;
            }
        } catch (e) {
            console.error('Erro ao renderizar PIX/Boleto limits chart:', e);
        }
    }

    // ========== TABELAS PIX/BOLETO (UNIFICADO) ==========
    // Função para renderizar tabela de transações (unificado)
    function renderPixBoletoTransactionsTable(data) {
        const container = document.getElementById('pix-boleto-transactions');
        if (!container) return;

        // Ordenar por data (mais recente primeiro)
        const sortedData = data.sort((a, b) => new Date(b.transaction_date || b.date) - new Date(a.transaction_date || a.date));

        const tableHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full bg-white rounded-lg shadow">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conta</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${sortedData.map(item => `
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                                    ${new Date(item.transaction_date || item.date).toLocaleDateString('pt-BR')}
                                </td>
                                <td class="px-4 py-4 whitespace-nowrap">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isPixBoletoAccount(item.account) ? 'bg-cyan-100 text-cyan-800' : 'bg-gray-100 text-gray-700'}">
                                        ${isPixBoletoAccount(item.account) ? 'PIX/Boleto' : (item.account || 'N/A')}
                                    </span>
                                </td>
                                <td class="px-4 py-4 text-sm text-gray-900">${item.description}</td>
                                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${item.category || 'N/A'}</td>
                                <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-right text-red-600">
                                    ${formatCurrency(item.amount)}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHtml;
    }

    // Função para renderizar tabela de resumo (unificado)
    function renderPixBoletoSummaryTable(data) {
        const container = document.getElementById('pix-boleto-summary');
        if (!container) return;

        // Agrupar por categoria
        const categoryTotals = {};
        data.forEach(item => {
            const category = item.category || 'Outros';
            if (!categoryTotals[category]) {
                categoryTotals[category] = { total: 0, count: 0 };
            }
            const amount = parseFloat(item.amount);
            categoryTotals[category].total += amount;
            categoryTotals[category].count++;
        });

        const categories = Object.entries(categoryTotals)
            .sort((a, b) => b[1].total - a[1].total);

        const tableHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full bg-white rounded-lg shadow">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Transações</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${categories.map(([category, totals]) => `
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${category}</td>
                                <td class="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-red-600">
                                    ${formatCurrency(totals.total)}
                                </td>
                                <td class="px-4 py-4 whitespace-nowrap text-sm text-center text-gray-500">
                                    ${totals.count}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHtml;
    }

    // Lista Top 10 (unificado)
    function renderTopPixBoletoList(data) {
        const container = document.getElementById('top-pix-boleto-list');
        if (!container) return;
        const unified = data.filter(e => isPixBoletoAccount(e.account));
        const top = unified
            .map(e => ({...e, amountNum: parseAmount(e.amount ?? e.valor ?? e.value)}))
            .sort((a,b) => b.amountNum - a.amountNum)
            .slice(0,10);
        container.innerHTML = top.map(item => `
            <div class="flex justify-between items-center p-3 border rounded-md hover:bg-gray-50">
                <div>
                    <div class="text-sm font-medium text-gray-700">${item.description || 'Sem descrição'}</div>
                    <div class="text-xs text-gray-400">${new Date(item.transaction_date || item.date).toLocaleDateString('pt-BR')} • ${item.category || 'Outros'}</div>
                </div>
                <div class="text-sm font-semibold text-red-600">${formatCurrency(item.amountNum)}</div>
            </div>
        `).join('');
    }
    
    // Função específica para buscar gastos PIX e Boleto (todos os períodos)
    async function fetchPixBoletoExpenses() {
        try {
            if (!checkAuthentication()) return [];

            console.log('🔍 Buscando todos os gastos PIX/Boleto...');

            // Primeiro, tentar buscar sem filtros de período
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses`);

            if (!response.ok) {
                console.error('❌ Erro na resposta:', response.status, response.statusText);
                
                // Se falhar, tentar com ano atual
                const currentYear = new Date().getFullYear();
                const params = new URLSearchParams({ year: currentYear });
                const fallbackResponse = await authenticatedFetch(`${API_BASE_URL}/api/expenses?${params.toString()}`);
                
                if (!fallbackResponse.ok) {
                    const error = await fallbackResponse.json();
                    throw new Error(error.message || 'Erro ao buscar despesas PIX/Boleto.');
                }
                
                const expenses = await fallbackResponse.json();
                console.log('📊 Fallback: Total de despesas obtidas para PIX/Boleto:', expenses.length);
                return expenses;
            }

            const expenses = await response.json();
            console.log('📊 Total de despesas obtidas para PIX/Boleto (todos os períodos):', expenses.length);
            
            // Log de debug para ver se há gastos PIX/Boleto
            const pixBoletoCount = expenses.filter(e => isPixBoletoAccount(e.account) || e.account === 'PIX' || e.account === 'Boleto').length;
            console.log('💳 Gastos PIX/Boleto encontrados:', pixBoletoCount);
            
            if (pixBoletoCount === 0) {
                console.log('🔍 Nenhum gasto PIX/Boleto encontrado. Verificando estrutura dos dados...');
                // Log das primeiras 5 transações para debug
                console.log('📋 Primeiras 5 transações para debug:', expenses.slice(0, 5).map(e => ({
                    account: e.account,
                    amount: e.amount,
                    description: e.description,
                    date: e.transaction_date || e.date
                })));
            }
            
            return expenses;
        } catch (error) {
            console.error('❌ Erro ao buscar despesas PIX/Boleto:', error);
            return [];
        }
    }
    
    function updatePixBoletoStats(expenses) {
        console.log('🔄 Atualizando estatísticas PIX/Boleto (unificado)...');
        const unified = expenses.filter(e => isPixBoletoAccount(e.account));
        const total = unified.reduce((sum, e) => sum + parseAmount(e.amount || e.valor || e.value), 0);
        const count = unified.length;
        updatePixBoletoMetrics({ grandTotal: total, count, growth: 0, average: count ? total / count : 0 });
        if (count === 0) {
            console.log('ℹ️ Nenhum gasto PIX/Boleto encontrado para o período');
            setTimeout(() => showNotification('ℹ️ Nenhum gasto PIX/Boleto no período selecionado', 'info', 3000), 500);
        }
    }
    
    function renderPixBoletoCharts(expenses) {
        // Atualiza apenas gráficos unificados ao receber lista de despesas
        setTimeout(async () => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const monthlyData = [];
            for (let i = 11; i >= 0; i--) {
                const d = new Date(year, month - 1 - i);
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                const data = await fetchPixBoletoData(y, m);
                const total = data.reduce((s, it) => s + parseAmount(it.amount ?? it.valor ?? it.value), 0);
                monthlyData.push({ month: d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }), total });
            }
            renderPixBoletoEvolutionChartUnified(monthlyData);
            await renderPixBoletoDistributionChartUnified(year, month);
            await renderPixBoletoCategoryChartUnified(year, month);
        }, 100);
    }
    
    function setupPixBoletoFilters() {
        const typeFilter = document.getElementById('pix-boleto-type');
        const yearFilter = document.getElementById('pix-boleto-year');
        const monthFilter = document.getElementById('pix-boleto-month');
        const searchInput = document.getElementById('pix-boleto-search');
        
        console.log('🔧 Configurando filtros PIX e Boleto...');
        
        // Configurar filtros se existirem
        if (typeFilter) {
            // Remover event listeners anteriores
            typeFilter.removeEventListener('change', refreshPixBoletoData);
            typeFilter.addEventListener('change', refreshPixBoletoData);
            console.log('✅ Filtro de tipo configurado');
        }
        
        if (yearFilter) {
            // Preencher anos (últimos 3 anos + próximo ano)
            const currentYear = new Date().getFullYear();
            yearFilter.innerHTML = '<option value="">Todos os anos</option>';
            for (let year = currentYear - 2; year <= currentYear + 1; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                if (year === currentYear) option.selected = true;
                yearFilter.appendChild(option);
            }
            // Remover event listeners anteriores
            yearFilter.removeEventListener('change', refreshPixBoletoData);
            yearFilter.addEventListener('change', refreshPixBoletoData);
            console.log('✅ Filtro de ano configurado');
        }
        
        if (monthFilter) {
            // O HTML já tem os meses, só adicionar o event listener
            monthFilter.removeEventListener('change', refreshPixBoletoData);
            monthFilter.addEventListener('change', refreshPixBoletoData);
            console.log('✅ Filtro de mês configurado');
        }
        
        if (searchInput) {
            searchInput.removeEventListener('input', refreshPixBoletoData);
            searchInput.addEventListener('input', refreshPixBoletoData);
            console.log('✅ Campo de busca configurado');
        }
        
        // Adicionar botão de atualização manual se não existir
        const filterSection = document.querySelector('#pix-boleto-tab .bg-white:has(h3:contains("Filtros"))');
        if (filterSection && !document.getElementById('refresh-pix-boleto')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.id = 'refresh-pix-boleto-extra';
            refreshBtn.className = 'mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors';
            refreshBtn.innerHTML = '🔄 Atualizar Dados PIX/Boleto';
            refreshBtn.addEventListener('click', () => {
                console.log('🔄 Atualização manual EXTRA solicitada');
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '🔄 Atualizando...';
                
                loadPixBoletoData(true).finally(() => {
                    setTimeout(() => {
                        refreshBtn.disabled = false;
                        refreshBtn.innerHTML = '🔄 Atualizar Dados PIX/Boleto';
                    }, 1000);
                });
            });
            
            const filtersGrid = filterSection.querySelector('.grid');
            if (filtersGrid) {
                filterSection.insertBefore(refreshBtn, filtersGrid.nextSibling);
                console.log('✅ Botão de atualização manual EXTRA adicionado');
            }
        }
        
        console.log('🎯 Todos os filtros PIX e Boleto foram configurados');
    }
    
    async function refreshPixBoletoData() {
        console.log('🔄 Atualizando dados PIX e Boleto com filtros...');
        
        try {
            const expenses = await fetchPixBoletoExpenses();
            let filteredExpenses = expenses.filter(expense => 
                isPixBoletoAccount(expense.account) || expense.account === 'PIX' || expense.account === 'Boleto'
            );
            
            console.log('📊 Gastos PIX/Boleto antes dos filtros:', filteredExpenses.length);
            
            // Aplicar filtros
            const typeFilter = document.getElementById('pix-boleto-type');
            const yearFilter = document.getElementById('pix-boleto-year');
            const monthFilter = document.getElementById('pix-boleto-month');
            const searchInput = document.getElementById('pix-boleto-search');
            
            if (typeFilter && typeFilter.value !== '' && typeFilter.value !== 'todos') {
                filteredExpenses = filteredExpenses.filter(expense => 
                    expense.account === typeFilter.value
                );
                console.log('🎯 Após filtro de tipo:', filteredExpenses.length);
            }
            
            if (yearFilter && yearFilter.value && yearFilter.value !== '') {
                const selectedYear = parseInt(yearFilter.value);
                filteredExpenses = filteredExpenses.filter(expense => {
                    const expenseDate = new Date(expense.transaction_date || expense.date);
                    return expenseDate.getFullYear() === selectedYear;
                });
                console.log('📅 Após filtro de ano:', filteredExpenses.length);
            }
            
            if (monthFilter && monthFilter.value && monthFilter.value !== '' && monthFilter.value !== '0') {
                const selectedMonth = parseInt(monthFilter.value);
                filteredExpenses = filteredExpenses.filter(expense => {
                    const expenseDate = new Date(expense.transaction_date || expense.date);
                    return expenseDate.getMonth() + 1 === selectedMonth;
                });
                console.log('📅 Após filtro de mês:', filteredExpenses.length);
            }
            
            if (searchInput && searchInput.value.trim()) {
                const searchTerm = searchInput.value.trim().toLowerCase();
                filteredExpenses = filteredExpenses.filter(expense => 
                    (expense.description || '').toLowerCase().includes(searchTerm)
                );
                console.log('🔍 Após filtro de busca:', filteredExpenses.length);
            }
            
            // Atualizar estatísticas e gráficos
            updatePixBoletoStats(filteredExpenses);
            
            // Renderizar gráficos com delay
            setTimeout(() => {
                renderPixBoletoCharts(filteredExpenses);
            }, 100);
            
            console.log('✅ Dados PIX e Boleto atualizados:', filteredExpenses.length, 'transações');
            
        } catch (error) {
            console.error('❌ Erro ao atualizar dados PIX e Boleto:', error);
            showNotification('Erro ao atualizar dados PIX e Boleto', 'error');
        }
    }

    // Carregar análise empresarial específica para relatórios
    async function loadBusinessAnalysisForReports() {
        try {
            const year = filterYear.value;
            const month = filterMonth.value;

            const businessData = await fetchBusinessData(year, month);
            
            // Atualizar apenas o conteúdo da análise empresarial na aba de relatórios
            const businessContainer = document.getElementById('business-analysis-content');
            if (businessContainer) {
                businessContainer.innerHTML = `
                    <div class="grid grid-cols-2 gap-4">
                        <div class="text-center">
                            <p class="text-2xl font-bold text-blue-600">R$ ${(businessData.total || 0).toFixed(2)}</p>
                            <p class="text-sm text-gray-600">Total Empresarial</p>
                        </div>
                        <div class="text-center">
                            <p class="text-2xl font-bold text-green-600">${businessData.count || 0}</p>
                            <p class="text-sm text-gray-600">Transações</p>
                        </div>
                    </div>
                    <div class="mt-4">
                        <canvas id="business-mini-chart" width="300" height="150"></canvas>
                    </div>
                `;
                
                // Renderizar mini gráfico empresarial
                renderBusinessMiniChart(businessData);
            }

        } catch (error) {
            console.error('Erro ao carregar análise empresarial para relatórios:', error);
            const businessContainer = document.getElementById('business-analysis-content');
            if (businessContainer) {
                businessContainer.innerHTML = '<p class="text-red-500 text-center">Erro ao carregar dados empresariais</p>';
            }
        }
    }

    // Mini gráfico empresarial para a aba de relatórios
    function renderBusinessMiniChart(data) {
        const canvas = document.getElementById('business-mini-chart');
        if (!canvas || !data.expenses) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Destruir gráfico existente se houver
        if (chartRegistry.businessMiniChart) {
            chartRegistry.businessMiniChart.destroy();
        }

        const accounts = [...new Set(data.expenses.map(e => e.account))];
        const accountTotals = accounts.map(account => 
            data.expenses
                .filter(e => e.account === account)
                .reduce((sum, e) => sum + parseFloat(e.amount), 0)
        );

        chartRegistry.businessMiniChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: accounts,
                datasets: [{
                    data: accountTotals,
                    backgroundColor: [
                        '#3B82F6', '#EF4444', '#10B981', '#F59E0B', 
                        '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { fontSize: 10 }
                    }
                }
            }
        });
    }

    // ========== GRÁFICOS DE ANÁLISE EMPRESARIAL ==========
    
    // Função utilitária para validar dados do gráfico
    function validateChartData(data) {
        if (!data || typeof data !== 'object') {
            console.log('❌ Dados inválidos:', data);
            return false;
        }
        
        if (!Array.isArray(data.monthlyData)) {
            console.log('❌ monthlyData não é array:', data.monthlyData);
            return false;
        }
        
        const validData = data.monthlyData.every(val => 
            typeof val === 'number' && !isNaN(val) && isFinite(val)
        );
        
        if (!validData) {
            console.log('❌ Dados mensais contêm valores inválidos:', data.monthlyData);
            return false;
        }
        
        console.log('✅ Dados do gráfico válidos:', data);
        return true;
    }

    /**
     * Atualiza o gráfico de evolução empresarial com tendências
     */
    async function updateBusinessEvolutionChart(data) {
        const chartKey = 'businessEvolutionChart';
        const canvasId = 'business-evolution-chart';

        if (!isChartJsLoaded()) {
            console.warn('❌ Chart.js não carregado para business evolution chart');
            displayChartFallback(canvasId, 'Chart.js não carregado');
            return;
        }

        try {
            // Obter dados de tendência dos últimos 12 meses
            const trendData = await fetchBusinessTrendData();
            
            // Validar os dados antes de usar
            if (!validateChartData(trendData)) {
                displayChartFallback(canvasId, 'Dados inválidos para o gráfico de tendência');
                return;
            }
            
            if (!trendData || !trendData.monthlyData || trendData.monthlyData.length === 0) {
                displayChartFallback(canvasId, 'Sem dados de tendência disponíveis');
                return;
            }

            console.log('✅ Dados validados para gráfico de evolução:', trendData);

            const datasets = [{
                label: 'Gastos Empresariais',
                data: trendData.monthlyData,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: 'rgb(59, 130, 246)',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2
            }];

            // Adicionar linha de tendência se há dados suficientes
            const nonZeroData = trendData.monthlyData.filter(d => d > 0);
            if (nonZeroData.length >= 3) {
                const trendLine = calculateTrendLine(trendData.monthlyData);
                datasets.push({
                    label: 'Linha de Tendência',
                    data: trendLine,
                    borderColor: 'rgba(239, 68, 68, 0.8)',
                    backgroundColor: 'transparent',
                    borderDash: [8, 4],
                    borderWidth: 2,
                    tension: 0,
                    pointRadius: 0,
                    fill: false
                });
            }

            const config = {
                type: 'line',
                data: {
                    labels: trendData.labels,
                    datasets: datasets
                },
                options: mergeChartOptions({
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2.5,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Evolução dos Gastos Empresariais (12 meses)',
                            font: {
                                size: 16,
                                weight: 'bold'
                            },
                            padding: 20
                        },
                        subtitle: {
                            display: true,
                            text: '📈 Análise de tendências com projeção matemática',
                            font: {
                                size: 12
                            },
                            color: '#666'
                        },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    return `Período: ${context[0].label}`;
                                },
                                label: function(context) {
                                    const value = context.parsed.y;
                                    return `${context.dataset.label}: R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Período'
                            },
                            grid: {
                                display: true,
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Valor (R$)'
                            },
                            beginAtZero: true,
                            grid: {
                                display: true,
                                color: 'rgba(0, 0, 0, 0.1)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 0
                                    });
                                }
                            }
                        }
                    }
                })
            };

            createChart(chartKey, canvasId, config);

            // Gerar recomendações baseadas na tendência
            if (nonZeroData.length > 0) {
                generateBusinessRecommendations(trendData);
            }

        } catch (error) {
            console.error('❌ Erro ao criar gráfico de evolução empresarial:', error);
            displayChartFallback(canvasId, 'Erro ao carregar análise de tendências');
        }
    }

    // Função de teste específica para o gráfico de análise de tendências
    async function testTrendAnalysisChart() {
        console.log('🧪 Testando gráfico de análise de tendências...');
        
        try {
            const trendData = await fetchBusinessTrendData();
            console.log('📊 Dados obtidos:', trendData);
            
            if (validateChartData(trendData)) {
                await updateBusinessEvolutionChart(trendData);
                console.log('✅ Gráfico de tendências atualizado com sucesso');
                showNotification('✅ Gráfico de análise de tendências atualizado!', 'success', 3000);
            } else {
                console.log('❌ Falha na validação dos dados');
                showNotification('❌ Erro na validação dos dados do gráfico', 'error', 3000);
            }
        } catch (error) {
            console.error('❌ Erro no teste do gráfico:', error);
            showNotification('❌ Erro ao testar gráfico de tendências', 'error', 3000);
        }
    }

    // Expor a função de teste para debug manual
    window.testTrendChart = testTrendAnalysisChart;

    /* Atualiza o gráfico de distribuição por conta empresarial*/
    async function updateBusinessAccountChart(data) {
        const chartKey = 'businessAccountChart';
        const canvasId = 'business-account-chart';

        if (!isChartJsLoaded()) {
            console.warn('❌ Chart.js não carregado para business account chart');
            displayChartFallback(canvasId, 'Chart.js não carregado');
            return;
        }

        try {
            const accounts = Object.keys(data.byAccount || {});
            const values = Object.values(data.byAccount || {});

            if (accounts.length === 0) {
                displayChartFallback(canvasId, 'Nenhum dado de conta empresarial disponível');
                return;
            }

            // Usar cores personalizadas para cada tipo de conta
            const backgroundColors = accounts.map(account => getPaymentTypeColor(account, 0.8));
            const borderColors = accounts.map(account => getPaymentTypeColor(account, 1));
            
            // Adicionar ícones aos labels
            const enhancedLabels = accounts.map(account => {
                const icon = getPaymentTypeIcon(account);
                return `${icon} ${account}`;
            });

            const chartData = {
                labels: enhancedLabels,
                datasets: [{
                    data: values,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 3,
                    // Efeitos especiais para PIX e Boleto no ambiente empresarial
                    hoverBackgroundColor: accounts.map(account => {
                        if (account === 'PIX') return 'rgba(46, 204, 113, 1)';
                        if (account === 'Boleto') return 'rgba(231, 76, 60, 1)';
                        return getPaymentTypeColor(account, 1);
                    }),
                    hoverOffset: accounts.map(account => {
                        // Destaque maior para PIX e Boleto
                        return (account === 'PIX' || account === 'Boleto') ? 20 : 15;
                    })
                }]
            };

            const config = {
                type: 'doughnut',
                data: chartData,
                options: mergeChartOptions({
                    plugins: {
                        title: {
                            display: true,
                            text: '💼 Distribuição por Conta Empresarial'
                        },
                        legend: { 
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    return context[0].label;
                                },
                                label: function(context) {
                                    const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                                    const percentage = ((context.parsed / total) * 100).toFixed(1);
                                    return [
                                        `Valor: R$ ${context.parsed.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
                                        `Percentual: ${percentage}%`
                                    ];
                                }
                            }
                        }
                    },
                    cutout: '60%', // Para fazer um doughnut
                    scales: {} // Remove scales for doughnut chart
                })
            };

            createChart(chartKey, canvasId, config);

        } catch (error) {
            console.error('❌ Erro ao criar gráfico de contas empresariais:', error);
            displayChartFallback(canvasId, 'Erro ao carregar gráfico de contas');
        }
    }

    /**
     * Atualiza o gráfico de categorias empresariai*/
    async function updateBusinessCategoryChart(data) {
        const chartKey = 'businessCategoryChart';
        const canvasId = 'business-category-chart';

        if (!isChartJsLoaded()) {
            console.warn('❌ Chart.js não carregado para business category chart');
            displayChartFallback(canvasId, 'Chart.js não carregado');
            return;
        }

        try {
            const categories = Object.keys(data.byCategory || {});
            const values = Object.values(data.byCategory || {});

            if (categories.length === 0) {
                displayChartFallback(canvasId, 'Nenhum dado de categoria empresarial disponível');
                return;
            }

            const chartData = {
                labels: categories,
                datasets: [{
                    label: 'Valor por Categoria',
                    data: values,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 2,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            };

            const config = {
                type: 'bar',
                data: chartData,
                options: mergeChartOptions({
                    plugins: {
                        title: {
                            display: true,
                            text: 'Gastos por Categoria Empresarial'
                        },
                        legend: { 
                            display: false 
                        },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    return `Categoria: ${context[0].label}`;
                                },
                                label: function(context) {
                                    return `Valor: R$ ${context.parsed.y.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Categorias'
                            },
                            ticks: {
                                maxRotation: 45,
                                minRotation: 0
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Valor (R$)'
                            }
                        }
                    }
                })
            };

            createChart(chartKey, canvasId, config);

        } catch (error) {
            console.error('❌ Erro ao criar gráfico de categorias empresariais:', error);
            displayChartFallback(canvasId, 'Erro ao carregar gráfico de categorias');
        }
    }

    // ====== FUNÇÕES DE ANÁLISE DE TENDÊNCIAS ======
    
    async function fetchBusinessTrendData() {
        try {
            // Primeiro tentar a API específica de trends
            let response = await authenticatedFetch(`${API_BASE_URL}/api/business/trends?months=12`);
            
            let trendsData = [];
            
            if (response.ok) {
                trendsData = await response.json();
                console.log('Dados de tendência da API:', trendsData);
            } else {
                console.warn('API de trends não disponível, usando método alternativo');
                
                // Fallback: buscar dados dos últimos 12 meses manualmente
                const currentDate = new Date();
                const promises = [];
                
                for (let i = 11; i >= 0; i--) {
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                    const year = date.getFullYear();
                    const month = date.getMonth() + 1;
                    
                    const promise = authenticatedFetch(`${API_BASE_URL}/api/business/summary?year=${year}&month=${month}`)
                        .then(res => res.ok ? res.json() : null)
                        .then(data => ({
                            year,
                            month,
                            total: data ? parseFloat(data.total) || 0 : 0
                        }))
                        .catch(() => ({ year, month, total: 0 }));
                    
                    promises.push(promise);
                }
                
                trendsData = await Promise.all(promises);
            }
            
            // Criar arrays para os últimos 12 meses
            const currentDate = new Date();
            const monthlyData = [];
            const labels = [];
            
            // Gerar labels e dados para os últimos 12 meses
            for (let i = 11; i >= 0; i--) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                
                labels.push(date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));
                
                // Procurar dados correspondentes na resposta da API
                const monthData = trendsData.find(item => 
                    item.year === year && item.month === month
                );
                
                const value = monthData ? parseFloat(monthData.total) || 0 : 0;
                monthlyData.push(value);
            }
            
            console.log('Dados processados:', { monthlyData, labels });
            
            return { 
                monthlyData, 
                labels,
                rawData: trendsData 
            };
            
        } catch (error) {
            console.error('Erro ao buscar dados de tendência:', error);
            showNotification('Erro ao carregar dados de tendência', 'warning', 3000);
            
            // Fallback para dados vazios mas estruturados
            const currentDate = new Date();
            const labels = [];
            const monthlyData = [];
            
            for (let i = 11; i >= 0; i--) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                labels.push(date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));
                monthlyData.push(0);
            }
            
            return {
                monthlyData,
                labels,
                rawData: []
            };
        }
    }

    function calculateTrendLine(data) {
        const n = data.length;
        const x = Array.from({length: n}, (_, i) => i);
        const y = data;
        
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        return x.map(xi => slope * xi + intercept);
    }

    function generateBusinessRecommendations(trendData) {
        try {
            const { monthlyData, rawData } = trendData;
            
            if (!monthlyData || monthlyData.length === 0) {
                console.log('Sem dados mensais para gerar recomendações');
                return;
            }
            
            const recentData = monthlyData.slice(-6); // Últimos 6 meses
            const hasData = recentData.some(value => value > 0);
            
            console.log('Dados recentes para recomendações:', recentData);
            
            if (!hasData) {
                console.log('Não há dados suficientes para gerar recomendações');
                showNotification('📊 Sem dados empresariais suficientes para análise de tendências', 'info', 3000);
                return;
            }

            const recommendations = [];
            const nonZeroData = recentData.filter(v => v > 0);
            
            if (nonZeroData.length === 0) {
                console.log('Nenhum dado não-zero encontrado');
                return;
            }
            
            const average = nonZeroData.reduce((sum, val) => sum + val, 0) / nonZeroData.length;
            const lastMonth = recentData[recentData.length - 1];
            const secondLastMonth = recentData[recentData.length - 2];
            
            console.log('Análise:', { average, lastMonth, secondLastMonth, nonZeroData });
            
            // Análise de crescimento mensal
            if (lastMonth > 0 && secondLastMonth > 0) {
                const growthRate = ((lastMonth / secondLastMonth - 1) * 100);
                if (growthRate > 20) {
                    recommendations.push({
                        type: 'warning',
                        title: '📈 Crescimento Significativo',
                        message: `Gastos empresariais aumentaram ${growthRate.toFixed(1)}% no último mês. Revisar orçamento e categorias.`,
                        priority: 'high'
                    });
                } else if (growthRate < -20) {
                    recommendations.push({
                        type: 'success',
                        title: '📉 Redução Significativa',
                        message: `Excelente! Gastos empresariais reduziram ${Math.abs(growthRate).toFixed(1)}% no último mês.`,
                        priority: 'low'
                    });
                }
            }
            
            // Análise de variabilidade
            if (nonZeroData.length >= 3) {
                const variance = nonZeroData.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / nonZeroData.length;
                const stdDev = Math.sqrt(variance);
                const coefficientOfVariation = stdDev / average;
                
                if (coefficientOfVariation > 0.4) {
                    recommendations.push({
                        type: 'info',
                        title: '📊 Gastos Inconsistentes',
                        message: `Variabilidade alta nos gastos (${(coefficientOfVariation * 100).toFixed(1)}%). Considere um planejamento mais regular.`,
                        priority: 'medium'
                    });
                }
            }
            
            // Análise de tendência
            const firstHalf = recentData.slice(0, 3).filter(v => v > 0);
            const secondHalf = recentData.slice(3).filter(v => v > 0);
            
            if (firstHalf.length > 0 && secondHalf.length > 0) {
                const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
                const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
                
                if (secondAvg > firstAvg * 1.15) {
                    recommendations.push({
                        type: 'warning',
                        title: '⚠️ Tendência Crescente',
                        message: `Gastos aumentaram ${((secondAvg / firstAvg - 1) * 100).toFixed(1)}% nos últimos 3 meses. Monitorar de perto.`,
                        priority: 'high'
                    });
                } else if (secondAvg < firstAvg * 0.85) {
                    recommendations.push({
                        type: 'success',
                        title: '✅ Otimização Bem-sucedida',
                        message: `Gastos reduziram ${((1 - secondAvg / firstAvg) * 100).toFixed(1)}% nos últimos 3 meses. Continue assim!`,
                        priority: 'low'
                    });
                }
            }
            
            // Análise sazonal (se há dados de mais de 6 meses)
            if (rawData && rawData.length >= 6) {
                const monthlyTotals = rawData.reduce((acc, item) => {
                    const monthKey = item.month;
                    if (!acc[monthKey]) acc[monthKey] = [];
                    acc[monthKey].push(item.total);
                    return acc;
                }, {});
                
                // Identificar meses com gastos consistentemente altos
                const highSpendingMonths = Object.entries(monthlyTotals)
                    .filter(([month, totals]) => totals.length > 1)
                    .filter(([month, totals]) => {
                        const avg = totals.reduce((sum, val) => sum + val, 0) / totals.length;
                        return avg > average * 1.2;
                    })
                    .map(([month]) => {
                        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                        return monthNames[parseInt(month) - 1];
                    });
                
                if (highSpendingMonths.length > 0) {
                    recommendations.push({
                        type: 'info',
                        title: '📅 Padrão Sazonal',
                        message: `Meses com gastos tradicionalmente altos: ${highSpendingMonths.join(', ')}. Planeje com antecedência.`,
                        priority: 'medium'
                    });
                }
            }
            
            // Recomendação de meta baseada na média
            if (average > 0) {
                const suggestedLimit = average * 1.1; // 10% acima da média
                recommendations.push({
                    type: 'info',
                    title: '💡 Sugestão de Meta',
                    message: `Com base no histórico, considere uma meta mensal de R$ ${suggestedLimit.toLocaleString('pt-BR', {minimumFractionDigits: 2})}.`,
                    priority: 'low'
                });
            }
            
            // Exibir recomendações
            displayBusinessRecommendations(recommendations);
            
        } catch (error) {
            console.error('Erro ao gerar recomendações:', error);
        }
    }

    function displayBusinessRecommendations(recommendations) {
        // Filtrar por prioridade e limitar quantidade
        const highPriority = recommendations.filter(r => r.priority === 'high').slice(0, 2);
        const mediumPriority = recommendations.filter(r => r.priority === 'medium').slice(0, 1);
        const lowPriority = recommendations.filter(r => r.priority === 'low').slice(0, 1);
        
        const toShow = [...highPriority, ...mediumPriority, ...lowPriority];
        
        toShow.forEach((rec, index) => {
            setTimeout(() => {
                showNotification(
                    `${rec.title}: ${rec.message}`,
                    rec.type,
                    rec.priority === 'high' ? 8000 : 5000
                );
            }, index * 2000); // Espaçar notificações
        });
    }

    function populateBusinessFilters() {
        // Populá filtros específicos da análise empresarial
        const businessPeriod = document.getElementById('business-period');
        const businessAccount = document.getElementById('business-account');
        
        if (businessPeriod && !businessPeriod.hasChildNodes()) {
            const periods = ['Este mês', 'Últimos 3 meses', 'Últimos 6 meses', 'Este ano'];
            periods.forEach(period => {
                const option = document.createElement('option');
                option.value = period.toLowerCase().replace(/\s+/g, '-');
                option.textContent = period;
                businessPeriod.appendChild(option);
            });
        }

        // Adicionar event listeners para filtros
        if (businessPeriod) businessPeriod.addEventListener('change', loadBusinessAnalysis);
        if (businessAccount) businessAccount.addEventListener('change', loadBusinessAnalysis);
    }

    async function loadBusinessExpensesList() {
        try {
            if (!checkAuthentication()) return;

            const year = filterYear.value;
            const month = filterMonth.value;
            
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses?year=${year}&month=${month}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar gastos');
            }
            
            const expenses = await response.json();
            const businessExpenses = expenses.filter(exp => exp.is_business_expense);
            
            displayBusinessExpensesList(businessExpenses);
        } catch (error) {
            console.error('Erro ao carregar lista de gastos empresariais:', error);
            showNotification('Erro ao carregar gastos empresariais', 'error');
        }
    }

    function displayBusinessExpensesList(expenses) {
        const container = document.getElementById('business-expenses-table');
        if (!container) return;

        if (expenses.length === 0) {
            container.innerHTML = '<tr><td colspan="8" class="text-gray-500 text-center py-4">Nenhum gasto empresarial encontrado</td></tr>';
            return;
        }

        const html = expenses.map(expense => `
            <tr class="business-table-row border-b hover:bg-gray-50">
                <td class="p-3">${new Date(expense.transaction_date).toLocaleDateString('pt-BR')}</td>
                <td class="p-3">${expense.description}</td>
                <td class="p-3 text-right font-medium">R$ ${parseFloat(expense.amount).toFixed(2)}</td>
                <td class="p-3">${expense.account}</td>
                <td class="p-3">${expense.category || 'N/A'}</td>
                <td class="p-3">
                    ${expense.invoice_path 
                        ? '<span class="text-green-600">✓ Com NF</span>' 
                        : '<span class="text-red-600">✗ Sem NF</span>'
                    }
                </td>
                <td class="p-3">${getBillingPeriod(expense.transaction_date, expense.account)}</td>
                <td class="p-3">
                    <button onclick="editExpense(${expense.id})" class="text-blue-600 hover:text-blue-800 mr-2">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteExpense(${expense.id})" class="text-red-600 hover:text-red-800">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        container.innerHTML = html;
        updateBusinessStats(expenses);
    }

    function updateBusinessStats(expenses) {
        const total = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
        const count = expenses.length;
        const average = count > 0 ? total / count : 0;
        const withInvoice = expenses.filter(exp => exp.invoice_path).length;
        const invoicePercentage = count > 0 ? (withInvoice / count * 100) : 0;

        const filteredTotal = document.getElementById('filtered-total');
        const filteredCount = document.getElementById('filtered-count');
        const filteredAverage = document.getElementById('filtered-average');
        const filteredInvoicePercentage = document.getElementById('filtered-invoice-percentage');

        if (filteredTotal) filteredTotal.textContent = `R$ ${total.toFixed(2)}`;
        if (filteredCount) filteredCount.textContent = count.toString();
        if (filteredAverage) filteredAverage.textContent = `R$ ${average.toFixed(2)}`;
        if (filteredInvoicePercentage) filteredInvoicePercentage.textContent = `${invoicePercentage.toFixed(1)}%`;
    }

    function getBillingPeriod(transactionDate, account) {
        // Implementar lógica de período de fatura baseado na conta
        const date = new Date(transactionDate);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        return `${month.toString().padStart(2, '0')}/${year}`;
    }

    function groupByAccount(expenses) {
        return expenses.reduce((acc, expense) => {
            const account = expense.account || 'Não especificado';
            acc[account] = (acc[account] || 0) + parseFloat(expense.amount);
            return acc;
        }, {});
    }

    function groupByCategory(expenses) {
        return expenses.reduce((acc, expense) => {
            const category = expense.category || 'Não especificado';
            acc[category] = (acc[category] || 0) + parseFloat(expense.amount);
            return acc;
        }, {});
    }

    // ========== INICIALIZAÇÃO ==========
    // Adicionar inicialização das tabs no final da inicialização
    function initializeDashboard() {
        populateAccountFilter();
        populateFilterOptions();
        fetchAllData();
        toggleExpenseFields();
        initializeTabs(); // Adicionar inicialização das tabs
    // Carregar gráficos trimestrais e projeções empresariais se elementos existirem
    setTimeout(()=>{ try { loadQuarterlyAndProjection(); } catch(e){ console.warn('Quarterly load falhou:', e);} }, 1200);
    }

    // ========== INICIALIZAÇÃO AUTOMÁTICA ==========
    // Verificar se o usuário já está logado quando a página carrega
    async function init() {
        console.log('🚀 Iniciando aplicação...');
        
        // Aguardar Chart.js estar disponível
        await waitForChartJs();
        
        if (!isChartJsLoaded()) {
            console.warn('⚠️ Chart.js não carregado - gráficos podem não funcionar');
            showNotification('Biblioteca de gráficos não carregada - alguns recursos podem não funcionar', 'warning');
        } else {
            console.log('✅ Chart.js carregado com sucesso');
        }
        
        addEventListeners();
        populateYearAndMonthFilters();
        populateAccountFilter();
        checkMonthlyReportReminder();
        
        const token = getToken();
        if (token) {
            try {
                // Verificar se o token ainda é válido
                console.log('Verificando token...');
                const response = await authenticatedFetch(`${API_BASE_URL}/api/accounts`);
                
                if (response.ok) {
                    console.log('Token válido, mostrando dashboard');
                    showDashboard();
                    await fetchAllData();
                    
                    // Integrar novo sistema PIX/Boleto
                    integratePixBoletoSystem();
                } else {
                    console.log('Token inválido, limpando e mostrando login');
                    // Token inválido, limpar e mostrar login
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    showLogin();
                }
            } catch (error) {
                console.log('Erro ao verificar token, mostrando login:', error);
                // Erro de rede ou autenticação, mostrar login
                showLogin();
            }
        } else {
            console.log('Nenhum token encontrado, mostrando login');
            showLogin();
        }
    }

    // ========== SISTEMA DE INSIGHTS E APOIO À DECISÃO ==========

    /**
     * Inicializa o sistema de insights
     */
    function initInsightSystem() {
        const refreshBtn = document.getElementById('refresh-insights-btn');
        const tabBtns = document.querySelectorAll('.insight-tab-btn');
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', refreshAllInsights);
        }
        
        // Event listeners para as abas
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = e.target.getAttribute('data-tab');
                switchInsightTab(targetTab);
            });
        });
        
        // Verificar se os filtros estão prontos antes de carregar insights
        if (filterYear && filterMonth && filterYear.value && filterMonth.value) {
            console.log('📊 Filtros prontos, carregando insights...');
            refreshAllInsights();
        } else {
            console.log('⏳ Aguardando filtros serem inicializados...');
            // Tentar novamente após um delay
            setTimeout(() => {
                if (filterYear && filterMonth && filterYear.value && filterMonth.value) {
                    console.log('📊 Filtros prontos após delay, carregando insights...');
                    refreshAllInsights();
                } else {
                    console.log('⚠️ Filtros ainda não prontos, carregando com valores padrão...');
                    refreshAllInsights();
                }
            }, 2000);
        }
    }

    /**
     * Alterna entre as abas do sistema de insights
     */
    function switchInsightTab(targetTab) {
        // Atualizar botões das abas
        document.querySelectorAll('.insight-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === targetTab) {
                btn.classList.add('active');
            }
        });
        
        // Atualizar conteúdo das abas
        document.querySelectorAll('.insight-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        const targetContent = document.getElementById(`${targetTab}-content`);
        if (targetContent) {
            targetContent.classList.remove('hidden');
            
            // Carregar conteúdo específico da aba
            switch(targetTab) {
                case 'alerts':
                    loadCriticalAlerts();
                    break;
                case 'recommendations':
                    loadRecommendations();
                    break;
                case 'decisions':
                    loadDecisionSupport();
                    break;
                case 'actions':
                    loadActionPlan();
                    break;
            }
        }
    }

    /**
     * Atualiza todos os insights
     */
    async function refreshAllInsights() {
        try {
            showNotification('🔄 Atualizando insights...', 'info', 2000);
            
            await Promise.all([
                loadCriticalAlerts(),
                loadRecommendations(),
                loadDecisionSupport(),
                loadActionPlan()
            ]);
            
            showNotification('✅ Insights atualizados com sucesso!', 'success', 3000);
        } catch (error) {
            console.error('Erro ao atualizar insights:', error);
            showNotification('❌ Erro ao atualizar insights', 'error', 3000);
        }
    }

    /**
     * Carrega alertas críticos
     */
    async function loadCriticalAlerts() {
        try {
            const data = await fetchDashboardData();
            const alertsContainer = document.getElementById('critical-alerts');
            const statusContainer = document.getElementById('financial-status');
            const riskContainer = document.getElementById('risk-indicators');
            
            if (!alertsContainer) return;
            
            // Analisar dados e gerar alertas
            const alerts = analyzeFinancialAlerts(data);
            const status = calculateFinancialStatus(data);
            const risks = calculateRiskIndicators(data);
            
            // Renderizar alertas críticos
            alertsContainer.innerHTML = alerts.map(alert => `
                <div class="alert-${alert.type} p-4 rounded-lg">
                    <div class="flex items-start space-x-3">
                        <div class="text-2xl">${alert.icon}</div>
                        <div class="flex-1">
                            <h5 class="font-semibold text-gray-800">${alert.title}</h5>
                            <p class="text-sm text-gray-600 mt-1">${alert.message}</p>
                            ${alert.action ? `<button class="mt-2 text-sm bg-white px-3 py-1 rounded border hover:bg-gray-50" onclick="${alert.action}">${alert.actionText}</button>` : ''}
                        </div>
                    </div>
                </div>
            `).join('');
            
            // Renderizar status financeiro
            if (statusContainer) {
                statusContainer.innerHTML = `
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-600">Saúde Financeira</span>
                        <span class="font-semibold text-${status.health.color}-600">${status.health.label}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-600">Tendência</span>
                        <span class="font-semibold text-${status.trend.color}-600">${status.trend.icon} ${status.trend.label}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-600">Liquidez</span>
                        <span class="font-semibold text-${status.liquidity.color}-600">${status.liquidity.label}</span>
                    </div>
                `;
            }
            
            // Renderizar indicadores de risco
            if (riskContainer) {
                riskContainer.innerHTML = risks.map(risk => `
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-600">${risk.name}</span>
                        <div class="flex items-center space-x-2">
                            <div class="w-16 h-2 bg-gray-200 rounded">
                                <div class="h-full bg-${risk.color}-500 rounded" style="width: ${risk.value}%"></div>
                            </div>
                            <span class="text-xs font-medium text-${risk.color}-600">${risk.value}%</span>
                        </div>
                    </div>
                `).join('');
            }
            
        } catch (error) {
            console.error('Erro ao carregar alertas críticos:', error);
        }
    }

    /**
     * Analisa dados financeiros e gera alertas
     */
    function analyzeFinancialAlerts(data) {
        const alerts = [];
        
        if (!data || !data.expenses) return alerts;
        
        const currentMonth = new Date().getMonth();
        const currentExpenses = data.expenses.filter(exp => {
            const expDate = new Date(exp.data);
            return expDate.getMonth() === currentMonth;
        });
        
        const totalCurrent = currentExpenses.reduce((sum, exp) => sum + exp.valor, 0);
        const averageExpense = data.monthlyAverage || 0;
        
        // Alerta de gastos elevados
        if (totalCurrent > averageExpense * 1.2) {
            alerts.push({
                type: 'critical',
                icon: '🚨',
                title: 'Gastos Acima da Média',
                message: `Gastos deste mês estão ${((totalCurrent / averageExpense - 1) * 100).toFixed(1)}% acima da média histórica.`,
                action: 'showExpenseBreakdown()',
                actionText: 'Ver Detalhes'
            });
        }
        
        // Alerta de tendência de crescimento
        if (data.growthRate && data.growthRate > 15) {
            alerts.push({
                type: 'warning',
                icon: '📈',
                title: 'Tendência de Crescimento',
                message: `Gastos crescendo ${data.growthRate.toFixed(1)}% ao mês. Revisar orçamento.`,
                action: 'createBudgetPlan()',
                actionText: 'Criar Plano'
            });
        }
        
        // Alerta de concentração de gastos
        const businessExpenses = currentExpenses.filter(exp => exp.empresarial);
        if (businessExpenses.length > 0) {
            const businessTotal = businessExpenses.reduce((sum, exp) => sum + exp.valor, 0);
            const businessRatio = (businessTotal / totalCurrent) * 100;
            
            if (businessRatio > 70) {
                alerts.push({
                    type: 'info',
                    icon: '🏢',
                    title: 'Alta Concentração Empresarial',
                    message: `${businessRatio.toFixed(1)}% dos gastos são empresariais. Considere diversificar.`,
                    action: 'analyzeCategoryDistribution()',
                    actionText: 'Analisar'
                });
            }
        }
        
        return alerts;
    }

    /**
     * Calcula status financeiro geral
     */
    function calculateFinancialStatus(data) {
        if (!data || !data.expenses) {
            return {
                health: { label: 'Sem Dados', color: 'gray' },
                trend: { label: 'Indefinida', icon: '➖', color: 'gray' },
                liquidity: { label: 'Indefinida', color: 'gray' }
            };
        }
        
        const growthRate = data.growthRate || 0;
        const variationCoeff = data.variationCoefficient || 0;
        
        // Calcular saúde financeira
        let health;
        if (growthRate < 5 && variationCoeff < 20) {
            health = { label: 'Excelente', color: 'green' };
        } else if (growthRate < 15 && variationCoeff < 35) {
            health = { label: 'Boa', color: 'blue' };
        } else if (growthRate < 25 && variationCoeff < 50) {
            health = { label: 'Atenção', color: 'yellow' };
        } else {
            health = { label: 'Crítica', color: 'red' };
        }
        
        // Calcular tendência
        let trend;
        if (growthRate > 10) {
            trend = { label: 'Crescente', icon: '📈', color: 'red' };
        } else if (growthRate < -5) {
            trend = { label: 'Decrescente', icon: '📉', color: 'green' };
        } else {
            trend = { label: 'Estável', icon: '➖', color: 'blue' };
        }
        
        // Calcular liquidez (baseado na variação)
        let liquidity;
        if (variationCoeff < 20) {
            liquidity = { label: 'Alta', color: 'green' };
        } else if (variationCoeff < 40) {
            liquidity = { label: 'Média', color: 'yellow' };
        } else {
            liquidity = { label: 'Baixa', color: 'red' };
        }
        
        return { health, trend, liquidity };
    }

    /**
     * Calcula indicadores de risco
     */
    function calculateRiskIndicators(data) {
        const risks = [];
        
        if (!data || !data.expenses) {
            return [
                { name: 'Volatilidade', value: 0, color: 'gray' },
                { name: 'Concentração', value: 0, color: 'gray' },
                { name: 'Crescimento', value: 0, color: 'gray' },
                { name: 'Previsibilidade', value: 0, color: 'gray' }
            ];
        }
        
        const growthRate = Math.abs(data.growthRate || 0);
        const variationCoeff = data.variationCoefficient || 0;
        
        // Risco de volatilidade
        const volatilityRisk = Math.min(variationCoeff * 2, 100);
        risks.push({
            name: 'Volatilidade',
            value: Math.round(volatilityRisk),
            color: volatilityRisk > 60 ? 'red' : volatilityRisk > 30 ? 'yellow' : 'green'
        });
        
        // Risco de crescimento
        const growthRisk = Math.min(growthRate * 4, 100);
        risks.push({
            name: 'Crescimento',
            value: Math.round(growthRisk),
            color: growthRisk > 60 ? 'red' : growthRisk > 30 ? 'yellow' : 'green'
        });
        
        // Risco de concentração (empresarial vs pessoal)
        const businessExpenses = data.expenses.filter(exp => exp.empresarial);
        const concentrationRatio = businessExpenses.length / data.expenses.length * 100;
        const concentrationRisk = Math.abs(concentrationRatio - 50) * 2; // Risco quando muito concentrado em um tipo
        risks.push({
            name: 'Concentração',
            value: Math.round(Math.min(concentrationRisk, 100)),
            color: concentrationRisk > 60 ? 'red' : concentrationRisk > 30 ? 'yellow' : 'green'
        });
        
        // Risco de previsibilidade
        const predictabilityRisk = 100 - Math.min(variationCoeff * 3, 100);
        risks.push({
            name: 'Previsibilidade',
            value: Math.round(predictabilityRisk),
            color: predictabilityRisk < 40 ? 'red' : predictabilityRisk < 70 ? 'yellow' : 'green'
        });
        
        return risks;
    }

    /**
     * Carrega recomendações inteligentes
     */
    async function loadRecommendations() {
        try {
            const data = await fetchDashboardData();
            const savingsContainer = document.getElementById('savings-recommendations');
            const investmentContainer = document.getElementById('investment-recommendations');
            const patternContainer = document.getElementById('pattern-analysis');
            
            if (!data || !data.expenses) return;
            
            // Gerar recomendações de economia
            const savingsRecs = generateSavingsRecommendations(data);
            if (savingsContainer) {
                savingsContainer.innerHTML = savingsRecs.map(rec => `
                    <div class="flex items-start space-x-3 p-3 bg-white rounded border">
                        <div class="text-lg">${rec.icon}</div>
                        <div class="flex-1">
                            <h6 class="font-medium text-green-800">${rec.title}</h6>
                            <p class="text-sm text-green-600">${rec.description}</p>
                            <div class="text-xs text-green-500 mt-1">Economia estimada: ${rec.savings}</div>
                        </div>
                    </div>
                `).join('');
            }
            
            // Gerar recomendações de investimento
            const investmentRecs = generateInvestmentRecommendations(data);
            if (investmentContainer) {
                investmentContainer.innerHTML = investmentRecs.map(rec => `
                    <div class="flex items-start space-x-3 p-3 bg-white rounded border">
                        <div class="text-lg">${rec.icon}</div>
                        <div class="flex-1">
                            <h6 class="font-medium text-blue-800">${rec.title}</h6>
                            <p class="text-sm text-blue-600">${rec.description}</p>
                            <div class="text-xs text-blue-500 mt-1">Potencial: ${rec.potential}</div>
                        </div>
                    </div>
                `).join('');
            }
            
            // Análise de padrões
            const patterns = analyzeSpendingPatterns(data);
            if (patternContainer) {
                patternContainer.innerHTML = patterns.map(pattern => `
                    <div class="text-center p-3 bg-white rounded border">
                        <div class="text-2xl mb-2">${pattern.icon}</div>
                        <div class="font-medium text-purple-800">${pattern.title}</div>
                        <div class="text-sm text-purple-600">${pattern.value}</div>
                    </div>
                `).join('');
            }
            
        } catch (error) {
            console.error('Erro ao carregar recomendações:', error);
        }
    }

    /**
     * Gera recomendações de economia
     */
    function generateSavingsRecommendations(data) {
        const recommendations = [];
        
        if (!data.expenses || data.expenses.length === 0) return recommendations;
        
        // Analisar gastos por categoria
        const categories = {};
        data.expenses.forEach(exp => {
            const category = exp.descricao_conta || 'Outros';
            categories[category] = (categories[category] || 0) + exp.valor;
        });
        
        // Encontrar categoria com maior gasto
        const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
        if (topCategory) {
            recommendations.push({
                icon: '🎯',
                title: 'Otimizar Categoria Principal',
                description: `Revisar gastos em "${topCategory[0]}" - sua categoria de maior impacto`,
                savings: `R$ ${(topCategory[1] * 0.15).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
            });
        }
        
        // Recomendação baseada na frequência
        const frequentExpenses = data.expenses.filter(exp => {
            const count = data.expenses.filter(e => e.descricao_conta === exp.descricao_conta).length;
            return count > 3;
        });
        
        if (frequentExpenses.length > 0) {
            const avgFrequent = frequentExpenses.reduce((sum, exp) => sum + exp.valor, 0) / frequentExpenses.length;
            recommendations.push({
                icon: '🔄',
                title: 'Negociar Gastos Recorrentes',
                description: 'Renegociar contratos e serviços recorrentes para obter melhores condições',
                savings: `R$ ${(avgFrequent * 0.2).toLocaleString('pt-BR', {minimumFractionDigits: 2})}/mês`
            });
        }
        
        // Recomendação baseada em gastos empresariais
        const businessExpenses = data.expenses.filter(exp => exp.empresarial);
        if (businessExpenses.length > 0) {
            const businessTotal = businessExpenses.reduce((sum, exp) => sum + exp.valor, 0);
            recommendations.push({
                icon: '🏢',
                title: 'Otimização Fiscal',
                description: 'Revisar classificação de gastos empresariais para benefícios fiscais',
                savings: `R$ ${(businessTotal * 0.1).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
            });
        }
        
        return recommendations;
    }

    /**
     * Gera recomendações de investimento
     */
    function generateInvestmentRecommendations(data) {
        const recommendations = [];
        
        if (!data.expenses || data.expenses.length === 0) return recommendations;
        
        const monthlyTotal = data.monthlyAverage || 0;
        const variationCoeff = data.variationCoefficient || 0;
        
        // Recomendação de reserva de emergência
        recommendations.push({
            icon: '🛡️',
            title: 'Reserva de Emergência',
            description: 'Mantenha 6 meses de gastos como reserva de emergência',
            potential: `R$ ${(monthlyTotal * 6).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
        });
        
        // Recomendação baseada na estabilidade
        if (variationCoeff < 30) {
            recommendations.push({
                icon: '📈',
                title: 'Investimentos de Longo Prazo',
                description: 'Gastos estáveis permitem investimentos de maior prazo e rentabilidade',
                potential: 'CDI + 2% a.a.'
            });
        } else {
            recommendations.push({
                icon: '💰',
                title: 'Investimentos Líquidos',
                description: 'Variação alta nos gastos sugere investimentos mais líquidos',
                potential: '100% CDI'
            });
        }
        
        // Recomendação de diversificação
        recommendations.push({
            icon: '🌟',
            title: 'Diversificação',
            description: 'Distribua investimentos entre diferentes classes de ativos',
            potential: 'Risco otimizado'
        });
        
        return recommendations;
    }

    /**
     * Analisa padrões de gastos
     */
    function analyzeSpendingPatterns(data) {
        const patterns = [];
        
        if (!data.expenses || data.expenses.length === 0) return patterns;
        
        // Padrão de sazonalidade
        const monthlyData = Array(12).fill(0);
        data.expenses.forEach(exp => {
            const month = new Date(exp.data).getMonth();
            monthlyData[month] += exp.valor;
        });
        
        const maxMonth = monthlyData.indexOf(Math.max(...monthlyData));
        const minMonth = monthlyData.indexOf(Math.min(...monthlyData));
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        
        patterns.push({
            icon: '📅',
            title: 'Pico Sazonal',
            value: monthNames[maxMonth]
        });
        
        patterns.push({
            icon: '📉',
            title: 'Menor Gasto',
            value: monthNames[minMonth]
        });
        
        // Padrão de crescimento
        const growthRate = data.growthRate || 0;
        patterns.push({
            icon: growthRate > 0 ? '📈' : '📉',
            title: 'Tendência',
            value: `${growthRate > 0 ? '+' : ''}${growthRate.toFixed(1)}%/mês`
        });
        
        return patterns;
    }

    /**
     * Carrega suporte à decisão
     */
    async function loadDecisionSupport() {
        try {
            const data = await fetchDashboardData();
            await createScenarioChart(data);
            createDecisionMatrix(data);
        } catch (error) {
            console.error('Erro ao carregar suporte à decisão:', error);
        }
    }

    /**
     * Cria gráfico de cenários
     */
    async function createScenarioChart(data) {
        const canvas = document.getElementById('scenario-chart');
        if (!canvas || !data || !data.expenses) return;
        
        const ctx = canvas.getContext('2d');
        
        // Preparar dados dos cenários
        const currentAverage = data.monthlyAverage || 0;
        const optimistic = currentAverage * 0.85; // 15% de redução
        const realistic = currentAverage;
        const pessimistic = currentAverage * 1.2; // 20% de aumento
        
        // Atualizar valores nos elementos
        document.getElementById('optimistic-scenario').textContent = 
            `R$ ${optimistic.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        document.getElementById('realistic-scenario').textContent = 
            `R$ ${realistic.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        document.getElementById('pessimistic-scenario').textContent = 
            `R$ ${pessimistic.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        // Criar gráfico de projeção
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
        const optimisticData = months.map((_, i) => optimistic * (1 + (i * 0.02)));
        const realisticData = months.map((_, i) => realistic * (1 + (i * 0.03)));
        const pessimisticData = months.map((_, i) => pessimistic * (1 + (i * 0.05)));
        
        const config = {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Cenário Otimista',
                        data: optimisticData,
                        borderColor: 'rgb(34, 197, 94)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        borderWidth: 2
                    },
                    {
                        label: 'Cenário Realista',
                        data: realisticData,
                        borderColor: 'rgb(251, 191, 36)',
                        backgroundColor: 'rgba(251, 191, 36, 0.1)',
                        borderWidth: 2
                    },
                    {
                        label: 'Cenário Pessimista',
                        data: pessimisticData,
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2.5,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: 'Projeção de Gastos - Próximos 6 Meses'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toLocaleString('pt-BR', {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0
                                });
                            }
                        }
                    }
                }
            }
        };
        
        createChart('scenarioChart', 'scenario-chart', config);
    }

    /**
     * Cria matriz de decisão
     */
    function createDecisionMatrix(data) {
        const matrixContainer = document.getElementById('decision-matrix');
        if (!matrixContainer || !data || !data.expenses) return;
        
        // Analisar categorias de gastos
        const categories = {};
        data.expenses.forEach(exp => {
            const category = exp.descricao_conta || 'Outros';
            if (!categories[category]) {
                categories[category] = { total: 0, count: 0 };
            }
            categories[category].total += exp.valor;
            categories[category].count++;
        });
        
        // Criar matriz de prioridades
        const decisions = Object.entries(categories).map(([name, cat]) => {
            const average = cat.total / cat.count;
            const frequency = cat.count;
            const impact = cat.total;
            
            // Calcular prioridade (alta frequência + alto impacto = alta prioridade)
            let priority = 'low';
            if (frequency > 5 && impact > data.monthlyAverage * 0.2) {
                priority = 'high';
            } else if (frequency > 3 || impact > data.monthlyAverage * 0.1) {
                priority = 'medium';
            }
            
            return { name, average, frequency, impact, priority };
        }).sort((a, b) => b.impact - a.impact);
        
        const matrixHTML = `
            <table class="decision-matrix">
                <thead>
                    <tr>
                        <th>Categoria</th>
                        <th>Impacto Total</th>
                        <th>Frequência</th>
                        <th>Valor Médio</th>
                        <th>Prioridade</th>
                    </tr>
                </thead>
                <tbody>
                    ${decisions.map(decision => `
                        <tr class="priority-${decision.priority}">
                            <td class="text-left font-medium">${decision.name}</td>
                            <td>R$ ${decision.impact.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            <td>${decision.frequency}x</td>
                            <td>R$ ${decision.average.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            <td class="font-semibold">${decision.priority.toUpperCase()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        matrixContainer.innerHTML = matrixHTML;
    }

    /**
     * Carrega plano de ação
     */
    async function loadActionPlan() {
        try {
            const data = await fetchDashboardData();
            const priorityContainer = document.getElementById('priority-actions');
            const timelineContainer = document.getElementById('implementation-timeline');
            const metricsContainer = document.getElementById('tracking-metrics');
            
            // Gerar ações prioritárias
            const actions = generatePriorityActions(data);
            if (priorityContainer) {
                priorityContainer.innerHTML = actions.map((action, index) => `
                    <div class="action-item bg-white p-4 rounded-lg border-l-4 border-orange-500">
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <h6 class="font-semibold text-orange-800">${action.title}</h6>
                                <p class="text-sm text-orange-600 mt-1">${action.description}</p>
                                <div class="text-xs text-gray-500 mt-2">Prazo: ${action.deadline}</div>
                            </div>
                            <div class="flex items-center space-x-2">
                                <button class="text-sm bg-orange-100 text-orange-800 px-2 py-1 rounded hover:bg-orange-200" 
                                        onclick="markActionCompleted(${index})">
                                    ✓ Concluir
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
            
            // Timeline de implementação
            if (timelineContainer) {
                const timeline = generateImplementationTimeline(actions);
                timelineContainer.innerHTML = timeline.map(item => `
                    <div class="flex items-center space-x-4 p-3 bg-white rounded border">
                        <div class="w-4 h-4 bg-blue-500 rounded-full flex-shrink-0"></div>
                        <div class="flex-1">
                            <div class="font-medium text-gray-800">${item.title}</div>
                            <div class="text-sm text-gray-600">${item.period}</div>
                        </div>
                        <div class="text-xs text-blue-600 font-medium">${item.status}</div>
                    </div>
                `).join('');
            }
            
            // Métricas de acompanhamento
            if (metricsContainer) {
                const metrics = generateTrackingMetrics(data);
                metricsContainer.innerHTML = metrics.map(metric => `
                    <div class="metric-card p-4 rounded-lg text-center">
                        <div class="text-2xl mb-2">${metric.icon}</div>
                        <div class="text-lg font-bold text-blue-600">${metric.value}</div>
                        <div class="text-sm text-gray-600">${metric.label}</div>
                        <div class="progress-bar mt-2">
                            <div class="progress-fill" style="width: ${metric.progress}%"></div>
                        </div>
                    </div>
                `).join('');
            }
            
        } catch (error) {
            console.error('Erro ao carregar plano de ação:', error);
        }
    }

    /**
     * Gera ações prioritárias
     */
    function generatePriorityActions(data) {
        const actions = [];
        
        if (!data || !data.expenses) return actions;
        
        // Ação 1: Revisar categoria de maior gasto
        const categories = {};
        data.expenses.forEach(exp => {
            const category = exp.descricao_conta || 'Outros';
            categories[category] = (categories[category] || 0) + exp.valor;
        });
        
        const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
        if (topCategory) {
            actions.push({
                title: `Revisar gastos em ${topCategory[0]}`,
                description: `Analisar e otimizar a categoria de maior impacto financeiro`,
                deadline: '7 dias'
            });
        }
        
        // Ação 2: Implementar controle de gastos recorrentes
        const recurringCount = data.expenses.filter(exp => {
            const count = data.expenses.filter(e => e.descricao_conta === exp.descricao_conta).length;
            return count > 3;
        }).length;
        
        if (recurringCount > 0) {
            actions.push({
                title: 'Automatizar gastos recorrentes',
                description: `Configurar ${recurringCount} gastos recorrentes identificados`,
                deadline: '14 dias'
            });
        }
        
        // Ação 3: Criar orçamento mensal
        actions.push({
            title: 'Estabelecer orçamento mensal',
            description: 'Definir limites de gastos por categoria baseado no histórico',
            deadline: '21 dias'
        });
        
        // Ação 4: Revisar classificação empresarial
        const businessExpenses = data.expenses.filter(exp => exp.empresarial);
        if (businessExpenses.length > 0) {
            actions.push({
                title: 'Otimizar classificação empresarial',
                description: 'Revisar e ajustar classificação de gastos para benefícios fiscais',
                deadline: '30 dias'
            });
        }
        
        return actions;
    }

    /**
     * Gera timeline de implementação
     */
    function generateImplementationTimeline(actions) {
        return [
            { title: 'Análise inicial completa', period: 'Semana 1', status: 'Em andamento' },
            { title: 'Implementação de controles básicos', period: 'Semana 2-3', status: 'Planejado' },
            { title: 'Otimização de categorias', period: 'Semana 4', status: 'Planejado' },
            { title: 'Revisão e ajustes', period: 'Mês 2', status: 'Futuro' }
        ];
    }

    /**
     * Gera métricas de acompanhamento
     */
    function generateTrackingMetrics(data) {
        const currentMonth = new Date().getMonth();
        const currentExpenses = data.expenses?.filter(exp => {
            return new Date(exp.data).getMonth() === currentMonth;
        }) || [];
        
        const currentTotal = currentExpenses.reduce((sum, exp) => sum + exp.valor, 0);
        const target = data.monthlyAverage * 0.9; // Meta: 10% de redução
        const progress = Math.min((target / currentTotal) * 100, 100);
        
        return [
            {
                icon: '🎯',
                value: `${Math.round(progress)}%`,
                label: 'Meta do Mês',
                progress: progress
            },
            {
                icon: '📊',
                value: currentExpenses.length,
                label: 'Gastos Registrados',
                progress: 75
            },
            {
                icon: '💰',
                value: `R$ ${(data.monthlyAverage - currentTotal).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
                label: 'Economia Atual',
                progress: currentTotal < data.monthlyAverage ? 80 : 20
            },
            {
                icon: '📈',
                value: `${Math.abs(data.growthRate || 0).toFixed(1)}%`,
                label: 'Variação Mensal',
                progress: Math.max(100 - Math.abs(data.growthRate || 0) * 5, 0)
            }
        ];
    }

    /**
     * Marca ação como concluída
     */
    window.markActionCompleted = function(actionIndex) {
        const actionElements = document.querySelectorAll('.action-item');
        if (actionElements[actionIndex]) {
            actionElements[actionIndex].classList.add('action-completed');
            showNotification('✅ Ação marcada como concluída!', 'success', 2000);
        }
    };

    // Inicializar sistema de insights (será chamado no DOMContentLoaded principal)
    function initInsightSystemDelayed() {
        console.log('🕐 Agendando inicialização do sistema de insights...');
        setTimeout(initInsightSystem, 3000);  // Aumentado para 3 segundos
    }

    // ========== SISTEMA DE ALERTAS DE ORÇAMENTO POR PLANO DE CONTAS ==========
    
    function initializeBudgetFilters() {
        // Preencher anos (últimos 3 anos + próximos anos até 2027)
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        
        if (budgetYear) {
            budgetYear.innerHTML = '';
            for (let year = currentYear - 2; year <= currentYear + 3; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                if (year === currentYear) option.selected = true;
                budgetYear.appendChild(option);
            }
        }
        
        // Definir mês atual
        if (budgetMonth) {
            budgetMonth.value = currentMonth;
        }
    }
    
    async function checkChartBudgetAlerts() {
        if (!budgetYear || !budgetMonth) return;
        
        const year = budgetYear.value;
        const month = budgetMonth.value;
        
        try {
            showNotification('🔍 Verificando orçamento por plano de contas...', 'info');
            
            // Buscar dados do backend
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses-goals?year=${year}&month=${month}`);
            
            if (!response.ok) {
                throw new Error('Erro ao buscar dados de orçamento');
            }
            
            const budgetData = await response.json();
            
            // Atualizar interface
            updateBudgetSummary(budgetData);
            updateChartBudgetAlerts(budgetData);
            
            showNotification('✅ Verificação de orçamento concluída!', 'success');
            
        } catch (error) {
            console.error('Erro ao verificar orçamento:', error);
            showNotification('Erro ao verificar orçamento: ' + error.message, 'error');
        }
    }
    
    function updateBudgetSummary(budgetData) {
        if (!budgetSummary) return;
        
        // Usar dados agregados do backend (cada item contém PlanoContasID, Total, Teto, Percentual)
        const normalized = (budgetData || []).map(item => ({
            PlanoContasID: String(item.PlanoContasID),
            Total: parseFloat(item.Total) || 0,
            Teto: parseFloat(item.Teto) || 0,
            Percentual: parseFloat(item.Percentual) || 0
        }));

        const totalPlanos = normalized.length;
        const totalOrcamento = normalized.reduce((sum, it) => sum + it.Teto, 0);
        const totalGasto = normalized.reduce((sum, it) => sum + it.Total, 0);

        let planosAcimaTeto = 0;
        let planosProximoTeto = 0;
        let planosDentroTeto = 0;
        normalized.forEach(it => {
            const p = it.Percentual || (it.Teto > 0 ? (it.Total / it.Teto) * 100 : 0);
            if (p > 100) planosAcimaTeto++;
            else if (p >= 80) planosProximoTeto++;
            else planosDentroTeto++;
        });

        const planosComGastos = normalized.filter(it => it.Total > 0).length;
        const utilizacaoOrcamento = totalOrcamento > 0 ? ((totalGasto / totalOrcamento) * 100).toFixed(1) : 0;
        
        budgetSummary.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg border border-blue-200">
                <div class="text-center">
                    <div class="text-2xl font-bold text-blue-600">${totalPlanos}</div>
                    <div class="text-sm text-gray-600">Planos Cadastrados</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-600">${planosComGastos}</div>
                    <div class="text-sm text-gray-600">Com Gastos</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-purple-600">${formatCurrency(totalOrcamento)}</div>
                    <div class="text-sm text-gray-600">Orçamento Total</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold ${utilizacaoOrcamento > 100 ? 'text-red-600' : utilizacaoOrcamento > 80 ? 'text-yellow-600' : 'text-green-600'}">${utilizacaoOrcamento}%</div>
                    <div class="text-sm text-gray-600">Utilização</div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-red-600">${planosAcimaTeto}</div>
                    <div class="text-sm text-red-800">🚨 Acima do Teto</div>
                </div>
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-yellow-600">${planosProximoTeto}</div>
                    <div class="text-sm text-yellow-800">⚠️ Próximo do Limite</div>
                </div>
                <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-green-600">${planosDentroTeto}</div>
                    <div class="text-sm text-green-800">✅ Dentro do Limite</div>
                </div>
            </div>
        `;
    }
    
    function updateChartBudgetAlerts(budgetData) {
        if (!chartBudgetAlertsContainer) return;
        
        // Nomes descritivos dos planos de contas (opcional, manter mapeamento simples local)
        const planosNomes = {
            1: 'Alimentação Geral', 2: 'Veículos e Transporte', 3: 'Moradia e Habitação',
            4: 'Comunicações', 5: 'Saúde e Bem-estar', 6: 'Educação e Cultura',
            7: 'Vestuário', 8: 'Lazer e Entretenimento', 9: 'Serviços Diversos',
            10: 'Impostos e Taxas', 11: 'Seguros', 12: 'Investimentos',
            13: 'Empréstimos', 14: 'Cartão de Crédito', 15: 'Conta Corrente',
            16: 'Poupança', 17: 'Combustível', 18: 'Manutenção Veicular',
            19: 'Energia Elétrica', 20: 'Água e Saneamento', 21: 'Gás',
            22: 'Internet e TV', 23: 'Telefone Móvel', 24: 'Consultórios Médicos',
            25: 'Farmácia', 26: 'Academia e Esportes', 27: 'Cursos e Capacitação',
            28: 'Livros e Material', 29: 'Roupas e Calçados', 30: 'Acessórios',
            31: 'Cinema e Teatro', 32: 'Restaurantes', 33: 'Viagens',
            34: 'Limpeza Doméstica', 35: 'Jardinagem', 36: 'Reforma e Manutenção',
            37: 'IPTU', 38: 'IPVA', 39: 'Seguro Auto', 40: 'Seguro Residencial'
        };
        
        // Usar dados agregados do backend diretamente
        const normalized = (budgetData || []).map(item => ({
            PlanoContasID: String(item.PlanoContasID),
            Total: parseFloat(item.Total) || 0,
            Teto: parseFloat(item.Teto) || 0,
            Percentual: parseFloat(item.Percentual) || 0
        }));

        // Categorizar planos por status
        const categorizedPlans = {
            'Acima do Limite': [],
            'Próximo do Limite': [],
            'Dentro do Limite': [],
            'Sem Gastos': []
        };
        
        normalized.forEach(item => {
            const planId = item.PlanoContasID;
            const nome = planosNomes[planId] || `Plano ${planId}`;
            const percentage = item.Percentual || (item.Teto > 0 ? (item.Total / item.Teto) * 100 : 0);

            const planData = {
                id: planId,
                nome: nome,
                teto: item.Teto,
                gasto: item.Total,
                percentage: percentage,
                remaining: Math.max(0, item.Teto - item.Total)
            };

            if (item.Total === 0) {
                categorizedPlans['Sem Gastos'].push(planData);
            } else if (percentage > 100) {
                categorizedPlans['Acima do Limite'].push(planData);
            } else if (percentage >= 80) {
                categorizedPlans['Próximo do Limite'].push(planData);
            } else {
                categorizedPlans['Dentro do Limite'].push(planData);
            }
        });
        
        if (Object.values(categorizedPlans).every(arr => arr.length === 0)) {
            chartBudgetAlertsContainer.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-info-circle text-4xl mb-2"></i>
                    <p>Nenhum dado encontrado para o período selecionado</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        // Alertas críticos primeiro
        if (categorizedPlans['Acima do Limite'].length > 0) {
            html += `
                <div class="border-l-4 border-red-500 bg-red-50 p-4 rounded-lg mb-4">
                    <h4 class="font-bold text-red-800 mb-3 flex items-center gap-2">
                        <i class="fas fa-exclamation-triangle"></i>
                        🚨 PLANOS ACIMA DO ORÇAMENTO (${categorizedPlans['Acima do Limite'].length})
                    </h4>
                    <div class="space-y-3">
                        ${categorizedPlans['Acima do Limite'].map(plan => createDetailedBudgetCard(plan, 'danger')).join('')}
                    </div>
                </div>
            `;
        }
        
        // Alertas de atenção
        if (categorizedPlans['Próximo do Limite'].length > 0) {
            html += `
                <div class="border-l-4 border-yellow-500 bg-yellow-50 p-4 rounded-lg mb-4">
                    <h4 class="font-bold text-yellow-800 mb-3 flex items-center gap-2">
                        <i class="fas fa-exclamation-circle"></i>
                        ⚠️ PLANOS PRÓXIMOS DO LIMITE (${categorizedPlans['Próximo do Limite'].length})
                    </h4>
                    <div class="space-y-3">
                        ${categorizedPlans['Próximo do Limite'].map(plan => createDetailedBudgetCard(plan, 'warning')).join('')}
                    </div>
                </div>
            `;
        }
        
        // Planos dentro do orçamento
        if (categorizedPlans['Dentro do Limite'].length > 0) {
            html += `
                <div class="border-l-4 border-green-500 bg-green-50 p-4 rounded-lg mb-4">
                    <h4 class="font-bold text-green-800 mb-3 flex items-center gap-2">
                        <i class="fas fa-check-circle"></i>
                        ✅ PLANOS DENTRO DO ORÇAMENTO (${categorizedPlans['Dentro do Limite'].length})
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${categorizedPlans['Dentro do Limite'].map(plan => createDetailedBudgetCard(plan, 'success')).join('')}
                    </div>
                </div>
            `;
        }
        
        // Planos sem gastos (opcional, apenas se relevante)
        if (categorizedPlans['Sem Gastos'].length > 0 && categorizedPlans['Sem Gastos'].length <= 10) {
            html += `
                <div class="border-l-4 border-gray-400 bg-gray-50 p-4 rounded-lg">
                    <h4 class="font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <i class="fas fa-circle"></i>
                        💰 PLANOS SEM GASTOS (${categorizedPlans['Sem Gastos'].length})
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        ${categorizedPlans['Sem Gastos'].map(plan => `
                            <div class="bg-white p-2 rounded text-sm">
                                <div class="font-medium text-gray-700">${plan.nome}</div>
                                <div class="text-gray-500">Orçamento: ${formatCurrency(plan.teto)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        chartBudgetAlertsContainer.innerHTML = html;
    }
    
    function createDetailedBudgetCard(plan, type) {
        const typeConfig = {
            'danger': {
                bgColor: 'bg-red-100',
                textColor: 'text-red-800',
                progressColor: 'bg-red-500',
                icon: '🚨',
                borderColor: 'border-red-300'
            },
            'warning': {
                bgColor: 'bg-yellow-100',
                textColor: 'text-yellow-800',
                progressColor: 'bg-yellow-500',
                icon: '⚠️',
                borderColor: 'border-yellow-300'
            },
            'success': {
                bgColor: 'bg-green-100',
                textColor: 'text-green-800',
                progressColor: 'bg-green-500',
                icon: '✅',
                borderColor: 'border-green-300'
            }
        };
        
        const config = typeConfig[type];
        const progressWidth = Math.min(100, plan.percentage);
        const excesso = plan.gasto > plan.teto ? plan.gasto - plan.teto : 0;
        
        return `
            <div class="${config.bgColor} ${config.borderColor} border rounded-lg p-4">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                        <h5 class="font-bold ${config.textColor} text-lg">
                            ${config.icon} Plano ${plan.id} - ${plan.nome}
                        </h5>
                        <div class="grid grid-cols-2 gap-4 mt-2 text-sm">
                            <div>
                                <span class="text-gray-600">Orçamento:</span>
                                <span class="font-semibold ml-1">${formatCurrency(plan.teto)}</span>
                            </div>
                            <div>
                                <span class="text-gray-600">Gasto:</span>
                                <span class="font-semibold ml-1 ${plan.gasto > plan.teto ? 'text-red-600' : 'text-gray-800'}">${formatCurrency(plan.gasto)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold ${config.textColor}">
                            ${plan.percentage.toFixed(1)}%
                        </div>
                    </div>
                </div>
                
                <!-- Barra de progresso -->
                <div class="mb-3">
                    <div class="flex justify-between text-xs mb-1">
                        <span class="text-gray-600">Utilização do Orçamento</span>
                        <span class="${config.textColor} font-semibold">${progressWidth.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-3">
                        <div class="${config.progressColor} h-3 rounded-full transition-all duration-300" 
                             style="width: ${Math.min(100, progressWidth)}%"></div>
                    </div>
                </div>
                
                <!-- Informações adicionais -->
                <div class="text-sm space-y-1">
                    ${plan.gasto > plan.teto ? 
                        `<div class="text-red-600 font-semibold">
                            💸 Excesso: ${formatCurrency(excesso)}
                        </div>` : 
                        `<div class="text-green-600">
                            💰 Disponível: ${formatCurrency(plan.remaining)}
                        </div>`
                    }
                    
                    ${plan.percentage > 100 ? 
                        `<div class="text-red-600 text-xs">
                            ⚠️ Este plano ultrapassou o orçamento em ${(plan.percentage - 100).toFixed(1)}%
                        </div>` : 
                        plan.percentage >= 80 ?
                        `<div class="text-yellow-600 text-xs">
                            ⚠️ Atenção: próximo do limite orçamentário
                        </div>` :
                        `<div class="text-green-600 text-xs">
                            ✅ Gastos controlados dentro do orçamento
                        </div>`
                    }
                </div>
            </div>
        `;
    }
    
    // ========== SISTEMA DE ANÁLISE DE PLANO DE CONTAS ==========
    
    async function analyzeChartUsage() {
        // Garantir defaults para não bloquear geração de "💡 Insights"
        const period = (chartAnalysisPeriod && chartAnalysisPeriod.value) ? chartAnalysisPeriod.value : 'current-month';
        const analysisType = (chartAnalysisType && chartAnalysisType.value) ? chartAnalysisType.value : 'usage-frequency';
        
        try {
            showNotification('🔍 Analisando plano de contas...', 'info');
            
            // Buscar dados baseado no período
            const { startDate, endDate } = getPeriodDates(period);
            const expenses = await fetchExpensesForAnalysis(startDate, endDate);
            
            // Processar dados baseado no tipo de análise
            const analysisData = processChartAnalysis(expenses, analysisType);
            
            // Atualizar visualizações
            updateChartAnalysisVisualization(analysisData, analysisType);
            updateChartAnalysisInsights(analysisData, analysisType);
            updateChartDetailsTable(analysisData);
            
            showNotification('✅ Análise concluída com sucesso!', 'success');
            
        } catch (error) {
            console.error('Erro na análise do plano de contas:', error);
            showNotification('Erro ao analisar plano de contas: ' + error.message, 'error');
        }
    }
    
    function getPeriodDates(period) {
        const now = new Date();
        let startDate, endDate;

        // Preferir ano/mês selecionados nos filtros globais quando fizer sentido
        const selectedYear = (typeof filterYear !== 'undefined' && filterYear && filterYear.value) ? parseInt(filterYear.value) : null;
        const selectedMonth = (typeof filterMonth !== 'undefined' && filterMonth && filterMonth.value) ? parseInt(filterMonth.value) : null;

        switch (period) {
            case 'current-month': {
                const baseYear = selectedYear ?? now.getFullYear();
                const baseMonthIdx = (selectedMonth ? selectedMonth - 1 : now.getMonth());
                startDate = new Date(baseYear, baseMonthIdx, 1);
                endDate = new Date(baseYear, baseMonthIdx + 1, 0);
                break;
            }
            case 'last-month': {
                // Se usuário escolheu um mês nos filtros, usar o mês anterior ao selecionado
                let y = selectedYear ?? now.getFullYear();
                let mIdx = (selectedMonth ? selectedMonth - 1 : now.getMonth()) - 1; // mês anterior (0-11)
                if (mIdx < 0) { mIdx = 11; y -= 1; }
                startDate = new Date(y, mIdx, 1);
                endDate = new Date(y, mIdx + 1, 0);
                break;
            }
            case 'last-3-months':
                startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'last-6-months':
                startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'current-year':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }
        
        return {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        };
    }
    
    async function fetchExpensesForAnalysis(startDate, endDate) {
        const token = getToken();
        if (!token) throw new Error('Token não encontrado');
        
        const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses?start_date=${startDate}&end_date=${endDate}&include_recurring=true`);
        
        if (!response.ok) {
            throw new Error('Erro ao buscar dados para análise');
        }
        
        return await response.json();
    }
    
    function processChartAnalysis(expenses, analysisType) {
        const categoriesMap = new Map();
        
        // Normalizar dados
        const normalizedExpenses = expenses.map(normalizeExpenseData);
        
        // Agrupar por categoria (PlanoContasDescricao ou PlanoContasID)
        normalizedExpenses.forEach(expense => {
            // Priorizar a coluna 'category' vinda do backend quando disponível
            const rawCategory = expense.category || expense.accountPlanDescription || expense.accountPlanCode || 'Sem Categoria';
            const categoryKey = (rawCategory === null || rawCategory === undefined) ? 'Sem Categoria' : String(rawCategory);

            if (!categoriesMap.has(categoryKey)) {
                categoriesMap.set(categoryKey, {
                    name: categoryKey,
                    frequency: 0,
                    totalAmount: 0,
                    expenses: []
                });
            }

            const categoryData = categoriesMap.get(categoryKey);
            categoryData.frequency++;
            categoryData.totalAmount += expense.amount;
            categoryData.expenses.push(expense);
        });
        
        // Converter para array e calcular métricas
        const categories = Array.from(categoriesMap.values()).map(category => ({
            ...category,
            averageAmount: category.totalAmount / category.frequency,
            percentage: 0 // Será calculado abaixo
        }));
        
        // Calcular percentuais
        const totalAmount = categories.reduce((sum, cat) => sum + cat.totalAmount, 0);
        categories.forEach(category => {
            category.percentage = totalAmount > 0 ? (category.totalAmount / totalAmount) * 100 : 0;
        });
        
        // Ordenar baseado no tipo de análise
        switch (analysisType) {
            case 'usage-frequency':
                categories.sort((a, b) => b.frequency - a.frequency);
                break;
            case 'amount-distribution':
                categories.sort((a, b) => b.totalAmount - a.totalAmount);
                break;
            case 'trend-analysis':
                categories.sort((a, b) => b.percentage - a.percentage);
                break;
            case 'efficiency-analysis':
                categories.sort((a, b) => b.averageAmount - a.averageAmount);
                break;
        }
        
        return {
            categories,
            totalExpenses: expenses.length,
            totalAmount,
            uniqueCategories: categories.length,
            analysisType
        };
    }
    
    function updateChartAnalysisVisualization(data, analysisType) {
        if (!chartUsageChart) return;
        
        // Destruir gráfico anterior se existir
        if (chartAnalysisChart) {
            chartAnalysisChart.destroy();
        }

        // Fallback quando não há categorias
        if (!data || !Array.isArray(data.categories) || data.categories.length === 0) {
            if (chartUsageInsights) {
                chartUsageInsights.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-info-circle text-2xl mb-2"></i>
                        <p>Sem dados para o período selecionado.</p>
                    </div>
                `;
            }
            return;
        }
        
        const ctx = chartUsageChart.getContext('2d');
        const topCategories = data.categories.slice(0, 10); // Top 10
        
        let chartData, chartConfig;
        
        switch (analysisType) {
            case 'usage-frequency':
                chartData = {
                    labels: topCategories.map(cat => cat.name),
                    datasets: [{
                        label: 'Frequência de Uso',
                        data: topCategories.map(cat => cat.frequency),
                        backgroundColor: [
                            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
                            '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6b7280'
                        ]
                    }]
                };
                chartConfig = {
                    type: 'bar',
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Frequência de Uso por Categoria'
                            }
                        }
                    }
                };
                break;
                
            case 'amount-distribution':
                chartData = {
                    labels: topCategories.map(cat => cat.name),
                    datasets: [{
                        data: topCategories.map(cat => cat.totalAmount),
                        backgroundColor: [
                            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
                            '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6b7280'
                        ]
                    }]
                };
                chartConfig = {
                    type: 'doughnut',
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Distribuição de Valores por Categoria'
                            },
                            legend: {
                                position: 'bottom'
                            }
                        }
                    }
                };
                break;
                
            case 'trend-analysis':
                chartData = {
                    labels: topCategories.map(cat => cat.name),
                    datasets: [{
                        label: 'Percentual do Total (%)',
                        data: topCategories.map(cat => cat.percentage),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.1,
                        fill: true
                    }]
                };
                chartConfig = {
                    type: 'line',
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Análise de Tendências por Categoria'
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        return value.toFixed(1) + '%';
                                    }
                                }
                            }
                        }
                    }
                };
                break;
                
            case 'efficiency-analysis':
                chartData = {
                    labels: topCategories.map(cat => cat.name),
                    datasets: [{
                        label: 'Valor Médio por Uso',
                        data: topCategories.map(cat => cat.averageAmount),
                        backgroundColor: '#10b981',
                        borderColor: '#059669',
                        borderWidth: 1
                    }]
                };
                chartConfig = {
                    type: 'bar',
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Eficiência de Categorização (Valor Médio)'
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        return formatCurrency(value);
                                    }
                                }
                            }
                        }
                    }
                };
                break;
        }
        
        chartAnalysisChart = new Chart(ctx, {
            ...chartConfig,
            data: chartData
        });
    }
    
    function updateChartAnalysisInsights(data, analysisType) {
        if (!chartUsageInsights) return;
        
        const insights = generateChartInsights(data, analysisType);
        
        chartUsageInsights.innerHTML = `
            <div class="space-y-3">
                ${insights.map(insight => `
                    <div class="p-3 rounded-lg border-l-4 ${insight.color} bg-gray-50">
                        <div class="flex items-start gap-2">
                            <span class="text-lg">${insight.icon}</span>
                            <div>
                                <h5 class="font-semibold text-gray-800">${insight.title}</h5>
                                <p class="text-gray-600 text-sm mt-1">${insight.description}</p>
                                ${insight.recommendation ? `<p class="text-blue-600 text-sm mt-2"><strong>💡 Recomendação:</strong> ${insight.recommendation}</p>` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    function generateChartInsights(data, analysisType) {
        const insights = [];
        if (!data || !Array.isArray(data.categories) || data.categories.length === 0) {
            return [{
                icon: 'ℹ️',
                title: 'Sem dados',
                description: 'Não há transações no período selecionado para gerar insights.',
                color: 'border-gray-400',
                recommendation: null
            }];
        }

        const topCategory = data.categories[0];
        const bottomCategory = data.categories[data.categories.length - 1];
        
        // Insight básico sobre categorias
        insights.push({
            icon: '📊',
            title: 'Resumo Geral',
            description: `Foram analisadas ${data.uniqueCategories} categorias com ${data.totalExpenses} transações totais no valor de ${formatCurrency(data.totalAmount)}.`,
            color: 'border-blue-500',
            recommendation: null
        });
        
        // Insights específicos por tipo de análise
        switch (analysisType) {
            case 'usage-frequency':
                insights.push({
                    icon: '🔥',
                    title: 'Categoria Mais Utilizada',
                    description: `"${topCategory.name}" é sua categoria mais frequente com ${topCategory.frequency} usos (${topCategory.percentage.toFixed(1)}% do total).`,
                    color: 'border-green-500',
                    recommendation: 'Considere subcategorizar esta categoria para melhor controle.'
                });
                break;
                
            case 'amount-distribution':
                insights.push({
                    icon: '💰',
                    title: 'Maior Concentração de Gastos',
                    description: `"${topCategory.name}" concentra ${topCategory.percentage.toFixed(1)}% dos seus gastos (${formatCurrency(topCategory.totalAmount)}).`,
                    color: 'border-yellow-500',
                    recommendation: topCategory.percentage > 40 ? 'Alta concentração pode indicar necessidade de revisão orçamentária.' : null
                });
                break;
                
            case 'trend-analysis':
                const trendingUp = data.categories.filter(cat => cat.percentage > 10).length;
                insights.push({
                    icon: '📈',
                    title: 'Tendências Identificadas',
                    description: `${trendingUp} categorias representam mais de 10% cada uma dos seus gastos.`,
                    color: 'border-purple-500',
                    recommendation: trendingUp > 5 ? 'Muitas categorias principais podem dificultar o controle financeiro.' : null
                });
                break;
                
            case 'efficiency-analysis':
                insights.push({
                    icon: '⚡',
                    title: 'Eficiência de Categorização',
                    description: `"${topCategory.name}" tem o maior valor médio por uso: ${formatCurrency(topCategory.averageAmount)}.`,
                    color: 'border-orange-500',
                    recommendation: 'Categorias com valores muito altos podem precisar de subdivisão.'
                });
                break;
        }
        
        // Insight sobre categorização (garantir nome string)
        if (data.categories.some(cat => typeof cat.name === 'string' && cat.name.includes('Sem Categoria'))) {
            insights.push({
                icon: '⚠️',
                title: 'Problema de Categorização',
                description: 'Existem transações sem categoria definida.',
                color: 'border-red-500',
                recommendation: 'Defina categorias para todas as transações para melhor análise.'
            });
        }
        
        return insights;
    }
    
    function updateChartDetailsTable(data) {
        if (!chartDetailsTbody) return;
        
        chartDetailsTbody.innerHTML = '';

        if (!data || !Array.isArray(data.categories) || data.categories.length === 0) {
            chartDetailsTbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-8 text-gray-500">
                        <i class="fas fa-info-circle text-2xl mb-2"></i>
                        <p>Nenhum dado encontrado para o período selecionado.</p>
                    </td>
                </tr>`;
            return;
        }

        data.categories.forEach((category, index) => {
            const row = document.createElement('tr');
            row.className = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            
            const statusIcon = category.frequency > 10 ? '🔥' : category.frequency > 5 ? '📊' : '📉';
            const statusText = category.frequency > 10 ? 'Alta' : category.frequency > 5 ? 'Média' : 'Baixa';
            
            row.innerHTML = `
                <td class="px-3 py-2 font-medium">${category.name}</td>
                <td class="px-3 py-2 text-center">${category.frequency}</td>
                <td class="px-3 py-2 text-center font-semibold">${formatCurrency(category.totalAmount)}</td>
                <td class="px-3 py-2 text-center">${formatCurrency(category.averageAmount)}</td>
                <td class="px-3 py-2 text-center">${category.percentage.toFixed(1)}%</td>
                <td class="px-3 py-2 text-center">
                    <span class="flex items-center justify-center gap-1">
                        ${statusIcon} ${statusText}
                    </span>
                </td>
            `;
            
            chartDetailsTbody.appendChild(row);
        });
    }

    // ========== FIM SISTEMA DE INSIGHTS ==========

    // ========== ANÁLISE POR PERÍODO DA FATURA ==========
    
    // Função utilitária para normalizar dados do backend
    function normalizeExpenseData(item) {
        return {
            id: item.id,
            date: item.transaction_date || item.Data || item.date,
            amount: parseFloat(item.amount) || parseFloat(item.Valor) || 0,
            description: item.description || item.Descricao || '',
            account: item.account || item.ContaNome || '',
            type: item.expense_type || item.Tipo || '',
            category: item.category || item.Categoria || '',
            accountPlanCode: item.account_plan_code || item.PlanoContasID || '',
            accountPlanDescription: item.account_plan_description || item.PlanoContasDescricao || ''
        };
    }
    
    function openPeriodAnalysisModal() {
        if (periodAnalysisModal) {
            // Preencher opções de contas
            populatePeriodAccounts();
            
            // Definir datas padrão
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            
            const startDateInput = document.getElementById('period-start-date');
            const endDateInput = document.getElementById('period-end-date');
            
            if (startDateInput) startDateInput.value = startOfMonth.toISOString().split('T')[0];
            if (endDateInput) endDateInput.value = endOfMonth.toISOString().split('T')[0];
            
            periodAnalysisModal.classList.remove('hidden');
            setTimeout(() => periodAnalysisModal.classList.remove('opacity-0'), 10);
            adjustModalForMobile(periodAnalysisModal);
        }
    }
    
    function closePeriodAnalysisModal() {
        if (periodAnalysisModal) {
            periodAnalysisModal.classList.add('opacity-0');
            setTimeout(() => periodAnalysisModal.classList.add('hidden'), 300);
        }
    }
    
    function populatePeriodAccounts() {
        const accountSelect = document.getElementById('period-account');
        const filterAccountSelect = document.getElementById('filter-account');
        
        if (accountSelect && filterAccountSelect) {
            accountSelect.innerHTML = '<option value="">Todas as Contas</option>';
            
            // Copiar opções do filtro principal, garantindo conta unificada
            const seen = new Set();
            for (let i = 1; i < filterAccountSelect.options.length; i++) {
                const option = filterAccountSelect.options[i];
                if (!option.value || option.value === 'PIX' || option.value === 'Boleto') continue;
                if (!seen.has(option.value)) {
                    const newOption = document.createElement('option');
                    newOption.value = option.value;
                    newOption.textContent = option.textContent;
                    accountSelect.appendChild(newOption);
                    seen.add(option.value);
                }
            }
            if (!seen.has('PIX/Boleto')) {
                const opt = document.createElement('option');
                opt.value = 'PIX/Boleto';
                opt.textContent = 'PIX/Boleto';
                accountSelect.appendChild(opt);
            }
        }
    }
    
    async function handlePeriodAnalysis(e) {
        e.preventDefault();
        
        const startDate = document.getElementById('period-start-date')?.value;
        const endDate = document.getElementById('period-end-date')?.value;
        const account = document.getElementById('period-account')?.value || '';
        const type = document.getElementById('period-type')?.value || '';
        
        if (!startDate || !endDate) {
            showNotification('Por favor, selecione as datas de início e fim.', 'error');
            return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            showNotification('A data de início deve ser anterior à data de fim.', 'error');
            return;
        }
        
        try {
            // Buscar dados do período
            const periodData = await fetchPeriodData(startDate, endDate, account, type);
            
            // Atualizar interface
            updatePeriodSummary(periodData);
            updatePeriodCharts(periodData);
            updatePeriodDetails(periodData);
            updatePeriodComparison(periodData, startDate, endDate);
            
            // Habilitar botão de exportação
            if (periodExportPdfBtn) {
                periodExportPdfBtn.disabled = false;
            }
            
            showNotification('✅ Análise por período gerada com sucesso!', 'success');
            
        } catch (error) {
            console.error('Erro ao gerar análise por período:', error);
            showNotification('Erro ao gerar análise: ' + error.message, 'error');
        }
    }
    
    async function fetchPeriodData(startDate, endDate, account, type) {
        const token = getToken();
        if (!token) throw new Error('Token não encontrado');
        
        let url = `${API_BASE_URL}/api/expenses?start_date=${startDate}&end_date=${endDate}&include_recurring=true`;
        if (account) url += `&account=${account}`;
        
        const response = await authenticatedFetch(url);
        
        if (!response.ok) {
            throw new Error('Erro ao buscar dados do período');
        }
        
        const data = await response.json();
        
        // Filtrar por tipo se especificado
        if (type) {
            return data.filter(item => item.Tipo === type);
        }
        
        return data;
    }
    
    function updatePeriodSummary(data) {
        const summaryCards = document.getElementById('period-summary-cards');
        const summaryText = document.getElementById('period-summary-text');
        
        if (!summaryCards || !data) return;
        
        // Normalizar dados
        const normalizedData = data.map(normalizeExpenseData);
        
        const total = normalizedData.reduce((sum, item) => sum + item.amount, 0);
        const totalPersonal = normalizedData.filter(item => item.type === 'personal').reduce((sum, item) => sum + item.amount, 0);
        const totalBusiness = normalizedData.filter(item => item.type === 'business').reduce((sum, item) => sum + item.amount, 0);
        const transactionCount = normalizedData.length;
        
        const avgDaily = total / Math.max(1, getDaysBetweenDates(normalizedData[0]?.date, normalizedData[normalizedData.length - 1]?.date));
        
        summaryCards.innerHTML = `
            <div class="stats-card bg-blue-50 p-3 sm:p-4 rounded-lg text-center">
                <h4 class="text-sm sm:text-base font-semibold text-blue-800">💰 Total Gasto</h4>
                <p class="value text-lg sm:text-xl md:text-2xl font-bold text-blue-600">${formatCurrency(total)}</p>
            </div>
            <div class="stats-card bg-green-50 p-3 sm:p-4 rounded-lg text-center">
                <h4 class="text-sm sm:text-base font-semibold text-green-800">🏠 Pessoal</h4>
                <p class="value text-lg sm:text-xl md:text-2xl font-bold text-green-600">${formatCurrency(totalPersonal)}</p>
            </div>
            <div class="stats-card bg-purple-50 p-3 sm:p-4 rounded-lg text-center">
                <h4 class="text-sm sm:text-base font-semibold text-purple-800">💼 Empresarial</h4>
                <p class="value text-lg sm:text-xl md:text-2xl font-bold text-purple-600">${formatCurrency(totalBusiness)}</p>
            </div>
            <div class="stats-card bg-gray-50 p-3 sm:p-4 rounded-lg text-center">
                <h4 class="text-sm sm:text-base font-semibold text-gray-800">📊 Transações</h4>
                <p class="value text-lg sm:text-xl md:text-2xl font-bold text-gray-600">${transactionCount}</p>
            </div>
        `;
        
        if (summaryText) {
            summaryText.innerHTML = `
                <div class="text-sm sm:text-base">
                    <p class="mb-2"><strong>📈 Média Diária:</strong> ${formatCurrency(avgDaily)}</p>
                    <p class="mb-2"><strong>🏦 Contas Utilizadas:</strong> ${[...new Set(normalizedData.map(item => item.account))].length}</p>
                    <p><strong>📅 Período:</strong> ${normalizedData.length > 0 ? formatDate(normalizedData[0].date) + ' até ' + formatDate(normalizedData[normalizedData.length - 1].date) : 'N/A'}</p>
                </div>
            `;
        }
    }
    
    function updatePeriodCharts(data) {
        if (!data || data.length === 0) return;
        
        // Gráfico de evolução diária
        createPeriodDailyChart(data);
        
        // Gráfico de distribuição por conta
        createPeriodAccountsChart(data);
        
        // Gráfico de categorias
        createPeriodCategoriesChart(data);
    }
    
    function createPeriodDailyChart(data) {
        const ctx = document.getElementById('period-daily-chart');
        if (!ctx) return;
        
        // Destruir gráfico anterior se existir
        if (periodCharts.daily) {
            periodCharts.daily.destroy();
        }
        
        // Normalizar dados
        const normalizedData = data.map(normalizeExpenseData);
        
        // Agrupar por data
        const dailyData = {};
        normalizedData.forEach(item => {
            if (item.date) {
                const date = item.date.includes('T') ? item.date.split('T')[0] : item.date;
                dailyData[date] = (dailyData[date] || 0) + item.amount;
            }
        });
        
        const labels = Object.keys(dailyData).sort();
        const values = labels.map(date => dailyData[date]);
        
        periodCharts.daily = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(date => formatDate(date)),
                datasets: [{
                    label: 'Gastos Diários',
                    data: values,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }
    
    function createPeriodAccountsChart(data) {
        const ctx = document.getElementById('period-accounts-chart');
        if (!ctx) return;
        
        // Destruir gráfico anterior se existir
        if (periodCharts.accounts) {
            periodCharts.accounts.destroy();
        }
        
        // Normalizar dados
        const normalizedData = data.map(normalizeExpenseData);
        
        // Agrupar por conta
        const accountData = {};
        normalizedData.forEach(item => {
            const account = item.account || 'Sem Conta';
            accountData[account] = (accountData[account] || 0) + item.amount;
        });
        
        const accounts = Object.keys(accountData);
        const values = Object.values(accountData);
        
        // Usar cores personalizadas para cada tipo de conta
        const backgroundColors = accounts.map(account => getPaymentTypeColor(account, 0.8));
        const borderColors = accounts.map(account => getPaymentTypeColor(account, 1));
        
        // Adicionar ícones aos labels
        const enhancedLabels = accounts.map(account => {
            const icon = getPaymentTypeIcon(account);
            return `${icon} ${account}`;
        });
        
        periodCharts.accounts = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: enhancedLabels,
                datasets: [{
                    data: values,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 3,
                    // Efeitos especiais para PIX e Boleto
                    hoverBackgroundColor: accounts.map(account => {
                        if (account === 'PIX') return 'rgba(46, 204, 113, 1)';
                        if (account === 'Boleto') return 'rgba(231, 76, 60, 1)';
                        return getPaymentTypeColor(account, 1);
                    }),
                    hoverBorderWidth: 4,
                    hoverOffset: 15 // Destaque especial no hover
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
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
                            generateLabels: function(chart) {
                                const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                return labels.map((label, index) => {
                                    const account = accounts[index];
                                    // Destacar PIX e Boleto na legenda
                                    if (account === 'PIX' || account === 'Boleto') {
                                        label.fontStyle = 'bold';
                                        label.strokeStyle = label.fillStyle;
                                        label.lineWidth = 2;
                                    }
                                    return label;
                                });
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                const account = accounts[context[0].dataIndex];
                                const icon = getPaymentTypeIcon(account);
                                return `${icon} ${account}`;
                            },
                            label: function(context) {
                                const value = context.parsed;
                                const total = values.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `Valor: ${formatCurrency(value)} (${percentage}%)`;
                            },
                            afterLabel: function(context) {
                                const account = accounts[context.dataIndex];
                                if (account === 'PIX') return '⚡ Pagamento instantâneo';
                                if (account === 'Boleto') return '📋 Pagamento tradicional';
                                return '';
                            }
                        }
                    }
                }
            }
        });
    }
    
    function createPeriodCategoriesChart(data) {
        const ctx = document.getElementById('period-categories-chart');
        if (!ctx) return;
        
        // Destruir gráfico anterior se existir
        if (periodCharts.categories) {
            periodCharts.categories.destroy();
        }
        
        // Normalizar dados
        const normalizedData = data.map(normalizeExpenseData);
        
        // Agrupar por plano de conta
        const categoryData = {};
        normalizedData.forEach(item => {
            const category = item.accountPlanDescription || item.accountPlanCode || 'Outros';
            categoryData[category] = (categoryData[category] || 0) + item.amount;
        });
        
        // Ordenar por valor
        const sortedEntries = Object.entries(categoryData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10); // Top 10
        
        const labels = sortedEntries.map(([label]) => label);
        const values = sortedEntries.map(([,value]) => value);
        
        periodCharts.categories = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Valor Total',
                    data: values,
                    backgroundColor: '#10b981',
                    borderColor: '#059669',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45
                        }
                    }
                }
            }
        });
    }
    
    function updatePeriodDetails(data) {
        const tbody = document.getElementById('period-details-tbody');
        if (!tbody || !data) return;
        
        tbody.innerHTML = '';
        
        // Normalizar dados
        const normalizedData = data.map(normalizeExpenseData);
        
        normalizedData.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            
            row.innerHTML = `
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">${formatDate(item.date)}</td>
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">${item.description || 'N/A'}</td>
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">${item.account || 'N/A'}</td>
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold">${formatCurrency(item.amount)}</td>
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    <span class="px-2 py-1 rounded-full text-xs ${item.type === 'business' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}">
                        ${item.type === 'business' ? '💼 Empresarial' : '🏠 Pessoal'}
                    </span>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    function updatePeriodComparison(data, startDate, endDate) {
        const comparisonData = document.getElementById('period-comparison-data');
        const trendsData = document.getElementById('period-trends-data');
        
        if (!comparisonData || !trendsData) return;
        
        // Normalizar dados
        const normalizedData = data.map(normalizeExpenseData);
        
        // Análise básica
        const total = normalizedData.reduce((sum, item) => sum + item.amount, 0);
        const avgDaily = total / getDaysBetweenDates(startDate, endDate);
        
        comparisonData.innerHTML = `
            <div class="text-sm sm:text-base space-y-2">
                <p>📊 <strong>Total do Período:</strong> ${formatCurrency(total)}</p>
                <p>📈 <strong>Média Diária:</strong> ${formatCurrency(avgDaily)}</p>
                <p>📅 <strong>Dias Analisados:</strong> ${getDaysBetweenDates(startDate, endDate)} dias</p>
            </div>
        `;
        
        trendsData.innerHTML = `
            <div class="text-sm sm:text-base space-y-2">
                <p>📈 <strong>Tendência:</strong> ${avgDaily > 100 ? 'Alto volume de gastos' : 'Volume controlado'}</p>
                <p>🎯 <strong>Recomendação:</strong> ${getRecommendation(avgDaily)}</p>
            </div>
        `;
    }
    
    function switchPeriodTab(tabName) {
        // Atualizar botões
        periodTabBtns.forEach(btn => {
            btn.classList.remove('active', 'text-blue-600', 'border-blue-600');
            btn.classList.add('text-gray-500');
        });
        
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active', 'text-blue-600', 'border-blue-600');
            activeBtn.classList.remove('text-gray-500');
        }
        
        // Atualizar conteúdo
        document.querySelectorAll('.period-tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        const activeContent = document.getElementById(`period-${tabName}-content`);
        if (activeContent) {
            activeContent.classList.remove('hidden');
        }
    }
    
    async function exportPeriodAnalysisPdf() {
        const startDate = document.getElementById('period-start-date')?.value;
        const endDate = document.getElementById('period-end-date')?.value;
        const account = document.getElementById('period-account')?.value || '';
        const type = document.getElementById('period-type')?.value || '';
        
        if (!startDate || !endDate) {
            showNotification('Por favor, gere uma análise antes de exportar.', 'error');
            return;
        }
        
        try {
            let url = `${API_BASE_URL}/api/expenses/period-report?start=${startDate}&end=${endDate}`;
            if (account) url += `&account=${account}`;
            if (type) url += `&type=${type}`;
            
            const response = await authenticatedFetch(url);
            
            if (!response.ok) {
                throw new Error('Erro ao gerar relatório PDF');
            }
            
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `analise-periodo-${startDate}-${endDate}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
            
            showNotification('✅ Relatório PDF baixado com sucesso!', 'success');
            
        } catch (error) {
            console.error('Erro ao exportar PDF:', error);
            showNotification('Erro ao exportar PDF: ' + error.message, 'error');
        }
    }
    
    // Funções utilitárias
    function getDaysBetweenDates(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2 - d1);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    
    function getRecommendation(avgDaily) {
        if (avgDaily > 200) {
            return 'Considere revisar gastos desnecessários';
        } else if (avgDaily > 100) {
            return 'Gastos dentro da média, mantenha o controle';
        } else {
            return 'Excelente controle de gastos!';
        }
    }
    
    // ========== NOVO SISTEMA PIX/BOLETO INTEGRADO ==========
    
    // Configurar eventos do formulário PIX/Boleto
    function setupPixBoletoExpenseForm() {
        const addButton = document.getElementById('add-pix-boleto-expense');
        const formSection = document.getElementById('pix-boleto-form-section');
        const closeButton = document.getElementById('close-pix-boleto-form');
        const cancelButton = document.getElementById('cancel-pix-boleto-form');
        const form = document.getElementById('pix-boleto-expense-form');
        const hasInstallmentsCheckbox = document.getElementById('pix-boleto-has-installments');
        const installmentSection = document.getElementById('pix-boleto-installment-section');
        const isBusinessCheckbox = document.getElementById('pix-boleto-is-business');
        const planCodeSelect = document.getElementById('pix-boleto-plan-code');
        
        // Definir data padrão como hoje
        const dateInput = document.getElementById('pix-boleto-date');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
        
        // Abrir formulário
        if (addButton) {
            addButton.addEventListener('click', () => {
                formSection.classList.remove('hidden');
                loadAccountPlansForPixBoleto();
            });
        }
        
        // Fechar formulário
        [closeButton, cancelButton].forEach(button => {
            if (button) {
                button.addEventListener('click', () => {
                    formSection.classList.add('hidden');
                    form.reset();
                    dateInput.value = new Date().toISOString().split('T')[0];
                    installmentSection.classList.add('hidden');
                });
            }
        });
        
        // Toggle parcelamento
        if (hasInstallmentsCheckbox) {
            hasInstallmentsCheckbox.addEventListener('change', () => {
                if (hasInstallmentsCheckbox.checked) {
                    installmentSection.classList.remove('hidden');
                } else {
                    installmentSection.classList.add('hidden');
                }
            });
        }
        
        // Lógica de gasto empresarial automático
        if (planCodeSelect && isBusinessCheckbox) {
            planCodeSelect.addEventListener('change', () => {
                if (!planCodeSelect.value) {
                    // Se não tem plano de conta, marcar como empresarial automaticamente
                    isBusinessCheckbox.checked = true;
                    isBusinessCheckbox.disabled = true;
                } else {
                    // Se tem plano de conta, permitir escolha
                    isBusinessCheckbox.disabled = false;
                    isBusinessCheckbox.checked = false;
                }
            });
            
            // Aplicar regra inicial
            if (!planCodeSelect.value) {
                isBusinessCheckbox.checked = true;
                isBusinessCheckbox.disabled = true;
            }
        }
        
        // Enviar formulário
        if (form) {
            form.addEventListener('submit', handlePixBoletoExpenseSubmit);
        }
    }
    
    // Carregar planos de conta para PIX/Boleto
    async function loadAccountPlansForPixBoleto() {
        try {
            const planSelect = document.getElementById('pix-boleto-plan-code');
            if (!planSelect) return;
            
            const response = await authenticatedFetch(`${API_BASE_URL}/api/account-plans`);
            if (!response.ok) {
                throw new Error('Erro ao buscar planos de conta');
            }
            
            const plans = await response.json();
            
            // Limpar opções existentes (manter primeira opção)
            planSelect.innerHTML = '<option value="">Sem classificação (empresarial)</option>';
            
            // Adicionar planos
            plans.forEach(plan => {
                const option = document.createElement('option');
                option.value = plan.PlanoContasID;
                option.textContent = `${plan.PlanoContasID} - ${plan.NomePlanoConta}`;
                planSelect.appendChild(option);
            });
            
        } catch (error) {
            console.error('❌ Erro ao carregar planos de conta:', error);
            showNotification('Erro ao carregar planos de conta', 'error');
        }
    }
    
    // Tratar envio do formulário PIX/Boleto
    async function handlePixBoletoExpenseSubmit(event) {
        event.preventDefault();
        
        try {
            const form = event.target;
            const formData = new FormData(form);
            
            // Coletar dados do formulário
            const account = document.getElementById('pix-boleto-account').value;
            const date = document.getElementById('pix-boleto-date').value;
            const amount = parseFloat(document.getElementById('pix-boleto-amount').value);
            const description = document.getElementById('pix-boleto-description').value;
            const planCode = document.getElementById('pix-boleto-plan-code').value;
            const isBusiness = document.getElementById('pix-boleto-is-business').checked;
            const hasInstallments = document.getElementById('pix-boleto-has-installments').checked;
            
            // Validações básicas
            if (!account || !date || !amount || !description) {
                showNotification('Preencha todos os campos obrigatórios', 'error');
                return;
            }
            
            if (amount <= 0) {
                showNotification('O valor deve ser maior que zero', 'error');
                return;
            }
            
            // Aplicar regra automática: se não tem plano, é empresarial
            const finalIsBusiness = !planCode || isBusiness;
            
            // Preparar dados da despesa
            const expenseData = {
                transaction_date: date,
                amount: amount,
                description: description,
                account: account,
                is_business_expense: finalIsBusiness,
                account_plan_code: planCode || null
            };
            
            // Se é parcelado, adicionar dados de parcelamento
            if (hasInstallments) {
                const totalAmount = parseFloat(document.getElementById('pix-boleto-total-amount').value);
                const currentInstallment = parseInt(document.getElementById('pix-boleto-current-installment').value);
                const totalInstallments = parseInt(document.getElementById('pix-boleto-total-installments').value);
                
                if (totalAmount && currentInstallment && totalInstallments) {
                    expenseData.total_purchase_amount = totalAmount;
                    expenseData.installment_number = currentInstallment;
                    expenseData.total_installments = totalInstallments;
                }
            }
            
            console.log('📤 Enviando dados PIX/Boleto:', expenseData);
            
            // Enviar para o servidor
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(expenseData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao salvar gasto');
            }
            
            const result = await response.json();
            console.log('✅ Gasto PIX/Boleto salvo:', result);
            
            // Mostrar sucesso
            showNotification(`Gasto ${account} salvo com sucesso!`, 'success');
            
            // Fechar formulário e limpar
            document.getElementById('pix-boleto-form-section').classList.add('hidden');
            form.reset();
            document.getElementById('pix-boleto-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('pix-boleto-installment-section').classList.add('hidden');
            
            // Recarregar dados da aba PIX/Boleto
            await refreshPixBoletoData();
            
        } catch (error) {
            console.error('❌ Erro ao salvar gasto PIX/Boleto:', error);
            showNotification(error.message || 'Erro ao salvar gasto', 'error');
        }
    }
    
    // Função para implementar classificação automática de gastos empresariais
    async function applyBusinessExpenseAutoClassification() {
        try {
            console.log('🔄 Aplicando classificação automática de gastos empresariais...');
            
            // Buscar todos os gastos sem plano de conta
            const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses/auto-classify-business`);
            
            if (!response.ok) {
                throw new Error('Erro ao aplicar classificação automática');
            }
            
            const result = await response.json();
            console.log('✅ Classificação automática aplicada:', result);
            
            showNotification(`${result.updated} gastos foram classificados automaticamente como empresariais`, 'success');
            
            // Recarregar dados se estamos na aba PIX/Boleto
            const activeTab = document.querySelector('.tab-button.active')?.getAttribute('data-tab');
            if (activeTab === 'pix-boleto') {
                await refreshPixBoletoData();
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Erro na classificação automática:', error);
            showNotification('Erro ao aplicar classificação automática', 'error');
            throw error;
        }
    }
    
    // Integrar ao sistema existente
    function integratePixBoletoSystem() {
        // Configurar formulário
        setupPixBoletoExpenseForm();
        
        // Aplicar classificação automática no carregamento (se necessário)
        // Comentado para não executar automaticamente sempre
        // applyBusinessExpenseAutoClassification();
    }
    
    // ========== FIM NOVO SISTEMA PIX/BOLETO ==========
    
    // ========== FIM ANÁLISE POR PERÍODO DA FATURA ==========
    
    // ========== TRATAMENTO GLOBAL DE ERROS ==========
    
    // Capturar erros não tratados
    window.addEventListener('error', function(e) {
        console.error('Erro JavaScript não tratado:', e.error);
        showNotification('Erro inesperado no sistema. Recarregue a página.', 'error');
    });

    // Capturar promessas rejeitadas não tratadas
    window.addEventListener('unhandledrejection', function(e) {
        console.error('Promise rejeitada não tratada:', e.reason);
        if (e.reason?.message?.includes('Autenticação falhou')) {
            // Já tratado pela função authenticatedFetch
            return;
        }
        showNotification('Erro de comunicação com o servidor.', 'error');
    });

    // ========== INICIALIZAÇÃO SEGURA ==========
    
    function safeInit() {
        try {
            console.log('🚀 Iniciando dashboard...');
            init();
        } catch (error) {
            console.error('❌ Erro crítico na inicialização:', error);
            showNotification('Erro ao carregar o dashboard. Recarregue a página.', 'error');
            
            // Mostrar login como fallback
            setTimeout(() => {
                showLogin();
            }, 2000);
        }
    }

    // Chamar inicialização segura
    safeInit();

}); // Fim do DOMContentLoaded
// === Extensão: Projeção avançada (valor, regressão, export) ===
// Evita conflito: se já definimos versão básica, vamos sobrescrever aqui.
(function(){
    if(typeof renderPlanProjectionChart==='function' && !window.__advancedPlanProjection){
        window.__advancedPlanProjection = true;
        function linearRegression(values){ const n=values.length; if(!n) return {a:0,b:0}; const sumX=(n-1)*n/2; const sumY=values.reduce((s,v)=>s+v,0); const sumXY=values.reduce((s,v,i)=>s+i*v,0); const sumX2=(n-1)*n*(2*n-1)/6; const denom=(n*sumX2 - sumX*sumX)||1; const a=(n*sumXY - sumX*sumY)/denom; const b=(sumY - a*sumX)/n; return {a,b}; }
        async function fetchAggregatedPlanHistory(planId, monthsWindow){ try { const now=new Date(); const endYear=now.getFullYear(); const endMonth=now.getMonth()+1; const start=new Date(now.getFullYear(), now.getMonth()-(monthsWindow-1),1); const startYear=start.getFullYear(); const startMonth=start.getMonth()+1; const params=new URLSearchParams({startYear,startMonth,endYear,endMonth,plan:planId,aggregate:'true'}); const resp= await authenticatedFetch(`${API_BASE_URL}/api/expenses/history?${params.toString()}`); if(resp.ok) return resp.json(); } catch(e){ console.warn('Histórico agregado indisponível', e.message);} return null; }
        function computeValueProjection(data){ if(!data||!data.months) return null; const months=data.months; if(!months.length) return null; const last3=months.slice(-3); const avg= last3.length? last3.reduce((s,m)=>s+m.total,0)/last3.length:0; const {a,b}=linearRegression(months.map(m=>m.total)); const lastKey=months[months.length-1].month; let [y,m]=lastKey.split('-').map(Number); const projections=[]; const base=months.length; for(let i=1;i<=3;i++){ m++; if(m>12){m=1;y++;} const idx=base-1+i; const v=a*idx+b; projections.push({month:`${y}-${String(m).padStart(2,'0')}`, projected:Math.max(0,v)});} return {planId:data.plan||'', history: months.map(m=>({month:m.month,value:m.total})), projections, average:avg, regression:{a,b}}; }
        const oldCountFn = computePlanCountProjection; // já existe
        window.renderPlanProjectionChart = function(planId, mode='count', override=null){
            const canvas=document.getElementById('plan-projection-chart'); 
            const emptyEl=document.getElementById('plan-projection-empty'); 
            const summaryEl=document.getElementById('plan-projection-summary');
            if(!canvas) return;
            const parsed=String(planId||'').trim(); 
            if(!parsed){ 
                if(emptyEl){emptyEl.classList.remove('hidden'); emptyEl.textContent='Informe um plano.';} 
                if(summaryEl){ summaryEl.classList.add('hidden'); summaryEl.textContent=''; }
                destroyChart('planProjectionChart'); 
                return; 
            }
            if(!isChartJsLoaded()){ 
                if(emptyEl){emptyEl.classList.remove('hidden'); emptyEl.textContent='Biblioteca de gráficos não carregada.';} 
                if(summaryEl){ summaryEl.classList.add('hidden'); summaryEl.textContent=''; }
                return; 
            }
            let result = mode==='value'? override : oldCountFn(parsed);
            if(!result || !result.history || !result.history.length){ 
                if(emptyEl){emptyEl.classList.remove('hidden'); emptyEl.textContent='Sem dados históricos suficientes.';} 
                if(summaryEl){ summaryEl.classList.add('hidden'); summaryEl.textContent=''; }
                destroyChart('planProjectionChart'); 
                return; 
            }
            if(emptyEl) emptyEl.classList.add('hidden');
            const labels=[...result.history.map(h=>h.month), ...result.projections.map(p=>p.month)];
            const historyVals= mode==='value'? result.history.map(h=>h.value) : result.history.map(h=>h.count);
            const projVals = result.projections.map(p=>p.projected);
            const dataCombined=[...historyVals, ...projVals]; 
            const historyLen=historyVals.length;
            // Totais
            const totalHistorico = historyVals.reduce((s,v)=>s+(Number(v)||0),0);
            const totalProjetado = projVals.reduce((s,v)=>s+(Number(v)||0),0);
            // Subtítulo: apenas totais
            const subtitleText = mode==='count'
                ? `Histórico: ${totalHistorico} • Proj(3m): ${totalProjetado.toFixed(0)} • Total: ${(totalHistorico+totalProjetado).toFixed(0)}`
                : `Histórico: ${formatCurrency(totalHistorico)} • Proj(3m): ${formatCurrency(totalProjetado)} • Total: ${formatCurrency(totalHistorico+totalProjetado)}`;
            // Popular resumo
            if(summaryEl){
                summaryEl.classList.remove('hidden');
                if(mode==='count'){
                    summaryEl.innerHTML = `<strong>Resumo:</strong> Histórico: <span class="font-semibold">${totalHistorico}</span> • Proj(3m): <span class="font-semibold">${totalProjetado.toFixed(0)}</span> • Total: <span class=\"font-semibold\">${(totalHistorico+totalProjetado).toFixed(0)}</span>`;
                } else {
                    summaryEl.innerHTML = `<strong>Resumo:</strong> Histórico: <span class="font-semibold">${formatCurrency(totalHistorico)}</span> • Proj(3m): <span class="font-semibold">${formatCurrency(totalProjetado)}</span> • Total: <span class="font-semibold">${formatCurrency(totalHistorico+totalProjetado)}</span>`;
                }
            }
            destroyChart('planProjectionChart');
            chartRegistry.planProjectionChart = new Chart(canvas.getContext('2d'), {
                type:'bar',
                data:{ labels, datasets:[
                    { label: mode==='value'?'Valores (Hist + Proj)':'Lançamentos (Hist + Proj)', data:dataCombined, backgroundColor:labels.map((_,i)=> i<historyLen?'rgba(59,130,246,0.7)':'rgba(16,185,129,0.4)'), borderColor:labels.map((_,i)=> i<historyLen?'rgba(59,130,246,1)':'rgba(16,185,129,0.9)'), borderWidth:2, borderRadius:6, showValues:true, valueColor:CHART_CONFIG.valueColor, valueFont:'bold 10px Arial' },
                    ...(mode==='value' && result.regression ? [{ type:'line', label:'Tendência (Regressão)', data:labels.map((_,i)=> result.regression.a*i + result.regression.b), borderColor:'#f59e0b', borderDash:[6,4], tension:0, pointRadius:0, yAxisID:'y' }] : [])
                ]},
                options: mergeChartOptions({ plugins:{ title:{display:true, text: mode==='value'?`🔮 Projeção de Valores - Plano ${result.planId}`:`🔮 Projeção de Lançamentos - Plano ${result.planId}`}, subtitle:{display:true, text:subtitleText, font:{size:11}}, legend:{position:'bottom'}, tooltip:{ callbacks:{ label: function(ctx){ const raw=ctx.raw; if(mode==='value'){ return `${ctx.dataset.label}: ${formatCurrency(raw)}`; } return `${ctx.dataset.label}: ${raw}`; } } } }, scales:{ x:{stacked:false}, y:{beginAtZero:true, title:{display:true, text: mode==='value'?'Valor (R$)':'Qtd. Lançamentos'}, ticks:{ callback:function(value){ return mode==='value'? formatCurrency(value): value; } } } } })
            });
        };
        async function generatePlanProjection(){
            const planId=document.getElementById('plan-projection-input')?.value.trim();
            const mode=document.getElementById('plan-projection-mode')?.value || 'count';
            const monthsWindow=parseInt(document.getElementById('plan-projection-months')?.value||'6');
            if(!planId){ renderPlanProjectionChart(null, mode); return; }
            if(mode==='value'){
                const agg = await fetchAggregatedPlanHistory(planId, monthsWindow);
                if(agg){ const proj=computeValueProjection(agg); if(proj){ proj.planId = planId; renderPlanProjectionChart(planId,'value',proj); return;} }
                renderPlanProjectionChart(planId,'value');
            } else {
                // Reusa função original de quantidade via cache existente
                const historyExpenses = await (async ()=>{ const now=new Date(); const endYear=now.getFullYear(); const endMonth=now.getMonth()+1; const start=new Date(now.getFullYear(), now.getMonth()-(monthsWindow-1),1); const startYear=start.getFullYear(); const startMonth=start.getMonth()+1; const params=new URLSearchParams({startYear,startMonth,endYear,endMonth,plan:planId}); try{ const resp= await authenticatedFetch(`${API_BASE_URL}/api/expenses/history?${params.toString()}`); if(resp.ok){ const json= await resp.json(); return Array.isArray(json)? json : (json.expenses||[]);} } catch(e){ } return allExpensesCache.filter(e=> String(e.account_plan_code||'')=== String(planId)); })();
                if(historyExpenses.length){ const original = allExpensesCache; try { const merged=[...original.filter(e=> String(e.account_plan_code||'')!==String(planId)), ...historyExpenses]; allExpensesCache=merged; renderPlanProjectionChart(planId,'count'); } finally { allExpensesCache=original; } } else { renderPlanProjectionChart(planId,'count'); }
            }
        }
        // Eventos de exportação
        const btnGen=document.getElementById('load-plan-projection-btn'); if(btnGen) btnGen.addEventListener('click', e=>{e.preventDefault(); generatePlanProjection();});
        const btnRef=document.getElementById('refresh-plan-projection-btn'); if(btnRef) btnRef.addEventListener('click', e=>{e.preventDefault(); generatePlanProjection();});
        const inp=document.getElementById('plan-projection-input'); if(inp) inp.addEventListener('keyup', e=>{ if(e.key==='Enter') generatePlanProjection(); });
        const btnPNG=document.getElementById('export-plan-projection-png'); if(btnPNG) btnPNG.addEventListener('click', e=>{ e.preventDefault(); const canvas=document.getElementById('plan-projection-chart'); if(!canvas) return; const a=document.createElement('a'); a.download='projecao-plano.png'; a.href=canvas.toDataURL('image/png',1.0); a.click(); });
        const btnPDF=document.getElementById('export-plan-projection-pdf'); if(btnPDF) btnPDF.addEventListener('click', e=>{ e.preventDefault(); const canvas=document.getElementById('plan-projection-chart'); if(!canvas) return; const {jsPDF}=window.jspdf||{}; if(!jsPDF){ showNotification('jsPDF não carregado','error'); return;} const pdf=new jsPDF('landscape','pt','a4'); const img=canvas.toDataURL('image/png',1.0); const w=pdf.internal.pageSize.getWidth(); const h=pdf.internal.pageSize.getHeight(); const imgW=w-40; const imgH=canvas.height*(imgW/canvas.width); pdf.text('Projeção de Plano',40,30); pdf.addImage(img,'PNG',20,40,imgW,Math.min(imgH,h-80)); pdf.save('projecao-plano.pdf'); });
    }
})();
