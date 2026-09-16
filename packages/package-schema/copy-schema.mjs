import {copyFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const packageRoot=dirname(fileURLToPath(import.meta.url));
const destination=join(packageRoot,'dist','capability-v0.1.schema.json');
mkdirSync(dirname(destination),{recursive:true});
copyFileSync(join(packageRoot,'..','..','schemas','capability-v0.1.schema.json'),destination);
