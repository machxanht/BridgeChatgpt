import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import {once} from 'node:events';
import {clientHelloHost,publicIPv4,startProviderProxy} from '../pc-executor/providerProxy.js';
for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','0.0.0.0','::1','224.0.0.1'])assert.equal(publicIPv4(address),false,address);
assert.equal(publicIPv4('1.1.1.1'),true);
const capture=net.createServer();capture.listen(0,'127.0.0.1');await once(capture,'listening');
const captured=new Promise<Buffer>(resolve=>capture.once('connection',socket=>socket.once('data',chunk=>{resolve(chunk);socket.destroy();})));
const client=tls.connect({host:'127.0.0.1',port:(capture.address() as net.AddressInfo).port,servername:'approved.example'});client.on('error',()=>{});
const hello=await captured;
assert.equal(clientHelloHost(hello),'approved.example');
for(let length=0;length<hello.length;length++)assert.equal(clientHelloHost(hello.subarray(0,length)),null,'partial ClientHello must wait for the whole record');
client.destroy();await new Promise<void>(resolve=>capture.close(()=>resolve()));
assert.throws(()=>clientHelloHost(Buffer.from('GET / HTTP/1.1\r\n')),/TLS/);
const observations:Array<{host:string;allowed:boolean}>=[];
const proxy=await startProviderProxy(['approved.example'],0,event=>{
  observations.push(event);
  throw new Error('Diagnostic sink failure must not weaken or break enforcement');
});
try{
  const denied=net.connect(proxy.port,'127.0.0.1');await once(denied,'connect');
  denied.write('CONNECT forbidden.example:443 HTTP/1.1\r\nHost: forbidden.example\r\n\r\n');
  const [response]=await once(denied,'data');assert.match(response.toString(),/403/);denied.destroy();
  assert.deepEqual(observations[0],{host:'forbidden.example',allowed:false});
  const mismatch=net.connect(proxy.port,'127.0.0.1');await once(mismatch,'connect');
  mismatch.write('CONNECT approved.example:443 HTTP/1.1\r\nHost: approved.example\r\n\r\n');
  const [tunnel]=await once(mismatch,'data');assert.match(tunnel.toString(),/200/);
  const wrong=Buffer.from(hello);const position=wrong.indexOf('approved.example');assert(position>=0);
  wrong.write('rejected.example',position,'ascii');
  mismatch.write(wrong);await once(mismatch,'close');
  assert.deepEqual(observations[1],{host:'approved.example',allowed:true});
}finally{await proxy.close();}
console.log('providerProxy.test.ts: private address denial, real TLS ClientHello, partial records, host allowlist and SNI mismatch PASS');
