// =============================================================
// BUSINESS INTELLIGENCE MODULE v2.0 - REDESIGNED
// Sistema integrado de análise financeira e relatórios
// =============================================================

class FinancialBI {
    constructor() {
        this.API_BASE = window.API_BASE_URL || 'https://backend-production-a867.up.railway.app';
        this.currentData = null;
        this.charts = new Map();
        this.initialized = false;
    }

    // Inicialização do módulo BI
    async initialize() {
        try {
            console.log('🚀 Inicializando módulo Business Intelligence...');
            
            // Verificar autenticação
            const token = localStorage.getItem('jwtToken');
            if (!token) {
                throw new Error('Token de autenticação não encontrado');
            }

            // Configurar headers padrão
            this.defaultHeaders = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            // Verificar saúde do servidor
            await this.checkServerHealth();
            
            this.initialized = true;
            console.log('✅ Módulo BI inicializado com sucesso');
            return true;
        } catch (error) {
            console.error('❌ Falha na inicialização do BI:', error);
            throw error;
        }
    }

    // Verificar saúde do servidor
    async checkServerHealth() {
        try {
            const response = await fetch(`${this.API_BASE}/api/health`, {
                headers: this.defaultHeaders
            });
            
            if (!response.ok) {
                throw new Error(`Servidor indisponível: ${response.status}`);
            }
            
            const health = await response.json();
            console.log('🏥 Status do servidor:', health);
            return health;
        } catch (error) {
            console.error('❌ Erro ao verificar saúde do servidor:', error);
            throw error;
        }
    }

    // Gerar relatório mensal com análise BI
    async generateMonthlyReport(year, month, account = '') {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            console.log(`📊 Gerando relatório mensal: ${year}/${month} - Conta: ${account || 'Todas'}`);
            
            // Fazer request para o endpoint de relatório mensal
            const response = await fetch(`${this.API_BASE}/api/reports/monthly`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify({ year, month, account })
            });

            if (!response.ok) {
                await this.handleReportError(response);
                return;
            }

            // Download do PDF
            const blob = await response.blob();
            this.downloadPDF(blob, `relatorio-mensal-${year}-${month}${account ? '-' + account : ''}.pdf`);
            
