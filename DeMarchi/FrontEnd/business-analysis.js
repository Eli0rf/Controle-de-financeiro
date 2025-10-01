// business-analysis.js - Módulo de Business Intelligence para análise de despesas

class BusinessAnalytics {
    constructor(apiBaseUrl = '') {
        this.apiBaseUrl = apiBaseUrl;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
    }

    // Cache management
    getCachedData(key) {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCachedData(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    // API Helper para fazer requests autenticadas
    async makeRequest(endpoint, options = {}) {
        const token = localStorage.getItem('jwtToken');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
            ...options,
            headers
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    // 1. Análise de Tendências Mensais
    async getTrendAnalysis(months = 12) {
        const cacheKey = `trends_${months}`;
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const currentDate = new Date();
            const trends = [];

            for (let i = months - 1; i >= 0; i--) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                const year = date.getFullYear();
                const month = date.getMonth() + 1;

                const kpis = await this.makeRequest(`/api/kpis/monthly?year=${year}&month=${month}`);
                
                if (kpis && kpis.totals) {
                    trends.push({
                        period: `${year}-${month.toString().padStart(2, '0')}`,
                        year,
                        month,
                        total: kpis.totals.total || 0,
                        business: kpis.totals.totalEmpresarial || 0,
                        personal: kpis.totals.totalPessoal || 0,
                        projection: kpis.projecao?.projecao || 0,
                        hhi: kpis.concentracao?.hhi || 0
                    });
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

            this.setCachedData(cacheKey, trends);
            return trends;

        } catch (error) {
            console.error('Erro ao obter análise de tendências:', error);
            return [];
        }
    }

    // 2. Análise de Concentração de Gastos (Pareto)
    async getConcentrationAnalysis(year, month) {
        const cacheKey = `concentration_${year}_${month}`;
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const kpis = await this.makeRequest(`/api/kpis/monthly?year=${year}&month=${month}`);
            
            if (!kpis.distrib?.porPlano) {
                return { error: 'Dados insuficientes para análise' };
            }

            // Converter em array e ordenar por valor
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

            // Encontrar quantos planos representam 80% dos gastos
            const pareto80Count = analysis.filter(item => item.isPareto80).length;
            
            const result = {
                total,
                planCount: planData.length,
                pareto80Count,
                pareto80Percentage: planData.length > 0 ? (pareto80Count / planData.length * 100) : 0,
                hhi: kpis.concentracao?.hhi || 0,
                hhiScaled: kpis.concentracao?.hhiScaled || 0,
                analysis
            };

            this.setCachedData(cacheKey, result);
            return result;

        } catch (error) {
            console.error('Erro ao obter análise de concentração:', error);
            return { error: error.message };
        }
    }

    // 3. Análise de Anomalias
    async getAnomalyAnalysis(months = 6) {
        const cacheKey = `anomalies_${months}`;
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const anomalies = await this.makeRequest(`/api/kpis/anomaly?months=${months}`);
            
            // Processar dados de anomalia
            const analysis = {
                totalAnomalies: anomalies.length || 0,
                highRisk: anomalies.filter(a => a.severity === 'HIGH').length || 0,
                mediumRisk: anomalies.filter(a => a.severity === 'MEDIUM').length || 0,
                lowRisk: anomalies.filter(a => a.severity === 'LOW').length || 0,
                categories: {},
                timeline: anomalies
            };

            // Agrupar anomalias por categoria
            anomalies.forEach(anomaly => {
                const category = anomaly.category || 'Outros';
                if (!analysis.categories[category]) {
                    analysis.categories[category] = [];
                }
                analysis.categories[category].push(anomaly);
            });

            this.setCachedData(cacheKey, analysis);
            return analysis;

        } catch (error) {
            console.error('Erro ao obter análise de anomalias:', error);
            return { 
                totalAnomalies: 0, 
                highRisk: 0, 
                mediumRisk: 0, 
                lowRisk: 0, 
                categories: {}, 
                timeline: [] 
            };
        }
    }

    // 4. Análise de Performance vs Metas
    async getPerformanceAnalysis(year, month) {
        const cacheKey = `performance_${year}_${month}`;
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const [kpis, goals] = await Promise.all([
                this.makeRequest(`/api/kpis/monthly?year=${year}&month=${month}`),
                this.makeRequest('/api/expenses-goals')
            ]);

            const performance = {
                actual: kpis.totals?.total || 0,
                business: kpis.totals?.totalEmpresarial || 0,
                personal: kpis.totals?.totalPessoal || 0,
                projection: kpis.projecao?.projecao || 0,
                goals: goals,
                analysis: {}
            };

            // Calcular performance vs metas
            if (goals.totalGoal && goals.totalGoal > 0) {
                performance.analysis.totalVariance = performance.actual - goals.totalGoal;
                performance.analysis.totalVariancePercent = (performance.analysis.totalVariance / goals.totalGoal) * 100;
                performance.analysis.totalStatus = performance.analysis.totalVariancePercent <= 0 ? 'DENTRO_META' : 'ACIMA_META';
            }

            if (goals.businessGoal && goals.businessGoal > 0) {
                performance.analysis.businessVariance = performance.business - goals.businessGoal;
                performance.analysis.businessVariancePercent = (performance.analysis.businessVariance / goals.businessGoal) * 100;
                performance.analysis.businessStatus = performance.analysis.businessVariancePercent <= 0 ? 'DENTRO_META' : 'ACIMA_META';
            }

            // Projeção vs meta
            if (performance.projection > 0 && goals.totalGoal > 0) {
                performance.analysis.projectionRisk = performance.projection > goals.totalGoal ? 'ALTO' : 'BAIXO';
                performance.analysis.projectionVariance = performance.projection - goals.totalGoal;
            }

            this.setCachedData(cacheKey, performance);
            return performance;

        } catch (error) {
            console.error('Erro ao obter análise de performance:', error);
            return { actual: 0, business: 0, personal: 0, projection: 0, goals: {}, analysis: {} };
        }
    }

