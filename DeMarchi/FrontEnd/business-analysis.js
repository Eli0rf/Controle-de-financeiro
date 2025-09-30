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
        const token = localStorage.getItem('token');
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
}

// Exportar classe para uso global
window.BusinessAnalytics = BusinessAnalytics;

// Instância global para uso imediato
window.biAnalytics = new BusinessAnalytics();

console.log('📊 Business Analytics module loaded successfully');
