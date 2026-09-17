import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CATEGORIES = ['data-quality','sql-analysis','json-analysis','markdown-quality','api-design-review','erp-analysis','testing','documentation','security-review'] as const;
export type Category = typeof CATEGORIES[number];
export interface Opportunity { id:string; slug:string; title:string; category:Category; problem:string; successCriteria:string; source:'curated'|'discovered'; createdAt:string }
const keys = ['id','slug','title','category','problem','successCriteria','source','createdAt'];
const text = (v:unknown,max:number) => typeof v === 'string' && v.length > 0 && v.length <= max;
const plain = (x:unknown): x is Record<string,unknown> => !!x && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
export function validateOpportunity(x:unknown): x is Opportunity {
  if (!plain(x) || Object.keys(x).length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(x,k))) return false;
  const o=x as Record<string,unknown>;
  return text(o.id,120) && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(o.id as string) && text(o.slug,80) && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(o.slug as string) && text(o.title,160) && CATEGORIES.includes(o.category as Category) && text(o.problem,1000) && text(o.successCriteria,1000) && (o.source === 'curated' || o.source === 'discovered') && text(o.createdAt,40);
}
export const opportunityFile = (stateDir:string) => join(stateDir,'opportunities.jsonl');
export function readOpportunities(stateDir:string):Opportunity[] { const p=opportunityFile(stateDir); if(!existsSync(p)) return []; return readFileSync(p,'utf8').split('\n').filter(Boolean).flatMap(l=>{try{const x=JSON.parse(l);return validateOpportunity(x)?[x]:[]}catch{return []}}); }
export function appendOpportunities(stateDir:string, opportunities:Opportunity[]):void { const normalized=opportunities.map((x:any)=>x.category?x:{id:x.id,slug:x.id,title:x.title,category:'documentation',problem:x.request,successCriteria:'Produces bounded, deterministic, read-only documentation.',source:'curated',createdAt:'2026-01-01T00:00:00.000Z'}).filter(validateOpportunity); if(normalized.length) appendFileSync(opportunityFile(stateDir),normalized.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600}); }
export function canonicalOpportunityKey(o:Pick<Opportunity,'id'|'title'>):string { return o.title.trim().toLowerCase(); }
