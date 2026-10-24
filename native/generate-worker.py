from pathlib import Path
import re,json
R=Path(__file__).resolve().parents[1]
E=R.parent/'local-asr-evaluation'
h=(E/'runtime/include/sherpa-onnx/c-api/c-api.h').read_text()
h=re.sub(r'/\*.*?\*/|//[^\n]*','',h,flags=re.S)
defs={m.group(1):m.group(2) for m in re.finditer(r'typedef\s+struct\s+(\w+)\s*\{([^{}]*)\}\s*\1\s*;',h,re.S)}
out=[]; seen=set()
def emit(n):
 if n in seen:return
 seen.add(n);fields=[]
 for statement in defs[n].split(';'):
  statement=' '.join(statement.strip().split())
  if not statement:continue
  m=re.fullmatch(r'(.+?)([A-Za-z_]\w*)',statement); assert m,statement
  typ,name=m.group(1).strip(),m.group(2);typ=' '.join(typ.replace('*',' * ').split())
  if typ in ['const char *','char *']:typ='IntPtr'
  elif typ in defs:emit(typ)
  else:typ={'int32_t':'int','int64_t':'long','uint32_t':'uint','float':'float','double':'double','size_t':'UIntPtr'}[typ]
  fields.append('public '+typ+' '+name+';')
 out.append('[StructLayout(LayoutKind.Sequential)] struct '+n+' {'+' '.join(fields)+'}')
emit('SherpaOnnxOfflineRecognizerConfig');emit('SherpaOnnxVadModelConfig')
bindings=[
('IntPtr','SherpaOnnxGetVersionStr',''),
('IntPtr','SherpaOnnxCreateOfflineRecognizer','ref SherpaOnnxOfflineRecognizerConfig c'),
('void','SherpaOnnxDestroyOfflineRecognizer','IntPtr r'),
('IntPtr','SherpaOnnxCreateOfflineStream','IntPtr r'),
('void','SherpaOnnxDestroyOfflineStream','IntPtr s'),
('void','SherpaOnnxAcceptWaveformOffline','IntPtr s,int rate,float[] samples,int n'),
('void','SherpaOnnxDecodeOfflineStream','IntPtr r,IntPtr s'),
('IntPtr','SherpaOnnxGetOfflineStreamResultAsJson','IntPtr s'),
('void','SherpaOnnxDestroyOfflineStreamResultJson','IntPtr p'),
('IntPtr','SherpaOnnxCreateVoiceActivityDetector','ref SherpaOnnxVadModelConfig c,float size'),
('void','SherpaOnnxDestroyVoiceActivityDetector','IntPtr v'),
('void','SherpaOnnxVoiceActivityDetectorAcceptWaveform','IntPtr v,float[] samples,int n'),
('void','SherpaOnnxVoiceActivityDetectorReset','IntPtr v'),
('void','SherpaOnnxVoiceActivityDetectorFlush','IntPtr v'),
('int','SherpaOnnxVoiceActivityDetectorEmpty','IntPtr v')]
# Keep the reviewed fixed-handle binding and lifecycle code from the checked-in worker.
existing=(R/'native/LocalAsrWorker.cs').read_text(encoding='utf-8')
reviewed_suffix='static class Native {'+existing.split('static class Native {',1)[1]
source='// Generated ABI structs from pinned sherpa-onnx v1.13.8 official C API header.\nusing System;\nusing System.IO;\nusing System.Text;\nusing System.Collections.Generic;\nusing System.Runtime.InteropServices;\nusing System.Web.Script.Serialization;\nusing System.Diagnostics;\nusing System.Threading;\n'+'\n'.join(out)+'\n'+reviewed_suffix
(R/'native/LocalAsrWorker.cs').write_text(source,encoding='utf-8')
print(json.dumps({'structCount':len(out),'sourceBytes':len(source.encode())}))
