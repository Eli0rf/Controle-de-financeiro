/*
  generate-sample-pdf.js
  Standalone PDF generator for quick validation without DB/auth.
  Creates a multi-page monthly report demo using pdfkit and sample data.
*/

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Accessible palette (Okabe–Ito + Tailwind-inspired)
const palette = {
  bg: '#FFFFFF',
  text: '#1F2937',
  textMuted: '#475569',
  textSoft: '#64748B',
  textStrong: '#0F172A',
  border: '#E5E7EB',
  surface: '#F8FAFC',
  primary: '#1D4ED8',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  accentLine: '#CBD5E1'
};

function monthNameBR(monthIdx1) {
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return names[(monthIdx1-1)%12];
}

function buildSampleData() {
  // Current month sample
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // plan codes and names (mimic chart_of_accounts)
  const planNames = {
    101: 'Alimentação',
    102: 'Moradia',
    103: 'Transporte',
    201: 'Marketing',
    202: 'Serviços',
    203: 'Impostos'
  };
  const planBudgets = { 101: 1200, 102: 2500, 103: 600, 201: 2000, 202: 3000, 203: 1800 };

  // Sample expenses
  const mkDate = (d) => new Date(year, month-1, d).toISOString().slice(0,10);
  const expenses = [
    { transaction_date: mkDate(1),  amount: 58.90,  description: 'Padaria', account: 'Nu Bank Ketlyn', account_plan_code: 101, is_business_expense: 0 },
    { transaction_date: mkDate(2),  amount: 240.00, description: 'Supermercado', account: 'PIX/Boleto', account_plan_code: 101, is_business_expense: 0 },
    { transaction_date: mkDate(3),  amount: 1800.00,description: 'Aluguel', account: 'PIX/Boleto', account_plan_code: 102, is_business_expense: 0 },
    { transaction_date: mkDate(4),  amount: 120.00, description: 'Uber', account: 'Nu Vainer', account_plan_code: 103, is_business_expense: 0 },
    { transaction_date: mkDate(5),  amount: 950.00, description: 'Agência - Tráfego Pago', account: 'PicPay Vainer', account_plan_code: 201, is_business_expense: 1 },
    { transaction_date: mkDate(6),  amount: 420.00, description: 'Hospedagem/Cloud', account: 'Ourocard Ketlyn', account_plan_code: 202, is_business_expense: 1 },
    { transaction_date: mkDate(8),  amount: 1550.00,description: 'Impostos', account: 'PIX/Boleto', account_plan_code: 203, is_business_expense: 1 },
    { transaction_date: mkDate(9),  amount: 75.00,  description: 'Gasolina', account: 'Nu Bank Ketlyn', account_plan_code: 103, is_business_expense: 0 },
    { transaction_date: mkDate(10), amount: 89.90,  description: 'Assinatura Streaming', account: 'Nu Vainer', account_plan_code: null, is_business_expense: 0 },
    { transaction_date: mkDate(11), amount: 350.00, description: 'Design Freelancer', account: 'PicPay Vainer', account_plan_code: 201, is_business_expense: 1 }
  ];

  const total = expenses.reduce((s,e)=> s + Number(e.amount||0), 0);
  return { year, month, contaNome: 'ALL', expenses, total, planNames, planBudgets };
}

function planDisplay(code, planNames) {
  if (code == null || code === '') return 'Sem Plano';
  const id = Number(code);
  return planNames[id] || `Plano ${id}`;
}

