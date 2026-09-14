using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
namespace Bridge.Native {
  // A private headless terminal; never attaches to the operator's console.
  public sealed class AuthConsole : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct Coord {public short x,y;}
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,IntPtr attrs,uint size);
    [DllImport("kernel32.dll")] static extern int CreatePseudoConsole(Coord size,IntPtr input,IntPtr output,uint flags,out IntPtr console);
    [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr console);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadFile(IntPtr file,byte[] buffer,uint size,out uint read,IntPtr overlap);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteFile(IntPtr file,byte[] buffer,uint size,out uint written,IntPtr overlap);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    IntPtr input,output,console;Thread drain;FileStream capture;
    readonly object gate=new object();readonly StringBuilder transcript=new StringBuilder();string secret="";
    public IntPtr Handle {get{return console;}}
    public AuthConsole(string outputPath) {
      if(!Path.IsPathRooted(outputPath))throw new ArgumentException("Absolute capture path required");
      IntPtr read=IntPtr.Zero,write=IntPtr.Zero;
      try {
        if(!CreatePipe(out read,out input,IntPtr.Zero,0)||!CreatePipe(out output,out write,IntPtr.Zero,0))throw new Win32Exception(Marshal.GetLastWin32Error());
        int hr=CreatePseudoConsole(new Coord{x=4096,y=40},read,write,0,out console);if(hr<0)Marshal.ThrowExceptionForHR(hr);
        capture=new FileStream(outputPath,FileMode.Create,FileAccess.Write,FileShare.ReadWrite);
        drain=new Thread(Drain);drain.IsBackground=true;drain.Start();
      } catch {Dispose();throw;} finally {if(read!=IntPtr.Zero)CloseHandle(read);if(write!=IntPtr.Zero)CloseHandle(write);}
    }
    void Drain(){try{byte[] bytes=new byte[4096];char[] chars=new char[4096];var decoder=Encoding.UTF8.GetDecoder();uint count;
      while(ReadFile(output,bytes,(uint)bytes.Length,out count,IntPtr.Zero)&&count>0){lock(gate){
        transcript.Append(chars,0,decoder.GetChars(bytes,0,(int)count,chars,0));
        if(transcript.Length>1048576)throw new IOException("Authentication output limit");
        string text=transcript.ToString();
        if(secret.Length>0){text=text.Replace(secret,"[authorization code redacted]");
          // Do not persist a code split across console output chunks.
          for(int n=Math.Min(secret.Length-1,text.Length);n>0;n--)if(text.EndsWith(secret.Substring(0,n),StringComparison.Ordinal)){text=text.Substring(0,text.Length-n);break;}}
        byte[] safe=Encoding.UTF8.GetBytes(text);capture.Position=0;capture.Write(safe,0,safe.Length);capture.SetLength(safe.Length);capture.Flush();
      }}
    }catch(IOException){}finally{if(capture!=null)capture.Dispose();}}
    public void SendLine(string text) {
      if(text.Length<1||text.Length>4096||text.IndexOfAny(new[]{'\r','\n','\0'})>=0)throw new ArgumentException("Invalid input line");
      lock(gate){if(secret.Length>0)throw new InvalidOperationException("One code per authentication session");secret=text;}
      byte[] bytes=Encoding.UTF8.GetBytes(text+"\r");uint written;
      try{if(!WriteFile(input,bytes,(uint)bytes.Length,out written,IntPtr.Zero)||written!=bytes.Length)throw new Win32Exception(Marshal.GetLastWin32Error());}finally{Array.Clear(bytes,0,bytes.Length);}
    }
    public void Dispose(){if(console!=IntPtr.Zero){ClosePseudoConsole(console);console=IntPtr.Zero;}if(input!=IntPtr.Zero){CloseHandle(input);input=IntPtr.Zero;}if(drain!=null)drain.Join(2000);if(output!=IntPtr.Zero){CloseHandle(output);output=IntPtr.Zero;}lock(gate){secret="";transcript.Clear();}}
  }
}
