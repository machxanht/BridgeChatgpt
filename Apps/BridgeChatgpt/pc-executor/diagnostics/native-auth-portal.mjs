import fs from 'node:fs';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {startProviderProxy} from '../providerProxy.ts';
const root='E:/AI/Bridge/runtime/agent-tasks/native-auth';
const origin='http://127.0.0.1:43894';
let priorKey='';try{const prior=new URL(fs.readFileSync('E:/AI/Bridge/runtime/runner-control/native-auth-portal-url.txt','utf8').trim());if(prior.origin===origin)priorKey=prior.searchParams.get('key')||'';}catch{}
const nonce=/^[a-f0-9]{48}$/.test(priorKey)?priorKey:randomBytes(24).toString('hex');
let child=null,started=0,exited=false,session='',oauthSeen=0,submitted=false;
const read=name=>{try{return fs.readFileSync(root+'/'+name,'utf8').replace(/^\uFEFF/,'');}catch{return '';}};
const clean=s=>s.replace(/\x1b\][^\x07]*(?:\x07|$)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
const state=()=>{
 const log=clean(read('stderr.txt'));let result;try{result=JSON.parse(read('result.json'));}catch{}
 const match=log.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?[^\s]+/);
 const running=!!child&&!exited;
 if(match&&running&&!oauthSeen)oauthSeen=Date.now();
 let kind=null;
 if(/invalid_grant|Malformed auth code/i.test(log))kind='invalid_code';
 else if(/authentication timed out/i.test(log))kind='timeout';
 else if(/Forbidden/i.test(log))kind='network_forbidden';
 else if(/Eligibility check failed/i.test(log))kind='eligibility_error';
 else if(/Error: authentication failed/i.test(log))kind='provider_error';
 else if(read('helper-error.txt')||read('launcher-error.txt')||result?.error)kind='launcher_error';
 else if(result&&result.exit_code!==0)kind='cli_error';
 const delivered=!!read('input-delivered.json');
 return {running,session,url:running&&!submitted&&!kind?match?.[0]||null:null,submitted,delivered,kind,result:result?{exit_code:result.exit_code,completed:result.completed}:null,remaining:oauthSeen?Math.max(0,60-Math.ceil((Date.now()-oauthSeen)/1000)):null,started};
};
const html=`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bridge · Đăng nhập Google</title><style>body{font:17px system-ui;background:#101726;color:#eef3ff;max-width:720px;margin:6vh auto;padding:24px;line-height:1.6}button,a{background:#74c5ff;color:#071424;border:0;border-radius:8px;padding:12px 18px;text-decoration:none;cursor:pointer}button:disabled{opacity:.4;cursor:default}input{box-sizing:border-box;width:100%;padding:13px;margin:16px 0;background:#1e2a40;color:white;border:1px solid #789;border-radius:8px}#google{display:none}#status{white-space:pre-wrap;color:#b9d9ef}small{color:#b9c5d9}</style><h1>Đăng nhập Google cho Bridge</h1><p>Đã sửa kênh nhận mã trên Windows. Mỗi phiên Google có thời hạn <b>60 giây</b>; chỉ gửi một mã mới cho phiên hiện tại.</p><p>1. Bấm <b>Bắt đầu</b>, rồi <b>Mở Google để đăng nhập</b>.</p><button id="start">Bắt đầu</button> <a id="google" target="_blank" rel="noopener noreferrer">Mở Google để đăng nhập</a><p>2. Copy Authorization code Google hiển thị, dán bên dưới rồi gửi.</p><input id="code" type="password" autocomplete="off" placeholder="Authorization code"><button id="send" disabled>Gửi mã cho CLI</button><p id="status">Đang kết nối…</p><small>Mã chỉ chuyển tới CLI trên PC này. Không gửi mã vào chat. Đây chưa phải trang test E2E.</small><script>
const key=${JSON.stringify(nonce)};let session='';const status=document.querySelector('#status'),start=document.querySelector('#start'),send=document.querySelector('#send'),field=document.querySelector('#code'),link=document.querySelector('#google');
async function call(path,data){const r=await fetch(path,{method:data?'POST':'GET',headers:{'X-Bridge-Local':key,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw Error(v.error);return v;}
async function refresh(){try{const s=await call('/status');if(session!==s.session){session=s.session;field.value='';}start.disabled=s.running;send.disabled=!s.running||s.submitted||!s.url||s.remaining===0;field.disabled=send.disabled;link.style.display=s.url?'inline-block':'none';if(s.url)link.href=s.url;
const errors={network_forbidden:'Kết nối dịch vụ bị từ chối (403). Không gửi thêm mã; cần kiểm tra proxy hoặc phản hồi dịch vụ.',eligibility_error:'Không hoàn tất kiểm tra quyền sử dụng tài khoản. Không gửi thêm mã; cần kiểm tra lỗi CLI.',invalid_code:'Google đã nhận mã nhưng từ chối: mã sai, đã dùng hoặc không thuộc phiên này. Bấm Bắt đầu và lấy mã mới từ liên kết mới.',timeout:s.delivered?'CLI đã nhận mã nhưng phiên đăng nhập hết hạn. Chưa xác nhận đăng nhập thành công.':'Phiên 60 giây đã hết trước khi CLI xử lý mã. Không gửi lại mã cũ.',provider_error:'CLI đã báo lỗi xác thực từ nhà cung cấp. Dừng thử lại và báo mình kiểm tra.',launcher_error:'Lỗi khởi động terminal. Dừng gửi mã; cần sửa runner.',cli_error:'CLI kết thúc với lỗi. Dừng gửi mã để kiểm tra.'};
if(s.kind)status.textContent=errors[s.kind];else if(s.result?.exit_code===0)status.textContent='CLI đã hoàn tất. Nhắn “đã gửi mã” để kiểm tra khả năng giữ phiên.';else if(s.delivered&&s.running)status.textContent='Đã chuyển mã vào terminal CLI. Đang chờ Google xác nhận…';else if(s.submitted&&s.running)status.textContent='Đã nhận mã tại trang Bridge. Đang chuyển vào terminal…';else if(s.url)status.textContent='Phiên đang chờ mã — còn khoảng '+s.remaining+' giây.';else if(s.running)status.textContent='Đang khởi động terminal…';else status.textContent='Bấm Bắt đầu để tạo phiên đăng nhập.';
}catch{status.textContent='Mất kết nối trang đăng nhập cục bộ. Không gửi mã; báo mình mở lại dịch vụ.';send.disabled=true;start.disabled=true;}}
start.onclick=async()=>{start.disabled=true;try{await call('/start',{});await refresh();}catch(e){status.textContent=e.message;start.disabled=false;}};
send.onclick=async()=>{send.disabled=true;try{await call('/code',{code:field.value,session});field.value='';await refresh();}catch(e){status.textContent=e.message;}};
refresh();setInterval(refresh,1000);
</script></html>`;
const proxyEvents=[];
const proxy=await startProviderProxy(['oauth2.googleapis.com','accounts.google.com','www.googleapis.com','cloudcode-pa.googleapis.com','daily-cloudcode-pa.googleapis.com','daily-cloudcode-pa.sandbox.googleapis.com','lh3.googleusercontent.com','antigravity.google','antigravity-unleash.goog'],43892,event=>{
 proxyEvents.push({...event,time:new Date().toISOString()});if(proxyEvents.length>100)proxyEvents.shift();
 fs.writeFileSync('E:/AI/Bridge/runtime/runner-control/native-auth-proxy-hosts.json',JSON.stringify(proxyEvents));
});
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
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
  for(const name of ['code.txt','result.json','stdout.txt','stderr.txt','helper-error.txt','launcher-error.txt','cleanup.json','input-delivered.json']){try{fs.unlinkSync(root+'/'+name);}catch(e){if(e.code!=='ENOENT')throw e;}}
  started=Date.now();session=randomBytes(16).toString('hex');exited=false;oauthSeen=0;submitted=false;
  child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','E:/AI/Bridge/runtime/runner-control/native-auth-owned.ps1'],{windowsHide:true,stdio:['pipe','ignore','pipe'],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PSModulePath$/i.test(k)))});
  child.on('exit',()=>{exited=true;});child.on('error',e=>{fs.writeFileSync(root+'/launcher-error.txt',e.message);exited=true;});child.stderr.on('data',()=>{});
  return send(200,{started:true,session});
 }
 if(u.pathname==='/code'){
  const s=state();
  if(!s.running||s.kind||s.remaining===0||!s.url)return send(409,{error:'Phiên chưa sẵn sàng hoặc đã kết thúc. Không gửi lại mã cũ.'});
  if(data.session!==session)return send(409,{error:'Trang này thuộc phiên cũ. Tải lại trang và dùng phiên hiện tại.'});
  if(submitted)return send(409,{error:'Phiên này đã nhận một mã; đang chờ CLI.'});
  const code=typeof data.code==='string'?data.code.trim():'';if(code.length<10||code.length>4096||/[\r\n\x00]/.test(code))return send(400,{error:'Mã không hợp lệ'});
  fs.writeFileSync(root+'/code.txt',code,{encoding:'utf8',flag:'wx'});submitted=true;return send(200,{submitted:true});
 }
 return send(404,{error:'Not found'});
 }catch(e){send(400,{error:e.code==='EEXIST'?'Mã đã được gửi cho phiên này.':'Không thể xử lý yêu cầu. Dừng gửi mã để kiểm tra.'});}
});
server.headersTimeout=10000;server.requestTimeout=15000;server.maxHeadersCount=20;
await new Promise((r,j)=>{server.once('error',j);server.listen(43894,'127.0.0.1',r);});
const url=origin+'/?key='+nonce;fs.writeFileSync('E:/AI/Bridge/runtime/runner-control/native-auth-portal-url.txt',url);console.log('Native login portal ready (ConPTY)');
setTimeout(async()=>{if(child&&!exited)child.kill();server.closeAllConnections();server.close();await proxy.close();},60*60*1000);
