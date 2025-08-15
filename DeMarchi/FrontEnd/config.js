// Configurações da aplicação
const CONFIG = {
    // URLs do Railway
    API_BASE_URL: 'https://backend-production-a867.up.railway.app',
    FRONTEND_URL: 'https://controle-de-financeiro-production.up.railway.app',
    
    // Configurações de desenvolvimento
    DEBUG_MODE: false,
    
    // Configurações de gráficos
    CHART_CONFIG: {
        maintainAspectRatio: true,
        aspectRatio: 2,
        responsive: true,
        plugins: {
            legend: {
                display: true,
                position: 'top'
            }
        }
    },
    
    // Timeouts e delays
    API_TIMEOUT: 10000,
    CHART_UPDATE_DELAY: 100,
    
    // Mensagens padrão
    MESSAGES: {
        CHART_LOADING: 'Carregando gráfico...',
        CHART_ERROR: 'Erro ao carregar gráfico',
        NO_DATA: 'Sem dados para exibir',
        TREND_ANALYSIS: 'Análise de tendências'
    }
};

// Exportar configurações
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}
