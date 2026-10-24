'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),docs=path.join(root,'docs');
const publicFiles=new Map([['/index.html','preview.html'],['/branding/hero.png','branding/hero.png'],['/images/results.png','images/results.png'],['/images/settings.png','images/settings.png']]);
function resolveFile(input){
 try{
  if(typeof input!=='string'||!input.startsWith('/'))return null;
  const decoded=decodeURIComponent(input.split(/[?#]/,1)[0]);
  if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(part=>part==='..'||part.startsWith('.')))return null;
  const relative=publicFiles.get(decoded==='/'?'/index.html':decoded);if(!relative)return null;
  const file=path.join(docs,relative);if(!fs.existsSync(file)||!fs.statSync(file).isFile())return null;
  const canonical=fs.realpathSync(file);if(process.platform==='win32'?canonical.toLowerCase()!==file.toLowerCase():canonical!==file)return null;
  return file;
 }catch{return null;}
}
function start(){
 const server=http.createServer((req,res)=>{
  const method=req.method||'GET';if(!['GET','HEAD'].includes(method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  const pathname=typeof req.url==='string'?req.url.split(/[?#]/,1)[0]:'';
  if(pathname==='/'){res.writeHead(302,{'Location':'/index.html','Cache-Control':'no-store'});res.end();return;}
  if(pathname==='/status.json'){
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   res.end(method==='HEAD'?'':JSON.stringify({status:'ready',kind:'documentation-preview',applicationStarted:false,microphoneStarted:false,providerRequests:false}));return;
  }
  const file=resolveFile(req.url);if(!file){res.writeHead(404);res.end('Not exposed by this documentation preview');return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});
  if(method==='HEAD'){res.end();return;}fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 });
 server.listen(0,'127.0.0.1',()=>console.log('Dictpin documentation preview: http://127.0.0.1:'+server.address().port+' (Ctrl+C to stop)'));
 server.on('error',error=>{console.error(error.message);process.exitCode=1;});return server;
}
module.exports={resolveFile,start};if(require.main===module)start();
