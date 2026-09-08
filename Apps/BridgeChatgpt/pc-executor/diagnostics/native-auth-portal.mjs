import fs from 'node:fs';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {startProviderProxy} from '../providerProxy.ts';
const root='E:/AI/Bridge/runtime/agent-tasks/native-auth';
const origin='http://127.0.0.1:43894';
let priorKey='';try{const prior=new URL(fs.readFileSync('E:/AI/Bridge/runtime/runner-control/native-auth-portal-url.txt','utf8').trim());if(prior.origin===origin)priorKey=prior.searchParams.get('key')||'';}catch{}
const nonce=/^[a-f0-9]{48}$/.test(priorKey)?priorKey:randomBytes(24).toString('hex');
let child=null,started=0,exited=false;
const read=name=>{try{return fs.readFileSync(root+'/'+name,'utf8').replace(/^\uFEFF/,'');}catch{return '';}};
const state=()=>{const err=read('stderr.txt'),match=err.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?[^\s]+/);let result;try{result=JSON.parse(read('result.json'));}catch{}return {running:!!child&&!exited,url:match?.[0]||null,result:result||null,error:read('helper-error.txt')||read('launcher-error.txt')||result?.error||null,started};};
const html=`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bridge · Đăng nhập Google</title><style>body{font:17px system-ui;background:#101726;color:#eef3ff;max-width:680px;margin:8vh auto;padding:24px;line-height:1.6}button,a{background:#74c5ff;color:#071424;border:0;border-radius:8px;padding:12px 18px;text-decoration:none;cursor:pointer}input{box-sizing:border-box;width:100%;padding:13px;margin:16px 0;background:#1e2a40;color:white;border:1px solid #789;border-radius:8px}#google{display:none}#status{white-space:pre-wrap;color:#b9d9ef}small{color:#b9c5d9}</style><h1>Đăng nhập Google cho Bridge</h1><p>Phiên trước đã lưu trong Windows Credential Manager. Bước này đăng nhập ngay trong vùng cô lập mà runner sử dụng.</p><p>1. Bấm <b>Bắt đầu</b>. Khi có liên kết, mở Google và chọn tài khoản.</p><button id="start">Bắt đầu</button> <a id="google" target="_blank" rel="noopener noreferrer">Mở Google để đăng nhập</a><p>2. Copy Authorization code Google hiển thị, dán bên dưới rồi gửi.</p><input id="code" type="password" autocomplete="off" placeholder="Authorization code"><button id="send">Gửi mã cho CLI</button><p id="status">Chưa bắt đầu. Đây là trang đăng nhập cục bộ, chưa phải trang test E2E.</p><small>Mã chỉ chuyển tới CLI trên máy này; không gửi vào chat.</small><script>const key=${JSON.stringify(nonce)};const status=document.querySelector('#status');async function call(path,data){const r=await fetch(path,{method:data?'POST':'GET',headers:{'X-Bridge-Local':key,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw Error(v.error);return v;}document.querySelector('#start').onclick=async()=>{try{await call('/start',{});status.textContent='Đang mở phiên CLI…';}catch(e){status.textContent=e.message}};document.querySelector('#send').onclick=async()=>{const field=document.querySelector('#code');try{await call('/code',{code:field.value});field.value='';status.textContent='Đã gửi mã. Đang chờ CLI xác nhận…';}catch(e){status.textContent=e.message}};setInterval(async()=>{try{const s=await call('/status');const link=document.querySelector('#google');if(s.url&&s.running){link.href=s.url;link.style.display='inline-block';}else{link.style.display='none';}if(s.error)status.textContent='CLI báo lỗi: '+s.error;else if(s.result)status.textContent=s.result.exit_code===0?'Đã nhận kết quả từ CLI. Quay lại Codex để xác minh phiên và chạy tiếp.':'CLI chưa hoàn tất đăng nhập. Bấm Bắt đầu để lấy phiên mới.';else if(s.started&&!s.running)status.textContent='Phiên CLI đã kết thúc. Bấm Bắt đầu để lấy phiên mới.';}catch{}},1000);</script></html>`;
const proxy=await startProviderProxy(['oauth2.googleapis.com','accounts.google.com','www.googleapis.com','cloudcode-pa.googleapis.com','daily-cloudcode-pa.sandbox.googleapis.com','antigravity.google','antigravity-unleash.goog'],43892);
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 if(req.headers.host!=='127.0.0.1:43894')return send(403,{error:'Host không hợp lệ'});
 const u=new URL(req.url,origin);
 if(req.method==='GET'&&u.pathname==='/'&&u.searchParams.get('key')===nonce){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}
 if(req.headers['x-bridge-local']!==nonce||req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Yêu cầu không hợp lệ'});
 if(req.method==='GET'&&u.pathname==='/status')return send(200,state());
 if(req.method!=='POST')return send(405,{error:'Method not allowed'});
 let body='';try{for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error('Dữ liệu quá dài');}const data=JSON.parse(body||'{}');
 if(u.pathname==='/start'){
  if(child&&!exited)return send(409,{error:'Phiên đang chạy; dùng liên kết Google hiện tại.'});
  for(const name of ['code.txt','result.json','stdout.txt','stderr.txt','helper-error.txt','launcher-error.txt','cleanup.json']){try{fs.unlinkSync(root+'/'+name);}catch(e){if(e.code!=='ENOENT')throw e;}}
  started=Date.now();exited=false;
  child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','E:/AI/Bridge/runtime/runner-control/native-auth-owned.ps1'],{windowsHide:true,stdio:['pipe','ignore','pipe'],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PSModulePath$/i.test(k)))});
  child.on('exit',()=>{exited=true;});child.on('error',e=>{fs.writeFileSync(root+'/launcher-error.txt',e.message);exited=true;});child.stderr.on('data',()=>{});
  return send(200,{started:true});
 }
 if(u.pathname==='/code'){
  if(!child||exited)return send(409,{error:'Bấm Bắt đầu trước.'});
  const code=typeof data.code==='string'?data.code.trim():'';if(code.length<10||code.length>4096||/[\r\n\x00]/.test(code))return send(400,{error:'Mã không hợp lệ'});
  fs.writeFileSync(root+'/code.txt',code,{encoding:'utf8',flag:'wx'});return send(200,{submitted:true});
 }
 return send(404,{error:'Not found'});
 }catch(e){send(400,{error:e.code==='EEXIST'?'Mã đã được gửi cho phiên này.':e.message});}
});
server.headersTimeout=10000;server.requestTimeout=15000;server.maxHeadersCount=20;
await new Promise((r,j)=>{server.once('error',j);server.listen(43894,'127.0.0.1',r);});
const url=origin+'/?key='+nonce;fs.writeFileSync('E:/AI/Bridge/runtime/runner-control/native-auth-portal-url.txt',url);console.log('Native login portal ready');
setTimeout(async()=>{if(child&&!exited)child.kill();server.closeAllConnections();server.close();await proxy.close();},60*60*1000);
