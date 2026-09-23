import { useState, useEffect, useCallback } from "react";

// ── OFFLINE-FIRST STORAGE ──────────────────────────────────────────────────
const store = {
  async get(key) {
    try {
      if (window.storage) {
        const r = await window.storage.get(key);
        if (r?.value) { localStorage.setItem("rt_" + key, r.value); return { value: r.value }; }
      }
    } catch(_) {}
    const v = localStorage.getItem("rt_" + key);
    return v ? { value: v } : null;
  },
  async set(key, value) {
    localStorage.setItem("rt_" + key, value);
    try { if (window.storage) await store.set(key, value); } catch(_) {}
  }
};

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const GOAL_LOW  = 15 * 60 + 10;
const GOAL_HIGH = 15 * 60 + 30;
const GOAL_MID  = 15 * 60 + 20;
const START_BEST = 16 * 60 + 43;

function fmtTime(s) {
  if (!s && s !== 0) return "--";
  const m = Math.floor(Math.abs(s) / 60);
  const sec = Math.abs(s) % 60;
  return m + ":" + String(sec).padStart(2, "0");
}
function parseTime(str) {
  if (!str) return null;
  const parts = str.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  return null;
}

const INT_COLOR = {
  leve: "#3dd68c", moderado: "#f0a500", forte: "#e05c2e", descanso: "#4a5568",
};

function getFatigueScore(logs) {
  const last = logs.slice(-3);
  if (!last.length) return 0;
  let score = 0;
  last.forEach(l => {
    score += (l.rpe || 5);
    if (l.pernas === "pesada") score += 2;
    if (l.pernas === "travada") score += 3;
    if (l.sono === "ruim")   score += 2;
    if (l.sono === "medio")  score += 1;
  });
  return score / last.length;
}

function getDailyStatus(logs) {
  const fatigue = getFatigueScore(logs);
  if (fatigue >= 8) return { status: "RECUPERAR", color: "#e05c2e", action: "Hoje: corrida leve ou descanso total" };
  if (fatigue >= 6) return { status: "MODERADO",  color: "#f0a500", action: "Evitar tiros fortes hoje" };
  return                   { status: "PRONTO",    color: "#3dd68c", action: "Pode treinar forte!" };
}

function predictTime(logs, bestSecs) {
  const recent = logs.slice(-5);
  if (recent.length < 3) return bestSecs;
  let trend = 0;
  recent.forEach(l => {
    if (l.intensity === "forte") trend += 1;
    if (l.intensity === "leve")  trend -= 0.5;
  });
  return Math.round(bestSecs - trend * 2);
}

function getSmartAdjustment(logs, races) {
  const fatigue = getFatigueScore(logs);
  const last = logs.slice(-3);
  if (fatigue >= 8) return { label: "ALTO RISCO", color: "#e05c2e", msg: "Fadiga alta — reduzir volume e intensidade esta semana" };
  const strongDays = last.filter(l => l.intensity === "forte").length;
  if (strongDays >= 2) return { label: "CARGA ALTA", color: "#f0a500", msg: "Muitos treinos fortes seguidos — inserir dia leve amanha" };
  if (races.length >= 2) {
    const lastS = parseTime(races[races.length - 1].result5k);
    const prevS = parseTime(races[races.length - 2].result5k);
    const diff = prevS - lastS;
    if (diff > 30) return { label: "ACIMA DO PLANO", color: "#3dd68c", msg: "Melhora de " + fmtTime(diff) + " — aumentar intensidade dos tiros 1000m" };
    if (diff > 5)  return { label: "NO PLANO",       color: "#3dd68c", msg: "Melhora de " + fmtTime(diff) + " — manter plano atual" };
    if (diff >= 0) return { label: "ESTAVEL",        color: "#4ea8ff", msg: "Tempo estavel — focar na qualidade dos 1000m" };
    return               { label: "ATENCAO",         color: "#e05c2e", msg: "Regrediu " + fmtTime(-diff) + " — revisar descanso e carga" };
  }
  return { label: "OK", color: "#3dd68c", msg: "Treino equilibrado — registrar mais provas" };
}

function getCoachMessage(logs) {
  const fatigue = getFatigueScore(logs);
  if (fatigue >= 8) return { icon: "⚠️", msg: "Cuidado: risco de overtraining", color: "#e05c2e" };
  if (fatigue >= 6) return { icon: "⚡", msg: "Atencao: carga acumulando", color: "#f0a500" };
  return                   { icon: "🔥", msg: "Boa! Pode forcar mais", color: "#3dd68c" };
}

const PHASES = [
  {
    id: 1, name: "BASE AERÓBICA", color: "#4ea8ff",
    period: "Maio 2026", goal: "Construir volume e resistencia aerobica",
    target5k: "16:20", targetSecs: 16 * 60 + 20,
    tip: "Priorize os longoes. Base aerobica e o alicerce de tudo.",
    weeks: [
      {
        label: "Semana 1 (04-10 mai)",
        startDate: "2026-05-04",
        sessions: [
          { day: "Seg", type: "Longao",    desc: "16km pace 5'30-6'00/km", intensity: "leve" },
          { day: "Ter", type: "Fartlek",   desc: "30min: 1min forte 3'20 / 1min leve", intensity: "moderado" },
          { day: "Qua", type: "Grama",     desc: "50min leve + 10 retas 100m", intensity: "leve" },
          { day: "Qui", type: "1000m",     desc: "5x1000m a 3'10/km desc 3min", intensity: "forte" },
          { day: "Sex", type: "Forca",     desc: "Core + Pilates 45min", intensity: "leve" },
          { day: "Sab", type: "Longao",    desc: "18km pace 5'40/km", intensity: "leve" },
          { day: "Dom", type: "Descanso",  desc: "Recuperacao ativa", intensity: "descanso" },
        ],
      },
      {
        label: "Semana 2 (11-17 mai) 🏁 PROVA DOM",
        sessions: [
          { day: "Seg 11", type: "Grama",      desc: "45min pace 6'00-6'30 + 8 retas 100m leves — ativar sem forçar", intensity: "leve" },
          { day: "Ter 12", type: "Tiros 800m", desc: "4x800m a 2'32-2'35 desc 2'30 — reduzir 1 tiro vs semana normal", intensity: "forte" },
          { day: "Qua 13", type: "Longao",     desc: "10km pace 5'30/km — reduzir volume pré-prova", intensity: "leve" },
          { day: "Qui 14", type: "Progressivo",desc: "6km terminando a 3'15/km + 6 retas 100m — últimos estímulos fortes", intensity: "moderado" },
          { day: "Sex 15", type: "Leve",       desc: "20-25min bem leve 6'30/km + 4 retas 100m soltura — DESCANSO ATIVO", intensity: "leve" },
          { day: "Sab 16", type: "Descanso",   desc: "Descanso total — hidratação, alimentação, sono. Carb loading no jantar", intensity: "descanso" },
          { day: "Dom 17", type: "PROVA 5km",  desc: "🏁 Corrida do Time Brasil — META 16:20 ou menos · Aquec 15min antes", intensity: "forte" },
        ],
        startDate: "2026-05-11",
      },
    ],
  },
  {
    id: 2, name: "LIMIAR ANAERÓBICO", color: "#f0a500",
    period: "Jun-Jul 2026", goal: "Elevar pace sustentavel para 3'05-3'10/km",
    target5k: "15:50", targetSecs: 15 * 60 + 50,
    tip: "Os tiros de 1000m sao o nucleo desta fase. Foco em MANTER o pace do 1o ao 5o tiro.",
    weeks: [
      {
        label: "Semana 1 Junho",
        startDate: "2026-06-01",
        sessions: [
          { day: "Seg", type: "Longao",   desc: "16km pace 5'20/km", intensity: "leve" },
          { day: "Ter", type: "1000m",    desc: "5x1000m a 3'05 desc 3min", intensity: "forte" },
          { day: "Qua", type: "Grama",    desc: "50min + educativos", intensity: "leve" },
          { day: "Qui", type: "2000m",    desc: "3x2000m a 6'20 desc 4min", intensity: "forte" },
          { day: "Sex", type: "Forca",    desc: "Core + Pilates + pliometria", intensity: "moderado" },
          { day: "Sab", type: "Longao",   desc: "18km crescente saindo 5'30 ate 4'30", intensity: "moderado" },
          { day: "Dom", type: "Descanso", desc: "Recuperacao", intensity: "descanso" },
        ],
      },
    ],
  },
  {
    id: 3, name: "ESPECÍFICO PROVA", color: "#3dd68c",
    period: "Ago-Set 2026", goal: "Afinacao final — ritmo de prova 3'04/km",
    target5k: "15:20", targetSecs: 15 * 60 + 20,
    tip: "Confie no processo. Reduza volume, aumente qualidade. Tapering obrigatorio.",
    weeks: [
      {
        label: "Semana 1 Agosto",
        startDate: "2026-08-10",
        sessions: [
          { day: "Seg", type: "Longao",   desc: "14km pace 5'00/km", intensity: "leve" },
          { day: "Ter", type: "1000m",    desc: "5x1000m a 3'00-3'03 desc 3min", intensity: "forte" },
          { day: "Qua", type: "200m",     desc: "12x200m a 25-26s desc 90s", intensity: "forte" },
          { day: "Qui", type: "Simulado", desc: "5km a 3'08/km — sentir o ritmo da meta", intensity: "forte" },
          { day: "Sex", type: "Forca",    desc: "Core leve + Pilates", intensity: "leve" },
          { day: "Sab", type: "Longao",   desc: "12km pace 5'00/km", intensity: "leve" },
          { day: "Dom", type: "Descanso", desc: "Descanso total", intensity: "descanso" },
        ],
      },
    ],
  },
];

const INITIAL_LOGS = [
  { id: "l0", date: "2026-04-30", type: "Descanso", desc: "Dia de descanso", intensity: "descanso", fromCoach: false, result5k: "", notes: "", rpe: 1, sono: "bom", pernas: "leve", km: "0" },
  { id: "l1", date: "2026-05-01", type: "Prova 5km", desc: "5km Corrida do Trabalhador — Pista MUSAL", intensity: "forte", fromCoach: false, result5k: "16:43", notes: "FC média 152 / FC máx 163 / pace 3'25/km", rpe: 8, sono: "bom", pernas: "leve", km: "5" },
  { id: "l2", date: "2026-05-02", type: "Grama", desc: "Core pós-prova + regenerativo 30min esteira + 12x100m", intensity: "leve", fromCoach: true, result5k: "", notes: "", rpe: 3, sono: "bom", pernas: "leve", km: "5" },
  { id: "l3", date: "2026-05-03", type: "Regenerativo", desc: "15km a 6'29/km + 2.88km trote. HydraMaxi + Hydro Lift", intensity: "leve", fromCoach: true, result5k: "", notes: "", rpe: 4, sono: "bom", pernas: "normal", km: "17.88" },
  { id: "l4", date: "2026-05-06", type: "Progressivo", desc: "15.76km 1h10m36s — média 4'29/km. Saída 7'15 chegando a 2'58/km. Gel Fire pós-treino", intensity: "forte", fromCoach: true, result5k: "", notes: "", rpe: 8, sono: "bom", pernas: "normal", km: "18.26" },
  { id: "l5", date: "2026-05-07", type: "Academia", desc: "Grama + mobilidade, superior (avião, remada, flexão), core (prancha 3x40s, superman, pélvica, remador), agachamento 20kg 3x10, extras (panturrilha, glúteo elástico, passada gigante)", intensity: "moderado", fromCoach: true, result5k: "", notes: "Todos exercícios concluídos ✅", rpe: 5, sono: "bom", pernas: "leve", km: "4" },
  { id: "l6", date: "2026-05-13", type: "Tiros Específicos", desc: "Aquec: 5 voltas raia 1 + along + educativos + 4 retas 60m · Específico: 1000m+800m+600m+400m+200m · Desaq: progressivo 6.21km (29'33\")", intensity: "forte", fromCoach: true, result5k: "", notes: "1000m — 2'57\" (desc 4'18\") | 800m — 2'21\" (desc 6'42\") | 600m — 1'42\" (desc 6'40\") | 400m — 1'04\" (desc 3'29\") | 200m — 0'29\"", rpe: 9, sono: "bom", pernas: "normal", km: "12" },
];

// ── CORES ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#0a0c10", surface: "#111318", card: "#161a22", border: "#1e2430",
  accent: "#f0a500", green: "#3dd68c", blue: "#4ea8ff", red: "#e05c2e",
  pink: "#ec4899", purple: "#a855f7",
  muted: "#4a5568", text: "#e2e8f0", text2: "#94a3b8",
};

