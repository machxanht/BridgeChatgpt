export interface ProjectBinding { local_path:string; repository_url:string; branch:string }
/** Same contract on the server and the installed Windows coordinator. */
export function validateProjectBinding(input:ProjectBinding):ProjectBinding {
  const local_path=String(input.local_path||'');
  const folder=local_path.slice(5);
  if(!local_path.startsWith('Apps/')||!folder||folder.length>100||/[<>:"/\\|?*\u0000-\u001f]/.test(folder)||/[. ]$/.test(folder)||folder==='.'||folder==='..'||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(folder))throw new Error('Project folder must be a direct folder under Apps');
  const repository_url=String(input.repository_url||'').trim().replace(/\/$/,'');
  if(repository_url){
    if(repository_url.length>512)throw new Error('Repository URL is too long');
    const u=new URL(repository_url);
    if(u.protocol!=='https:'||u.hostname!=='github.com'||u.port||u.username||u.password||u.search||u.hash||!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(u.pathname))throw new Error('Use an HTTPS GitHub repository URL without credentials');
  }
  const branch=String(input.branch||'main');
  if(!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,150}$/.test(branch)||branch.includes('..')||branch.endsWith('/')||branch.endsWith('.lock')||branch.includes('//'))throw new Error('Invalid branch');
  return {local_path,repository_url,branch};
}
