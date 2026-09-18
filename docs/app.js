const $=s=>document.querySelector(s);
const fmt=n=>Number(n||0).toLocaleString();
const pct=(a,b)=>b?Math.max(0,Math.min(100,a/b*100)):0;
const time=s=>s?new Date(s).toLocaleString([], {year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const outcomeClass=o=>o==='candidate_saved'?'saved':(/unsafe|malformed|failed|error/.test(o)?'failed':'');
const badgeClass=o=>o==='candidate_saved'?'good':(/unsafe|malformed|failed|error/.test(o)?'bad':'warn');

function renderKpis(d){
  const s=d.summary;
  const items=[
    ['Capabilities',s.candidatePackageCount,'CANDIDATE_ONLY packages'],
    ['Opportunities',s.opportunityCount,`${s.queuedOpportunities} currently queued`],
    ['Success rate',`${s.successRate}%`,`${s.candidateSaved}/${s.generationAttempts} generation attempts`],
    ['Retries',s.retryAttempts,'bounded repeated attempts'],
    ['Tokens today',fmt(s.tokensToday),`${fmt(s.modelCalls)} model calls`],
    ['Avg / call',fmt(s.averageTokensPerCall),'tokens per model call']
  ];
  $('#kpis').innerHTML=items.map(x=>`<article class="kpi"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></article>`).join('');
}
function bars(el,rows,labelKey='name'){
  if(!rows?.length){el.innerHTML='<small>No ledger data yet.</small>';return}
  const max=Math.max(...rows.map(x=>x.totalTokens||0),1);
  el.innerHTML=rows.map(x=>`<div class="bar"><span title="${esc(x[labelKey])}">${esc(x[labelKey])}</span><div class="track"><i style="width:${pct(x.totalTokens,max)}%"></i></div><strong>${fmt(x.totalTokens)}</strong></div>`).join('');
}
function renderCost(d){
  const s=d.summary,c=d.costLedger;
  $('#tokensToday').textContent=fmt(s.tokensToday);
  $('#budgetRemaining').textContent=fmt(s.remainingTokens);
  const usedPct=pct(s.tokensToday,s.dailyTokenBudget);
  $('#budgetPct').textContent=`${usedPct.toFixed(1)}% used of ${fmt(s.dailyTokenBudget)}`;
  $('#budgetMeter').style.width=`${usedPct}%`;
  $('#promptTokens').textContent=fmt(c.today.promptTokens);
  $('#completionTokens').textContent=fmt(c.today.completionTokens);
  $('#modelCalls').textContent=fmt(c.today.calls);
  $('#avgTokens').textContent=fmt(s.averageTokensPerCall);
  $('#costStatus').textContent=c.costStatus==='estimated-usd'
    ?`Estimated cost today: US$${Number(c.estimatedUsdToday||0).toFixed(4)} using configured rates.`
    :'Dollar cost is intentionally not guessed: demo-auto is a routing alias and no pricing rates were supplied. Token accounting remains exact.';
  bars($('#purposeBars'),c.byPurpose);
  bars($('#dailyBars'),c.daily,'day');
}
function renderExecution(d){
  const counts=Object.entries(d.execution.outcomeCounts||{}).sort((a,b)=>b[1]-a[1]);
  $('#outcomes').innerHTML=counts.map(([k,v])=>`<span class="badge ${badgeClass(k)}">${esc(k)} · ${fmt(v)}</span>`).join('');
  $('#runRows').innerHTML=(d.execution.recentCycles||[]).map(r=>`<tr><td>${esc(time(r.timestamp))}</td><td><code>${esc(r.opportunityId||'—')}</code></td><td><span class="status ${outcomeClass(r.outcome)}">${esc(r.outcome)}</span>${r.reason?`<br><small>${esc(r.reason)}</small>`:''}</td><td>${fmt(r.usedTokens)}</td></tr>`).join('')||'<tr><td colspan="4">No cycles available.</td></tr>';
}
function renderCatalog(d){
  const all=d.capabilities||[],select=$('#capCategory'),input=$('#capSearch');
  const cats=[...new Set(all.map(x=>x.category).filter(Boolean))].sort();
  select.innerHTML='<option value="">All categories</option>'+cats.map(x=>`<option>${esc(x)}</option>`).join('');
  const draw=()=>{
    const q=input.value.trim().toLowerCase(),cat=select.value;
    const rows=all.filter(x=>(!cat||x.category===cat)&&(!q||[x.name,x.description,x.category,...(x.tags||[])].join(' ').toLowerCase().includes(q)));
    $('#capCount').textContent=`${rows.length} of ${all.length} capabilities`;
    $('#capRows').innerHTML=rows.map(x=>`<tr><td><strong>${esc(x.name)}</strong><br><small>${esc(x.description||'')}</small></td><td>${esc(x.category||'—')}</td><td><span class="status">${esc(x.status||'—')}</span></td><td><div class="tags">${(x.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></td><td>${esc(x.createdAt?new Date(x.createdAt).toLocaleDateString():'—')}</td></tr>`).join('')||'<tr><td colspan="5">No matching capabilities.</td></tr>';
  };
  input.addEventListener('input',draw);select.addEventListener('change',draw);draw();
}
async function init(){
  try{
    const res=await fetch('./data/dashboard.json',{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const d=await res.json();
    $('#generatedAt').textContent=time(d.generatedAt);
    $('#freshness').textContent='Snapshot data · not a direct connection to the VM';
    $('#retryLimit').textContent=d.automation?.maxGenerationAttempts||3;
    $('#weekCycles').textContent=fmt(Math.floor(7*24*60/(d.automation?.intervalMinutes||15)));
    renderKpis(d);renderCost(d);renderExecution(d);renderCatalog(d);
  }catch(e){
    $('#errorState').hidden=false;$('#generatedAt').textContent='Unavailable';console.error(e);
  }
}
init();