const baseCard = { background: C.card, border: "1px solid " + C.border, borderRadius: 12, padding: 16, marginBottom: 12 };
const baseInp  = { background: C.surface, border: "1px solid " + C.border, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 14, width: "100%", outline: "none", marginTop: 4, boxSizing: "border-box" };
const baseLbl  = { fontSize: 10, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", fontFamily: "monospace" };
const pill     = (c) => ({ display: "inline-block", padding: "2px 9px", borderRadius: 12, fontSize: 11, fontFamily: "monospace", background: c + "22", color: c, border: "1px solid " + c + "44" });
const pbar     = { height: 6, background: C.border, borderRadius: 4, overflow: "hidden", margin: "6px 0" };
const pfill    = (pct, col) => ({ height: "100%", width: pct + "%", background: col, borderRadius: 4, transition: "width 1s ease" });
const pbtn = (bg, color=C.text) => ({ background:bg, color, border:"1px solid "+(bg===C.border?C.border:bg+"66"), borderRadius:9, padding:"11px 14px", cursor:"pointer", fontWeight:800, fontSize:12, letterSpacing:.4 });

// ── COMPONENTS ─────────────────────────────────────────────────────────────
function Seg({ options, value, onChange, color }) {
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
      {options.map(o => {
        const active = value === o.value;
        const col = color || C.accent;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{ flex: 1, padding: "8px 4px", background: active ? col + "22" : C.surface, color: active ? col : C.text2, border: "1px solid " + (active ? col + "66" : C.border), borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400, transition: "all .15s" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RPESlider({ value, onChange }) {
  const rpeColor = value <= 3 ? C.green : value <= 6 ? C.accent : value <= 8 ? "#e08c2e" : C.red;
  const rpeLabel = value <= 3 ? "Muito Leve" : value <= 5 ? "Moderado" : value <= 7 ? "Dificil" : value <= 9 ? "Muito Dificil" : "Maximo";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={baseLbl}>Esforco Percebido (RPE)</span>
        <span style={{ fontWeight: 900, fontSize: 20, color: rpeColor, fontFamily: "monospace" }}>{value}</span>
      </div>
      <input type="range" min={1} max={10} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: rpeColor, height: 4, marginBottom: 4 }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
        <span>1 Leve</span>
        <span style={{ color: rpeColor, fontWeight: 700 }}>{rpeLabel}</span>
        <span>10 Max</span>
      </div>
    </div>
  );
}

function FatigueMeter({ score }) {
  const pct = Math.min(100, (score / 12) * 100);
  const col = score >= 8 ? C.red : score >= 6 ? C.accent : C.green;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.text2, marginBottom: 4 }}>
        <span>Fadiga Acumulada</span>
        <span style={{ color: col, fontWeight: 700 }}>{score.toFixed(1)} / 12</span>
      </div>
      <div style={pbar}><div style={pfill(pct, col)} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
        <span style={{ color: C.green }}>Descansado</span>
        <span style={{ color: C.accent }}>Moderado</span>
        <span style={{ color: C.red }}>Overtraining</span>
      </div>
    </div>
  );
}

// ── MENU PRINCIPAL ─────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { id: "corrida",     icon: "🏃", label: "Corrida",      sub: "Performance & Plano",  color: C.accent },
  { id: "alimentacao", icon: "🥗", label: "Alimentação",  sub: "Nutrição & Refeições", color: C.green },
  { id: "core",        icon: "💪", label: "Core",         sub: "Exercícios & Sessões", color: C.blue },
  { id: "academia",    icon: "🏋️", label: "Academia",     sub: "Musculação & Força",   color: C.pink },
  { id: "provas",      icon: "🏆", label: "Provas 2026",  sub: "Calendário & Tempos",  color: C.purple },
  { id: "treino-dia",  icon: "📋", label: "Treino do Dia",sub: "Sequência cronometrada",color: "#06b6d4" },
];