            console.log('✅ Relatório gerado com sucesso');
            return true;

        } catch (error) {
            console.error('❌ Erro ao gerar relatório:', error);
            throw error;
        }
    }

    // Tratamento de erros específico para relatórios
    async handleReportError(response) {
        try {
            const errorData = await response.json();
            console.error('📋 Detalhes do erro:', errorData);
            
            let errorMessage = 'Falha ao gerar o relatório.';
            
            // Mensagens personalizadas baseadas no ambiente e erro
            if (errorData.environment === 'Railway') {
                if (errorData.details?.includes('canvas') || errorData.details?.includes('ChartJS')) {
                    errorMessage = `🎨 Erro com gráficos no Railway: ${errorData.details}`;
                } else if (errorData.details?.includes('font')) {
                    errorMessage = `🔤 Erro com fontes no Railway: ${errorData.details}`;
                } else if (errorData.details?.includes('is_personal')) {
                    errorMessage = `🗃️ Erro de estrutura de dados: Campo 'is_personal' não encontrado`;
                } else {
                    errorMessage = `☁️ Erro no Railway (${response.status}): ${errorData.details || errorData.message}`;
                }
            } else {
                errorMessage = `🚨 Erro ${response.status}: ${errorData.details || errorData.message}`;
            }
            
            this.showNotification(errorMessage, 'error');
            
        } catch (parseError) {
            console.error('❌ Erro ao processar resposta de erro:', parseError);
            
            let errorMessage;
            if (response.status === 500) {
                errorMessage = `🔧 Erro interno do servidor (${response.status}). Verifique os logs do backend.`;
            } else {
                errorMessage = `🚨 Erro ${response.status}: ${response.statusText}`;
            }
            
            this.showNotification(errorMessage, 'error');
        }
    }

    // Download de PDF
    downloadPDF(blob, filename) {
        try {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
            this.showNotification('📄 Relatório baixado com sucesso!', 'success');
        } catch (error) {
            console.error('❌ Erro ao baixar PDF:', error);
            this.showNotification('❌ Erro ao baixar o arquivo PDF', 'error');
        }
    }

    // Executar diagnóstico completo
    async runDiagnostics() {
        try {
            console.log('🔍 Executando diagnóstico completo...');
            
            // Diagnóstico das dependências PDF
            const pdfDiagResponse = await fetch(`${this.API_BASE}/api/health/pdf-dependencies`, {
                headers: this.defaultHeaders
            });
            
            if (pdfDiagResponse.ok) {
                const pdfDiag = await pdfDiagResponse.json();
                console.log('📊 Diagnóstico PDF:', pdfDiag);
                
                this.displayDiagnostics(pdfDiag);
                return pdfDiag;
            } else {
                throw new Error(`Falha no diagnóstico: ${pdfDiagResponse.status}`);
            }
            
        } catch (error) {
            console.error('❌ Erro no diagnóstico:', error);
            this.showNotification('❌ Falha ao executar diagnóstico', 'error');
        }
    }

    // Exibir resultados do diagnóstico
    displayDiagnostics(diagData) {
        let diagMsg = '🔍 Diagnóstico do Sistema:\n\n';
        
        if (!diagData.dependencies.chartjs?.available) {
            diagMsg += '❌ ChartJS indisponível - Gráficos podem falhar\n';
        } else {
            diagMsg += '✅ ChartJS disponível\n';
        }
        
        if (!diagData.dependencies.pdfkit?.available) {
            diagMsg += '❌ PDFKit indisponível - Geração de PDF pode falhar\n';
        } else {
            diagMsg += '✅ PDFKit disponível\n';
        }
        
        if (!diagData.dependencies.canvas?.available) {
            diagMsg += '❌ Canvas indisponível - Renderização de gráficos pode falhar\n';
        } else {
            diagMsg += '✅ Canvas disponível\n';
        }
        
        if (diagData.environment === 'Railway') {
            diagMsg += '\n☁️ Ambiente: Railway\n';
            diagMsg += '💡 Dica: Problemas com gráficos são comuns no Railway\n';
        }
        
        this.showNotification(diagMsg, 'info');
    }

    // Sistema de notificações melhorado
    showNotification(message, type = 'info') {
        // Verificar se existe função showNotification global
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        
        // Fallback para console
        const emoji = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        
        console.log(`${emoji[type] || 'ℹ️'} ${message}`);
        
        // Tentar mostrar alert para mensagens importantes
        if (type === 'error') {
            alert(`Erro: ${message}`);
        }
    }

    // Análise de tendências
    async analyzeTrends(year, months = 6) {
        try {
            const response = await fetch(`${this.API_BASE}/api/bi/trends`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify({ year, months })
            });
            
            if (!response.ok) {
                throw new Error(`Erro na análise de tendências: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('❌ Erro na análise de tendências:', error);
            throw error;
        }
    }

    // Análise comparativa
    async compareExpenses(year1, month1, year2, month2) {
        try {
            const response = await fetch(`${this.API_BASE}/api/bi/compare`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify({ year1, month1, year2, month2 })
            });
            
            if (!response.ok) {
                throw new Error(`Erro na análise comparativa: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('❌ Erro na análise comparativa:', error);
            throw error;
        }
    }

    // Relatório executivo
    async generateExecutiveReport(year, month) {
        try {
            const response = await fetch(`${this.API_BASE}/api/bi/executive-report`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify({ year, month })
            });
            
            if (!response.ok) {
                throw new Error(`Erro no relatório executivo: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('❌ Erro no relatório executivo:', error);
            throw error;
        }
    }
}

// =============================================================
// INTEGRAÇÃO COM O DASHBOARD
// =============================================================

// Instância global do BI
window.FinancialBI = new FinancialBI();

// Integração com funções existentes do dashboard
if (typeof window.handleMonthlyReportDownload === 'function') {
    // Backup da função original
    window.originalHandleMonthlyReportDownload = window.handleMonthlyReportDownload;
    
    // Substituir por versão melhorada
    window.handleMonthlyReportDownload = async function(e) {
        e.preventDefault();
        
        const year = document.getElementById('report-year')?.value;
        const month = document.getElementById('report-month')?.value;
        const account = document.getElementById('report-account')?.value || '';

        if (!year || !month) {
            window.FinancialBI.showNotification('📅 Selecione ano e mês para o relatório.', 'error');
            return;
        }

        const submitButton = e.submitter;
        
        // UI Loading
        const reportGenerateText = document.getElementById('reportGenerateText');
        const reportLoadingText = document.getElementById('reportLoadingText');
        
        if (reportGenerateText) reportGenerateText.classList.add('hidden');
        if (reportLoadingText) reportLoadingText.classList.remove('hidden');
        if (submitButton) submitButton.disabled = true;

        try {
            await window.FinancialBI.generateMonthlyReport(year, month, account);
        } catch (error) {
            console.error('❌ Erro no relatório mensal:', error);
            window.FinancialBI.showNotification(`❌ ${error.message}`, 'error');
        } finally {
            // Restaurar UI
            if (reportGenerateText) reportGenerateText.classList.remove('hidden');
            if (reportLoadingText) reportLoadingText.classList.add('hidden');
            if (submitButton) submitButton.disabled = false;
        }
    };
}

// Funcionalidades de diagnóstico
window.runSystemDiagnostics = async function() {
    return await window.FinancialBI.runDiagnostics();
};

// Análises BI
window.analyzeTrends = async function(year, months = 6) {
    return await window.FinancialBI.analyzeTrends(year, months);
};

window.compareExpenses = async function(year1, month1, year2, month2) {
    return await window.FinancialBI.compareExpenses(year1, month1, year2, month2);
};

window.generateExecutiveReport = async function(year, month) {
    return await window.FinancialBI.generateExecutiveReport(year, month);
};

// Inicialização automática quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('🚀 Inicializando Business Intelligence...');
        await window.FinancialBI.initialize();
        console.log('✅ BI Module carregado e pronto para uso');
    } catch (error) {
        console.error('❌ Falha na inicialização do BI:', error);
    }
});

console.log('📊 Business Intelligence Module v2.0 - Redesigned & Integrated');