import { useEffect, useRef, useState } from "react";

const VISION_WASM_CDNS = [
 "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm",
 "https://unpkg.com/@mediapipe/tasks-vision@0.10.22/wasm"
];
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const JOINTS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,31],[24,26],[26,28],[28,32]];
const ANGLE_TRIPLETS = [
 {name:"Joelho esquerdo",a:23,b:25,c:27},
 {name:"Joelho direito",a:24,b:26,c:28},
 {name:"Quadril esquerdo",a:11,b:23,c:25},
 {name:"Quadril direito",a:12,b:24,c:26},
];
function angle(a,b,c){
 const v1=[a.x-b.x,a.y-b.y],v2=[c.x-b.x,c.y-b.y];
 const mag=Math.hypot(...v1)*Math.hypot(...v2);
 if(!mag)return null;
 return Math.round(Math.acos(Math.max(-1,Math.min(1,(v1[0]*(c.x-b.x)+v1[1]*(c.y-b.y))/mag)))*180/Math.PI);
}
function errorDetail(e){
 if(e?.message)return e.message;
 if(e?.type==="error"||e instanceof Event)return "O navegador reportou uma falha ao carregar um recurso externo (arquivo WASM ou modelo). Verifique a conexão e se o navegador não bloqueou o download.";
 if(typeof e==="string")return e;
 try{return JSON.stringify(e);}catch{return String(e??"erro sem detalhes");}
}
function explainCameraError(e,stage){
 const name=e?.name||"";
 const detail=errorDetail(e);
 if(name==="NotAllowedError"||name==="PermissionDeniedError") return "O navegador recusou o acesso à câmera. Como a permissão aparece como permitida, confirme que ela está liberada para este endereço exato e recarregue a página. Etapa: "+stage+".";
 if(name==="NotFoundError"||name==="DevicesNotFoundError") return "Nenhuma câmera foi encontrada neste dispositivo. Etapa: "+stage+".";
 if(name==="NotReadableError"||name==="TrackStartError") return "O Android não conseguiu abrir a câmera. Feche o app Câmera e outros aplicativos que possam estar usando-a e tente novamente. Etapa: "+stage+".";
 if(name==="OverconstrainedError"||name==="ConstraintNotSatisfiedError") return "A câmera não aceitou a configuração solicitada. Tente novamente. Etapa: "+stage+".";
 if(name==="SecurityError"||!window.isSecureContext) return "O navegador bloqueou a câmera por segurança. Abra o site HTTPS diretamente no Chrome. Etapa: "+stage+".";
 if(/fetch|network|wasm|model|gpu|delegate|mediapipe|failed to fetch/i.test(detail)) return "A câmera pode ter aberto, mas o modelo de análise não carregou. Confira a conexão e tente novamente. Etapa: "+stage+". Detalhe: "+detail;
 return "Falha na etapa "+stage+". "+detail;
}
const btn={background:"#202632",color:"#f4f6fa",border:"1px solid #3a4250",borderRadius:10,padding:"10px 14px",fontWeight:700,cursor:"pointer"};
export default function BiomechanicsCamera({onBack=()=>{}}){
 const videoRef=useRef(null),canvasRef=useRef(null),streamRef=useRef(null),landmarkerRef=useRef(null),rafRef=useRef(null),lastVideoTime=useRef(-1);
 const [cameraState,setCameraState]=useState("idle"),[error,setError]=useState(""),[angles,setAngles]=useState([]),[poseVisible,setPoseVisible]=useState(false),[mode,setMode]=useState("lateral"),[frames,setFrames]=useState(0);
 const stop=()=>{
  if(rafRef.current)cancelAnimationFrame(rafRef.current);rafRef.current=null;
  if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
  if(videoRef.current){videoRef.current.pause?.();videoRef.current.srcObject=null;}
  landmarkerRef.current?.close?.();landmarkerRef.current=null;
  setCameraState("idle");setPoseVisible(false);setAngles([]);
 };
 useEffect(()=>()=>{if(rafRef.current)cancelAnimationFrame(rafRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());landmarkerRef.current?.close?.();},[]);
 const start=async()=>{
  if(cameraState==="starting")return;
  setError("");setCameraState("starting");setPoseVisible(false);setAngles([]);
  let stream=null,landmarker=null,stage="verificação de segurança";
  try{
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia) throw new Error("Câmera indisponível: abra o site em HTTPS no Chrome.");
   stage="solicitação de acesso à câmera";
   try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
   }catch(firstError){
    if(["NotAllowedError","PermissionDeniedError","NotFoundError","NotReadableError","SecurityError"].includes(firstError?.name))throw firstError;
    stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
   }
   stage="ativação do vídeo";
   streamRef.current=stream;
   const video=videoRef.current;
   if(!video)throw new Error("A área de vídeo não está disponível. Recarregue a página.");
   video.srcObject=stream;
   await video.play();
   stage="carregamento da biblioteca de análise";
   const vision=await import("@mediapipe/tasks-vision");
   stage="download dos arquivos WASM de suporte";
   let fileset=null,lastWasmError=null;
   for(const wasmUrl of VISION_WASM_CDNS){
    try{fileset=await vision.FilesetResolver.forVisionTasks(wasmUrl);break;}
    catch(wasmError){lastWasmError=wasmError;}
   }
   if(!fileset)throw new Error("Não foi possível baixar os arquivos WASM do MediaPipe de nenhum dos servidores disponíveis. "+errorDetail(lastWasmError));
   stage="download do modelo de pose";
   const modelResponse=await fetch(POSE_MODEL,{mode:"cors",cache:"force-cache"});
   if(!modelResponse.ok)throw new Error("O servidor do modelo respondeu HTTP "+modelResponse.status+".");
   const modelAssetBuffer=new Uint8Array(await modelResponse.arrayBuffer());
   if(!modelAssetBuffer.length)throw new Error("O arquivo do modelo chegou vazio.");
   const options={baseOptions:{modelAssetBuffer,delegate:"GPU"},runningMode:"VIDEO",numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5};
   stage="inicialização do modelo de pose";
   try{landmarker=await vision.PoseLandmarker.createFromOptions(fileset,options);}
   catch(gpuError){stage="inicialização do modelo em modo compatível (CPU)";landmarker=await vision.PoseLandmarker.createFromOptions(fileset,{...options,baseOptions:{modelAssetBuffer,delegate:"CPU"}});}
   landmarkerRef.current=landmarker;
   lastVideoTime.current=-1;setCameraState("active");
   const draw=()=>{
    if(!videoRef.current||!canvasRef.current||!landmarkerRef.current){rafRef.current=null;return;}
    const v=videoRef.current,c=canvasRef.current,ctx=c.getContext("2d");
    if(v.readyState>=2&&v.currentTime!==lastVideoTime.current){
     c.width=v.videoWidth||640;c.height=v.videoHeight||480;
     const result=landmarkerRef.current.detectForVideo(v,performance.now());
     ctx.clearRect(0,0,c.width,c.height);
     const lm=result.landmarks?.[0];
     if(lm){
      setPoseVisible(true);setFrames(x=>x+1);
      ctx.lineWidth=Math.max(2,c.width/240);ctx.strokeStyle="#f59e0b";ctx.fillStyle="#22c55e";
      for(const [a,b] of JOINTS){if((lm[a]?.visibility??0)>.45&&(lm[b]?.visibility??0)>.45){ctx.beginPath();ctx.moveTo(lm[a].x*c.width,lm[a].y*c.height);ctx.lineTo(lm[b].x*c.width,lm[b].y*c.height);ctx.stroke();}}
      lm.forEach(p=>{if((p.visibility??0)>.5){ctx.beginPath();ctx.arc(p.x*c.width,p.y*c.height,Math.max(3,c.width/180),0,Math.PI*2);ctx.fill();}});
      setAngles(ANGLE_TRIPLETS.map(t=>({name:t.name,value:[lm[t.a],lm[t.b],lm[t.c]].every(p=>(p.visibility??0)>.5)?angle(lm[t.a],lm[t.b],lm[t.c]):null})));
     }else{setPoseVisible(false);setAngles([]);}
     lastVideoTime.current=v.currentTime;
    }
    rafRef.current=requestAnimationFrame(draw);
   };
   rafRef.current=requestAnimationFrame(draw);
  }catch(e){
   landmarker?.close?.();landmarkerRef.current=null;
   stream?.getTracks().forEach(t=>t.stop());streamRef.current=null;
   if(videoRef.current){videoRef.current.srcObject=null;}
   setError(explainCameraError(e,stage));setCameraState("error");
  }
 };
 return <div style={{padding:"18px 14px 90px",maxWidth:800,margin:"0 auto",color:"#f3f5f8"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:12}}><button onClick={()=>{stop();onBack();}} style={btn}>← Voltar</button><span style={{fontSize:11,color:"#f59e0b",fontWeight:800,letterSpacing:1}}>ANÁLISE DE MOVIMENTO</span></div>
  <h1 style={{fontSize:25,margin:"8px 0"}}>Câmera biomecânica</h1>
  <p style={{color:"#a9b2c1",fontSize:13,lineHeight:1.5}}>Visualização experimental de pose e ângulos articulares aproximados durante o movimento. Não é diagnóstico médico nem substitui avaliação presencial do treinador.</p>
  <div style={{background:"#211b12",border:"1px solid #6d4a17",borderRadius:12,padding:12,marginBottom:12,fontSize:12,lineHeight:1.5}}><b style={{color:"#fbbf24"}}>Privacidade e permissão</b><br/>A câmera só é solicitada quando você toca em “Ativar câmera”. O vídeo é processado no navegador e não é enviado nem gravado pelo app. A primeira execução pode baixar o modelo de pose de um servidor externo. Você pode interromper a câmera a qualquer momento.</div>
  <div style={{background:"#151922",border:"1px solid #2a303b",borderRadius:14,padding:12,marginBottom:12}}>
   <label style={{fontSize:12,color:"#a9b2c1"}}>Vista para análise<select value={mode} onChange={e=>setMode(e.target.value)} style={{display:"block",width:"100%",marginTop:5,padding:10,borderRadius:8,background:"#0c0f14",color:"#f4f6fa",border:"1px solid #353c49"}}><option value="lateral">Lateral — ciclo da passada</option><option value="frontal">Frontal — alinhamento</option><option value="posterior">Posterior — simetria</option></select></label>
   <p style={{fontSize:12,color:"#a9b2c1",lineHeight:1.5}}>{mode==="lateral"?"Posicione o celular de lado, corpo inteiro visível, em local iluminado.":mode==="frontal"?"Posicione o celular à frente, corpo inteiro visível e alinhado com a câmera.":"Posicione o celular atrás, corpo inteiro visível e alinhado com a câmera."} Faça primeiro uma gravação curta parado ou caminhando; só corra se o aparelho estiver seguro e houver espaço apropriado.</p>
   <div style={{position:"relative",width:"100%",aspectRatio:"4/3",background:"#080a0e",borderRadius:10,overflow:"hidden"}}>
    <video ref={videoRef} muted playsInline style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:cameraState==="active"?"block":"none"}}/>
    <canvas ref={canvasRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",pointerEvents:"none"}}/>
    {cameraState!=="active"&&<div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",textAlign:"center",padding:20,color:"#9ca3af"}}><div><div style={{fontSize:36}}>📷</div><div style={{fontWeight:700,marginTop:8}}>{cameraState==="starting"?"Iniciando câmera…":"Câmera desligada"}</div><div style={{fontSize:12,marginTop:5}}>{cameraState==="starting"?"Solicitando permissão e carregando a análise.":"Toque em ativar para conceder permissão"}</div></div></div>}
   </div>
   {error&&<p role="alert" style={{color:"#fb7185",fontSize:12,lineHeight:1.5}}>{error}</p>}
   <div style={{display:"flex",gap:8,marginTop:12}}>{cameraState!=="active"?<button onClick={start} disabled={cameraState==="starting"} style={{...btn,flex:1,background:"#f59e0b",color:"#111",opacity:cameraState==="starting"?.7:1}}>{cameraState==="starting"?"Iniciando câmera e modelo…":"Ativar câmera"}</button>:<button onClick={stop} style={{...btn,flex:1,background:"#7f1d1d",borderColor:"#991b1b"}}>Parar câmera</button>}</div>
  </div>
  <div style={{background:"#151922",border:"1px solid #2a303b",borderRadius:14,padding:14,marginBottom:12}}><h2 style={{fontSize:17,marginTop:0}}>Leitura em tempo real</h2>{cameraState!=="active"?<p style={{fontSize:12,color:"#a9b2c1"}}>Ative a câmera para iniciar a detecção da pose.</p>:!poseVisible?<p style={{fontSize:12,color:"#fbbf24"}}>Pose não detectada com confiança suficiente. Afaste-se um pouco, ilumine o ambiente e deixe o corpo inteiro no enquadramento.</p>:<><p style={{fontSize:12,color:"#22c55e"}}>Pose detectada • análise local ativa</p><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>{angles.map(a=><div key={a.name} style={{background:"#0c0f14",borderRadius:9,padding:10}}><div style={{fontSize:11,color:"#a9b2c1"}}>{a.name}</div><div style={{fontSize:23,fontWeight:800,color:a.value==null?"#9ca3af":"#f59e0b"}}>{a.value==null?"—":a.value+"°"}</div></div>)}</div><p style={{fontSize:11,color:"#a9b2c1"}}>Os ângulos dependem da perspectiva, oclusão e enquadramento; não interprete valores isolados como “bons” ou “ruins”.</p></>}</div>
  <div style={{background:"#151922",border:"1px solid #2a303b",borderRadius:14,padding:14,fontSize:12,lineHeight:1.6}}><b>Para uma análise útil</b><ul><li>Use apoio firme para o celular e enquadre o corpo inteiro.</li><li>Prefira roupa que permita ver a posição das articulações e boa iluminação.</li><li>Compare vídeos feitos do mesmo ângulo e distância.</li><li>Esta versão mostra esqueleto estimado e ângulos aproximados; ainda não mede com confiabilidade cadência, tempo de contato, forças, lesões ou técnica completa de corrida.</li></ul></div>
 </div>;
}
