'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const {root,electronPath,isolatedEnvironment}=require('./environment.cjs');
const kind=process.argv[2]||'local03';
if(!['core','extended','capture','recover','endfield02','local02','local03'].includes(kind))throw Error('Choose core, extended, capture, recover, endfield02, local02 or local03.');
const env=isolatedEnvironment(path.join(root,'work/ui-environment'));env.INTERACTION04_ELECTRON=electronPath();
if(!fs.existsSync(env.INTERACTION04_ELECTRON))throw Error('Electron missing; use TYPELESS_ELECTRON or .local/dependencies.json.');
const r=spawnSync(process.execPath,['test/run-ui.cjs',kind,...process.argv.slice(3)],{cwd:root,env,stdio:'inherit',shell:false,windowsHide:true});
if(r.error)throw r.error;process.exitCode=r.status??1;
