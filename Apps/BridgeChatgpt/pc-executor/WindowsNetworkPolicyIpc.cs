using System;
using System.Runtime.InteropServices;
namespace Bridge.Native {
  public static class NetworkPolicyIpc {
    // Replaces the v1 blanket listen denial. No LoopbackExempt entry may remain.
    // Windows enforces same-package loopback at RECEIVE, where both endpoints
    // are known. Our receive filter also denies foreign callers to this package.
    // The sole hard permit is the host proxy's exact executable/address/port;
    // its application protocol still enforces CONNECT, public DNS and TLS SNI.
    // Wildcard bind can succeed, but foreign ingress is denied at RECEIVE.
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Display { public string name,description; }
    [StructLayout(LayoutKind.Sequential)] struct Blob {public uint size;public IntPtr data;}
    [StructLayout(LayoutKind.Explicit,Size=16)] struct Value { [FieldOffset(0)] public uint type;[FieldOffset(8)]public IntPtr pointer;[FieldOffset(8)]public uint number; }
    [StructLayout(LayoutKind.Sequential)] struct Condition { public Guid field; public uint match;public Value value; }
    [StructLayout(LayoutKind.Sequential)] struct Action {public uint type;public Guid key;}
    [StructLayout(LayoutKind.Explicit,Size=16)] struct Context {[FieldOffset(0)]public ulong raw;}
    [StructLayout(LayoutKind.Sequential)] struct Filter {
      public Guid key;public Display display;public uint flags;public IntPtr provider;public Blob data;
      public Guid layer,sublayer;public Value weight;public uint count;public IntPtr conditions;
      public Action action;public Context context;public IntPtr reserved;public ulong id;public Value effectiveWeight;
    }
    [StructLayout(LayoutKind.Sequential)] struct Sublayer {public Guid key;public Display display;public uint flags;public IntPtr provider;public Blob data;public ushort weight;}
    [DllImport("fwpuclnt.dll",CharSet=CharSet.Unicode)] static extern uint FwpmEngineOpen0(string server,uint auth,IntPtr identity,IntPtr session,out IntPtr engine);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmEngineClose0(IntPtr engine);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmTransactionBegin0(IntPtr engine,uint flags);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmTransactionCommit0(IntPtr engine);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmTransactionAbort0(IntPtr engine);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmSubLayerAdd0(IntPtr engine,ref Sublayer layer,IntPtr sd);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmFilterAdd0(IntPtr engine,ref Filter filter,IntPtr sd,out ulong id);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmFilterGetByKey0(IntPtr engine,ref Guid key,out IntPtr filter);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmFilterDeleteByKey0(IntPtr engine,ref Guid key);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmSubLayerDeleteByKey0(IntPtr engine,ref Guid key);
    [DllImport("fwpuclnt.dll")] static extern uint FwpmSubLayerGetByKey0(IntPtr engine,ref Guid key,out IntPtr layer);
    [DllImport("fwpuclnt.dll")] static extern void FwpmFreeMemory0(ref IntPtr memory);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSidToSid(string text,out IntPtr sid);
    [DllImport("advapi32.dll")] static extern bool EqualSid(IntPtr left,IntPtr right);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    [DllImport("fwpuclnt.dll",CharSet=CharSet.Unicode)] static extern uint FwpmGetAppIdFromFileName0(string path,out IntPtr blob);
    static readonly Guid LocalAddress=new Guid("d9ee00de-c1ef-4617-bfe3-ffd8f5a08957"),LocalPort=new Guid("0c1ba1af-5765-453f-af22-a8f791ac775b"),Flags=new Guid("632ce23b-5167-435c-86d7-e903684aa80c"),AppId=new Guid("d78e1e87-8644-4ea5-9437-d809ecefc971"),Receive4=new Guid("e1cd9fe7-f4b5-4273-96c0-592e487b8650");
    static readonly Guid Sub=new Guid("b73561e9-1239-4b20-96ce-c56bd2f8a340");
    static readonly Guid Package=new Guid("71bc78fa-f17c-4997-a602-6abb261f351c");
    static readonly Guid Address=new Guid("b235ae9a-1d64-49b8-a44c-5ff3d9095045");
    static readonly Guid Protocol=new Guid("3971ef2b-623e-4f9a-8cb1-6e79b806b9a7");
    static readonly Guid Connect4=new Guid("c38d57d1-05a7-4c33-904f-7fbceee60e82");
    static readonly Guid Connect6=new Guid("4a72393b-319f-44bc-84c3-ba54dcb3b6b4");
    static readonly Guid Listen4=new Guid("88bb5dad-76d7-4227-9c71-df0a3ed7be7e");
    static readonly Guid Listen6=new Guid("7ac9de24-17dd-4814-b4bd-a9fbc95a321b");
    static Guid Key(int index){return new Guid("b73561e9-1239-4b20-96ce-c56bd2f8a35"+index);}
    static void Check(uint result){if(result!=0)throw new InvalidOperationException("WFP error 0x"+result.ToString("X8"));}
    static IntPtr Sid(string text){if(!text.StartsWith("S-1-15-2-"))throw new ArgumentException("AppContainer SID required");IntPtr sid;if(!ConvertStringSidToSid(text,out sid))throw new ArgumentException("Invalid package SID");return sid;}
    static Condition Number(Guid field,uint type,uint number,uint match=0){return new Condition{field=field,match=match,value=new Value{type=type,number=number}};}
    static Condition[] Conditions(int index,IntPtr sid,ushort port,IntPtr app){
      var package=new Condition{field=Package,match=0,value=new Value{type=13,pointer=sid}};
      if(index==0)return new[]{package,Number(Address,3,0x7F000001,10)};
      if(index==1)return new[]{package,Number(Protocol,1,6,10)};
      if(index==2||index==5)return new[]{package};
      if(index==3)return new[]{package,Number(LocalAddress,3,0x7F000001,10)};
      if(index==4)return new[]{package,Number(LocalPort,2,port)};
      if(index==6)return new[]{Number(LocalAddress,3,0x7F000001),Number(LocalPort,2,port),Number(Protocol,1,6),Number(Flags,3,1,6),new Condition{field=AppId,match=0,value=new Value{type=12,pointer=app}}};
      return new[]{package,Number(Flags,3,0x00400000,8)};
    }
    static Guid Layer(int index){return index<2?Connect4:index==2?Connect6:index<5?Listen4:index==5?Listen6:Receive4;}
    static bool SameValue(Value a,Value b){
      if(a.type==13)return EqualSid(a.pointer,b.pointer);
      if(a.type!=12)return a.number==b.number;
      var x=(Blob)Marshal.PtrToStructure(a.pointer,typeof(Blob));var y=(Blob)Marshal.PtrToStructure(b.pointer,typeof(Blob));
      if(x.size!=y.size||x.size>32768)return false;for(int i=0;i<x.size;i++)if(Marshal.ReadByte(x.data,i)!=Marshal.ReadByte(y.data,i))return false;return true;
    }
    public static void Install(string packageSid,ushort proxyPort,string proxyExecutable){
      if(IntPtr.Size!=8||proxyPort<1024)throw new ArgumentException("64-bit host and non-system proxy port required");
      IntPtr engine=IntPtr.Zero,sid=Sid(packageSid),app=IntPtr.Zero;bool transaction=false;
      try{
        Check(FwpmGetAppIdFromFileName0(proxyExecutable,out app));Check(FwpmEngineOpen0(null,10,IntPtr.Zero,IntPtr.Zero,out engine));Check(FwpmTransactionBegin0(engine,0));transaction=true;
        var sub=new Sublayer{key=Sub,display=new Display{name="Bridge native proxy and internal IPC confinement v2"},flags=1,weight=0xF101};
        Check(FwpmSubLayerAdd0(engine,ref sub,IntPtr.Zero));
        for(int index=0;index<8;index++){
          var conditions=Conditions(index,sid,proxyPort,app);int size=Marshal.SizeOf(typeof(Condition));IntPtr memory=Marshal.AllocHGlobal(size*conditions.Length);
          try{
            for(int i=0;i<conditions.Length;i++)Marshal.StructureToPtr(conditions[i],IntPtr.Add(memory,size*i),false);
            var filter=new Filter{key=Key(index),display=new Display{name="Bridge package proxy and internal IPC confinement "+index},flags=index==6?9u:1u,
              layer=Layer(index),sublayer=Sub,count=(uint)conditions.Length,conditions=memory,action=new Action{type=index==6?0x1002u:0x1001u}};
            ulong id;uint added=FwpmFilterAdd0(engine,ref filter,IntPtr.Zero,out id);if(added!=0)throw new InvalidOperationException("Filter "+index+" WFP error 0x"+added.ToString("X8"));
          }finally{Marshal.FreeHGlobal(memory);}
        }
        Check(FwpmTransactionCommit0(engine));transaction=false;
      }finally{if(transaction)FwpmTransactionAbort0(engine);if(engine!=IntPtr.Zero)FwpmEngineClose0(engine);if(app!=IntPtr.Zero)FwpmFreeMemory0(ref app);LocalFree(sid);}
    }
    public static bool Verify(string packageSid,ushort proxyPort,string proxyExecutable){
      IntPtr engine=IntPtr.Zero,sid=Sid(packageSid),app=IntPtr.Zero;
      try{
        Check(FwpmGetAppIdFromFileName0(proxyExecutable,out app));Check(FwpmEngineOpen0(null,10,IntPtr.Zero,IntPtr.Zero,out engine));
        Guid subKey=Sub;IntPtr subPointer=IntPtr.Zero;
        try {
          Check(FwpmSubLayerGetByKey0(engine,ref subKey,out subPointer));
          var sub=(Sublayer)Marshal.PtrToStructure(subPointer,typeof(Sublayer));
          if(sub.weight!=0xF101||sub.flags!=1)throw new InvalidOperationException("IPC sublayer differs: weight="+sub.weight+" flags="+sub.flags);
        } finally {if(subPointer!=IntPtr.Zero)FwpmFreeMemory0(ref subPointer);}
        for(int index=0;index<8;index++){
          Guid key=Key(index);IntPtr pointer=IntPtr.Zero;
          try{
            Check(FwpmFilterGetByKey0(engine,ref key,out pointer));var filter=(Filter)Marshal.PtrToStructure(pointer,typeof(Filter));
            var expected=Conditions(index,sid,proxyPort,app);
            if(filter.layer!=Layer(index)||filter.sublayer!=Sub||filter.action.type!=(index==6?0x1002u:0x1001u)||filter.count!=expected.Length||(filter.flags & ~0x40u)!=(index==6?9u:1u))throw new InvalidOperationException("Filter "+index+" differs: flags="+filter.flags+" action="+filter.action.type+" conditions="+filter.count);
            for(int i=0;i<expected.Length;i++){
              var actual=(Condition)Marshal.PtrToStructure(IntPtr.Add(filter.conditions,i*Marshal.SizeOf(typeof(Condition))),typeof(Condition));
              if(actual.field!=expected[i].field||actual.match!=expected[i].match||actual.value.type!=expected[i].value.type)return false;
              if(!SameValue(actual.value,expected[i].value))return false;
            }
          }finally{if(pointer!=IntPtr.Zero)FwpmFreeMemory0(ref pointer);}
        }
        return true;
      }finally{if(engine!=IntPtr.Zero)FwpmEngineClose0(engine);if(app!=IntPtr.Zero)FwpmFreeMemory0(ref app);LocalFree(sid);}
    }
    // Caller must first remove this package's loopback exemption and stop its
    // native processes. Only exact, verified Bridge-owned filters are removed.
    public static void Remove(string packageSid,ushort proxyPort,string proxyExecutable){
      if(!Verify(packageSid,proxyPort,proxyExecutable))throw new InvalidOperationException("Refusing to remove an unexpected network policy");
      IntPtr engine=IntPtr.Zero;bool transaction=false;
      try{
        Check(FwpmEngineOpen0(null,10,IntPtr.Zero,IntPtr.Zero,out engine));Check(FwpmTransactionBegin0(engine,0));transaction=true;
        for(int index=0;index<8;index++){Guid key=Key(index);Check(FwpmFilterDeleteByKey0(engine,ref key));}
        Guid sub=Sub;Check(FwpmSubLayerDeleteByKey0(engine,ref sub));
        Check(FwpmTransactionCommit0(engine));transaction=false;
      }finally{if(transaction)FwpmTransactionAbort0(engine);if(engine!=IntPtr.Zero)FwpmEngineClose0(engine);}
    }
  }
}
