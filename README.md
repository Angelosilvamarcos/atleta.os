import { useState, useEffect, useRef } from "react";

const db = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const T = {
  bg:"#09090b", card:"#18181b", border:"#27272a",
  text:"#fafafa", muted:"#71717a", text2:"#a1a1aa",
  amber:"#f59e0b", green:"#22c55e", blue:"#3b82f6",
  red:"#ef4444", pink:"#ec4899", purple:"#a855f7", cyan:"#06b6d4",
};

const fmt = (s) => { if (!s && s !== 0) return "--"; const m = Math.floor(Math.abs(s)/60); return m+":"+String(Math.abs(s)%60).padStart(2,"0"); };
const parse = (str) => { if (!str) return null; const p = str.split(":").map(Number); return p.length===2 ? p[0]*60+p[1] : null; };
const getKm = (l) => parseFloat(l.km) || 0;
const xpFor = (l) => { if (l.intensity==="descanso") return 5; const base={leve:20,moderado:40,forte:70}[l.intensity]||20; return base+(l.rpe>=8?20:l.rpe>=6?10:0)+(l.result5k?50:0); };
const INT_C = {leve:T.green, moderado:T.amber, forte:T.red, descanso:T.muted};
const GOAL = 15*60+20;
const BEST_START = 16*60+43;

const SEED_LOGS = [
  {id:"s1",date:"2026-05-01",type:"Prova 5km",desc:"Corrida do Trabalhador",intensity:"forte",result5k:"16:43",notes:"FC 152bpm · pace 3min25/km",rpe:8,sono:"bom",pernas:"normal",km:"5"},
  {id:"s2",date:"2026-05-02",type:"Regenerativo",desc:"Core + 30min esteira + 12x100m",intensity:"leve",result5k:"",notes:"",rpe:3,sono:"bom",pernas:"leve",km:"5"},
  {id:"s3",date:"2026-05-03",type:"Regenerativo",desc:"15km a 6min29/km + 2.88km trote",intensity:"leve",result5k:"",notes:"HydraMaxi + Hydro Lift",rpe:4,sono:"bom",pernas:"normal",km:"17.88"},
  {id:"s4",date:"2026-05-06",type:"Progressivo",desc:"15.76km avg 4min29/km chegando 2min58/km",intensity:"forte",result5k:"",notes:"Gel Fire",rpe:8,sono:"bom",pernas:"normal",km:"18.26"},
  {id:"s5",date:"2026-05-07",type:"Academia",desc:"Grama + mobilidade + superior + core + agachamento 20kg",intensity:"moderado",result5k:"",notes:"Completo",rpe:5,sono:"bom",pernas:"leve",km:"4"},
  {id:"s6",date:"2026-05-17",type:"Prova 5km",desc:"Corrida do Time Brasil",intensity:"forte",result5k:"16:18",notes:"PR! Melhora 25s · pace 3min15/km",rpe:9,sono:"bom",pernas:"normal",km:"5"},
];

const SEED_RACES = [
  {id:"r1",date:"2026-05-01",nome:"Corrida do Trabalhador",dist:"5km",tempo:"16:43",done:true},
  {id:"r2",date:"2026-05-17",nome:"Corrida do Time Brasil",dist:"5km",tempo:"16:18",done:true},
  {id:"r3",date:"2026-05-31",nome:"Corrida da Copa",dist:"5km",tempo:"",done:false},
  {id:"r4",date:"2026-06-14",nome:"Corrida Petrobras",dist:"5km",tempo:"",done:false},
  {id:"r5",date:"2026-07-12",nome:"Corrida do MUSAL",dist:"5km",tempo:"",done:false},
  {id:"r6",date:"2026-08-16",nome:"Meia Internacional do Rio",dist:"21km",tempo:"",done:false,highlight:true},
  {id:"r7",date:"2026-08-16",nome:"ALL Running 3a Etapa",dist:"5km",tempo:"",done:false},
  {id:"r8",date:"2026-10-31",nome:"Corrida do Halloween",dist:"5km",tempo:"",done:false},
];

const PLAN = [
  {week:"18-24 Mai", sessions:[
    {day:"Seg",type:"Grama",desc:"45min leve + 8 retas 100m",int:"leve"},
    {day:"Ter",type:"Tiros 800m",desc:"4x800m a 2min30 desc 2min30",int:"forte"},
    {day:"Qua",type:"Longao",desc:"12km pace 5min30/km",int:"leve"},
    {day:"Qui",type:"Progressivo",desc:"8km terminando a 3min15/km",int:"moderado"},
    {day:"Sex",type:"Core",desc:"Forca + mobilidade 45min",int:"leve"},
    {day:"Sab",type:"Longao",desc:"16km pace 5min45/km",int:"leve"},
    {day:"Dom",type:"Descanso",desc:"Recuperacao ativa",int:"descanso"},
  ]},
  {week:"25-31 Mai PROVA", sessions:[
    {day:"Seg",type:"Grama",desc:"40min + 10 retas 100m",int:"leve"},
    {day:"Ter",type:"Tiros 1000m",desc:"5x1000m a 3min10 desc 3min",int:"forte"},
    {day:"Qua",type:"Regenerativo",desc:"30min bem leve",int:"leve"},
    {day:"Qui",type:"Fartlek",desc:"30min 1min forte / 1min leve",int:"moderado"},
    {day:"Sex",type:"Descanso",desc:"Descanso ou mobilidade",int:"descanso"},
    {day:"Sab",type:"Tapering",desc:"20min leve + 4 retas soltura",int:"leve"},
    {day:"Dom",type:"PROVA",desc:"Corrida da Copa 5km - Meta 16:00",int:"forte"},
  ]},
];

