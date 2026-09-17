import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const DEFAULT_STATE_DIR = '/srv/agent-workstation/state/agent-capability-registry-factory';
export const CANDIDATE_SCHEMA = 'acr/candidate-package/v0.1';

export interface CatalogEntry {
  name:string; version:string; description:string; category:string; tags:string[];
  status:string; path:string; packageHash:string; opportunityId:string; createdAt:string; source:'factory';
}
export interface SearchOptions { limit?:number; category?:string; status?:string }

type JsonObject = Record<string,unknown>;
const plain=(x:unknown):x is JsonObject=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const text=(x:unknown,max=4096):x is string=>typeof x==='string'&&x.length>0&&x.length<=max;
const kebab=(x:unknown,max=128)=>text(x,max)&&/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/.test(x);
const allowed=(x:JsonObject,keys:string[])=>Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const canonical=(x:any):string=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:plain(x)?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);
const hashPackage=(x:unknown)=>createHash('sha256').update(canonical(x)).digest('hex');
const tokenize=(x:string)=>x.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const compareText=(a:string,b:string)=>a.localeCompare(b,'en',{sensitivity:'base'})||(a<b?-1:a>b?1:0);

interface Semver { major:number; minor:number; patch:number; prerelease?:string }
function semver(v:string):Semver|undefined { const m=/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v); return m?{major:+m[1],minor:+m[2],patch:+m[3],...(m[4]?{prerelease:m[4]}:{})}:undefined; }
function compareVersionNewest(a:string,b:string){const av=semver(a),bv=semver(b);if(av&&!bv)return-1;if(!av&&bv)return 1;if(av&&bv){for(const k of ['major','minor','patch'] as const)if(av[k]!==bv[k])return bv[k]-av[k];if(!av.prerelease&&bv.prerelease)return-1;if(av.prerelease&&!bv.prerelease)return 1;if(av.prerelease&&bv.prerelease){const c=compareText(bv.prerelease,av.prerelease);if(c)return c;}}return compareText(a,b)}
function entryOrder(a:CatalogEntry,b:CatalogEntry){return compareText(a.name,b.name)||compareVersionNewest(a.version,b.version)||compareText(a.path,b.path)}

function validPackage(x:unknown):x is JsonObject {
  if(!plain(x)||!allowed(x,['schema','name','version','description','category','tags','permissions','files']))return false;
  if(x.schema!==CANDIDATE_SCHEMA||!kebab(x.name,64)||!text(x.version,80)||!semver(x.version)||!text(x.description,2000)||!kebab(x.category,80))return false;
  if(!Array.isArray(x.tags)||x.tags.length>16||new Set(x.tags).size!==x.tags.length||!x.tags.every(t=>typeof t==='string'&&/^[a-z0-9-]{1,40}$/.test(t)))return false;
  const permissions=x.permissions;if(!plain(permissions)||!allowed(permissions,['network','filesystem','database','shell'])||!['network','filesystem','database','shell'].every(k=>permissions[k]===false))return false;
  if(!Array.isArray(x.files)||x.files.length<2||x.files.length>16)return false;
  const paths=new Set<string>(); let total=0,readme=false,evals=false;
  for(const f of x.files){
    if(!plain(f)||!allowed(f,['path','content'])||!text(f.path,200)||typeof f.content!=='string'||f.content.length>50000)return false;
    const p=f.path;if(paths.has(p)||p.includes('\\')||p.startsWith('/')||/^[A-Za-z]:/.test(p)||p.split('/').some(part=>!part||part==='.'||part==='..')||!(/\.(md|json)$/).test(p))return false;
    paths.add(p);total+=Buffer.byteLength(f.content);if(total>300000)return false;
    if(p==='README.md')readme=true;
    if(/^evals\/.*\.json$/.test(p)){evals=true;try{const parsed=JSON.parse(f.content);if(!Array.isArray(parsed)||parsed.length<1||parsed.length>100)return false}catch{return false}}
    else if(p.endsWith('.json')){try{JSON.parse(f.content)}catch{return false}}
  }
  return readme&&evals;
}
function inside(root:string,candidate:string){const r=relative(root,candidate);return r===''||(r!=='..'&&!r.startsWith(`..${sep}`)&&!isAbsolute(r))}
function validRecord(x:unknown):x is Record<string,string>{return plain(x)&&x.status==='CANDIDATE_ONLY'&&kebab(x.opportunityId,128)&&kebab(x.name,64)&&typeof x.packageHash==='string'&&/^[a-f0-9]{64}$/.test(x.packageHash)&&text(x.path,4096)&&text(x.createdAt,80)}

