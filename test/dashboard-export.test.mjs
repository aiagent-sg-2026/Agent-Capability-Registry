import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildDashboardSnapshot,writeDashboardSnapshot} from '../scripts/export-dashboard.mjs';

const jsonl=(p,rows)=>writeFileSync(p,rows.map(JSON.stringify).join('\n')+'\nBROKEN-LINE\n');

test('dashboard exporter aggregates and redacts runtime state',()=>{
  const d=mkdtempSync(join(tmpdir(),'acr-dashboard-'));
  jsonl(join(d,'budget.jsonl'),[
    {day:'2026-09-19',timestamp:'2026-09-18T23:00:00Z',model:'demo-auto',purpose:'proposal',prompt_tokens:1000,completion_tokens:500,total_tokens:1500},
    {day:'2026-09-19',timestamp:'2026-09-18T23:01:00Z',model:'demo-auto',purpose:'review',prompt_tokens:300,completion_tokens:200,total_tokens:500}
  ]);
  jsonl(join(d,'opportunities.jsonl'),[
    {id:'cap-one',slug:'cap-one',title:'Cap One',category:'testing',problem:'x',successCriteria:'y',source:'curated',createdAt:'2026-01-01T00:00:00Z'},
    {id:'cap-two',slug:'cap-two',title:'Cap Two',category:'testing',problem:'x',successCriteria:'y',source:'curated',createdAt:'2026-01-01T00:00:00Z'}
  ]);
  jsonl(join(d,'cycles.jsonl'),[
    {opportunityId:'cap-one',outcome:'malformed_json',timestamp:'2026-09-18T22:50:00Z',reason:'invalid JSON',tokenTotals:{used:1000,remaining:999000}},
    {opportunityId:'cap-one',outcome:'candidate_saved',timestamp:'2026-09-18T23:01:00Z',tokenTotals:{used:2000,remaining:998000}}
  ]);
  const pkgDir=join(d,'packages','cap-one','hash');mkdirSync(pkgDir,{recursive:true});
  writeFileSync(join(pkgDir,'manifest.json'),JSON.stringify({
    status:'CANDIDATE_ONLY',createdAt:'2026-09-18T23:01:00Z',packageHash:'a'.repeat(64),
    package:{name:'cap-one',version:'0.1.0',description:'Useful test capability',category:'testing',tags:['test'],files:[{path:'README.md',content:'RAW-CANDIDATE-CONTENT-SECRET'}]}
  }));
  jsonl(join(d,'candidates.jsonl'),[
    {opportunityId:'cap-one',name:'cap-one',packageHash:'a'.repeat(64),path:pkgDir,status:'CANDIDATE_ONLY',createdAt:'2026-09-18T23:01:00Z'},
    {seedId:'legacy-cap',path:join(d,'legacy-private.json'),status:'CANDIDATE_ONLY',createdAt:'2026-09-17T00:00:00Z'}
  ]);
  const env={ACR_FACTORY_DAILY_TOKEN_BUDGET:'10000',ACR_DASHBOARD_INPUT_USD_PER_1M:'10',ACR_DASHBOARD_OUTPUT_USD_PER_1M:'20'};
  const snapshot=buildDashboardSnapshot({stateDir:d,env,now:new Date('2026-09-19T01:00:00+08:00')});
  assert.equal(snapshot.summary.tokensToday,2000);
  assert.equal(snapshot.summary.modelCalls,2);
  assert.equal(snapshot.summary.candidatePackageCount,2);
  assert.equal(snapshot.summary.queuedOpportunities,1);
  assert.equal(snapshot.execution.retryAttempts,1);
  assert.equal(snapshot.costLedger.estimatedUsdToday,0.027);
  assert.equal(snapshot.capabilities.find(x=>x.name==='cap-one').hashPrefix,'aaaaaaaaaaaa');
  const serialized=JSON.stringify(snapshot);
  assert(!serialized.includes(d));
  assert(!serialized.includes('RAW-CANDIDATE-CONTENT-SECRET'));
  assert(!/\/srv\/|Bearer\s+|session[_-]?token|access[_-]?token/i.test(serialized));

  const out=join(d,'public','dashboard.json');
  writeDashboardSnapshot({stateDir:d,env,now:new Date('2026-09-19T01:00:00+08:00'),outputFile:out});
  assert.equal(JSON.parse(readFileSync(out,'utf8')).schemaVersion,'acr/dashboard/v1');
});

test('dashboard exporter is token-only when model alias pricing is unresolved',()=>{
  const d=mkdtempSync(join(tmpdir(),'acr-dashboard-'));
  const snapshot=buildDashboardSnapshot({stateDir:d,env:{},now:new Date('2026-09-19T00:00:00+08:00')});
  assert.equal(snapshot.costLedger.costStatus,'token-only-model-alias-pricing-unresolved');
  assert.equal(snapshot.costLedger.estimatedUsdToday,null);
});
