// Copyright (c) 2026 chenjinxian1. MIT. No target text or clipboard data is read.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using System.Windows.Automation.Text;
using System.Windows.Forms;

internal static class WindowsDelivery {
 const int MaxText=100000, MaxLine=512000; const long LeaseTicks=30L*60L*10000000L;
 const uint ForegroundEvent=3, FocusEvent=0x8005, ValueEvent=0x800e, SelectionEvent=0x8014;
 const uint TokenQuery=8, GmemMoveable=2, UnicodeText=13, InputKeyboard=1, KeyUp=2;
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=MaxLine,RecursionLimit=12};
 static readonly Stopwatch Clock=Stopwatch.StartNew();
 static int OwnerPid; static Control Dispatcher; static Lease Current; static WinEventCallback Callback;
 static IntPtr ForegroundHook,FocusHook,ValueHook,SelectionHook;
 sealed class Lease {
  public string Token,Invalid;public bool Consumed;public IntPtr Window,Focus,Caret;public uint Thread;public int Pid;public long ProcessStart,Created;
  public RECT CaretRect;public AutomationElement Element;public int[] RuntimeId;public TextPatternRange Selection;public uint ClipboardSequence;
 }
 [StructLayout(LayoutKind.Sequential)] struct RECT{public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] struct GUIINFO{public int Size;public uint Flags;public IntPtr Active,Focus,Capture,MenuOwner,MoveSize,Caret;public RECT CaretRect;}
 [StructLayout(LayoutKind.Sequential)] struct KEYINPUT{public ushort Key,Scan;public uint Flags,Time;public UIntPtr Extra;}
 [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT{public int X,Y;public uint Data,Flags,Time;public UIntPtr Extra;}
 [StructLayout(LayoutKind.Explicit)] struct INPUTDATA{[FieldOffset(0)]public KEYINPUT Keyboard;[FieldOffset(0)]public MOUSEINPUT Mouse;}
 [StructLayout(LayoutKind.Sequential)] struct INPUT{public uint Type;public INPUTDATA Data;}
 [StructLayout(LayoutKind.Sequential)] struct SIDATTR{public IntPtr Sid;public uint Attributes;}
 delegate void WinEventCallback(IntPtr hook,uint evt,IntPtr window,int obj,int child,uint thread,uint time);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,out int pid);
 [DllImport("user32.dll")]static extern bool IsWindow(IntPtr window);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll")]static extern bool IsWindowEnabled(IntPtr window);
 [DllImport("user32.dll")]static extern bool GetGUIThreadInfo(uint thread,ref GUIINFO info);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")]static extern uint SendInput(uint count,INPUT[] input,int size);
 [DllImport("user32.dll")]static extern IntPtr SetWinEventHook(uint first,uint last,IntPtr module,WinEventCallback callback,uint pid,uint thread,uint flags);
 [DllImport("user32.dll")]static extern bool UnhookWinEvent(IntPtr hook);
 [DllImport("user32.dll")]static extern uint GetClipboardSequenceNumber();
 [DllImport("user32.dll")]static extern bool OpenClipboard(IntPtr owner);
 [DllImport("user32.dll")]static extern bool EmptyClipboard();
 [DllImport("user32.dll")]static extern bool CloseClipboard();
 [DllImport("user32.dll")]static extern IntPtr SetClipboardData(uint format,IntPtr data);
 [DllImport("kernel32.dll")]static extern IntPtr GlobalAlloc(uint flags,UIntPtr bytes);
 [DllImport("kernel32.dll")]static extern IntPtr GlobalLock(IntPtr data);
 [DllImport("kernel32.dll")]static extern bool GlobalUnlock(IntPtr data);
 [DllImport("kernel32.dll")]static extern IntPtr GlobalFree(IntPtr data);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int info,IntPtr buffer,int length,out int needed);
 [DllImport("advapi32.dll")]static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")]static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);

 static int WindowPid(IntPtr window){int pid;GetWindowThreadProcessId(window,out pid);return pid;}
 static GUIINFO Gui(uint thread){var info=new GUIINFO{Size=Marshal.SizeOf(typeof(GUIINFO))};if(!GetGUIThreadInfo(thread,ref info))throw new InvalidOperationException();return info;}
 static bool Same(int[] a,int[] b){if(a==null||b==null||a.Length!=b.Length||a.Length==0)return false;for(int i=0;i<a.Length;i++)if(a[i]!=b[i])return false;return true;}
 static bool Same(RECT a,RECT b){return a.Left==b.Left&&a.Right==b.Right&&a.Top==b.Top&&a.Bottom==b.Bottom;}
 static bool ValidText(string text){return text!=null&&text.Length>0&&text.Length<=MaxText&&text.IndexOf('\0')<0&&!String.IsNullOrWhiteSpace(text);}
 static bool ValidToken(string token){Guid parsed;return token!=null&&token.Length==36&&Guid.TryParseExact(token,"D",out parsed);}
 static string ForegroundChange(string previous,IntPtr expected,IntPtr actual,int actualPid,int ownPid){return previous??(actual==expected||actualPid==ownPid?null:"focus");}
 static bool CompleteBatch(uint sent){return sent==4;}
 static long ProcessStart(int pid){using(var process=Process.GetProcessById(pid))return process.StartTime.ToUniversalTime().Ticks;}
 static int Integrity(int pid){
  IntPtr token=IntPtr.Zero,buffer=IntPtr.Zero;
  try{using(var process=Process.GetProcessById(pid)){if(!OpenProcessToken(process.Handle,TokenQuery,out token))return -1;}
   int needed;GetTokenInformation(token,25,IntPtr.Zero,0,out needed);if(needed<=0||needed>65536)return -1;
   buffer=Marshal.AllocHGlobal(needed);if(!GetTokenInformation(token,25,buffer,needed,out needed))return -1;
   var sid=(SIDATTR)Marshal.PtrToStructure(buffer,typeof(SIDATTR));int count=Marshal.ReadByte(GetSidSubAuthorityCount(sid.Sid));if(count<1)return -1;return Marshal.ReadInt32(GetSidSubAuthority(sid.Sid,(uint)(count-1)));
  }catch{return -1;}finally{if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);if(token!=IntPtr.Zero)CloseHandle(token);}
 }
 static bool TerminalProcess(int pid){
  using(var process=Process.GetProcessById(pid)){
   string name=process.ProcessName.ToLowerInvariant();
   return name=="cmd"||name=="powershell"||name=="pwsh"||name=="windowsterminal"||name=="windowsterminalpreview"||name=="conhost"||name=="openconsole"||name=="putty"||name=="mintty"||name=="wezterm-gui"||name=="alacritty"||name=="hyper";
  }
 }
 static string Editable(AutomationElement element,int pid,bool requireFocused){
  if(element==null)return "unsupported";var info=element.Current;
  if(info.ProcessId!=pid||!info.IsEnabled||!info.IsKeyboardFocusable||requireFocused&&!info.HasKeyboardFocus)return "focus";
  if(info.IsPassword)return "password";
  if(info.ControlType!=ControlType.Edit&&info.ControlType!=ControlType.Document)return "unsupported";
  AutomationElement ancestor=element;
  for(int i=0;i<8&&ancestor!=null;i++){
   // Inspect identifiers and class only, never names, accessible values or document text.
   string identity=(ancestor.Current.ClassName+" "+ancestor.Current.AutomationId).ToLowerInvariant();
   if(identity.Contains("terminal")||identity.Contains("console")||identity.Contains("xterm"))return "terminal";
   ancestor=TreeWalker.ControlViewWalker.GetParent(ancestor);
  }
  object pattern;
  if(element.TryGetCurrentPattern(ValuePattern.Pattern,out pattern))return ((ValuePattern)pattern).Current.IsReadOnly?"readonly":null;
  if(element.TryGetCurrentPattern(TextPattern.Pattern,out pattern)){
   object attribute=((TextPattern)pattern).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute);
   return attribute is bool&&!((bool)attribute)?null:"readonly";
  }
  return "unsupported";
 }
 static TextPatternRange Selection(AutomationElement element){object pattern;if(!element.TryGetCurrentPattern(TextPattern.Pattern,out pattern))return null;var ranges=((TextPattern)pattern).GetSelection();return ranges.Length==1?ranges[0].Clone():null;}
 static bool SelectionSame(Lease lease){
  if(lease.Selection!=null){var current=Selection(lease.Element);return current!=null&&lease.Selection.CompareEndpoints(TextPatternRangeEndpoint.Start,current,TextPatternRangeEndpoint.Start)==0&&lease.Selection.CompareEndpoints(TextPatternRangeEndpoint.End,current,TextPatternRangeEndpoint.End)==0;}
  var gui=Gui(lease.Thread);return gui.Focus==lease.Focus&&gui.Caret!=IntPtr.Zero&&gui.Caret==lease.Caret&&Same(gui.CaretRect,lease.CaretRect);
 }
 static string Basic(Lease lease){
  if(lease==null)return "missing";if(lease.Invalid!=null)return lease.Invalid;
  if(Clock.Elapsed.Ticks-lease.Created>=LeaseTicks)return "expired";
  if(!IsWindow(lease.Window)||!IsWindowVisible(lease.Window)||!IsWindowEnabled(lease.Window))return "missing";
  int pid;uint thread=GetWindowThreadProcessId(lease.Window,out pid);if(pid!=lease.Pid||thread!=lease.Thread||ProcessStart(pid)!=lease.ProcessStart)return "missing";
  int integrity=Integrity(pid);if(integrity<0||integrity>0x2000||Integrity(Process.GetCurrentProcess().Id)!=0x2000)return "integrity";
  if(TerminalProcess(pid))return "terminal";
  if(!Same(lease.RuntimeId,lease.Element.GetRuntimeId()))return "focus";
  var editable=Editable(lease.Element,lease.Pid,false);if(editable!=null)return editable;
  return SelectionSame(lease)?null:"caret";
 }
 static string Guard(Lease lease,bool restore){
  string basic=Basic(lease);if(basic!=null)return basic;IntPtr foreground=GetForegroundWindow();
  if(foreground!=lease.Window){
   if(!restore||WindowPid(foreground)!=OwnerPid)return "focus";
   // No synthetic Alt, AttachThreadInput or foreground-lock bypass. Denial is a safe fallback.
   if(!SetForegroundWindow(lease.Window))return "focus";
   lease.Element.SetFocus();
  }
  if(GetForegroundWindow()!=lease.Window||!Same(lease.RuntimeId,AutomationElement.FocusedElement.GetRuntimeId()))return "focus";
  return Editable(lease.Element,lease.Pid,true)??(SelectionSame(lease)?null:"caret");
 }
 static void Changed(IntPtr hook,uint evt,IntPtr window,int obj,int child,uint thread,uint time){
  var lease=Current;if(lease==null||lease.Invalid!=null||window==IntPtr.Zero)return;
  try{
   int pid=WindowPid(window);
   if(evt==ForegroundEvent){lease.Invalid=ForegroundChange(lease.Invalid,lease.Window,window,pid,OwnerPid);return;}
   if(pid==OwnerPid)return;
   if(evt==FocusEvent){var focused=AutomationElement.FocusedElement;if(focused==null||!Same(lease.RuntimeId,focused.GetRuntimeId()))lease.Invalid="focus";}
   else if(pid==lease.Pid)lease.Invalid=evt==SelectionEvent?"caret":"focus";
  }catch{lease.Invalid="focus";}
 }
 static Dictionary<string,object> Capture(){
  Current=null;
  try{
   IntPtr window=GetForegroundWindow();int pid;uint thread=GetWindowThreadProcessId(window,out pid);
   if(window==IntPtr.Zero||pid<=0||pid==OwnerPid||pid==Process.GetCurrentProcess().Id)return FailureCapture("own");
   int integrity=Integrity(pid);if(integrity<0||integrity>0x2000||Integrity(Process.GetCurrentProcess().Id)!=0x2000)return FailureCapture("integrity");
   if(TerminalProcess(pid))return FailureCapture("terminal");
   var element=AutomationElement.FocusedElement;string error=Editable(element,pid,true);if(error!=null)return FailureCapture(error);
   var gui=Gui(thread);var selection=Selection(element);if(selection==null&&gui.Caret==IntPtr.Zero)return FailureCapture("caret");
   var lease=new Lease{Token=Guid.NewGuid().ToString("D"),Window=window,Pid=pid,Thread=thread,ProcessStart=ProcessStart(pid),Created=Clock.Elapsed.Ticks,Element=element,RuntimeId=element.GetRuntimeId(),Selection=selection,Focus=gui.Focus,Caret=gui.Caret,CaretRect=gui.CaretRect,ClipboardSequence=GetClipboardSequenceNumber()};
   error=Guard(lease,false);if(error!=null)return FailureCapture(error);Current=lease;
   return new Dictionary<string,object>{{"available",true},{"token",lease.Token}};
  }catch{return FailureCapture("unsupported");}
 }
 static Dictionary<string,object> FailureCapture(string reason){return new Dictionary<string,object>{{"available",false},{"reason",reason}};}
 static Dictionary<string,object> PasteResult(string status,string reason,bool changed){return new Dictionary<string,object>{{"status",status},{"reason",reason},{"clipboardChanged",changed}};}
 static bool KeysReleased(){foreach(int key in new[]{0x10,0x11,0x12,0x5b,0x5c,0x56})if((GetAsyncKeyState(key)&0x8000)!=0)return false;return true;}
 static INPUT Key(ushort key,bool up){return new INPUT{Type=InputKeyboard,Data=new INPUTDATA{Keyboard=new KEYINPUT{Key=key,Flags=up?KeyUp:0}}};}
 static bool WriteClipboard(string text,Lease lease,out uint sequence,out bool changed){
  sequence=0;changed=false;IntPtr data=GlobalAlloc(GmemMoveable,(UIntPtr)((text.Length+1)*2));if(data==IntPtr.Zero)return false;bool opened=false,transferred=false;
  try{
   IntPtr memory=GlobalLock(data);if(memory==IntPtr.Zero)return false;
   try{char[] chars=(text+"\0").ToCharArray();Marshal.Copy(chars,0,memory,chars.Length);Array.Clear(chars,0,chars.Length);}finally{GlobalUnlock(data);}
   if(!OpenClipboard(Dispatcher.Handle))return false;opened=true;
   // Respect a user's clipboard update during recording without inspecting its contents.
   if(GetClipboardSequenceNumber()!=lease.ClipboardSequence)return false;
   if(!EmptyClipboard())return false;changed=true;
   if(SetClipboardData(UnicodeText,data)==IntPtr.Zero)return false;transferred=true;
  }finally{if(opened)CloseClipboard();if(!transferred)GlobalFree(data);}
  sequence=GetClipboardSequenceNumber();return sequence!=0;
 }
 static Dictionary<string,object> Paste(string token,string text,bool restore){
  var lease=Current;if(lease==null||lease.Token!=token||lease.Consumed)return PasteResult("blocked","missing",false);
  // Consume before any action, even if a guard fails. A paste is never retried automatically.
  lease.Consumed=true;bool changed=false;uint sequence=0;
  try{
   string error=Basic(lease);if(error!=null)return PasteResult("blocked",error,false);
   if(!KeysReleased())return PasteResult("blocked","keys",false);
   if(GetClipboardSequenceNumber()!=lease.ClipboardSequence)return PasteResult("blocked","clipboard",false);
   error=Guard(lease,restore);if(error!=null)return PasteResult("blocked",error,false);
   if(!WriteClipboard(text,lease,out sequence,out changed))return PasteResult("failed","clipboard",changed);
   error=Guard(lease,false);if(error!=null)return PasteResult("blocked",error,changed);
   if(!KeysReleased()||GetClipboardSequenceNumber()!=sequence)return PasteResult("blocked","keys",changed);
   // Windows has no atomic focus-bound SendInput transaction. Final checks reduce that
   // unavoidable OS race; success only means the key batch was accepted, not consumed.
   if(GetForegroundWindow()!=lease.Window)return PasteResult("blocked","focus",changed);
   var keys=new[]{Key(0x11,false),Key(0x56,false),Key(0x56,true),Key(0x11,true)};
   uint sent=SendInput((uint)keys.Length,keys,Marshal.SizeOf(typeof(INPUT)));
   if(!CompleteBatch(sent)){if(sent>0){var release=new[]{Key(0x56,true),Key(0x11,true)};SendInput((uint)release.Length,release,Marshal.SizeOf(typeof(INPUT)));}return PasteResult("failed","partial",changed);}
   return PasteResult("sent","native",changed);
  }catch{return PasteResult("failed","native",changed);}finally{if(Current==lease)Current=null;}
 }
 static bool KnownKeys(Dictionary<string,object> request,params string[] allowed){foreach(var key in request.Keys)if(Array.IndexOf(allowed,key)<0)return false;return true;}
 static void Execute(string line){
  long id=0;Dictionary<string,object> response;
  try{
   var request=Json.Deserialize<Dictionary<string,object>>(line);object rawId;if(request==null||!request.TryGetValue("id",out rawId)||!(rawId is int||rawId is long))throw new InvalidOperationException();id=Convert.ToInt64(rawId);if(id<=0||id>9007199254740991L)throw new InvalidOperationException();
   object rawOp;if(!request.TryGetValue("op",out rawOp)||!(rawOp is string))throw new InvalidOperationException();string op=(string)rawOp;
   if(op=="capture"&&KnownKeys(request,"id","op"))response=Capture();
   else if(op=="discard"&&KnownKeys(request,"id","op","token")&&request.ContainsKey("token")&&request["token"] is string&&ValidToken((string)request["token"])){
    bool discarded=Current!=null&&Current.Token==(string)request["token"];if(discarded)Current=null;response=new Dictionary<string,object>{{"discarded",discarded}};
   }else if(op=="paste"&&KnownKeys(request,"id","op","token","text","restore")&&request.ContainsKey("token")&&request["token"] is string&&ValidToken((string)request["token"])&&request.ContainsKey("text")&&request["text"] is string&&ValidText((string)request["text"])&&request.ContainsKey("restore")&&request["restore"] is bool)response=Paste((string)request["token"],(string)request["text"],(bool)request["restore"]);
   else throw new InvalidOperationException();
  }catch{response=PasteResult("blocked","protocol",false);}
  response["type"]="response";response["id"]=id;Console.WriteLine(Json.Serialize(response));
 }
 static string ReadLine(){var buffer=new StringBuilder();while(true){int next=Console.In.Read();if(next<0)return buffer.Length==0?null:buffer.ToString();if(next=='\n')return buffer.ToString();if(next=='\r')continue;if(buffer.Length>=MaxLine)throw new InvalidOperationException();buffer.Append((char)next);}}
 static bool PureSelfTest(){
  string changed=ForegroundChange(null,(IntPtr)10,(IntPtr)20,2,99);changed=ForegroundChange(changed,(IntPtr)10,(IntPtr)10,1,99);
  return ValidText("hello\nworld")&&!ValidText(" ")&&!ValidText("x\0y")&&!ValidText(new String('x',100001))&&ValidToken("11111111-1111-4111-8111-111111111111")&&!ValidToken("missing")&&Same(new[]{1,2},new[]{1,2})&&!Same(new[]{1,2},new[]{1,3})&&Marshal.SizeOf(typeof(INPUT))==40&&changed=="focus"&&ForegroundChange(null,(IntPtr)10,(IntPtr)99,99,99)==null&&CompleteBatch(4)&&!CompleteBatch(3)&&!CompleteBatch(0);
 }
 [STAThread] public static int Main(string[] args){
  if(args.Length==1&&args[0]=="--self-test"){bool ok=PureSelfTest();Console.WriteLine(ok?"{\"selfTest\":\"passed\",\"nativeActions\":0}":"{\"selfTest\":\"failed\"}");return ok?0:1;}
  if(args.Length!=3||args[0]!="--broker"||args[1]!="--owner-pid"||!Int32.TryParse(args[2],out OwnerPid)||OwnerPid<=0||OwnerPid==Process.GetCurrentProcess().Id)return 2;
  try{using(var owner=Process.GetProcessById(OwnerPid))if(owner.HasExited)return 2;}catch{return 2;}
  Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);Dispatcher=new Control();IntPtr handle=Dispatcher.Handle;Callback=Changed;
  ForegroundHook=SetWinEventHook(ForegroundEvent,ForegroundEvent,IntPtr.Zero,Callback,0,0,0);
  FocusHook=SetWinEventHook(FocusEvent,FocusEvent,IntPtr.Zero,Callback,0,0,0);
  ValueHook=SetWinEventHook(ValueEvent,ValueEvent,IntPtr.Zero,Callback,0,0,0);
  SelectionHook=SetWinEventHook(SelectionEvent,SelectionEvent,IntPtr.Zero,Callback,0,0,0);
  if(ForegroundHook==IntPtr.Zero||FocusHook==IntPtr.Zero||ValueHook==IntPtr.Zero||SelectionHook==IntPtr.Zero)return 3;
  Console.WriteLine("{\"type\":\"ready\",\"version\":1}");
  var reader=new Thread(()=>{try{string line;while((line=ReadLine())!=null){string input=line;Dispatcher.Invoke((Action)(()=>Execute(input)));}}catch{}finally{try{Dispatcher.BeginInvoke((Action)(()=>Application.ExitThread()));}catch{}}});reader.IsBackground=true;reader.Start();
  try{Application.Run();}finally{Current=null;foreach(IntPtr hook in new[]{ForegroundHook,FocusHook,ValueHook,SelectionHook})if(hook!=IntPtr.Zero)UnhookWinEvent(hook);Dispatcher.Dispose();}
  return 0;
 }
}