function generatePDF({ year, month, contaNome, expenses, total, planNames, planBudgets }, outPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 35, size: 'A4' });
    const ws = fs.createWriteStream(outPath);
    doc.pipe(ws);

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
      doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`,
        doc.page.width - 90, 20, { width: 80, align: 'right' });
      sectionTitle(text, 50);
    };

    // Header
    const grad = doc.linearGradient(0,0,0,140); grad.stop(0,'#0F172A').stop(1,'#0EA5E9');
    doc.rect(0,0,doc.page.width,140).fill(grad);
    doc.fillColor('#FFFFFF').fontSize(26).text('RELATÓRIO FINANCEIRO (DEMO)',40,40,{width:doc.page.width-80});
    doc.fontSize(13).fillColor('#E2E8F0').text(`${monthNameBR(month)}/${year} • ${contaNome}`,40,90);
    doc.fontSize(10).fillColor('#94A3B8').text(`Gerado em ${new Date().toLocaleString('pt-BR')}`,40,108);
    drawPageNumber();

    doc.y = 155;

    // Summary cards
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const totalPessoal = safeExpenses.filter(e=>!e.is_business_expense).reduce((s,e)=>s+Number(e.amount||0),0);
    const totalEmp = safeExpenses.filter(e=>e.is_business_expense).reduce((s,e)=>s+Number(e.amount||0),0);
    const cardW = (doc.page.width-80)/3; const y0 = doc.y; const cardH=90;
    function card(x,color,title,value,sub){
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

    // Compute aggregations
    const byPlanPersonal = {}; const byPlanBusiness = {}; const byAccount = {};
    safeExpenses.forEach(e=>{
      const p=(e.account_plan_code!=null && e.account_plan_code!=='')? String(e.account_plan_code) : 'Sem Plano';
      const val = Number(e.amount||0);
      if(e.is_business_expense) byPlanBusiness[p]=(byPlanBusiness[p]||0)+val; else byPlanPersonal[p]=(byPlanPersonal[p]||0)+val;
      const c = e.account || 'Sem Conta'; byAccount[c] = (byAccount[c]||0) + val;
    });

    // Pessoal
    const totalPersonalType = Object.values(byPlanPersonal).reduce((a,b)=>a+b,0);
    newPageWithTitle('🏠 Análise por Plano de Conta — Pessoal');
    let tyP = 80; doc.fontSize(9).fillColor('#374151');
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
      doc.fillColor(palette.text).fontSize(9).text(planDisplay(p, planNames),45,tyP);
      doc.text(v.toLocaleString('pt-BR',{minimumFractionDigits:2}),200,tyP,{width:120,align:'right'});
      doc.text(pct.toFixed(1)+'%',330,tyP,{width:40,align:'right'});
      doc.text(teto>0? teto.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—',380,tyP,{width:80,align:'right'});
      const barW = doc.page.width - 520; const used = Math.min(1, usedPct/100);
      doc.rect(470,tyP+10,barW,6).fill(palette.border);
      doc.rect(470,tyP+10,Math.max(4,barW*used),6).fill(usedPct>100?palette.danger:usedPct>=90?palette.warning:usedPct>=70?palette.primary:palette.success);
      const pctTextX = Math.min(doc.page.width - 70, 470 + barW + 8);
      doc.fillColor(palette.textMuted).fontSize(9).text(`${Math.round(usedPct)}%`, pctTextX, tyP+7, { width: 40, align:'left' });
      tyP+=20;
    });

    // Empresarial
    const totalBusinessType = Object.values(byPlanBusiness).reduce((a,b)=>a+b,0);
    newPageWithTitle('💼 Análise por Plano de Conta — Empresarial');
    let tyB = 80; doc.fontSize(9).fillColor('#374151');
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
      doc.fillColor(palette.text).fontSize(9).text(planDisplay(p, planNames),45,tyB);
      doc.text(v.toLocaleString('pt-BR',{minimumFractionDigits:2}),200,tyB,{width:120,align:'right'});
      doc.text(pct.toFixed(1)+'%',330,tyB,{width:40,align:'right'});
      doc.text(teto>0? teto.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—',380,tyB,{width:80,align:'right'});
      const barWB = doc.page.width - 520; const usedB = Math.min(1, usedPct/100);
      doc.rect(470,tyB+10,barWB,6).fill(palette.border);
      doc.rect(470,tyB+10,Math.max(4,barWB*usedB),6).fill(usedPct>100?palette.danger:usedPct>=90?palette.warning:usedPct>=70?palette.primary:palette.success);
      const pctTextXB = Math.min(doc.page.width - 70, 470 + barWB + 8);
      doc.fillColor(palette.textMuted).fontSize(9).text(`${Math.round(usedPct)}%`, pctTextXB, tyB+7, { width: 40, align:'left' });
      tyB+=20;
    });

    // Gastos por Conta (texto)
    newPageWithTitle('🏦 Gastos por Conta');
    Object.entries(byAccount).sort((a,b)=>b[1]-a[1]).forEach(([c,v])=>{
      if(doc.y>doc.page.height-60){ doc.addPage(); pageIndex+=1; doc.fontSize(10).fillColor(palette.textSoft).text(`Página ${pageIndex}`, doc.page.width-90, 20, { width: 80, align:'right' }); doc.fontSize(14).fillColor(palette.text).text('🏦 Gastos por Conta (cont.)',40,50); doc.y=70; }
      doc.fontSize(10).fillColor(palette.text).text(`• ${c}: R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,40,doc.y); doc.y+=14;
    });

    // Lista Completa (limitada)
    newPageWithTitle('📋 Lista Completa de Despesas (amostra)');
    let ly2=90; safeExpenses.forEach((e,i)=>{ if(ly2>doc.page.height-60){ doc.addPage(); ly2=50; doc.fontSize(12).text('Continuação Despesas',40,ly2); ly2+=30; }
      const dt=new Date(e.transaction_date).toLocaleDateString('pt-BR'); const val=Number(e.amount||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
      const label = planDisplay(e.account_plan_code, planNames);
      doc.fontSize(9).fillColor(palette.textMuted).text(`${i+1}. ${dt} • R$ ${val} • ${(e.description||'').slice(0,70)} • ${e.account||''} • ${label}`,40,ly2,{width:doc.page.width-80}); ly2+=12; });

    doc.moveDown(2); doc.fontSize(9).fillColor(palette.textSoft).text('Relatório Demo • Layout acessível', {align:'center'});

    doc.end();
    ws.on('finish', ()=> resolve(outPath));
    ws.on('error', reject);
  });
}

async function main(){
  try {
    const outDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'sample-report.pdf');
    const data = buildSampleData();
    const result = await generatePDF(data, outPath);
    console.log('✅ PDF gerado em:', result);
  } catch (e) {
    console.error('❌ Falha ao gerar PDF:', e);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