    // 5. Análise de Eficiência Operacional
    async getEfficiencyAnalysis(months = 3) {
        const cacheKey = `efficiency_${months}`;
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const currentDate = new Date();
            const efficiency = [];

            for (let i = months - 1; i >= 0; i--) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                const year = date.getFullYear();
                const month = date.getMonth() + 1;

                const kpis = await this.makeRequest(`/api/kpis/monthly?year=${year}&month=${month}`);
                
                if (kpis && kpis.eficiencia) {
                    efficiency.push({
                        period: `${year}-${month.toString().padStart(2, '0')}`,
                        businessDays: kpis.eficiencia.businessDaysInMonth || 0,
                        averageDailyCost: kpis.eficiencia.custoMedioDiaUtil || 0,
                        averageTicket: kpis.eficiencia.ticketMedioEmp || 0,
                        totalTransactions: kpis.totals?.despesas || 0,
                        totalAmount: kpis.totals?.totalEmpresarial || 0
                    });
                }
            }

            // Calcular métricas de eficiência
            const analysis = {
                periods: efficiency,
                trends: {},
                recommendations: []
            };

            if (efficiency.length >= 2) {
                const current = efficiency[efficiency.length - 1];
                const previous = efficiency[efficiency.length - 2];

                analysis.trends.dailyCostTrend = previous.averageDailyCost > 0 ? 
                    ((current.averageDailyCost - previous.averageDailyCost) / previous.averageDailyCost * 100) : 0;
                
                analysis.trends.ticketTrend = previous.averageTicket > 0 ? 
                    ((current.averageTicket - previous.averageTicket) / previous.averageTicket * 100) : 0;

                // Gerar recomendações
                if (analysis.trends.dailyCostTrend > 10) {
                    analysis.recommendations.push({
                        type: 'WARNING',
                        message: 'Custo médio diário aumentou significativamente. Revisar despesas operacionais.'
                    });
                }

                if (analysis.trends.ticketTrend > 15) {
                    analysis.recommendations.push({
                        type: 'WARNING',
                        message: 'Ticket médio das despesas aumentou. Verificar se há gastos não recorrentes.'
                    });
                }

                if (analysis.trends.dailyCostTrend < -5) {
                    analysis.recommendations.push({
                        type: 'SUCCESS',
                        message: 'Redução no custo médio diário. Boa gestão de custos!'
                    });
                }
            }

