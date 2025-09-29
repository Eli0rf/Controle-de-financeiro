// FunÃ§Ã£o para gerar grÃ¡ficos modernos e estÃ©ticos para o PDF
async function generateChartsForPDF(porPlano, porConta, expenses, chartJSNodeCanvas) {
    const charts = {};
    
    try {
        // Verificar se chartJSNodeCanvas estÃ¡ disponÃ­vel
        if (!chartJSNodeCanvas) {
            console.log('âš ï¸ ChartJS nÃ£o disponÃ­vel - retornando charts vazios');
            return charts;
        }
        
        // ConfiguraÃ§Ãµes globais para charts modernos
        const modernColors = {
            primary: ['#3B82F6', '#1E40AF', '#1D4ED8', '#2563EB', '#60A5FA'],
            success: ['#10B981', '#059669', '#047857', '#065F46', '#34D399'],
            warning: ['#F59E0B', '#D97706', '#B45309', '#92400E', '#FBBF24'],
            danger: ['#EF4444', '#DC2626', '#B91C1C', '#991B1B', '#F87171'],
            purple: ['#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#A78BFA'],
            gradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe']
        };

        // 1. ðŸ“Š GRÃFICO DE PIZZA MODERNO - DistribuiÃ§Ã£o por Plano de Conta
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
                            text: ['ðŸ“Š DISTRIBUIÃ‡ÃƒO POR PLANO DE CONTA', `ðŸ’° Total: R$ ${total.toFixed(2)}`],
                            font: { size: 18, weight: 'bold' },
                            color: '#1F2937',
                            padding: { top: 10, bottom: 20 }
                        }
                    }
                }
            };
            charts.planChart = await chartJSNodeCanvas.renderToBuffer(planConfig);
        }

        // 2. ðŸ“ˆ GRÃFICO DE BARRAS HORIZONTAIS - Top 10 Categorias
        const accountLabels = Object.keys(porConta);
        const accountValues = Object.values(porConta);
        
        if (accountLabels.length > 0) {
            const accountData = accountLabels.map((label, index) => ({
                label: label.length > 20 ? label.substring(0, 17) + '...' : label,
                value: accountValues[index]
            })).sort((a, b) => b.value - a.value).slice(0, 10); // Top 10

            const accountConfig = {
                type: 'bar',
                data: {
                    labels: accountData.map(item => item.label),
                    datasets: [{
                        label: 'Gastos por Conta (R$)',
                        data: accountData.map(item => item.value),
                        backgroundColor: accountData.map((_, i) => 
                            modernColors.gradient[i % modernColors.gradient.length]
                        ),
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false
                    }]
                },
                options: {
                    indexAxis: 'y', // Barras horizontais
                    responsive: false,
                    maintainAspectRatio: false,
                    layout: { padding: 20 },
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: 'ðŸ† TOP 10 CATEGORIAS DE GASTOS',
                            font: { size: 18, weight: 'bold' },
                            color: '#1F2937',
                            padding: { top: 10, bottom: 20 }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            grid: { color: '#E5E7EB' },
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value.toFixed(0);
                                },
                                font: { size: 11 },
                                color: '#6B7280'
                            }
                        },
                        y: {
                            grid: { display: false },
                            ticks: {
                                font: { size: 11, weight: 'bold' },
                                color: '#374151'
                            }
                        }
                    }
                }
            };
            charts.accountChart = await chartJSNodeCanvas.renderToBuffer(accountConfig);
        }

        // 3. ðŸ¥§ GRÃFICO DE COMPARAÃ‡ÃƒO - Pessoal vs Empresarial
        const totalPessoal = expenses.filter(e => !e.is_business_expense).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const totalEmpresarial = expenses.filter(e => e.is_business_expense).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        
        if (totalPessoal > 0 || totalEmpresarial > 0) {
            const comparisonConfig = {
                type: 'pie',
                data: {
                    labels: ['ðŸ  Pessoal', 'ðŸ’¼ Empresarial'],
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
                            text: 'ðŸ’¼ DIVISÃƒO: PESSOAL vs EMPRESARIAL',
                            font: { size: 18, weight: 'bold' },
                            color: '#1F2937',
                            padding: { top: 10, bottom: 20 }
                        }
                    }
                }
            };
            charts.comparisonChart = await chartJSNodeCanvas.renderToBuffer(comparisonConfig);
        }

        // 4. ðŸ“ˆ GRÃFICO DE LINHA - EvoluÃ§Ã£o DiÃ¡ria dos Gastos
        const dailyData = {};
        expenses.forEach(e => {
            const day = new Date(e.transaction_date).getDate();
            dailyData[day] = (dailyData[day] || 0) + parseFloat(e.amount || 0);
        });

        const days = Object.keys(dailyData).map(Number).sort((a, b) => a - b);
        if (days.length > 2) {
            // Calcular mÃ©dia mÃ³vel de 3 dias
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
                            label: 'Gastos DiÃ¡rios',
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
                            label: 'MÃ©dia MÃ³vel',
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
                            text: 'ðŸ“ˆ EVOLUÃ‡ÃƒO DIÃRIA DOS GASTOS',
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

        // 5. ðŸ“Š GRÃFICO DE BARRAS EMPILHADAS - Comparativo Semanal
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
                            label: 'ðŸ  Pessoal',
                            data: weeks.map(week => weeklyData.personal[week] || 0),
                            backgroundColor: '#10B981',
                            borderColor: '#ffffff',
                            borderWidth: 2
                        },
                        {
                            label: 'ðŸ’¼ Empresarial',
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
                            text: 'ðŸ“… COMPARATIVO SEMANAL: PESSOAL vs EMPRESARIAL',
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

        console.log(`âœ… GrÃ¡ficos modernos gerados: ${Object.keys(charts).length} charts`);

    } catch (error) {
        console.error('Erro ao gerar grÃ¡ficos para PDF:', error);
    }
    
    return charts;
}
