using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
namespace Bridge.Native {
 public static class PathQueryAccess {
  public static readonly string[] Targets={@"\GLOBAL??",@"\GLOBAL??\C:",@"\GLOBAL??\E:",@"\GLOBAL??\MountPointManager",@"\\.\MountPointManager"};
  const string Package="S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647";
  [StructLayout(LayoutKind.Sequential)] struct UnicodeString {public ushort length,maximum;public IntPtr buffer;}
  [StructLayout(LayoutKind.Sequential)] struct Attributes {public int length;public IntPtr root,name;public uint flags;public IntPtr security,qos;}
  [DllImport("ntdll.dll")] static extern int NtOpenDirectoryObject(out IntPtr h,uint access,ref Attributes attributes);
  [DllImport("ntdll.dll")] static extern int NtOpenSymbolicLinkObject(out IntPtr h,uint access,ref Attributes attributes);
  [DllImport("ntdll.dll")] static extern int NtQuerySecurityObject(IntPtr h,uint information,byte[] buffer,uint size,out uint needed);
  [DllImport("ntdll.dll")] static extern int NtSetSecurityObject(IntPtr h,uint information,byte[] buffer);
  [DllImport("ntdll.dll")] static extern int NtClose(IntPtr h);
  [DllImport("ntdll.dll")] static extern uint RtlNtStatusToDosError(int status);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string path,uint access,uint sharing,IntPtr security,uint disposition,uint flags,IntPtr template);
  static void Check(int status){if(status<0)throw new Win32Exception((int)RtlNtStatusToDosError(status));}
  static int Mask(int index){return index==0?0x20003:index==4?0x120089:0x20001;}
  static IntPtr Open(int index,bool write){
   if(index<0||index>=Targets.Length)throw new ArgumentOutOfRangeException("index");
   uint access=write?0x60000u:0x20000u;
   if(index==4){var handle=CreateFile(Targets[index],access,7,IntPtr.Zero,3,0,IntPtr.Zero);if(handle==new IntPtr(-1))throw new Win32Exception(Marshal.GetLastWin32Error());return handle;}
   IntPtr text=Marshal.StringToHGlobalUni(Targets[index]),name=IntPtr.Zero;
   try {var unicode=new UnicodeString{length=(ushort)(Targets[index].Length*2),maximum=(ushort)((Targets[index].Length+1)*2),buffer=text};
    name=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UnicodeString)));Marshal.StructureToPtr(unicode,name,false);
    var attrs=new Attributes{length=Marshal.SizeOf(typeof(Attributes)),name=name,flags=0x40};IntPtr handle;
    Check(index==0?NtOpenDirectoryObject(out handle,access,ref attrs):NtOpenSymbolicLinkObject(out handle,access,ref attrs));return handle;
   }finally{if(name!=IntPtr.Zero)Marshal.FreeHGlobal(name);Marshal.FreeHGlobal(text);}
  }
  static RawSecurityDescriptor ReadHandle(IntPtr handle){uint length;NtQuerySecurityObject(handle,7,null,0,out length);if(length==0||length>1048576)throw new InvalidOperationException("Invalid descriptor size");byte[] bytes=new byte[length];Check(NtQuerySecurityObject(handle,7,bytes,length,out length));return new RawSecurityDescriptor(bytes,0);}
  public static string Read(int index){var handle=Open(index,false);try{return ReadHandle(handle).GetSddlForm(AccessControlSections.Owner|AccessControlSections.Group|AccessControlSections.Access);}finally{NtClose(handle);}}
  public static void Grant(int index){var handle=Open(index,true);try{
   var descriptor=ReadHandle(handle);var acl=descriptor.DiscretionaryAcl;if(acl==null)throw new InvalidOperationException("Null DACL rejected");
   var sid=new SecurityIdentifier(Package);int mask=Mask(index),insert=acl.Count;
   for(int i=0;i<acl.Count;i++){var ace=acl[i] as CommonAce;
    if(ace!=null&&ace.SecurityIdentifier.Equals(sid)&&ace.AceQualifier==AceQualifier.AccessAllowed&&ace.AceFlags==AceFlags.None&&(ace.AccessMask&mask)==mask)return;
    if((acl[i].AceFlags&AceFlags.Inherited)!=0&&insert==acl.Count)insert=i;
   }
   acl.InsertAce(insert,new CommonAce(AceFlags.None,AceQualifier.AccessAllowed,mask,sid,false,null));
   byte[] bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);Check(NtSetSecurityObject(handle,4,bytes));
  }finally{NtClose(handle);}}
 }
}