            this.setCachedData(cacheKey, analysis);
            return analysis;

        } catch (error) {
            console.error('Erro ao obter análise de eficiência:', error);
            return { periods: [], trends: {}, recommendations: [] };
        }
    }

    // 6. Dashboard Executivo Consolidado
    async getExecutiveDashboard(year, month) {
        const cacheKey = `executive_${year}_${month}`;
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const [
                trends,
                concentration,
                anomalies,
                performance,
                efficiency
            ] = await Promise.all([
                this.getTrendAnalysis(6),
                this.getConcentrationAnalysis(year, month),
                this.getAnomalyAnalysis(3),
                this.getPerformanceAnalysis(year, month),
                this.getEfficiencyAnalysis(3)
            ]);

            const dashboard = {
                period: { year, month },
                summary: {
                    totalSpent: performance.actual,
                    businessSpent: performance.business,
                    personalSpent: performance.personal,
                    projection: performance.projection,
                    monthlyTrend: trends.length >= 2 ? trends[trends.length - 1].totalChange : 0,
                    anomalyRisk: anomalies.highRisk + anomalies.mediumRisk > 0 ? 'HIGH' : 'LOW'
                },
                keyMetrics: {
                    concentration: {
                        hhi: concentration.hhi,
                        pareto80: concentration.pareto80Count,
                        totalPlans: concentration.planCount
                    },
                    efficiency: {
                        dailyCost: efficiency.periods[efficiency.periods.length - 1]?.averageDailyCost || 0,
                        ticketAverage: efficiency.periods[efficiency.periods.length - 1]?.averageTicket || 0,
                        trend: efficiency.trends.dailyCostTrend || 0
                    },
                    performance: {
                        goalStatus: performance.analysis.totalStatus || 'SEM_META',
                        variance: performance.analysis.totalVariancePercent || 0,
                        projectionRisk: performance.analysis.projectionRisk || 'BAIXO'
                    }
                },
                alerts: [
                    ...efficiency.recommendations,
                    ...(anomalies.highRisk > 0 ? [{
                        type: 'CRITICAL',
                        message: `${anomalies.highRisk} anomalia(s) de alto risco detectada(s)`
                    }] : []),
                    ...(performance.analysis.projectionRisk === 'ALTO' ? [{
                        type: 'WARNING',
                        message: 'Projeção indica possível estouro da meta mensal'
                    }] : [])
                ],
                trends,
                concentration,
                anomalies,
                efficiency
            };

            this.setCachedData(cacheKey, dashboard);
            return dashboard;

        } catch (error) {
            console.error('Erro ao obter dashboard executivo:', error);
            return {
                period: { year, month },
                summary: {},
                keyMetrics: {},
                alerts: [],
                trends: [],
                concentration: {},
                anomalies: {},
                efficiency: {}
            };
        }
    }

    // 7. Relatório de BI para Export
    generateBIReport(dashboardData) {
        const report = {
            metadata: {
                generatedAt: new Date().toISOString(),
                period: dashboardData.period,
                reportType: 'BUSINESS_INTELLIGENCE'
            },
            executiveSummary: {
                totalGasto: dashboardData.summary.totalSpent,
                crescimentoMensal: dashboardData.summary.monthlyTrend,
                statusMeta: dashboardData.keyMetrics.performance.goalStatus,
                riscoProjção: dashboardData.keyMetrics.performance.projectionRisk,
                concentração: {
                    hhi: dashboardData.keyMetrics.concentration.hhi,
                    pareto80Planos: dashboardData.keyMetrics.concentration.pareto80
                }
            },
            alertas: dashboardData.alerts,
            recomendações: this.generateRecommendations(dashboardData),
            anexos: {
                tendências: dashboardData.trends,
                concentração: dashboardData.concentration,
                anomalias: dashboardData.anomalies,
                eficiência: dashboardData.efficiency
            }
        };

        return report;
    }

    // 8. Gerador de Recomendações Inteligentes
    generateRecommendations(dashboardData) {
        const recommendations = [];

        // Recomendações baseadas em concentração
        if (dashboardData.keyMetrics.concentration.hhi > 0.25) {
            recommendations.push({
                category: 'DIVERSIFICAÇÃO',
                priority: 'HIGH',
                message: 'Alta concentração de gastos em poucos planos de contas. Considere diversificar.',
                action: 'Revisar distribuição de orçamento entre categorias'
            });
        }

        // Recomendações baseadas em tendência
        if (dashboardData.summary.monthlyTrend > 15) {
            recommendations.push({
                category: 'CONTROLE_GASTOS',
                priority: 'HIGH',
                message: 'Crescimento acelerado de gastos detectado.',
                action: 'Implementar controles mais rigorosos de aprovação'
            });
        }

        // Recomendações baseadas em eficiência
        if (dashboardData.keyMetrics.efficiency.trend > 10) {
            recommendations.push({
                category: 'EFICIÊNCIA',
                priority: 'MEDIUM',
                message: 'Custo médio diário aumentando. Revisar processos operacionais.',
                action: 'Auditar principais categorias de despesas'
            });
        }

        // Recomendações baseadas em anomalias
        if (dashboardData.anomalies.highRisk > 0) {
            recommendations.push({
                category: 'GOVERNANÇA',
                priority: 'CRITICAL',
                message: 'Anomalias de alto risco detectadas. Investigação imediata necessária.',
                action: 'Revisar transações flagradas como anômalas'
            });
        }

        return recommendations;
    }

    // 9. Limpeza de Cache
    clearCache() {
        this.cache.clear();
    }

    // 10. Métricas de Cache
    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }

    // 11. Geração de Relatório Mensal com Análise Completa
    async generateMonthlyReport(year, month, account = '') {
        try {
            console.log(`📊 Gerando relatório mensal: ${year}/${month} - Conta: ${account || 'Todas'}`);
            
            // Fazer request para o endpoint de relatório mensal
            const response = await fetch(`${this.apiBaseUrl}/api/reports/monthly`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
                },
                body: JSON.stringify({ year, month, account })
            });

            if (!response.ok) {
                await this.handleReportError(response);
                return false;
            }

            // Download do PDF
            const blob = await response.blob();
            this.downloadPDF(blob, `relatorio-mensal-${year}-${month}${account ? '-' + account : ''}.pdf`);
            
            console.log('✅ Relatório gerado com sucesso');
            return true;

        } catch (error) {
            console.error('❌ Erro ao gerar relatório:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
            throw error;
        }
    }

    // 12. Tratamento de erros específico para relatórios
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

    // 13. Download de PDF
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

    // 14. Sistema de notificações
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

    // 15. Análise de gastos por categoria
    async getCategoryAnalysis(year, month) {
        const cacheKey = `category_${year}_${month}`;
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const kpis = await this.makeRequest(`/api/kpis/monthly?year=${year}&month=${month}`);
            
            if (!kpis.distrib?.porPlano) {
                return { error: 'Dados insuficientes para análise por categoria' };
            }

            const categoryData = Object.entries(kpis.distrib.porPlano)
                .map(([category, amount]) => ({
                    category,
                    amount: parseFloat(amount),
                    percentage: 0
                }))
                .sort((a, b) => b.amount - a.amount);

            const total = categoryData.reduce((sum, item) => sum + item.amount, 0);
            
            // Calcular percentuais
            categoryData.forEach(item => {
                item.percentage = total > 0 ? (item.amount / total * 100) : 0;
            });

            const analysis = {
                total,
                categoryCount: categoryData.length,
                topCategories: categoryData.slice(0, 5),
                allCategories: categoryData,
                insights: this.generateCategoryInsights(categoryData, total)
            };

            this.setCachedData(cacheKey, analysis);
            return analysis;

        } catch (error) {
            console.error('Erro ao obter análise por categoria:', error);
            return { error: error.message };
        }
    }

    // 16. Gerar insights para categorias
    generateCategoryInsights(categoryData, total) {
        const insights = [];

        if (categoryData.length > 0) {
            const topCategory = categoryData[0];
            if (topCategory.percentage > 40) {
                insights.push({
                    type: 'warning',
                    message: `Categoria '${topCategory.category}' representa ${topCategory.percentage.toFixed(1)}% dos gastos. Alta concentração detectada.`
                });
            }

            const topThree = categoryData.slice(0, 3);
            const topThreePercentage = topThree.reduce((sum, item) => sum + item.percentage, 0);
            
            if (topThreePercentage > 70) {
                insights.push({
                    type: 'info',
                    message: `As 3 principais categorias representam ${topThreePercentage.toFixed(1)}% dos gastos totais.`
                });
            }

            if (categoryData.length > 10) {
                insights.push({
                    type: 'suggestion',
                    message: `${categoryData.length} categorias de gastos identificadas. Considere consolidar categorias menores.`
                });
            }
        }

        return insights;
    }

    // 17. Relatório comparativo entre períodos
    async generateComparativeReport(period1, period2) {
        try {
            console.log(`📈 Gerando relatório comparativo: ${period1.year}/${period1.month} vs ${period2.year}/${period2.month}`);
            
            const [analysis1, analysis2] = await Promise.all([
                this.getCategoryAnalysis(period1.year, period1.month),
                this.getCategoryAnalysis(period2.year, period2.month)
            ]);

            const comparison = {
                period1: { ...period1, analysis: analysis1 },
                period2: { ...period2, analysis: analysis2 },
                insights: this.generateComparativeInsights(analysis1, analysis2)
            };

            return comparison;

        } catch (error) {
            console.error('❌ Erro ao gerar relatório comparativo:', error);
            throw error;
        }
    }

    // 18. Gerar insights comparativos
    generateComparativeInsights(analysis1, analysis2) {
        const insights = [];

        if (analysis1.total && analysis2.total) {
            const variation = ((analysis1.total - analysis2.total) / analysis2.total) * 100;
            
            if (variation > 10) {
                insights.push({
                    type: 'warning',
                    message: `Aumento de ${variation.toFixed(1)}% nos gastos totais em relação ao período anterior.`
                });
            } else if (variation < -10) {
                insights.push({
                    type: 'success',
                    message: `Redução de ${Math.abs(variation).toFixed(1)}% nos gastos totais em relação ao período anterior.`
                });
            }
        }

        return insights;
    }
}

