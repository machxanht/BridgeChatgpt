using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;

namespace Bridge.Native {
  // Directory metadata/traversal only. No file contents, directory listing,
  // writes, or inheritable permissions are granted.
  public static class DirectoryMetadata {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateFile(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll")] static extern uint GetSecurityInfo(IntPtr handle,uint type,uint information,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
    [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetKernelObjectSecurity(IntPtr handle,uint information,byte[] descriptor);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
    const int Rights=0x1200A8;
    public static void Grant(string directory,string packageSid) {
      if(!System.IO.Path.IsPathRooted(directory)||!packageSid.StartsWith("S-1-15-2-"))throw new ArgumentException("Absolute directory and package SID required");
      if((System.IO.File.GetAttributes(directory)&System.IO.FileAttributes.ReparsePoint)!=0)throw new ArgumentException("Reparse directory rejected");
      var sid=new SecurityIdentifier(packageSid);
      // Open only security-descriptor access. MAXIMUM_ALLOWED can conflict
      // with existing volume-root handles because it also requests data access.
      IntPtr handle=CreateFile(directory,0x60000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
      if(handle==new IntPtr(-1))throw new Win32Exception(Marshal.GetLastWin32Error());
      IntPtr descriptor=IntPtr.Zero;
      try {
        IntPtr owner,group,dacl,sacl;
        uint error=GetSecurityInfo(handle,1,4,out owner,out group,out dacl,out sacl,out descriptor);
        if(error!=0)throw new Win32Exception((int)error);
        byte[] data=new byte[GetSecurityDescriptorLength(descriptor)];Marshal.Copy(descriptor,data,0,data.Length);
        var security=new RawSecurityDescriptor(data,0);
        var acl=security.DiscretionaryAcl;
        if(acl==null)throw new InvalidOperationException("Null directory DACL rejected");
        int insert=acl.Count;
        for(int i=0;i<acl.Count;i++) {
          var ace=acl[i] as CommonAce;
          if(ace!=null&&ace.SecurityIdentifier.Equals(sid)&&ace.AceQualifier==AceQualifier.AccessAllowed&&ace.AceFlags==AceFlags.None&&(ace.AccessMask&Rights)==Rights)return;
          if((acl[i].AceFlags&AceFlags.Inherited)!=0&&insert==acl.Count)insert=i;
        }
        acl.InsertAce(insert,new CommonAce(AceFlags.None,AceQualifier.AccessAllowed,Rights,sid,false,null));
        // Direct handle update avoids the tree propagation performed by
        // SetNamedSecurityInfo/SetSecurityInfo. Existing ACEs remain identical.
        byte[] bytes=new byte[security.BinaryLength];security.GetBinaryForm(bytes,0);
        if(!SetKernelObjectSecurity(handle,4,bytes))throw new Win32Exception(Marshal.GetLastWin32Error());
      } finally {
        if(descriptor!=IntPtr.Zero)LocalFree(descriptor);
        CloseHandle(handle);
      }
    }
  }
}