function HomeMenu({ onSelect }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
  const nextRace = new Date("2026-05-17");
  const daysLeft = Math.max(0, Math.ceil((nextRace - now) / (1000 * 60 * 60 * 24)));

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,-apple-system,sans-serif", padding: "0 0 40px" }}>
      {/* Hero */}
      <div style={{ padding: "28px 16px 20px", borderBottom: "1px solid " + C.border, marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 3, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 6 }}>{dateStr}</div>
        <div style={{ fontWeight: 900, fontSize: 28, lineHeight: 1.1, marginBottom: 8 }}>
          <span style={{ color: C.accent }}>RUN</span><span style={{ color: C.text }}>TARGET</span>
        </div>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>
          Seu painel completo de performance.<br/>
          <span style={{ color: C.green, fontWeight: 700 }}>Meta: 15:10–15:30</span> · Próxima prova: <span style={{ color: C.accent }}>17/05</span>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 16px", marginBottom: 20 }}>
        {[
          { label: "Melhor 5km", val: "16:43", col: C.accent },
          { label: "Pace médio", val: "3'25\"", col: C.blue },
          { label: "Dias p/ prova", val: String(daysLeft), col: C.green },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: s.col, fontFamily: "monospace" }}>{s.val}</div>
            <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Menu Grid */}
      <div style={{ padding: "0 16px" }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 12 }}>MÓDULOS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {MENU_ITEMS.map((item, i) => (
            <button key={item.id} onClick={() => onSelect(item.id)}
              style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 14, padding: "18px 14px", cursor: "pointer", textAlign: "left", transition: "all .2s", animation: `fadeUp .4s ease ${i * 0.06}s both` }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = item.color; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>{item.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{item.sub}</div>
              <div style={{ width: 24, height: 2, background: item.color, borderRadius: 2, marginTop: 10 }}></div>
            </button>
          ))}
        </div>
      </div>
      <style>{`@keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
}

// ── MÓDULO CORRIDA ─────────────────────────────────────────────────────────
function ModuloCorrida({ onBack }) {
  const [tab, setTab] = useState("dashboard");
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null); // {phaseIdx, weekIdx, sessionIdx}
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    type: "Treino do Professor",
    desc: "", intensity: "moderado", fromCoach: true,
    result5k: "", notes: "", rpe: 5, sono: "bom", pernas: "leve", km: "",
  });
  const [planSessions, setPlanSessions] = useState(() =>
    PHASES.map(ph => ph.weeks.map(wk => wk.sessions.map(s => ({ ...s }))))
  );

  useEffect(() => {
    (async () => {
      try {
        const r = await store.get("runtarget_v3");
        if (r && r.value) { const d = JSON.parse(r.value); if (Array.isArray(d) && d.length) setLogs(d); }
      } catch (_) {}
    })();
  }, []);

  const persist = useCallback(async (nl) => {
    try { await store.set("runtarget_v3", JSON.stringify(nl)); } catch (_) {}
  }, []);

  const races      = logs.filter(l => l.result5k && parseTime(l.result5k));
  const bestRace   = races.reduce((b, r) => (!b || parseTime(r.result5k) < parseTime(b.result5k)) ? r : b, null);
  const bestSecs   = bestRace ? parseTime(bestRace.result5k) : START_BEST;
  const progressPct = Math.min(100, Math.max(0, ((START_BEST - bestSecs) / (START_BEST - GOAL_MID)) * 100));
  const fatigueScore = getFatigueScore(logs);
  const dailyStatus  = getDailyStatus(logs);
  const smartAdj     = getSmartAdjustment(logs, races);
  const coachMsg     = getCoachMessage(logs);
  const predicted    = predictTime(logs, bestSecs);

  // ── KM ACUMULADO ───────────────────────────────────────────────────────
  const nowDate = new Date();
  const weekStart = new Date(nowDate);
  weekStart.setDate(nowDate.getDate() - ((nowDate.getDay() + 6) % 7));
  weekStart.setHours(0,0,0,0);
  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
  const getKm = (l) => parseFloat(l.km) || 0;
  const kmTotal  = logs.reduce((s, l) => s + getKm(l), 0);
  const kmMonth  = logs.filter(l => new Date(l.date + "T00:00:00") >= monthStart).reduce((s, l) => s + getKm(l), 0);
  const kmWeek   = logs.filter(l => new Date(l.date + "T00:00:00") >= weekStart).reduce((s, l) => s + getKm(l), 0);
  const KM_WEEK_REF  = 80;
  const KM_MONTH_REF = 300;
  const weekPct  = Math.min(100, (kmWeek  / KM_WEEK_REF)  * 100);
  const monthPct = Math.min(100, (kmMonth / KM_MONTH_REF) * 100);
  function getVolumeStatus(kmW) {
    if (kmW < 30)  return { label: "VOLUME BAIXO",    color: C.blue,   msg: "Aumentar gradualmente — atleta de alto nível precisa de base sólida" };
    if (kmW < 55)  return { label: "CONSTRUINDO",     color: C.blue,   msg: "Bom progresso — aumentar 10% por semana é o ideal" };
    if (kmW < 75)  return { label: "VOLUME MODERADO", color: C.accent, msg: "No caminho certo para atingir a meta 15:10" };
    if (kmW < 100) return { label: "VOLUME ALTO ✓",   color: C.green,  msg: "Excelente — volume de atleta competitivo. Garanta o descanso!" };
    return               { label: "VOLUME ELITE",    color: C.green,  msg: "Volume de elite! Monitorar sinais de fadiga de perto." };
  }
  const volStatus = getVolumeStatus(kmWeek);

  function getGoalStatus() {
    if (bestSecs <= GOAL_LOW)      return { label: "META ATINGIDA!", color: C.green };
    if (bestSecs <= GOAL_HIGH)     return { label: "MUITO PROXIMO!", color: C.green };
    if (bestSecs <= 15*60+50)      return { label: "QUASE LA",       color: C.green };
    if (bestSecs <= 16*60+10)      return { label: "NO CAMINHO",     color: C.accent };
    if (bestSecs <= 16*60+30)      return { label: "EVOLUINDO",      color: C.accent };
    return                                { label: "CONSTRUINDO BASE",color: C.blue };
  }
  const goalStatus = getGoalStatus();

  function addLog() {
    if (!form.desc && !form.result5k && !form.notes) return;
    let nl;
    if (editingId) {
      // Editing existing
      nl = logs.map(l => l.id === editingId ? { ...form, id: editingId } : l);
      setEditingId(null);
    } else {
      nl = [...logs, { ...form, id: "l" + Date.now() }].sort((a, b) => a.date.localeCompare(b.date));
    }
    setLogs(nl); persist(nl); setSaved(true);
    setForm({ date: new Date().toISOString().split("T")[0], type: "Treino do Professor", desc: "", intensity: "moderado", fromCoach: true, result5k: "", notes: "", rpe: 5, sono: "bom", pernas: "leve", km: "" });
    setTimeout(() => setSaved(false), 3000);
  }

  function startEdit(l) {
    setForm({ ...l });
    setEditingId(l.id);
    setTab("registrar");
    window.scrollTo(0, 0);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ date: new Date().toISOString().split("T")[0], type: "Treino do Professor", desc: "", intensity: "moderado", fromCoach: true, result5k: "", notes: "", rpe: 5, sono: "bom", pernas: "leve", km: "" });
  }

  function updatePlanSession(phIdx, wkIdx, sIdx, field, value) {
    setPlanSessions(prev => {
      const next = prev.map(ph => ph.map(wk => wk.map(s => ({ ...s }))));
      next[phIdx][wkIdx][sIdx][field] = value;
      return next;
    });
  }

  function delLog(id) { const nl = logs.filter(l => l.id !== id); setLogs(nl); persist(nl); }
  function upForm(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "plano",     label: "Plano" },
    { id: "registrar", label: "+ Registrar" },
    { id: "historico", label: "Histórico" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,-apple-system,sans-serif", fontSize: 14 }}>
      {/* HEADER */}
      <div style={{ background: C.surface, borderBottom: "1px solid " + C.border, padding: "12px 16px 0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 20, padding: "0 4px 0 0", lineHeight: 1 }}>←</button>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              <span style={{ color: C.accent }}>🏃</span> <span style={{ color: C.text }}>CORRIDA</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: dailyStatus.color, fontWeight: 700 }}>{dailyStatus.status}</span>
            <div style={{ background: "rgba(240,165,0,0.12)", border: "1px solid rgba(240,165,0,0.3)", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: C.accent, fontFamily: "monospace" }}>
              15:10–15:30
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id}
              style={{ padding: "8px 12px", background: tab === t.id ? C.accent : "transparent", color: tab === t.id ? "#000" : C.text2, border: "none", borderRadius: "6px 6px 0 0", cursor: "pointer", fontWeight: tab === t.id ? 700 : 400, fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 600, margin: "0 auto", paddingBottom: 40 }}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <div>
            {/* Coach Alert */}
            <div style={{ ...baseCard, borderLeft: "3px solid " + coachMsg.color, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 24 }}>{coachMsg.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: coachMsg.color, fontSize: 13 }}>Coach IA</div>
                <div style={{ color: C.text2, fontSize: 13 }}>{coachMsg.msg}</div>
              </div>
            </div>

            {/* Status do Dia */}
            <div style={{ ...baseCard, background: dailyStatus.color + "11", borderColor: dailyStatus.color + "44" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ ...baseLbl }}>Status de Hoje</span>
                <span style={{ ...pill(dailyStatus.color) }}>{dailyStatus.status}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text2 }}>{dailyStatus.action}</div>
            </div>

            {/* Meta */}
            <div style={baseCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.accent }}>META 5KM</span>
                <span style={{ ...pill(goalStatus.color) }}>{goalStatus.label}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.text2, marginBottom: 6 }}>
                <span>Melhor: <strong style={{ color: C.text }}>{fmtTime(bestSecs)}</strong></span>
                <span>Meta: <strong style={{ color: C.green }}>15:10–15:30</strong></span>
              </div>
              <div style={pbar}><div style={pfill(progressPct, C.accent)} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
                <span>{fmtTime(START_BEST)} (início)</span>
                <span style={{ color: C.accent, fontWeight: 700 }}>{progressPct.toFixed(0)}% concluído</span>
                <span>{fmtTime(GOAL_MID)} (meta)</span>
              </div>
            </div>

            {/* Fadiga */}
            <div style={baseCard}>
              <FatigueMeter score={fatigueScore} />
            </div>

            {/* Volume KM */}
            <div style={{ ...baseCard, borderLeft: "3px solid " + volStatus.color }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: volStatus.color }}>📍 VOLUME ACUMULADO</span>
                <span style={{ ...pill(volStatus.color) }}>{volStatus.label}</span>
              </div>

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "Esta semana", val: kmWeek.toFixed(1), unit: "km", col: volStatus.color, pct: weekPct, ref: KM_WEEK_REF },
                  { label: "Este mês",    val: kmMonth.toFixed(1), unit: "km", col: C.accent, pct: monthPct, ref: KM_MONTH_REF },
                  { label: "Total 2026",  val: kmTotal.toFixed(1), unit: "km", col: C.blue, pct: null },
                ].map(s => (
                  <div key={s.label} style={{ background: C.surface, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.col, fontFamily: "monospace", lineHeight: 1 }}>{s.val}</div>
                    <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 2, marginBottom: s.pct != null ? 5 : 0 }}>{s.label}</div>
                    {s.pct != null && (
                      <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: s.pct + "%", background: s.col, borderRadius: 2, transition: "width 1s ease" }} />
                      </div>
                    )}
                    {s.pct != null && <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{s.pct.toFixed(0)}% de {s.ref}km</div>}
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>{volStatus.msg}</div>

              {/* Distribuição por intensidade */}
              {(() => {
                const semana = logs.filter(l => new Date(l.date + "T00:00:00") >= weekStart);
                const byInt = { leve: 0, moderado: 0, forte: 0 };
                semana.forEach(l => { if (byInt[l.intensity] !== undefined) byInt[l.intensity] += getKm(l); });
                const total = Object.values(byInt).reduce((a,b) => a+b, 0);
                if (!total) return null;
                return (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase" }}>Distribuição semanal</div>
                    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 }}>
                      {Object.entries(byInt).map(([k, v]) => v > 0 && (
                        <div key={k} style={{ flex: v, background: INT_COLOR[k], transition: "flex 0.5s ease" }} title={k + ": " + v.toFixed(1) + "km"} />
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
                      {Object.entries(byInt).map(([k, v]) => v > 0 && (
                        <span key={k} style={{ fontSize: 10, color: INT_COLOR[k] }}>{k}: {v.toFixed(1)}km</span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Ajuste Inteligente */}
            <div style={{ ...baseCard, borderLeft: "3px solid " + smartAdj.color }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ ...baseLbl }}>Ajuste Inteligente</span>
                <span style={{ ...pill(smartAdj.color) }}>{smartAdj.label}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text2 }}>{smartAdj.msg}</div>
            </div>

            {/* Previsão */}
            <div style={baseCard}>
              <div style={{ ...baseLbl, marginBottom: 8 }}>Previsão Próxima Prova</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: C.blue, fontFamily: "monospace", textAlign: "center" }}>
                {fmtTime(predicted)}
              </div>
              <div style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 4 }}>
                baseado nos últimos treinos
              </div>
            </div>

            {/* Fases */}
            <div style={baseCard}>
              <div style={{ ...baseLbl, marginBottom: 10 }}>Fases do Plano</div>
              {PHASES.map((ph, i) => (
                <div key={ph.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < PHASES.length - 1 ? "1px solid " + C.border : "none" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: ph.color, flexShrink: 0 }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: ph.color }}>{ph.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{ph.period} · Meta: {ph.target5k}</div>
                  </div>
                  <span style={{ fontSize: 11, color: C.text2 }}>{ph.target5k}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PLANO ── */}
        {tab === "plano" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
              {PHASES.map((ph, i) => (
                <button key={ph.id} onClick={() => setPhaseIdx(i)}
                  style={{ padding: "8px 14px", background: phaseIdx === i ? ph.color + "22" : C.surface, color: phaseIdx === i ? ph.color : C.text2, border: "1px solid " + (phaseIdx === i ? ph.color + "66" : C.border), borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: phaseIdx === i ? 700 : 400, whiteSpace: "nowrap", flexShrink: 0 }}>
                  Fase {ph.id}
                </button>
              ))}
            </div>

            {(() => {
              const ph = PHASES[phaseIdx];
              return (
                <div>
                  <div style={{ ...baseCard, borderLeft: "3px solid " + ph.color }}>
                    <div style={{ fontWeight: 900, fontSize: 16, color: ph.color, marginBottom: 4 }}>{ph.name}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{ph.period} · Meta: {ph.target5k}</div>
                    <div style={{ fontSize: 13, color: C.text2, marginBottom: 8 }}>{ph.goal}</div>
                    <div style={{ background: ph.color + "11", border: "1px solid " + ph.color + "33", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.text2 }}>
                      💡 {ph.tip}
                    </div>
                  </div>

                  {ph.weeks.map((wk, wi) => {
                    const wkStart = wk.startDate ? new Date(wk.startDate + "T00:00:00") : null;
                    const wkEnd = wkStart ? new Date(wkStart.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
                    const today = new Date();
                    const isPast = wkEnd && wkEnd < today;
                    const isCurrent = wkStart && wkEnd && today >= wkStart && today < wkEnd;
                    if (isPast) return null; // hide past weeks
                    return (
                    <div key={wi} style={{ ...baseCard, borderLeft: isCurrent ? "3px solid " + ph.color : "1px solid " + C.border }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: isCurrent ? ph.color : C.text }}>{wk.label}</div>
                        {isCurrent && <span style={{ ...pill(ph.color), fontSize: 9 }}>SEMANA ATUAL</span>}
                      </div>
                      {(planSessions[phaseIdx]?.[wi] || wk.sessions).map((s, si) => {
                        const isEditing = editingPlan?.phaseIdx === phaseIdx && editingPlan?.weekIdx === wi && editingPlan?.sessionIdx === si;
                        const todayDay = new Date().getDate();
                        const sessionDay = parseInt(s.day.split(" ")[1]);
                        const isToday = isCurrent && !isNaN(sessionDay) && sessionDay === todayDay;
                        return (
                          <div key={si} style={{ padding: "10px 0", borderBottom: si < wk.sessions.length - 1 ? "1px solid " + C.border : "none", background: isToday ? INT_COLOR[s.intensity] + "08" : "transparent", borderRadius: isToday ? 8 : 0, paddingLeft: isToday ? 8 : 0 }}>
                            {isToday && !isEditing && <div style={{ fontSize: 9, color: INT_COLOR[s.intensity], fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>👉 HOJE</div>}
                            {isEditing ? (
                              // Edit mode
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                  <div>
                                    <div style={baseLbl}>Tipo</div>
                                    <input value={s.type} onChange={e => updatePlanSession(phaseIdx, wi, si, "type", e.target.value)}
                                      style={{ ...baseInp, fontSize: 12, padding: "6px 10px" }} />
                                  </div>
                                  <div>
                                    <div style={baseLbl}>Intensidade</div>
                                    <select value={s.intensity} onChange={e => updatePlanSession(phaseIdx, wi, si, "intensity", e.target.value)}
                                      style={{ ...baseInp, fontSize: 12, padding: "6px 10px" }}>
                                      {["leve","moderado","forte","descanso"].map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <div style={baseLbl}>Descrição</div>
                                  <input value={s.desc} onChange={e => updatePlanSession(phaseIdx, wi, si, "desc", e.target.value)}
                                    style={{ ...baseInp, fontSize: 12, padding: "6px 10px" }} />
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => setEditingPlan(null)}
                                    style={{ flex: 1, padding: "7px", background: ph.color, color: "#000", border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                                    ✓ Salvar
                                  </button>
                                  <button onClick={() => setEditingPlan(null)}
                                    style={{ padding: "7px 14px", background: C.surface, color: C.muted, border: "1px solid " + C.border, borderRadius: 7, fontSize: 12, cursor: "pointer" }}>
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // View mode
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 32, fontSize: 10, fontWeight: 700, color: INT_COLOR[s.intensity], fontFamily: "monospace", flexShrink: 0, textAlign: "center", background: INT_COLOR[s.intensity] + "18", borderRadius: 5, padding: "3px 4px" }}>{s.day}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{s.type}</div>
                                  <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{s.desc}</div>
                                </div>
                                <button onClick={() => setEditingPlan({ phaseIdx, weekIdx: wi, sessionIdx: si })}
                                  style={{ background: "none", border: "1px solid " + C.border, borderRadius: 6, padding: "3px 8px", color: C.muted, cursor: "pointer", fontSize: 11 }}>
                                  ✏️
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── REGISTRAR ── */}
        {tab === "registrar" && (
          <div>
            {saved && (
              <div style={{ background: C.green + "18", border: "1px solid " + C.green + "44", borderRadius: 10, padding: "12px 16px", marginBottom: 14, color: C.green, fontWeight: 700, textAlign: "center" }}>
                ✓ {editingId ? "Treino atualizado!" : "Treino salvo!"}
              </div>
            )}
            <div style={baseCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: editingId ? C.blue : C.accent, textTransform: "uppercase", letterSpacing: 1 }}>
                  {editingId ? "✏️ Editando Treino" : "+ Registrar Treino"}
                </div>
                {editingId && (
                  <button onClick={cancelEdit} style={{ background: "none", border: "1px solid " + C.border, borderRadius: 6, padding: "4px 10px", color: C.muted, cursor: "pointer", fontSize: 12 }}>
                    Cancelar
                  </button>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={baseLbl}>Data</div>
                  <input type="date" value={form.date} onChange={e => upForm("date", e.target.value)} style={baseInp} />
                </div>
                <div>
                  <div style={baseLbl}>Tipo</div>
                  <select value={form.type} onChange={e => upForm("type", e.target.value)} style={baseInp}>
                    {["Treino do Professor","Prova 5km","Longao","Tiros 1000m","Tiros 400m","Tiros 200m","Fartlek","Grama","Progressivo","Academia","Descanso","Outro"].map(t => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={baseLbl}>Intensidade</div>
                <Seg options={[{value:"leve",label:"Leve"},{value:"moderado",label:"Moderado"},{value:"forte",label:"Forte"},{value:"descanso",label:"Descanso"}]}
                  value={form.intensity} onChange={v => upForm("intensity", v)} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={baseLbl}>Descrição do Treino</div>
                <input value={form.desc} onChange={e => upForm("desc", e.target.value)} placeholder="Ex: 5x1000m a 3'10/km, desc 3min..." style={baseInp} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={baseLbl}>Resultado 5km (se prova)</div>
                  <input value={form.result5k} onChange={e => upForm("result5k", e.target.value)} placeholder="Ex: 16:43" style={baseInp} />
                </div>
                <div>
                  <div style={baseLbl}>Distância (km)</div>
                  <input type="number" step="0.01" min="0" value={form.km} onChange={e => upForm("km", e.target.value)} placeholder="Ex: 15.76" style={baseInp} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={baseLbl}>Observações</div>
                <input value={form.notes} onChange={e => upForm("notes", e.target.value)} placeholder="Ex: vento, dor, PR..." style={baseInp} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <RPESlider value={form.rpe} onChange={v => upForm("rpe", v)} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={baseLbl}>Como estavam as pernas</div>
                  <Seg options={[{value:"leve",label:"Leves"},{value:"normal",label:"Normal"},{value:"pesada",label:"Pesadas"}]}
                    value={form.pernas} onChange={v => upForm("pernas", v)} color={C.blue} />
                </div>
                <div>
                  <div style={baseLbl}>Sono</div>
                  <Seg options={[{value:"bom",label:"Bom"},{value:"medio",label:"Médio"},{value:"ruim",label:"Ruim"}]}
                    value={form.sono} onChange={v => upForm("sono", v)} color={C.purple} />
                </div>
              </div>

              <button onClick={addLog}
                style={{ width: "100%", padding: 12, background: editingId ? C.blue : C.accent, color: "#000", border: "none", borderRadius: 10, fontWeight: 900, fontSize: 14, cursor: "pointer", letterSpacing: 1 }}>
                {editingId ? "✏️ ATUALIZAR TREINO" : "SALVAR TREINO"}
              </button>
            </div>
          </div>
        )}

        {/* ── HISTÓRICO ── */}
        {tab === "historico" && (
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, fontFamily: "monospace" }}>
              {logs.length} treinos registrados
            </div>
            {[...logs].reverse().map(l => (
              <div key={l.id} style={{ ...baseCard, borderLeft: "3px solid " + (INT_COLOR[l.intensity] || C.muted) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{l.date}</span>
                    <span style={{ marginLeft: 8, ...pill(INT_COLOR[l.intensity] || C.muted) }}>{l.type}</span>
                    {l.fromCoach && <span style={{ marginLeft: 4, ...pill(C.blue) }}>Prof.</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => startEdit(l)}
                      style={{ background: C.blue + "18", border: "1px solid " + C.blue + "33", borderRadius: 6, padding: "3px 9px", color: C.blue, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                      ✏️
                    </button>
                    <button onClick={() => delLog(l.id)}
                      style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
                  </div>
                </div>
                {l.result5k && (
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.green, fontFamily: "monospace", marginBottom: 4 }}>
                    🏁 {l.result5k}
                  </div>
                )}
                <div style={{ fontSize: 13, color: C.text2, marginBottom: l.notes ? 4 : 0 }}>{l.desc}</div>
                {l.notes && <div style={{ fontSize: 12, color: C.muted }}>{l.notes}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {l.km && parseFloat(l.km) > 0 && <span style={{ fontSize: 11, color: C.text2 }}>📍 <strong style={{ color: C.accent }}>{parseFloat(l.km).toFixed(2)}km</strong></span>}
                  {l.rpe && <span style={{ fontSize: 11, color: C.text2 }}>RPE: <strong style={{ color: l.rpe >= 8 ? C.red : l.rpe >= 6 ? C.accent : C.green }}>{l.rpe}</strong></span>}
                  {l.pernas && <span style={{ fontSize: 11, color: C.text2 }}>Pernas: <strong>{l.pernas}</strong></span>}
                  {l.sono && <span style={{ fontSize: 11, color: C.text2 }}>Sono: <strong>{l.sono}</strong></span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MÓDULO HEADER ──────────────────────────────────────────────────────────
function ModHeader({ id, onBack, tabs, activeTab, setTab }) {
  const item = MENU_ITEMS.find(m => m.id === id);
  if (!item) return null;
  return (
    <div style={{ background: C.surface, borderBottom: "1px solid " + C.border, padding: "12px 16px 0", position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: item.color, cursor: "pointer", fontSize: 20, padding: "0 4px 0 0" }}>←</button>
        <span style={{ fontSize: 18 }}>{item.icon}</span>
        <span style={{ fontWeight: 900, fontSize: 17, color: C.text }}>{item.label.toUpperCase()}</span>
      </div>
      {tabs && (
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "8px 12px", background: activeTab === t.id ? item.color : "transparent", color: activeTab === t.id ? "#000" : C.text2, border: "none", borderRadius: "6px 6px 0 0", cursor: "pointer", fontWeight: activeTab === t.id ? 700 : 400, fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MÓDULO ALIMENTAÇÃO ─────────────────────────────────────────────────────
const PLANO_ALIM = {
  macros: { prot: "~180g/dia (2g/kg)", carb: "~220g ciclado", gord: "~65g boas fontes" },
  calorias: { manha: "~2200 kcal", tarde: "~2300 kcal", descanso: "~1800 kcal" },
  timing: [
    { momento: "Café da manhã", desc: "Proteína + carboidrato complexo + fruta" },
    { momento: "Pré-treino (30-45min)", desc: "Banana + café preto (~100 kcal)" },
    { momento: "Pós-treino (30min)", desc: "3 ovos + pão integral + abacate + fruta (~550 kcal)" },
    { momento: "Almoço", desc: "Proteína + arroz/batata + legumes + salada" },
    { momento: "Jantar", desc: "Proteína leve + carboidrato moderado" },
    { momento: "Véspera de prova", desc: "Carb loading — massa/arroz + frango (~680 kcal)" },
  ],
  suplementos: [
    { nome: "Creatina", dose: "3–5g/dia", quando: "Qualquer hora", cor: C.blue },
    { nome: "Vit D3", dose: "2000 UI", quando: "Com refeição gordurosa", cor: C.accent },
    { nome: "Magnésio", dose: "300mg", quando: "Antes de dormir", cor: C.purple },
    { nome: "Ômega 3", dose: "2–3g", quando: "Com refeição", cor: C.green },
    { nome: "Cafeína", dose: "3mg/kg", quando: "45-60min antes de provas", cor: C.red },
    { nome: "HydraMaxi", dose: "1 sachê", quando: "Durante treinos longos", cor: "#06b6d4" },
    { nome: "Hydro Lift", dose: "1 sachê", quando: "Pós-treino longo", cor: "#8b5cf6" },
    { nome: "Gel Fire", dose: "1 gel (30g)", quando: "Durante/pós treino intenso", cor: C.red },
  ],
};

function ModuloAlimentacao({ onBack }) {
  const [tab, setTab] = useState("plano");
  const [logs, setLogs] = useState([]);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], refeicao: "Café da manhã", alimentos: "", agua: "", contexto: "Dia normal", notas: "" });

  useEffect(() => { (async () => { try { const r = await store.get("nutr_logs"); if (r?.value) setLogs(JSON.parse(r.value)); } catch(_){} })(); }, []);
  const persist = async (nl) => { try { await store.set("nutr_logs", JSON.stringify(nl)); } catch(_){} };

  function addLog() {
    if (!form.alimentos) return;
    const nl = [{ ...form, id: "n" + Date.now() }, ...logs];
    setLogs(nl); persist(nl); setSaved(true);
    setForm({ date: new Date().toISOString().split("T")[0], refeicao: "Café da manhã", alimentos: "", agua: "", contexto: "Dia normal", notas: "" });
    setTimeout(() => setSaved(false), 2500);
  }

  const TABS = [{ id: "plano", label: "Plano" }, { id: "registrar", label: "+ Registrar" }, { id: "historico", label: "Histórico" }, { id: "suplementos", label: "Suplementos" }];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,-apple-system,sans-serif", fontSize: 14, paddingBottom: 40 }}>
      <ModHeader id="alimentacao" onBack={onBack} tabs={TABS} activeTab={tab} setTab={setTab} />
      <div style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>

        {tab === "plano" && (
          <div>
            <div style={baseCard}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Macros Diários</div>
              {[["🥩 Proteína", PLANO_ALIM.macros.prot, C.red], ["🍚 Carboidrato", PLANO_ALIM.macros.carb, C.accent], ["🥑 Gordura", PLANO_ALIM.macros.gord, C.green]].map(([k, v, c]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + C.border, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: C.text2 }}>{k}</span>
                  <span style={{ fontWeight: 700, color: c, fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={baseCard}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Calorias por Tipo de Dia</div>
              {[["☀️ Treino manhã", PLANO_ALIM.calorias.manha], ["🌙 Treino tarde", PLANO_ALIM.calorias.tarde], ["💤 Descanso", PLANO_ALIM.calorias.descanso]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + C.border }}>
                  <span style={{ fontSize: 13, color: C.text2 }}>{k}</span>
                  <span style={{ fontWeight: 700, color: C.text }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={baseCard}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Timing das Refeições</div>
              {PLANO_ALIM.timing.map((t, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: i < PLANO_ALIM.timing.length - 1 ? "1px solid " + C.border : "none" }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: C.green, marginBottom: 3 }}>{t.momento}</div>
                  <div style={{ fontSize: 12, color: C.text2 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "registrar" && (
          <div>
            {saved && <div style={{ background: C.green + "18", border: "1px solid " + C.green + "44", borderRadius: 10, padding: 12, marginBottom: 12, color: C.green, fontWeight: 700, textAlign: "center" }}>✓ Refeição salva!</div>}
            <div style={baseCard}>
              <div style={{ fontWeight: 700, color: C.green, fontSize: 13, marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>+ Registrar Refeição</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><div style={baseLbl}>Data</div><input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} style={baseInp} /></div>
                <div><div style={baseLbl}>Refeição</div>
                  <select value={form.refeicao} onChange={e => setForm(f => ({...f, refeicao: e.target.value}))} style={baseInp}>
                    {["Café da manhã","Pré-treino","Pós-treino","Almoço","Lanche","Jantar","Véspera de prova"].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}><div style={baseLbl}>O que comeu</div><textarea value={form.alimentos} onChange={e => setForm(f => ({...f, alimentos: e.target.value}))} placeholder="Ex: 3 ovos mexidos, pão integral, banana, café..." style={{ ...baseInp, resize: "none", height: 70 }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><div style={baseLbl}>Água (litros)</div><input value={form.agua} onChange={e => setForm(f => ({...f, agua: e.target.value}))} placeholder="ex: 2.5L" style={baseInp} /></div>
                <div><div style={baseLbl}>Contexto</div>
                  <select value={form.contexto} onChange={e => setForm(f => ({...f, contexto: e.target.value}))} style={baseInp}>
                    {["Dia normal","Pré-prova","Pós-prova","Descanso"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}><div style={baseLbl}>Observações</div><input value={form.notas} onChange={e => setForm(f => ({...f, notas: e.target.value}))} placeholder="Ex: comi rápido, estava com fome..." style={baseInp} /></div>
              <button onClick={addLog} style={{ width: "100%", padding: 12, background: C.green, color: "#000", border: "none", borderRadius: 10, fontWeight: 900, fontSize: 14, cursor: "pointer" }}>SALVAR REFEIÇÃO</button>
            </div>
          </div>
        )}

        {tab === "historico" && (
          <div>
            {!logs.length && <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Nenhuma refeição registrada ainda.</div>}
            {logs.map(l => (
              <div key={l.id} style={{ ...baseCard, borderLeft: "3px solid " + C.green }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div><span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{l.date}</span><span style={{ marginLeft: 8, ...pill(C.green) }}>{l.refeicao}</span>{l.contexto !== "Dia normal" && <span style={{ marginLeft: 4, ...pill(C.accent) }}>{l.contexto}</span>}</div>
                  <button onClick={() => { const nl = logs.filter(x => x.id !== l.id); setLogs(nl); persist(nl); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
                <div style={{ fontSize: 13, color: C.text2, marginBottom: 4 }}>{l.alimentos}</div>
                {l.agua && <div style={{ fontSize: 12, color: C.blue }}>💧 {l.agua}</div>}
                {l.notas && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{l.notas}</div>}
              </div>
            ))}
          </div>
        )}

        {tab === "suplementos" && (
          <div>
            <div style={{ ...baseCard, background: C.accent + "0a", borderColor: C.accent + "33", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>Protocolo ativo de suplementação para corrida de alta performance.</div>
            </div>
            {PLANO_ALIM.suplementos.map((s, i) => (
              <div key={i} style={{ ...baseCard, borderLeft: "3px solid " + s.cor }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: s.cor, marginBottom: 4 }}>{s.nome}</div>
                    <div style={{ fontSize: 13, color: C.text2 }}>{s.quando}</div>
                  </div>
                  <span style={{ ...pill(s.cor), fontWeight: 900 }}>{s.dose}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MÓDULO CORE ────────────────────────────────────────────────────────────
const CORE_DEFAULT = ["Prancha baixa","Prancha lateral","Elev. pélvica","Superman","ABS rotação","ABS remador","Avião unilateral","Prancha+rotação","Elástico","Barra fixa","Burpees"];
const CORE_PROTOCOLO = [
  { bloco: "🔵 Estabilidade", cor: C.blue, exercicios: [{ nome: "Prancha baixa", series: "3x", carga: "45s" }, { nome: "Prancha lateral", series: "2x", carga: "30s cada lado" }, { nome: "Elevação pélvica", series: "3x", carga: "15 reps" }] },
  { bloco: "🟠 Potência", cor: C.accent, exercicios: [{ nome: "ABS rotação + 5kg", series: "3x", carga: "10 reps" }, { nome: "Elev. pernas elástico", series: "3x", carga: "15 reps cada" }, { nome: "Superman estático", series: "3x", carga: "30s" }] },
  { bloco: "🔴 Anti-rotação", cor: C.red, exercicios: [{ nome: "Prancha + rotação", series: "2x", carga: "8 reps" }, { nome: "Avião unilateral", series: "2x", carga: "10 reps cada" }, { nome: "ABS remador", series: "3x", carga: "20 reps" }] },
];

function ModuloCore({ onBack }) {
  const [tab, setTab] = useState("protocolo");
  const [logs, setLogs] = useState([]);
  const [saved, setSaved] = useState(false);
  const [exList, setExList] = useState(CORE_DEFAULT);
  const [newEx, setNewEx] = useState("");
  const [checked, setChecked] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], duracao: "20 min", notas: "" });

  useEffect(() => { (async () => { try { const r = await store.get("core_logs"); if (r?.value) setLogs(JSON.parse(r.value)); const e = await store.get("core_exlist"); if (e?.value) setExList(JSON.parse(e.value)); } catch(_){} })(); }, [tab]);
  const persist = async (nl) => { try { await store.set("core_logs", JSON.stringify(nl)); } catch(_){} };

  function addEx() {
    if (!newEx.trim() || exList.includes(newEx.trim())) return;
    const nl = [...exList, newEx.trim()];
    setExList(nl); setNewEx("");
    try { store.set("core_exlist", JSON.stringify(nl)); } catch(_){}
  }
  function toggleEx(ex) { setChecked(c => c.includes(ex) ? c.filter(x => x !== ex) : [...c, ex]); }

  function addLog() {
    if (!checked.length) return;
    const nl = [{ ...form, exercicios: [...checked], id: "c" + Date.now() }, ...logs];
    setLogs(nl); persist(nl); setSaved(true); setChecked([]);
    setTimeout(() => setSaved(false), 2500);
  }

  const TABS = [{ id: "protocolo", label: "Protocolo" }, { id: "registrar", label: "+ Sessão" }, { id: "historico", label: "Histórico" }];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,-apple-system,sans-serif", fontSize: 14, paddingBottom: 40 }}>
      <ModHeader id="core" onBack={onBack} tabs={TABS} activeTab={tab} setTab={setTab} />
      <div style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>

        {tab === "protocolo" && (
          <div>
            <div style={{ ...baseCard, background: C.blue + "0a", borderColor: C.blue + "33", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>⚡ <strong style={{ color: C.text }}>2x por semana</strong> nos dias de grama ou treino leve. Core forte = menos oscilação = economia nos tiros.</div>
            </div>
            {CORE_PROTOCOLO.map((bloco, bi) => (
              <div key={bi} style={{ ...baseCard, borderLeft: "3px solid " + bloco.cor }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: bloco.cor, marginBottom: 12 }}>{bloco.bloco}</div>
                {bloco.exercicios.map((ex, ei) => (
                  <div key={ei} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: ei < bloco.exercicios.length - 1 ? "1px solid " + C.border : "none" }}>
                    <div style={{ fontSize: 13, color: C.text }}>{ex.nome}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ ...pill(bloco.cor) }}>{ex.series}</span>
                      <span style={{ ...pill(C.muted) }}>{ex.carga}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ ...baseCard, borderColor: C.border }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Descanso entre exercícios</div>
              <div style={{ fontSize: 13, color: C.text2 }}>Entre exercícios do mesmo bloco: <strong style={{ color: C.text }}>45s</strong><br />Entre blocos: <strong style={{ color: C.text }}>2 minutos</strong></div>
            </div>
          </div>
        )}

        {tab === "registrar" && (
          <div>
            {saved && <div style={{ background: C.blue + "18", border: "1px solid " + C.blue + "44", borderRadius: 10, padding: 12, marginBottom: 12, color: C.blue, fontWeight: 700, textAlign: "center" }}>✓ Sessão salva!</div>}
            <div style={baseCard}>
              <div style={{ fontWeight: 700, color: C.blue, fontSize: 13, marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>+ Registrar Sessão de Core</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div><div style={baseLbl}>Data</div><input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} style={baseInp} /></div>
                <div><div style={baseLbl}>Duração</div>
                  <select value={form.duracao} onChange={e => setForm(f => ({...f, duracao: e.target.value}))} style={baseInp}>
                    {["10 min","15 min","20 min","30 min","45 min"].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={baseLbl}>Exercícios feitos</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {exList.map(ex => (
                    <button key={ex} onClick={() => toggleEx(ex)}
                      style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: checked.includes(ex) ? 700 : 400, background: checked.includes(ex) ? C.blue + "22" : C.surface, color: checked.includes(ex) ? C.blue : C.text2, border: "1px solid " + (checked.includes(ex) ? C.blue + "66" : C.border), transition: "all .15s" }}>
                      {checked.includes(ex) ? "✓ " : ""}{ex}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input value={newEx} onChange={e => setNewEx(e.target.value)} onKeyDown={e => e.key === "Enter" && addEx()} placeholder="Adicionar exercício..." style={{ ...baseInp, marginTop: 0, flex: 1 }} />
                <button onClick={addEx} style={{ padding: "9px 14px", background: C.blue, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ ADD</button>
              </div>
              <div style={{ marginBottom: 12 }}><div style={baseLbl}>Observações</div><input value={form.notas} onChange={e => setForm(f => ({...f, notas: e.target.value}))} placeholder="ex: lombar doendo, avião difícil..." style={baseInp} /></div>
              <button onClick={addLog} style={{ width: "100%", padding: 12, background: C.blue, color: "#fff", border: "none", borderRadius: 10, fontWeight: 900, fontSize: 14, cursor: "pointer" }}>SALVAR SESSÃO</button>
            </div>
          </div>
        )}

        {tab === "historico" && (
          <div>
            {!logs.length && <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Nenhuma sessão registrada ainda.</div>}
            {logs.map(l => (
              <div key={l.id} style={{ ...baseCard, borderLeft: "3px solid " + (l.fromTreinoDia ? "#06b6d4" : C.blue) }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{l.date}</span>
                    <span style={{ marginLeft: 8, ...pill(l.fromTreinoDia ? "#06b6d4" : C.blue) }}>{l.fromTreinoDia ? "📋 Treino do Dia" : (l.duracao || l.tag)}</span>
                  </div>
                  <button onClick={() => { const nl = logs.filter(x => x.id !== l.id); setLogs(nl); persist(nl); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
                {l.exercicios?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: l.notas ? 8 : 0 }}>
                    {l.exercicios.map(ex => <span key={ex} style={{ ...pill(C.blue), fontSize: 11 }}>{ex}</span>)}
                  </div>
                )}
                {l.body && <div style={{ fontSize: 13, color: C.text2, marginBottom: 4 }}>{l.body}</div>}
                {l.notas && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{l.notas}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MÓDULO ACADEMIA ────────────────────────────────────────────────────────
const GYM_DEFAULT = ["Agachamento","Avanço/Afundo","Búlgaro","Salto na caixa","Elev. pélvica","Leg press","Esteira","Escadas","Natação","Pilates","Avião c/ halter","Rosca direta","Supino","Remada","Puxada","Panturrilha","Glúteo elástico","Passada gigante","Flexão"];

function ModuloAcademia({ onBack }) {
  const [tab, setTab] = useState("registrar");
  const [logs, setLogs] = useState([]);
  const [saved, setSaved] = useState(false);
  const [exList, setExList] = useState(GYM_DEFAULT);
  const [newEx, setNewEx] = useState("");
  const [checked, setChecked] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], foco: "Full Body", carga: "", duracao: "45 min", notas: "" });

  useEffect(() => { (async () => { try { const r = await store.get("gym_logs"); if (r?.value) setLogs(JSON.parse(r.value)); const e = await store.get("gym_exlist"); if (e?.value) setExList(JSON.parse(e.value)); } catch(_){} })(); }, [tab]);
  const persist = async (nl) => { try { await store.set("gym_logs", JSON.stringify(nl)); } catch(_){} };

  function addEx() {
    if (!newEx.trim() || exList.includes(newEx.trim())) return;
    const nl = [...exList, newEx.trim()];
    setExList(nl); setNewEx("");
    try { store.set("gym_exlist", JSON.stringify(nl)); } catch(_){}
  }
  function toggleEx(ex) { setChecked(c => c.includes(ex) ? c.filter(x => x !== ex) : [...c, ex]); }

  function addLog() {
    if (!checked.length) return;
    const nl = [{ ...form, exercicios: [...checked], id: "g" + Date.now() }, ...logs];
    setLogs(nl); persist(nl); setSaved(true); setChecked([]);
    setTimeout(() => setSaved(false), 2500);
  }

  const TABS = [{ id: "registrar", label: "+ Sessão" }, { id: "historico", label: "Histórico" }, { id: "dicas", label: "Dicas" }];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,-apple-system,sans-serif", fontSize: 14, paddingBottom: 40 }}>
      <ModHeader id="academia" onBack={onBack} tabs={TABS} activeTab={tab} setTab={setTab} />
      <div style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>

        {tab === "registrar" && (
          <div>
            {saved && <div style={{ background: C.pink + "18", border: "1px solid " + C.pink + "44", borderRadius: 10, padding: 12, marginBottom: 12, color: C.pink, fontWeight: 700, textAlign: "center" }}>✓ Sessão salva!</div>}
            <div style={baseCard}>
              <div style={{ fontWeight: 700, color: C.pink, fontSize: 13, marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>+ Registrar Sessão</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div><div style={baseLbl}>Data</div><input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} style={baseInp} /></div>
                <div><div style={baseLbl}>Foco</div>
                  <select value={form.foco} onChange={e => setForm(f => ({...f, foco: e.target.value}))} style={baseInp}>
                    {["Pernas","Superior","Full Body","Força","Pliometria","Mobilidade","Pilates"].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={baseLbl}>Exercícios (toque para selecionar)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {exList.map(ex => (
                    <button key={ex} onClick={() => toggleEx(ex)}
                      style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: checked.includes(ex) ? 700 : 400, background: checked.includes(ex) ? C.pink + "22" : C.surface, color: checked.includes(ex) ? C.pink : C.text2, border: "1px solid " + (checked.includes(ex) ? C.pink + "66" : C.border), transition: "all .15s" }}>
                      {checked.includes(ex) ? "✓ " : ""}{ex}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input value={newEx} onChange={e => setNewEx(e.target.value)} onKeyDown={e => e.key === "Enter" && addEx()} placeholder="Adicionar exercício..." style={{ ...baseInp, marginTop: 0, flex: 1 }} />
                <button onClick={addEx} style={{ padding: "9px 14px", background: C.pink, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ ADD</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div><div style={baseLbl}>Carga principal</div><input value={form.carga} onChange={e => setForm(f => ({...f, carga: e.target.value}))} placeholder="ex: 20kg" style={baseInp} /></div>
                <div><div style={baseLbl}>Duração</div>
                  <select value={form.duracao} onChange={e => setForm(f => ({...f, duracao: e.target.value}))} style={baseInp}>
                    {["30 min","45 min","60 min","90 min"].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}><div style={baseLbl}>Observações</div><input value={form.notas} onChange={e => setForm(f => ({...f, notas: e.target.value}))} placeholder="ex: fácil, pesado, dor no joelho..." style={baseInp} /></div>
              <button onClick={addLog} style={{ width: "100%", padding: 12, background: C.pink, color: "#fff", border: "none", borderRadius: 10, fontWeight: 900, fontSize: 14, cursor: "pointer" }}>SALVAR SESSÃO</button>
            </div>
          </div>
        )}

        {tab === "historico" && (
          <div>
            {!logs.length && <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Nenhuma sessão registrada ainda.</div>}
            {logs.map(l => (
              <div key={l.id} style={{ ...baseCard, borderLeft: "3px solid " + (l.fromTreinoDia ? "#06b6d4" : C.pink) }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{l.date}</span>
                    <span style={{ marginLeft: 8, ...pill(l.fromTreinoDia ? "#06b6d4" : C.pink) }}>{l.fromTreinoDia ? "📋 Treino do Dia" : (l.foco || l.tag)}</span>
                    {!l.fromTreinoDia && l.duracao && <span style={{ marginLeft: 4, ...pill(C.muted) }}>{l.duracao}</span>}
                  </div>
                  <button onClick={() => { const nl = logs.filter(x => x.id !== l.id); setLogs(nl); persist(nl); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
                {l.carga && <div style={{ fontSize: 12, color: C.accent, marginBottom: 6 }}>💪 {l.carga}</div>}
                {l.exercicios?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: l.notas ? 8 : 0 }}>
                    {l.exercicios.map(ex => <span key={ex} style={{ ...pill(C.pink), fontSize: 11 }}>{ex}</span>)}
                  </div>
                )}
                {l.body && <div style={{ fontSize: 13, color: C.text2, marginBottom: 4 }}>{l.body}</div>}
                {l.notas && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{l.notas}</div>}
              </div>
            ))}
          </div>
        )}

        {tab === "dicas" && (
          <div>
            {[
              { titulo: "Academia complementa a corrida", cor: C.pink, dica: "Foco em exercícios unilaterais e pliometria — transferência direta para a passada. Cargas moderadas nos dias próximos a tiros." },
              { titulo: "Agachamento", cor: C.accent, dica: "3x10 com 20kg em dias normais. Desce devagar (3s), sobe em 1s. Nunca acima de 40kg pós-treino longo." },
              { titulo: "Búlgaro e Avanço", cor: C.red, dica: "Excelente para corrida. Unilateral fortalece estabilizadores do quadril. Use 20kg em dias normais, sem peso pós-prova." },
              { titulo: "Panturrilha", cor: C.green, dica: "3x15 elevações. Fundamental para o impulso na passada. Pode fazer todos os dias, sem restrição." },
              { titulo: "Pilates", cor: C.blue, dica: "Excelente complemento. Melhora estabilidade, respiração e postura de corrida. Sem restrição de dia." },
              { titulo: "Pós-prova", cor: C.muted, dica: "Apenas mobilidade e superiores leves. Nada de pernas pesadas nos 2 dias seguintes à prova." },
            ].map((d, i) => (
              <div key={i} style={{ ...baseCard, borderLeft: "3px solid " + d.cor }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: d.cor, marginBottom: 6 }}>{d.titulo}</div>
                <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>{d.dica}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MÓDULO PROVAS ──────────────────────────────────────────────────────────
const CALENDARIO = [
  { mes: "Maio", provas: [
    { data: "01/05", nome: "Corrida do Trabalhador", dist: "5km", tipo: "done", tempo: "16:43" },
    { data: "17/05", nome: "Corrida do Time Brasil", dist: "5km", tipo: "confirmed", id: "1705" },
    { data: "31/05", nome: "Corrida da Copa", dist: "5km", tipo: "confirmed", id: "3105" },
  ]},
  { mes: "Junho", provas: [
    { data: "14/06", nome: "Corrida Petrobrás", dist: "5km", tipo: "confirmed", id: "1406" },
    { data: "07/06", nome: "Corrida do Meio Ambiente", dist: "10km", tipo: "optional" },
    { data: "28/06", nome: "Corrida de São Pedro", dist: "5km", tipo: "optional" },
  ]},
  { mes: "Julho", provas: [
    { data: "12/07", nome: "Corrida do MUSAL", dist: "5km", tipo: "confirmed", id: "1207" },
    { data: "26/07", nome: "Corrida de Inverno", dist: "10km", tipo: "optional" },
  ]},
  { mes: "Agosto", provas: [
    { data: "16/08", nome: "🏆 Meia Internacional do Rio", dist: "21km", tipo: "highlight", id: "1608m" },
    { data: "16/08", nome: "3ª Etapa ALL Running", dist: "5km", tipo: "confirmed", id: "1608" },
    { data: "30/08", nome: "Corrida dos Pais", dist: "5km", tipo: "optional" },
  ]},
  { mes: "Setembro", provas: [
    { data: "06/09", nome: "Corrida da Independência", dist: "5km", tipo: "optional" },
    { data: "20/09", nome: "Corrida das Águas", dist: "10km", tipo: "optional" },
  ]},
  { mes: "Outubro", provas: [
    { data: "31/10", nome: "Corrida do Halloween", dist: "5km", tipo: "confirmed", id: "3110" },
    { data: "18/10", nome: "Corrida do Comerciário", dist: "10km", tipo: "optional" },
  ]},
  { mes: "Nov / Dez", provas: [
    { data: "08/11", nome: "Corrida da Saúde", dist: "5km", tipo: "optional" },
    { data: "22/11", nome: "Corrida de Tiradentes", dist: "15km", tipo: "optional" },
    { data: "06/12", nome: "Corrida de Natal", dist: "5km", tipo: "optional" },
    { data: "27/12", nome: "Corrida de Fim de Ano", dist: "10km", tipo: "optional" },
  ]},
];

const TIPO_COLOR = { done: "#3dd68c", confirmed: "#a855f7", highlight: "#f97316", optional: "#4a5568" };
const TIPO_LABEL = { done: "Realizada", confirmed: "Confirmada", highlight: "Destaque", optional: "Opção" };

function ModuloProvas({ onBack }) {
  const [tempos, setTempos] = useState({});
  const [extraProvas, setExtraProvas] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [novaProva, setNovaProva] = useState({ data: "", nome: "", dist: "5km", tipo: "confirmed" });

  useEffect(() => { (async () => {
    try {
      const r = await store.get("race_times"); if (r?.value) setTempos(JSON.parse(r.value));
      const e = await store.get("extra_provas"); if (e?.value) setExtraProvas(JSON.parse(e.value));
    } catch(_) {}
  })(); }, []);

  function saveTime(id, val) {
    const nt = { ...tempos, [id]: val };
    setTempos(nt);
    store.set("race_times", JSON.stringify(nt));
  }

  function addProva() {
    if (!novaProva.data || !novaProva.nome) return;
    const np = [...extraProvas, { ...novaProva, id: "ep" + Date.now() }];
    setExtraProvas(np);
    store.set("extra_provas", JSON.stringify(np));
    setNovaProva({ data: "", nome: "", dist: "5km", tipo: "confirmed" });
    setShowAdd(false);
  }

  function removeProva(id) {
    const np = extraProvas.filter(p => p.id !== id);
    setExtraProvas(np);
    store.set("extra_provas", JSON.stringify(np));
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,-apple-system,sans-serif", fontSize: 14, paddingBottom: 40 }}>
      <ModHeader id="provas" onBack={onBack} />
      <div style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>

        {/* Legenda + botão add */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(TIPO_LABEL).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: TIPO_COLOR[k] }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: TIPO_COLOR[k] }}></div>{v}
              </div>
            ))}
          </div>
          <button onClick={() => setShowAdd(s => !s)}
            style={{ padding: "6px 12px", background: C.purple + "22", color: C.purple, border: "1px solid " + C.purple + "44", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            + Nova Prova
          </button>
        </div>

        {/* Form nova prova */}
        {showAdd && (
          <div style={{ ...baseCard, borderLeft: "3px solid " + C.purple, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: C.purple, fontSize: 13, marginBottom: 12 }}>Adicionar Prova</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={baseLbl}>Data</div>
                <input type="date" value={novaProva.data} onChange={e => setNovaProva(f => ({...f, data: e.target.value}))} style={baseInp} />
              </div>
              <div>
                <div style={baseLbl}>Distância</div>
                <select value={novaProva.dist} onChange={e => setNovaProva(f => ({...f, dist: e.target.value}))} style={baseInp}>
                  {["5km","10km","15km","21km","42km"].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={baseLbl}>Nome da Prova</div>
              <input value={novaProva.nome} onChange={e => setNovaProva(f => ({...f, nome: e.target.value}))} placeholder="Ex: Corrida do Parque" style={baseInp} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={baseLbl}>Status</div>
              <Seg options={[{value:"confirmed",label:"Confirmada"},{value:"optional",label:"Opção"},{value:"highlight",label:"Destaque"}]}
                value={novaProva.tipo} onChange={v => setNovaProva(f => ({...f, tipo: v}))} color={C.purple} />
            </div>
            <button onClick={addProva} style={{ width: "100%", padding: 10, background: C.purple, color: "#fff", border: "none", borderRadius: 8, fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
              SALVAR PROVA
            </button>
          </div>
        )}

        {/* Provas adicionadas pelo usuário */}
        {extraProvas.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: C.purple, letterSpacing: 2, marginBottom: 10 }}>⭐ Minhas Provas</div>
            {extraProvas.map((p) => {
              const cor = TIPO_COLOR[p.tipo] || C.purple;
              return (
                <div key={p.id} style={{ ...baseCard, borderLeft: "3px solid " + cor, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: cor, minWidth: 50 }}>{p.data}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nome}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{p.dist}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <input defaultValue={tempos[p.id] || ""} onChange={e => saveTime(p.id, e.target.value)} placeholder="00:00" style={{ width: 68, background: C.surface, border: "1px solid " + C.border, borderRadius: 6, padding: "4px 7px", color: tempos[p.id] ? cor : C.muted, fontFamily: "monospace", fontSize: 12, textAlign: "center", outline: "none" }} />
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ ...pill(cor), fontSize: 9 }}>{TIPO_LABEL[p.tipo]}</span>
                      <button onClick={() => removeProva(p.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Calendário fixo */}
        {CALENDARIO.map((m, mi) => (
          <div key={mi} style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: C.purple, letterSpacing: 2, marginBottom: 10 }}>📅 {m.mes}</div>
            {m.provas.map((p, pi) => {
              const cor = TIPO_COLOR[p.tipo];
              return (
                <div key={pi} style={{ ...baseCard, borderLeft: "3px solid " + cor, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: cor, minWidth: 40 }}>{p.data}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nome}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{p.dist}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    {p.tipo === "done"
                      ? <div style={{ fontFamily: "monospace", fontWeight: 900, color: cor, fontSize: 15 }}>{p.tempo} ✓</div>
                      : p.id
                        ? <input defaultValue={tempos[p.id] || ""} onChange={e => saveTime(p.id, e.target.value)} placeholder="00:00" style={{ width: 68, background: C.surface, border: "1px solid " + C.border, borderRadius: 6, padding: "4px 7px", color: tempos[p.id] ? cor : C.muted, fontFamily: "monospace", fontSize: 12, textAlign: "center", outline: "none" }} />
                        : null
                    }
                    <span style={{ ...pill(cor), fontSize: 9 }}>{TIPO_LABEL[p.tipo]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BANCO DE EXERCÍCIOS ────────────────────────────────────────────────────
const BANCO_EXERCICIOS = {
  mobilidade: [
    { nome: "Mobilidade de Quadril", detalhe: "10 reps cada lado · círculos amplos", tempo: 60 },
    { nome: "Panturrilha + Isquiotibial", detalhe: "30s cada lado · estático", tempo: 60 },
    { nome: "Rotação de Tornozelo", detalhe: "10 reps cada", tempo: 45 },
    { nome: "Mobilidade Torácica", detalhe: "10 reps · abertura de caixa torácica", tempo: 60 },
    { nome: "Hip 90/90", detalhe: "8 reps cada lado · rotação interna/externa quadril", tempo: 60 },
    { nome: "World's Greatest Stretch", detalhe: "6 reps cada lado · mobilidade total", tempo: 90 },
    { nome: "Abertura de Adutores", detalhe: "30s cada posição · 3 posições", tempo: 60 },
    { nome: "Mobilidade de Ombro c/ Bastão", detalhe: "10 reps · circundução", tempo: 45 },
    { nome: "Cat-Cow", detalhe: "10 reps lentos · coluna", tempo: 45 },
    { nome: "Agachamento Profundo Isométrico", detalhe: "3x 30s · mobilidade tornozelo+quadril", tempo: 30 },
  ],
  core: [
    { nome: "Prancha Baixa", detalhe: "3x 45s · quadril alinhado", tempo: 45 },
    { nome: "Prancha Lateral", detalhe: "2x 30s cada lado", tempo: 30 },
    { nome: "Superman Estático", detalhe: "3x 30s · eleva braços e pernas", tempo: 30 },
    { nome: "Elevação Pélvica", detalhe: "3x 15 reps · aperta glúteo no topo", tempo: 45 },
    { nome: "ABS Remador Alternado", detalhe: "3x 20 reps · cotovelo+joelho oposto", tempo: 45 },
    { nome: "ABS c/ Rotação +5kg", detalhe: "3x 10 reps · controla lombar", tempo: 60 },
    { nome: "Prancha c/ Flexão + Rotação", detalhe: "2x 8 reps · abre braço lateralmente", tempo: 60 },
    { nome: "Avião Unilateral", detalhe: "2x 10 cada · tronco paralelo ao chão", tempo: 60 },
    { nome: "Dead Bug", detalhe: "3x 10 reps · braço+perna opostos", tempo: 60 },
    { nome: "Hollow Hold", detalhe: "3x 20s · lombar colada no chão", tempo: 20 },
    { nome: "Pallof Press c/ Elástico", detalhe: "3x 10 cada lado · anti-rotação", tempo: 60 },
    { nome: "Bird Dog", detalhe: "3x 10 reps · estabilidade lombar", tempo: 60 },
    { nome: "Elevação de Pernas c/ Elástico", detalhe: "3x 15 cada lado", tempo: 45 },
    { nome: "Crunch Bicicleta", detalhe: "3x 20 reps · controla velocidade", tempo: 45 },
    { nome: "ABS Supra c/ 5kg", detalhe: "3x 15 reps", tempo: 45 },
  ],
  forca: [
    { nome: "Agachamento c/ Barra", detalhe: "3x10 · 20kg · desce 3s sobe 1s", tempo: 90 },
    { nome: "Búlgaro c/ Halter", detalhe: "3x10 cada · 20kg · pé elevado", tempo: 90 },
    { nome: "Avanço c/ Halter", detalhe: "3x12 cada lado · 10kg", tempo: 90 },
    { nome: "Leg Press", detalhe: "3x12 · carga moderada", tempo: 90 },
    { nome: "Agachamento Jump", detalhe: "3x10 · explosão na subida", tempo: 60 },
    { nome: "Passada de Gigante c/ Barra", detalhe: "3x8 cada · 20kg · passada longa", tempo: 90 },
    { nome: "Step Up na Caixa", detalhe: "3x12 cada · 40cm altura", tempo: 60 },
    { nome: "Levantamento Terra Romeno", detalhe: "3x10 · 30kg · isquiotibial", tempo: 90 },
    { nome: "Afundo Lateral", detalhe: "3x10 cada lado · adutor+glúteo", tempo: 60 },
    { nome: "Agachamento Sumô", detalhe: "3x12 · pés abertos · adutores", tempo: 60 },
  ],
  pliometria: [
    { nome: "Salto na Caixa 50cm", detalhe: "3x10 · aterrissa suave", tempo: 60 },
    { nome: "Salto na Caixa 70cm", detalhe: "3x8 · máxima explosão", tempo: 60 },
    { nome: "Salto Lateral na Caixa", detalhe: "3x10 cada lado", tempo: 60 },
    { nome: "Salto de Impulsão Frontal", detalhe: "3x10 · pé chapado", tempo: 60 },
    { nome: "Salto Saci (unilateral)", detalhe: "3x8 cada perna · alternado", tempo: 60 },
    { nome: "Skipping Rápido", detalhe: "4x 20m · joelhos altos", tempo: 30 },
    { nome: "Burpee com Salto", detalhe: "3x8 · explosão total", tempo: 60 },
    { nome: "Salto em Distância", detalhe: "3x6 · máxima distância", tempo: 60 },
    { nome: "Hop Unilateral", detalhe: "3x8 cada · impulso horizontal", tempo: 60 },
  ],
  superior: [
    { nome: "Avião Unilateral c/ Halter", detalhe: "2x10 cada lado · equilíbrio", tempo: 90 },
    { nome: "Remada Unilateral", detalhe: "2x12 cada · cotovelo fechado", tempo: 90 },
    { nome: "Flexão de Braço", detalhe: "3x12 · corpo reto", tempo: 60 },
    { nome: "Barra Fixa", detalhe: "3x6-12 · pegada supinada", tempo: 60 },
    { nome: "Barra Invertida", detalhe: "3x10 · costas abertas", tempo: 60 },
    { nome: "Remada com Barra", detalhe: "3x10 · 20kg · tronco inclinado", tempo: 90 },
    { nome: "Desenvolvimento Ombro", detalhe: "3x10 · halter 8kg cada", tempo: 60 },
    { nome: "Crucifixo c/ Elástico", detalhe: "3x15 · postura corrida", tempo: 60 },
    { nome: "Flexão Diamante", detalhe: "3x8 · tríceps", tempo: 60 },
    { nome: "Puxada no Cabo", detalhe: "3x12 · pegada fechada", tempo: 60 },
  ],
  corrida: [
    { nome: "Panturrilha em Pé", detalhe: "3x20 · impulso na passada", tempo: 45 },
    { nome: "Glúteo c/ Elástico", detalhe: "3x15 cada lado · estabiliza quadril", tempo: 60 },
    { nome: "Passada de Gigante", detalhe: "2x10 cada · sem peso", tempo: 60 },
    { nome: "Skip Alternado", detalhe: "4x20m · joelho e pé chapado", tempo: 30 },
    { nome: "Soldadinho", detalhe: "4x20m · extensão do quadril", tempo: 30 },
    { nome: "Flute", detalhe: "4x20m · ativação glúteo", tempo: 30 },
    { nome: "Corrida c/ Elevação Joelho", detalhe: "4x20m · pé chapado rápido", tempo: 30 },
    { nome: "Corrida nas Tartarugas", detalhe: "3x6 passagens · sprint saída explosiva", tempo: 30 },
    { nome: "Tração Elástico Corrida", detalhe: "3x20m · resistência frontal", tempo: 45 },
    { nome: "Caminhada no Calcanhar", detalhe: "3x20m · ativa tibial anterior", tempo: 30 },
    { nome: "Caminhada na Ponta do Pé", detalhe: "3x20m · ativa panturrilha", tempo: 30 },
    { nome: "Elástico Abdução Quadril", detalhe: "3x15 cada lado · estabilidade lateral", tempo: 45 },
  ],
};

function ModuloTreinoDia({ onBack }) {
  const today = new Date().toISOString().split("T")[0];
  const [sessoes, setSessoes] = useState([]);
  const [blocos, setBlocos] = useState([
    { id: "mob", bloco: "🔵 Mobilidade", cor: "#4ea8ff", categoria: "mobilidade",
      exercicios: [0,1,2].map(i => ({ ...BANCO_EXERCICIOS.mobilidade[i], uid: "m"+i })) },
    { id: "core", bloco: "🟢 Core", cor: "#3dd68c", categoria: "core",
      exercicios: [0,2,3,4].map(i => ({ ...BANCO_EXERCICIOS.core[i], uid: "c"+i })) },
    { id: "forca", bloco: "🔴 Força", cor: "#e05c2e", categoria: "forca",
      exercicios: [0].map(i => ({ ...BANCO_EXERCICIOS.forca[i], uid: "f"+i })) },
    { id: "plio", bloco: "⚡ Pliometria", cor: "#f59e0b", categoria: "pliometria",
      exercicios: [0,3].map(i => ({ ...BANCO_EXERCICIOS.pliometria[i], uid: "p"+i })) },
    { id: "corrida", bloco: "🏃 Específico Corrida", cor: "#ec4899", categoria: "corrida",
      exercicios: [0,1,2,5].map(i => ({ ...BANCO_EXERCICIOS.corrida[i], uid: "r"+i })) },
  ]);
  const [checked, setChecked] = useState({});
  const [timer, setTimer] = useState(null);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [addingTo, setAddingTo] = useState(null);
  const [customEx, setCustomEx] = useState({ nome: "", detalhe: "", tempo: 45 });
  const [showSaved, setShowSaved] = useState(false);
  const [viewMode, setViewMode] = useState("treino"); // treino | historico

  useEffect(() => {
    (async () => {
      try {
        const r = await store.get("treino_dia_sessoes");
        if (r?.value) setSessoes(JSON.parse(r.value));
        const rb = await store.get("treino_dia_blocos");
        if (rb?.value) setBlocos(JSON.parse(rb.value));
      } catch(_) {}
    })();
  }, []);

  const persistBlocos = async (b) => {
    try { await store.set("treino_dia_blocos", JSON.stringify(b)); } catch(_) {}
  };

  const allEx = blocos.flatMap(b => b.exercicios);
  const totalEx = allEx.length;
  const doneCount = Object.values(checked).filter(Boolean).length;
  const pct = totalEx > 0 ? Math.round((doneCount / totalEx) * 100) : 0;
  const isComplete = doneCount === totalEx && totalEx > 0;

  useEffect(() => {
    let interval;
    if (running && remaining > 0) interval = setInterval(() => setRemaining(r => r - 1), 1000);
    else if (remaining === 0 && running) setRunning(false);
    return () => clearInterval(interval);
  }, [running, remaining]);

  function startTimer(secs, label, cor) {
    setTimer({ secs, label, cor }); setTotal(secs); setRemaining(secs); setRunning(false);
  }
  function toggleTimer() {
    if (remaining === 0) { setRemaining(total); setRunning(true); }
    else setRunning(r => !r);
  }
  function toggleCheck(uid) {
    setChecked(s => ({ ...s, [uid]: !s[uid] }));
  }

  function saveSession() {
    const checkedList = allEx.filter(ex => checked[ex.uid]).map(ex => ex.nome);
    if (!checkedList.length) return;

    const todayStr = today;
    const timeStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    // Salva no histórico do Treino do Dia
    const ns = [{ date: todayStr, exercicios: checkedList, total: totalEx, feitos: doneCount, savedAt: timeStr }, ...sessoes].slice(0, 30);
    setSessoes(ns);
    store.set("treino_dia_sessoes", JSON.stringify(ns));

    // ── Detecta blocos concluídos e registra nas abas corretas ──
    blocos.forEach(bloco => {
      const exDoBloco = bloco.exercicios;
      const feitosNoBloco = exDoBloco.filter(ex => checked[ex.uid]);
      if (!feitosNoBloco.length) return;

      const nomesFeitoS = feitosNoBloco.map(e => e.nome).join(", ");
      const proporcao = feitosNoBloco.length + "/" + exDoBloco.length;

      // CORE → salva em core_logs (mesma chave do ModuloCore)
      if (bloco.categoria === "core") {
        store.get("core_logs").then(r => {
          const existing = r?.value ? JSON.parse(r.value) : [];
          const entry = {
            id: "td_core_" + Date.now(),
            date: todayStr,
            tag: "Treino do Dia",
            body: bloco.bloco + " · " + proporcao + " exercícios: " + nomesFeitoS,
            summary: "[" + todayStr + "] Core via Treino do Dia (" + proporcao + "): " + nomesFeitoS,
            fromTreinoDia: true,
          };
          const updated = [entry, ...existing].slice(0, 50);
          store.set("core_logs", JSON.stringify(updated));
        }).catch(() => {});
      }

      // ACADEMIA → salva em gym_logs (mesma chave do ModuloAcademia)
      if (["forca", "pliometria", "academia"].includes(bloco.categoria)) {
        store.get("gym_logs").then(r => {
          const existing = r?.value ? JSON.parse(r.value) : [];
          const entry = {
            id: "td_gym_" + Date.now(),
            date: todayStr,
            tag: "Treino do Dia",
            body: bloco.bloco + " · " + proporcao + " exercícios: " + nomesFeitoS,
            summary: "[" + todayStr + "] Academia via Treino do Dia (" + proporcao + "): " + nomesFeitoS,
            fromTreinoDia: true,
          };
          const updated = [entry, ...existing].slice(0, 50);
          store.set("gym_logs", JSON.stringify(updated));
        }).catch(() => {});
      }
    });

    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 3000);
  }

  // Auto-save when complete
  useEffect(() => {
    if (isComplete && doneCount > 0) saveSession();
  }, [isComplete]);

  function removeExercicio(blocoId, uid) {
    const nb = blocos.map(b => b.id === blocoId ? { ...b, exercicios: b.exercicios.filter(e => e.uid !== uid) } : b);
    setBlocos(nb); persistBlocos(nb);
  }

  function addFromBanco(blocoId, ex) {
    const nb = blocos.map(b => {
      if (b.id !== blocoId) return b;
      if (b.exercicios.find(e => e.nome === ex.nome)) return b;
      return { ...b, exercicios: [...b.exercicios, { ...ex, uid: blocoId + Date.now() }] };
    });
    setBlocos(nb); persistBlocos(nb);
  }

  function addCustom(blocoId) {
    if (!customEx.nome) return;
    const nb = blocos.map(b => b.id !== blocoId ? b : {
      ...b, exercicios: [...b.exercicios, { ...customEx, uid: blocoId + Date.now() }]
    });
    setBlocos(nb); persistBlocos(nb);
    setCustomEx({ nome: "", detalhe: "", tempo: 45 });
    setAddingTo(null);
  }

  const timerPct = total > 0 ? Math.max(0, (remaining / total) * 100) : 0;
  const timerColor = timer ? timer.cor : C.green;
  const mins = Math.floor(remaining / 60);
  const secs2 = remaining % 60;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,-apple-system,sans-serif", fontSize: 14, paddingBottom: timer ? 180 : 60 }}>
      <ModHeader id="treino-dia" onBack={onBack} />

      {/* Sub-tabs */}
      <div style={{ background: C.surface, borderBottom: "1px solid " + C.border, padding: "0 16px", display: "flex", gap: 4 }}>
        {[{id:"treino",label:"Treino do Dia"},{id:"historico",label:"Histórico"}].map(t => (
          <button key={t.id} onClick={() => setViewMode(t.id)}
            style={{ padding: "9px 14px", background: viewMode===t.id ? "#06b6d4" : "transparent", color: viewMode===t.id ? "#000" : C.text2, border: "none", borderRadius: "6px 6px 0 0", cursor: "pointer", fontWeight: viewMode===t.id ? 700 : 400, fontSize: 12 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>

        {viewMode === "historico" && (
          <div>
            {sessoes.length === 0 && <div style={{ textAlign:"center", color: C.muted, padding: 40 }}>Nenhuma sessão salva ainda.</div>}
            {sessoes.map((s, i) => (
              <div key={i} style={{ ...baseCard, borderLeft: "3px solid #06b6d4" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 8 }}>
                  <span style={{ fontFamily:"monospace", fontSize:11, color: C.muted }}>{s.date}</span>
                  <span style={{ ...pill("#06b6d4") }}>{s.feitos}/{s.total} exercícios</span>
                </div>
                <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.7 }}>{s.exercicios.join(" · ")}</div>
              </div>
            ))}
          </div>
        )}

        {viewMode === "treino" && (
          <div>
            {/* Progress */}
            <div style={{ ...baseCard, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.text2, marginBottom: 6 }}>
                <span>Progresso da sessão</span>
                <span style={{ fontWeight: 700, color: C.green }}>{doneCount} / {totalEx} · {pct}%</span>
              </div>
              <div style={pbar}><div style={pfill(pct, C.green)} /></div>
              {isComplete && (
                <div style={{ textAlign: "center", color: C.green, fontWeight: 900, fontSize: 15, marginTop: 8 }}>🏆 TREINO COMPLETO! Salvo automaticamente ✓</div>
              )}
              {showSaved && <div style={{ textAlign:"center", color: C.green, fontSize:12, marginTop:6, fontWeight:700 }}>✓ Sessão salva no histórico!</div>}
              {doneCount > 0 && !isComplete && (
                <button onClick={saveSession} style={{ width:"100%", marginTop:10, padding:9, background: C.surface, color: C.text2, border:"1px solid "+C.border, borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                  💾 Salvar progresso ({doneCount} feitos)
                </button>
              )}
            </div>

            {/* Blocos */}
            {blocos.map((bloco) => (
              <div key={bloco.id} style={{ marginBottom: 24 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: bloco.cor, letterSpacing: 1 }}>{bloco.bloco}</div>
                  <button onClick={() => setAddingTo(addingTo === bloco.id ? null : bloco.id)}
                    style={{ padding:"4px 10px", background: bloco.cor+"18", color: bloco.cor, border:"1px solid "+bloco.cor+"44", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:700 }}>
                    + ADD
                  </button>
                </div>

                {/* Painel adicionar exercício */}
                {addingTo === bloco.id && (
                  <div style={{ ...baseCard, borderLeft:"3px solid "+bloco.cor, marginBottom:10 }}>
                    <div style={{ fontWeight:700, fontSize:12, color: bloco.cor, marginBottom:10 }}>Adicionar ao bloco</div>
                    {/* Banco */}
                    <div style={{ fontSize:11, color: C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Do banco de exercícios:</div>
                    <div style={{ maxHeight:180, overflowY:"auto", marginBottom:12 }}>
                      {BANCO_EXERCICIOS[bloco.categoria]?.map((ex, i) => (
                        <div key={i} onClick={() => addFromBanco(bloco.id, ex)}
                          style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid "+C.border, cursor:"pointer" }}
                          onMouseEnter={e => e.currentTarget.style.background=bloco.cor+"11"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:600, color: C.text }}>{ex.nome}</div>
                            <div style={{ fontSize:11, color: C.muted }}>{ex.detalhe}</div>
                          </div>
                          <span style={{ color: bloco.cor, fontSize:16, marginLeft:8 }}>+</span>
                        </div>
                      ))}
                    </div>
                    {/* Custom */}
                    <div style={{ fontSize:11, color: C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Ou criar personalizado:</div>
                    <div style={{ display:"grid", gridTemplateColumns:"2fr 2fr 1fr", gap:6, marginBottom:8 }}>
                      <input value={customEx.nome} onChange={e => setCustomEx(f=>({...f,nome:e.target.value}))} placeholder="Nome do exercício" style={{ ...baseInp, fontSize:12, padding:"7px 10px" }} />
                      <input value={customEx.detalhe} onChange={e => setCustomEx(f=>({...f,detalhe:e.target.value}))} placeholder="Ex: 3x10 reps" style={{ ...baseInp, fontSize:12, padding:"7px 10px" }} />
                      <input type="number" value={customEx.tempo} onChange={e => setCustomEx(f=>({...f,tempo:Number(e.target.value)}))} placeholder="Seg" style={{ ...baseInp, fontSize:12, padding:"7px 8px" }} />
                    </div>
                    <button onClick={() => addCustom(bloco.id)} style={{ width:"100%", padding:8, background: bloco.cor, color:"#000", border:"none", borderRadius:7, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                      + ADICIONAR PERSONALIZADO
                    </button>
                  </div>
                )}

                {/* Exercícios do bloco */}
                {bloco.exercicios.map((ex) => {
                  const done = checked[ex.uid];
                  return (
                    <div key={ex.uid} style={{ ...baseCard, borderLeft:"3px solid "+bloco.cor, opacity: done ? 0.45 : 1, display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <button onClick={() => toggleCheck(ex.uid)}
                        style={{ width:28, height:28, borderRadius:"50%", border:"2px solid "+(done ? C.green : C.border), background: done ? C.green : "transparent", color: done ? "#000" : C.muted, cursor:"pointer", fontWeight:900, fontSize:13, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        ✓
                      </button>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:13 }}>{ex.nome}</div>
                        <div style={{ fontSize:11, color: C.muted }}>{ex.detalhe}</div>
                      </div>
                      <button onClick={() => startTimer(ex.tempo, ex.nome, bloco.cor)}
                        style={{ padding:"5px 9px", background: bloco.cor+"18", color: bloco.cor, border:"1px solid "+bloco.cor+"44", borderRadius:7, cursor:"pointer", fontSize:10, fontWeight:700, flexShrink:0 }}>
                        ⏱{ex.tempo}s
                      </button>
                      <button onClick={() => removeExercicio(bloco.id, ex.uid)}
                        style={{ padding:"5px 7px", background: C.red+"18", color: C.red, border:"1px solid "+C.red+"33", borderRadius:7, cursor:"pointer", fontSize:12, fontWeight:700, flexShrink:0 }}>
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Timer */}
      {timer && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(10,12,16,.97)", backdropFilter:"blur(16px)", borderTop:"1px solid "+C.border, padding:16, zIndex:200 }}>
          <div style={{ maxWidth:400, margin:"0 auto" }}>
            <div style={{ fontSize:10, color: C.muted, fontFamily:"monospace", letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 }}>{timer.label}</div>
            <div style={{ fontFamily:"monospace", fontSize:60, fontWeight:900, textAlign:"center", color: remaining<=5 ? C.red : timerColor, lineHeight:1, marginBottom:8 }}>
              {String(mins).padStart(2,"0")}:{String(secs2).padStart(2,"0")}
            </div>
            <div style={pbar}><div style={{ ...pfill(timerPct, timerColor), transition:"width .1s linear" }} /></div>
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button onClick={toggleTimer}
                style={{ flex:1, padding:11, background: running ? C.accent : C.green, color:"#000", border:"none", borderRadius:10, fontWeight:900, fontSize:13, cursor:"pointer" }}>
                {running ? "⏸ PAUSAR" : remaining===0 ? "▶ REINICIAR" : "▶ INICIAR"}
              </button>
              <button onClick={() => { setTimer(null); setRunning(false); }}
                style={{ padding:"11px 16px", background: C.red+"18", color: C.red, border:"1px solid "+C.red+"44", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AUTH / ONBOARDING ───────────────────────────────────────────────────────
function AuthInput({label, ...props}) {
  return <label style={{display:"block", marginBottom:12}}>
    <div style={baseLbl}>{label}</div>
    <input {...props} style={baseInp}/>
  </label>;
}

function LoginScreen({onLogin, onCreate}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const profile=(()=>{try{return JSON.parse(localStorage.getItem("atletaos_profile")||"null")}catch{return null}})();
  const saved=(()=>{try{return JSON.parse(localStorage.getItem("atletaos_auth")||"null")}catch{return null}})();
  function submit(){
    if(!email.trim()||!password){setError("Preencha e-mail e senha.");return;}
    if(saved && (email.trim().toLowerCase()!==saved.email || password!==saved.password)){
      setError("E-mail ou senha incorretos."); return;
    }
    if(!saved){setError("Primeiro acesso: crie sua conta.");return;}
    localStorage.setItem("atletaos_last_login",new Date().toISOString());
    onLogin();
  }
  return <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{width:"100%",maxWidth:400}}>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:11,color:C.accent,letterSpacing:3,fontFamily:"monospace",marginBottom:8}}>PERFORMANCE PLATFORM</div>
        <div style={{fontSize:36,fontWeight:900}}><span style={{color:C.accent}}>ATLETA</span>OS</div>
        <div style={{fontSize:13,color:C.muted,marginTop:8}}>Treino, performance e evolução em um só lugar.</div>
      </div>
      <div style={baseCard}>
        <AuthInput label="E-mail" type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("")}} placeholder="seu@email.com" autoComplete="email"/>
        <AuthInput label="Senha" type="password" value={password} onChange={e=>{setPassword(e.target.value);setError("")}} placeholder="••••••••" autoComplete="current-password" onKeyDown={e=>e.key==="Enter"&&submit()}/>
        {error&&<div style={{fontSize:12,color:C.red,marginBottom:12}}>{error}</div>}
        <button onClick={submit} style={{...pbtn(C.accent,"#000"),width:"100%"}}>ENTRAR</button>
        {saved&&profile&&<button onClick={()=>{localStorage.setItem("atletaos_last_login",new Date().toISOString());onLogin()}} style={{...pbtn(C.green,"#000"),width:"100%",marginTop:8}}>ENTRAR COMO {String(profile.nome||"ATLETA").toUpperCase()}</button>}
        <button onClick={onCreate} style={{width:"100%",marginTop:14,padding:10,background:"transparent",border:"none",color:C.accent,cursor:"pointer",fontSize:12,fontWeight:700}}>CRIAR NOVA CONTA</button>
      </div>
    </div>
  </div>;
}

function OnboardingScreen({onComplete}) {
  const [step,setStep]=useState(0);
  const [data,setData]=useState({nome:"",email:"",password:"",foco:"5km",melhor5k:"",melhor10k:"",melhor21k:"",diasTreino:[],fazAcademia:false,fazCore:false});
  const DIAS=["Seg","Ter","Qua","Qui","Sex","Sab","Dom"];
  const pct=Math.round(((step+1)/5)*100);
  function finish(){
    const profile={...data,createdAt:new Date().toISOString()};
    localStorage.setItem("atletaos_profile",JSON.stringify(profile));
    localStorage.setItem("atletaos_auth",JSON.stringify({email:data.email.trim().toLowerCase(),password:data.password}));
    localStorage.setItem("atletaos_last_login",new Date().toISOString());
    if(data.melhor5k){
      let logs=[]; try{logs=JSON.parse(localStorage.getItem("rt_logs")||"[]")}catch{}
      if(!logs.find(l=>l.result5k===data.melhor5k)) logs.unshift({id:"profile_5k",date:new Date().toISOString().slice(0,10),type:"Prova 5km",desc:"Melhor tempo informado no cadastro",intensity:"forte",result5k:data.melhor5k,notes:"Cadastro inicial",rpe:8,sono:"bom",pernas:"normal",km:"5"});
      localStorage.setItem("rt_logs",JSON.stringify(logs));
    }
    onComplete();
  }
  return <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif",maxWidth:600,margin:"0 auto",display:"flex",flexDirection:"column"}}>
    <div style={{padding:"20px 20px 0"}}>
      <div style={{fontWeight:900,fontSize:24,marginBottom:8}}><span style={{color:C.accent}}>ATLETA</span>OS</div>
      <div style={{height:4,background:C.border,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:C.accent,borderRadius:4}}/></div>
      <div style={{fontSize:10,color:C.muted,fontFamily:"monospace",marginTop:5}}>{step+1} DE 5</div>
    </div>
    <div style={{flex:1,padding:"24px 20px 100px"}}>
      {step===0&&<div>
        <div style={{fontSize:26,fontWeight:900,marginBottom:8}}>Vamos configurar seu perfil</div>
        <div style={{fontSize:14,color:C.muted,marginBottom:22}}>Esses dados serão usados para personalizar o ATLETAOS.</div>
        <AuthInput label="Nome" value={data.nome} onChange={e=>setData(p=>({...p,nome:e.target.value}))} placeholder="Ex.: Angelo"/>
        <AuthInput label="E-mail" type="email" value={data.email} onChange={e=>setData(p=>({...p,email:e.target.value}))} placeholder="seu@email.com"/>
        <AuthInput label="Senha" type="password" value={data.password} onChange={e=>setData(p=>({...p,password:e.target.value}))} placeholder="Crie uma senha"/>
        <div style={baseLbl}>Distância principal</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:6}}>{[{v:"5km",l:"5 KM"},{v:"10km",l:"10 KM"},{v:"21km",l:"MEIA"},{v:"42km",l:"MARATONA"}].map(f=>{const a=data.foco===f.v;return <button key={f.v} onClick={()=>setData(p=>({...p,foco:f.v}))} style={{padding:14,background:a?C.accent+"22":C.card,color:a?C.accent:C.text2,border:"1px solid "+(a?C.accent+"66":C.border),borderRadius:10,cursor:"pointer",fontWeight:a?900:400}}>{f.l}</button>})}</div>
      </div>}
      {step===1&&<div>
        <div style={{fontSize:26,fontWeight:900,marginBottom:8}}>Seus melhores tempos</div><div style={{fontSize:14,color:C.muted,marginBottom:24}}>Deixe em branco quando não tiver um resultado.</div>
        {[{k:"melhor5k",l:"5 KM",ph:"16:43"},{k:"melhor10k",l:"10 KM",ph:"48:00"},{k:"melhor21k",l:"MEIA 21 KM",ph:"1:25:00"}].map(f=><AuthInput key={f.k} label={f.l} value={data[f.k]} onChange={e=>setData(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph}/>) }
      </div>}
      {step===2&&<div>
        <div style={{fontSize:26,fontWeight:900,marginBottom:8}}>Quais dias você treina?</div><div style={{fontSize:14,color:C.muted,marginBottom:24}}>Selecione os dias habituais.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>{DIAS.map(d=>{const sel=data.diasTreino.includes(d);return <button key={d} onClick={()=>setData(p=>({...p,diasTreino:sel?p.diasTreino.filter(x=>x!==d):[...p.diasTreino,d]}))} style={{padding:14,background:sel?C.accent+"22":C.card,color:sel?C.accent:C.text2,border:"1px solid "+(sel?C.accent+"66":C.border),borderRadius:10,cursor:"pointer",fontWeight:sel?700:400}}>{d}</button>})}</div>
      </div>}
      {step===3&&<div>
        <div style={{fontSize:26,fontWeight:900,marginBottom:8}}>Treinamento complementar</div><div style={{fontSize:14,color:C.muted,marginBottom:24}}>Marque o que faz parte da sua rotina.</div>
        {[{k:"fazAcademia",l:"Academia",sub:"Força e musculação"},{k:"fazCore",l:"Core",sub:"Estabilização e abdômen"}].map(o=>{const sel=data[o.k];return <button key={o.k} onClick={()=>setData(p=>({...p,[o.k]:!p[o.k]}))} style={{...baseCard,width:"100%",textAlign:"left",cursor:"pointer",borderColor:sel?C.accent+"66":C.border,background:sel?C.accent+"11":C.card,display:"flex",alignItems:"center",gap:14,marginBottom:10}}><div style={{width:32,height:32,borderRadius:8,background:sel?C.accent+"22":C.border,display:"flex",alignItems:"center",justifyContent:"center"}}>{sel?"✓":""}</div><div><div style={{fontWeight:700,color:sel?C.accent:C.text}}>{o.l}</div><div style={{fontSize:12,color:C.muted}}>{o.sub}</div></div></button>})}
      </div>}
      {step===4&&<div style={{textAlign:"center",paddingTop:40}}><div style={{fontSize:56}}>🏆</div><div style={{fontSize:28,fontWeight:900,margin:"16px 0 8px"}}>Tudo pronto, {data.nome||"atleta"}!</div><div style={{fontSize:14,color:C.muted,lineHeight:1.6}}>Seu perfil está configurado. O próximo passo é acompanhar treino, carga e performance.</div></div>}
    </div>
    {step<4&&<div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:600,padding:"12px 20px 24px",background:"rgba(10,10,10,.97)",borderTop:"1px solid "+C.border,display:"flex",gap:10,zIndex:100}}>{step>0&&<button onClick={()=>setStep(s=>s-1)} style={{...pbtn(C.border,C.muted),flex:"0 0 80px"}}>Voltar</button>}<button onClick={()=>{if(step===0&&(!data.nome.trim()||!data.email.trim()||!data.password))return;setStep(s=>s+1)}} style={{...pbtn(C.accent,"#000"),flex:1}}>{step===3?"Ver resumo":"Continuar"}</button></div>}
    {step===4&&<div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:600,padding:"12px 20px 24px",background:"rgba(10,10,10,.97)",borderTop:"1px solid "+C.border}}><button onClick={finish} style={{...pbtn(C.accent,"#000"),width:"100%"}}>COMEÇAR AGORA</button></div>}
  </div>;
}

// ── APP ROOT ───────────────────────────────────────────────────────────────
export default function App() {
  const [authState,setAuthState]=useState(()=>{
    const profile=(()=>{try{return JSON.parse(localStorage.getItem("atletaos_profile")||"null")}catch{return null}})();
    const last=localStorage.getItem("atletaos_last_login");
    if(!profile)return "onboarding";
    if(last&&(new Date()-new Date(last))/3600000<24)return "app";
    return "login";
  });
  const [screen,setScreen]=useState("home");
  const [logs,setLogs]=useState(()=>{try{return JSON.parse(localStorage.getItem("rt_logs")||"null")||INITIAL_LOGS}catch{return INITIAL_LOGS}});
  const [races,setRaces]=useState(()=>{try{return JSON.parse(localStorage.getItem("rt_races")||"null")||CALENDARIO}catch{return CALENDARIO}});
  const profile=(()=>{try{return JSON.parse(localStorage.getItem("atletaos_profile")||"null")}catch{return null}})();
  function saveLogs(nl){setLogs(nl);localStorage.setItem("rt_logs",JSON.stringify(nl));}
  function saveRaces(nr){setRaces(nr);localStorage.setItem("rt_races",JSON.stringify(nr));}
  function enterApp(){setLogs((()=>{try{return JSON.parse(localStorage.getItem("rt_logs")||"null")||INITIAL_LOGS}catch{return INITIAL_LOGS}})());setRaces((()=>{try{return JSON.parse(localStorage.getItem("rt_races")||"null")||CALENDARIO}catch{return CALENDARIO}})());setAuthState("app");}
  if(authState==="onboarding") return <OnboardingScreen onComplete={enterApp}/>;
  if(authState==="login") return <LoginScreen onLogin={enterApp} onCreate={()=>{localStorage.removeItem("atletaos_profile");localStorage.removeItem("atletaos_auth");setAuthState("onboarding")}}/>;
  const screens={
    home:<HomeMenu onSelect={setScreen}/>,
    corrida:<ModuloCorrida onBack={()=>setScreen("home")}/>,
    alimentacao:<ModuloAlimentacao onBack={()=>setScreen("home")}/>,
    core:<ModuloCore onBack={()=>setScreen("home")}/>,
    academia:<ModuloAcademia onBack={()=>setScreen("home")}/>,
    provas:<ModuloProvas onBack={()=>setScreen("home")}/>,
    "treino-dia":<ModuloTreinoDia onBack={()=>setScreen("home")}/>,
  };
  return <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif"}}>
    <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(10,10,10,.97)",backdropFilter:"blur(10px)",borderBottom:"1px solid "+C.border,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{fontWeight:900,fontSize:18}}><span style={{color:C.accent}}>ATLETA</span>OS</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{fontSize:11,color:C.muted}}>{profile?.nome||"Atleta"}</div><button onClick={()=>{localStorage.removeItem("atletaos_last_login");setAuthState("login")}} style={{background:"transparent",border:"1px solid "+C.border,borderRadius:6,color:C.muted,padding:"4px 8px",fontSize:10,cursor:"pointer"}}>sair</button></div>
    </div>
    <div style={{maxWidth:720,margin:"0 auto",paddingBottom:30}}>{screens[screen]||screens.home}</div>
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(10,10,10,.97)",borderTop:"1px solid "+C.border,display:"flex",justifyContent:"center",zIndex:90}}>
      {[{id:"home",i:"⌂",l:"Home"},{id:"corrida",i:"🏃",l:"Corrida"},{id:"treino-dia",i:"📋",l:"Hoje"},{id:"academia",i:"🏋️",l:"Força"},{id:"provas",i:"🏁",l:"Provas"}].map(n=><button key={n.id} onClick={()=>setScreen(n.id)} style={{flex:1,maxWidth:140,padding:"8px 4px",background:"transparent",border:"none",color:screen===n.id?C.accent:C.muted,cursor:"pointer"}}><div style={{fontSize:17}}>{n.i}</div><div style={{fontSize:9,fontWeight:screen===n.id?700:400}}>{n.l}</div></button>)}
    </div>
  </div>;
}
