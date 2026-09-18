import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { CATEGORIES } from './opportunity.js';
export const PACKAGE_SCHEMA='acr/candidate-package/v0.1';
const permissionKeys=['network','filesystem','database','shell'];
const plain=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const kebab=(x:unknown)=>typeof x==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(x);
export interface CandidateFile {path:string;content:string}
export interface CandidatePackage {schema:string;name:string;version:'0.1.0';description:string;category:string;tags:string[];permissions:Record<string,false>;files:CandidateFile[]}
export const QUALITY_README_HEADINGS=['## When to use','## Evidence required','## Procedure','## Failure modes','## Output contract','## Guardrails'] as const;
export interface CandidateQualityResult {status:'PASS'|'FAIL';reasons:string[]}
function jsonSafe(x:unknown,depth=0):boolean {if(depth>12||x===null||typeof x==='string'||typeof x==='boolean')return true;if(typeof x==='number')return Number.isFinite(x);if(Array.isArray(x))return x.length<=1000&&x.every(v=>jsonSafe(v,depth+1));return plain(x)&&Object.keys(x).length<=100&&Object.keys(x).every(k=>k.length<=200&&jsonSafe((x as any)[k],depth+1));}
export function validateCandidatePackage(x:unknown):x is CandidatePackage {
 if(!plain(x)||Object.keys(x).length!==8||Object.keys(x).some(k=>!['schema','name','version','description','category','tags','permissions','files'].includes(k)))return false;const o=x as any;
 if(o.schema!==PACKAGE_SCHEMA||o.version!=='0.1.0'||!kebab(o.name)||typeof o.description!=='string'||!o.description||o.description.length>2000||!CATEGORIES.includes(o.category))return false;
 if(!Array.isArray(o.tags)||o.tags.length>16||new Set(o.tags).size!==o.tags.length||!o.tags.every((t:any)=>typeof t==='string'&&/^[a-z0-9-]{1,40}$/.test(t)))return false;
 if(!plain(o.permissions)||Object.keys(o.permissions).length!==4||permissionKeys.some(k=>o.permissions[k]!==false)||Object.keys(o.permissions).some(k=>!permissionKeys.includes(k)))return false;
 if(!Array.isArray(o.files)||o.files.length<2||o.files.length>16||new Set(o.files.map((f:any)=>f?.path)).size!==o.files.length)return false;let total=0,hasReadme=false,hasEval=false;
 for(const f of o.files){if(!plain(f)||Object.keys(f).length!==2||typeof f.path!=='string'||typeof f.content!=='string'||f.path.length>200||f.content.length>50000||f.path.includes('\\')||f.path.startsWith('/')||/^[A-Za-z]:/.test(f.path)||f.path.split('/').some((p:string)=>!p||p==='.'||p==='..')||!(/\.(md|json)$/).test(f.path))return false;total+=Buffer.byteLength(f.content);if(total>300000)return false;if(f.path==='README.md')hasReadme=true;if(/^evals\/.*\.json$/.test(f.path)){hasEval=true;try{const j=JSON.parse(f.content);if(!Array.isArray(j)||j.length<1||j.length>100||!j.every((c:any)=>plain(c)&&Object.keys(c).length===3&&typeof c.id==='string'&&c.id.length>0&&c.id.length<=120&&'input' in c&&'expected' in c&&jsonSafe(c.input)&&jsonSafe(c.expected)))return false}catch{return false}}else if(/\.json$/.test(f.path)){try{JSON.parse(f.content)}catch{return false}}}return hasReadme&&hasEval;
}
export function evaluateCandidateQuality(pkg:CandidatePackage):CandidateQualityResult {
 const reasons:string[]=[];const readme=pkg.files.find(f=>f.path==='README.md')?.content||'';const bytes=Buffer.byteLength(readme);
 if(bytes<700)reasons.push('readme_too_shallow');if(bytes>2200)reasons.push('readme_too_large');
 for(const h of QUALITY_README_HEADINGS){const i=readme.indexOf(h);if(i<0){reasons.push('missing_'+h.slice(3).toLowerCase().replace(/[^a-z0-9]+/g,'_'));continue}const start=i+h.length,end=QUALITY_README_HEADINGS.map(x=>readme.indexOf(x,start)).filter(x=>x>=0).sort((a,b)=>a-b)[0]??readme.length;if(readme.slice(start,end).trim().length<40)reasons.push('thin_'+h.slice(3).toLowerCase().replace(/[^a-z0-9]+/g,'_'))}
 const evalFile=pkg.files.find(f=>/^evals\/.*\.json$/.test(f.path));let cases:any[]=[];try{cases=evalFile?JSON.parse(evalFile.content):[]}catch{}
 if(cases.length<3)reasons.push('too_few_eval_cases');if(cases.length>8)reasons.push('too_many_eval_cases');
 if(new Set(cases.map(c=>c?.id)).size!==cases.length)reasons.push('duplicate_eval_ids');
 return{status:reasons.length?'FAIL':'PASS',reasons};
}
export function legacyToPackage(x:any,category='documentation'):CandidatePackage|undefined {if(!plain(x)||typeof x.name!=='string'||typeof x.description!=='string'||!Array.isArray(x.files))return;const files:CandidateFile[]=[{path:'README.md',content:`# ${x.name}\n\n${x.description}\n\nData-only candidate package.`},{path:'evals/cases.json',content:JSON.stringify([{id:'basic',input:{},expected:{status:'reviewed'}}])}];return {schema:PACKAGE_SCHEMA,name:x.name,version:'0.1.0',description:x.description,category,tags:[category],permissions:{network:false,filesystem:false,database:false,shell:false},files};}
export function canonical(x:any):string {if(Array.isArray(x))return `[${x.map(canonical).join(',')}]`;if(x&&typeof x==='object')return `{${Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')}}`;return JSON.stringify(x);}
export function packageHash(x:CandidatePackage):string{return createHash('sha256').update(canonical(x)).digest('hex');}
export function materialize(stateDir:string,pkg:CandidatePackage,opportunityId:string,createdAt:string):{path:string;hash:string;created:boolean}{const hash=packageHash(pkg),root=join(stateDir,'packages',pkg.name),dir=join(root,hash);if(existsSync(dir))return {path:dir,hash,created:false};const staging=join(root,`.staging-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);try{mkdirSync(staging,{recursive:true,mode:0o700});for(const f of pkg.files){const target=join(staging,posix.normalize(f.path));if(!target.startsWith(staging+posix.sep))throw new Error('path boundary');mkdirSync(join(target,'..'),{recursive:true,mode:0o700});writeFileSync(target,f.content,{mode:0o600});}writeFileSync(join(staging,'manifest.json'),JSON.stringify({schema:PACKAGE_SCHEMA,status:'CANDIDATE_ONLY',opportunityId,packageHash:hash,createdAt,package:pkg},null,2)+'\n',{mode:0o600});try{renameSync(staging,dir);return {path:dir,hash,created:true};}catch(e:any){if(existsSync(dir))return {path:dir,hash,created:false};throw e;}}catch(e){try{rmSync(staging,{recursive:true,force:true});}catch{}throw e;}}
