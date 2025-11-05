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
require('dotenv').config();

// --- 2. CONFIGURAÇÕES PRINCIPAIS ---
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '1mb' }));

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
// Chart of accounts config
const accountsConfig = require('./config/accounts');
const kpiThresholds = require('./config/kpiThresholds');

// Definição dos períodos de faturamento por conta
const billingPeriods = {
    'Nu Bank Ketlyn': { startDay: 2, endDay: 1 },
    'Nu Vainer': { startDay: 2, endDay: 1 },
    // Ourocard agora segue mês civil (1 até último dia) – usar isRecurring para cair na lógica padrão
    'Ourocard Ketlyn': { startDay: 1, endDay: 30, isRecurring: true },
    'PicPay Vainer': { startDay: 1, endDay: 30 },
    'PIX/Boleto': { startDay: 1, endDay: 30, isRecurring: true }
};

// Fallback simples de PDF (usado quando BI falha)
// Utilitário global para fonte principal Unicode
let globalPrimaryFontPath = null;
function ensurePrimaryFont(){
    if(!globalPrimaryFontPath){
        const fp = path.join(__dirname,'fonts','NotoSans-Regular.ttf');
        if(fs.existsSync(fp)) globalPrimaryFontPath = fp; else globalPrimaryFontPath = null;
    }
    return globalPrimaryFontPath;
}

