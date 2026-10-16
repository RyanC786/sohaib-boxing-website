import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateContent} from '../dist/model.mjs';
validateContent(JSON.parse(fs.readFileSync('dist/content-defaults.json','utf8')));
for(const root of ['dist','server','netlify/functions','scripts'])for(const file of fs.readdirSync(root,{recursive:true}).filter(x=>/\.(js|mjs)$/.test(x))){const result=spawnSync(process.execPath,['--check',root+'/'+file],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);}
for(const file of fs.readdirSync('dist',{recursive:true}).filter(x=>x.endsWith('.html')&&!x.startsWith('admin')))if(!fs.readFileSync('dist/'+file,'utf8').includes('/content.js'))throw Error(file+' has no live content loader');
console.log('Content schema, JavaScript syntax and public page loaders checked.');