const LEVELS = [
  {n:0,   l:"Iniciante",  c:T.blue},
  {n:200,  l:"Corredor",   c:T.green},
  {n:600,  l:"Competidor", c:T.amber},
  {n:1400, l:"Atleta",     c:T.red},
  {n:3000, l:"Elite",      c:T.purple},
  {n:6000, l:"Campeao",    c:T.cyan},
];

function computeStats(logs) {
  const races = logs.filter(l => l.result5k && parse(l.result5k));
  const best = races.reduce((b,r) => (!b || parse(r.result5k) < parse(b.result5k)) ? r : b, null);
  const bestSecs = best ? parse(best.result5k) : BEST_START;
  const totalXP = logs.reduce((s,l) => s + xpFor(l), 0);
  const now = new Date();
  const ws = new Date(now); ws.setDate(now.getDate()-((now.getDay()+6)%7)); ws.setHours(0,0,0,0);
  const ms = new Date(now.getFullYear(), now.getMonth(), 1);
  const kmWeek  = logs.filter(l => new Date(l.date+"T12:00:00") >= ws).reduce((s,l) => s+getKm(l), 0);
  const kmMonth = logs.filter(l => new Date(l.date+"T12:00:00") >= ms).reduce((s,l) => s+getKm(l), 0);
  const kmTotal = logs.reduce((s,l) => s+getKm(l), 0);
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = d.toISOString().split("T")[0];
    if (logs.some(l => l.date===ds && l.intensity!=="descanso")) streak++;
    else if (i > 0) break;
  }
  const lvl = LEVELS.slice().reverse().find(l => totalXP >= l.n) || LEVELS[0];
  const nextLvl = LEVELS[LEVELS.indexOf(lvl)+1];
  const xpPct = nextLvl ? Math.min(100,((totalXP-lvl.n)/(nextLvl.n-lvl.n))*100) : 100;
  return { bestSecs, totalXP, kmWeek, kmMonth, kmTotal, streak, lvl, nextLvl, xpPct, races,
    progressPct: Math.min(100, Math.max(0,((BEST_START-bestSecs)/(BEST_START-GOAL))*100)) };
}

const cs = {
  card: {background:T.card, border:"1px solid "+T.border, borderRadius:12, padding:14, marginBottom:10},
  inp:  {background:"#09090b", border:"1px solid "+T.border, borderRadius:8, padding:"8px 12px", color:T.text, fontSize:13, width:"100%", outline:"none", boxSizing:"border-box"},
  lbl:  {fontSize:10, color:T.muted, textTransform:"uppercase", letterSpacing:1.5, fontFamily:"monospace", marginBottom:4, display:"block"},
  g2:   {display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10},
};

function pill(c) { return {display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:c+"22",color:c,border:"1px solid "+c+"44"}; }
function gbtn(c,txt) { return {background:c,color:txt||"#000",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:700,fontSize:13,cursor:"pointer",width:"100%"}; }

function Bar({pct,color,h}) {
  const hh = h||4;
  return (
    <div style={{height:hh,background:T.border,borderRadius:hh,overflow:"hidden"}}>
      <div style={{height:"100%",width:pct+"%",background:color,borderRadius:hh,transition:"width .8s ease"}}/>
    </div>
  );
}

