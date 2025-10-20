const fs = require('fs');
const path = require('path');

let cache = { data: null, mtimeMs: 0 };
const filePath = path.join(__dirname, 'chartOfAccounts.json');

function readJsonSafe(p){
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch(e){ return null; }
}

function getChartOfAccounts(){
  try {
    const stat = fs.statSync(filePath);
    if (!cache.data || stat.mtimeMs !== cache.mtimeMs) {
      const data = readJsonSafe(filePath);
      if (data && Array.isArray(data.plans)) {
        cache = { data, mtimeMs: stat.mtimeMs };
      }
    }
  } catch(e) {
    // ignore, will use existing cache or fallback
  }
  if (cache.data) return cache.data;
  // Fallback mínimo
  return { version: 1, plans: [] };
}

function asMaps(){
  const { plans } = getChartOfAccounts();
  const budgets = {}; const names = {}; const descriptions = {};
  for (const p of plans) {
    if (p && p.id != null) {
      if (typeof p.defaultBudget === 'number') budgets[p.id] = p.defaultBudget;
      if (p.name) names[p.id] = p.name;
      if (p.description) descriptions[p.id] = p.description;
    }
  }
  return { budgets, names, descriptions };
}

// Persistência segura (write-through)
function saveChartOfAccounts(newData){
  if(!newData || !Array.isArray(newData.plans)) throw new Error('Invalid data');
  const payload = {
    version: Number(newData.version || (cache.data?.version || 1)) + 0, // mantém versão
    generatedAt: new Date().toISOString(),
    notes: newData.notes || (cache.data?.notes || ''),
    plans: newData.plans
  };
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
  cache = { data: payload, mtimeMs: fs.statSync(filePath).mtimeMs };
  return payload;
}

function upsertPlan(plan){
  const data = getChartOfAccounts();
  const plans = Array.isArray(data.plans) ? [...data.plans] : [];
  const idx = plans.findIndex(p => String(p.id) === String(plan.id));
  if (idx >= 0) plans[idx] = { ...plans[idx], ...plan };
  else plans.push(plan);
  return saveChartOfAccounts({ ...data, plans });
}

function deletePlan(planId){
  const data = getChartOfAccounts();
  const plans = (data.plans || []).filter(p => String(p.id) !== String(planId));
  return saveChartOfAccounts({ ...data, plans });
}

module.exports = { getChartOfAccounts, asMaps, saveChartOfAccounts, upsertPlan, deletePlan };
