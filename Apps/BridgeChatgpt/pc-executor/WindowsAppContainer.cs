using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Bridge.Native {
  // Default-deny package token, without network capabilities. Every descendant
  // inherits the token restriction and the enclosing coordinator's Job Object.
  public sealed class ContainerProcess : IDisposable {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct StartupInfo {
      public int cb; public string reserved,desktop,title;
      public uint x,y,xSize,ySize,xChars,yChars,fill,flags;
      public short show,reserved2; public IntPtr reservedPtr,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)] struct StartupEx { public StartupInfo startup; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
    [StructLayout(LayoutKind.Sequential)] struct Capabilities { public IntPtr sid,capabilities; public uint count,reserved; }
    [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr caps,uint count,out IntPtr sid);
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
    [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("advapi32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool ConvertSidToStringSid(IntPtr sid,out IntPtr text);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr ptr);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr CreateFile(string name,uint access,uint sharing,ref SecurityAttributes attributes,uint disposition,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttrs,IntPtr threadAttrs,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupEx startup,out ProcessInfo process);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
    private IntPtr process;
    public uint ProcessId {get;private set;}
    static void Check(bool value) {if(!value)throw new Win32Exception(Marshal.GetLastWin32Error());}
    static void HResult(int value) {if(value<0)Marshal.ThrowExceptionForHR(value);}
    static void ProfileName(string name) {if(!System.Text.RegularExpressions.Regex.IsMatch(name,"^BridgeNative[.][A-Za-z0-9.-]{1,80}$"))throw new ArgumentException("Invalid Bridge container name");}
    public static string Sid(string name) {
      ProfileName(name);IntPtr sid=IntPtr.Zero,text=IntPtr.Zero;
      try {HResult(DeriveAppContainerSidFromAppContainerName(name,out sid));Check(ConvertSidToStringSid(sid,out text));return Marshal.PtrToStringUni(text);}
      finally {if(sid!=IntPtr.Zero)FreeSid(sid);if(text!=IntPtr.Zero)LocalFree(text);}
    }
    static string Quote(string text) {
      return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(text,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\"";
    }
    public static ContainerProcess Start(string name,string executable,string[] arguments,string cwd,string input,string output,string error) {
      ProfileName(name);
      foreach(string file in new[]{executable,cwd,input,output,error})if(!System.IO.Path.IsPathRooted(file))throw new ArgumentException("Absolute paths required");
      IntPtr sid=IntPtr.Zero,attributes=IntPtr.Zero,capPtr=IntPtr.Zero;
      IntPtr stdin=IntPtr.Zero,stdout=IntPtr.Zero,stderr=IntPtr.Zero;
      ProcessInfo pi=new ProcessInfo();bool initialized=false;
      try {
        int created=CreateAppContainerProfile(name,name,"Bridge isolated native execution",IntPtr.Zero,0,out sid);
        if(created==unchecked((int)0x800700B7))HResult(DeriveAppContainerSidFromAppContainerName(name,out sid));else HResult(created);
        var caps=new Capabilities();caps.sid=sid;
        capPtr=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Capabilities)));Marshal.StructureToPtr(caps,capPtr,false);
        IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
        attributes=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(attributes,1,0,ref size));initialized=true;
        Check(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20009),capPtr,new IntPtr(Marshal.SizeOf(typeof(Capabilities))),IntPtr.Zero,IntPtr.Zero));
        var sa=new SecurityAttributes();sa.length=Marshal.SizeOf(typeof(SecurityAttributes));sa.inherit=true;
        stdin=CreateFile(input,0x80000000,1,ref sa,3,0x80,IntPtr.Zero);Check(stdin!=new IntPtr(-1));
        stdout=CreateFile(output,0x40000000,1,ref sa,2,0x80,IntPtr.Zero);Check(stdout!=new IntPtr(-1));
        stderr=CreateFile(error,0x40000000,1,ref sa,2,0x80,IntPtr.Zero);Check(stderr!=new IntPtr(-1));
        var startup=new StartupEx();startup.startup.cb=Marshal.SizeOf(typeof(StartupEx));startup.attributes=attributes;
        startup.startup.flags=0x100;startup.startup.input=stdin;startup.startup.output=stdout;startup.startup.error=stderr;
        var command=new StringBuilder(Quote(executable));foreach(string arg in arguments)command.Append(" ").Append(Quote(arg));
        Check(CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x08080000,IntPtr.Zero,cwd,ref startup,out pi));
        return new ContainerProcess{process=pi.process,ProcessId=pi.pid};
      } finally {
        if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread);
        foreach(IntPtr handle in new[]{stdin,stdout,stderr})if(handle!=IntPtr.Zero&&handle!=new IntPtr(-1))CloseHandle(handle);
        if(initialized)DeleteProcThreadAttributeList(attributes);if(attributes!=IntPtr.Zero)Marshal.FreeHGlobal(attributes);
        if(capPtr!=IntPtr.Zero)Marshal.FreeHGlobal(capPtr);if(sid!=IntPtr.Zero)FreeSid(sid);
      }
    }
    public bool Wait(int timeout) {if(timeout<0||timeout>600000)throw new ArgumentOutOfRangeException("timeout");uint result=WaitForSingleObject(process,(uint)timeout);if(result==0xFFFFFFFF)throw new Win32Exception(Marshal.GetLastWin32Error());return result==0;}
    public uint ExitCode {get {uint code;Check(GetExitCodeProcess(process,out code));return code;}}
    public void Dispose(){if(process!=IntPtr.Zero){CloseHandle(process);process=IntPtr.Zero;}}
  }
}