function Seg({opts,val,onChange,color}) {
  const c = color || T.amber;
  return (
    <div style={{display:"flex",gap:4}}>
      {opts.map(o => {
        const a = val===o.v;
        return (
          <button key={o.v} onClick={()=>onChange(o.v)}
            style={{flex:1,padding:"7px 4px",background:a?c+"22":T.bg,color:a?c:T.muted,border:"1px solid "+(a?c+"66":T.border),borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:a?700:400}}>
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

function Radar({logs}) {
  const calc = (fn,m) => Math.min(100,Math.max(8,logs.filter(fn).length*m));
  const attrs = [
    {k:"Velocidade",c:T.red,   v:calc(l=>/Tiros|200m|400m/i.test(l.type||""),8)},
    {k:"Resistencia",c:T.blue, v:calc(l=>/Longao|Regenerativo/i.test(l.type||""),6)},
    {k:"Forca",c:T.pink,       v:calc(l=>/Academia|Core|Forca/i.test(l.type||""),10)},
    {k:"Mobilidade",c:T.green, v:calc(l=>/Core|mobilidade/i.test((l.notes||"")+(l.type||"")),8)},
    {k:"Disciplina",c:T.amber, v:Math.min(100,logs.length*3)},
  ];
  const cx=70,cy=70,r=50;
  const pts = attrs.map((a,i) => {
    const angle = (i/attrs.length)*2*Math.PI - Math.PI/2;
    const v = a.v/100;
    return [cx+r*v*Math.cos(angle), cy+r*v*Math.sin(angle)];
  });
  return (
    <div style={{display:"flex",alignItems:"center",gap:16}}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        {[0.25,0.5,0.75,1].map(v => (
          <polygon key={v} fill="none" stroke={T.border} strokeWidth="1"
            points={attrs.map((_,i)=>{const a=(i/attrs.length)*2*Math.PI-Math.PI/2;return (cx+r*v*Math.cos(a))+","+(cy+r*v*Math.sin(a));}).join(" ")}/>
        ))}
        {attrs.map((_,i)=>{const a=(i/attrs.length)*2*Math.PI-Math.PI/2;return <line key={i} x1={cx} y1={cy} x2={cx+r*Math.cos(a)} y2={cy+r*Math.sin(a)} stroke={T.border} strokeWidth="1"/>;} )}
        <polygon points={pts.map(p=>p[0]+","+p[1]).join(" ")} fill={T.amber+"33"} stroke={T.amber} strokeWidth="1.5"/>
      </svg>
      <div style={{flex:1}}>
        {attrs.map(a => (
          <div key={a.k} style={{marginBottom:5}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
              <span style={{color:T.muted}}>{a.k}</span>
              <span style={{color:a.c,fontFamily:"monospace",fontWeight:700}}>{a.v}</span>
            </div>
            <Bar pct={a.v} color={a.c} h={3}/>
          </div>
        ))}
      </div>
    </div>
  );
}

function Home({logs,races,onNav}) {
  const st = computeStats(logs);
  const nextRace = races.find(r=>!r.done);
  const daysLeft = nextRace ? Math.ceil((new Date(nextRace.date+"T12:00:00")-new Date())/86400000) : null;
  return (
    <div style={{padding:"12px 14px 16px"}}>
      <div style={{...cs.card,background:"linear-gradient(135deg,#1c1917,#18181b)",borderColor:T.amber+"44"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:10,color:T.muted,fontFamily:"monospace",letterSpacing:2}}>ANGELO</div>
            <div style={{fontSize:22,fontWeight:900}}><span style={{color:T.amber}}>ATLETA</span><span>OS</span></div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:24,fontWeight:900,color:T.amber,fontFamily:"monospace",lineHeight:1}}>{fmt(st.bestSecs)}</div>
            <div style={{fontSize:10,color:T.muted}}>melhor 5km</div>
          </div>
        </div>
        <Bar pct={st.progressPct} color={T.amber} h={6}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.muted,marginTop:4}}>
          <span>{fmt(BEST_START)}</span>
          <span style={{color:T.amber}}>{st.progressPct.toFixed(0)}% para meta 15:10-15:30</span>
          <span>{fmt(GOAL)}</span>
        </div>
        {nextRace && (
          <div style={{marginTop:10,padding:"8px 10px",background:"rgba(0,0,0,.3)",borderRadius:8,fontSize:12}}>
            Proxima: <strong style={{color:T.amber}}>{nextRace.nome}</strong>
            <span style={{color:T.muted,marginLeft:6}}>{daysLeft>0?daysLeft+"d":daysLeft===0?"HOJE!":"passou"}</span>
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        {[
          {label:"Semana",val:st.kmWeek.toFixed(1)+"km",color:T.green},
          {label:"Streak",val:(st.streak>0?"F":"")+st.streak+"d",color:T.amber},
          {label:st.lvl.l,val:st.totalXP+"xp",color:st.lvl.c},
        ].map(s => (
          <div key={s.label} style={{...cs.card,margin:0,textAlign:"center",padding:"10px 6px"}}>
            <div style={{fontSize:16,fontWeight:900,color:s.color,fontFamily:"monospace"}}>{s.val}</div>
            <div style={{fontSize:9,color:T.muted,textTransform:"uppercase",letterSpacing:1,marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{...cs.card,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:12,fontWeight:700,color:st.lvl.c}}>{st.lvl.l}</span>
          {st.nextLvl&&<span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{st.nextLvl.n-st.totalXP}xp para {st.nextLvl.l}</span>}
        </div>
        <Bar pct={st.xpPct} color={st.lvl.c} h={5}/>
      </div>

      <div style={{...cs.card,marginBottom:10}}>
        <div style={{fontSize:10,color:T.muted,fontFamily:"monospace",letterSpacing:1,marginBottom:8}}>ULTIMOS 7 DIAS</div>
        <div style={{display:"flex",gap:4}}>
          {[...Array(7)].map((_,i) => {
            const d=new Date(); d.setDate(d.getDate()-(6-i));
            const ds=d.toISOString().split("T")[0];
            const day=["Dom","Seg","Ter","Qua","Qui","Sex","Sab"][d.getDay()];
            const done=logs.some(l=>l.date===ds&&l.intensity!=="descanso");
            return (
              <div key={i} style={{flex:1,textAlign:"center"}}>
                <div style={{height:26,background:done?T.amber:T.border,borderRadius:5,marginBottom:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:done?"#000":T.muted}}>
                  {done?"v":""}
                </div>
                <div style={{fontSize:9,color:T.muted}}>{day}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{...cs.card,marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Atributos</div>
        <Radar logs={logs}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[
          {id:"corrida",  icon:"run", label:"Corrida",       color:T.amber},
          {id:"provas",   icon:"cup", label:"Provas 2026",   color:T.purple},
          {id:"treino",   icon:"doc", label:"Treino do Dia", color:T.cyan},
          {id:"academia", icon:"gym", label:"Academia",      color:T.pink},
        ].map(m => (
          <button key={m.id} onClick={()=>onNav(m.id)}
            style={{...cs.card,margin:0,textAlign:"left",cursor:"pointer",padding:"12px 14px",display:"flex",flexDirection:"column",gap:4,border:"1px solid "+T.border}}>
            <span style={{fontWeight:700,fontSize:13}}>{m.label}</span>
            <div style={{width:20,height:2,background:m.color,borderRadius:2}}/>
          </button>
        ))}
      </div>
    </div>
  );
}

function Corrida({logs,onSave}) {
  const [tab,setTab]=useState("hist");
  const [editId,setEditId]=useState(null);
  const [saved,setSaved]=useState(false);
  const [form,setForm]=useState({date:new Date().toISOString().split("T")[0],type:"Treino Professor",desc:"",intensity:"moderado",result5k:"",km:"",rpe:5,sono:"bom",pernas:"normal",notes:""});
  const TYPES=["Treino Professor","Prova 5km","Longao","Tiros 400m","Tiros 800m","Tiros 1000m","Fartlek","Progressivo","Regenerativo","Grama","Academia","Descanso"];
  const st=computeStats(logs);

  function saveLog() {
    if (!form.desc&&!form.result5k) return;
    const nl = editId ? logs.map(l=>l.id===editId?{...form,id:editId}:l) : [...logs,{...form,id:"l"+Date.now()}].sort((a,b)=>a.date.localeCompare(b.date));
    onSave(nl); setSaved(true); setEditId(null);
    setForm({date:new Date().toISOString().split("T")[0],type:"Treino Professor",desc:"",intensity:"moderado",result5k:"",km:"",rpe:5,sono:"bom",pernas:"normal",notes:""});
    setTimeout(()=>setSaved(false),2500); setTab("hist");
  }

  const TABS=[{id:"dash",l:"Stats"},{id:"reg",l:"+ Registrar"},{id:"hist",l:"Historico"},{id:"plano",l:"Plano"}];
  return (
    <div style={{paddingBottom:80}}>
      <div style={{display:"flex",background:T.card,borderBottom:"1px solid "+T.border}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,padding:"10px 4px",background:"transparent",color:tab===t.id?T.amber:T.muted,border:"none",borderBottom:"2px solid "+(tab===t.id?T.amber:"transparent"),cursor:"pointer",fontSize:11,fontWeight:tab===t.id?700:400}}>
            {t.l}
          </button>
        ))}
      </div>
      <div style={{padding:"12px 14px"}}>
        {tab==="dash"&&(
          <div>
            <div style={{...cs.card,borderLeft:"3px solid "+T.amber}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontWeight:700,color:T.amber}}>META 5KM</span>
                <span style={pill(T.amber)}>{st.progressPct.toFixed(0)}%</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
                <span style={{color:T.muted}}>Melhor: <strong style={{color:T.text,fontFamily:"monospace"}}>{fmt(st.bestSecs)}</strong></span>
                <span style={{color:T.muted}}>Meta: <strong style={{color:T.green}}>15:10-15:30</strong></span>
              </div>
              <Bar pct={st.progressPct} color={T.amber} h={6}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {[
                {l:"Km semana",v:st.kmWeek.toFixed(1),c:T.green},
                {l:"Km mes",v:st.kmMonth.toFixed(1),c:T.blue},
                {l:"Total 2026",v:st.kmTotal.toFixed(0)+"km",c:T.purple},
                {l:"Provas",v:st.races.length+"",c:T.amber},
              ].map(s=>(
                <div key={s.l} style={{...cs.card,margin:0,textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:900,color:s.c,fontFamily:"monospace"}}>{s.v}</div>
                  <div style={{fontSize:9,color:T.muted,textTransform:"uppercase",letterSpacing:1,marginTop:1}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={cs.card}><Radar logs={logs}/></div>
          </div>
        )}
        {tab==="reg"&&(
          <div style={cs.card}>
            <div style={{fontWeight:700,color:editId?T.blue:T.amber,marginBottom:12}}>{editId?"Editando Treino":"+ Novo Treino"}</div>
            {saved&&<div style={{...cs.card,background:T.green+"18",borderColor:T.green+"44",color:T.green,fontWeight:700,textAlign:"center",marginBottom:10}}>Salvo! +{xpFor(form)} XP</div>}
            <div style={cs.g2}>
              <div><span style={cs.lbl}>Data</span><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={cs.inp}/></div>
              <div><span style={cs.lbl}>Km</span><input type="number" step="0.1" value={form.km} onChange={e=>setForm(f=>({...f,km:e.target.value}))} placeholder="0" style={cs.inp}/></div>
            </div>
            <div style={{marginBottom:10}}>
              <span style={cs.lbl}>Tipo</span>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={cs.inp}>
                {TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{marginBottom:10}}>
              <span style={cs.lbl}>Intensidade</span>
              <Seg opts={[{v:"leve",l:"Leve"},{v:"moderado",l:"Moderado"},{v:"forte",l:"Forte"},{v:"descanso",l:"Descanso"}]} val={form.intensity} onChange={v=>setForm(f=>({...f,intensity:v}))}/>
            </div>
            <div style={{marginBottom:10}}><span style={cs.lbl}>Descricao</span><input value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Ex: 5x1000m a 3min10/km" style={cs.inp}/></div>
            <div style={cs.g2}>
              <div><span style={cs.lbl}>Tempo 5km</span><input value={form.result5k} onChange={e=>setForm(f=>({...f,result5k:e.target.value}))} placeholder="16:18" style={cs.inp}/></div>
              <div><span style={cs.lbl}>Observacoes</span><input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="..." style={cs.inp}/></div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={cs.lbl}>RPE</span>
                <span style={{fontWeight:900,fontSize:18,color:form.rpe>=8?T.red:form.rpe>=6?T.amber:T.green,fontFamily:"monospace"}}>{form.rpe}</span>
              </div>
              <input type="range" min={1} max={10} value={form.rpe} onChange={e=>setForm(f=>({...f,rpe:+e.target.value}))} style={{width:"100%",accentColor:form.rpe>=8?T.red:form.rpe>=6?T.amber:T.green}}/>
            </div>
            <div style={cs.g2}>
              <div><span style={cs.lbl}>Pernas</span><Seg opts={[{v:"leve",l:"Leves"},{v:"normal",l:"Normal"},{v:"pesada",l:"Pesadas"}]} val={form.pernas} onChange={v=>setForm(f=>({...f,pernas:v}))} color={T.blue}/></div>
              <div><span style={cs.lbl}>Sono</span><Seg opts={[{v:"bom",l:"Bom"},{v:"medio",l:"Medio"},{v:"ruim",l:"Ruim"}]} val={form.sono} onChange={v=>setForm(f=>({...f,sono:v}))} color={T.purple}/></div>
            </div>
            <button onClick={saveLog} style={gbtn(editId?T.blue:T.amber)}>{editId?"ATUALIZAR":"SALVAR TREINO"}</button>
          </div>
        )}
        {tab==="hist"&&(
          <div>
            <div style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginBottom:10}}>{logs.length} treinos - {st.totalXP} XP</div>
            {[...logs].reverse().map(l=>(
              <div key={l.id} style={{...cs.card,borderLeft:"3px solid "+(INT_C[l.intensity]||T.muted)}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontFamily:"monospace",fontSize:10,color:T.muted}}>{l.date}</span>
                    <span style={pill(INT_C[l.intensity]||T.muted)}>{l.type}</span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{setForm({...l});setEditId(l.id);setTab("reg");}} style={{background:T.blue+"18",border:"1px solid "+T.blue+"33",borderRadius:6,padding:"2px 8px",color:T.blue,cursor:"pointer",fontSize:11}}>editar</button>
                    <button onClick={()=>onSave(logs.filter(x=>x.id!==l.id))} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:15}}>x</button>
                  </div>
                </div>
                {l.result5k&&<div style={{fontSize:20,fontWeight:900,color:T.green,fontFamily:"monospace",marginBottom:4}}>Prova: {l.result5k}</div>}
                <div style={{fontSize:13,color:T.text2}}>{l.desc}</div>
                {l.notes&&<div style={{fontSize:11,color:T.muted,marginTop:2}}>{l.notes}</div>}
                <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center"}}>
                  {l.km&&+l.km>0&&<span style={{fontSize:11,color:T.amber}}>{(+l.km).toFixed(2)}km</span>}
                  {l.rpe&&<span style={{fontSize:11,color:T.text2}}>RPE:{l.rpe}</span>}
                  <span style={{fontSize:10,color:T.muted,fontFamily:"monospace",marginLeft:"auto"}}>+{xpFor(l)}xp</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab==="plano"&&(
          <div>
            {PLAN.map((wk,wi)=>(
              <div key={wi} style={cs.card}>
                <div style={{fontWeight:700,fontSize:13,color:T.amber,marginBottom:10}}>{wk.week}</div>
                {wk.sessions.map((sess,si)=>{
                  const dayIdx=["Dom","Seg","Ter","Qua","Qui","Sex","Sab"].indexOf(sess.day);
                  const now=new Date(); const d=new Date(now); d.setDate(now.getDate()-now.getDay()+dayIdx+(wi*7));
                  const isToday=d.toDateString()===now.toDateString();
                  const bb = si+1 < wk.sessions.length ? "1px solid "+T.border : "none";
                  return (
                    <div key={si} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:bb,background:isToday?INT_C[sess.int]+"0a":"transparent",borderRadius:isToday?6:0,paddingLeft:isToday?8:0}}>
                      <div style={{width:36,fontSize:10,fontWeight:700,color:INT_C[sess.int],fontFamily:"monospace",background:INT_C[sess.int]+"18",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{sess.day}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:700,color:isToday?INT_C[sess.int]:T.text}}>{isToday?"[HOJE] ":""}{sess.type}</div>
                        <div style={{fontSize:11,color:T.muted}}>{sess.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Provas({races,onSaveRaces,logs,onSaveLogs}) {
  const logsRef=useRef(logs);
  useEffect(()=>{logsRef.current=logs;},[logs]);
  const [list,setList]=useState(races);
  const [showAdd,setShowAdd]=useState(false);
  const [saved,setSaved]=useState(null);
  const [nova,setNova]=useState({date:"",nome:"",dist:"5km"});
  useEffect(()=>{setList(races);},[races]);

  function saveTime(id,val) {
    if (!val||!val.includes(":")) return;
    const v=val.trim();
    const nl=list.map(r=>r.id===id?{...r,tempo:v,done:true}:r);
    setList(nl); onSaveRaces(nl); setSaved(id); setTimeout(()=>setSaved(null),3000);
    const race=nl.find(r=>r.id===id);
    if (race&&race.dist==="5km") {
      const newLog={id:"race_"+id,date:race.date,type:"Prova 5km",desc:race.nome,intensity:"forte",result5k:v,notes:"Via Provas 2026",rpe:9,sono:"bom",pernas:"normal",km:"5"};
      const updated=[...logsRef.current.filter(l=>l.id!=="race_"+id),newLog].sort((a,b)=>a.date.localeCompare(b.date));
      onSaveLogs(updated);
    }
  }

  function addRace() {
    if (!nova.date||!nova.nome) return;
    const nl=[...list,{id:"r"+Date.now(),date:nova.date,nome:nova.nome,dist:nova.dist,tempo:"",done:false}].sort((a,b)=>a.date.localeCompare(b.date));
    setList(nl); onSaveRaces(nl); setNova({date:"",nome:"",dist:"5km"}); setShowAdd(false);
  }

  return (
    <div style={{padding:"12px 14px 80px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontWeight:700,fontSize:15}}>Provas 2026</span>
        <button onClick={()=>setShowAdd(s=>!s)} style={{padding:"6px 12px",background:T.purple+"22",color:T.purple,border:"1px solid "+T.purple+"44",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>+ Nova</button>
      </div>
      {showAdd&&(
        <div style={{...cs.card,borderLeft:"3px solid "+T.purple,marginBottom:12}}>
          <div style={cs.g2}>
            <div><span style={cs.lbl}>Data</span><input type="date" value={nova.date} onChange={e=>setNova(f=>({...f,date:e.target.value}))} style={cs.inp}/></div>
            <div><span style={cs.lbl}>Distancia</span>
              <select value={nova.dist} onChange={e=>setNova(f=>({...f,dist:e.target.value}))} style={cs.inp}>
                {["5km","10km","15km","21km","42km"].map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginBottom:8}}><span style={cs.lbl}>Nome</span><input value={nova.nome} onChange={e=>setNova(f=>({...f,nome:e.target.value}))} placeholder="Ex: Corrida do Parque" style={cs.inp}/></div>
          <button onClick={addRace} style={gbtn(T.purple,"#fff")}>ADICIONAR</button>
        </div>
      )}
      {list.map(r=>{
        const isSaved=saved===r.id;
        const cor=r.done||isSaved?T.green:r.highlight?T.amber:T.purple;
        return (
          <div key={r.id} style={{...cs.card,borderLeft:"3px solid "+cor,display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:r.highlight?T.amber:T.text}}>{r.nome}</div>
              <div style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>{r.dist} - {r.date}</div>
            </div>
            <div style={{textAlign:"right"}}>
              {r.done
                ? <div style={{fontFamily:"monospace",fontWeight:900,color:T.green,fontSize:15}}>{r.tempo} ok</div>
                : <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <input
                      defaultValue={r.tempo||""}
                      onBlur={e=>saveTime(r.id,e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&e.target.blur()}
                      placeholder="00:00"
                      style={{width:72,background:"#09090b",border:"1px solid "+(isSaved?T.green:T.border),borderRadius:6,padding:"5px 8px",color:T.green,fontFamily:"monospace",fontSize:13,textAlign:"center",outline:"none",fontWeight:700}}
                    />
                    {isSaved&&<span style={{fontSize:10,color:T.green}}>salvo!</span>}
                  </div>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TreinoDia() {
  const BLOCOS=[
    {titulo:"Mobilidade",cor:T.blue,exs:[
      {nome:"Rotacao de quadril",det:"10 reps cada",tempo:60},
      {nome:"Panturrilha + isquio",det:"30s cada",tempo:60},
      {nome:"Rotacao tornozelo",det:"10 reps cada",tempo:45},
    ]},
    {titulo:"Superior",cor:T.amber,exs:[
      {nome:"Aviao unilateral",det:"2x10 cada",tempo:90},
      {nome:"Remada unilateral",det:"2x12 cada",tempo:90},
      {nome:"Flexao de braco",det:"2x10",tempo:60},
    ]},
    {titulo:"Core",cor:T.green,exs:[
      {nome:"Prancha baixa",det:"3x40s",tempo:40},
      {nome:"Prancha lateral",det:"2x30s cada",tempo:30},
      {nome:"Elevacao pelvica",det:"3x15",tempo:60},
      {nome:"Superman",det:"2x30s",tempo:30},
      {nome:"ABS remador",det:"3x20",tempo:60},
      {nome:"ABS rotacao +5kg",det:"3x10",tempo:60},
    ]},
    {titulo:"Forca",cor:T.red,exs:[
      {nome:"Agachamento barra",det:"3x10 - 20kg",tempo:90},
      {nome:"Bulgaro",det:"3x10 - 20kg",tempo:90},
      {nome:"Panturrilha em pe",det:"3x15",tempo:60},
      {nome:"Salto na caixa",det:"3x10",tempo:60},
      {nome:"Gluteo elastico",det:"2x15 cada",tempo:60},
    ]},
  ];
  const allEx=BLOCOS.flatMap((b,bi)=>b.exs.map((e,ei)=>({...e,uid:bi+"-"+ei,cor:b.cor})));
  const [checked,setChecked]=useState({});
  const [timer,setTimer]=useState(null);
  const ivRef=useRef(null);
  const done=allEx.filter(e=>checked[e.uid]).length;
  const total=allEx.length;

  function startTimer(secs,label) {
    if (ivRef.current) clearInterval(ivRef.current);
    setTimer({secs,total:secs,label,running:true});
    ivRef.current=setInterval(()=>{
      setTimer(t=>{
        if (!t||!t.running) return t;
        if (t.secs<=1){clearInterval(ivRef.current);return {...t,secs:0,running:false};}
        return {...t,secs:t.secs-1};
      });
    },1000);
  }

  function toggleTimer() {
    setTimer(t=>{
      if (!t) return t;
      if (t.running){clearInterval(ivRef.current);return {...t,running:false};}
      ivRef.current=setInterval(()=>{
        setTimer(tt=>{
          if (!tt||!tt.running) return tt;
          if (tt.secs<=1){clearInterval(ivRef.current);return {...tt,secs:0,running:false};}
          return {...tt,secs:tt.secs-1};
        });
      },1000);
      return {...t,running:true};
    });
  }

  return (
    <div style={{paddingBottom:timer?200:80}}>
      <div style={{padding:"12px 14px 0"}}>
        <div style={cs.card}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
            <span style={{color:T.muted}}>Progresso</span>
            <span style={{fontWeight:700,color:T.green}}>{done}/{total}</span>
          </div>
          <Bar pct={Math.round((done/total)*100)} color={T.green} h={6}/>
          {done===total&&<div style={{textAlign:"center",color:T.green,fontWeight:900,marginTop:8}}>COMPLETO!</div>}
        </div>
      </div>
      <div style={{padding:"0 14px"}}>
        {BLOCOS.map((b,bi)=>(
          <div key={bi}>
            <div style={{fontWeight:700,fontSize:11,color:b.cor,letterSpacing:1,margin:"10px 0 6px",fontFamily:"monospace"}}>{b.titulo.toUpperCase()}</div>
            {b.exs.map((ex,ei)=>{
              const uid=bi+"-"+ei;
              const isDone=checked[uid];
              return (
                <div key={uid} style={{...cs.card,display:"flex",alignItems:"center",gap:10,opacity:isDone?.5:1,borderLeft:"3px solid "+(isDone?T.green:b.cor),padding:"10px 12px"}}>
                  <button onClick={()=>setChecked(c=>({...c,[uid]:!c[uid]}))}
                    style={{width:26,height:26,borderRadius:"50%",border:"2px solid "+(isDone?T.green:T.border),background:isDone?T.green:"transparent",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#000"}}>
                    {isDone?"v":""}
                  </button>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:isDone?400:700,color:isDone?T.muted:T.text}}>{ex.nome}</div>
                    <div style={{fontSize:11,color:T.muted}}>{ex.det}</div>
                  </div>
                  <button onClick={()=>startTimer(ex.tempo,ex.nome)}
                    style={{padding:"4px 9px",background:b.cor+"18",color:b.cor,border:"1px solid "+b.cor+"44",borderRadius:7,cursor:"pointer",fontSize:10,fontWeight:700}}>
                    {ex.tempo}s
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {timer&&(
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:600,background:"rgba(9,9,11,.97)",borderTop:"1px solid "+T.border,padding:16,zIndex:200}}>
          <div style={{maxWidth:400,margin:"0 auto"}}>
            <div style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginBottom:4,textAlign:"center"}}>{timer.label}</div>
            <div style={{fontSize:64,fontWeight:900,fontFamily:"monospace",textAlign:"center",color:timer.secs<=5?T.red:T.text,lineHeight:1,marginBottom:8}}>{fmt(timer.secs)}</div>
            <Bar pct={Math.max(0,(timer.secs/timer.total)*100)} color={timer.secs<=5?T.red:T.green} h={4}/>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={toggleTimer} style={gbtn(timer.running?T.amber:T.green)}>{timer.running?"PAUSAR":"CONTINUAR"}</button>
              <button onClick={()=>{clearInterval(ivRef.current);setTimer(null);}} style={{...gbtn(T.border),color:T.muted,flex:"0 0 80px"}}>fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Academia() {
  const DEFAULT_EX=["Agachamento","Bulgaro","Avanco/Afundo","Salto na caixa","Elevacao pelvica","Remada","Supino","Puxada","Aviao c/ halter","Panturrilha","Pilates","Natacao","Esteira"];
  const [exList,setExList]=useState(()=>db.get("gym_exlist")||DEFAULT_EX);
  const [checked,setChecked]=useState([]);
  const [newEx,setNewEx]=useState("");
  const [gymLogs,setGymLogs]=useState(()=>db.get("gym_logs")||[]);
  const [saved,setSaved]=useState(false);
  const [form,setForm]=useState({date:new Date().toISOString().split("T")[0],foco:"Full Body",carga:"",duracao:"45 min",notas:""});

  function addEx(){if(!newEx.trim()||exList.includes(newEx.trim()))return;const nl=[...exList,newEx.trim()];setExList(nl);db.set("gym_exlist",nl);setNewEx("");}

  function saveSession(){
    if(!checked.length)return;
    const log={id:"g"+Date.now(),...form,exercicios:[...checked]};
    const nl=[log,...gymLogs];setGymLogs(nl);db.set("gym_logs",nl);setChecked([]);setSaved(true);setTimeout(()=>setSaved(false),2500);
  }

  return (
    <div style={{padding:"12px 14px 80px"}}>
      {saved&&<div style={{...cs.card,background:T.pink+"18",borderColor:T.pink+"44",color:T.pink,fontWeight:700,textAlign:"center",marginBottom:10}}>Sessao salva!</div>}
      <div style={cs.card}>
        <div style={{fontWeight:700,color:T.pink,fontSize:13,marginBottom:12}}>+ Registrar Sessao</div>
        <div style={cs.g2}>
          <div><span style={cs.lbl}>Data</span><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={cs.inp}/></div>
          <div><span style={cs.lbl}>Foco</span>
            <select value={form.foco} onChange={e=>setForm(f=>({...f,foco:e.target.value}))} style={cs.inp}>
              {["Full Body","Pernas","Superior","Forca","Pliometria","Mobilidade","Pilates"].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <span style={cs.lbl}>Exercicios</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
            {exList.map(ex=>{
              const sel=checked.includes(ex);
              return <button key={ex} onClick={()=>setChecked(c=>sel?c.filter(x=>x!==ex):[...c,ex])}
                style={{padding:"5px 11px",borderRadius:20,fontSize:12,cursor:"pointer",fontWeight:sel?700:400,background:sel?T.pink+"22":T.bg,color:sel?T.pink:T.muted,border:"1px solid "+(sel?T.pink+"66":T.border)}}>
                {sel?"+ ":""}{ex}
              </button>;
            })}
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <input value={newEx} onChange={e=>setNewEx(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addEx()} placeholder="Adicionar exercicio..." style={{...cs.inp,flex:1}}/>
          <button onClick={addEx} style={{...gbtn(T.pink,"#fff"),width:"auto",padding:"8px 14px"}}>ADD</button>
        </div>
        <div style={cs.g2}>
          <div><span style={cs.lbl}>Carga</span><input value={form.carga} onChange={e=>setForm(f=>({...f,carga:e.target.value}))} placeholder="ex: 20kg" style={cs.inp}/></div>
          <div><span style={cs.lbl}>Duracao</span>
            <select value={form.duracao} onChange={e=>setForm(f=>({...f,duracao:e.target.value}))} style={cs.inp}>
              {["30 min","45 min","60 min","90 min"].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <div style={{marginBottom:10}}><span style={cs.lbl}>Observacoes</span><input value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="..." style={cs.inp}/></div>
        <button onClick={saveSession} style={gbtn(T.pink,"#fff")}>SALVAR SESSAO</button>
      </div>
      {gymLogs.length>0&&(
        <div>
          <div style={{fontSize:11,color:T.muted,fontFamily:"monospace",margin:"6px 0 8px"}}>{gymLogs.length} SESSOES</div>
          {gymLogs.map(l=>(
            <div key={l.id} style={{...cs.card,borderLeft:"3px solid "+T.pink}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontFamily:"monospace",fontSize:10,color:T.muted}}>{l.date}</span>
                  <span style={pill(T.pink)}>{l.foco}</span>
                  {l.carga&&<span style={{fontSize:11,color:T.amber,fontWeight:700}}>{l.carga}</span>}
                </div>
                <button onClick={()=>{const nl=gymLogs.filter(x=>x.id!==l.id);setGymLogs(nl);db.set("gym_logs",nl);}} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:15}}>x</button>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {l.exercicios&&l.exercicios.map(ex=><span key={ex} style={pill(T.pink)}>{ex}</span>)}
              </div>
              {l.notas&&<div style={{fontSize:11,color:T.muted,marginTop:5}}>{l.notas}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const NAV=[
  {id:"home",    icon:"casa",  label:"Home"},
  {id:"corrida", icon:"run",   label:"Corrida"},
  {id:"treino",  icon:"lista", label:"Treino"},
  {id:"academia",icon:"gym",   label:"Academia"},
  {id:"provas",  icon:"copa",  label:"Provas"},
];

export default function App() {
  const [screen,setScreen]=useState("home");
  const [logs,setLogs]=useState(()=>db.get("corrida_logs")||SEED_LOGS);
  const [races,setRaces]=useState(()=>db.get("races_2026")||SEED_RACES);
  function saveLogs(nl){setLogs(nl);db.set("corrida_logs",nl);}
  function saveRaces(nl){setRaces(nl);db.set("races_2026",nl);}
  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"system-ui,-apple-system,sans-serif",fontSize:14,maxWidth:600,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid "+T.border,position:"sticky",top:0,background:"rgba(9,9,11,.97)",zIndex:50}}>
        <div style={{fontWeight:900,fontSize:18}}><span style={{color:T.amber}}>ATLETA</span><span>OS</span></div>
        <div style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>Angelo</div>
      </div>
      <div style={{paddingBottom:64}}>
        {screen==="home"     && <Home logs={logs} races={races} onNav={setScreen}/>}
        {screen==="corrida"  && <Corrida logs={logs} onSave={saveLogs}/>}
        {screen==="treino"   && <TreinoDia/>}
        {screen==="academia" && <Academia/>}
        {screen==="provas"   && <Provas races={races} onSaveRaces={saveRaces} logs={logs} onSaveLogs={saveLogs}/>}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:600,background:"rgba(9,9,11,.97)",borderTop:"1px solid "+T.border,display:"flex",zIndex:100}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setScreen(n.id)}
            style={{flex:1,padding:"8px 4px 10px",background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:screen===n.id?T.amber:"transparent",margin:"0 auto 2px"}}/>
            <span style={{fontSize:9,color:screen===n.id?T.amber:T.muted,fontWeight:screen===n.id?700:400}}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