async function generateSimplePDF(expenses, total, startDate, endDate, contaNome, year, month, opts={}){
    const doc = new pdfkit({ margin: 35, size: 'A4' });
    try { const f=ensurePrimaryFont(); if(f){ doc.registerFont('NotoSans', f); doc.font('NotoSans'); } } catch(e){ /* ignore */ }
    // Paleta de cores acessível (inspirada em Okabe–Ito + Tailwind)
    const palette = {
        bg: '#FFFFFF',
        text: '#1F2937',           // slate-800
        textMuted: '#475569',      // slate-600
        textSoft: '#64748B',       // slate-500
        textStrong: '#0F172A',     // slate-900
        border: '#E5E7EB',         // gray-200
        surface: '#F8FAFC',        // slate-50
        surfaceAlt: '#EEF2FF',     // indigo-50
        primary: '#1D4ED8',        // blue-700
        secondary: '#0EA5E9',      // sky-500
        success: '#16A34A',        // green-600
        warning: '#F59E0B',        // amber-500
        danger: '#DC2626',         // red-600
        info: '#6366F1',           // indigo-500
        accentLine: '#CBD5E1'      // slate-300
    };
    // Página atual para numerador
    let pageIndex = 1;
    const drawPageNumber = () => {
        doc.fontSize(10).fillColor('#E2E8F0').text(`Página ${pageIndex}`,
            doc.page.width - 90, 20, { width: 80, align: 'right' });
    };
    const sectionTitle = (text, y = 50) => {
        doc.fontSize(16).fillColor(palette.textStrong).text(text, 40, y);
        doc.moveTo(40, y + 18).lineTo(doc.page.width - 40, y + 18).stroke(palette.accentLine);
    };
    const newPageWithTitle = (text) => {
        doc.addPage();
        pageIndex += 1;
        // Cabeçalho leve com número da página
        doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`,
            doc.page.width - 90, 20, { width: 80, align: 'right' });
        sectionTitle(text, 50);
    };
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const totalPessoal = safeExpenses.filter(e=>!e.is_business_expense).reduce((s,e)=>s+parseFloat(e.amount||0),0);
    const totalEmp = safeExpenses.filter(e=>e.is_business_expense).reduce((s,e)=>s+parseFloat(e.amount||0),0);
    const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    // Mapas centrais de planos
    const planMaps = (accountsConfig && accountsConfig.asMaps) ? accountsConfig.asMaps() : { names:{}, budgets:{}, types:{}, descriptions:{} };
    const planNames = (opts.names) || planMaps.names || {};
    const planBudgets = (opts.budgets) || planMaps.budgets || {}; // fallback automático
    const planTypes = planMaps.types || {};
    const planDescriptions = (opts.descriptions) || planMaps.descriptions || {};
    const planDisplay = (code)=>{
        if (code==null || code==='') return 'Sem Plano';
        const id = Number(code);
        return planNames[id] || `Plano ${id}`;
    };
    try {
        // Capa / Header
    const grad = doc.linearGradient(0,0,0,140); grad.stop(0,'#0F172A').stop(1,'#0EA5E9');
        doc.rect(0,0,doc.page.width,140).fill(grad);
        doc.fillColor('#FFFFFF').fontSize(26).text('RELATÓRIO FINANCEIRO MENSAL',40,40,{width:doc.page.width-80});
    doc.fontSize(13).fillColor('#E2E8F0').text(`${monthNames[month-1]}/${year} • ${contaNome}`,40,90);
    doc.fontSize(10).fillColor('#94A3B8').text(`Gerado em ${new Date().toLocaleString('pt-BR')}`,40,108);
    drawPageNumber();

        doc.moveDown();
        doc.y = 155;
        // Resumo Geral (cards)
        const cardW = (doc.page.width-80)/3; const y0 = doc.y; const cardH=90;
        function card(x,color,title,value,sub){
            // Cartão com cor sólida acessível
            doc.roundedRect(x,y0,cardW,cardH,10).fill(color);
            doc.fillColor('#FFFFFF').fontSize(12).text(title,x+12,y0+14,{width:cardW-24});
            doc.fontSize(20).text(value,x+12,y0+38,{width:cardW-24});
            doc.fontSize(10).fillColor('#E5E7EB').text(sub,x+12,y0+64,{width:cardW-24});
        }
        const totalFmt = `R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
        card(40, palette.primary,'💰 Total Geral', totalFmt, `${safeExpenses.length} transações`);
        card(40+cardW+10, palette.success,'🏠 Pessoal', `R$ ${totalPessoal.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, `${total>0?(totalPessoal/total*100).toFixed(1):0}% do total`);
        card(40+2*(cardW+10), palette.warning,'💼 Empresarial', `R$ ${totalEmp.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, `${total>0?(totalEmp/total*100).toFixed(1):0}% do total`);
        doc.y = y0 + cardH + 18;

        // Checklist do Conteúdo (explícito conforme solicitado)
    doc.fontSize(13).fillColor(palette.textStrong).text('📊 O que será incluído no relatório:',40,doc.y); doc.moveDown(0.3);
        const checklist = [
            '✅ Resumo geral de gastos (Pessoal vs Empresarial)',
            '✅ 🥧 Distribuição por Plano de Conta (Pizza)',
            '✅ 📊 Gastos por Conta (Barras)',
            '✅ 🍩 Comparação Pessoal vs Empresarial (Rosquinha)',
            '✅ 📈 Evolução diária de gastos (Linha)',
            '✅ Gastos detalhados por plano de conta',
            '✅ 🎯 Análise de limites vs gastos por plano',
            '✅ Comparativo com tetos configurados',
            '✅ Alertas de planos que ultrapassaram limites',
            '✅ Recomendações baseadas na utilização',
            '✅ Gastos por conta bancária',
            '✅ Detalhamento de gastos empresariais',
            '✅ Lista completa de todas as despesas do período'
        ];
    doc.fontSize(9).fillColor(palette.textSoft);
        checklist.forEach(item=>{ if(doc.y>doc.page.height-70){ doc.addPage(); } doc.text(item,50,doc.y,{width:doc.page.width-100}); doc.moveDown(0.3); });

        // Divisão por Plano de Conta — Pessoal e Empresarial (antes dos gráficos)
        const byPlanPersonal = {}; const byPlanBusiness = {};
        safeExpenses.forEach(e=>{
            const p=(e.account_plan_code!=null && e.account_plan_code!=='')? String(e.account_plan_code) : 'Sem Plano';
            const val = parseFloat(e.amount||0);
            if(e.is_business_expense) byPlanBusiness[p]=(byPlanBusiness[p]||0)+val; else byPlanPersonal[p]=(byPlanPersonal[p]||0)+val;
        });

        // Seção Pessoal
        newPageWithTitle('🏠 Análise por Plano de Conta — Pessoal');
        let tyP = 80; doc.fontSize(9).fillColor('#374151');
        const totalPersonalType = Object.values(byPlanPersonal).reduce((a,b)=>a+b,0);
        // Cabeçalho
        doc.rect(40,tyP-4, doc.page.width-80,16).fill(palette.surface);
        doc.fillColor(palette.text).text('Plano',40,tyP); doc.text('Valor (R$)',200,tyP,{align:'right',width:120}); doc.text('%',330,tyP,{align:'right',width:40}); doc.text('Teto',380,tyP,{align:'right',width:80}); doc.text('Uso',470,tyP,{align:'left',width:60});
        doc.moveTo(40,tyP+12).lineTo(doc.page.width-40,tyP+12).stroke(palette.border); tyP+=18;
        let rowP = 0;
        Object.entries(byPlanPersonal).sort((a,b)=>b[1]-a[1]).forEach(([p,v])=>{
            if(tyP>doc.page.height-70){ doc.addPage(); pageIndex+=1; doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`, doc.page.width-90, 20, { width: 80, align:'right' }); doc.fontSize(14).fillColor(palette.text).text('🏠 Análise por Plano de Conta — Pessoal (cont.)',40,60); tyP=80; doc.fontSize(9).fillColor('#374151'); }
            const pct = totalPersonalType>0? (v/totalPersonalType*100) : 0;
            const code = p==='Sem Plano'? null : Number(p);
            const teto = code? (planBudgets[code]||0) : 0;
            const usedPct = teto>0? (v/teto*100) : 0;
            const bg = (rowP++ % 2===0)? palette.surface:'#FFFFFF';
            doc.rect(40,tyP-4, doc.page.width-80,20).fill(bg);
            doc.fillColor(palette.text).fontSize(9).text(planDisplay(p),45,tyP);
            doc.text(v.toLocaleString('pt-BR',{minimumFractionDigits:2}),200,tyP,{width:120,align:'right'});
            doc.text(pct.toFixed(1)+'%',330,tyP,{width:40,align:'right'});
            doc.text(teto>0? teto.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—',380,tyP,{width:80,align:'right'});
            // Barra de uso
            const barW = doc.page.width - 520; const used = Math.min(1, usedPct/100);
            doc.rect(470,tyP+10,barW,6).fill(palette.border);
            doc.rect(470,tyP+10,Math.max(4,barW*used),6).fill(usedPct>100?palette.danger:usedPct>=90?palette.warning:usedPct>=70?palette.secondary:palette.success);
            // Rótulo percentual ao lado da barra
            const pctTextX = Math.min(doc.page.width - 70, 470 + barW + 8);
            doc.fillColor(palette.textMuted).fontSize(9).text(`${Math.round(usedPct)}%`, pctTextX, tyP+7, { width: 40, align:'left' });
            tyP+=20;
        });

        // Seção Empresarial
        newPageWithTitle('💼 Análise por Plano de Conta — Empresarial');
        let tyB = 80; doc.fontSize(9).fillColor('#374151');
        const totalBusinessType = Object.values(byPlanBusiness).reduce((a,b)=>a+b,0);
        // Cabeçalho
        doc.rect(40,tyB-4, doc.page.width-80,16).fill(palette.surface);
        doc.fillColor(palette.text).text('Plano',40,tyB); doc.text('Valor (R$)',200,tyB,{align:'right',width:120}); doc.text('%',330,tyB,{align:'right',width:40}); doc.text('Teto',380,tyB,{align:'right',width:80}); doc.text('Uso',470,tyB,{align:'left',width:60});
        doc.moveTo(40,tyB+12).lineTo(doc.page.width-40,tyB+12).stroke(palette.border); tyB+=18;
        let rowB = 0;
        Object.entries(byPlanBusiness).sort((a,b)=>b[1]-a[1]).forEach(([p,v])=>{
            if(tyB>doc.page.height-70){ doc.addPage(); pageIndex+=1; doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`, doc.page.width-90, 20, { width: 80, align:'right' }); doc.fontSize(14).fillColor(palette.text).text('💼 Análise por Plano de Conta — Empresarial (cont.)',40,60); tyB=80; doc.fontSize(9).fillColor('#374151'); }
            const pct = totalBusinessType>0? (v/totalBusinessType*100) : 0;
            const code = p==='Sem Plano'? null : Number(p);
            const teto = code? (planBudgets[code]||0) : 0;
            const usedPct = teto>0? (v/teto*100) : 0;
            const bg = (rowB++ % 2===0)? palette.surface:'#FFFFFF';
            doc.rect(40,tyB-4, doc.page.width-80,20).fill(bg);
            doc.fillColor(palette.text).fontSize(9).text(planDisplay(p),45,tyB);
            doc.text(v.toLocaleString('pt-BR',{minimumFractionDigits:2}),200,tyB,{width:120,align:'right'});
            doc.text(pct.toFixed(1)+'%',330,tyB,{width:40,align:'right'});
            doc.text(teto>0? teto.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—',380,tyB,{width:80,align:'right'});
            // Barra de uso
            const barWB = doc.page.width - 520; const usedB = Math.min(1, usedPct/100);
            doc.rect(470,tyB+10,barWB,6).fill(palette.border);
            doc.rect(470,tyB+10,Math.max(4,barWB*usedB),6).fill(usedPct>100?palette.danger:usedPct>=90?palette.warning:usedPct>=70?palette.secondary:palette.success);
            const pctTextXB = Math.min(doc.page.width - 70, 470 + barWB + 8);
            doc.fillColor(palette.textMuted).fontSize(9).text(`${Math.round(usedPct)}%`, pctTextXB, tyB+7, { width: 40, align:'left' });
            tyB+=20;
        });

        // Página de Gráficos
    const byPlan = {}; safeExpenses.forEach(e=>{ const p=(e.account_plan_code!=null && e.account_plan_code!=='')? String(e.account_plan_code) : 'Sem Plano'; byPlan[p]=(byPlan[p]||0)+parseFloat(e.amount||0); });
        const byAccount={}; safeExpenses.forEach(e=>{const c=e.account||'Sem Conta'; byAccount[c]=(byAccount[c]||0)+parseFloat(e.amount||0);});
        const byDay={}; safeExpenses.forEach(e=>{ const d=new Date(e.transaction_date); const key = d.toISOString().slice(0,10); byDay[key]=(byDay[key]||0)+parseFloat(e.amount||0); });
        if(opts.enableCharts!==false){
            newPageWithTitle('📊 Visão Gráfica');
            try {
                const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
                const width=480, height=260; const chart = new ChartJSNodeCanvas({width,height,backgroundColour:'#FFFFFF'});

                // Plugin de rótulos de valor com melhor contraste e anti-sobreposição
                const valueLabelPlugin = {
                    id: 'valueLabels',
                    afterDatasetsDraw(ch){
                        const { ctx } = ch; ctx.save();
                        const placed = [];
                        const minDist = 14; // pixels
                        const isTooClose = (x,y) => placed.some(p => Math.hypot(p.x-x, p.y-y) < minDist);

                        ch.data.datasets.forEach((ds, di) => {
                            const meta = ch.getDatasetMeta(di);
                            meta.data.forEach((el, idx) => {
                                if (!el || !el.x || !el.y) return;
                                const raw = ds.data[idx];
                                const val = typeof raw === 'number' ? raw : (parseFloat(raw) || 0);
                                let labelText;

                                if (ch.config.type === 'pie' || ch.config.type === 'doughnut') {
                                    const tot = ds.data.reduce((a,b)=> a + (typeof b==='number'?b:(parseFloat(b)||0)), 0) || 1;
                                    const pctNum = (val / tot) * 100;
                                    if (pctNum < 5) return; // esconde fatias pequenas
                                    labelText = pctNum.toFixed(0) + '%';
                                } else if (ch.config.type === 'bar') {
                                    // Mostra rótulo apenas se a barra for razoável para evitar poluição visual
                                    const size = el.getProps(['y','base'], true);
                                    const height = Math.abs(size.base - size.y);
                                    if (height < 18) return;
                                    labelText = val >= 1000 ? (val/1000).toFixed(1)+'k' : val.toFixed(0);
                                } else if (ch.config.type === 'line') {
                                    if (idx !== ds.data.length - 1) return; // apenas último ponto
                                    labelText = val.toFixed(0);
                                } else return;

                                ctx.font = '11px sans-serif';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                const p = el.tooltipPosition();
                                const tx = p.x;
                                const ty = p.y - (ch.config.type === 'bar' ? 10 : 0);
                                if (isTooClose(tx, ty)) return; // evita sobrepor com rótulo anterior

                                // Caixa de fundo translúcida para contraste
                                const metrics = ctx.measureText(labelText);
                                const tw = Math.max(12, metrics.width);
                                const th = 12;
                                const pad = 2;
                                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                                ctx.beginPath();
                                ctx.rect(tx - tw/2 - pad, ty - th/2 - pad, tw + pad*2, th + pad*2);
                                ctx.fill();

                                // Texto escuro sobre a caixa clara
                                ctx.fillStyle = '#111827';
                                ctx.fillText(labelText, tx, ty);

                                placed.push({ x: tx, y: ty });
                            });
                        });
                        ctx.restore();
                    }
                };

                // Pie Plano (sem "top", todos os planos)
                const sortedPlans = Object.entries(byPlan).sort((a,b)=>b[1]-a[1]);
                const pieLabels = sortedPlans.map(([code])=> planDisplay(code));
                const pieValues = sortedPlans.map(([,val])=> val);
                const manyPlansForPie = pieLabels.length > (opts.maxLegendItems || 12);
                const showLegendPie = !(opts.legendSummary && manyPlansForPie);
                const pieCfg={
                    type:'pie',
                    data:{labels:pieLabels,datasets:[{data:pieValues,backgroundColor:['#56B4E9','#E69F00','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#999999']} ]},
                    options:{plugins:{legend:{display:showLegendPie,position:'bottom',labels:{boxWidth:12,font:{size:9}}},tooltip:{enabled:true}}},
                    plugins:[valueLabelPlugin]
                };
                const pieImg = await chart.renderToBuffer(pieCfg);
                doc.image(pieImg,40,80,{width:230}); doc.fontSize(10).fillColor('#334155').text('🥧 Distribuição por Plano',40,80+height+4,{width:230,align:'center'});

                // Bar Conta (sem "top", todas as contas)
                const sortedAcc = Object.entries(byAccount).sort((a,b)=>b[1]-a[1]);
                const barCfg={
                    type:'bar',
                    data:{labels:sortedAcc.map(x=>x[0]),datasets:[{label:'Gasto (R$)',data:sortedAcc.map(x=>x[1]),backgroundColor:'#0072B2'}]},
                    options:{plugins:{legend:{display:true,position:'bottom',labels:{font:{size:9}}},tooltip:{enabled:true}},scales:{x:{ticks:{display:false}},y:{display:false}}},
                    plugins:[valueLabelPlugin]
                };
                const barImg = await chart.renderToBuffer(barCfg); doc.image(barImg,300,80,{width:230}); doc.fontSize(10).fillColor('#334155').text('📊 Gastos por Conta',300,80+height+4,{width:230,align:'center'});

                // Donut Pessoal vs Empresarial
                const donutCfg={
                    type:'doughnut',
                    data:{labels:['Pessoal','Empresarial'],datasets:[{data:[totalPessoal,totalEmp],backgroundColor:['#009E73','#E69F00']} ]},
                    options:{plugins:{legend:{display:true,position:'bottom',labels:{font:{size:9}}},tooltip:{enabled:true}},cutout:'55%'},
                    plugins:[valueLabelPlugin]
                };
                const donutImg = await chart.renderToBuffer(donutCfg); doc.image(donutImg,40,400,{width:230}); doc.fontSize(10).fillColor('#334155').text('🍩 Pessoal vs Empresarial',40,400+height+4,{width:230,align:'center'});

                // Line Evolução diária
                const daysSorted = Object.keys(byDay).sort(); const dailyValues = daysSorted.map(d=> byDay[d]);
                const lineCfg={
                    type:'line',
                    data:{labels:daysSorted.map(d=>d.slice(8,10)),datasets:[{label:'Dia',data:dailyValues,borderColor:'#56B4E9',pointBackgroundColor:'#56B4E9',pointRadius:3,backgroundColor:'rgba(86,180,233,0.25)',tension:0.3,fill:true}]},
                    options:{plugins:{legend:{display:true,position:'bottom',labels:{font:{size:9}}},tooltip:{enabled:true}},scales:{x:{display:false},y:{display:false}}},
                    plugins:[valueLabelPlugin]
                };
                const lineImg = await chart.renderToBuffer(lineCfg); doc.image(lineImg,300,400,{width:230}); doc.fontSize(10).fillColor('#334155').text('📈 Evolução Diária',300,400+height+4,{width:230,align:'center'});

                // Nova página: Pessoal x Empresarial por Plano de Conta
                newPageWithTitle('📊 Gastos por Plano de Conta — Pessoal/Empresarial');

                // Pessoal por Plano (Pizza)
                const sortedPersPlans = Object.entries(byPlanPersonal).sort((a,b)=>b[1]-a[1]);
                if (sortedPersPlans.length > 0) {
                    const persLabels = sortedPersPlans.map(([code])=> planDisplay(code));
                    const persValues = sortedPersPlans.map(([,val])=> val);
                    const manyPers = persLabels.length > (opts.maxLegendItems || 12);
                    const showLegendPers = !(opts.legendSummary && manyPers);
                    const piePersCfg = {
                        type: 'pie',
                        data: { labels: persLabels, datasets: [{ data: persValues, backgroundColor: ['#56B4E9','#E69F00','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#999999'] }] },
                        options: { plugins: { legend: { display: showLegendPers, position: 'bottom', labels: { boxWidth: 12, font: { size: 9 } } }, tooltip: { enabled: true } } },
                        plugins: [valueLabelPlugin]
                    };
                    const piePersImg = await chart.renderToBuffer(piePersCfg);
                    doc.image(piePersImg,40,80,{width:230});
                    doc.fontSize(10).fillColor('#334155').text('🏠 Pessoal — Distribuição por Plano',40,80+height+4,{width:230,align:'center'});
                } else {
                    doc.fontSize(11).fillColor('#334155').text('Sem dados pessoais para exibir.', 40, 90, { width: 230, align: 'center' });
                }

                // Empresarial por Plano (Pizza)
                const sortedBizPlans = Object.entries(byPlanBusiness).sort((a,b)=>b[1]-a[1]);
                if (sortedBizPlans.length > 0) {
                    const bizLabels = sortedBizPlans.map(([code])=> planDisplay(code));
                    const bizValues = sortedBizPlans.map(([,val])=> val);
                    const manyBiz = bizLabels.length > (opts.maxLegendItems || 12);
                    const showLegendBiz = !(opts.legendSummary && manyBiz);
                    const pieBizCfg = {
                        type: 'pie',
                        data: { labels: bizLabels, datasets: [{ data: bizValues, backgroundColor: ['#009E73','#E69F00','#56B4E9','#F0E442','#0072B2','#D55E00','#CC79A7','#999999'] }] },
                        options: { plugins: { legend: { display: showLegendBiz, position: 'bottom', labels: { boxWidth: 12, font: { size: 9 } } }, tooltip: { enabled: true } } },
                        plugins: [valueLabelPlugin]
                    };
                    const pieBizImg = await chart.renderToBuffer(pieBizCfg);
                    doc.image(pieBizImg,300,80,{width:230});
                    doc.fontSize(10).fillColor('#334155').text('💼 Empresarial — Distribuição por Plano',300,80+height+4,{width:230,align:'center'});
                } else {
                    doc.fontSize(11).fillColor('#334155').text('Sem dados empresariais para exibir.', 300, 90, { width: 230, align: 'center' });
                }
            } catch(chartErr){ doc.fontSize(10).fillColor('#DC2626').text('Falha ao gerar gráficos (fallback textual).',40,80); }
        }

        // Distribuição por Plano (tabela resumida)
        newPageWithTitle('🥧 Distribuição por Plano de Conta');
        const sortedPlans2 = Object.entries(byPlan).sort((a,b)=>b[1]-a[1]);
        doc.moveDown(0.5); doc.fontSize(9).fillColor(palette.textMuted);
        let ty = doc.y; doc.text('Plano',40,ty); doc.text('Valor (R$)',240,ty,{align:'right',width:120}); doc.text('%',380,ty,{align:'right',width:50});
        doc.moveTo(40,ty+12).lineTo(doc.page.width-40,ty+12).stroke(palette.border); ty+=18;
        sortedPlans2.forEach(([p,v],i)=>{ const pct = total>0?(v/total*100).toFixed(1):'0.0'; if(ty>doc.page.height-80){ doc.addPage(); ty=60; }
            const bg = i%2===0?palette.surface:'#FFFFFF'; doc.rect(40,ty-4, doc.page.width-80,16).fill(bg);
            doc.fillColor(palette.text).fontSize(9).text(planDisplay(p),45,ty); doc.text(v.toLocaleString('pt-BR',{minimumFractionDigits:2}),240,ty,{width:120,align:'right'}); doc.text(pct+'%',380,ty,{width:50,align:'right'}); ty+=18; });
        doc.y = ty + 10;

        // Limites vs Gastos
        if (planBudgets && Object.keys(planBudgets).length) {
            newPageWithTitle('🎯 Análise de Limites vs Gastos / Comparativo Tetos'); doc.moveDown(0.5);
            const perPlan = sortedPlans2; // todos os planos
            let ly = doc.y;
            perPlan.forEach(([p,v])=>{ const code = p==='Sem Plano'? null : Number(p); const teto = code ? (planBudgets[code]||0) : 0; const pct = teto>0?(v/teto*100):0; if(ly>doc.page.height-70){ doc.addPage(); pageIndex+=1; doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`, doc.page.width-90, 20, { width: 80, align:'right' }); ly=60; }
                const label = planDisplay(p);
                doc.fontSize(9).fillColor('#111827').text(`${label}: R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})} / Teto R$ ${teto.toLocaleString('pt-BR',{minimumFractionDigits:2})} (${pct.toFixed(1)}%)`,40,ly,{width:doc.page.width-80});
                const barW = doc.page.width-160; const used = Math.min(1,pct/100); doc.rect(40,ly+12,barW,6).fill(palette.border); doc.rect(40,ly+12,Math.max(4,barW*used),6).fill(pct>100?palette.danger:pct>=90?palette.warning:pct>=70?palette.secondary:palette.success);
                doc.fillColor(palette.textMuted).fontSize(9).text(`${pct.toFixed(0)}%`, 40+barW+8, ly+9, { width: 40, align:'left' });
                ly+=24; });
            doc.y = ly + 5;
            // Limites Monitorados (detalhado, sem "top")
            newPageWithTitle('🎯 Limites Monitorados (detalhado):');
            const usage = Object.entries(planBudgets).map(([p,t])=>{ const spent=byPlan[p]||0; const pct=t>0?spent/t*100:0; return {p,spent,t,pct}; }).filter(o=>o.t>0).sort((a,b)=> b.pct - a.pct);
            let uy=80; usage.forEach((u, idx)=>{ if(uy>doc.page.height-70){ doc.addPage(); pageIndex+=1; doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`, doc.page.width-90, 20, { width: 80, align:'right' }); doc.fontSize(14).fillColor(palette.text).text('🎯 Limites Monitorados (detalhado) (cont.)',40,50); uy=80; }
                const emoji = u.pct>100?'🔴':(u.pct>=90?'🟡':'🟢');
                const label = planDisplay(u.p);
                doc.fontSize(11).fillColor(palette.text).text(`${idx+1}. ${label}: R$ ${u.spent.toLocaleString('pt-BR',{minimumFractionDigits:2})} / Teto R$ ${u.t.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,40,uy,{width:doc.page.width-80});
                doc.fontSize(11).fillColor(palette.text).text(`${emoji} ${u.pct.toFixed(1)}%`,40,uy+16);
                uy+=28; });
        }

        // Alertas & Recomendações
        newPageWithTitle('⚠️ Alertas & Recomendações'); doc.moveDown(0.5);
    const alerts = []; if (planBudgets){ Object.entries(byPlan).forEach(([p,v])=>{ const code = p==='Sem Plano'? null : Number(p); const teto= code? planBudgets[code] : 0; if(teto){ const pct=v/teto*100; const label = planDisplay(p); if(pct>100) alerts.push({level:'CRIT', msg:`${label} estourou o teto (${pct.toFixed(1)}%)`}); else if(pct>=90) alerts.push({level:'RISK', msg:`${label} em risco (${pct.toFixed(1)}%)`}); } }); }
        if(alerts.length===0) { doc.fontSize(10).fillColor(palette.success).text('Nenhum alerta crítico encontrado.'); }
        else { alerts.slice(0,15).forEach(a=>{ if(doc.y>doc.page.height-70){ doc.addPage(); pageIndex+=1; doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`, doc.page.width-90, 20, { width: 80, align:'right' }); doc.fontSize(14).fillColor(palette.text).text('⚠️ Alertas (cont.)',40,50); doc.y=70;} doc.fontSize(10).fillColor(a.level==='CRIT'?palette.danger:palette.warning).text(`• ${a.msg}`,40,doc.y); doc.y+=14; }); }
        doc.moveDown(0.5);
        // Recomendações básicas
        const recs = [];
    alerts.filter(a=>a.level==='CRIT').forEach(a=>{ recs.push(`Reduzir ou revisar gastos do plano indicado imediatamente.`); });
        if(totalEmp>0 && totalEmp/total>0.5) recs.push('Avaliar migração de parte dos custos empresariais para contratos/planos mais eficientes.');
        if(recs.length===0) recs.push('Manter a disciplina atual e revisar planos próximos de 90% do teto.');
    doc.fontSize(12).fillColor(palette.text).text('Recomendações:',40,doc.y+10); doc.moveDown(0.3);
    doc.fontSize(10).fillColor(palette.textSoft); recs.slice(0,8).forEach(r=>{ doc.text('• '+r,{width:doc.page.width-80}); doc.moveDown(0.2); });

        // Gastos por Conta
        newPageWithTitle('🏦 Gastos por Conta'); doc.moveDown(0.5);
        Object.entries(byAccount).sort((a,b)=>b[1]-a[1]).forEach(([c,v])=>{ if(doc.y>doc.page.height-60){ doc.addPage(); pageIndex+=1; doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`, doc.page.width-90, 20, { width: 80, align:'right' }); doc.fontSize(14).fillColor(palette.text).text('🏦 Gastos por Conta (cont.)',40,50); doc.y=70; }
            doc.fontSize(10).fillColor(palette.text).text(`• ${c}: R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,40,doc.y); doc.y+=14; });

        

        // Detalhamento Empresarial
        newPageWithTitle('💼 Detalhamento de Gastos Empresariais');
        const emp = safeExpenses.filter(e=>e.is_business_expense); let ey=90;
        emp.slice(0,150).forEach((e,i)=>{ if(ey>doc.page.height-60){ doc.addPage(); pageIndex+=1; doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`, doc.page.width-90, 20, { width: 80, align:'right' }); ey=50; doc.fontSize(12).fillColor(palette.text).text('Continuação Empresarial',40,ey); ey+=30; }
            const dt=new Date(e.transaction_date).toLocaleDateString('pt-BR'); const val=parseFloat(e.amount||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
            const label = planDisplay(e.account_plan_code);
            doc.fontSize(9).fillColor(palette.text).text(`${i+1}. ${dt} • R$ ${val} • ${(e.description||'').slice(0,60)} (${label})`,40,ey,{width:doc.page.width-80}); ey+=14; });

        // Lista Completa de Despesas
        newPageWithTitle('📋 Lista Completa de Despesas');
        let ly2=90; safeExpenses.forEach((e,i)=>{ if(ly2>doc.page.height-60){ doc.addPage(); ly2=50; doc.fontSize(12).text('Continuação Despesas',40,ly2); ly2+=30; }
            const dt=new Date(e.transaction_date).toLocaleDateString('pt-BR'); const val=parseFloat(e.amount||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
            const label = planDisplay(e.account_plan_code);
            doc.fontSize(9).fillColor(palette.textMuted).text(`${i+1}. ${dt} • R$ ${val} • ${(e.description||'').slice(0,70)} • ${e.account||''} • ${label}`,40,ly2,{width:doc.page.width-80}); ly2+=12; });

        // Rodapé final
    doc.moveDown(2); doc.fontSize(9).fillColor(palette.textSoft).text('Relatório Moderno Compacto • Layout acessível aprimorado', {align:'center'});
    } catch(err){ console.warn('Falha generateSimplePDF (modern):', err); }
    return doc;
}

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
        res.status(200).json({ status: 'ok', db: 'connected', version: '1.0.1' });
    } catch (error) {
        // Se a conexão com o banco falhar, o serviço não está saudável
        console.error('Health check falhou:', error);
        res.status(503).json({ status: 'error', db: 'disconnected', details: error.message });
    }
});

// Helpers para ler planos de contas do banco (e montar maps)
async function loadChartOfAccountsFromDb() {
    const [rows] = await pool.query(`SELECT id, name, description, default_budget AS defaultBudget, type FROM chart_of_accounts WHERE active = 1 ORDER BY id`);
    const plans = rows.map(r => ({ id: r.id, name: r.name, description: r.description, defaultBudget: Number(r.defaultBudget || 0), type: r.type }));
    const maps = { budgets: {}, names: {}, descriptions: {}, types: {} };
    for (const p of plans) {
        maps.budgets[p.id] = Number(p.defaultBudget || 0);
        maps.names[p.id] = p.name;
        if (p.description) maps.descriptions[p.id] = p.description;
        if (p.type) maps.types[p.id] = p.type;
    }
    return { ok: true, version: 1, generatedAt: new Date().toISOString(), plans, maps };
}
async function getPlanTypesMapFromDb() {
    const [rows] = await pool.query(`SELECT id, type FROM chart_of_accounts WHERE active = 1`);
    const types = {}; rows.forEach(r => { types[Number(r.id)] = r.type; });
    return types;
}

// Expor configuração de planos de contas (somente leitura) a partir do banco
app.get('/api/config/chart-of-accounts', async (req, res) => {
    try {
        const data = await loadChartOfAccountsFromDb();
        res.json(data);
    } catch (e) {
        res.status(500).json({ ok: false, error: 'Failed to load chart of accounts', message: e.message });
    }
});

// Rotas administrativas para planos de contas
const { authenticateToken } = require('./middleware/authMiddleware');
app.get('/api/admin/chart-of-accounts', authenticateToken, async (req,res)=>{
    try { const data = await loadChartOfAccountsFromDb(); res.json(data); } catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/admin/chart-of-accounts/plan', authenticateToken, async (req,res)=>{
    try {
        const plan = req.body;
        if(!plan || plan.id==null) return res.status(400).json({error:'id é obrigatório'});
        const id = parseInt(plan.id, 10);
        const name = String(plan.name || '').trim();
        const description = plan.description ? String(plan.description) : null;
        const defaultBudget = Number(plan.defaultBudget || 0);
        const type = (plan.type||'personal');
        if (!name || !['personal','business'].includes(type)) return res.status(400).json({ error: 'Dados inválidos' });
        await pool.query(
            `INSERT INTO chart_of_accounts (id, name, description, default_budget, type, active) 
             VALUES (?,?,?,?,?,1)
             ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), default_budget=VALUES(default_budget), type=VALUES(type), active=1`,
            [id, name, description, defaultBudget, type]
        );
        const data = await loadChartOfAccountsFromDb();
        res.json({ ok:true, data });
    } catch(e){ res.status(500).json({ ok:false, error: e.message }); }
});
app.delete('/api/admin/chart-of-accounts/plan/:id', authenticateToken, async (req,res)=>{
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM chart_of_accounts WHERE id = ?', [parseInt(id,10)]);
        const data = await loadChartOfAccountsFromDb();
        res.json({ ok:true, data });
    } catch(e){ res.status(500).json({ ok:false, error: e.message }); }
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
        // Primeiro, garante que a tabela existe
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
        
        // Depois cria a view
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
const { computeMonthlyKPIs, saveMonthlySnapshot, computeTrendAnalysis, computeComparativeAnalysis, generateExecutiveReport } = require('./reporting/monthlyKpis');
const { getRedis } = require('./utils/redisClient');
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
            recommendations: []
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
        // Classificação: usa tipo do plano (central) quando presente; se vazio, segue regra automática empresarial
        const explicitBusiness = req.body.is_business_expense === 'true' || req.body.is_business_expense === true;
        let finalIsBusiness = 0;
        let finalAccountPlanCode = null;
        if (account_plan_code) {
            const types = await getPlanTypesMapFromDb();
            const code = parseInt(account_plan_code, 10);
            const planType = types && types[code];
            if (!planType) {
                return res.status(400).json({
                    error: 'INVALID_PLAN_CODE',
                    message: `Plano de contas inválido: ${account_plan_code}. Verifique o cadastro central.`
                });
            }
            if (planType === 'business') {
                // Plano empresarial: manter o código e marcar como empresarial
                finalIsBusiness = 1;
                finalAccountPlanCode = code;
            } else {
                // Plano pessoal (ou sem tipo): manter código e marcar como pessoal
                finalIsBusiness = explicitBusiness ? 1 : 0;
                finalAccountPlanCode = code;
            }
        } else {
            // Sem plano informado
            if (explicitBusiness) {
                // Empresarial exige plano de contas
                return res.status(400).json({
                    error: 'MISSING_BUSINESS_PLAN',
                    message: 'Para gastos empresariais é obrigatório selecionar um plano de contas empresarial.'
                });
            }
            finalIsBusiness = 0;
            finalAccountPlanCode = null;
        }

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
            // Contas marcadas como isRecurring (inclui agora Ourocard Ketlyn e PIX/Boleto) usam mês civil
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
                // Mês civil: de 1 ao último dia
                sql += ' AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?';
                params.push(year, month);
            }
        } else if (year && month) {
            sql += ' AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?';
            params.push(year, month);
        }

        sql += ' ORDER BY transaction_date DESC';
        const [rows] = await pool.query(sql, params);
        // Enriquecer com planType baseado na configuração central
        const { types } = accountsConfig.asMaps();
        const enriched = rows.map(r => ({
            ...r,
            planType: (r.account_plan_code != null && types[Number(r.account_plan_code)] ) || null
        }));
        res.json(enriched);
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
    const types = await getPlanTypesMapFromDb();
    const rowsWithType = rows.map(r => ({...r, planType: (r.account_plan_code != null && types[Number(r.account_plan_code)]) || null }));

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

        res.json(rowsWithType);
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

        // Classificação com base no tipo do plano central quando informado
        let finalIsBusiness;
        let finalAccountPlanCode;
        if (account_plan_code) {
            const types = await getPlanTypesMapFromDb();
            const code = parseInt(account_plan_code, 10);
            const planType = types && types[code];
            if (!planType) {
                return res.status(400).json({
                    error: 'INVALID_PLAN_CODE',
                    message: `Plano de contas inválido: ${account_plan_code}. Verifique o cadastro central.`
                });
            }
            if (planType === 'business') {
                finalIsBusiness = 1;
                finalAccountPlanCode = code; // manter código do plano empresarial
            } else {
                finalIsBusiness = is_business_expense ? 1 : 0;
                finalAccountPlanCode = code; // plano pessoal ou sem tipo
            }
        } else {
            // Sem plano informado
            if (is_business_expense) {
                return res.status(400).json({
                    error: 'MISSING_BUSINESS_PLAN',
                    message: 'Para gastos empresariais é obrigatório selecionar um plano de contas empresarial.'
                });
            }
            finalIsBusiness = 0;
            finalAccountPlanCode = null;
        }

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
            // Gastos por Plano de Conta (Bar Chart) - inclui pessoais e empresariais
            pool.query(
                `SELECT account_plan_code, SUM(amount) as total
                 FROM expenses
                 WHERE user_id = ? AND account_plan_code IS NOT NULL AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
                 GROUP BY account_plan_code`,
                [userId, year, month]
            )
        ]);

        const nextMonthProjection = parseFloat(projectionData[0][0]?.total || 0);
        // Anexar nomes dos planos aos dados de barra
        const { names: planNames } = accountsConfig.asMaps();
        const planChartEnriched = (planChartData[0]||[]).map(r => ({
            account_plan_code: r.account_plan_code,
            total: r.total,
            name: planNames && planNames[Number(r.account_plan_code)] ? planNames[Number(r.account_plan_code)] : null
        }));

        res.json({
            projection: { nextMonthEstimate: nextMonthProjection.toFixed(2) },
            lineChartData: lineChartData[0],
            pieChartData: pieChartData[0],
            mixedTypeChartData: mixedTypeChartData[0],
            planChartData: planChartEnriched
        });

    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        res.status(500).json({ message: 'Erro ao buscar dados do dashboard.' });
    }
});

// --- 8.1. ROTA DE TETOS POR PLANO DE CONTAS (ALERTAS) ---

// Rota protegida para tetos por plano de contas - usando budgets centralizados do config
app.get('/api/expenses-goals', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month, account } = req.query;

        let sql = `
            SELECT account_plan_code, SUM(amount) as Total
            FROM expenses
            WHERE user_id = ? AND account_plan_code IS NOT NULL AND account_plan_code <> ''
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
        // Preferir planos de contas do banco (ADM) para orçamentos e nomes
        let centralBudgets = {}; let centralNames = {};
        try {
            const coaData = await loadChartOfAccountsFromDb();
            centralBudgets = (coaData && coaData.maps && coaData.maps.budgets) || {};
            centralNames = (coaData && coaData.maps && coaData.maps.names) || {};
        } catch (e) {
            // Fallback para arquivo local caso banco não esteja disponível
            const maps = accountsConfig.asMaps();
            centralBudgets = maps.budgets || {};
            centralNames = maps.names || {};
        }

        const dataWithLimits = results
            .map(item => {
                const planoId = Number(item.account_plan_code);
                if (!Number.isFinite(planoId)) return null; // descarta inválidos
                const teto = (centralBudgets && centralBudgets[planoId] !== undefined) ? Number(centralBudgets[planoId]) : 0;
                const percentual = teto > 0 ? (Number(item.Total) / teto) * 100 : 0;
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
                    NomePlano: (centralNames && centralNames[planoId]) || null,
                    Total: Number(item.Total) || 0,
                    Teto: teto,
                    Percentual: percentual,
                    Alerta: alerta
                };
            })
            .filter(Boolean);

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
    try { const f=ensurePrimaryFont(); if(f){ doc.registerFont('NotoSans', f); doc.font('NotoSans'); } } catch{}
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
            
            // Ordenar e manter todos os planos (sem agrupar em "Outros")
            const planData = planLabels.map((label, index) => ({
                label: label.length > 15 ? label.substring(0, 12) + '...' : label,
                value: planValues[index],
                percentage: ((planValues[index] / total) * 100).toFixed(1)
            })).sort((a, b) => b.value - a.value);

            const finalData = planData;

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
    
    console.log('🎯 Gerando relatório BI inteligente...');
    
    // CRIAR DOCUMENTO PDF
    const doc = new pdfkit({ margin: 30, size: 'A4' });
    try { const f=ensurePrimaryFont(); if(f){ doc.registerFont('NotoSans', f); doc.font('NotoSans'); } } catch{}

    // Paleta e numeração de páginas para padronização visual
    const palette = {
        bg: '#FFFFFF',
        text: '#1F2937',
        textMuted: '#475569',
        textSoft: '#64748B',
        textStrong: '#0F172A',
        border: '#E5E7EB',
        surface: '#F8FAFC',
        primary: '#1D4ED8',
        secondary: '#0EA5E9',
        success: '#16A34A',
        warning: '#F59E0B',
        danger: '#DC2626',
    };
    let pageIndexBI = 1;
    const drawPageNumberBI = () => {
        // Cor clara sobre possíveis cabeçalhos escuros
        doc.fontSize(10).fillColor('#E2E8F0').text(`Página ${pageIndexBI}`,
            doc.page.width - 90, 20, { width: 80, align: 'right' });
    };
    
    // Mapeamentos centrais de planos (preferir valores providos pelo chamador)
    const planMaps = data.planMaps || ((accountsConfig && accountsConfig.asMaps) ? accountsConfig.asMaps() : { names:{}, budgets:{}, types:{}, descriptions:{} });
    const planNames = data.planNames || planMaps.names || {};
    const planBudgets = data.planBudgets || planMaps.budgets || {};
    const planTypes = data.planTypes || planMaps.types || {};
    const planDescriptions = data.planDescriptions || planMaps.descriptions || {};
    const planDisplay = (code)=>{
        if (code==null || code==='') return 'Sem Plano'; const id = Number(code); return planNames[id] || `Plano ${id}`;
    };
    const byPlan = {}; (Array.isArray(expenses)?expenses:[]).forEach(e=>{ const p=(e.account_plan_code!=null && e.account_plan_code!=='')? String(e.account_plan_code) : 'Sem Plano'; byPlan[p]=(byPlan[p]||0)+parseFloat(e.amount||0); });

    // Anexar para páginas seguintes
    data.planNames = planNames; data.planBudgets = planBudgets; data.planTypes = planTypes; data.planDescriptions = planDescriptions; data.planDisplay = planDisplay; data.byPlan = byPlan;

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
    drawPageNumberBI();
    
    // === 📈 PÁGINA 2: ANÁLISES BI E INSIGHTS ===
    doc.addPage();
    pageIndexBI += 1;
    await createBIAnalyticsPage(doc, data);
    drawPageNumberBI();
    
    // === 💰 PÁGINA 3: RESUMO DE ORÇAMENTO POR PLANO ===
    doc.addPage();
    pageIndexBI += 1;
    await createBudgetSummaryPage(doc, data);
    drawPageNumberBI();

    // === 📋 PÁGINA 4: DETALHAMENTO INTELIGENTE ===
    doc.addPage();
    pageIndexBI += 1;
    await createIntelligentDetailPage(doc, data);
    drawPageNumberBI();
    
    // === 📊 PÁGINA 5: GRÁFICOS MODERNOS ===
    doc.addPage();
    pageIndexBI += 1;
    await createModernChartsPage(doc, data);
    drawPageNumberBI();
    
    // === 📜 PÁGINA 6: LISTA COMPLETA DE DESPESAS ===
    doc.addPage();
    pageIndexBI += 1;
    await createFullExpenseListPage(doc, data);
    drawPageNumberBI();
    
    // === 📚 PÁGINA 7: APÊNDICE NUMÉRICO COMPLETO ===
    doc.addPage();
    pageIndexBI += 1;
    await createNumericAppendixPage(doc, data);
    drawPageNumberBI();
    
    return doc;
}

