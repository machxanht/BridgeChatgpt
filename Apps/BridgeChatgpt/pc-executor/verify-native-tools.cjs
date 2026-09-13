// Offline probe executed by BridgeAgent inside the real AppContainer.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const [inactive,control,release,child]=process.argv.slice(2);
function denied(target,write){let blocked=false;try{const fd=fs.openSync(target,write?'wx':'r');fs.closeSync(fd);}catch(e){blocked=['EPERM','EACCES'].includes(e.code);}assert(blocked,'Boundary failed: '+target);}
async function boundaries(){
 denied(path.join(inactive,'package.json'),false);
 denied(path.join(control,'runner-config.json'),false);
 const stamp=Date.now()+'-'+process.pid;
 for(const root of [inactive,control,release])denied(path.join(root,'.bridge-negative-'+stamp),true);
 await new Promise((resolve,reject)=>{const socket=net.connect({host:'1.1.1.1',port:443});socket.setTimeout(2000);socket.on('connect',()=>{socket.destroy();reject(Error('Direct network unexpectedly allowed'));});socket.on('error',resolve);socket.on('timeout',()=>{socket.destroy();resolve();});});
 console.log(child?'CHILD_BOUNDARY_OK':'PARENT_BOUNDARY_OK');
}
(async()=>{
 if(child){await boundaries();return;}
 const scratch=path.join(process.cwd(),'.bridge-offline-tools');fs.mkdirSync(scratch,{recursive:true});
 fs.writeFileSync(path.join(scratch,'package.json'),JSON.stringify({private:true,type:'commonjs',scripts:{test:'node check.cjs'}}));
 fs.writeFileSync(path.join(scratch,'calculator.js'),'module.exports={add:(a,b)=>a+b,subtract:(a,b)=>a-b};');
 fs.writeFileSync(path.join(scratch,'check.cjs'),"const assert=require('node:assert/strict'),c=require('./calculator.js');assert.equal(c.add(2,3),5);assert.equal(c.subtract(7,2),5);require('node:crypto').randomBytes(16);console.log('JS_CRYPTO_TEST_OK');");
 // Inherited handles avoid Node's named-pipe capture path inside AppContainer.
 const options={stdio:'inherit',timeout:15000,windowsHide:true};
 cp.execFileSync(process.execPath,[path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),'test'],{...options,cwd:scratch});
 cp.execFileSync('git.exe',['status','--porcelain'],options);
 // Check the project-level package scope too, outside the test subdirectory.
 assert.equal(require(path.join(process.cwd(),'bridge-toolchain-probe.js')),42);
 await boundaries();
 cp.execFileSync(process.execPath,[__filename,inactive,control,release,'child'],options);
 console.log('BRIDGE_NATIVE_TOOLS_OK');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