// Exportar classe para uso global
window.BusinessAnalytics = BusinessAnalytics;

// Instância global para uso imediato com configuração da API
window.biAnalytics = new BusinessAnalytics(window.API_BASE_URL || 'https://backend-production-a867.up.railway.app');

// Função global para geração de relatório mensal integrada
window.generateMonthlyReportWithBI = async function(year, month, account = '') {
    try {
        return await window.biAnalytics.generateMonthlyReport(year, month, account);
    } catch (error) {
        console.error('❌ Erro na geração do relatório mensal:', error);
        return false;
    }
};

// Função para análise completa de gastos mensais
window.getCompleteMonthlyAnalysis = async function(year, month) {
    try {
        const [
            dashboard,
            categoryAnalysis,
            trendAnalysis,
            performanceAnalysis
        ] = await Promise.all([
            window.biAnalytics.getExecutiveDashboard(year, month),
            window.biAnalytics.getCategoryAnalysis(year, month),
            window.biAnalytics.getTrendAnalysis(6),
            window.biAnalytics.getPerformanceAnalysis(year, month)
        ]);

        return {
            dashboard,
            categoryAnalysis,
            trendAnalysis,
            performanceAnalysis,
            summary: {
                totalGastos: dashboard.summary.totalSpent,
                crescimentoMensal: dashboard.summary.monthlyTrend,
                principalCategoria: categoryAnalysis.topCategories?.[0]?.category || 'N/A',
                alertas: dashboard.alerts.length
            }
        };
    } catch (error) {
        console.error('❌ Erro na análise completa mensal:', error);
        return null;
    }
};

