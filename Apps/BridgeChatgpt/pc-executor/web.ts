export function executorDashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bridge Local Executor</title>
  <style>
    :root { color-scheme: dark; --bg:#07111f; --panel:#101a2a; --panel2:#162235; --line:#26344b; --text:#eef5ff; --muted:#8ea0ba; --green:#38d39f; --blue:#4cc9ff; --warn:#ffc857; --red:#ff6b7a; }
    *{box-sizing:border-box} body{margin:0;background:radial-gradient(circle at top,#102447 0,#07111f 48%,#040b14 100%);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:var(--text);min-height:100vh}
    .wrap{max-width:1180px;margin:0 auto;padding:22px}.top{display:flex;align-items:center;gap:14px;margin-bottom:18px}.logo{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#1f8d72,#3ccfff);display:grid;place-items:center;font-weight:900;color:#04131a;box-shadow:0 10px 30px #0008}.title{font-size:22px;font-weight:800;letter-spacing:-.02em}.sub{font-size:13px;color:var(--muted)}
    .chip{margin-left:auto;border:1px solid var(--line);background:#0e1928;border-radius:999px;padding:7px 11px;font-size:12px;display:flex;align-items:center;gap:7px}.dot{width:8px;height:8px;border-radius:999px;background:var(--red)}.dot.on{background:var(--green);box-shadow:0 0 0 5px #38d39f18}
    .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:16px}@media(max-width:860px){.grid{grid-template-columns:1fr}.wrap{padding:14px}.top{align-items:flex-start}.chip{margin-left:0}}
    .card{background:linear-gradient(180deg,#111d2e,#0d1725);border:1px solid var(--line);border-radius:18px;box-shadow:0 18px 50px #0005;overflow:hidden}.head{padding:14px 16px;border-bottom:1px solid var(--line);font-weight:750;font-size:14px;display:flex;align-items:center;gap:8px}.body{padding:16px}.rows{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:620px){.rows{grid-template-columns:1fr}}
    label{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px}.field{width:100%;border:1px solid #31415b;background:#0a1320;color:var(--text);border-radius:11px;padding:10px 11px;outline:none}.field:focus{border-color:#3ccfff;box-shadow:0 0 0 3px #3ccfff1a}.check{display:flex;align-items:center;gap:8px;background:#0a1320;border:1px solid #31415b;border-radius:11px;padding:10px 11px;font-size:13px;color:#cbd8e8}.check input{accent-color:#38d39f}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.btn{border:1px solid #31415b;background:#172438;color:var(--text);border-radius:10px;padding:9px 12px;font-weight:700;font-size:12px;cursor:pointer}.btn:hover{background:#1d2e46}.btn.primary{background:linear-gradient(135deg,#178469,#1eaf8a);border-color:#3ad5aa;color:white}.btn.blue{background:#112d45;border-color:#225a7c;color:#8fddff}.btn.warn{background:#3b2e13;border-color:#6e5521;color:#ffd67a}
    .kv{display:grid;grid-template-columns:145px 1fr;gap:7px 12px;font-size:13px}.k{color:var(--muted)}.v{word-break:break-word}.ok{color:var(--green)}.bad{color:var(--red)}.muted{color:var(--muted)}
    .logs{height:420px;overflow:auto;background:#050b12;border-top:1px solid var(--line);padding:0}.log{padding:10px 14px;border-bottom:1px solid #142033;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.logtop{display:flex;gap:8px;align-items:center;margin-bottom:4px}.tag{font:700 10px ui-sans-serif;background:#172438;border:1px solid #2b3a51;border-radius:999px;padding:2px 7px}.out{white-space:pre-wrap;color:#b9c9dc;max-height:170px;overflow:auto}.err{color:#ff9ca7}.empty{padding:28px;text-align:center;color:var(--muted);font-size:13px}
    .quick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}@media(max-width:480px){.quick{grid-template-columns:1fr}}.quick .btn{min-height:48px;text-align:left}.small{font-size:11px;color:var(--muted);font-weight:500;display:block;margin-top:3px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="logo">B</div>
      <div><div class="title">Bridge Local Executor</div><div class="sub">PC worker + local control panel</div></div>
      <div class="chip"><span id="connDot" class="dot"></span><span id="connText">Disconnected</span></div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="head">⚙ Connection & project binding</div>
        <div class="body">
          <div class="rows">
            <div><label>Bridge URL</label><input id="bridgeUrl" class="field" placeholder="https://bridge-ai-mission-control.ai.studio" /></div>
            <div><label>Executor token</label><input id="token" type="password" class="field" placeholder="Leave blank to keep saved token" /></div>
            <div><label>Workspace ID</label><input id="workspaceId" class="field" placeholder="workspace-proj-default" /></div>
            <div><label>Project ID</label><input id="projectId" class="field" placeholder="proj-default" /></div>
            <div><label>Project root on this PC</label><input id="projectRoot" class="field" placeholder="C:\\Projects\\MyApp" /></div>
            <div><label>PC node name</label><input id="name" class="field" placeholder="My workstation" /></div>
            <label class="check"><input id="allowWrites" type="checkbox" /> Allow AI to write files inside project root</label>
            <label class="check"><input id="allowCommands" type="checkbox" /> Allow project commands / test / build (trusted code)</label>
          </div>
          <div class="actions"><button class="btn primary" onclick="saveConfig()">Save & connect</button><button class="btn" onclick="refresh()">Refresh</button></div>
        </div>
      </div>

      <div class="card">
        <div class="head">🖥 Node status</div>
        <div class="body"><div id="status" class="kv"><div class="k">Loading…</div><div class="v muted">Please wait</div></div></div>
      </div>

      <div class="card">
        <div class="head">⚡ Safe local actions</div>
        <div class="body quick">
          <button class="btn blue" onclick="localRun('git.status')">Git status<span class="small">Read-only working tree status</span></button>
          <button class="btn blue" onclick="localRun('git.diff')">Git diff<span class="small">Read-only unstaged diff</span></button>
          <button class="btn warn" onclick="localRun('npm.test')">npm test<span class="small">Requires command execution enabled</span></button>
          <button class="btn warn" onclick="localRun('npm.build')">npm build<span class="small">Requires command execution enabled</span></button>
        </div>
      </div>

      <div class="card">
        <div class="head">📡 How it works</div>
        <div class="body" style="font-size:13px;line-height:1.65;color:#c2d0e1">
          Bridge queues a job for this project. This PC polls Bridge over HTTPS, claims the job, runs it only inside the configured project root, then uploads the result. No inbound port or public tunnel is required for the worker connection.
          <div style="margin-top:10px;color:var(--muted)">Writes and arbitrary allowlisted commands stay disabled until you explicitly enable them here.</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="head">🧾 Recent executor log</div>
      <div id="logs" class="logs"><div class="empty">No executor activity yet.</div></div>
    </div>
  </div>
<script>
  async function api(url, options={}) {
    const r = await fetch(url, {headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    const data = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error || ('HTTP '+r.status));
    return data;
  }
  function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
  async function refresh(){
    try{
      const s=await api('/api/state');
      const c=s.config||{};
      bridgeUrl.value=c.bridgeUrl||''; workspaceId.value=c.workspaceId||''; projectId.value=c.projectId||''; projectRoot.value=c.projectRoot||''; name.value=c.name||''; allowWrites.checked=!!c.allowWrites; allowCommands.checked=!!c.allowCommands;
      connDot.className='dot'+(s.connection==='online'?' on':''); connText.textContent=s.connection==='online'?'Connected to Bridge':(s.connection==='setup_needed'?'Setup needed':'Disconnected');
      status.innerHTML=[['Node ID',s.nodeId],['Connection',s.connection],['Bridge',c.bridgeUrl||'—'],['Workspace',c.workspaceId||'—'],['Project',c.projectId||'—'],['Root',c.projectRoot||'—'],['Writes',c.allowWrites?'enabled':'disabled'],['Commands',c.allowCommands?'enabled':'disabled'],['Last error',s.lastError||'—']].map(([k,v])=>'<div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div>').join('');
      const list=s.logs||[];
      logs.innerHTML=list.length?list.map(x=>'<div class="log"><div class="logtop"><span class="tag">'+esc(x.action||x.type||'event')+'</span><span class="muted">'+esc(x.time||'')+'</span><span class="'+(x.ok===false?'bad':'ok')+'">'+(x.ok===false?'failed':'ok')+'</span></div><div class="out">'+esc(x.summary||x.stdout||x.error||'')+'</div></div>').join(''):'<div class="empty">No executor activity yet.</div>';
    }catch(e){connDot.className='dot';connText.textContent='Local UI error';status.innerHTML='<div class="bad">'+esc(e.message)+'</div>';}
  }
  async function saveConfig(){
    try{
      await api('/api/config',{method:'POST',body:JSON.stringify({bridgeUrl:bridgeUrl.value,token:token.value,workspaceId:workspaceId.value,projectId:projectId.value,projectRoot:projectRoot.value,name:name.value,allowWrites:allowWrites.checked,allowCommands:allowCommands.checked})});
      token.value=''; await refresh();
    }catch(e){alert(e.message)}
  }
  async function localRun(action){
    try{await api('/api/local-job',{method:'POST',body:JSON.stringify({action,payload:{}})});await refresh();}catch(e){alert(e.message);await refresh();}
  }
  refresh(); setInterval(refresh,4000);
</script>
</body></html>`;
}
