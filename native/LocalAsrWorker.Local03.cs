// Generated ABI structs from pinned sherpa-onnx v1.13.8 official C API header.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Diagnostics;
using System.Threading;
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxFeatureConfig {public int sample_rate; public int feature_dim;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineTransducerModelConfig {public IntPtr encoder; public IntPtr decoder; public IntPtr joiner;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineParaformerModelConfig {public IntPtr model;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineNemoEncDecCtcModelConfig {public IntPtr model;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineWhisperModelConfig {public IntPtr encoder; public IntPtr decoder; public IntPtr language; public IntPtr task; public int tail_paddings; public int enable_token_timestamps; public int enable_segment_timestamps;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineTdnnModelConfig {public IntPtr model;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineSenseVoiceModelConfig {public IntPtr model; public IntPtr language; public int use_itn;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineMoonshineModelConfig {public IntPtr preprocessor; public IntPtr encoder; public IntPtr uncached_decoder; public IntPtr cached_decoder; public IntPtr merged_decoder;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineFireRedAsrModelConfig {public IntPtr encoder; public IntPtr decoder;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineDolphinModelConfig {public IntPtr model;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineZipformerCtcModelConfig {public IntPtr model;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineCanaryModelConfig {public IntPtr encoder; public IntPtr decoder; public IntPtr src_lang; public IntPtr tgt_lang; public int use_pnc;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineWenetCtcModelConfig {public IntPtr model;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineOmnilingualAsrCtcModelConfig {public IntPtr model;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineMedAsrCtcModelConfig {public IntPtr model;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineFunASRNanoModelConfig {public IntPtr encoder_adaptor; public IntPtr llm; public IntPtr embedding; public IntPtr tokenizer; public IntPtr system_prompt; public IntPtr user_prompt; public int max_new_tokens; public float temperature; public float top_p; public int seed; public IntPtr language; public int itn; public IntPtr hotwords;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineFireRedAsrCtcModelConfig {public IntPtr model;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineQwen3ASRModelConfig {public IntPtr conv_frontend; public IntPtr encoder; public IntPtr decoder; public IntPtr tokenizer; public int max_total_len; public int max_new_tokens; public float temperature; public float top_p; public int seed; public IntPtr hotwords;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineCohereTranscribeModelConfig {public IntPtr encoder; public IntPtr decoder; public IntPtr language; public int use_punct; public int use_itn;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineModelConfig {public SherpaOnnxOfflineTransducerModelConfig transducer; public SherpaOnnxOfflineParaformerModelConfig paraformer; public SherpaOnnxOfflineNemoEncDecCtcModelConfig nemo_ctc; public SherpaOnnxOfflineWhisperModelConfig whisper; public SherpaOnnxOfflineTdnnModelConfig tdnn; public IntPtr tokens; public int num_threads; public int debug; public IntPtr provider; public IntPtr model_type; public IntPtr modeling_unit; public IntPtr bpe_vocab; public IntPtr telespeech_ctc; public SherpaOnnxOfflineSenseVoiceModelConfig sense_voice; public SherpaOnnxOfflineMoonshineModelConfig moonshine; public SherpaOnnxOfflineFireRedAsrModelConfig fire_red_asr; public SherpaOnnxOfflineDolphinModelConfig dolphin; public SherpaOnnxOfflineZipformerCtcModelConfig zipformer_ctc; public SherpaOnnxOfflineCanaryModelConfig canary; public SherpaOnnxOfflineWenetCtcModelConfig wenet_ctc; public SherpaOnnxOfflineOmnilingualAsrCtcModelConfig omnilingual; public SherpaOnnxOfflineMedAsrCtcModelConfig medasr; public SherpaOnnxOfflineFunASRNanoModelConfig funasr_nano; public SherpaOnnxOfflineFireRedAsrCtcModelConfig fire_red_asr_ctc; public SherpaOnnxOfflineQwen3ASRModelConfig qwen3_asr; public SherpaOnnxOfflineCohereTranscribeModelConfig cohere_transcribe;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineLMConfig {public IntPtr model; public float scale;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxHomophoneReplacerConfig {public IntPtr dict_dir; public IntPtr lexicon; public IntPtr rule_fsts;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxOfflineRecognizerConfig {public SherpaOnnxFeatureConfig feat_config; public SherpaOnnxOfflineModelConfig model_config; public SherpaOnnxOfflineLMConfig lm_config; public IntPtr decoding_method; public int max_active_paths; public IntPtr hotwords_file; public float hotwords_score; public IntPtr rule_fsts; public IntPtr rule_fars; public float blank_penalty; public SherpaOnnxHomophoneReplacerConfig hr;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxSileroVadModelConfig {public IntPtr model; public float threshold; public float min_silence_duration; public float min_speech_duration; public int window_size; public float max_speech_duration;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxTenVadModelConfig {public IntPtr model; public float threshold; public float min_silence_duration; public float min_speech_duration; public int window_size; public float max_speech_duration;}
[StructLayout(LayoutKind.Sequential)] struct SherpaOnnxVadModelConfig {public SherpaOnnxSileroVadModelConfig silero_vad; public int sample_rate; public int num_threads; public IntPtr provider; public int debug; public SherpaOnnxTenVadModelConfig ten_vad;}
static class Native {
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr SherpaOnnxGetVersionStrDelegate();
public static SherpaOnnxGetVersionStrDelegate SherpaOnnxGetVersionStr;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr SherpaOnnxCreateOfflineRecognizerDelegate(ref SherpaOnnxOfflineRecognizerConfig c);
public static SherpaOnnxCreateOfflineRecognizerDelegate SherpaOnnxCreateOfflineRecognizer;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SherpaOnnxDestroyOfflineRecognizerDelegate(IntPtr r);
public static SherpaOnnxDestroyOfflineRecognizerDelegate SherpaOnnxDestroyOfflineRecognizer;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr SherpaOnnxCreateOfflineStreamDelegate(IntPtr r);
public static SherpaOnnxCreateOfflineStreamDelegate SherpaOnnxCreateOfflineStream;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SherpaOnnxDestroyOfflineStreamDelegate(IntPtr s);
public static SherpaOnnxDestroyOfflineStreamDelegate SherpaOnnxDestroyOfflineStream;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SherpaOnnxAcceptWaveformOfflineDelegate(IntPtr s,int rate,float[] samples,int n);
public static SherpaOnnxAcceptWaveformOfflineDelegate SherpaOnnxAcceptWaveformOffline;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SherpaOnnxDecodeOfflineStreamDelegate(IntPtr r,IntPtr s);
public static SherpaOnnxDecodeOfflineStreamDelegate SherpaOnnxDecodeOfflineStream;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr SherpaOnnxGetOfflineStreamResultAsJsonDelegate(IntPtr s);
public static SherpaOnnxGetOfflineStreamResultAsJsonDelegate SherpaOnnxGetOfflineStreamResultAsJson;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SherpaOnnxDestroyOfflineStreamResultJsonDelegate(IntPtr p);
public static SherpaOnnxDestroyOfflineStreamResultJsonDelegate SherpaOnnxDestroyOfflineStreamResultJson;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr SherpaOnnxCreateVoiceActivityDetectorDelegate(ref SherpaOnnxVadModelConfig c,float size);
public static SherpaOnnxCreateVoiceActivityDetectorDelegate SherpaOnnxCreateVoiceActivityDetector;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SherpaOnnxDestroyVoiceActivityDetectorDelegate(IntPtr v);
public static SherpaOnnxDestroyVoiceActivityDetectorDelegate SherpaOnnxDestroyVoiceActivityDetector;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SherpaOnnxVoiceActivityDetectorAcceptWaveformDelegate(IntPtr v,float[] samples,int n);
public static SherpaOnnxVoiceActivityDetectorAcceptWaveformDelegate SherpaOnnxVoiceActivityDetectorAcceptWaveform;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SherpaOnnxVoiceActivityDetectorResetDelegate(IntPtr v);
public static SherpaOnnxVoiceActivityDetectorResetDelegate SherpaOnnxVoiceActivityDetectorReset;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SherpaOnnxVoiceActivityDetectorFlushDelegate(IntPtr v);
public static SherpaOnnxVoiceActivityDetectorFlushDelegate SherpaOnnxVoiceActivityDetectorFlush;
[UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate int SherpaOnnxVoiceActivityDetectorEmptyDelegate(IntPtr v);
public static SherpaOnnxVoiceActivityDetectorEmptyDelegate SherpaOnnxVoiceActivityDetectorEmpty;
[DllImport("kernel32",CharSet=CharSet.Ansi,ExactSpelling=true,SetLastError=true)] static extern IntPtr GetProcAddress(IntPtr module,string name);
public static void Bind(IntPtr module){
if(module==IntPtr.Zero)throw new Exception();
IntPtr pointer;
pointer=GetProcAddress(module,"SherpaOnnxGetVersionStr");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxGetVersionStr=(SherpaOnnxGetVersionStrDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxGetVersionStrDelegate));
pointer=GetProcAddress(module,"SherpaOnnxCreateOfflineRecognizer");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxCreateOfflineRecognizer=(SherpaOnnxCreateOfflineRecognizerDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxCreateOfflineRecognizerDelegate));
pointer=GetProcAddress(module,"SherpaOnnxDestroyOfflineRecognizer");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxDestroyOfflineRecognizer=(SherpaOnnxDestroyOfflineRecognizerDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxDestroyOfflineRecognizerDelegate));
pointer=GetProcAddress(module,"SherpaOnnxCreateOfflineStream");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxCreateOfflineStream=(SherpaOnnxCreateOfflineStreamDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxCreateOfflineStreamDelegate));
pointer=GetProcAddress(module,"SherpaOnnxDestroyOfflineStream");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxDestroyOfflineStream=(SherpaOnnxDestroyOfflineStreamDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxDestroyOfflineStreamDelegate));
pointer=GetProcAddress(module,"SherpaOnnxAcceptWaveformOffline");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxAcceptWaveformOffline=(SherpaOnnxAcceptWaveformOfflineDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxAcceptWaveformOfflineDelegate));
pointer=GetProcAddress(module,"SherpaOnnxDecodeOfflineStream");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxDecodeOfflineStream=(SherpaOnnxDecodeOfflineStreamDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxDecodeOfflineStreamDelegate));
pointer=GetProcAddress(module,"SherpaOnnxGetOfflineStreamResultAsJson");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxGetOfflineStreamResultAsJson=(SherpaOnnxGetOfflineStreamResultAsJsonDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxGetOfflineStreamResultAsJsonDelegate));
pointer=GetProcAddress(module,"SherpaOnnxDestroyOfflineStreamResultJson");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxDestroyOfflineStreamResultJson=(SherpaOnnxDestroyOfflineStreamResultJsonDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxDestroyOfflineStreamResultJsonDelegate));
pointer=GetProcAddress(module,"SherpaOnnxCreateVoiceActivityDetector");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxCreateVoiceActivityDetector=(SherpaOnnxCreateVoiceActivityDetectorDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxCreateVoiceActivityDetectorDelegate));
pointer=GetProcAddress(module,"SherpaOnnxDestroyVoiceActivityDetector");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxDestroyVoiceActivityDetector=(SherpaOnnxDestroyVoiceActivityDetectorDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxDestroyVoiceActivityDetectorDelegate));
pointer=GetProcAddress(module,"SherpaOnnxVoiceActivityDetectorAcceptWaveform");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxVoiceActivityDetectorAcceptWaveform=(SherpaOnnxVoiceActivityDetectorAcceptWaveformDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxVoiceActivityDetectorAcceptWaveformDelegate));
pointer=GetProcAddress(module,"SherpaOnnxVoiceActivityDetectorReset");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxVoiceActivityDetectorReset=(SherpaOnnxVoiceActivityDetectorResetDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxVoiceActivityDetectorResetDelegate));
pointer=GetProcAddress(module,"SherpaOnnxVoiceActivityDetectorFlush");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxVoiceActivityDetectorFlush=(SherpaOnnxVoiceActivityDetectorFlushDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxVoiceActivityDetectorFlushDelegate));
pointer=GetProcAddress(module,"SherpaOnnxVoiceActivityDetectorEmpty");if(pointer==IntPtr.Zero)throw new Exception();SherpaOnnxVoiceActivityDetectorEmpty=(SherpaOnnxVoiceActivityDetectorEmptyDelegate)Marshal.GetDelegateForFunctionPointer(pointer,typeof(SherpaOnnxVoiceActivityDetectorEmptyDelegate));
}
}

static class Worker {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=16};
 static readonly List<IntPtr> Strings=new List<IntPtr>(); static IntPtr R,V; static int Threads;
 [DllImport("kernel32",SetLastError=true)] static extern bool SetDefaultDllDirectories(uint flags);
 [DllImport("kernel32",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr LoadLibraryEx(string path,IntPtr file,uint flags);
 static IntPtr Library;
 static void RegularPath(string path,bool directory){
  path=Path.GetFullPath(path);for(string at=path;!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at)){if((File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)throw new Exception();}
  if(directory?!Directory.Exists(path):!File.Exists(path))throw new Exception();
 }
 static IntPtr S(string s){byte[] b=Encoding.UTF8.GetBytes(s+"\0");IntPtr p=Marshal.AllocHGlobal(b.Length);Marshal.Copy(b,0,p,b.Length);Strings.Add(p);return p;}
 static string Utf8(IntPtr p){if(p==IntPtr.Zero)throw new Exception();int n=0;while(n<65536&&Marshal.ReadByte(p,n)!=0)n++;if(n==65536)throw new Exception();byte[] b=new byte[n];Marshal.Copy(p,b,0,n);return new UTF8Encoding(false,true).GetString(b);}
 static void Send(object o){Console.WriteLine(Json.Serialize(o));Console.Out.Flush();}
 static string Line(Stream input){var bytes=new List<byte>();for(;;){int b=input.ReadByte();if(b<0){if(bytes.Count!=0)throw new Exception();return null;}if(b==10)return Encoding.ASCII.GetString(bytes.ToArray());if(b<32||b>126||bytes.Count>=1024)throw new Exception();bytes.Add((byte)b);}}
 static int Number(Dictionary<string,object> h,string k){object o;if(!h.TryGetValue(k,out o)||!(o is int))throw new Exception();return (int)o;}
 static void Load(string root){
  if(IntPtr.Size!=8||Marshal.SizeOf(typeof(SherpaOnnxOfflineRecognizerConfig))!=608||Marshal.SizeOf(typeof(SherpaOnnxVadModelConfig))!=88)throw new Exception();
  RegularPath(AppDomain.CurrentDomain.BaseDirectory,true);RegularPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"local-asr-worker-local03.exe"),false);RegularPath(root,true);
  string bin=Path.Combine(root,"runtime","bin");RegularPath(bin,true);
  foreach(string file in Directory.GetFiles(bin,"*.dll"))RegularPath(file,false);
  RegularPath(Path.Combine(root,"models","sensevoice","tokens.txt"),false);RegularPath(Path.Combine(root,"models","sensevoice","model.int8.onnx"),false);RegularPath(Path.Combine(root,"models","silero_vad.onnx"),false);
  string dll=Path.Combine(bin,"sherpa-onnx-c-api.dll");RegularPath(dll,false);
  if(!SetDefaultDllDirectories(0x800))throw new Exception();
  Library=LoadLibraryEx(dll,IntPtr.Zero,0x900);if(Library==IntPtr.Zero)throw new Exception();Native.Bind(Library);if(Utf8(Native.SherpaOnnxGetVersionStr())!="1.13.8")throw new Exception();
  var c=new SherpaOnnxOfflineRecognizerConfig();c.feat_config.sample_rate=16000;c.feat_config.feature_dim=80;
  c.model_config.tokens=S(Path.Combine(root,"models","sensevoice","tokens.txt"));c.model_config.num_threads=Threads;c.model_config.provider=S("cpu");
  c.model_config.sense_voice.model=S(Path.Combine(root,"models","sensevoice","model.int8.onnx"));c.model_config.sense_voice.language=S("auto");c.model_config.sense_voice.use_itn=1;
  c.decoding_method=S("greedy_search");c.max_active_paths=4;c.hotwords_score=1.5f;R=Native.SherpaOnnxCreateOfflineRecognizer(ref c);if(R==IntPtr.Zero)throw new Exception();
  var v=new SherpaOnnxVadModelConfig();v.silero_vad.model=S(Path.Combine(root,"models","silero_vad.onnx"));v.silero_vad.threshold=.5f;v.silero_vad.window_size=512;v.silero_vad.min_speech_duration=.25f;v.silero_vad.min_silence_duration=.5f;v.silero_vad.max_speech_duration=60;v.sample_rate=16000;v.num_threads=1;v.provider=S("cpu");
  V=Native.SherpaOnnxCreateVoiceActivityDetector(ref v,61);if(V==IntPtr.Zero)throw new Exception();
 }
 static bool Gate(float[] samples){Native.SherpaOnnxVoiceActivityDetectorReset(V);float[] block=new float[512];for(int i=0;i<samples.Length;i+=512){Array.Clear(block,0,512);Array.Copy(samples,i,block,0,Math.Min(512,samples.Length-i));Native.SherpaOnnxVoiceActivityDetectorAcceptWaveform(V,block,512);}Native.SherpaOnnxVoiceActivityDetectorFlush(V);return Native.SherpaOnnxVoiceActivityDetectorEmpty(V)==0;}
 static string Decode(float[] samples){IntPtr stream=Native.SherpaOnnxCreateOfflineStream(R);if(stream==IntPtr.Zero)throw new Exception();try{Native.SherpaOnnxAcceptWaveformOffline(stream,16000,samples,samples.Length);Native.SherpaOnnxDecodeOfflineStream(R,stream);IntPtr p=Native.SherpaOnnxGetOfflineStreamResultAsJson(stream);try{var result=Json.Deserialize<Dictionary<string,object>>(Utf8(p));object text;if(!result.TryGetValue("text",out text)||!(text is string)||((string)text).Length>20000)throw new Exception();return ((string)text).Trim();}finally{if(p!=IntPtr.Zero)Native.SherpaOnnxDestroyOfflineStreamResultJson(p);}}finally{Native.SherpaOnnxDestroyOfflineStream(stream);}}
 static int Main(string[] args){
  Console.OutputEncoding=new UTF8Encoding(false);var input=Console.OpenStandardInput();
  using(var watchdog=new Timer(delegate(object _){try{var p=Process.GetCurrentProcess();p.Refresh();if(p.PrivateMemorySize64>805306368)Environment.Exit(74);}catch{Environment.Exit(74);}},null,250,250)){
   try{
    if(args.Length!=2||args[0]!="--threads"||!(args[1]=="1"||args[1]=="2"||args[1]=="4"))throw new Exception();Threads=Int32.Parse(args[1]);
     string root=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,@"..\..\local-asr-evaluation"));
    var clock=Stopwatch.StartNew();Load(root);Send(new{type="ready",version=Utf8(Native.SherpaOnnxGetVersionStr()),loadMs=clock.Elapsed.TotalMilliseconds,threads=Threads});
    string line;while((line=Line(input))!=null){
     var h=Json.Deserialize<Dictionary<string,object>>(line);
     if(h.Count!=6||!h.ContainsKey("type")||!h.ContainsKey("format")||!Equals(h["type"],"transcribe")||!Equals(h["format"],"pcm_s16le")||Number(h,"sampleRate")!=16000||Number(h,"channels")!=1)throw new Exception();
     int id=Number(h,"id"),n=Number(h,"byteLength");if(id<1||n<320||n>1920000||(n&1)!=0)throw new Exception();
     byte[] pcm=new byte[n];int offset=0;while(offset<n){int got=input.Read(pcm,offset,n-offset);if(got==0)throw new Exception();offset+=got;}
     float[] samples=new float[n/2];for(int i=0;i<samples.Length;i++)samples[i]=(short)(pcm[2*i]|pcm[2*i+1]<<8)/32768f;Array.Clear(pcm,0,pcm.Length);
     clock.Restart();bool speech=Gate(samples);double vadMs=clock.Elapsed.TotalMilliseconds;if(speech)Send(new{type="working",id=id,phase="decode"});var decodeClock=Stopwatch.StartNew();string text=speech?Decode(samples):"";double asrMs=speech?decodeClock.Elapsed.TotalMilliseconds:0;Array.Clear(samples,0,samples.Length);
     var process=Process.GetCurrentProcess();process.Refresh();
     Send(new{type="result",id=id,speech=speech,text=text,frames=n/2,elapsedMs=clock.Elapsed.TotalMilliseconds,vadMs=vadMs,asrMs=asrMs,threads=Threads,privateBytes=process.PrivateMemorySize64,peakWorkingSetBytes=process.PeakWorkingSet64});
    }
    return 0;
   }catch{Send(new{type="error",code="worker"});return 70;}
   finally{if(V!=IntPtr.Zero)Native.SherpaOnnxDestroyVoiceActivityDetector(V);if(R!=IntPtr.Zero)Native.SherpaOnnxDestroyOfflineRecognizer(R);foreach(var p in Strings)Marshal.FreeHGlobal(p);}
  }
 }
}