// Função para relatório comparativo
window.generateComparativeAnalysis = async function(year1, month1, year2, month2) {
    try {
        return await window.biAnalytics.generateComparativeReport(
            { year: year1, month: month1 },
            { year: year2, month: month2 }
        );
    } catch (error) {
        console.error('❌ Erro na análise comparativa:', error);
        return null;
    }
};

// Integração com o dashboard existente - substituir função de relatório mensal
document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 Business Analytics module loaded successfully');
    
    // Verificar se existe função handleMonthlyReportDownload e melhorá-la
    if (typeof window.handleMonthlyReportDownload === 'function') {
        // Backup da função original
        window.originalHandleMonthlyReportDownload = window.handleMonthlyReportDownload;
        
        // Substituir por versão melhorada com BI
        window.handleMonthlyReportDownload = async function(e) {
            e.preventDefault();
            
            const year = document.getElementById('report-year')?.value;
            const month = document.getElementById('report-month')?.value;
            const account = document.getElementById('report-account')?.value || '';

            if (!year || !month) {
                window.biAnalytics.showNotification('📅 Selecione ano e mês para o relatório.', 'error');
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
                console.log('📊 Iniciando geração de relatório com análise BI...');
                
                // Gerar análise completa primeiro
                const analysis = await window.getCompleteMonthlyAnalysis(parseInt(year), parseInt(month));
                if (analysis) {
                    console.log('✅ Análise BI concluída:', analysis.summary);
                }
                
                // Gerar relatório PDF
                const success = await window.generateMonthlyReportWithBI(parseInt(year), parseInt(month), account);
                
                if (success) {
                    window.biAnalytics.showNotification('✅ Relatório gerado com análise BI completa!', 'success');
                }
                
            } catch (error) {
                console.error('❌ Erro no relatório mensal:', error);
                window.biAnalytics.showNotification(`❌ ${error.message}`, 'error');
            } finally {
                // Restaurar UI
                if (reportGenerateText) reportGenerateText.classList.remove('hidden');
                if (reportLoadingText) reportLoadingText.classList.add('hidden');
                if (submitButton) submitButton.disabled = false;
            }
        };
        
        console.log('🔄 Função de relatório mensal melhorada com BI integrado');
    }
    
    // Adicionar botões de análise BI se não existirem
    const dashboardContainer = document.querySelector('.dashboard-container');
    if (dashboardContainer && !document.querySelector('.bi-analysis-panel')) {
        const biPanel = document.createElement('div');
        biPanel.className = 'bi-analysis-panel bg-white p-4 rounded-lg shadow-md mt-4';
        biPanel.innerHTML = `
            <h3 class="text-lg font-semibold mb-3">📊 Análise Business Intelligence</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button onclick="showTrendAnalysis()" class="btn btn-primary bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    📈 Análise de Tendências
                </button>
                <button onclick="showCategoryAnalysis()" class="btn btn-secondary bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                    📋 Análise por Categoria
                </button>
                <button onclick="showComparativeAnalysis()" class="btn btn-success bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                    🔄 Análise Comparativa
                </button>
            </div>
        `;
        dashboardContainer.appendChild(biPanel);
    }
});

