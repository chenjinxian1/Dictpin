'use strict';
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),build=require('../package.json').build;
test('both production pages package every local script, stylesheet and licensed font',()=>{
 for(const page of ['dictation.html','voice-bar.html']){const file=path.join(root,'renderer',page),html=fs.readFileSync(file,'utf8');for(const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)){const relative='renderer/'+match[1];assert.ok(build.files.includes(relative),'Missing packaged renderer dependency: '+relative);assert.ok(fs.statSync(path.join(root,relative)).isFile());}}
 assert.ok(build.files.includes('assets/**/*'));assert.ok(fs.statSync(path.join(root,'assets/fonts/Saira.ttf')).size>400000);assert.match(fs.readFileSync(path.join(root,'assets/fonts/Saira-OFL.txt'),'utf8'),/SIL OPEN FONT LICENSE/);
});
