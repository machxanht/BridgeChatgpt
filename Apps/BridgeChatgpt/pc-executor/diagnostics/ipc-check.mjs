import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const root='E:/AI/Bridge/runtime/agent-tasks/container-probe-v1',id=randomUUID();
fs.writeFileSync(root+'/ipc-run.txt',id);
const ports=process.argv.includes('--existing-proxy')?[43891]:[43891,43892];
const servers=ports.map(port=>net.createServer(s=>{s.on('error',()=>{});s.end();}));
const connects=(host,port)=>new Promise(resolve=>{const s=net.connect({host,port});let done=false;const end=v=>{if(done)return;done=true;s.destroy();resolve(v);};s.once('connect',()=>end(true));s.once('error',()=>end(false));s.setTimeout(750,()=>end(false));});
try {
 for(let i=0;i<servers.length;i++)await new Promise((r,j)=>{servers[i].once('error',j);servers[i].listen(ports[i],'127.0.0.1',r);});
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','E:/AI/Bridge/runtime/runner-control/ipc-native-check.ps1'],{windowsHide:true,stdio:'inherit'});
 const exited=new Promise(r=>child.on('exit',r));
 const ingress=[];
 const ips=['127.0.0.1',...Object.values(os.networkInterfaces()).flat().filter(x=>x&&!x.internal&&x.family==='IPv4').map(x=>x.address)];
 for(const phase of ['parent','child']){
  let ready;const until=Date.now()+12000;
  while(Date.now()<until){try{const r=JSON.parse(fs.readFileSync(root+`/ipc-ready-${phase}.json`,'utf8').replace(/^\uFEFF/,''));if(r.id===id){ready=r;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  if(!ready)throw Error('Missing live listener receipt '+phase);
  const connected=await Promise.all(ips.map(ip=>connects(ip,ready.port)));
  ingress.push({phase,listener_live:true,connections:connected});
  fs.writeFileSync(root+`/ipc-release-${phase}.txt`,id);
 }
 const exit=await exited;if(exit!==0)throw Error('Probe launcher failed');
 const rows=fs.readFileSync(root+'/ipc-stdout.txt','utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line.replace(/^\uFEFF/,'')));
 if(rows.length!==2||!rows.some(r=>r.child)||!rows.some(r=>!r.child))throw Error('Missing descendant evidence');
 const passed=rows.every(r=>r.proxy_connect&&r.can_listen&&r.own_loopback&&r.inside_write&&!r.outside_read&&!r.outside_write&&!r.direct_connect&&!r.loopback_connect)&&ingress.length===2&&ingress.every(r=>r.connections.every(v=>!v));
 fs.writeFileSync('E:/AI/Bridge/runtime/runner-control/ipc-boundary-report.json',JSON.stringify({time:new Date().toISOString(),passed,rows,ingress},null,2));
 console.log(JSON.stringify({passed,rows,ingress}));if(!passed)process.exitCode=2;
} catch(e){console.error(e.message);process.exitCode=1;}finally{for(const server of servers)server.close();}