// Funções de análise para os botões
window.showTrendAnalysis = async function() {
    try {
        console.log('📈 Iniciando análise de tendências...');
        const trends = await window.biAnalytics.getTrendAnalysis(12);
        
        if (trends.length > 0) {
            const lastTrend = trends[trends.length - 1];
            const message = `📈 Tendência dos últimos 12 meses:\n\n` +
                          `Período atual: ${lastTrend.period}\n` +
                          `Total: R$ ${lastTrend.total.toFixed(2)}\n` +
                          `Variação: ${lastTrend.totalChange ? lastTrend.totalChange.toFixed(1) + '%' : 'N/A'}\n` +
                          `Empresarial: R$ ${lastTrend.business.toFixed(2)}\n` +
                          `Pessoal: R$ ${lastTrend.personal.toFixed(2)}`;
            
            window.biAnalytics.showNotification(message, 'info');
        } else {
            window.biAnalytics.showNotification('📊 Dados insuficientes para análise de tendências', 'warning');
        }
    } catch (error) {
        console.error('❌ Erro na análise de tendências:', error);
        window.biAnalytics.showNotification('❌ Erro ao carregar análise de tendências', 'error');
    }
};

window.showCategoryAnalysis = async function() {
    try {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        
        console.log(`📋 Iniciando análise por categoria: ${year}/${month}...`);
        const categoryAnalysis = await window.biAnalytics.getCategoryAnalysis(year, month);
        
        if (categoryAnalysis.topCategories && categoryAnalysis.topCategories.length > 0) {
            const top3 = categoryAnalysis.topCategories.slice(0, 3);
            const message = `📋 Top 3 categorias de ${year}/${month}:\n\n` +
                          top3.map((cat, index) => 
                              `${index + 1}. ${cat.category}: R$ ${cat.amount.toFixed(2)} (${cat.percentage.toFixed(1)}%)`
                          ).join('\n') +
                          `\n\nTotal: R$ ${categoryAnalysis.total.toFixed(2)}`;
            
            window.biAnalytics.showNotification(message, 'info');
        } else {
            window.biAnalytics.showNotification('📊 Dados insuficientes para análise por categoria', 'warning');
        }
    } catch (error) {
        console.error('❌ Erro na análise por categoria:', error);
        window.biAnalytics.showNotification('❌ Erro ao carregar análise por categoria', 'error');
    }
};