export function loadFactoryCatalog(stateDir=process.env.ACR_FACTORY_STATE_DIR||DEFAULT_STATE_DIR):CatalogEntry[]{
  let root:string;try{root=realpathSync(stateDir)}catch{return []}
  const packagesRoot=resolve(root,'packages'),index=join(root,'candidates.jsonl');if(!existsSync(index))return [];
  let lines:string[];try{lines=readFileSync(index,'utf8').split('\n')}catch{return []}
  const seen=new Set<string>(),out:CatalogEntry[]=[];
  for(const line of lines){
    if(!line.trim())continue;let record:unknown;try{record=JSON.parse(line)}catch{continue}if(!validRecord(record))continue;
    let packageRoot:string;try{const raw=resolve(isAbsolute(record.path)?record.path:resolve(root,record.path));if(!inside(packagesRoot,raw)||!existsSync(raw)||!lstatSync(raw).isDirectory())continue;packageRoot=realpathSync(raw);if(!inside(packagesRoot,packageRoot))continue}catch{continue}
    const manifestPath=join(packageRoot,'manifest.json');try{const st=lstatSync(manifestPath);if(!st.isFile()||st.isSymbolicLink())continue}catch{continue}
    let wrapper:unknown;try{wrapper=JSON.parse(readFileSync(manifestPath,'utf8'))}catch{continue}
    if(!plain(wrapper)||!allowed(wrapper,['schema','status','opportunityId','packageHash','createdAt','package'])||wrapper.schema!==CANDIDATE_SCHEMA||wrapper.status!=='CANDIDATE_ONLY'||!kebab(wrapper.opportunityId,128)||typeof wrapper.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(wrapper.packageHash)||!text(wrapper.createdAt,80)||!validPackage(wrapper.package))continue;
    const pkg=wrapper.package as any;
    if(wrapper.opportunityId!==record.opportunityId||wrapper.packageHash!==record.packageHash||wrapper.createdAt!==record.createdAt||pkg.name!==record.name||wrapper.packageHash!==hashPackage(pkg))continue;
    const key=`${pkg.name}\0${pkg.version}\0${wrapper.packageHash}`;if(seen.has(key))continue;seen.add(key);
    out.push({name:pkg.name,version:pkg.version,description:pkg.description,category:pkg.category,tags:[...pkg.tags],status:'CANDIDATE_ONLY',path:packageRoot,packageHash:wrapper.packageHash,opportunityId:wrapper.opportunityId,createdAt:wrapper.createdAt,source:'factory'});
  }
  return out.sort(entryOrder);
}

function tokenScore(entry:CatalogEntry,token:string){
  const nameTokens=tokenize(entry.name),tagTokens=entry.tags.flatMap(tokenize),categoryTokens=tokenize(entry.category),descriptionTokens=tokenize(entry.description);
  let score=0;
  if(nameTokens.includes(token))score=1000;else if(nameTokens.some(x=>x.startsWith(token)))score=900;else if(entry.name.toLowerCase().includes(token))score=800;
  if(tagTokens.includes(token))score=Math.max(score,700);else if(tagTokens.some(x=>x.startsWith(token)))score=Math.max(score,650);
  if(categoryTokens.includes(token))score=Math.max(score,500);else if(entry.category.toLowerCase().includes(token))score=Math.max(score,450);
  if(descriptionTokens.includes(token))score=Math.max(score,300);else if(entry.description.toLowerCase().includes(token))score=Math.max(score,250);
  return score;
}

export class LocalCatalog{
  entries:CatalogEntry[];
  constructor(entries:CatalogEntry[]=[]){this.entries=[...entries].sort(entryOrder)}
  search(query='',options:SearchOptions={}):CatalogEntry[]{
    const limit=options.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('limit must be an integer from 1 to 100');
    const tokens=tokenize(query),normalized=tokens.join('-');
    const filtered=this.entries.filter(e=>(!options.category||e.category===options.category)&&(!options.status||e.status===options.status));
    const scored=filtered.flatMap(entry=>{if(!tokens.length)return[{entry,score:0}];const per=tokens.map(t=>tokenScore(entry,t));if(per.some(s=>s===0))return[];let score=per.reduce((a,b)=>a+b,0);if(normalized===entry.name.toLowerCase())score+=10000;return[{entry,score}]}).sort((a,b)=>b.score-a.score||entryOrder(a.entry,b.entry));
    return scored.slice(0,limit).map(x=>x.entry);
  }
  info(name:string,version?:string):CatalogEntry|undefined{
    const matches=this.entries.filter(e=>e.name===name&&(version===undefined||e.version===version));
    return matches.sort((a,b)=>compareVersionNewest(a.version,b.version)||entryOrder(a,b))[0];
  }
}
export function createFactoryCatalog(stateDir?:string){return new LocalCatalog(loadFactoryCatalog(stateDir))}
