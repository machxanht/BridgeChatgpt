using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security;
using System.Text;

namespace Bridge.Native {
  // Lifetime boundary only. This class does not claim filesystem/network
  // isolation; those policies must be enforced before production dispatch.
  public sealed class OwnedJob : IDisposable {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct StartupInfo {
      public int cb; public string reserved, desktop, title;
      public uint x,y,xSize,ySize,xCountChars,yCountChars,fillAttribute,flags;
      public short showWindow, reserved2; public IntPtr reservedPtr,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimit {
      public long processTime,jobTime; public uint flags;
      public UIntPtr minimumWorkingSet,maximumWorkingSet; public uint activeProcessLimit;
      public UIntPtr affinity; public uint priorityClass,schedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters { public ulong readOperations,writeOperations,otherOperations,readBytes,writeBytes,otherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimit {
      public BasicLimit basic; public IoCounters io;
      public UIntPtr processMemory,jobMemory,peakProcessMemory,peakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct Accounting {
      public long user,kernel,periodUser,periodKernel;
      public uint faults,total,active,terminated;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attrs,string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,ref ExtendedLimit value,uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int info,out Accounting value,uint length,IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CreateProcessWithLogonW(string user,string domain,IntPtr password,uint logonFlags,string app,StringBuilder command,uint flags,IntPtr environment,string cwd,ref StartupInfo startup,out ProcessInfo info);
    private IntPtr job,process;
    public uint ProcessId { get; private set; }
    private OwnedJob() {}
    private static void Check(bool ok) { if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    public static OwnedJob Start(string user,string domain,SecureString password,string executable,string trustedArguments,string cwd) {
      if(!System.IO.Path.IsPathRooted(executable)||!System.IO.Path.IsPathRooted(cwd)) throw new ArgumentException("Absolute launch paths required");
      if(executable.Contains("\"")||trustedArguments.Length>850) throw new ArgumentException("Invalid trusted launcher command");
      var owned=new OwnedJob(); ProcessInfo pi=new ProcessInfo(); IntPtr plain=IntPtr.Zero;
      try {
        owned.job=CreateJobObject(IntPtr.Zero,null); Check(owned.job!=IntPtr.Zero);
        var limit=new ExtendedLimit();
        // KILL_ON_JOB_CLOSE | ACTIVE_PROCESS | JOB_MEMORY. No breakaway flags.
        limit.basic.flags=0x2000|0x8|0x200; limit.basic.activeProcessLimit=32;
        limit.jobMemory=new UIntPtr(2147483648UL);
        Check(SetInformationJobObject(owned.job,9,ref limit,(uint)Marshal.SizeOf(typeof(ExtendedLimit))));
        var startup=new StartupInfo(); startup.cb=Marshal.SizeOf(typeof(StartupInfo)); startup.flags=1; startup.showWindow=0;
        plain=Marshal.SecureStringToGlobalAllocUnicode(password);
        // Profile-derived environment avoids inheriting controller credentials.
        Check(CreateProcessWithLogonW(user,domain,plain,1,executable,new StringBuilder("\""+executable+"\" "+trustedArguments),0x4|0x08000000,IntPtr.Zero,cwd,ref startup,out pi));
        owned.process=pi.process; owned.ProcessId=pi.pid;
        // No child instruction executes before ownership is established.
        Check(AssignProcessToJobObject(owned.job,pi.process));
        Check(ResumeThread(pi.thread)!=0xFFFFFFFF);
        return owned;
      } catch {
        if(pi.process!=IntPtr.Zero) TerminateProcess(pi.process,78);
        owned.Dispose(); throw;
      } finally {
        if(plain!=IntPtr.Zero) Marshal.ZeroFreeGlobalAllocUnicode(plain);
        if(pi.thread!=IntPtr.Zero) CloseHandle(pi.thread);
      }
    }
    public bool Wait(int milliseconds) {
      if(milliseconds<0||milliseconds>600000) throw new ArgumentOutOfRangeException("milliseconds");
      uint result=WaitForSingleObject(process,(uint)milliseconds);
      if(result==0xFFFFFFFF) throw new Win32Exception(Marshal.GetLastWin32Error());
      return result==0;
    }
    public uint ExitCode { get { uint code; Check(GetExitCodeProcess(process,out code)); return code; } }
    public uint ActiveProcesses { get { Accounting value; Check(QueryInformationJobObject(job,1,out value,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero)); return value.active; } }
    public bool StopAndConfirm(int milliseconds) {
      Check(TerminateJobObject(job,137));
      var deadline=DateTime.UtcNow.AddMilliseconds(milliseconds);
      while(ActiveProcesses>0 && DateTime.UtcNow<deadline) System.Threading.Thread.Sleep(25);
      return ActiveProcesses==0;
    }
    public void Dispose() {
      if(job!=IntPtr.Zero) { CloseHandle(job);job=IntPtr.Zero; }
      if(process!=IntPtr.Zero) { CloseHandle(process);process=IntPtr.Zero; }
    }
  }
}
