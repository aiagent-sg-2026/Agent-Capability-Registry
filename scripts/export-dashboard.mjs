import {existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const DEFAULT_STATE_DIR='/srv/agent-workstation/state/agent-capability-registry-factory';
export const DEFAULT_DAILY_BUDGET=1_000_000;
export const MAX_GENERATION_ATTEMPTS=3;
const retryable=new Set(['malformed_json','unsafe_candidate','review_failed']);
const immediate=new Set(['candidate_saved','duplicate']);
const generationOutcomes=new Set(['candidate_saved','duplicate','malformed_json','unsafe_candidate','review_failed']);

function readJsonl(path){
  if(!existsSync(path)) return [];
  return readFileSync(path,'utf8').split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});
}
function sgDay(now){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function round(v,d=2){const p=10**d;return Math.round(v*p)/p}
function publicText(v,max=300){
  if(typeof v!=='string') return '';
  const s=v.slice(0,max);
  if(/\/(srv|home|tmp|opt)\//i.test(s)||/bearer\s+[a-z0-9._-]+/i.test(s)||/(sk-[a-z0-9_-]{10,}|(?:access|session)[_-]?token\s*[:=]|api[_-]?key\s*[:=])/i.test(s)) return '[redacted]';
  return s;
}
function safeReason(v){const s=publicText(v,120);return /^[a-z0-9_.:, -]{1,120}$/i.test(s)?s:(s?'redacted':'')}

function capabilityFromRecord(record){
  const base={
    name:publicText(record?.name||record?.opportunityId||record?.seedId,100),
    version:'0.1.0',description:'',category:'',tags:[],status:record?.status==='CANDIDATE_ONLY'?'CANDIDATE_ONLY':'',
    createdAt:publicText(record?.createdAt,60),hashPrefix:typeof record?.packageHash==='string'?record.packageHash.slice(0,12):''
  };
  const p=record?.path;
  if(typeof p!=='string') return base;
  try{
    let manifestPath=p;
    if(lstatSync(p).isDirectory()) manifestPath=join(p,'manifest.json');
    if(!existsSync(manifestPath)||!lstatSync(manifestPath).isFile()) return base;
    const raw=JSON.parse(readFileSync(manifestPath,'utf8'));
    const pkg=raw?.package;
    if(!pkg||typeof pkg!=='object') return base;
    return {
      ...base,
      name:publicText(pkg.name||base.name,100),version:publicText(pkg.version||base.version,40),
      description:publicText(pkg.description,500),category:publicText(pkg.category,80),
      tags:Array.isArray(pkg.tags)?pkg.tags.filter(x=>typeof x==='string').slice(0,16).map(x=>publicText(x,40)):[],
      status:raw.status==='CANDIDATE_ONLY'?'CANDIDATE_ONLY':base.status,
      createdAt:publicText(raw.createdAt||base.createdAt,60),
      hashPrefix:typeof raw.packageHash==='string'?raw.packageHash.slice(0,12):base.hashPrefix
    };
  }catch{return base}
}

export function buildDashboardSnapshot({stateDir=process.env.ACR_FACTORY_STATE_DIR||DEFAULT_STATE_DIR,env=process.env,now=new Date()}={}){
  const budget=readJsonl(join(stateDir,'budget.jsonl'));
  const cycles=readJsonl(join(stateDir,'cycles.jsonl'));
  const candidateRecords=readJsonl(join(stateDir,'candidates.jsonl'));
  const opportunities=readJsonl(join(stateDir,'opportunities.jsonl'));
  const today=sgDay(now);
  const dailyBudget=Math.max(0,n(env.ACR_FACTORY_DAILY_TOKEN_BUDGET)||DEFAULT_DAILY_BUDGET);
  const reserve=Math.max(0,n(env.ACR_FACTORY_MIN_REMAINING_FOR_CALL)||10_000);

  const ledger=budget.map(x=>({
    day:publicText(x.day,20),timestamp:publicText(x.timestamp,60),model:publicText(x.model,80),purpose:publicText(x.purpose,40),
    promptTokens:n(x.prompt_tokens),completionTokens:n(x.completion_tokens),totalTokens:n(x.total_tokens)
  })).filter(x=>x.day);
  const todayRows=ledger.filter(x=>x.day===today);
  const sumRows=rows=>rows.reduce((a,x)=>({promptTokens:a.promptTokens+x.promptTokens,completionTokens:a.completionTokens+x.completionTokens,totalTokens:a.totalTokens+x.totalTokens,calls:a.calls+1}),{promptTokens:0,completionTokens:0,totalTokens:0,calls:0});
  const todayTotals=sumRows(todayRows);

  const byKey=(key,rows=ledger)=>{
    const m=new Map();
    for(const x of rows){const k=x[key]||'unknown';const cur=m.get(k)||{name:k,promptTokens:0,completionTokens:0,totalTokens:0,calls:0};cur.promptTokens+=x.promptTokens;cur.completionTokens+=x.completionTokens;cur.totalTokens+=x.totalTokens;cur.calls++;m.set(k,cur)}
    return [...m.values()].sort((a,b)=>b.totalTokens-a.totalTokens||a.name.localeCompare(b.name));
  };
  const days=[...new Set(ledger.map(x=>x.day))].sort().slice(-7);
  const daily=days.map(day=>({day,...sumRows(ledger.filter(x=>x.day===day))}));
  const inputRate=Number(env.ACR_DASHBOARD_INPUT_USD_PER_1M),outputRate=Number(env.ACR_DASHBOARD_OUTPUT_USD_PER_1M);
  const pricingOk=Number.isFinite(inputRate)&&inputRate>=0&&Number.isFinite(outputRate)&&outputRate>=0;
  const usdEstimate=pricingOk?round(todayTotals.promptTokens*inputRate/1e6+todayTotals.completionTokens*outputRate/1e6,6):null;

  const outcomeCounts={};
  const seenAttempts=new Map();
  for(const x of cycles){const o=publicText(x.outcome,60)||'unknown';outcomeCounts[o]=(outcomeCounts[o]||0)+1;const id=publicText(x.opportunityId,120);if(id)seenAttempts.set(id,(seenAttempts.get(id)||0)+1)}
  const generation=cycles.filter(x=>generationOutcomes.has(x.outcome));
  const saved=generation.filter(x=>x.outcome==='candidate_saved').length;
  const retries=[...seenAttempts.values()].reduce((a,v)=>a+Math.max(0,v-1),0);

  const consumed=new Set();
  const retryCounts=new Map();
  for(const x of candidateRecords){const id=publicText(x.opportunityId||x.seedId,120);if(id)consumed.add(id)}
  for(const x of cycles){const id=publicText(x.opportunityId,120);if(!id)continue;if(immediate.has(x.outcome))consumed.add(id);else if(retryable.has(x.outcome)){retryCounts.set(id,(retryCounts.get(id)||0)+1);if(retryCounts.get(id)>=MAX_GENERATION_ATTEMPTS)consumed.add(id)}}
  const opportunityIds=new Set(opportunities.map(x=>publicText(x.id,120)).filter(Boolean));
  const queued=[...opportunityIds].filter(id=>!consumed.has(id)).length;

  const capabilities=candidateRecords.map(capabilityFromRecord).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name)||b.createdAt.localeCompare(a.createdAt));
  const recentCycles=cycles.slice(-40).reverse().map(x=>({
    timestamp:publicText(x.timestamp,60),opportunityId:publicText(x.opportunityId||x.seedId,120),
    outcome:publicText(x.outcome,60),reason:safeReason(x.reason),usedTokens:n(x.tokenTotals?.used),remainingTokens:n(x.tokenTotals?.remaining)
  }));

  return {
    schemaVersion:'acr/dashboard/v1',generatedAt:now.toISOString(),
    project:{name:'Agent Capability Registry',repository:'aiagent-sg-2026/Agent-Capability-Registry',pagesPath:'/Agent-Capability-Registry/'},
    summary:{
      candidatePackageCount:capabilities.length,opportunityCount:opportunityIds.size,queuedOpportunities:queued,consumedOpportunities:consumed.size,
      generationAttempts:generation.length,candidateSaved:saved,successRate:generation.length?round(saved/generation.length*100,1):0,
      retryAttempts:retries,modelCalls:todayTotals.calls,tokensToday:todayTotals.totalTokens,dailyTokenBudget:dailyBudget,
      remainingTokens:Math.max(0,dailyBudget-todayTotals.totalTokens),averageTokensPerCall:todayTotals.calls?round(todayTotals.totalTokens/todayTotals.calls,1):0
    },
    costLedger:{
      day:today,costStatus:pricingOk?'estimated-usd':'token-only-model-alias-pricing-unresolved',
      inputUsdPer1M:pricingOk?inputRate:null,outputUsdPer1M:pricingOk?outputRate:null,estimatedUsdToday:usdEstimate,
      today:todayTotals,byPurpose:byKey('purpose',todayRows),byModel:byKey('model',todayRows),daily
    },
    execution:{outcomeCounts,retryAttempts:retries,recentCycles},
    capabilities,
    automation:{intervalMinutes:15,maxGenerationAttempts:MAX_GENERATION_ATTEMPTS,candidateTrust:'CANDIDATE_ONLY',agentUseMode:'context-only',executable:false,dailyTokenBudget:dailyBudget,minRemainingForCall:reserve}
  };
}

export function writeDashboardSnapshot({outputFile='docs/data/dashboard.json',...options}={}){
  const snapshot=buildDashboardSnapshot(options);mkdirSync(dirname(outputFile),{recursive:true});writeFileSync(outputFile,JSON.stringify(snapshot,null,2)+'\n');return snapshot;
}
const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){const outputFile=process.argv[2]||'docs/data/dashboard.json';const x=writeDashboardSnapshot({outputFile});console.log(JSON.stringify({status:'PASS',outputFile,candidates:x.summary.candidatePackageCount,tokensToday:x.summary.tokensToday,generatedAt:x.generatedAt}))}
