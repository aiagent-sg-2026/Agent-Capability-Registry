import {readFileSync} from 'node:fs';
import {join,resolve,relative,sep} from 'node:path';
import {readdirSync,lstatSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
export type Permissions={network:'none'|'read-only';filesystem:'none'|'workspace-read'|'read-only';database:'none'|'read-only-no-execution';shell:'none'};
export interface Manifest {schema:'capability/v0.1';name:string;version:string;description:string;license:string;content:{files:string[]};permissions:Permissions;compatibility:{codex:string;postgresql:string[]};provenance:{source:string;author:string;createdAt:string};eval:{contract:string;cases:string}}
export function loadManifest(root:string):Manifest {const raw=JSON.parse(readFileSync(join(root,'capability.json'),'utf8')); validateManifest(raw); return raw;}
const ajv=new Ajv2020({allErrors:true});
const validateSchema=ajv.compile(schemaDocument());
export function validateManifest(x:unknown):asserts x is Manifest {if(!validateSchema(x))throw Error(`invalid manifest: ${ajv.errorsText(validateSchema.errors)}`);}
function regularFiles(root:string){const out:string[]=[]; const walk=(dir:string)=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name); const st=lstatSync(p); if(st.isSymbolicLink()) throw Error(`symlink rejected: ${relative(root,p)}`); if(e.isDirectory()) walk(p); else if(st.isFile()) out.push(relative(root,p).split(sep).join('/')); else throw Error(`non-regular package entry: ${relative(root,p)}`);}}; walk(root); return out.filter(f=>f!=='capability.json').sort();}
export function validatePackage(root:string):Manifest {const m=loadManifest(root); const declared=[...m.content.files].sort(); const actual=regularFiles(root); for(const f of declared){const q=resolve(root,f); if(!q.startsWith(resolve(root)+sep)||!lstatSync(q).isFile()||lstatSync(q).isSymbolicLink()) throw Error(`invalid package file: ${f}`);} if(JSON.stringify(declared)!==JSON.stringify(actual)) throw Error(`package content allowlist mismatch: declared ${declared.join(',')} actual ${actual.join(',')}`); return m;}
export function schemaDocument(){return JSON.parse(readFileSync(join(__dirname,'capability-v0.1.schema.json'),'utf8'));}
