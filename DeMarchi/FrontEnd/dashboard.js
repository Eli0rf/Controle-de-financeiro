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
    
    // Charts para análise por período
    let periodCharts = {
        daily: null,
        accounts: null,
        categories: null
    };

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
        
        // Gráficos de IR
        irChart1: null,
        irChart2: null
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
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://controle-de-financeiro-production.up.railway.app',
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
            credentials: 'include'
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
                credentials: 'include'
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
        
        // Event listeners para navegação das abas principais
        const mainTabBtns = document.querySelectorAll('.tab-button[data-tab]');
        mainTabBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                switchMainTab(this.dataset.tab);
            });
        });
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
    }

    function populateFilterOptions() {
        if (!filterYear || !filterMonth) return;
        filterYear.innerHTML = '';
        filterMonth.innerHTML = '';
        const currentYear = new Date().getFullYear();
        for (let i = currentYear; i >= currentYear - 5; i--) filterYear.add(new Option(i, i));
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

            // Definir tetos de cada plano (baseado no código anterior)
            const tetos = {
                1: 1000.00, 2: 2782.47, 3: 2431.67, 4: 350.00, 5: 2100.00,
                6: 550.00, 7: 270.00, 8: 1200.00, 9: 1200.00, 10: 270.00,
                11: 1895.40, 12: 2627.60, 13: 400.00, 14: 540.00, 15: 1080.00,
                16: 1360.00, 17: 756.00, 18: 1512.00, 19: 1890.00, 20: 1620.00,
                21: 1890.00, 22: 2430.00, 23: 2700.00, 24: 1080.00, 25: 2100.00,
                26: 2460.00, 27: 2500.00, 28: 3060.00, 29: 3600.00, 30: 3060.00,
                31: 3840.00, 32: 4320.00, 33: 4800.00, 34: 4800.00, 35: 5400.00,
                36: 5760.00, 37: 6720.00, 38: 7200.00, 39: 8400.00, 40: 9600.00
            };

            // Calcular totais por plano a partir dos dados de despesas
            const planTotals = {};
            data.forEach(expense => {
                const planId = expense.account_plan_code || expense.plan_conta;
                if (planId) {
                    planTotals[planId] = (planTotals[planId] || 0) + parseFloat(expense.amount || 0);
                }
            });

            console.log('💰 Totais calculados por plano:', planTotals);

            // Criar dados do gráfico apenas para planos que têm gastos ou tetos
            const chartData = [];
            Object.keys({...tetos, ...planTotals}).forEach(planId => {
                const total = planTotals[planId] || 0;
                const teto = tetos[planId] || 0;
                
                if (total > 0 || teto > 0) {
                    chartData.push({
                        PlanoContasID: planId,
                        Total: total,
                        Teto: teto
                    });
                }
            });

            if (chartData.length === 0) {
                console.log('❌ Nenhum plano com gastos ou limites para exibir');
                return false;
            }

            // Ordenar por PlanoContasID para melhor visualização
            const sortedData = chartData.sort((a, b) => parseInt(a.PlanoContasID) - parseInt(b.PlanoContasID));
            const filteredData = sortedData; // Para usar no subtitle

            console.log('📊 Dados do gráfico:', sortedData);

            const labels = sortedData.map(d => `Plano ${d.PlanoContasID}`);
            const limitData = sortedData.map(d => parseFloat(d.Teto) || 0);
            const currentData = sortedData.map(d => parseFloat(d.Total) || 0);

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
                            backgroundColor: sortedData.map(item => {
                                const current = parseFloat(item.Total) || 0;
                                const limit = parseFloat(item.Teto) || 0;
                                const percentage = limit > 0 ? (current / limit) * 100 : 0;
                                
                                if (percentage > 100) return 'rgba(239, 68, 68, 0.8)'; // Vermelho - Ultrapassou
                                if (percentage >= 90) return 'rgba(251, 146, 60, 0.8)'; // Laranja - Quase no limite
                                if (percentage >= 70) return 'rgba(250, 204, 21, 0.8)'; // Amarelo - Atenção
                                return 'rgba(34, 197, 94, 0.8)'; // Verde - Seguro
                            }),
                            borderColor: sortedData.map(item => {
                                const current = parseFloat(item.Total) || 0;
                                const limit = parseFloat(item.Teto) || 0;
                                const percentage = limit > 0 ? (current / limit) * 100 : 0;
                                
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
                                    const current = parseFloat(item.Total) || 0;
                                    const limit = parseFloat(item.Teto) || 0;
                                    const percentage = limit > 0 ? ((current / limit) * 100).toFixed(1) : '0.0';
                                    
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
                                        const current = parseFloat(item.Total) || 0;
                                        const limit = parseFloat(item.Teto) || 0;
                                        const remaining = Math.max(0, limit - current);
                                        const percentage = limit > 0 ? ((current / limit) * 100).toFixed(1) : '0.0';
                                        
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
                                    const current = parseFloat(item.Total) || 0;
                                    const limit = parseFloat(item.Teto) || 0;
                                    const percentage = limit > 0 ? ((current / limit) * 100).toFixed(0) : '0';
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

            // Definir tetos de cada plano (baseado no código anterior)
            const tetos = {
                1: 1000.00, 2: 2782.47, 3: 2431.67, 4: 350.00, 5: 2100.00,
                6: 550.00, 7: 270.00, 8: 1200.00, 9: 1200.00, 10: 270.00,
                11: 1895.40, 12: 2627.60, 13: 400.00, 14: 540.00, 15: 1080.00,
                16: 1360.00, 17: 756.00, 18: 1512.00, 19: 1890.00, 20: 1620.00,
                21: 1890.00, 22: 2430.00, 23: 2700.00, 24: 1080.00, 25: 2100.00,
                26: 2460.00, 27: 2500.00, 28: 3060.00, 29: 3600.00, 30: 3060.00,
                31: 3840.00, 32: 4320.00, 33: 4800.00, 34: 4800.00, 35: 5400.00,
                36: 5760.00, 37: 6720.00, 38: 7200.00, 39: 8400.00, 40: 9600.00
            };

            // Calcular totais por plano a partir dos dados de despesas
            const planTotals = {};
            data.forEach(expense => {
                const planId = expense.account_plan_code || expense.plan_conta;
                if (planId) {
                    planTotals[planId] = (planTotals[planId] || 0) + parseFloat(expense.amount || 0);
                }
            });

            // Criar dados apenas para planos que têm gastos ou tetos
            const chartData = [];
            Object.keys({...tetos, ...planTotals}).forEach(planId => {
                const total = planTotals[planId] || 0;
                const teto = tetos[planId] || 0;
                
                if (total > 0 || teto > 0) {
                    chartData.push({
                        PlanoContasID: planId,
                        Total: total,
                        Teto: teto
                    });
                }
            });

            if (chartData.length === 0) {
                console.log('❌ Nenhum plano com dados para exibir');
                return false;
            }

            // Ordenar por PlanoContasID
            const sortedData = chartData.sort((a, b) => parseInt(a.PlanoContasID) - parseInt(b.PlanoContasID));
            const filteredData = sortedData; // Para usar no subtitle

            const labels = sortedData.map(d => `Plano ${d.PlanoContasID}`);
            const limitData = sortedData.map(d => parseFloat(d.Teto) || 0);
            const currentData = sortedData.map(d => parseFloat(d.Total) || 0);

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
                                const current = parseFloat(item.Total) || 0;
                                const limit = parseFloat(item.Teto) || 0;
                                const percentage = limit > 0 ? (current / limit) * 100 : 0;
                                
                                if (percentage > 100) return 'rgba(239, 68, 68, 0.8)'; // Vermelho - Ultrapassou
                                if (percentage >= 90) return 'rgba(251, 146, 60, 0.8)'; // Laranja - Quase no limite
                                if (percentage >= 70) return 'rgba(250, 204, 21, 0.8)'; // Amarelo - Atenção
                                return 'rgba(59, 130, 246, 0.8)'; // Azul - Normal
                            }),
                            borderColor: sortedData.map(item => {
                                const current = parseFloat(item.Total) || 0;
                                const limit = parseFloat(item.Teto) || 0;
                                const percentage = limit > 0 ? (current / limit) * 100 : 0;
                                
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
                                    const current = parseFloat(item.Total) || 0;
                                    const limit = parseFloat(item.Teto) || 0;
                                    const percentage = limit > 0 ? ((current / limit) * 100).toFixed(1) : '0.0';
                                    
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
                                        const current = parseFloat(item.Total) || 0;
                                        const limit = parseFloat(item.Teto) || 0;
                                        
                                        if (current > limit) {
                                            const excess = current - limit;
                                            return `⚠️ Excesso: R$ ${excess.toFixed(2)}`;
                                        } else {
                                            const remaining = limit - current;
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
                                    const current = parseFloat(item.Total) || 0;
                                    const limit = parseFloat(item.Teto) || 0;
                                    const percentage = limit > 0 ? ((current / limit) * 100).toFixed(0) : '0';
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
                loadBusinessAnalysisData();
            } else if (tabName === 'reports') {
                loadReportsData();
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
            allExpensesCache = expenses; // Salva para filtros
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
            if (search) {
                match = (
                    data.includes(search) ||
                    descricao.includes(search) ||
                    valor.includes(search) ||
                    conta.includes(search) ||
                    tipo.includes(search) ||
                    plano.includes(search) ||
                    nota.includes(search)
                );
            }
            if (type && tipo !== type) match = false;
            if (min !== null && parseFloat(e.amount) < min) match = false;
            if (max !== null && parseFloat(e.amount) > max) match = false;
            if (plan && !plano.includes(plan)) match = false;
            // Corrige filtro para ser igual ao banco
            if (filterAccountValue && e.account !== filterAccountValue) match = false;
            return match;
        });
        renderExpensesTable(filtered);
    }
    if (filterSearchInput) filterSearchInput.addEventListener('input', applyAllFilters);
    if (filterType) filterType.addEventListener('change', applyAllFilters);
    if (filterMin) filterMin.addEventListener('input', applyAllFilters);
    if (filterMax) filterMax.addEventListener('input', applyAllFilters);
    if (filterPlan) filterPlan.addEventListener('input', applyAllFilters);

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
                    </button>` : 'N/A';
                // Corrigido: mostra plano de conta corretamente, inclusive string vazia ou null
                let planCode = '-';
                if (expense.account_plan_code !== null && expense.account_plan_code !== undefined && expense.account_plan_code !== '') {
                    planCode = expense.account_plan_code;
                }
                const row = document.createElement('tr');
                row.className = 'border-b hover:bg-gray-50';
                row.innerHTML = `
                    <td class="p-3">${new Date(expense.transaction_date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</td>
                    <td class="p-3">${expense.description}</td>
                    <td class="p-3 text-red-600">R$ ${parseFloat(expense.amount).toFixed(2)}</td>
                    <td class="p-3">${expense.account}</td>
                    <td class="p-3">${expense.is_business_expense ? 'Empresa' : 'Pessoal'}</td>
                    <td class="p-3">${planCode}</td>
                    <td class="p-3 text-center">${invoiceLink}</td>
                    <td class="p-3">
                        <button class="text-blue-600 mr-2 edit-btn" data-id="${expense.id}"><i class="fas fa-edit"></i></button>
                        <button class="text-red-600 delete-btn" data-id="${expense.id}"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                expensesTableBody.appendChild(row);
            });
        } else {
            expensesTableBody.innerHTML = `<tr><td colspan="8" class="text-center p-4">Nenhuma despesa encontrada.</td></tr>`;
        }
        if (totalSpentEl) totalSpentEl.textContent = `R$ ${totalSpent.toFixed(2)}`;
        if (totalTransactionsEl) totalTransactionsEl.textContent = expenses.length;
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

            const chartData = {
                labels: data.map(d => d.account || 'Conta não especificada'),
                datasets: [{
                    data: data.map(d => parseFloat(d.total) || 0),
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(236, 72, 153, 0.8)',
                        'rgba(14, 165, 233, 0.8)',
                        'rgba(168, 85, 247, 0.8)',
                        'rgba(34, 211, 238, 0.8)',
                        'rgba(251, 146, 60, 0.8)'
                    ],
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    hoverBorderWidth: 3,
                    hoverOffset: 10
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
            
            const max = Math.max(...filteredData.map(d => 
                (parseFloat(d.personal_total) || 0) + (parseFloat(d.business_total) || 0)
            ));
            const maxAccount = filteredData.find(d => 
                (parseFloat(d.personal_total) || 0) + (parseFloat(d.business_total) || 0) === max
            )?.account || '-';

            chartRegistry.mixedTypeChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: accounts,
                    datasets: [
                        {
                            label: '🏠 Gastos Pessoais',
                            data: personalData,
                            backgroundColor: 'rgba(59, 130, 246, 0.8)',
                            borderColor: 'rgba(59, 130, 246, 1)',
                            borderWidth: 1
                        },
                        {
                            label: '💼 Gastos Empresariais',
                            data: businessData,
                            backgroundColor: 'rgba(239, 68, 68, 0.8)',
                            borderColor: 'rgba(239, 68, 68, 1)',
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

    function renderPlanChart(data = []) {
        if (!isChartJsLoaded()) {
            showNoDataMessage('plan-chart', 'Biblioteca de gráficos não carregada');
            return;
        }
        
        const canvas = document.getElementById('plan-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        destroyChart('planChart');
        if (!data.length) {
            showNoDataMessage('plan-chart', 'Sem dados para este período.');
            return;
        }
        
        try {
            const max = Math.max(...data.map(d => d.total));
            planChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => `Plano ${d.account_plan_code}`),
                datasets: [{
                    label: 'Total Gasto (R$)',
                    data: data.map(d => d.total),
                    backgroundColor: data.map(d => d.total === max ? '#22c55e' : 'rgba(239, 68, 68, 0.7)')
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Gastos por Plano de Conta',
                        color: getThemeColor('#222', '#fff'),
                        font: { size: 18 }
                    },
                    subtitle: {
                        display: true,
                        text: `Plano com maior gasto: ${data.find(d => d.total === max)?.account_plan_code || '-'}`,
                        color: getThemeColor('#666', '#ccc'),
                        font: { size: 13 }
                    },
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `R$ ${ctx.parsed.x.toFixed(2)}`
                        }
                    },
                    datalabels: {
                        color: getThemeColor('#222', '#fff'),
                        anchor: 'end', align: 'right', font: { weight: 'bold' },
                        formatter: v => {
                            const val = getNumberValue(v);
                            return val > 0 ? `R$ ${val.toFixed(2)}` : '';
                        }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
        } catch (error) {
            console.error('Erro ao criar gráfico de planos:', error);
            showNoDataMessage('plan-chart', 'Erro ao carregar gráfico');
        }
    }

    async function handleAddExpense(e) {
        e.preventDefault();
        
        try {
            if (!checkAuthentication()) return;

            const formData = new FormData(addExpenseForm);
            formData.set('is_business_expense', businessCheckbox.checked);
            
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
        if (e.target.closest('.edit-btn')) alert('Funcionalidade de edição não implementada.');
        if (e.target.closest('.delete-btn')) { if (confirm('Tem a certeza?')) deleteExpense(e.target.closest('.delete-btn').dataset.id); }
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
        
        // Botão do menu dropdown móvel
        if (mobileDropdownBtn && mobileDropdownMenu) {
            mobileDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                mobileDropdownMenu.classList.toggle('hidden');
            });
            
            // Fechar menu ao clicar fora
            document.addEventListener('click', (e) => {
                if (!mobileDropdownMenu.contains(e.target) && !mobileDropdownBtn.contains(e.target)) {
                    mobileDropdownMenu.classList.add('hidden');
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
                    }
                });
            }
        });
        
        // Ajustar layout em redimensionamento
        window.addEventListener('resize', adjustLayoutForScreenSize);
        adjustLayoutForScreenSize(); // Executar na inicialização
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
            if (!response.ok) throw new Error('Falha ao gerar o relatório.');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `relatorio-mensal-${year}-${month}${account ? '-' + account : ''}.pdf`;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
            closeReportModal();
        } catch (error) {
            showNotification(`Erro: ${error.message}`, 'error');
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
            
            // Adicionar anos (atual e próximos 2 anos, e 3 anos anteriores)
            for (let year = currentYear - 3; year <= currentYear + 2; year++) {
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
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar contas.');
            }
            
            const accounts = await response.json();

            select.innerHTML = '<option value="">Todas as Contas</option>';
            accounts.forEach(account => {
                if (account) {
                    const option = document.createElement('option');
                    option.value = account;
                    option.textContent = account;
                    select.appendChild(option);
                }
            });
        } catch (error) {
            console.error('Erro ao carregar contas:', error);
            showNotification('Erro ao carregar contas.', 'error');
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
            
            const accounts = await response.json();
            irAccount.innerHTML = '<option value="">Todas</option>';
            accounts.forEach(account => {
                if (account) {
                    const option = document.createElement('option');
                    option.value = account;
                    option.textContent = account;
                    irAccount.appendChild(option);
                }
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
                    'expensesPieChart': 'expenses-pie-chart'
                };
                
                const canvasId = canvasIdMap[chartKey];
                if (canvasId) {
                    const existingChart = Chart.getChart(canvasId);
                    if (existingChart) {
                        console.log(`🧹 Destruindo gráfico existente: ${canvasId}`);
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

            // Verificar dimensões do container antes de criar o gráfico
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                const parent = canvas.parentElement;
                if (parent && (parent.clientWidth === 0 || parent.clientHeight === 0)) {
                    console.warn(`⚠️ Container do gráfico ${chartKey} tem dimensões zero`);
                    // Dar um tempo para o DOM se estabilizar
                    setTimeout(() => {
                        if (parent.clientWidth > 0) {
                            createChart(chartKey, canvasId, config);
                        }
                    }, 100);
                    return null;
                }
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
            const response = await authenticatedFetch(`${API_BASE_URL}/api/recurring-expenses`);

            if (!response.ok) throw new Error('Erro ao carregar gastos recorrentes');

            const recurringExpenses = await response.json();
            renderRecurringExpensesList(recurringExpenses);
        } catch (error) {
            console.error('Erro ao carregar gastos recorrentes:', error);
            showNotification('Erro ao carregar gastos recorrentes', 'error');
        }
    }

    function renderRecurringExpensesList(expenses) {
        if (!recurringList) return;

        if (expenses.length === 0) {
            recurringList.innerHTML = '<p class="text-gray-500 text-center">Nenhum gasto recorrente cadastrado.</p>';
            return;
        }

        recurringList.innerHTML = expenses.map(expense => `
            <div class="bg-gray-50 p-4 rounded-lg mb-3">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h4 class="font-medium text-gray-800">${expense.description}</h4>
                        <p class="text-sm text-gray-600">
                            <strong>Valor:</strong> €${parseFloat(expense.amount).toFixed(2)} | 
                            <strong>Conta:</strong> ${expense.account} | 
                            <strong>Dia:</strong> ${expense.day_of_month}
                        </p>
                        ${expense.account_plan_code ? `<p class="text-sm text-gray-600"><strong>Plano:</strong> ${expense.account_plan_code}</p>` : ''}
                        <p class="text-sm ${expense.is_business_expense ? 'text-blue-600' : 'text-green-600'}">
                            ${expense.is_business_expense ? '💼 Empresarial' : '🏠 Pessoal'}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="editRecurringExpense(${expense.id})" 
                                class="bg-blue-500 text-white px-3 py-1 rounded text-sm">
                            Editar
                        </button>
                        <button onclick="deleteRecurringExpense(${expense.id})" 
                                class="bg-red-500 text-white px-3 py-1 rounded text-sm">
                            Remover
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
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
        if (!['PIX', 'Boleto'].includes(data.account)) {
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

    // ========== SISTEMA DE TABS ==========
    function initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                
                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => btn.classList.remove('active', 'bg-blue-50', 'text-blue-600', 'border-b-2', 'border-blue-500'));
                tabContents.forEach(content => content.classList.add('hidden'));
                
                // Add active class to clicked button
                button.classList.add('active', 'bg-blue-50', 'text-blue-600', 'border-b-2', 'border-blue-500');
                
                // Show target tab content
                const targetContent = document.getElementById(`${targetTab}-tab`);
                if (targetContent) {
                    targetContent.classList.remove('hidden');
                    
                    // Load specific content based on tab
                    if (targetTab === 'business-analysis') {
                        console.log('🏢 Carregando aba: Análise Empresarial');
                        loadBusinessAnalysis();
                    } else if (targetTab === 'reports') {
                        console.log('📊 Carregando aba: Dashboard Executivo');
                        loadReportsData();
                    } else {
                        console.log(`📋 Aba ativada: ${targetTab}`);
                    }
                }
            });
        });

        // Initialize first tab as active
        if (tabButtons.length > 0) {
            tabButtons[0].click();
        }
    }

    // ========== ANÁLISE EMPRESARIAL ==========
    async function loadBusinessAnalysis() {
        try {
            const token = getToken();
            if (!token) return;

            showNotification('Carregando análise empresarial...', 'info', 2000);

            const year = filterYear.value;
            const month = filterMonth.value;

            // Carregar dados empresariais
            const businessData = await fetchBusinessData(year, month);
            
            console.log('Dados empresariais carregados:', businessData);
            
            await updateBusinessMetrics(businessData);
            await updateBusinessCharts(businessData);
            populateBusinessFilters();
            await loadBusinessExpensesList();

            showNotification('Análise empresarial carregada com sucesso!', 'success', 3000);

        } catch (error) {
            console.error('Erro ao carregar análise empresarial:', error);
            showNotification('Erro ao carregar dados empresariais: ' + error.message, 'error');
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

    // Função para buscar dados do dashboard
    async function fetchDashboardData() {
        try {
            const params = new URLSearchParams({
                year: filterYear.value,
                month: filterMonth.value
            });

            const response = await authenticatedFetch(`${API_BASE_URL}/api/dashboard?${params}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao buscar dados do dashboard.');
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('❌ Erro ao buscar dados do dashboard:', error);
            return {};
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
            6: 550.00, 7: 270.00, 8: 1200.00, 9: 1200.00, 10: 270.00,
            11: 1895.40, 12: 2627.60, 13: 400.00, 14: 540.00, 15: 1080.00,
            16: 1360.00, 17: 756.00, 18: 1512.00, 19: 1890.00, 20: 1620.00,
            21: 1890.00, 22: 2430.00, 23: 2700.00, 24: 1080.00, 25: 2100.00,
            26: 2460.00, 27: 2500.00, 28: 3060.00, 29: 3600.00, 30: 3060.00,
            31: 3840.00, 32: 4320.00, 33: 4800.00, 34: 4800.00, 35: 5400.00,
            36: 5760.00, 37: 6720.00, 38: 7200.00, 39: 8400.00, 40: 9600.00
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
            if (generalUsageEl) generalUsageEl.textContent = '0%';
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

        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        console.log(`📅 Filtrando para mês/ano: ${currentMonth}/${currentYear}`);
        
        // Filtrar gastos do mês atual - usar transaction_date se date não existir
        const monthlyExpenses = expenses.filter(expense => {
            const dateField = expense.transaction_date || expense.date;
            if (!dateField) {
                console.warn('⚠️ Despesa sem data:', expense);
                return false;
            }
            
            const expenseDate = new Date(dateField);
            const matchesMonth = expenseDate.getMonth() + 1 === currentMonth;
            const matchesYear = expenseDate.getFullYear() === currentYear;
            
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
        if (generalUsageEl) generalUsageEl.textContent = Math.round((totalSpent / totalBudget) * 100);
        if (totalBudgetEl) totalBudgetEl.textContent = formatCurrency(totalBudget);

        console.log('📊 Indicadores atualizados:', { safePlans, warningPlans, exceededPlans, totalBudget, totalSpent });
    }

    async function renderAllReportsCharts(expenses, dashboardData) {
        console.log('🎨 Renderizando gráficos dos relatórios...');
        
        try {
            // Renderizar todos os gráficos com dados atualizados
            await Promise.allSettled([
                renderGoalsChart(expenses),
                renderGoalsPlanChart(expenses),
                renderPlanChart(expenses || dashboardData?.planChartData)
            ]);
            
            console.log('✅ Gráficos renderizados com sucesso');
        } catch (error) {
            console.error('❌ Erro ao renderizar gráficos:', error);
        }
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
        
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        // Filtrar gastos do mês atual
        const monthlyExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getMonth() + 1 === currentMonth && 
                   expenseDate.getFullYear() === currentYear;
        });

        const totalGastos = monthlyExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        const numTransacoes = monthlyExpenses.length;
        const ticketMedio = numTransacoes > 0 ? totalGastos / numTransacoes : 0;

        // Análise por tipo
        const pessoal = monthlyExpenses.filter(e => e.type === 'pessoal').reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const profissional = monthlyExpenses.filter(e => e.type === 'profissional').reduce((sum, e) => sum + parseFloat(e.amount), 0);

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
            6: 550.00, 7: 270.00, 8: 1200.00, 9: 1200.00, 10: 270.00,
            11: 1895.40, 12: 2627.60, 13: 400.00, 14: 540.00, 15: 1080.00,
            16: 1360.00, 17: 756.00, 18: 1512.00, 19: 1890.00, 20: 1620.00,
            21: 1890.00, 22: 2430.00, 23: 2700.00, 24: 1080.00, 25: 2100.00,
            26: 2460.00, 27: 2500.00, 28: 3060.00, 29: 3600.00, 30: 3060.00,
            31: 3840.00, 32: 4320.00, 33: 4800.00, 34: 4800.00, 35: 5400.00,
            36: 5760.00, 37: 6720.00, 38: 7200.00, 39: 8400.00, 40: 9600.00
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

        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        // Filtrar gastos do mês atual
        const monthlyExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getMonth() + 1 === currentMonth && 
                   expenseDate.getFullYear() === currentYear;
        });

        // Calcular totais por plano
        const planTotals = {};
        monthlyExpenses.forEach(expense => {
            const planId = expense.plan_conta;
            planTotals[planId] = (planTotals[planId] || 0) + parseFloat(expense.amount);
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
                    const expenses = await fetchExpenses();
                    renderPlanChart(expenses);
                });
            }
            
            const refreshAlertsBtn = document.getElementById('refresh-alerts-btn');
            if (refreshAlertsBtn) {
                refreshAlertsBtn.addEventListener('click', async () => {
                    console.log('🔄 Atualizando alertas...');
                    await loadReportsData();
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
        });

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
    async function fetchAndRenderPlanChart() {
        try {
            const params = new URLSearchParams({
                year: filterYear.value,
                month: filterMonth.value
            });

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

    /**
     * Atualiza o gráfico de distribuição por conta empresarial
     */
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

            const chartData = {
                labels: accounts,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(236, 72, 153, 0.8)',
                        'rgba(14, 165, 233, 0.8)',
                        'rgba(168, 85, 247, 0.8)',
                        'rgba(34, 211, 238, 0.8)',
                        'rgba(251, 146, 60, 0.8)'
                    ],
                    borderWidth: 3,
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                    hoverOffset: 15
                }]
            };

            const config = {
                type: 'doughnut',
                data: chartData,
                options: mergeChartOptions({
                    plugins: {
                        title: {
                            display: true,
                            text: 'Distribuição por Conta Empresarial'
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
     * Atualiza o gráfico de categorias empresariais
     */
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

    async function updateBusinessCategoryChart(data) {
        const ctx = document.getElementById('business-category-chart');
        if (!ctx) return;

        // Aguardar Chart.js estar carregado
        if (!await waitForChartJs()) {
            console.warn('Chart.js não carregado para business category chart');
            return;
        }

        // Destruir gráfico existente de forma segura
        destroyChart('businessCategoryChart');

        try {
            const categories = Object.keys(data.byCategory || {});
            const values = Object.values(data.byCategory || {});

            if (categories.length === 0) {
                console.log('Nenhum dado de categoria empresarial disponível');
                return;
            }

            window.businessCategoryChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: categories,
                    datasets: [{
                        label: 'Valor por Categoria',
                        data: values,
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: R$ ${context.parsed.y.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value.toLocaleString('pt-BR', {minimumFractionDigits: 0});
                                }
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 0
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Erro ao criar gráfico de categorias empresariais:', error);
            showNotification('Erro ao carregar gráfico de categorias', 'error');
        }
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
        
        // Carregar insights iniciais
        refreshAllInsights();
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

    // Inicializar sistema de insights quando carregar a página
    document.addEventListener('DOMContentLoaded', function() {
        // Aguardar um pouco para garantir que outros sistemas foram inicializados
        setTimeout(initInsightSystem, 1000);
    });

    // ========== FIM SISTEMA DE INSIGHTS ==========

    // ========== ANÁLISE POR PERÍODO DA FATURA ==========
    
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
            
            // Copiar opções do filtro principal
            for (let i = 1; i < filterAccountSelect.options.length; i++) {
                const option = filterAccountSelect.options[i];
                const newOption = document.createElement('option');
                newOption.value = option.value;
                newOption.textContent = option.textContent;
                accountSelect.appendChild(newOption);
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
        
        let url = `${API_BASE_URL}/api/expenses/period?start=${startDate}&end=${endDate}`;
        if (account) url += `&account=${account}`;
        if (type) url += `&type=${type}`;
        
        const response = await authenticatedFetch(url);
        
        if (!response.ok) {
            throw new Error('Erro ao buscar dados do período');
        }
        
        return await response.json();
    }
    
    function updatePeriodSummary(data) {
        const summaryCards = document.getElementById('period-summary-cards');
        const summaryText = document.getElementById('period-summary-text');
        
        if (!summaryCards || !data) return;
        
        const total = data.reduce((sum, item) => sum + (item.Valor || 0), 0);
        const totalPersonal = data.filter(item => item.Tipo === 'personal').reduce((sum, item) => sum + (item.Valor || 0), 0);
        const totalBusiness = data.filter(item => item.Tipo === 'business').reduce((sum, item) => sum + (item.Valor || 0), 0);
        const transactionCount = data.length;
        
        const avgDaily = total / Math.max(1, getDaysBetweenDates(data[0]?.Data, data[data.length - 1]?.Data));
        
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
                    <p class="mb-2"><strong>🏦 Contas Utilizadas:</strong> ${[...new Set(data.map(item => item.ContaNome))].length}</p>
                    <p><strong>📅 Período:</strong> ${data.length > 0 ? formatDate(data[0].Data) + ' até ' + formatDate(data[data.length - 1].Data) : 'N/A'}</p>
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
        
        // Agrupar por data
        const dailyData = {};
        data.forEach(item => {
            const date = item.Data.split('T')[0];
            dailyData[date] = (dailyData[date] || 0) + (item.Valor || 0);
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
        
        // Agrupar por conta
        const accountData = {};
        data.forEach(item => {
            const account = item.ContaNome || 'Sem Conta';
            accountData[account] = (accountData[account] || 0) + (item.Valor || 0);
        });
        
        const labels = Object.keys(accountData);
        const values = Object.values(accountData);
        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6b7280'
        ];
        
        periodCharts.accounts = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 10,
                            usePointStyle: true
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
        
        // Agrupar por plano de conta
        const categoryData = {};
        data.forEach(item => {
            const category = item.PlanoContasDescricao || item.PlanoContasID || 'Outros';
            categoryData[category] = (categoryData[category] || 0) + (item.Valor || 0);
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
        
        data.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            
            row.innerHTML = `
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">${formatDate(item.Data)}</td>
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">${item.Descricao || 'N/A'}</td>
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">${item.ContaNome || 'N/A'}</td>
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold">${formatCurrency(item.Valor || 0)}</td>
                <td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    <span class="px-2 py-1 rounded-full text-xs ${item.Tipo === 'business' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}">
                        ${item.Tipo === 'business' ? '💼 Empresarial' : '🏠 Pessoal'}
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
        
        // Análise básica
        const total = data.reduce((sum, item) => sum + (item.Valor || 0), 0);
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
    
    // ========== FIM ANÁLISE POR PERÍODO DA FATURA ==========

    // Chamar inicialização
    init();

    // ========== FIM FUNÇÕES GASTOS RECORRENTES ==========
});
