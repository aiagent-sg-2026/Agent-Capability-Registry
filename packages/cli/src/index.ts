#!/usr/bin/env node
import {readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {validatePackage} from '@acr/package-schema';
import {integrityFiles,packageHash,install} from '@acr/package-runner';
import {evaluate,evaluatorHash,EVALUATOR_VERSION} from '@acr/evaluator';
import {buildContextBundle,createFactoryCatalog,resolveCapability} from '@acr/registry-api';
import {launchRunner,prepareRun,redactInvocation,type AdapterOptions,type RunnerMode,type RunnerName} from '@acr/agent-adapter';

function verify(p:string){const root=realpathSync(p);const m=validatePackage(root);const files=integrityFiles(m);const actual=packageHash(root,files);let golden;try{golden=evaluate(JSON.parse(readFileSync(join(root,m.eval.cases),'utf8')))}catch(e){golden={status:'UNKNOWN' as const,findings:[{rule:'golden-evidence',severity:'high' as const,message:`Malformed golden evidence: ${String(e)}`}],cases:0,passed:0,failed:0}}const result={status:golden.status,manifest:{name:m.name,version:m.version},integrity:{sha256:actual,files},evaluator:{version:EVALUATOR_VERSION,sha256:evaluatorHash},golden};console.log(JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;return result}

type SearchArgs={limit?:number;stateDir?:string;category?:string;status?:string};
type InfoArgs={stateDir?:string;version?:string};
type UseArgs=SearchArgs&{maxBytes?:number};
function requireValue(flag:string,args:string[],i:number){const v=args[i+1];if(!v||v.startsWith('--'))throw Error(`${flag} requires a value`);return v}
function parseSearchArgs(args:string[]):SearchArgs{const out:SearchArgs={};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--limit'){const v=requireValue(a,args,i);if(!/^\d+$/.test(v))throw Error('--limit must be an integer from 1 to 100');const n=Number(v);if(n<1||n>100)throw Error('--limit must be an integer from 1 to 100');out.limit=n;i++}else if(a==='--state-dir'){out.stateDir=requireValue(a,args,i);i++}else if(a==='--category'){out.category=requireValue(a,args,i);i++}else if(a==='--status'){out.status=requireValue(a,args,i);i++}else throw Error(`unknown flag ${a}`)}return out}
function parseInfoArgs(args:string[]):InfoArgs{const out:InfoArgs={};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--state-dir'){out.stateDir=requireValue(a,args,i);i++}else if(a==='--version'){out.version=requireValue(a,args,i);i++}else throw Error(`unknown flag ${a}`)}return out}
function parseUseArgs(args:string[]):UseArgs{const out:UseArgs={};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--limit'||a==='--max-bytes'){const v=requireValue(a,args,i);if(!/^\d+$/.test(v))throw Error(`${a} requires an integer`);const n=Number(v);if(a==='--limit'){if(n<1||n>100)throw Error('--limit must be an integer from 1 to 100');out.limit=n}else{if(n<1024||n>65536)throw Error('--max-bytes must be an integer from 1024 to 65536');out.maxBytes=n}i++}else if(a==='--state-dir'){out.stateDir=requireValue(a,args,i);i++}else if(a==='--category'){out.category=requireValue(a,args,i);i++}else if(a==='--status'){out.status=requireValue(a,args,i);i++}else throw Error(`unknown flag ${a}`)}return out}
type AgentArgs=AdapterOptions&{stateDir?:string;dryRun?:boolean};
function parseAgentArgs(args:string[]):AgentArgs{const out:AgentArgs={};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--cwd'){out.cwd=requireValue(a,args,i);i++}else if(a==='--state-dir'){out.stateDir=requireValue(a,args,i);i++}else if(a==='--mode'){const v=requireValue(a,args,i);if(v!=='read-only'&&v!=='workspace')throw Error('--mode must be read-only or workspace');out.mode=v as RunnerMode;i++}else if(a==='--model'){out.model=requireValue(a,args,i);i++}else if(a==='--max-bytes'){const v=requireValue(a,args,i);if(!/^\d+$/.test(v))throw Error('--max-bytes requires an integer');const n=Number(v);if(n<1024||n>65536)throw Error('--max-bytes must be an integer from 1024 to 65536');out.maxBytes=n;i++}else if(a==='--dry-run')out.dryRun=true;else throw Error(`unknown flag ${a}`)}return out}

const argv=process.argv.slice(2),cmd=argv[0],p=argv[1],args=argv.slice(2);
try{
  if(cmd==='agent'){
    if(p!=='codex'&&p!=='pi')throw Error('usage: cap agent <codex|pi> <task> [flags]');
    const task=argv[2];if(!task||task.startsWith('--'))throw Error('agent task is required');
    const o=parseAgentArgs(argv.slice(3)),prepared=prepareRun(createFactoryCatalog(o.stateDir),p as RunnerName,task,o);
    if(!prepared.bundle||!prepared.invocation){console.log(JSON.stringify({status:'NO_MATCH',resolution:prepared.resolution,capabilityQuery:prepared.capabilityQuery,matchedTaskTokens:prepared.matchedTaskTokens,fallbackUsed:prepared.fallbackUsed},null,2));process.exitCode=2;
    }else if(o.dryRun){console.log(JSON.stringify({status:'PASS',resolution:prepared.resolution,capabilityQuery:prepared.capabilityQuery,matchedTaskTokens:prepared.matchedTaskTokens,fallbackUsed:prepared.fallbackUsed,selectedCapability:prepared.bundle.selected,context:{mode:prepared.bundle.mode,executable:prepared.bundle.executable,status:prepared.bundle.status,totalBytes:prepared.bundle.totalBytes,maxBytes:prepared.bundle.maxBytes,truncated:prepared.bundle.truncated,fileCount:prepared.bundle.files.length},executable:prepared.invocation.executable,args:redactInvocation(prepared.invocation).args,cwd:prepared.invocation.cwd},null,2));
    }else{const result=launchRunner(prepared.invocation);process.exitCode=result.exitCode===null?1:result.exitCode}
  }else if(cmd==='search'){
    if(p?.startsWith('--'))throw Error('search query must appear before flags; use "" for an empty query');
    const o=parseSearchArgs(args),results=createFactoryCatalog(o.stateDir).search(p??'',o);
    console.log(JSON.stringify({status:'PASS',count:results.length,results},null,2));
  }else if(cmd==='info'){
    if(!p||p.startsWith('--'))throw Error('usage: cap info <name> [--version VERSION] [--state-dir DIR]');
    const o=parseInfoArgs(args),result=createFactoryCatalog(o.stateDir).info(p,o.version);
    if(!result)throw Error('package not found');
    console.log(JSON.stringify({status:'PASS',result},null,2));
  }else if(cmd==='resolve'){
    if(!p||p.startsWith('--'))throw Error('usage: cap resolve <task> [--limit N] [--category CAT] [--state-dir DIR]');
    const o=parseSearchArgs(args),result=resolveCapability(createFactoryCatalog(o.stateDir),p,o);
    console.log(JSON.stringify({status:result.selected?'PASS':'NO_MATCH',result},null,2));
    if(!result.selected)process.exitCode=2;
  }else if(cmd==='use'){
    if(!p||p.startsWith('--'))throw Error('usage: cap use <task> [--limit N] [--max-bytes N] [--category CAT] [--state-dir DIR]');
    const o=parseUseArgs(args),resolution=resolveCapability(createFactoryCatalog(o.stateDir),p,o),bundle=buildContextBundle(resolution,o);
    console.log(JSON.stringify({status:bundle?'PASS':'NO_MATCH',bundle},null,2));
    if(!bundle)process.exitCode=2;
  }else{
    if(!cmd||!p)throw Error('usage: cap validate|verify|inspect|install <packagePath> [--target dir] | cap search <query> [flags] | cap info <name> [flags] | cap resolve <task> [flags] | cap use <task> [flags] | cap agent <codex|pi> <task> [flags]');
    if(cmd==='validate'){const m=validatePackage(realpathSync(p));console.log(JSON.stringify({status:'PASS',name:m.name,version:m.version}))}
    else if(cmd==='inspect')console.log(JSON.stringify(validatePackage(realpathSync(p)),null,2));
    else if(cmd==='verify')verify(p);
    else if(cmd==='install'){const target=args[args.indexOf('--target')+1];if(!target)throw Error('--target required');const v=verify(p);if(v.status!=='PASS')throw Error('verification failed');const m=validatePackage(realpathSync(p));const r=install(p,target,m,{package:{name:m.name,version:m.version,sha256:v.integrity.sha256},evaluator:{status:v.status,version:EVALUATOR_VERSION,sha256:evaluatorHash,summary:v.golden},targetAdapter:'codex-local-v1',installedPaths:[],installedAt:new Date().toISOString()});console.log(JSON.stringify({status:'PASS',receipt:r},null,2))}
    else throw Error(`unknown command ${cmd}`);
  }
}catch(e){console.error(JSON.stringify({status:'FAIL',error:String(e instanceof Error?e.message:e)}));process.exitCode=1}