window.showComparativeAnalysis = async function() {
    try {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        
        // Comparar com mês anterior
        let previousYear = currentYear;
        let previousMonth = currentMonth - 1;
        
        if (previousMonth === 0) {
            previousMonth = 12;
            previousYear = currentYear - 1;
        }
        
        console.log(`🔄 Iniciando análise comparativa: ${currentYear}/${currentMonth} vs ${previousYear}/${previousMonth}...`);
        const comparison = await window.generateComparativeAnalysis(currentYear, currentMonth, previousYear, previousMonth);
        
        if (comparison) {
            const current = comparison.period1.analysis;
            const previous = comparison.period2.analysis;
            
            if (current.total && previous.total) {
                const variation = ((current.total - previous.total) / previous.total) * 100;
                const message = `🔄 Análise Comparativa:\n\n` +
                              `Período atual (${currentYear}/${currentMonth}): R$ ${current.total.toFixed(2)}\n` +
                              `Período anterior (${previousYear}/${previousMonth}): R$ ${previous.total.toFixed(2)}\n` +
                              `Variação: ${variation > 0 ? '+' : ''}${variation.toFixed(1)}%\n\n` +
                              `${variation > 0 ? '📈 Aumento' : '📉 Redução'} nos gastos`;
                
                window.biAnalytics.showNotification(message, variation > 10 ? 'warning' : 'info');
            } else {
                window.biAnalytics.showNotification('📊 Dados insuficientes para análise comparativa', 'warning');
            }
        }
    } catch (error) {
        console.error('❌ Erro na análise comparativa:', error);
        window.biAnalytics.showNotification('❌ Erro ao carregar análise comparativa', 'error');
    }
};

// Função de teste para verificar se o endpoint está funcionando
window.testMonthlyReportEndpoint = async function() {
    try {
        console.log('🧪 Testando endpoint de relatório mensal...');
        
        const response = await fetch(`${window.biAnalytics.apiBaseUrl}/api/reports/monthly`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: JSON.stringify({ year: 2025, month: 10, account: '' })
        });

        console.log(`📊 Status da resposta: ${response.status}`);
        
        if (response.ok) {
            console.log('✅ Endpoint funcionando corretamente!');
            window.biAnalytics.showNotification('✅ Teste do endpoint bem-sucedido! PDF seria baixado.', 'success');
            
            // Se é um PDF, mostrar informações sobre o conteúdo
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/pdf')) {
                console.log('📄 Resposta é um PDF válido');
                const blob = await response.blob();
                console.log(`📦 Tamanho do PDF: ${blob.size} bytes`);
                window.biAnalytics.showNotification(`✅ PDF gerado com sucesso! Tamanho: ${(blob.size / 1024).toFixed(2)} KB`, 'success');
            }
        } else {
            const errorText = await response.text();
            console.error('❌ Erro no endpoint:', errorText);
            
            try {
                const errorData = JSON.parse(errorText);
                let errorMsg = `❌ Erro ${response.status}: ${errorData.message || errorText}`;
                if (errorData.details) {
                    errorMsg += `\n📋 Detalhes: ${errorData.details}`;
                }
                window.biAnalytics.showNotification(errorMsg, 'error');
            } catch {
                window.biAnalytics.showNotification(`❌ Erro ${response.status}: ${errorText}`, 'error');
            }
        }
        
        return response.ok;
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        window.biAnalytics.showNotification(`❌ Erro de conexão: ${error.message}`, 'error');
        return false;
    }
};

console.log('📊 Business Analytics v2.0 - Sistema de relatórios mensais integrado com BI');