// 📄 RELATÓRIO COMPACTO (1–2 páginas): RESUMO EXECUTIVO
async function generateCompactMonthlyReport({
    pool, userId, year, month, account, expenses: rawExpenses,
    total, totalPessoal, totalEmpresarial, porPlano, porConta,
    startDate, endDate, contaNome,
    // mapas opcionais vindos do chamador (preferenciais)
    planNames, planBudgets, planDescriptions
}){
    const expenses = Array.isArray(rawExpenses) ? rawExpenses : [];
    const doc = new pdfkit({ margin: 30, size: 'A4' });
    try { const f=ensurePrimaryFont(); if(f){ doc.registerFont('NotoSans', f); doc.font('NotoSans'); } } catch{}

    // Paleta e numeração de página
    let pageIndexSummary = 1;
    const drawPageNumberSummary = () => {
        doc.fontSize(10).fillColor('#E2E8F0').text(`Página ${pageIndexSummary}`,
            doc.page.width - 90, 18, { width: 80, align: 'right' });
    };

    // Header compacto com gradiente padronizado
    const grad = doc.linearGradient(0,0,0,90); grad.stop(0,'#0F172A').stop(1,'#0EA5E9');
    doc.rect(0,0,doc.page.width,90).fill(grad);
    doc.fillColor('#FFFFFF').fontSize(20).text('RESUMO EXECUTIVO MENSAL', 30, 26);
    doc.fontSize(11).fillColor('#E5E7EB').text(`Conta: ${contaNome || (account||'Todas')} • Período: ${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`, 30, 55);
    drawPageNumberSummary();

    doc.y = 110;

    // KPIs rápidos (Total, Pessoal, Empresarial)
    const kY = doc.y; const kW=160; const kH=85; const s=18;
    const mediaTx = expenses.length? total/expenses.length : 0;
    const pctPes = total>0? (totalPessoal/total*100):0;
    const pctEmp = total>0? (totalEmpresarial/total*100):0;

    // Total
    doc.roundedRect(30, kY, kW, kH, 12).fill('#3B82F6');
    doc.fillColor('#FFFFFF').fontSize(11).text('💰 Total', 40, kY+12);
    doc.fontSize(14).text(`R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, 40, kY+34);
    doc.fontSize(9).text(`Média: R$ ${mediaTx.toFixed(2)}`, 40, kY+56);

    // Pessoal
    const k2x = 30 + kW + s;
    doc.roundedRect(k2x, kY, kW, kH, 12).fill('#10B981');
    doc.fillColor('#FFFFFF').fontSize(11).text('🏠 Pessoal', k2x+10, kY+12);
    doc.fontSize(14).text(`R$ ${totalPessoal.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, k2x+10, kY+34);
    doc.fontSize(9).text(`${pctPes.toFixed(1)}% do total`, k2x+10, kY+56);

    // Empresarial
    const k3x = k2x + kW + s;
    doc.roundedRect(k3x, kY, kW, kH, 12).fill('#F59E0B');
    doc.fillColor('#FFFFFF').fontSize(11).text('💼 Empresarial', k3x+10, kY+12);
    doc.fontSize(14).text(`R$ ${totalEmpresarial.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, k3x+10, kY+34);
    doc.fontSize(9).text(`${pctEmp.toFixed(1)}% do total`, k3x+10, kY+56);

    doc.y = kY + kH + 20;

    // Variação vs mês anterior (MoM)
    let momPct = 0; let prevTotal = 0;
    try{
        const prevMonth = month===1? 12 : month-1; const prevYear = month===1? year-1 : year;
        const prevStart = new Date(prevYear, prevMonth-1, 1); const prevEnd = new Date(prevYear, prevMonth, 0);
        const [prevExpenses] = await pool.query(
            `SELECT amount FROM expenses WHERE user_id=? AND transaction_date>=? AND transaction_date<=?`,
            [userId, prevStart.toISOString().slice(0,10), prevEnd.toISOString().slice(0,10)]
        );
        prevTotal = (prevExpenses||[]).reduce((s,e)=> s + parseFloat(e.amount||0), 0);
        momPct = prevTotal>0? ((total-prevTotal)/prevTotal*100) : 0;
    } catch{}

    doc.roundedRect(30, doc.y, doc.page.width-60, 50, 10).fill('#F8FAFC');
    doc.fillColor('#0F172A').fontSize(12).text('📈 Destaques Rápidos', 42, doc.y+12);
    doc.fontSize(10).fillColor('#334155').text(
        `Variação M/M: ${momPct>=0?'↑':'↓'} ${Math.abs(momPct).toFixed(1)}%  •  Transações: ${expenses.length}  •  Média diária: R$ ${(total/Math.max(1, endDate.getDate())).toFixed(2)}`,
        42, doc.y+30, { width: doc.page.width-90 }
    );
    doc.y += 65;

    // Top categorias (por conta) – Top 5
    const topAccounts = Object.entries(porConta||{}).sort(([,a],[,b])=>b-a).slice(0,5);
    doc.fontSize(12).fillColor('#111827').text('🏆 Top Categorias', 30, doc.y);
    doc.fontSize(10).fillColor('#374151');
    topAccounts.forEach(([acc,val],i)=>{
        const pct = total>0? (val/total*100):0;
        doc.text(`${i+1}. ${acc}: R$ ${val.toFixed(2)} (${pct.toFixed(1)}%)`, 42, doc.y+16+(i*14));
    });
    doc.y += 16 + (topAccounts.length*14) + 10;

    // Tetos monitorados – Top 3 por uso (cores parametrizadas)
    try{
        // preferir mapas fornecidos pelo chamador; fallback para arquivo
        const fallbackMaps = (accountsConfig && accountsConfig.asMaps)? accountsConfig.asMaps():{budgets:{},names:{}};
        const budgets = planBudgets || fallbackMaps.budgets || {};
        const names = planNames || fallbackMaps.names || {};
        const byPlan = {};
        expenses.forEach(e=>{ const p = (e.account_plan_code!=null && e.account_plan_code!=='')? String(e.account_plan_code): 'Sem Plano'; byPlan[p]=(byPlan[p]||0)+parseFloat(e.amount||0); });
        const usage = Object.entries(budgets).map(([p,t])=>{ const spent = byPlan[p]||0; const pct = t>0? (spent/t*100):0; return {p,spent,t,pct}; })
            .filter(o=>o.t>0).sort((a,b)=> b.pct - a.pct).slice(0,3);
        if (usage.length){
            doc.fontSize(12).fillColor('#111827').text('🎯 Tetos Monitorados (Top 3)', 30, doc.y);
            usage.forEach((u,idx)=>{
                const yellow = kpiThresholds.budgetHighUsageYellow ?? 80;
                const red = kpiThresholds.budgetHighUsageRed ?? 100;
                const color = u.pct>red?'#DC2626':(u.pct>=yellow?'#D97706':'#10B981');
                const label = names[Number(u.p)] || `Plano ${u.p}`;
                const y = doc.y + 16 + idx*18; const w = 180; const used = Math.min(1, u.pct/100);
                doc.fillColor('#374151').fontSize(10).text(`${label}`, 42, y-2, { width: 230 });
                doc.rect(280, y, w, 10).fill('#E5E7EB');
                doc.rect(280, y, Math.max(4, w*used), 10).fill(color);
                doc.fillColor('#111827').fontSize(9).text(`${u.pct.toFixed(1)}%`, 470, y-2);
            });
            doc.y += 16 + usage.length*18 + 6;
        }
    } catch{}

    // Insights e Alertas (limitados) — preferir KPIs unificados
    // RESUMO POR PLANO (tabela compacta com Teto, Gasto e Uso %)
    try {
        const fallbackMaps = (accountsConfig && accountsConfig.asMaps)? accountsConfig.asMaps():{budgets:{},names:{}};
        const budgets = planBudgets || fallbackMaps.budgets || {};
        const names = planNames || fallbackMaps.names || {};
        // Montar byPlan do período
        const byPlan = {};
        expenses.forEach(e=>{ const p=(e.account_plan_code!=null && e.account_plan_code!=='')? String(e.account_plan_code): 'Sem Plano'; byPlan[p]=(byPlan[p]||0)+parseFloat(e.amount||0); });
        // Linhas com teto definido
        const rows = Object.entries(budgets)
            .map(([p,t])=>{ const spent = byPlan[p]||0; const pct = t>0? (spent/t*100):0; return { p, name: names[Number(p)]||`Plano ${p}` , teto: Number(t)||0, gasto: spent, pct}; })
            .filter(r=> r.teto>0)
            .sort((a,b)=> b.pct - a.pct)
            .slice(0,10);
        if (rows.length){
            doc.moveDown(0.5);
            doc.fontSize(12).fillColor('#111827').text('📋 Resumo por Plano (Top 10 por uso)', 30, doc.y);
            doc.y += 6;
            // Cabeçalho
            const startX = 30; let y = doc.y;
            const cols = [
                { title: 'Plano', w: 210, align: 'left' },
                { title: 'Teto',  w: 90,  align: 'right' },
                { title: 'Gasto', w: 90,  align: 'right' },
                { title: 'Uso %', w: 70,  align: 'right' }
            ];
            doc.fontSize(10).fillColor('#334155');
            let x = startX;
            cols.forEach(c=>{ doc.text(c.title, x, y, { width: c.w, align: c.align }); x += c.w + 8; });
            y += 16; doc.moveTo(startX, y).lineTo(doc.page.width-30, y).stroke('#E5E7EB'); y += 6;
            // Linhas
            const bottom = doc.page.height - 60; doc.fontSize(10).fillColor('#374151');
            for (const r of rows){
                x = startX;
                const status = r.pct>100 ? '🔴' : (r.pct>=90 ? '🟡' : '🟢');
                const name = `${status} ${r.name}`;
                doc.text(name, x, y, { width: cols[0].w, align: cols[0].align }); x += cols[0].w + 8;
                doc.text(`R$ ${r.teto.toFixed(2)}`, x, y, { width: cols[1].w, align: cols[1].align }); x += cols[1].w + 8;
                doc.text(`R$ ${r.gasto.toFixed(2)}`, x, y, { width: cols[2].w, align: cols[2].align }); x += cols[2].w + 8;
                doc.text(`${r.pct.toFixed(1)}%`, x, y, { width: cols[3].w, align: cols[3].align });
                y += 16;
                if (y > bottom){ doc.addPage(); pageIndexSummary += 1; drawPageNumberSummary(); y = 50; }
            }
            doc.y = y + 6;
        }
    } catch (e) { console.warn('Falha ao renderizar resumo por plano no compacto:', e.message); }

    let insights = [];
    let alerts = [];
    try {
        const kpis = await computeMonthlyKPIs({ pool, userId, year, month, account: account || 'ALL' });
        const bi = kpis?.businessIntelligence || {};
        // Mapear insights BI em mensagens curtas
        if (Array.isArray(bi.recommendations)) {
            insights = bi.recommendations.slice(0,2).map(r=>({ icon: '🧠', title: r.type || 'Insight', description: r.message || '' }));
        }
        // Alerts baseados em riscos do BI e projeção
        const risk = bi.insights?.riskFactors || {};
        if (risk.highConcentration) alerts.push({ level: 'atencao', icon: '⚠️', message: 'Alta concentração de gastos', recommendation: 'Diversificar categorias para reduzir risco.' });
        if (kpis?.projecao?.crescimentoProj > (kpiThresholds.alerts?.projectionHighGrowth ?? 20)) alerts.push({ level: 'critico', icon: '📈', message: 'Crescimento projetado elevado', recommendation: 'Implementar controles para conter avanço dos gastos.' });
        alerts = alerts.slice(0,2);
    } catch {
        // Fallback para heurísticas locais
        insights = generateIntelligentInsights(expenses, total, totalPessoal, totalEmpresarial, year, month).slice(0,2);
        alerts = generateSmartAlerts(expenses, total, totalPessoal, totalEmpresarial, year, month).slice(0,2);
    }
    if (insights.length || alerts.length){
        doc.fontSize(12).fillColor('#111827').text('🧠 Insights & Alertas', 30, doc.y);
        doc.y += 6;
        insights.forEach(ins=>{ doc.fontSize(10).fillColor('#0C4A6E').text(`${ins.icon} ${ins.title} — ${ins.description}`, 42, doc.y); doc.y += 14; });
        alerts.forEach(al=>{ const ic = al.icon||'⚠️'; doc.fontSize(10).fillColor('#7C2D12').text(`${ic} ${al.message} — ${al.recommendation}`, 42, doc.y); doc.y += 14; });
    }

    // Único gráfico pequeno (opcional) — Top Categorias (barras horizontais)
    if (ChartJSNodeCanvas) {
        try {
            const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 420, height: 240, backgroundColour: 'white' });
            const topAcc = Object.entries(porConta||{}).sort(([,a],[,b])=>b-a).slice(0,6);
            const labels = topAcc.map(([name])=> name);
            const dataVals = topAcc.map(([,val])=> val);
            const cfg = {
                type: 'bar',
                data: { labels, datasets: [{ label: 'Top Categorias', data: dataVals, backgroundColor: '#3B82F6' }] },
                options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v)=> `R$ ${v}` } } } }
            };
            const img = await chartJSNodeCanvas.renderToBuffer(cfg);
            if (doc.y > 590) { doc.addPage(); pageIndexSummary += 1; drawPageNumberSummary(); doc.y = 40; }
            doc.fontSize(11).fillColor('#111827').text('📊 Top Categorias (por conta)', 30, doc.y);
            doc.image(img, 30, doc.y+14, { width: 420, height: 240 });
            doc.y += 260;
        } catch{}
    }

    // Rodapé
    const now = new Date();
    doc.fontSize(9).fillColor('#6B7280').text(`Gerado em ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`, 30, doc.page.height-40, { width: doc.page.width-60, align: 'right' });

    return doc;
}

// 📊 PÁGINA 1: DASHBOARD EXECUTIVO
async function createExecutiveDashboard(doc, data) {
    const { expenses: rawExpenses, total, totalPessoal, totalEmpresarial, startDate, endDate, contaNome, year, month } = data;
    const expenses = Array.isArray(rawExpenses) ? rawExpenses : [];
    
    // === CABEÇALHO EXECUTIVO MODERNO ===
    const gradient = doc.linearGradient(0, 0, doc.page.width, 100);
    gradient.stop(0, '#667eea').stop(0.5, '#764ba2').stop(1, '#3B82F6');
    
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
    
    // KPI 1: Total Geral
    doc.roundedRect(40, kpiY, kpiWidth, kpiHeight, 15).fill('#3B82F6');
    doc.fillColor('#FFFFFF').fontSize(14).text('💰 TOTAL GERAL', 50, kpiY + 20, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(20).text(`R$ ${(total || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, 50, kpiY + 45, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(11).text(`${expenses.length} transações`, 50, kpiY + 75, { width: kpiWidth - 20, align: 'center' });
    const mediaTx = expenses.length > 0 ? (total / expenses.length) : 0;
    doc.fontSize(10).text(`Média: R$ ${mediaTx.toFixed(2)}`, 50, kpiY + 90, { width: kpiWidth - 20, align: 'center' });

    // KPI 2: Pessoal
    const kpi2X = 40 + kpiWidth + spacing;
    doc.roundedRect(kpi2X, kpiY, kpiWidth, kpiHeight, 15).fill('#10B981');
    doc.fillColor('#FFFFFF').fontSize(14).text('🏠 PESSOAL', kpi2X + 10, kpiY + 20, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(20).text(`R$ ${(totalPessoal || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, kpi2X + 10, kpiY + 45, { width: kpiWidth - 20, align: 'center' });
    doc.fontSize(11).text(`${percentualPessoal.toFixed(1)}% do total`, kpi2X + 10, kpiY + 75, { width: kpiWidth - 20, align: 'center' });
    const pessoaisCount = expenses.filter(e => !e.is_business_expense).length;
    doc.fontSize(10).text(`${pessoaisCount} transações`, kpi2X + 10, kpiY + 90, { width: kpiWidth - 20, align: 'center' });

    // KPI 3: Empresarial
    const kpi3X = kpi2X + kpiWidth + spacing;
    doc.roundedRect(kpi3X, kpiY, kpiWidth, kpiHeight, 15).fill('#F59E0B');
    doc.fillColor('#FFFFFF').fontSize(14).text('💼 EMPRESARIAL', kpi3X + 10, kpiY + 20, { width: kpiWidth - 20, align: 'center' });
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
    const { expenses, total, totalPessoal, totalEmpresarial, porPlano, porConta, year, month, planBudgets, planDisplay, byPlan, planDescriptions } = data;
    
    // Cabeçalho da página (gradiente padronizado)
    const grad = doc.linearGradient(0,0,0,80); grad.stop(0,'#0F172A').stop(1,'#0EA5E9');
    doc.rect(0, 0, doc.page.width, 80).fill(grad);
    doc.fontSize(24).fillColor('#FFFFFF').text('📈 ANÁLISES BUSINESS INTELLIGENCE', 0, 24, { align: 'center', width: doc.page.width });
    doc.fontSize(14).fillColor('#E5E7EB').text('Insights Avançados & Análises Preditivas', 0, 48, { align: 'center', width: doc.page.width });
    
    doc.y = 100;
    
    // === ANÁLISE TEMPORAL ===
    doc.fontSize(18).fillColor('#0F172A').text('📅 ANÁLISE TEMPORAL', { underline: true });
    doc.moveDown(1);
    
    const temporalAnalysis = analyzeTemporalPatterns(expenses, year, month);
    
    // Gráfico de distribuição semanal
    doc.fontSize(14).fillColor('#374151').text('Distribuição por Semanas do Mês:');
    doc.moveDown(0.5);
    
    temporalAnalysis.weekly.forEach((week, index) => {
        const weekWidth = (doc.page.width - 120) * (week.total / total);
    const barColor = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'][index];
        
        doc.roundedRect(60, doc.y, weekWidth, 25, 5).fill(barColor);
        doc.fillColor('#FFFFFF').fontSize(10).text(
            `Sem ${index + 1}: R$ ${week.total.toFixed(2)} (${week.count} trans.)`, 
            70, doc.y + 7, { width: weekWidth - 20 }
        );
        doc.y += 35;
    });
    
    doc.moveDown(1);
    
    // === ANÁLISE CATEGORÍAS TOP ===
    doc.fontSize(18).fillColor('#0F172A').text('🏆 TOP CATEGORIAS', { underline: true });
    doc.moveDown(1);
    
    const topCategories = Object.entries(porConta)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    topCategories.forEach(([categoria, valor], index) => {
        const percentage = (valor / total * 100).toFixed(1);
        const barWidth = (doc.page.width - 200) * (valor / topCategories[0][1]);
    const colors = ['#1E40AF', '#059669', '#DC2626', '#7C3AED', '#EA580C', '#0891B2', '#65A30D', '#BE185D', '#4338CA', '#0F766E'];
        
        doc.fontSize(11).fillColor('#374151').text(`${index + 1}. ${categoria}`, 40, doc.y);
        doc.roundedRect(200, doc.y - 2, barWidth, 18, 3).fill(colors[index]);
        doc.fillColor('#FFFFFF').fontSize(9).text(`R$ ${valor.toFixed(2)} (${percentage}%)`, 205, doc.y + 2);
        doc.y += 25;
    });
    
    doc.moveDown(1);
    
    // === ANÁLISE COMPARATIVA ===
    doc.fontSize(18).fillColor('#0F172A').text('⚖️ ANÁLISE COMPARATIVA', { underline: true });
    doc.moveDown(1);
    
    const comparative = generateComparativeAnalysis(expenses, total, totalPessoal, totalEmpresarial);
    
    comparative.forEach(comp => {
        doc.roundedRect(40, doc.y, doc.page.width - 80, 60, 8).fill('#F8FAFC');
        doc.fillColor('#1E293B').fontSize(12).text(`${comp.icon} ${comp.title}`, 55, doc.y + 12);
        doc.fontSize(10).fillColor('#475569').text(comp.description, 55, doc.y + 30, { width: doc.page.width - 110 });
        doc.y += 75;
    });

    // === TETOS MONITORADOS ===
    if (planBudgets && Object.keys(planBudgets).length) {
        doc.moveDown(1);
        doc.fontSize(18).fillColor('#1F2937').text('🎯 TETOS MONITORADOS', { underline: true });
        doc.moveDown(0.5);
        const usage = Object.entries(planBudgets).map(([p,t])=>{ const spent=byPlan[p]||0; const pct=t>0?spent/t*100:0; return {p,spent,t,pct}; }).filter(o=>o.t>0).sort((a,b)=> b.pct - a.pct).slice(0,8);
        usage.forEach(u=>{
            const emoji = u.pct>100?'🔴':(u.pct>=90?'🟡':'🟢');
            const label = planDisplay(u.p);
            doc.roundedRect(40, doc.y, doc.page.width - 80, 28, 6).fill('#F8FAFC');
            doc.fillColor('#111827').fontSize(11).text(`${emoji} ${label}`, 50, doc.y + 8);
            // Descritivo do plano (quando disponível)
            if (planDescriptions && planDescriptions[Number(u.p)]) {
                doc.fillColor('#64748B').fontSize(9).text(`${String(planDescriptions[Number(u.p)]).slice(0,80)}`, 200, doc.y + 8, { width: 260 });
            }
            const barW = 220; const used = Math.min(1, u.pct/100);
            doc.rect(doc.page.width-50-barW, doc.y+8, barW, 12).fill('#E5E7EB');
            doc.rect(doc.page.width-50-barW, doc.y+8, Math.max(4,barW*used), 12).fill(u.pct>100?'#DC2626':u.pct>=90?'#F59E0B':'#16A34A');
            doc.fillColor('#111827').fontSize(10).text(`${u.pct.toFixed(1)}%`, doc.page.width-50-barW-40, doc.y+8, {width:40, align:'right'});
            // Valores absolutos além da porcentagem: "R$ gasto / R$ teto"
            doc.fillColor('#374151').fontSize(9).text(`R$ ${u.spent.toFixed(2)} / R$ ${u.t.toFixed(2)}`, doc.page.width-50-barW, doc.y+22, { width: barW, align: 'right' });
            doc.y += 34;
        });

        // Alertas de planos que ultrapassaram limites
        const exceeded = usage.filter(u=> u.pct>100);
        if (exceeded.length){
            doc.moveDown(0.5);
            doc.fontSize(12).fillColor('#B91C1C').text('⚠️ Alertas: Planos que ultrapassaram o limite', 40, doc.y);
            exceeded.forEach(u=>{
                const label = planDisplay(u.p);
                doc.fontSize(10).fillColor('#7C2D12').text(`• ${label}: ${u.pct.toFixed(1)}% do teto (R$ ${u.spent.toFixed(2)} / R$ ${u.t.toFixed(2)})`, 50, doc.y+14);
                doc.y += 20;
            });
        }

        // Recomendações baseadas na utilização
        const nearLimit = usage.filter(u=> u.pct>= (kpiThresholds.budgetHighUsageYellow ?? 80));
        if (nearLimit.length){
            doc.moveDown(0.3);
            doc.fontSize(12).fillColor('#0C4A6E').text('🧭 Recomendações', 40, doc.y);
            nearLimit.forEach(u=>{
                const label = planDisplay(u.p);
                const rec = u.pct> (kpiThresholds.budgetHighUsageRed ?? 100)
                    ? 'Rever gastos e realocar orçamento imediatamente.'
                    : 'Monitorar de perto e considerar ajuste de orçamento.';
                doc.fontSize(10).fillColor('#164E63').text(`• ${label}: ${rec}`, 50, doc.y+14);
                doc.y += 20;
            });
        }
    }
}

// 💰 PÁGINA 3: RESUMO DE ORÇAMENTO POR PLANO
async function createBudgetSummaryPage(doc, data) {
    const { planBudgets = {}, planDisplay, byPlan = {}, planDescriptions = {} } = data;

    // Cabeçalho (gradiente padronizado)
    const grad = doc.linearGradient(0,0,0,80); grad.stop(0,'#0F172A').stop(1,'#0EA5E9');
    doc.rect(0, 0, doc.page.width, 80).fill(grad);
    doc.fontSize(24).fillColor('#FFFFFF').text('💰 RESUMO DE ORÇAMENTO POR PLANO', 0, 25, { align: 'center', width: doc.page.width });
    doc.fontSize(14).fillColor('#E5E7EB').text('Teto, gasto real e uso (%) — Top planos por utilização', 0, 50, { align: 'center', width: doc.page.width });

    doc.y = 100;

    // Montar linhas com tetos definidos
    const rows = Object.entries(planBudgets)
        .map(([p, t]) => {
            const id = String(p);
            const spent = byPlan[id] || 0;
            const teto = Number(t) || 0;
            const pct = teto > 0 ? (spent / teto * 100) : 0;
            return { p: id, name: planDisplay ? planDisplay(id) : `Plano ${id}`, teto, gasto: spent, pct };
        })
        .filter(r => r.teto > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 15);

    if (!rows.length) {
        doc.fontSize(12).fillColor('#111827').text('Nenhum teto configurado para exibir.', 40, doc.y);
        return;
    }

    // Sumário rápido
    const totalTeto = rows.reduce((s, r) => s + r.teto, 0);
    const totalGasto = rows.reduce((s, r) => s + r.gasto, 0);
    const usoGeral = totalTeto > 0 ? (totalGasto / totalTeto * 100) : 0;

    doc.roundedRect(40, doc.y, doc.page.width - 80, 46, 8).fill('#F8FAFC');
    doc.fontSize(12).fillColor('#0F172A').text('📌 Visão Geral dos Tetos', 50, doc.y + 10);
    doc.fontSize(10).fillColor('#334155').text(
        `Tetos Considerados: R$ ${totalTeto.toLocaleString('pt-BR',{minimumFractionDigits:2})}  •  Gasto Acumulado: R$ ${totalGasto.toLocaleString('pt-BR',{minimumFractionDigits:2})}  •  Uso Médio: ${usoGeral.toFixed(1)}%`,
        50, doc.y + 26, { width: doc.page.width - 100 }
    );
    doc.y += 60;

    // Tabela principal
    const startX = 40; let y = doc.y;
    const cols = [
        { title: 'Plano', w: 250, align: 'left' },
        { title: 'Teto',  w: 110, align: 'right' },
        { title: 'Gasto', w: 110, align: 'right' },
        { title: 'Uso %', w: 70,  align: 'right' }
    ];

    doc.fontSize(12).fillColor('#111827').text('📋 Top 15 por uso do orçamento', startX, y);
    y += 6;

    // Cabeçalho
    doc.fontSize(10).fillColor('#334155');
    let x = startX;
    cols.forEach(c => { doc.text(c.title, x, y, { width: c.w, align: c.align }); x += c.w + 8; });
    y += 16; doc.moveTo(startX, y).lineTo(doc.page.width - 40, y).stroke('#E5E7EB'); y += 6;

    // Linhas
    const bottom = doc.page.height - 60; doc.fontSize(10).fillColor('#374151');
    for (const r of rows) {
        x = startX;
        const yellow = kpiThresholds.budgetHighUsageYellow ?? 90; // manter próximo ao BI padrão
        const red = kpiThresholds.budgetHighUsageRed ?? 100;
        const status = r.pct > red ? '🔴' : (r.pct >= yellow ? '🟡' : '🟢');
        const name = `${status} ${r.name}`;

        // Nome do plano
        doc.text(name, x, y, { width: cols[0].w, align: cols[0].align });
        // Descritivo, se houver (linha menor logo abaixo do nome)
        if (planDescriptions && planDescriptions[Number(r.p)]) {
            const desc = String(planDescriptions[Number(r.p)]).slice(0, 80);
            doc.fillColor('#64748B').fontSize(9).text(desc, x + 14, y + 12, { width: cols[0].w - 14 });
            doc.fillColor('#374151').fontSize(10);
        }
        x += cols[0].w + 8;

        // Valores
        doc.text(`R$ ${r.teto.toFixed(2)}`, x, y, { width: cols[1].w, align: cols[1].align }); x += cols[1].w + 8;
        doc.text(`R$ ${r.gasto.toFixed(2)}`, x, y, { width: cols[2].w, align: cols[2].align }); x += cols[2].w + 8;
        doc.text(`${r.pct.toFixed(1)}%`, x, y, { width: cols[3].w, align: cols[3].align });

        // Próxima linha (considerando espaço do descritivo)
        y += planDescriptions && planDescriptions[Number(r.p)] ? 26 : 16;

        // Quebra de página
        if (y > bottom) {
            doc.addPage();
            // Redesenhar cabeçalho da tabela na nova página
            y = 50; x = startX;
            doc.fontSize(10).fillColor('#334155');
            cols.forEach(c => { doc.text(c.title, x, y, { width: c.w, align: c.align }); x += c.w + 8; });
            y += 16; doc.moveTo(startX, y).lineTo(doc.page.width - 40, y).stroke('#E5E7EB'); y += 6;
            doc.fontSize(10).fillColor('#374151');
        }
    }
}

// 📋 PÁGINA 3: DETALHAMENTO INTELIGENTE
async function createIntelligentDetailPage(doc, data) {
    const { expenses, porPlano, year, month, planBudgets, planDisplay, planDescriptions } = data;
    
    // Cabeçalho (gradiente padronizado)
    const grad = doc.linearGradient(0,0,0,80); grad.stop(0,'#0F172A').stop(1,'#0EA5E9');
    doc.rect(0, 0, doc.page.width, 80).fill(grad);
    doc.fontSize(24).fillColor('#FFFFFF').text('📋 DETALHAMENTO INTELIGENTE', 0, 25, { align: 'center', width: doc.page.width });
    doc.fontSize(14).fillColor('#E5E7EB').text('Análise Detalhada por Planos de Conta', 0, 50, { align: 'center', width: doc.page.width });
    
    doc.y = 100;
    
    // Agrupar por planos e analisar
    const detailedAnalysis = Object.entries(porPlano)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8); // Top 8 planos
    
    doc.fontSize(16).fillColor('#0F172A').text('📊 ANÁLISE POR PLANO DE CONTA', { underline: true });
    doc.moveDown(1);
    
    detailedAnalysis.forEach(([plano, total], index) => {
        const planoExpenses = expenses.filter(e => String(e.account_plan_code||'') === String(plano));
        const avgTransaction = total / planoExpenses.length;
        
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];
        
        doc.roundedRect(40, doc.y, doc.page.width - 80, 80, 10).fill('#F8FAFC');
        
        // Header do plano
        doc.roundedRect(50, doc.y + 10, doc.page.width - 100, 25, 5).fill(colors[index]);
        const displayName = planDisplay(plano);
        doc.fillColor('#FFFFFF').fontSize(12).text(`${displayName}`, 60, doc.y + 18, { width: 260 });
        doc.text(`R$ ${total.toFixed(2)}`, 0, doc.y + 18, { width: doc.page.width - 110, align: 'right' });
        // Descritivo do plano (linha abaixo do cabeçalho colorido)
        if (planDescriptions && planDescriptions[Number(plano)]) {
            doc.fillColor('#374151').fontSize(9).text(`${String(planDescriptions[Number(plano)]).slice(0, 100)}`, 60, doc.y + 40, { width: doc.page.width - 120 });
        }
        
        // Detalhes
        const teto = planBudgets && planBudgets[Number(plano)] ? planBudgets[Number(plano)] : 0;
        const pct = teto>0 ? (total/teto*100) : 0;
        doc.fillColor('#374151').fontSize(10)
              .text(`• ${planoExpenses.length} transações`, 60, doc.y + 55)
              .text(`• Média por transação: R$ ${avgTransaction.toFixed(2)}`, 60, doc.y + 70)
              .text(`• Percentual do total: ${(total / expenses.reduce((sum, e) => sum + parseFloat(e.amount||0), 0) * 100 || 0).toFixed(1)}%`, 280, doc.y + 55)
              .text(`• Teto: R$ ${teto.toLocaleString('pt-BR',{minimumFractionDigits:2})} (${pct.toFixed(1)}%)`, 280, doc.y + 70);
          doc.y += 105;
    });
}

// 📜 PÁGINA 5: LISTA COMPLETA DE DESPESAS
async function createFullExpenseListPage(doc, data){
    const { expenses, planDisplay } = data;
    const grad = doc.linearGradient(0,0,0,80); grad.stop(0,'#0F172A').stop(1,'#0EA5E9');
    doc.rect(0, 0, doc.page.width, 80).fill(grad);
    doc.fontSize(24).fillColor('#FFFFFF').text('📜 LISTA COMPLETA DE DESPESAS', 0, 25, { align: 'center', width: doc.page.width });
    doc.y = 100;

    // Cabeçalho da tabela (ajustado para caber na largura útil da página)
    // Largura útil ~ (doc.page.width - 80). Com 5 espaçamentos de 6px = 30px, somatório das colunas deve ser <= (largura útil - 30)
    const cols = [
        { title: 'Data', width: 60 },
        { title: 'Conta', width: 85 },
        { title: 'Plano', width: 105 },
        { title: 'Tipo', width: 55 },
        { title: 'Descrição', width: 130 },
        { title: 'Valor (R$)', width: 50, align: 'right' }
    ];

    const startX = 40; let y = doc.y;
    const drawHeader = () => {
        doc.fontSize(11).fillColor('#1F2937');
        let x = startX;
        cols.forEach(c=>{ doc.text(c.title, x, y, { width: c.width, align: c.align||'left' }); x += c.width + 6; });
        y += 18; doc.moveTo(startX, y).lineTo(doc.page.width-40, y).stroke('#E5E7EB'); y += 6;
        doc.fontSize(10).fillColor('#374151');
    };
    drawHeader();

    // Ordenar por data desc para facilitar conferência
    const expensesSorted = (expenses||[]).slice().sort((a,b)=> new Date(b.transaction_date) - new Date(a.transaction_date));

    const rowHeight = 16; const bottom = doc.page.height - 60;
    let rowIndex = 0; let totalList = 0;
    for (const e of expensesSorted){
        const date = new Date(e.transaction_date).toLocaleDateString('pt-BR');
        const conta = e.account || '-';
        const plano = planDisplay ? planDisplay(e.account_plan_code) : String(e.account_plan_code||'Sem Plano');
        const tipo = e.is_business_expense ? 'Empresarial' : 'Pessoal';
    const desc = String(e.description||'').slice(0, 40);
        const amountNum = parseFloat(e.amount||0) || 0;
        const val = `R$ ${amountNum.toFixed(2)}`;
        totalList += amountNum;

        // Zebra stripe para legibilidade
        if (rowIndex % 2 === 1) {
            doc.rect(startX - 2, y - 2, (cols.reduce((s,c)=> s + c.width, 0) + 5*6) + 14, rowHeight + 4).fill('#F8FAFC');
            doc.fillColor('#374151');
        }

        let x = startX;
        doc.text(date, x, y, { width: cols[0].width }); x += cols[0].width + 6;
        doc.text(conta, x, y, { width: cols[1].width }); x += cols[1].width + 6;
        doc.text(plano, x, y, { width: cols[2].width }); x += cols[2].width + 6;
        doc.text(tipo, x, y, { width: cols[3].width }); x += cols[3].width + 6;
        doc.text(desc, x, y, { width: cols[4].width }); x += cols[4].width + 6;
        doc.text(val, x, y, { width: cols[5].width, align: 'right' });
        y += rowHeight; rowIndex++;

        if (y > bottom){
            doc.addPage();
            doc.y = 50; y = doc.y;
            drawHeader();
        }
    }

    // Totalizador no final da lista
    y += 8; let x = startX;
    doc.fontSize(10).fillColor('#1F2937');
    doc.text('TOTAL', x, y, { width: cols[0].width + cols[1].width + cols[2].width + cols[3].width + cols[4].width + 5*6 });
    x = startX + cols[0].width + cols[1].width + cols[2].width + cols[3].width + cols[4].width + 5*6;
    doc.text(`R$ ${totalList.toFixed(2)}`, x, y, { width: cols[5].width, align: 'right' });
}
// 📊 PÁGINA 4: GRÁFICOS MODERNOS
async function createModernChartsPage(doc, data) {
    const { expenses, porPlano, porConta, planDisplay } = data;
    
    // Cabeçalho (gradiente padronizado)
    const grad = doc.linearGradient(0,0,0,80); grad.stop(0,'#0F172A').stop(1,'#0EA5E9');
    doc.rect(0, 0, doc.page.width, 80).fill(grad);
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
            const displayPorPlano = Object.fromEntries(Object.entries(porPlano||{}).map(([k,v])=> [planDisplay(k), v]));
            const charts = await generateChartsForPDF(displayPorPlano, porConta, expenses, chartJSNodeCanvas);
            
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

            // Donut Pessoal vs Empresarial
            if (charts.comparisonChart) {
                doc.fontSize(14).fillColor('#1F2937').text('🍩 Pessoal vs Empresarial', { underline: true });
                doc.image(charts.comparisonChart, 50, doc.y + 20, { width: 300, height: 300 });
                doc.y += 340;
            }

            if (doc.y > 600) { doc.addPage(); doc.y = 50; }

            // Linha: Evolução diária dos gastos
            if (charts.evolutionChart) {
                doc.fontSize(14).fillColor('#1F2937').text('📈 Evolução Diária dos Gastos', { underline: true });
                doc.image(charts.evolutionChart, 50, doc.y + 20, { width: 500, height: 300 });
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

// 📚 PÁGINA FINAL: APÊNDICE NUMÉRICO COMPLETO
async function createNumericAppendixPage(doc, data) {
    const { expenses = [], total = 0, totalPessoal = 0, totalEmpresarial = 0, porPlano = {}, porConta = {}, planBudgets = {}, planDisplay, byPlan = {} } = data;

    // Cabeçalho (gradiente padronizado)
    const grad = doc.linearGradient(0,0,0,80); grad.stop(0,'#0F172A').stop(1,'#0EA5E9');
    doc.rect(0, 0, doc.page.width, 80).fill(grad);
    doc.fontSize(24).fillColor('#FFFFFF').text('📚 APÊNDICE NUMÉRICO', 0, 25, { align: 'center', width: doc.page.width });
    doc.fontSize(14).fillColor('#E5E7EB').text('Totais e valores consolidados do relatório', 0, 50, { align: 'center', width: doc.page.width });

    doc.y = 100;

    // A) Totais Gerais
    doc.fontSize(16).fillColor('#0F172A').text('A) Totais Gerais', 40, doc.y, { underline: true });
    doc.y += 10;
    doc.fontSize(11).fillColor('#374151')
       .text(`• Total Geral: R$ ${Number(total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}`, 50, doc.y)
       .text(`• Total Pessoal: R$ ${Number(totalPessoal||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}`, 50, doc.y+16)
       .text(`• Total Empresarial: R$ ${Number(totalEmpresarial||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}`, 50, doc.y+32);
    doc.y += 56;

    // B) Por Plano de Conta (todos que têm teto ou gasto)
    doc.fontSize(16).fillColor('#0F172A').text('B) Por Plano de Conta', 40, doc.y, { underline: true });
    doc.y += 8;
    const planIds = Array.from(new Set([ ...Object.keys(planBudgets||{}), ...Object.keys(byPlan||{}) ]));
    const planRows = planIds.map(id => {
        const teto = Number(planBudgets[id] || planBudgets[Number(id)] || 0) || 0;
        const gasto = Number(byPlan[id] || 0);
        const pct = teto > 0 ? (gasto / teto * 100) : 0;
        return { id: String(id), name: planDisplay ? planDisplay(id) : `Plano ${id}`, teto, gasto, pct };
    }).sort((a,b)=> b.gasto - a.gasto);

    // Tabela por Plano
    let startX = 40; let y = doc.y + 6;
    const colsPlan = [
        { title: 'Plano', w: 250, align: 'left' },
        { title: 'Teto',  w: 110, align: 'right' },
        { title: 'Gasto', w: 110, align: 'right' },
        { title: 'Uso %', w: 70,  align: 'right' },
    ];
    doc.fontSize(10).fillColor('#334155');
    let x = startX;
    colsPlan.forEach(c=>{ doc.text(c.title, x, y, { width: c.w, align: c.align }); x += c.w + 8; });
    y += 16; doc.moveTo(startX, y).lineTo(doc.page.width-40, y).stroke('#E5E7EB'); y += 6;
    const bottom = doc.page.height - 60; doc.fontSize(10).fillColor('#374151');
    let totalTeto = 0, totalGasto = 0;
    for (const r of planRows){
        x = startX;
        doc.text(r.name, x, y, { width: colsPlan[0].w, align: colsPlan[0].align }); x += colsPlan[0].w + 8;
        doc.text(`R$ ${r.teto.toFixed(2)}`, x, y, { width: colsPlan[1].w, align: colsPlan[1].align }); x += colsPlan[1].w + 8;
        doc.text(`R$ ${r.gasto.toFixed(2)}`, x, y, { width: colsPlan[2].w, align: colsPlan[2].align }); x += colsPlan[2].w + 8;
        doc.text(`${r.pct.toFixed(1)}%`, x, y, { width: colsPlan[3].w, align: colsPlan[3].align });
        y += 16; totalTeto += r.teto; totalGasto += r.gasto;

        if (y > bottom) { doc.addPage(); y = 50; x = startX; doc.fontSize(10).fillColor('#334155'); colsPlan.forEach(c=>{ doc.text(c.title, x, y, { width: c.w, align: c.align }); x += c.w + 8; }); y += 16; doc.moveTo(startX, y).lineTo(doc.page.width-40, y).stroke('#E5E7EB'); y += 6; doc.fontSize(10).fillColor('#374151'); }
    }
    // Linha de totais da tabela de planos
    const pctGeral = totalTeto>0 ? (totalGasto/totalTeto*100) : 0;
    x = startX; doc.fontSize(10).fillColor('#1F2937');
    doc.text('TOTAL', x, y, { width: colsPlan[0].w, align: colsPlan[0].align }); x += colsPlan[0].w + 8;
    doc.text(`R$ ${totalTeto.toFixed(2)}`, x, y, { width: colsPlan[1].w, align: colsPlan[1].align }); x += colsPlan[1].w + 8;
    doc.text(`R$ ${totalGasto.toFixed(2)}`, x, y, { width: colsPlan[2].w, align: colsPlan[2].align }); x += colsPlan[2].w + 8;
    doc.text(`${pctGeral.toFixed(1)}%`, x, y, { width: colsPlan[3].w, align: colsPlan[3].align });
    y += 24; doc.y = y;

    // C) Por Categoria (Contas)
    doc.fontSize(16).fillColor('#0F172A').text('C) Por Categoria (Contas)', 40, doc.y, { underline: true });
    doc.y += 8; y = doc.y;
    const accList = Object.entries(porConta||{}).sort(([,a],[,b])=> b-a);
    const colsAcc = [ { title: 'Categoria', w: 360, align: 'left' }, { title: 'Gasto', w: 130, align: 'right' } ];
    x = startX; doc.fontSize(10).fillColor('#334155');
    colsAcc.forEach(c=>{ doc.text(c.title, x, y, { width: c.w, align: c.align }); x += c.w + 8; });
    y += 16; doc.moveTo(startX, y).lineTo(doc.page.width-40, y).stroke('#E5E7EB'); y += 6;
    doc.fontSize(10).fillColor('#374151'); let totalAcc = 0;
    for (const [name, val] of accList){
        x = startX;
        doc.text(name, x, y, { width: colsAcc[0].w, align: colsAcc[0].align }); x += colsAcc[0].w + 8;
        doc.text(`R$ ${Number(val||0).toFixed(2)}`, x, y, { width: colsAcc[1].w, align: colsAcc[1].align });
        y += 16; totalAcc += Number(val||0);
        if (y > bottom) { doc.addPage(); y = 50; x = startX; doc.fontSize(10).fillColor('#334155'); colsAcc.forEach(c=>{ doc.text(c.title, x, y, { width: c.w, align: c.align }); x += c.w + 8; }); y += 16; doc.moveTo(startX, y).lineTo(doc.page.width-40, y).stroke('#E5E7EB'); y += 6; doc.fontSize(10).fillColor('#374151'); }
    }
    // Totalizador categorias
    x = startX; doc.fontSize(10).fillColor('#1F2937');
    doc.text('TOTAL', x, y, { width: colsAcc[0].w, align: colsAcc[0].align }); x += colsAcc[0].w + 8;
    doc.text(`R$ ${totalAcc.toFixed(2)}`, x, y, { width: colsAcc[1].w, align: colsAcc[1].align }); y += 24;

    // Nota de consistência
    const somaDespesas = (expenses||[]).reduce((s,e)=> s + Number(e.amount||0), 0);
    doc.fontSize(9).fillColor('#6B7280').text(
        `Verificação: soma por categorias = R$ ${totalAcc.toFixed(2)} • soma despesas = R$ ${somaDespesas.toFixed(2)} • diferença = R$ ${(totalAcc - somaDespesas).toFixed(2)}`,
        40, y, { width: doc.page.width - 80 }
    );
}

// 🧠 GERADOR DE INSIGHTS INTELIGENTES
function generateIntelligentInsights(expenses, total, totalPessoal, totalEmpresarial, year, month) {
    const insights = [];
    
    // Insight 1: Análise de proporção
    const proporcaoPessoal = total > 0 ? (totalPessoal / total * 100) : 0;
    if (proporcaoPessoal > (kpiThresholds.alerts?.personalProportionHigh ?? 75)) {
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
    const mediaTransacao = expenses.length ? (total / expenses.length) : 0;
    if (mediaTransacao > (kpiThresholds.insights?.avgTransactionHigh ?? 400)) {
        insights.push({
            icon: '💰',
            title: 'Transações de Alto Valor',
            description: `Média de R$ ${mediaTransacao.toFixed(2)} por transação. Transações de grande valor dominam o período.`
        });
    } else if (mediaTransacao < (kpiThresholds.insights?.avgTransactionLow ?? 70)) {
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
    
    if (frequenciaGastos >= (kpiThresholds.insights?.distributedMinPct ?? 75)) {
        insights.push({
            icon: '📅',
            title: 'Gastos Distribuídos',
            description: `Gastos em ${diasComGastos} de ${diasNoMes} dias (${frequenciaGastos.toFixed(1)}%). Boa distribuição temporal.`
        });
    } else if (frequenciaGastos <= (kpiThresholds.insights?.concentratedMaxPct ?? 35)) {
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
    const maiorGasto = expenses.length ? Math.max(...expenses.map(e => parseFloat(e.amount||0))) : 0;
    if (total > 0 && (maiorGasto / total) > (kpiThresholds.alerts?.largeTransactionShare ?? 0.25)) {
        alerts.push({
            level: 'atencao',
            icon: '⚠️',
            message: 'Concentração de Gastos Detectada',
            recommendation: `Uma única transação representa ${(maiorGasto/total*100).toFixed(1)}% do total. Verifique se é um gasto recorrente ou pontual.`
        });
    }
    
    // Alerta 2: Desequilíbrio pessoal vs empresarial
    const proporcaoPessoal2 = total > 0 ? (totalPessoal / total * 100) : 0;
    if (proporcaoPessoal2 > (kpiThresholds.alerts?.personalProportionHigh ?? 75)) {
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
    if (transacoesPorDia > (kpiThresholds.alerts?.highTransactionsPerDay ?? 12)) {
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
function analyzeTemporalPatterns(expenses, year, month) {
    const weekly = [
        { total: 0, count: 0 },
        { total: 0, count: 0 },
        { total: 0, count: 0 },
        { total: 0, count: 0 },
        { total: 0, count: 0 }
    ];
    
    expenses.forEach(expense => {
        const day = new Date(expense.transaction_date).getDate();
        const weekIndex = Math.min(Math.floor((day - 1) / 7), 4);
        
        weekly[weekIndex].total += parseFloat(expense.amount);
        weekly[weekIndex].count++;
    });
    
    return { weekly };
}

// ⚖️ ANÁLISE COMPARATIVA
function generateComparativeAnalysis(expenses, total, totalPessoal, totalEmpresarial) {
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
    const pessoaisCount = expenses.filter(e => !e.is_business_expense).length;
    const empresariaisCount = expenses.filter(e => e.is_business_expense).length;
    
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
    try { const f=ensurePrimaryFont(); if(f){ doc.registerFont('NotoSans', f); doc.font('NotoSans'); } } catch{}
        
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
    const { year, month, account } = req.body;

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
        
        if (account && billingPeriods[account] && !billingPeriods[account].isRecurring) {
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
            console.log(`📊 [STEP 2.2] Usando período padrão mensal (mês civil)`);
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
                try { const f=ensurePrimaryFont(); if(f){ doc.registerFont('NotoSans', f); doc.font('NotoSans'); } } catch{}
                
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
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio-vazio-${year}-${month}.pdf`);
            doc.pipe(res);
            doc.end();
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

        console.log(`🧠 [STEP 11] Iniciando geração do relatório (formato solicitado)...`);
        
        try {
            const format = (req.body && req.body.format) || (req.query && req.query.format) || 'full';
            // Carregar planos de contas atualizados do ADM (DB)
            let planMapsForReport = {};
            try {
                const coa = await loadChartOfAccountsFromDb();
                planMapsForReport = (coa && coa.maps) ? coa.maps : {};
            } catch (e) {
                console.warn('⚠️ Falha ao carregar planos do DB para o relatório, usando fallback do arquivo:', e.message);
            }

            if (String(format).toLowerCase() === 'summary') {
                // Relatório compacto (1–2 páginas)
                const compactDoc = await generateCompactMonthlyReport({
                    pool, userId, year, month, account,
                    expenses, total, totalPessoal, totalEmpresarial,
                    porPlano, porConta, startDate, endDate, contaNome,
                    planNames: planMapsForReport.names,
                    planBudgets: planMapsForReport.budgets,
                    planDescriptions: planMapsForReport.descriptions
                });
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=relatorio-resumo-${year}-${month}${account ? '-' + account : ''}.pdf`);
                // Importante: pipe antes de finalizar e encerrar o documento
                compactDoc.pipe(res);
                compactDoc.end();
                console.log(`✅ [STEP 11] Relatório compacto gerado e enviado.`);
                return; // Evitar execução de código residual
            } else {
                // Relatório BI completo (4 páginas)
                const biReport = await generateIntelligentBIReport({
                    expenses,
                    total,
                    totalEmpresarial,
                    totalPessoal,
                    empresariais,
                    pessoaisFiltrados,
                    expensesByPlan,
                    startDate,
                    endDate,
                    contaNome,
                    year,
                    month,
                    porPlano,
                    porConta,
                    userId,
                    planMaps: planMapsForReport,
                    planNames: planMapsForReport.names,
                    planBudgets: planMapsForReport.budgets,
                    planTypes: planMapsForReport.types,
                    planDescriptions: planMapsForReport.descriptions
                });
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=relatorio-bi-inteligente-${year}-${month}${account ? '-' + account : ''}.pdf`);
                // Importante: pipe antes de finalizar e encerrar o documento
                biReport.pipe(res);
                biReport.end();
                console.log(`✅ [STEP 11] Relatório BI completo gerado e enviado.`);
                return; // Evitar execução de código residual
            }

        } catch (biError) {
            console.error(`❌ [ERRO] Falha na geração do relatório BI:`, biError);
            throw new Error(`Erro ao gerar relatório BI inteligente: ${biError.message}`);
        }
        // Nota: fluxo encerrado via returns acima. Código antigo de desenho direto foi removido.

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
                
                let namesMapForPdf = {};
                let budgetsMapForPdf = {};
                let descMapForPdf = {};
                try {
                    const coa = await loadChartOfAccountsFromDb();
                    namesMapForPdf = coa?.maps?.names || {};
                    budgetsMapForPdf = coa?.maps?.budgets || {};
                    descMapForPdf = coa?.maps?.descriptions || {};
                } catch {
                    const fileMaps = accountsConfig.asMaps ? accountsConfig.asMaps() : {};
                    namesMapForPdf = fileMaps.names || {};
                    budgetsMapForPdf = fileMaps.budgets || {};
                    descMapForPdf = fileMaps.descriptions || {};
                }
                const simpleDoc = await generateSimplePDF(expenses, total, startDate, endDate, contaNome, year, month, { budgets: budgetsMapForPdf, names: namesMapForPdf, descriptions: descMapForPdf });
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=relatorio-simplificado-${year}-${month}${account ? '-' + account : ''}.pdf`);
                simpleDoc.pipe(res);
                simpleDoc.end();
                
                console.log('✅ [FALLBACK] PDF simplificado gerado com sucesso!');
                return;
                
            } else if (startDate && endDate) {
                console.log('📄 [FALLBACK] Dados limitados, gerando PDF vazio...');
                
                // Gerar PDF vazio se não há despesas mas temos as datas
                const emptyDoc = new pdfkit();
                try { const f=ensurePrimaryFont(); if(f){ emptyDoc.registerFont('NotoSans', f); emptyDoc.font('NotoSans'); } } catch{}
                try { emptyDoc.font('Helvetica'); } catch { emptyDoc.font('Times-Roman'); }
                
                emptyDoc.fontSize(20).text('RELATÓRIO FINANCEIRO MENSAL', { align: 'center' });
                emptyDoc.moveDown();
                emptyDoc.fontSize(14).text(`Período: ${(startDate || new Date()).toLocaleDateString('pt-BR')} a ${(endDate || new Date()).toLocaleDateString('pt-BR')}`, { align: 'center' });
                emptyDoc.text(`Conta: ${contaNome}`, { align: 'center' });
                emptyDoc.moveDown(2);
                emptyDoc.fontSize(16).text('Nenhuma despesa encontrada para este período.', { align: 'center' });
                emptyDoc.moveDown();
                emptyDoc.fontSize(12).text('Relatório gerado em modo de recuperação.', { align: 'center' });
                
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=relatorio-fallback-${year}-${month}.pdf`);
                emptyDoc.pipe(res);
                emptyDoc.end();
                
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
    try { const f=ensurePrimaryFont(); if(f){ testDoc.registerFont('NotoSans', f); testDoc.font('NotoSans'); } } catch{}
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

// CRUD de pagamentos mensais por recorrência PIX/Boleto (garante 1x por mês por item)
// Criar pagamento do mês: POST /api/recurring-expenses/:id/payments  { year, month, overrides? }
app.post('/api/recurring-expenses/:id/payments', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const recId = parseInt(req.params.id, 10);
        const { year, month, amount, description, account_plan_code, is_business_expense, day_of_month, transaction_date } = req.body || {};

        if (!recId || !year || !month) {
            return res.status(400).json({ message: 'recurring_expense_id, ano e mês são obrigatórios.' });
        }

        // Verificar se recorrente existe e pertence ao usuário e é da conta PIX/Boleto
        const [recs] = await pool.query('SELECT * FROM recurring_expenses WHERE id = ? AND user_id = ? AND is_active = 1', [recId, userId]);
        const rec = recs[0];
        if (!rec) return res.status(404).json({ message: 'Despesa recorrente não encontrada.' });
        if (rec.account !== 'PIX/Boleto') return res.status(400).json({ message: 'Apenas recorrentes da conta PIX/Boleto são suportados.' });

        const monthKey = `${year}-${String(month).padStart(2,'0')}`;

        // Idempotência: já pago no mês?
        const [exists] = await pool.query('SELECT id, expense_id FROM recurring_expense_processing WHERE recurring_expense_id = ? AND processed_month = ?', [recId, monthKey]);
        if (exists.length) {
            const eid = exists[0].expense_id;
            const [expRows] = await pool.query('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [eid, userId]);
            return res.status(409).json({ message: 'Pagamento deste recorrente já registrado para o mês.', expense: expRows[0] || null });
        }

        // Determinar data do pagamento
        let payDate;
        if (transaction_date) {
            payDate = new Date(transaction_date);
        } else {
            const dom = parseInt(day_of_month || rec.day_of_month || 1, 10);
            payDate = new Date(year, month - 1, isNaN(dom) ? 1 : dom);
            // Ajustar para último dia válido do mês, se necessário
            if (payDate.getMonth() !== month - 1) payDate.setDate(0);
        }
        const formattedDate = payDate.toISOString().slice(0,10);

        // Inserir despesa
        const [ins] = await pool.query(
            `INSERT INTO expenses (user_id, transaction_date, amount, description, account, 
                 is_business_expense, account_plan_code, is_recurring_expense, recurring_expense_id, total_installments) 
             VALUES (?,?,?,?,?,?,?,?,?, 1)`,
            [
                userId,
                formattedDate,
                parseFloat(amount != null ? amount : rec.amount),
                description || rec.description,
                'PIX/Boleto',
                is_business_expense != null ? (is_business_expense ? 1 : 0) : (rec.is_business_expense ? 1 : 0),
                account_plan_code != null ? account_plan_code : rec.account_plan_code,
                1,
                recId
            ]
        );

        // Registrar processamento do mês
        await pool.query('INSERT INTO recurring_expense_processing (recurring_expense_id, processed_month, expense_id) VALUES (?,?,?)', [recId, monthKey, ins.insertId]);

        const [created] = await pool.query('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [ins.insertId, userId]);
        return res.status(201).json({ message: 'Pagamento registrado com sucesso.', expense: created[0] });
    } catch (error) {
        console.error('Erro ao criar pagamento recorrente:', error);
        if (String(error.message||'').includes('unique_processing')) {
            return res.status(409).json({ message: 'Pagamento já existe para este mês.' });
        }
        res.status(500).json({ message: 'Erro ao registrar pagamento.' });
    }
});

// Ler pagamento do mês: GET /api/recurring-expenses/:id/payments?year=&month=
app.get('/api/recurring-expenses/:id/payments', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const recId = parseInt(req.params.id, 10);
        const { year, month } = req.query;
        if (!recId || !year || !month) return res.status(400).json({ message: 'recurring_expense_id, ano e mês são obrigatórios.' });
        const monthKey = `${year}-${String(month).padStart(2,'0')}`;
        const [rows] = await pool.query(`
            SELECT e.* FROM recurring_expense_processing rep 
            JOIN expenses e ON e.id = rep.expense_id AND e.user_id = ?
            WHERE rep.recurring_expense_id = ? AND rep.processed_month = ?
        `, [userId, recId, monthKey]);
        if (!rows.length) return res.status(404).json({ message: 'Pagamento não encontrado para este mês.' });
        res.json(rows[0]);
    } catch (e) {
        console.error('Erro ao ler pagamento recorrente:', e);
        res.status(500).json({ message: 'Erro ao ler pagamento.' });
    }
});

// Atualizar pagamento do mês: PUT /api/recurring-expenses/:id/payments  { year, month, fields... }
app.put('/api/recurring-expenses/:id/payments', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const recId = parseInt(req.params.id, 10);
        const { year, month, amount, description, account_plan_code, is_business_expense, transaction_date } = req.body || {};
        if (!recId || !year || !month) return res.status(400).json({ message: 'recurring_expense_id, ano e mês são obrigatórios.' });
        const monthKey = `${year}-${String(month).padStart(2,'0')}`;
        const [repRows] = await pool.query('SELECT * FROM recurring_expense_processing WHERE recurring_expense_id = ? AND processed_month = ?', [recId, monthKey]);
        if (!repRows.length) return res.status(404).json({ message: 'Pagamento não encontrado.' });
        const expenseId = repRows[0].expense_id;

        // Se data alterar para outro mês, validar ausência prévia e atualizar processed_month
        let newDate = transaction_date ? new Date(transaction_date) : null;
        if (newDate && (newDate.getMonth()+1 !== parseInt(month) || newDate.getFullYear() !== parseInt(year))) {
            const newKey = `${newDate.getFullYear()}-${String(newDate.getMonth()+1).padStart(2,'0')}`;
            const [dup] = await pool.query('SELECT id FROM recurring_expense_processing WHERE recurring_expense_id = ? AND processed_month = ?', [recId, newKey]);
            if (dup.length) return res.status(409).json({ message: 'Já existe pagamento para o mês alvo.' });
            await pool.query('UPDATE recurring_expense_processing SET processed_month = ? WHERE id = ?', [newKey, repRows[0].id]);
        }

        // Atualizar a despesa
        const fields = [];
        const params = [];
        if (amount != null) { fields.push('amount = ?'); params.push(parseFloat(amount)); }
        if (description != null) { fields.push('description = ?'); params.push(description); }
        if (account_plan_code !== undefined) { fields.push('account_plan_code = ?'); params.push(account_plan_code || null); }
        if (is_business_expense !== undefined) { fields.push('is_business_expense = ?'); params.push(is_business_expense ? 1 : 0); }
        if (transaction_date) { fields.push('transaction_date = ?'); params.push(new Date(transaction_date).toISOString().slice(0,10)); }
        if (!fields.length) return res.json({ message: 'Nada para atualizar.' });
        params.push(expenseId, userId);
        await pool.query(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params);
        const [updated] = await pool.query('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [expenseId, userId]);
        res.json({ message: 'Pagamento atualizado com sucesso.', expense: updated[0] });
    } catch (e) {
        console.error('Erro ao atualizar pagamento recorrente:', e);
        res.status(500).json({ message: 'Erro ao atualizar pagamento.' });
    }
});

// Apagar pagamento do mês: DELETE /api/recurring-expenses/:id/payments?year=&month=
app.delete('/api/recurring-expenses/:id/payments', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const recId = parseInt(req.params.id, 10);
        const { year, month } = req.query;
        if (!recId || !year || !month) return res.status(400).json({ message: 'recurring_expense_id, ano e mês são obrigatórios.' });
        const monthKey = `${year}-${String(month).padStart(2,'0')}`;
        const [repRows] = await pool.query('SELECT * FROM recurring_expense_processing WHERE recurring_expense_id = ? AND processed_month = ?', [recId, monthKey]);
        if (!repRows.length) return res.status(404).json({ message: 'Pagamento não encontrado.' });
        const expenseId = repRows[0].expense_id;
        await pool.query('DELETE FROM expenses WHERE id = ? AND user_id = ?', [expenseId, userId]);
        await pool.query('DELETE FROM recurring_expense_processing WHERE id = ?', [repRows[0].id]);
        res.json({ message: 'Pagamento removido com sucesso.' });
    } catch (e) {
        console.error('Erro ao apagar pagamento recorrente:', e);
        res.status(500).json({ message: 'Erro ao apagar pagamento.' });
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
        const total = rows.reduce((s, r) => {
            const n = parseFloat(r.amount);
            return s + (isNaN(n) ? 0 : n);
        }, 0);
        const count = rows.length;
        const ticket = count ? total / count : 0;
        const recur = rows
            .filter(r => r.is_recurring_expense)
            .reduce((s, r) => {
                const n = parseFloat(r.amount);
                return s + (isNaN(n) ? 0 : n);
            }, 0);
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
        const { type } = req.query; // business | personal (opcional)
        const config = accountsConfig.getChartOfAccounts ? accountsConfig.getChartOfAccounts() : null;
        const plans = (config && Array.isArray(config.plans)) ? config.plans : [];
        let list = plans.map(p => ({
            id: p.id,
            name: p.name || `Plano ${p.id}`,
            description: p.description || '',
            type: p.type || 'personal',
            defaultBudget: p.defaultBudget != null ? Number(p.defaultBudget) : 0
        }));
        if (type && (type === 'business' || type === 'personal')) {
            list = list.filter(p => (p.type||'').toLowerCase() === type.toLowerCase());
        }
        res.json(list);
    } catch (error) {
        console.error('❌ Erro ao buscar planos de conta (central):', error);
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
    try { const f=ensurePrimaryFont(); if(f){ doc.registerFont('NotoSans', f); doc.font('NotoSans'); } } catch{}
        
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
        
        // Query para dados por categoria (descrição) - mantido para compatibilidade
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

        // Query para dados por plano de contas (account_plan_code) - novo
        let planQuery = `
            SELECT account_plan_code AS plan_code, SUM(amount) AS total
            FROM expenses
            WHERE user_id = ? AND is_business_expense = 1
        `;
        const planParams = [userId];
        if (year) {
            planQuery += ' AND YEAR(transaction_date) = ?';
            planParams.push(year);
        }
        if (month) {
            planQuery += ' AND MONTH(transaction_date) = ?';
            planParams.push(month);
      }
        planQuery += ' GROUP BY account_plan_code ORDER BY total DESC LIMIT 15';
        const [planData] = await pool.query(planQuery, planParams);
        
        // Organizar dados
        const byAccount = {};
        accountData.forEach(item => {
            byAccount[item.account] = parseFloat(item.total);
        });
        
        const byCategory = {};
        categoryData.forEach(item => {
            byCategory[item.category] = parseFloat(item.total);
        });
        const byPlan = {};
        planData.forEach(item => {
            const key = (item.plan_code === null || item.plan_code === undefined) ? 'Sem Plano' : String(item.plan_code);
            byPlan[key] = parseFloat(item.total);
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
            byCategory,
            byPlan
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
        
        // Agrupar por categoria (descrição)
        const byCategory = {};
        expenses.forEach(exp => {
            const category = exp.description || 'Sem categoria';
            byCategory[category] = (byCategory[category] || 0) + parseFloat(exp.amount);
        });
        // Agrupar por plano de contas (account_plan_code)
        const byPlan = {};
        expenses.forEach(exp => {
            const code = (exp.account_plan_code === null || exp.account_plan_code === undefined) ? 'Sem Plano' : String(exp.account_plan_code);
            byPlan[code] = (byPlan[code] || 0) + parseFloat(exp.amount);
        });
        
        res.json({
            expenses,
            summary: {
                total,
                count,
                average,
                byAccount,
                byCategory,
                byPlan
            }
        });
        
    } catch (error) {
        console.error('Erro na análise empresarial avançada:', error);
        res.status(500).json({ message: 'Erro na análise empresarial avançada.' });
    }
});

// API para calcular gastos previstos e parcelas futuras
app.get('/api/business/predictions', authenticateToken, async (req, res) => {
    const started = Date.now();
    try {
        const userId = req.user.id;
        const { year, month, debug } = req.query;

        const currentYear = year ? parseInt(year) : new Date().getFullYear();
        const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

        // 1. Buscar gastos recorrentes empresariais ativos
        const [recurringExpenses] = await pool.query(`
            SELECT id, description, amount, category FROM recurring_expenses 
            WHERE user_id = ? AND is_business_expense = 1 AND is_active = 1
        `, [userId]);
        const predictedFromRecurring = recurringExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);

        // 2. Média histórica dos 3 meses anteriores completos (exclui mês atual)
        const [historicalData] = await pool.query(`
            SELECT AVG(month_total) AS avg_amount FROM (
               SELECT YEAR(transaction_date) y, MONTH(transaction_date) m, SUM(amount) AS month_total
               FROM expenses
               WHERE user_id=? AND is_business_expense=1
                 AND DATE(CONCAT(YEAR(transaction_date),'-',LPAD(MONTH(transaction_date),2,'0'),'-01')) < DATE(CONCAT(?, '-', LPAD(?,2,'0'), '-01'))
               GROUP BY y,m
               ORDER BY y DESC, m DESC
               LIMIT 3
            ) t;
        `, [userId, currentYear, currentMonth]);
        const historicalAverage = parseFloat(historicalData[0]?.avg_amount) || 0;

        // 3. Previsão combinada (ajustável no futuro via pesos)
        const WEIGHT_RECURRING = 0.7;
        const WEIGHT_HIST = 0.3;
        const predictedExpenses = (predictedFromRecurring * WEIGHT_RECURRING) + (historicalAverage * WEIGHT_HIST);

        // 4. Parcelas futuras (corrigido: usar installment_number no lugar de current_installment)
        const [futureInstallments] = await pool.query(`
            SELECT SUM(amount * (total_installments - COALESCE(installment_number,1))) AS future_total
            FROM expenses
            WHERE user_id=? AND is_business_expense=1
              AND total_installments > 1
              AND COALESCE(installment_number,1) < total_installments
        `, [userId]);
        const futureTotal = parseFloat(futureInstallments[0]?.future_total) || 0;

        const payload = {
            period: { year: currentYear, month: currentMonth },
            predicted: predictedExpenses,
            recurring: predictedFromRecurring,
            historical: historicalAverage,
            futureInstallments: futureTotal,
            weights: { recurring: WEIGHT_RECURRING, historical: WEIGHT_HIST },
            elapsedMs: Date.now() - started
        };

        if (debug === '1') {
            payload.debug = {
                recurringCount: recurringExpenses.length,
                sampleRecurring: recurringExpenses.slice(0,5),
                queryWindow: '3 meses anteriores completos',
                rawHistorical: historicalData,
                futureInstallmentsRaw: futureInstallments
            };
            console.log('🔍 /api/business/predictions debug payload:', payload.debug);
        }

        res.json(payload);

    } catch (error) {
        console.error('Erro ao calcular previsões:', error);
        res.status(500).json({ message: 'Erro ao calcular previsões.', detail: error.message });
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
// Cache helpers (Redis when available, fallback to in-memory)
const redisClient = getRedis();
const inMemoryCache = new Map();
const RECURRING_BI_TTL_SEC = 60; // 1 minuto

app.get('/api/recurring-pix-boleto', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month, debug } = req.query;
        const currentYear = year ? parseInt(year) : new Date().getFullYear();
        const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

        // Try serve from cache first (key per user/year/month)
        const cacheKey = `recurring_bi:${userId}:${currentYear}:${currentMonth}`;
        try {
            if (redisClient) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    return res.json(JSON.parse(cached));
                }
            } else if (inMemoryCache.has(cacheKey)) {
                const entry = inMemoryCache.get(cacheKey);
                if (Date.now() - entry.time < RECURRING_BI_TTL_SEC * 1000) {
                    return res.json(entry.data);
                } else {
                    inMemoryCache.delete(cacheKey);
                }
            }
        } catch (cacheErr) {
            console.warn('Cache get falhou (ignorado):', cacheErr.message);
        }

                // 1. Buscar gastos recorrentes PIX/Boleto (normalização tolerante a variações / espaços / hífens)
                const [recurringExpenses] = await pool.query(`
                        SELECT * FROM recurring_expenses 
                        WHERE user_id = ? 
                            AND is_active = 1
                            AND (
                                        UPPER(REPLACE(REPLACE(REPLACE(account,' ',''),'-',''),'\\\n','')) REGEXP 'PIX|BOLETO'
                                 OR UPPER(account) REGEXP 'PIX'
                                 OR UPPER(account) REGEXP 'BOLETO'
                            )
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

        // 5. Comparação recorrente vs não recorrente (mês corrente)
        let recurringMonthActual = 0;
        for (const r of results) {
            const h = (r.history || []).find(hm => hm.year === currentYear && hm.month === currentMonth);
            if (h) recurringMonthActual += Number(h.actual || 0);
        }
        let nonRecurringMonthActual = 0;
        try {
            const [nonRecRows] = await pool.query(`
                SELECT amount FROM expenses 
                WHERE user_id = ? 
                  AND (
                        UPPER(REPLACE(REPLACE(REPLACE(account,' ',''),'-',''),'\\\n','')) REGEXP 'PIX|BOLETO'
                     OR UPPER(account) REGEXP 'PIX'
                     OR UPPER(account) REGEXP 'BOLETO'
                  )
                  AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
                  AND (recurring_expense_id IS NULL OR recurring_expense_id = 0)
            `, [userId, currentYear, currentMonth]);
            nonRecurringMonthActual = nonRecRows.reduce((s,r)=> s + Number(r.amount||0),0);
        } catch(e) {
            console.warn('Falha ao calcular não recorrentes mês corrente:', e.message);
        }
        const combined = recurringMonthActual + nonRecurringMonthActual;
        const recurringShare = combined > 0 ? (recurringMonthActual / combined) * 100 : 0;

        // 6. MonthlyHistory agregado (SUM por mês de planned e actual reais) - últimos 12 meses
        const monthlyHistory = [];
        for (let i = 11; i >= 0; i--) {
            const refDate = new Date(currentYear, currentMonth - 1 - i, 1);
            const y = refDate.getFullYear();
            const m = refDate.getMonth() + 1;
            // Planned: soma dos plannedAmount (valor recorrente cadastrado) dos itens ativos (simplificação)
            const totalPlanned = results.reduce((s, r) => s + Number(r.plannedAmount || 0), 0);
            // Actual: somar todos os actual daquele mês a partir do history dos resultados
            let totalActual = 0;
            for (const r of results) {
                const h = (r.history || []).find(hh => hh.year === y && hh.month === m);
                if (h) totalActual += Number(h.actual || 0);
            }
            const variationPercent = totalPlanned > 0 ? ((totalActual - totalPlanned) / totalPlanned) * 100 : 0;
            monthlyHistory.push({
                year: y,
                month: m,
                monthLabel: refDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
                totalPlanned,
                totalActual,
                variationPercent
            });
        }

        // 7. Discrepância: comparar soma de actual no mês corrente via history vs agregação direta de despesas
        let directActualMonth = 0;
        try {
            const [directRows] = await pool.query(`
                SELECT SUM(amount) as total FROM expenses
                WHERE user_id = ?
                  AND YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
                  AND (
                        UPPER(REPLACE(REPLACE(REPLACE(account,' ',''),'-',''),'\\n','')) REGEXP 'PIX|BOLETO'
                     OR UPPER(account) REGEXP 'PIX'
                     OR UPPER(account) REGEXP 'BOLETO'
                  )
            `, [userId, currentYear, currentMonth]);
            directActualMonth = Number(directRows[0]?.total || 0);
        } catch (aggErr) {
            console.warn('Falha ao agregar despesas diretas PIX/Boleto (discrepância):', aggErr.message);
        }
        const historyActualMonth = monthlyHistory.find(m => m.year === currentYear && m.month === currentMonth)?.totalActual || 0;
        const discrepancyValue = directActualMonth - historyActualMonth;
        const discrepancyPercent = historyActualMonth > 0 ? (discrepancyValue / historyActualMonth) * 100 : (directActualMonth ? 100 : 0);

        const responsePayload = {
            period: { year: currentYear, month: currentMonth },
            summary,
            expenses: results,
            comparison: { recurringMonthActual, nonRecurringMonthActual, recurringShare },
            monthlyHistory,
            discrepancy: { directActualMonth, historyActualMonth, discrepancyValue, discrepancyPercent }
        };

        if (debug === '1') {
            // Distinct accounts (recorrentes + despesas últimos 12 meses) para diagnóstico
            try {
                const [distinctExpenseAccounts] = await pool.query(`
                    SELECT DISTINCT account FROM expenses 
                    WHERE user_id = ? 
                      AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                    ORDER BY account
                `, [userId]);
                responsePayload.debug = {
                    recurringAccounts: [...new Set(recurringExpenses.map(r => r.account))],
                    expenseAccountsLast12M: distinctExpenseAccounts.map(r => r.account),
                    counts: {
                        recurringFetched: recurringExpenses.length,
                        expensesMatched: results.length,
                        distinctExpenseAccounts: distinctExpenseAccounts.length,
                        monthlyHistoryLength: monthlyHistory.length
                    }
                };
                console.log('🔍 DEBUG recurring-pix-boleto:', responsePayload.debug);
            } catch (diagErr) {
                console.warn('Falha debug recurring-pix-boleto:', diagErr.message);
            }
        }

        // Store in cache (best effort)
        try {
            if (redisClient) {
                await redisClient.setex(cacheKey, RECURRING_BI_TTL_SEC, JSON.stringify(responsePayload));
            } else {
                inMemoryCache.set(cacheKey, { data: responsePayload, time: Date.now() });
            }
        } catch (cacheSetErr) {
            console.warn('Cache set falhou (ignorado):', cacheSetErr.message);
        }

        res.json(responsePayload);

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
// Nota: A  d

module.exports = app;
