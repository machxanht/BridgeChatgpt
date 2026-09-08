import http from 'node:http';
import net from 'node:net';
import {lookup} from 'node:dns/promises';
import type {AddressInfo,Socket} from 'node:net';

export function publicIPv4(address:string):boolean {
  if(net.isIP(address)!==4)return false;
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||
    a===100&&b>=64&&b<=127||a===192&&b===0||a===198&&(b===18||b===19)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
}

/** Parse only a bounded TLS ClientHello, never application plaintext. */
export function clientHelloHost(data:Buffer):string|null {
  let offset=0;const fragments:Buffer[]=[];let size=0;
  while(offset+5<=data.length){
    const length=data.readUInt16BE(offset+3);
    if(data[offset]!==22||data[offset+1]!==3||length>18432)throw new Error('TLS ClientHello required');
    if(offset+5+length>data.length)return null;
    fragments.push(data.subarray(offset+5,offset+5+length));size+=length;offset+=5+length;
    if(size>65536)throw new Error('TLS ClientHello exceeds limit');
    const hello=Buffer.concat(fragments);
    if(hello.length<4)continue;
    if(hello[0]!==1)throw new Error('TLS ClientHello required');
    const required=4+hello.readUIntBE(1,3);
    if(required>65536)throw new Error('TLS ClientHello exceeds limit');
    if(hello.length<required)continue;
    const end=required;
    const need=(position:number,count:number)=>{if(position+count>end)throw new Error('Malformed TLS ClientHello');};
    let p=38;need(p,1);p+=1+hello[p];need(p,2);const cipherBytes=hello.readUInt16BE(p);p+=2+cipherBytes;
    need(p,1);p+=1+hello[p];need(p,2);const extensionBytes=hello.readUInt16BE(p);p+=2;
    if(p+extensionBytes!==end)throw new Error('Malformed TLS extensions');
    let hostname:string|undefined;
    while(p<end){
      need(p,4);const type=hello.readUInt16BE(p),len=hello.readUInt16BE(p+2);p+=4;need(p,len);
      if(type===0xfe0d)throw new Error('Encrypted ClientHello is not allowed through the provider proxy');
      if(type===0){
        if(hostname||len<5||hello.readUInt16BE(p)!==len-2||hello[p+2]!==0||hello.readUInt16BE(p+3)!==len-5)throw new Error('Invalid TLS server name');
        hostname=hello.subarray(p+5,p+len).toString('ascii').toLowerCase();
        if(!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(hostname))throw new Error('Invalid TLS server name');
      }
      p+=len;
    }
    if(!hostname)throw new Error('TLS server name required');
    return hostname;
  }
  return null;
}

export async function startProviderProxy(allowedHosts:readonly string[],port=43892,
  observe?:(event:{host:string;allowed:boolean})=>void){
  const allowed=new Set(allowedHosts);
  if(!allowed.size||[...allowed].some(host=>!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host)))throw new Error('Explicit provider hostname allowlist required');
  const sockets=new Set<Socket>();
  const track=(socket:Socket)=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});};
  const server=http.createServer((_req,res)=>{res.writeHead(405);res.end('HTTPS CONNECT required');});
  server.maxHeadersCount=30;server.headersTimeout=10000;server.requestTimeout=10000;
  server.on('connection',track);
  server.on('clientError',(_err,socket)=>socket.destroy());
  server.on('connect',(req,connection,head)=>{
    const client=connection as Socket;
    const match=/^([a-z0-9.-]+):443$/.exec(req.url||'');
    // Hostnames only: never record headers, credentials, paths, or TLS content.
    if(match&&match[1].length<=253){try{observe?.({host:match[1],allowed:allowed.has(match[1])});}catch{ /* Diagnostics cannot change enforcement. */ }}
    if(!match||!allowed.has(match[1])||sockets.size>64){client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    const hostname=match[1];let chunks:Buffer[]=[],bytes=0,checking=false;
    client.setTimeout(10000,()=>client.destroy());
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const hello=async(chunk:Buffer)=>{
      if(checking)return;
      chunks.push(chunk);bytes+=chunk.length;
      if(bytes>65536){client.destroy();return;}
      try{
        const buffered=Buffer.concat(chunks),sni=clientHelloHost(buffered);
        if(!sni)return;
        checking=true;client.pause();client.removeListener('data',hello);
        if(sni!==hostname)throw new Error('CONNECT and TLS server names differ');
        const addresses=await lookup(hostname,{all:true,family:4});
        if(!addresses.length||addresses.some(item=>!publicIPv4(item.address)))throw new Error('Provider resolved outside the public network');
        if(client.destroyed)return;
        const upstream=net.connect({host:addresses[0].address,port:443});track(upstream);
        upstream.setTimeout(10000,()=>upstream.destroy());
        client.once('close',()=>upstream.destroy());upstream.once('close',()=>client.destroy());
        upstream.once('connect',()=>{
          client.setTimeout(120000);upstream.setTimeout(120000);
          upstream.write(buffered);chunks=[];
          client.pipe(upstream);upstream.pipe(client);client.resume();
        });
      }catch{client.destroy();}
    };
    client.on('data',hello);
    if(head.length)void hello(head);
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port,exclusive:true},()=>{server.removeListener('error',reject);resolve();});});
  return {port:(server.address() as AddressInfo).port,close:async()=>{
    for(const socket of sockets)socket.destroy();
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }};
}
