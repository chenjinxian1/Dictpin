'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function testFiles(directory){return fs.readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isFile()&&/\.test\.(?:js|cjs)$/.test(entry.name)).map(entry=>entry.name).sort();}
function run(root=path.join(__dirname,'..')){
  fs.mkdirSync(path.resolve(root,'../work'),{recursive:true});
  const directory=path.join(root,'test'),files=testFiles(directory);
  if(!files.length)throw Error('No JS/CJS regression tests found.');
  const result=spawnSync(process.execPath,['--test',...files.map(name=>path.join('test',name))],{cwd:root,stdio:'inherit',shell:false});
  if(result.error)throw result.error;return result.status??1;
}
module.exports={testFiles,run};
if(require.main===module)try{process.exitCode=run();}catch(error){console.error(error.message);process.exitCode=1;}
