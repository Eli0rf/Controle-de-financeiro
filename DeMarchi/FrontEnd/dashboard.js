/**
 * dashboard.js - Versão Final e Completa
 */
document.addEventListener('DOMContentLoaded', function() {

    // Define a URL base do backend no Railway
    const API_BASE_URL = 'https://backend-production-a867.up.railway.app';

    const RAILWAY_BACKEND_URL = 'https://backend-production-a867.up.railway.app';
    
    const FILE_BASE_URL = 'https://backend-production-a867.up.railway.app';

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

    let expensesLineChart, expensesPieChart, planChart, mixedTypeChart, goalsChart, goalsPlanChart;
    let allExpensesCache = [];

    function getToken() {
        const token = localStorage.getItem('token');
        console.log('Token recuperado:', token ? 'Token presente' : 'Token ausente');
        return token;
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
        if (businessCheckbox) businessCheckbox.addEventListener('change', toggleExpenseFields);
        document.getElementById('filter-account').addEventListener('change', fetchAllData);
        if (filterPlan) filterPlan.addEventListener('input', applyAllFilters);
        if (interactiveReportBtn) interactiveReportBtn.addEventListener('click', () => {
            if (interactiveReportModal) {
                interactiveReportModal.classList.remove('hidden');
                setTimeout(() => interactiveReportModal.classList.remove('opacity-0'), 10);
                populateIrAccounts();
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

    // Verificar se Chart.js está carregado
    function isChartJsLoaded() {
        return typeof Chart !== 'undefined';
    }

    // Aguardar Chart.js estar disponível
    function waitForChartJs() {
        return new Promise((resolve) => {
            if (isChartJsLoaded()) {
                resolve();
                return;
            }
            
            const checkInterval = setInterval(() => {
                if (isChartJsLoaded()) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            // Timeout após 5 segundos
            setTimeout(() => {
                clearInterval(checkInterval);
                console.error('Chart.js não foi carregado dentro do tempo limite');
                resolve();
            }, 5000);
        });
    }

    async function fetchAllData() {
        try {
            if (!checkAuthentication()) {
                console.log('Autenticação falhou em fetchAllData');
                return;
            }

            console.log('Iniciando fetchAllData...');
            
            // Aguardar Chart.js estar disponível
            await waitForChartJs();
            
            if (!isChartJsLoaded()) {
                console.error('Chart.js não está disponível, gráficos serão ignorados');
                showNotification('Biblioteca de gráficos não carregada, alguns recursos podem não funcionar', 'warning');
            }

            await fetchAndRenderExpenses();
            await fetchAndRenderDashboardMetrics();
            await fetchAndRenderGoalsChart();
            console.log('fetchAllData concluído');
        } catch (error) {
            console.error('Erro em fetchAllData:', error);
            showNotification('Erro ao carregar dados do dashboard', 'error');
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

            // Notificações de limites (alertas)
            data.forEach(item => {
                if (item.Alerta && !sessionStorage.getItem(`alerta_${item.PlanoContasID}_${item.Alerta.percentual}_${filterYear.value}_${filterMonth.value}`)) {
                    showNotification(item.Alerta.mensagem);
                    sessionStorage.setItem(`alerta_${item.PlanoContasID}_${item.Alerta.percentual}_${filterYear.value}_${filterMonth.value}`, 'true');
                }
            });

            renderGoalsChart(data);
            renderGoalsPlanChart(data);
        } catch (error) {
            console.error('Erro ao buscar limites:', error);
            showNotification('Erro ao carregar limites de gastos', 'error');
        }
    }

    function renderGoalsChart(data = []) {
        const ctx = document.getElementById('goals-chart')?.getContext('2d');
        if (!ctx) {
            console.warn('Canvas goals-chart não encontrado');
            return;
        }
        
        if (!isChartJsLoaded()) {
            console.error('Chart.js não está carregado para renderGoalsChart');
            showNoDataMessage('goals-chart', 'Biblioteca de gráficos não carregada');
            return;
        }
        
        if (goalsChart) goalsChart.destroy();

        if (!data || data.length === 0) {
            showNoDataMessage('goals-chart', 'Sem dados de limites disponíveis');
            return;
        }

        const labels = data.map(item => `Plano ${item.PlanoContasID}`);
        const values = data.map(item => Number(item.Total));
        const tetos = data.map(item => Number(item.Teto));

        try {
            goalsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Gastos Atuais',
                            data: values,
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'Teto de Gastos',
                            data: tetos,
                            type: 'line',
                            fill: false,
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 2,
                            pointRadius: 5,
                            pointBackgroundColor: 'rgba(75, 192, 192, 1)'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { 
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Valor (R$)'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Planos de Conta'
                            }
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: 'Comparação: Gastos vs Limites por Plano'
                        },
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Erro ao criar gráfico de metas:', error);
            showNoDataMessage('goals-chart', 'Erro ao carregar gráfico');
        }
    }

    function renderGoalsPlanChart(data = []) {
        const canvas = document.getElementById('goals-plan-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        goalsPlanChart = destroyChartInstance(goalsPlanChart, 'goals-plan-chart');

        const sorted = [...data].sort((a, b) => a.PlanoContasID - b.PlanoContasID);

        const labels = sorted.map(item => `Plano ${item.PlanoContasID}`);
        const tetos = sorted.map(item => Number(item.Teto));
        const atingido = sorted.map(item => Number(item.Total));
        const percentuais = sorted.map((item, i) =>
            tetos[i] > 0 ? Math.round((atingido[i] / tetos[i]) * 100) : 0
        );

        goalsPlanChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Teto de Gastos',
                        data: tetos,
                        backgroundColor: 'rgba(75, 192, 192, 0.4)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Gasto Atual',
                        data: atingido,
                        backgroundColor: 'rgba(255, 99, 132, 0.4)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1,
                        datalabels: {
                            anchor: 'end',
                            align: 'start',
                            color: '#333',
                            font: { weight: 'bold' },
                            formatter: function(value, context) {
                                const i = context.dataIndex;
                                return tetos[i] > 0 ? percentuais[i] + '%' : '';
                            }
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    tooltip: { mode: 'index', intersect: false },
                    legend: { position: 'top' },
                    datalabels: {
                        display: function(context) {
                            // Só mostra percentual na barra "Gasto Atual"
                            return context.dataset.label === 'Gasto Atual';
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            },
            plugins: [ChartDataLabels]
        });
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
    function showNotification(message, type = 'info') {
        if (window.Swal) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
                title: message,
                showConfirmButton: false,
                timer: 3500,
                timerProgressBar: true
            });
        } else {
            // fallback para toast antigo
            const toastContainer = document.getElementById('toast-container');
            if (!toastContainer) return;
            const toast = document.createElement('div');
            toast.className = `px-4 py-3 rounded shadow-lg text-white mb-2 animate-fade-in ${type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-blue-600'}`;
            toast.textContent = message;
            toastContainer.appendChild(toast);
            setTimeout(() => {
                toast.classList.add('opacity-0');
                setTimeout(() => toast.remove(), 500);
            }, 3500);
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

    function renderLineChart(data = []) {
        const canvas = document.getElementById('expenses-line-chart');
        if (!canvas) {
            console.warn('Canvas expenses-line-chart não encontrado');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        if (!isChartJsLoaded()) {
            console.error('Chart.js não está carregado para renderLineChart');
            showNoDataMessage('expenses-line-chart', 'Biblioteca de gráficos não carregada');
            return;
        }
        
        expensesLineChart = destroyChartInstance(expensesLineChart, 'expenses-line-chart');
        
        const year = parseInt(filterYear.value, 10);
        const month = parseInt(filterMonth.value, 10);
        const daysInMonth = new Date(year, month, 0).getDate();
        const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const chartData = new Array(daysInMonth).fill(0);
        
        if (!data || data.length === 0) {
            showNoDataMessage('expenses-line-chart', 'Sem dados para este período.');
            return;
        }
        
        data.forEach(d => { chartData[d.day - 1] = d.total; });
        
        if (chartData.every(v => v === 0)) {
            showNoDataMessage('expenses-line-chart', 'Sem gastos registrados neste período.');
            return;
        }
        
        const max = Math.max(...chartData);
        const min = Math.min(...chartData.filter(v => v > 0));

        try {
            expensesLineChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `Gastos Diários em ${filterMonth.options[filterMonth.selectedIndex].text}`,
                        data: chartData,
                        borderColor: getThemeColor('#3B82F6', '#60A5FA'),
                        backgroundColor: getThemeColor('rgba(59,130,246,0.1)', 'rgba(59,130,246,0.3)'),
                        tension: 0.2,
                        pointBackgroundColor: chartData.map(v => v === max ? '#22c55e' : v === min ? '#ef4444' : getThemeColor('#3B82F6', '#60A5FA')),
                        pointRadius: chartData.map(v => v === max || v === min ? 6 : 4)
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Evolução dos Gastos Diários',
                            color: getThemeColor('#222', '#fff'),
                            font: { size: 18 }
                        },
                        subtitle: {
                            display: true,
                            text: `Maior gasto: R$ ${max.toFixed(2)} | Menor gasto: R$ ${min ? min.toFixed(2) : '0.00'}`,
                            color: getThemeColor('#666', '#ccc'),
                            font: { size: 13 }
                        },
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => `Dia ${ctx.label}: R$ ${ctx.parsed.y.toFixed(2)}`
                            }
                        },
                        datalabels: {
                            color: getThemeColor('#222', '#fff'),
                            anchor: 'end', align: 'top', font: { weight: 'bold' },
                            formatter: v => {
                                const val = getNumberValue(v);
                                return val > 0 ? `R$ ${val.toFixed(2)}` : '';
                            }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Dia do Mês' } },
                        y: { beginAtZero: true }
                    }
                },
                plugins: [ChartDataLabels]
            });
        } catch (error) {
            console.error('Erro ao criar gráfico de linha:', error);
            showNoDataMessage('expenses-line-chart', 'Erro ao carregar gráfico');
        }
    }

    function renderPieChart(data = []) {
        const canvas = document.getElementById('expenses-pie-chart');
        if (!canvas) {
            console.warn('Canvas expenses-pie-chart não encontrado');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        if (!isChartJsLoaded()) {
            console.error('Chart.js não está carregado para renderPieChart');
            showNoDataMessage('expenses-pie-chart', 'Biblioteca de gráficos não carregada');
            return;
        }
        
        expensesPieChart = destroyChartInstance(expensesPieChart, 'expenses-pie-chart');
        
        if (!data || !data.length) {
            showNoDataMessage('expenses-pie-chart', 'Sem dados para este período.');
            return;
        }
        
        const total = Array.isArray(data) && data.length > 0 ? data.reduce((sum, d) => sum + (typeof d.total === 'number' ? d.total : parseFloat(d.total) || 0), 0) : 0;
        
        try {
            expensesPieChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.map(d => d.account),
                datasets: [{
                    data: data.map(d => d.total),
                    backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribuição por Conta',
                        color: getThemeColor('#222', '#fff'),
                        font: { size: 18 }
                    },
                    subtitle: {
                        display: true,
                        text: `Total: R$ ${total.toFixed(2)}`,
                        color: getThemeColor('#666', '#ccc'),
                        font: { size: 13 }
                    },
                    legend: {
                        position: 'bottom',
                        labels: { color: getThemeColor('#222', '#fff') }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.label}: R$ ${ctx.parsed.toFixed(2)} (${((ctx.parsed/total)*100).toFixed(1)}%)`
                        }
                    },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold' },
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
            console.error('Erro ao criar gráfico de pizza:', error);
            showNoDataMessage('expenses-pie-chart', 'Erro ao carregar gráfico');
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
        return safeRenderChart('mixed-type-chart', (canvas, ctx, data) => {
            mixedTypeChart = destroyChartInstance(mixedTypeChart, 'mixed-type-chart');
            
            const max = Math.max(...data.map(d => d.personal_total + d.business_total));
            mixedTypeChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.map(d => d.account),
                    datasets: [
                        { label: 'Gastos Pessoais', data: data.map(d => d.personal_total), backgroundColor: 'rgba(59, 130, 246, 0.7)' },
                        { label: 'Gastos Empresariais', data: data.map(d => d.business_total), backgroundColor: 'rgba(239, 68, 68, 0.7)' }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Comparação: Pessoal vs. Empresarial por Conta',
                            color: getThemeColor('#222', '#fff'),
                            font: { size: 18 }
                        },
                        subtitle: {
                            display: true,
                            text: `Conta com maior gasto: ${data.find(d => d.personal_total + d.business_total === max)?.account || '-'}`,
                            color: getThemeColor('#666', '#ccc'),
                            font: { size: 13 }
                        },
                        legend: {
                            position: 'bottom',
                        labels: { color: getThemeColor('#222', '#fff') }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: R$ ${ctx.parsed.y.toFixed(2)}`
                        }
                    },
                    datalabels: {
                        color: getThemeColor('#222', '#fff'),
                        anchor: 'end', align: 'top', font: { weight: 'bold' },
                        formatter: v => {
                            const val = getNumberValue(v);
                            return val > 0 ? `R$ ${val.toFixed(2)}` : '';
                        }
                    }
                },
                scales: { x: { stacked: false }, y: { beginAtZero: true } }
            },
            plugins: [ChartDataLabels]
        });
            return true;
        }, data, 'Sem dados para comparação pessoal vs empresarial.');
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
        planChart = destroyChartInstance(planChart, 'plan-chart');
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

        // Exibe o modal normalmente
        const modal = document.getElementById('report-modal');
        if (modal) {
            modal.classList.remove('hidden', 'opacity-0');
            modal.classList.add('flex');
            setTimeout(() => modal.classList.remove('opacity-0'), 10);
        }
    }

    function closeReportModal() {
        if(reportModal) {
            reportModal.classList.add('opacity-0');
            setTimeout(() => reportModal.classList.add('hidden'), 300);
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

    // Helper to destroy Chart.js instance safely and clear Chart registry
    function destroyChartInstance(chartVar, canvasId) {
        if (chartVar && typeof chartVar.destroy === 'function') {
            try {
                chartVar.destroy();
            } catch (e) {
                // fallback: forcibly clear the canvas if Chart.js fails
                const canvas = document.getElementById(canvasId);
                if (canvas && canvas.getContext) {
                    const ctx = canvas.getContext('2d');
                    ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            }
        }
        // Remove lingering Chart.js reference from Chart registry (Chart 3+)
        if (window.Chart && window.Chart.instances) {
            Object.keys(window.Chart.instances).forEach(key => {
                const chart = window.Chart.instances[key];
                if (chart && chart.canvas && chart.canvas.id === canvasId) {
                    delete window.Chart.instances[key];
                }
            });
        }
        return null;
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
                        loadBusinessAnalysis();
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

            const year = filterYear.value;
            const month = filterMonth.value;

            // Carregar dados empresariais
            const businessData = await fetchBusinessData(year, month);
            updateBusinessMetrics(businessData);
            updateBusinessCharts(businessData);
            populateBusinessFilters();
            loadBusinessExpensesList();

        } catch (error) {
            console.error('Erro ao carregar análise empresarial:', error);
            showNotification('Erro ao carregar dados empresariais', 'error');
        }
    }

    async function fetchBusinessData(year, month) {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/expenses?year=${year}&month=${month}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao buscar dados');
        }
        
        const allExpenses = await response.json();
        const businessExpenses = allExpenses.filter(expense => expense.is_business_expense);
        
        return {
            total: businessExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0),
            expenses: businessExpenses,
            invoiced: businessExpenses.filter(exp => exp.invoice_path).reduce((sum, exp) => sum + parseFloat(exp.amount), 0),
            nonInvoiced: businessExpenses.filter(exp => !exp.invoice_path).reduce((sum, exp) => sum + parseFloat(exp.amount), 0),
            byAccount: groupByAccount(businessExpenses),
            byCategory: groupByCategory(businessExpenses)
        };
    }

    function updateBusinessMetrics(data) {
        const businessTotal = document.getElementById('business-total');
        const businessGrowth = document.getElementById('business-growth');
        const businessInvoiced = document.getElementById('business-invoiced');
        const businessNonInvoiced = document.getElementById('business-non-invoiced');

        if (businessTotal) businessTotal.textContent = `R$ ${data.total.toFixed(2)}`;
        if (businessInvoiced) businessInvoiced.textContent = `R$ ${data.invoiced.toFixed(2)}`;
        if (businessNonInvoiced) businessNonInvoiced.textContent = `R$ ${data.nonInvoiced.toFixed(2)}`;
        
        // Calcular crescimento (exemplo básico)
        if (businessGrowth) businessGrowth.textContent = '+0%'; // Implementar cálculo de crescimento
    }

    function updateBusinessCharts(data) {
        // Chart de evolução mensal
        updateBusinessEvolutionChart(data);
        
        // Chart por conta
        updateBusinessAccountChart(data);
        
        // Chart por categoria
        updateBusinessCategoryChart(data);
    }

    function updateBusinessEvolutionChart(data) {
        const ctx = document.getElementById('business-evolution-chart');
        if (!ctx) return;

        if (window.businessEvolutionChart) {
            window.businessEvolutionChart.destroy();
        }

        window.businessEvolutionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                datasets: [{
                    label: 'Gastos Empresariais',
                    data: [data.total, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Implementar dados reais
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    function updateBusinessAccountChart(data) {
        const ctx = document.getElementById('business-account-chart');
        if (!ctx) return;

        if (window.businessAccountChart) {
            window.businessAccountChart.destroy();
        }

        const accounts = Object.keys(data.byAccount);
        const values = Object.values(data.byAccount);

        window.businessAccountChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: accounts,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(139, 92, 246, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    function updateBusinessCategoryChart(data) {
        const ctx = document.getElementById('business-category-chart');
        if (!ctx) return;

        if (window.businessCategoryChart) {
            window.businessCategoryChart.destroy();
        }

        const categories = Object.keys(data.byCategory);
        const values = Object.values(data.byCategory);

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
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
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

    // Chamar inicialização
    init();

    // ========== FIM FUNÇÕES GASTOS RECORRENTES ==========
});
