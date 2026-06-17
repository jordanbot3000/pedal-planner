import React, { useState, useEffect, useRef } from "react";
import {
  Guitar, Plus, Trash2, Copy, Pencil, ChevronUp, ChevronDown, X, Check,
  Calendar, RotateCcw, Bookmark, ArrowLeft, Power, Image as ImageIcon,
} from "lucide-react";

/* ============================================================
 * PEDAL PLANNER v2
 * One stored angle, three readouts. Pot = 300 deg travel, 7:00 -> 5:00.
 *   default: 0-10 across full travel   (12:00 = 5.0)
 *   fender : 1-10 across full travel    (12:00 = 5.5)   [real skirted 1-10 knob]
 *   clock  : literal pointer position
 * Persists best-effort via window.storage; falls back to memory.
 * ============================================================ */

const T = {
  bg: "#191d22", board: "#1f242b", panel: "#252b33", panel2: "#2c333d", panel3: "#353d48",
  line: "#3a424d", lineSoft: "#2c333c",
  text: "#edf0f3", dim: "#9aa3ae", faint: "#717a85",
  accent: "#45b3a4", accentInk: "#06201c",
  led: "#57d27e", blue: "#3f8fdc", red: "#e2574a",
};
const DISP = "'Bricolage Grotesque', 'Space Grotesk', system-ui, sans-serif";
const BODY = "'Space Grotesk', system-ui, -apple-system, sans-serif";
const MONO = "'Space Mono', ui-monospace, Menlo, monospace";

/* ---------------- knob math ---------------- */
const DEF_SWEEP = { min: -150, max: 150 };       // 7:00 -> 5:00, 300 deg
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const uid = () => Math.random().toString(36).slice(2, 9);

function angleToClock(angle) {
  let m = Math.round((angle * 2) / 5) * 5;        // 1 deg = 2 min; round to 5 min
  m = ((m % 720) + 720) % 720;
  let h = Math.floor(m / 60); const mm = m % 60; if (h === 0) h = 12;
  return h + ":" + mm.toString().padStart(2, "0");
}
function frac(angle, sweep) { return clamp((angle - sweep.min) / (sweep.max - sweep.min), 0, 1); }
function readout(angle, style, sweep) {
  if (style === "clock") return angleToClock(angle);
  if (style === "numbered") return (1 + frac(angle, sweep) * 9).toFixed(1);
  return (frac(angle, sweep) * 10).toFixed(1);     // default
}
function eventAngle(e, rect, sweep) {
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const p = e.touches ? e.touches[0] : e;
  let d = Math.atan2(p.clientX - cx, -(p.clientY - cy)) * 180 / Math.PI; // 0=up, +=right
  return clamp(d, sweep.min, sweep.max);
}
function step(style, sweep) {
  const travel = sweep.max - sweep.min;
  if (style === "clock") return 2.5;               // 5 minutes
  if (style === "numbered") return travel / 90;      // 0.1 of 9
  return travel / 100;                             // 0.1 of 10
}
function parseClock(str) {
  const m = String(str).match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (!m) return null;
  let mins = ((+m[1]) % 12) * 60 + (+m[2]);
  let a = mins / 2; if (a > 180) a -= 360;
  return a;
}
function valueToAngle(v, style, sweep) {
  if (style === "clock") { const a = parseClock(v); return a == null ? null : clamp(a, sweep.min, sweep.max); }
  const num = parseFloat(v); if (isNaN(num)) return null;
  const f = style === "numbered" ? (num - 1) / 9 : num / 10;
  return clamp(sweep.min + f * (sweep.max - sweep.min), sweep.min, sweep.max);
}
function fmtTime(t) { if (!t) return ""; const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const hh = ((h + 11) % 12) + 1; return hh + ":" + String(m).padStart(2, "0") + " " + ap; }
function fmtGig(g) {
  if (!g.startDate) return "No date set";
  const d1 = new Date(g.startDate + "T00:00"); const o = { month: "short", day: "numeric" };
  let s = d1.toLocaleDateString(undefined, o);
  if (g.endDate && g.endDate !== g.startDate) { const d2 = new Date(g.endDate + "T00:00"); s += " – " + d2.toLocaleDateString(undefined, d2.getMonth() === d1.getMonth() ? { day: "numeric" } : o); }
  if (g.allDay) return s;
  if (g.startTime) s += " · " + fmtTime(g.startTime) + (g.endTime ? "–" + fmtTime(g.endTime) : "");
  return s;
}

/* ---------------- control builders ---------------- */
const K = (id, name, section, color) => ({ id, kind: "knob", name, ...(section ? { section } : {}), ...(color ? { color } : {}) });
const SW = (id, name, options, section) => ({ id, kind: "switch", name, options, ...(section ? { section } : {}) });
const SEL = (id, name, options, section) => ({ id, kind: "selector", name, options, ...(section ? { section } : {}) });
const CON = (id, name, outer, inner, section) => ({ id, kind: "concentric", name, outer, inner, ...(section ? { section } : {}) });

function twin(p, master) {
  const c = [
    K(p + "nv", "Volume", "Normal"), K(p + "nt", "Treble", "Normal"), K(p + "nm", "Middle", "Normal"), K(p + "nb", "Bass", "Normal"),
    K(p + "vv", "Volume", "Vibrato"), K(p + "vt", "Treble", "Vibrato"), K(p + "vm", "Middle", "Vibrato"), K(p + "vb", "Bass", "Vibrato"),
    K(p + "vr", "Reverb", "Vibrato"), K(p + "vs", "Speed", "Vibrato"), K(p + "vi", "Intensity", "Vibrato"),
    SW(p + "nbr", "Bright", ["Off", "On"], "Normal"), SW(p + "vbr", "Bright", ["Off", "On"], "Vibrato"),
  ];
  if (master) c.push(K(p + "mv", "Master", "Master"));
  return c;
}

const DEFAULTS = [
  {
    id: "amp_deluxe65", type: "amp", name: "Fender Deluxe Reverb ('65 RI)", color: "#16181d", knob: "#e7e0cd",
    isHead: false, preloaded: true, style: "numbered", inputs: ["Normal 1", "Normal 2", "Vibrato 1", "Vibrato 2"],
    controls: [
      K("d_nv", "Volume", "Normal"), K("d_nt", "Treble", "Normal"), K("d_nb", "Bass", "Normal"),
      K("d_vv", "Volume", "Vibrato"), K("d_vt", "Treble", "Vibrato"), K("d_vb", "Bass", "Vibrato"),
      K("d_vr", "Reverb", "Vibrato"), K("d_vs", "Speed", "Vibrato"), K("d_vi", "Intensity", "Vibrato"),
    ],
  },
  { id: "amp_twin70", type: "amp", name: "Fender Twin Reverb ('70s SF)", color: "#b7bcc2", knob: "#1c1e23", isHead: false, preloaded: true, style: "numbered", inputs: ["Normal 1", "Normal 2", "Vibrato 1", "Vibrato 2"], controls: twin("tw_", true) },
  { id: "amp_minitwin", type: "amp", name: "Mini Twin (custom head)", color: "#1f3b2c", knob: "#e7e0cd", isHead: true, preloaded: true, style: "numbered", inputs: ["Normal 1", "Normal 2", "Vibrato 1", "Vibrato 2"], controls: twin("mt_", true) },
  {
    id: "amp_nashville400", type: "amp", name: "Peavey Nashville 400", color: "#15171c", knob: "#3f8fdc", isHead: false, preloaded: true, style: "numbered", inputs: ["High Gain", "Low Gain"],
    controls: [K("nv_pre", "Pre gain"), K("nv_post", "Post gain"), K("nv_low", "Low"), K("nv_mid", "Mid"), K("nv_high", "High"), K("nv_shift", "Shift"), K("nv_pres", "Presence"), K("nv_rev", "Reverb"), SW("nv_br", "Bright", ["Off", "On"])],
  },
  {
    id: "amp_redknob", type: "amp", name: "Fender Deluxe (red knob)", color: "#15171c", knob: "#d23b2f", isHead: false, preloaded: true, style: "numbered", inputs: ["Input"],
    controls: [K("rk_gain", "Gain"), K("rk_vol", "Volume"), K("rk_tre", "Treble"), K("rk_mid", "Middle"), K("rk_bas", "Bass"), K("rk_rev", "Reverb"), K("rk_pres", "Presence"), SW("rk_ch", "Channel", ["Clean", "Drive"])],
  },
  { id: "ped_keeley_comp", type: "pedal", name: "Keeley Compressor Plus", color: "#2f6fb0", knob: "#eef1f4", preloaded: true, style: "default", inputs: [], controls: [K("kc_sus", "Sustain"), K("kc_lvl", "Level"), K("kc_bld", "Blend"), K("kc_tone", "Tone"), SW("kc_pick", "Voicing", ["Single", "Humbucker"])] },
  { id: "ped_keeley_katana", type: "pedal", name: "Keeley Katana boost", color: "#c4c8cd", knob: "#1c1e23", preloaded: true, style: "default", inputs: [], controls: [K("kk_vol", "Volume"), SW("kk_gain", "Gain", ["Lo", "Hi"])] },
  { id: "ped_greer_lightspeed", type: "pedal", name: "Greer Lightspeed", color: "#c9a23a", knob: "#1c1e23", preloaded: true, style: "default", inputs: [], controls: [K("gl_lvl", "Level"), K("gl_tone", "Tone"), K("gl_drv", "Drive")] },
  {
    id: "ped_midnight", type: "pedal", name: "The Midnight Special", color: "#f1ede4", knob: "#ef7d2b", face: "#1c1e23", preloaded: true, style: "default", inputs: [],
    controls: [
      K("ms_vol", "Volume", "OCD", "#ef7d2b"), K("ms_tone", "Tone", "OCD", "#ef7d2b"), K("ms_dist", "Distortion", "OCD", "#ef7d2b"), SW("ms_boost", "Boost", ["Off", "On"], "OCD"),
      K("ms_spd", "Speed", "Tremolo", "#2f6fb0"), K("ms_int", "Intensity", "Tremolo", "#2f6fb0"), SW("ms_rng", "Speed range", ["Lo", "Hi"], "Tremolo"),
    ],
  },
  { id: "ped_mxr_distplus", type: "pedal", name: "MXR Distortion+", color: "#f2c14e", knob: "#1c1e23", preloaded: true, style: "default", inputs: [], controls: [K("md_out", "Output"), K("md_dist", "Distortion")] },
  { id: "ped_mxr_phase95", type: "pedal", name: "MXR Phase 95", color: "#e8731f", knob: "#1c1e23", preloaded: true, style: "default", inputs: [], controls: [K("mp_spd", "Speed"), SW("mp_voice", "Voice", ["Script", "Block"]), SW("mp_ph", "Phase", ["45", "90"])] },
  { id: "ped_boss_ce3", type: "pedal", name: "Boss CE-3 Chorus", color: "#2a8fa0", knob: "#eef1f4", preloaded: true, style: "default", inputs: [], controls: [K("bc_rate", "Rate"), K("bc_depth", "Depth"), SW("bc_mode", "Mode", ["Mode I", "Mode II"])] },
  { id: "ped_boss_dd6", type: "pedal", name: "Boss DD-6 Delay", color: "#cfd3d6", knob: "#1c1e23", preloaded: true, style: "default", inputs: [], controls: [K("dd_lvl", "E. level"), K("dd_fb", "F. back"), K("dd_time", "D. time"), SEL("dd_mode", "Mode", ["50ms", "200ms", "800ms", "Hold", "Warp", "Reverse", "SOS"])] },
  { id: "ped_ehx_holygrail", type: "pedal", name: "EHX Holy Grail Nano", color: "#cfd3d6", knob: "#1c1e23", preloaded: true, style: "default", inputs: [], controls: [K("hg_rev", "Reverb"), SW("hg_mode", "Mode", ["Spring", "Hall", "Flerb"])] },
  { id: "ped_dod_fx200", type: "pedal", name: "DOD Stereo Phaser FX200", color: "#1f5fa0", knob: "#eef1f4", preloaded: true, style: "default", inputs: [], controls: [K("d2_spd", "Speed"), K("d2_width", "Width")] },
  { id: "ped_dod_fx20b", type: "pedal", name: "DOD Stereo Phaser FX20B", color: "#1f5fa0", knob: "#eef1f4", preloaded: true, style: "default", inputs: [], controls: [K("d20_spd", "Speed"), K("d20_sweep", "Sweep")] },
  { id: "ped_jhs_3reverb", type: "pedal", name: "JHS 3 Series Reverb", color: "#c43b32", knob: "#eef1f4", preloaded: true, style: "default", inputs: [], controls: [K("j3_rev", "Reverb"), K("j3_dec", "Decay"), SW("j3_mode", "Mode", ["Spring", "Plate", "Hall"])] },
];

/* ---------------- instances ---------------- */
function blankInstance(device) {
  const vals = {};
  (device.controls || []).forEach(c => { vals[c.id] = c.kind === "concentric" ? { inner: 0, outer: 0 } : 0; });
  return { iid: uid(), deviceId: device.id, vals, knobStyle: device.style || "clock", styleOverrides: {}, sweep: {}, input: device.type === "amp" && device.inputs?.length ? device.inputs[0] : null, engaged: true, notes: "", label: "", spec: null };
}
const deviceOf = (inst, devices) => inst.spec || devices.find(d => d.id === inst.deviceId);
function fromPreset(device, preset) {
  const i = blankInstance(device);
  i.vals = { ...i.vals, ...JSON.parse(JSON.stringify(preset.vals)) };
  if (preset.knobStyle) i.knobStyle = preset.knobStyle;
  if (preset.styleOverrides) i.styleOverrides = { ...preset.styleOverrides };
  return i;
}
const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; const a = arr.slice(); const t = a[i]; a[i] = a[j]; a[j] = t; return a; };

/* ---------------- storage ---------------- */
const persistent = typeof window !== "undefined" && (window.storage || window.localStorage);
async function loadKey(k) {
  try {
    if (typeof window !== "undefined" && window.storage) { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
    if (typeof window !== "undefined" && window.localStorage) { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : null; }
  } catch (e) {}
  return null;
}
async function saveKey(k, v) {
  try {
    if (typeof window !== "undefined" && window.storage) { await window.storage.set(k, JSON.stringify(v)); return; }
    if (typeof window !== "undefined" && window.localStorage) window.localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
}
async function delKey(k) {
  try {
    if (typeof window !== "undefined" && window.storage) { await window.storage.delete(k); return; }
    if (typeof window !== "undefined" && window.localStorage) window.localStorage.removeItem(k);
  } catch (e) {}
}

function downscale(file, max = 1100, q = 0.72) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * s), h = Math.round(img.height * s);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", q));
    };
    img.onerror = rej; img.src = url;
  });
}

/* ============================ UI primitives ============================ */
function Btn({ children, onClick, kind = "ghost", small, disabled, style, title }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 7, cursor: disabled ? "default" : "pointer", fontFamily: DISP, fontWeight: 600, fontSize: small ? 12.5 : 13.5, letterSpacing: ".2px", borderRadius: 9, padding: small ? "6px 10px" : "9px 14px", border: "1.5px solid transparent", opacity: disabled ? 0.45 : 1, lineHeight: 1, userSelect: "none" };
  const kinds = {
    primary: { background: T.accent, color: T.accentInk, border: "1.5px solid " + T.accent },
    ghost: { background: T.panel2, color: T.text, border: "1.5px solid " + T.line },
    quiet: { background: "transparent", color: T.dim, border: "1.5px solid transparent" },
    danger: { background: "transparent", color: T.red, border: "1.5px solid " + T.line },
  };
  return <button title={title} disabled={disabled} onClick={onClick} style={{ ...base, ...kinds[kind], ...style }}
    onMouseEnter={e => { if (!disabled && kind !== "primary") e.currentTarget.style.borderColor = T.accent; }}
    onMouseLeave={e => { if (kind !== "primary") e.currentTarget.style.borderColor = kind === "quiet" ? "transparent" : T.line; }}>{children}</button>;
}
const Label = ({ children, color = T.faint }) => <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".5px", color, textTransform: "lowercase" }}>{children}</span>;
const inputStyle = { width: "100%", boxSizing: "border-box", background: T.bg, color: T.text, border: "1.5px solid " + T.line, borderRadius: 9, padding: "9px 11px", fontFamily: BODY, fontSize: 14, outline: "none" };
function Field({ label, children }) { return <label style={{ display: "block" }}><div style={{ marginBottom: 5 }}><Label>{label}</Label></div>{children}</label>; }
function Modal({ children, onClose, title }) {
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(6,8,11,.74)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "44px 16px", overflowY: "auto" }}>
    <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 470, background: T.panel, border: "1.5px solid " + T.line, borderRadius: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 17px", borderBottom: "1px solid " + T.lineSoft }}><span style={{ fontFamily: DISP, fontWeight: 600, fontSize: 15 }}>{title}</span><X size={19} color={T.faint} style={{ cursor: "pointer" }} onClick={onClose} /></div>
      <div style={{ padding: 17 }}>{children}</div>
    </div>
  </div>;
}
const Empty = ({ text }) => <div style={{ border: "1.5px dashed " + T.line, borderRadius: 11, padding: 16, color: T.faint, fontSize: 13, fontFamily: BODY }}>{text}</div>;

/* ============================ KNOBS ============================ */
/* generic metallic knob — used by default (0-10 ring) and clock (clock ring) */
function GenericKnob({ angle, style, sweep, knobColor }) {
  const gid = useRef("g" + uid()).current;
  const ring = [];
  if (style === "default") {
    for (let i = 0; i <= 10; i++) { const a = (sweep.min + (i / 10) * (sweep.max - sweep.min)) * Math.PI / 180, big = i % 5 === 0;
      ring.push(<line key={"t" + i} x1={50 + Math.sin(a) * 37} y1={50 - Math.cos(a) * 37} x2={50 + Math.sin(a) * 41} y2={50 - Math.cos(a) * 41} stroke="#8b929c" strokeWidth={big ? 1.5 : 0.8} opacity={big ? 0.95 : 0.5} />);
      if (big) ring.push(<text key={"n" + i} x={50 + Math.sin(a) * 46.5} y={50 - Math.cos(a) * 46.5 + 2.4} fontSize="7" fill="#8b929c" textAnchor="middle" fontFamily="monospace">{i}</text>); }
  } else {
    for (let h = 0; h < 12; h++) { const a = h * 30 * Math.PI / 180, big = h % 3 === 0;
      ring.push(<line key={"c" + h} x1={50 + Math.sin(a) * 37} y1={50 - Math.cos(a) * 37} x2={50 + Math.sin(a) * 41} y2={50 - Math.cos(a) * 41} stroke="#8b929c" strokeWidth={big ? 1.5 : 0.7} opacity={big ? 0.9 : 0.45} />); }
  }
  return (
    <svg viewBox="0 0 100 100" width={62} height={62} style={{ touchAction: "none", cursor: "grab", display: "block" }}>
      <defs><radialGradient id={gid} cx="42%" cy="36%" r="72%"><stop offset="0%" stopColor="#363c45" /><stop offset="60%" stopColor="#20242b" /><stop offset="100%" stopColor="#101216" /></radialGradient></defs>
      {ring}
      <circle cx="50" cy="50" r="34" fill={"url(#" + gid + ")"} stroke="#0a0b0d" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="#454b55" strokeWidth="0.6" opacity="0.6" />
      <g transform={"rotate(" + angle + " 50 50)"}><rect x="48.6" y="13" width="2.8" height="25" rx="1.4" fill={knobColor} /></g>
      <circle cx="50" cy="50" r="3.6" fill="#0e0f12" stroke="#454b55" strokeWidth="1" />
    </svg>
  );
}
/* the real Fender black-skirt / silver-disc / 1-10 knob */
function NumberedKnob({ angle, sweep, accent }) {
  const nums = [];
  for (let i = 1; i <= 10; i++) {
    const a = sweep.min + ((i - 1) / 9) * (sweep.max - sweep.min);
    const x = 50 + Math.sin(a * Math.PI / 180) * 33, y = 50 - Math.cos(a * Math.PI / 180) * 33;
    nums.push(<text key={i} x={x} y={y + 2.7} fontSize="8" fill="#efe7d2" textAnchor="middle" fontFamily="monospace" transform={"rotate(" + angle + " " + x + " " + y + ")"}>{i}</text>);
  }
  return (
    <svg viewBox="0 0 100 100" width={62} height={62} style={{ touchAction: "none", cursor: "grab", display: "block" }}>
      <path d="M50 1 L45.5 10 L54.5 10 Z" fill={accent} />
      <g transform={"rotate(" + (-angle) + " 50 50)"}>
        <circle cx="50" cy="50" r="44" fill="#15161a" stroke="#000" strokeWidth="1" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="#3a3c42" strokeWidth="0.6" />
        {nums}
        <circle cx="50" cy="50" r="22" fill="#cfd2d6" stroke="#8b9098" strokeWidth="1.2" />
        <circle cx="50" cy="50" r="22" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.4" />
      </g>
    </svg>
  );
}
function DeadSpaceArc({ sweep, accent }) {
  const t = sweep.max - sweep.min; const r = 33;
  const pt = (deg) => [50 + Math.sin(deg * Math.PI / 180) * r, 50 - Math.cos(deg * Math.PI / 180) * r];
  const [ax, ay] = pt(sweep.min), [bx, by] = pt(sweep.max);
  const large = t > 180 ? 1 : 0;
  return (
    <svg viewBox="0 0 100 100" width={88} height={88}>
      <circle cx="50" cy="50" r={r} fill="none" stroke={T.line} strokeWidth="2" />
      <path d={`M ${ax} ${ay} A ${r} ${r} 0 ${large} 1 ${bx} ${by}`} fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" />
      <path d={`M ${bx} ${by} A ${r} ${r} 0 0 1 ${ax} ${ay}`} fill="none" stroke={T.red} strokeWidth="3" strokeDasharray="2 3" opacity="0.85" />
      <text x="50" y="49" fontSize="13" fill={T.text} textAnchor="middle" fontFamily="monospace">{Math.round(t)}°</text>
      <text x="50" y="60" fontSize="7.5" fill={T.red} textAnchor="middle" fontFamily="monospace">{Math.round(360 - t)}° dead</text>
    </svg>
  );
}
function Knob({ angle, style, sweep = DEF_SWEEP, accent, knobColor, label, pinned, onChange, onStyle, onUnpin, onSweep }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [txt, setTxt] = useState("");
  const start = (e) => {
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    if (style === "numbered") {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const raw = (ev) => { const p = ev.touches ? ev.touches[0] : ev; return Math.atan2(p.clientX - cx, -(p.clientY - cy)) * 180 / Math.PI; };
      let prev = raw(e); let acc = angle;
      const mv = (ev) => { let c = raw(ev); let dd = c - prev; if (dd > 180) dd -= 360; if (dd < -180) dd += 360; prev = c; acc = clamp(acc + dd, sweep.min, sweep.max); onChange(acc); };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
      return;
    }
    const mv = (ev) => onChange(eventAngle(ev, rect, sweep));
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const r = readout(angle, style, sweep);
  const commit = () => { const a = valueToAngle(txt, style, sweep); if (a != null) onChange(a); };
  const toggle = () => { setTxt(r); setEditing(false); setOpen(o => !o); };
  const total = sweep.max - sweep.min;
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: 72 }}>
      <div ref={ref} onPointerDown={start}>
        {style === "numbered" ? <NumberedKnob angle={angle} sweep={sweep} accent={accent} /> : <GenericKnob angle={angle} style={style} sweep={sweep} knobColor={knobColor} />}
      </div>
      <div style={{ fontSize: 11, color: T.dim, fontFamily: BODY, marginTop: 4, textAlign: "center", lineHeight: 1.15 }}>{label}</div>
      <div onClick={toggle} style={{ marginTop: 3, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: T.text, background: T.bg, border: "1.5px solid " + (pinned ? accent : T.line), borderRadius: 7, padding: "2px 7px" }}>
        {pinned && <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent }} />}{r}
      </div>
      {open && (
        <div style={menuStyle}>
          <div style={{ display: "flex", gap: 5, marginBottom: 7 }}>
            <input autoFocus value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { commit(); setOpen(false); } }}
              placeholder={style === "clock" ? "3:30" : style === "numbered" ? "1–10" : "0–10"}
              style={{ width: 58, background: T.bg, color: T.text, border: "1.5px solid " + T.line, borderRadius: 7, padding: "5px 7px", fontFamily: MONO, fontSize: 12, outline: "none" }} />
            <button onClick={() => { commit(); setOpen(false); }} style={{ fontFamily: DISP, fontWeight: 600, fontSize: 11.5, padding: "5px 10px", borderRadius: 7, cursor: "pointer", background: accent, color: T.accentInk, border: "none" }}>set</button>
          </div>
          {[["default", "Default"], ["clock", "Clock"], ["numbered", "Numbered"]].map(([s, l]) => <div key={s} onClick={() => { onStyle(s); setTxt(readout(angle, s, sweep)); }} style={{ ...menuItem, color: style === s ? accent : T.text }}>{l}{style === s && <Check size={13} />}</div>)}
          <div onClick={() => setEditing(v => !v)} style={menuItem}>Edit{editing && <Check size={13} />}</div>
          {editing && (
            <div style={{ padding: "6px 2px 2px", textAlign: "center" }}>
              <DeadSpaceArc sweep={sweep} accent={accent} />
              <input type="range" min="240" max="360" step="10" value={total} onChange={e => { const t = +e.target.value; onSweep({ min: -t / 2, max: t / 2 }); }} style={{ width: "100%", accentColor: accent }} />
              <div style={{ fontSize: 10.5, color: T.faint, fontFamily: BODY, lineHeight: 1.35, marginTop: 2 }}>The red gap is dead space at the bottom you can't dial into. Standard is 300°.</div>
            </div>
          )}
          {pinned && <div onClick={() => { onUnpin(); setOpen(false); }} style={{ ...menuItem, color: T.dim }}>Match pedal</div>}
        </div>
      )}
    </div>
  );
}
const menuStyle = { position: "absolute", top: "100%", marginTop: 6, background: T.panel3, border: "1.5px solid " + T.line, borderRadius: 10, padding: 6, zIndex: 8, width: 150, boxShadow: "0 12px 30px rgba(0,0,0,.5)" };
const menuItem = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 9px", borderRadius: 7, cursor: "pointer", fontFamily: BODY, fontSize: 13, color: T.text };

function Concentric({ value, style, sweep = DEF_SWEEP, accent, knobColor, control }) {
  const ref = useRef(null); const target = useRef("outer");
  const start = (e) => {
    e.preventDefault(); const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    target.current = (Math.hypot(e.clientX - cx, e.clientY - cy) / (rect.width / 2)) < 0.5 ? "inner" : "outer";
    const mv = (ev) => control.onChange({ ...value, [target.current]: eventAngle(ev, rect, sweep) });
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 86 }}>
      <div ref={ref} onPointerDown={start}>
        <svg viewBox="0 0 100 100" width={74} height={74} style={{ touchAction: "none", cursor: "grab" }}>
          <circle cx="50" cy="50" r="38" fill="#cfd3d9" stroke="#5d626b" strokeWidth="1" />
          <g transform={"rotate(" + value.outer + " 50 50)"}><rect x="48.6" y="10" width="2.8" height="16" rx="1.4" fill={knobColor} /></g>
          <circle cx="50" cy="50" r="22" fill="#e7eaee" stroke="#aab0b8" strokeWidth="1" />
          <g transform={"rotate(" + value.inner + " 50 50)"}><rect x="48.8" y="30" width="2.4" height="14" rx="1.2" fill={accent} /></g>
          <circle cx="50" cy="50" r="3.6" fill="#9aa0a8" />
        </svg>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 4, textAlign: "center", lineHeight: 1.3 }}>{control.outer}: {readout(value.outer, style, sweep)}<br />{control.inner}: {readout(value.inner, style, sweep)}</div>
    </div>
  );
}
function Selector({ value, options, accent, name }) {
  const ref = useRef(null); const n = options.length; const sweep = DEF_SWEEP;
  const angleFor = (i) => n <= 1 ? 0 : sweep.min + (i / (n - 1)) * (sweep.max - sweep.min);
  const pick = (e) => { const rect = ref.current.getBoundingClientRect(); const a = eventAngle(e, rect, sweep); let best = 0, bd = 1e9; for (let i = 0; i < n; i++) { const dd = Math.abs(a - angleFor(i)); if (dd < bd) { bd = dd; best = i; } } value.onChange(best); };
  const ticks = options.map((_, i) => { const a = angleFor(i) * Math.PI / 180; return <line key={i} x1={50 + Math.sin(a) * 37} y1={50 - Math.cos(a) * 37} x2={50 + Math.sin(a) * 42} y2={50 - Math.cos(a) * 42} stroke="#aeb4bd" strokeWidth="1.4" />; });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 84 }}>
      <div ref={ref} onPointerDown={pick} onClick={() => value.onChange((value.index + 1) % n)}>
        <svg viewBox="0 0 100 100" width={62} height={62} style={{ touchAction: "none", cursor: "pointer" }}>
          {ticks}
          <circle cx="50" cy="50" r="32" fill="#1e2127" stroke="#3a3f48" strokeWidth="1.4" />
          <g transform={"rotate(" + angleFor(value.index) + " 50 50)"}><rect x="48.4" y="20" width="3.2" height="22" fill={accent} /></g>
          <circle cx="50" cy="50" r="4.5" fill="#0e0f12" stroke="#4a4d52" strokeWidth="1" />
        </svg>
      </div>
      <div style={{ fontSize: 11, color: T.dim, fontFamily: BODY, marginTop: 4 }}>{name}</div>
      <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: T.text, marginTop: 2 }}>{options[value.index]}</div>
    </div>
  );
}
function Switch({ value, options, accent, name }) {
  const n = options.length;
  return (
    <div>
      <div style={{ marginBottom: 6 }}><Label>{name}</Label></div>
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${n},1fr)`, background: T.bg, border: "1.5px solid " + T.line, borderRadius: 18, padding: 3 }}>
        <div style={{ position: "absolute", top: 3, bottom: 3, left: `calc(${value.index / n * 100}% + 3px)`, width: `calc(${100 / n}% - 6px)`, background: "linear-gradient(180deg,#eef1f4,#bfc5cd)", borderRadius: 14, transition: "left .16s cubic-bezier(.4,1.25,.6,1)", boxShadow: "0 1px 2px rgba(0,0,0,.45)" }} />
        {options.map((o, i) => <button key={i} onClick={() => value.onChange(i)} style={{ position: "relative", zIndex: 1, border: "none", background: "transparent", cursor: "pointer", fontFamily: DISP, fontWeight: 700, fontSize: 11.5, padding: "6px 12px", whiteSpace: "nowrap", color: i === value.index ? "#15171b" : T.dim }}>{o}</button>)}
      </div>
    </div>
  );
}
function Control({ ctrl, inst, accent, onVal, onStyle, onUnpin, onSweep }) {
  const effStyle = inst.styleOverrides[ctrl.id] || inst.knobStyle;
  const sweep = inst.sweep[ctrl.id] || DEF_SWEEP;
  const knobColor = ctrl.color || "#eef1f4";
  if (ctrl.kind === "switch") return <Switch name={ctrl.name} options={ctrl.options} accent={accent} value={{ index: inst.vals[ctrl.id] || 0, onChange: (i) => onVal(ctrl.id, i) }} />;
  if (ctrl.kind === "selector") return <Selector name={ctrl.name} options={ctrl.options} accent={accent} value={{ index: inst.vals[ctrl.id] || 0, onChange: (i) => onVal(ctrl.id, i) }} />;
  if (ctrl.kind === "concentric") return <Concentric style={effStyle} sweep={sweep} accent={accent} knobColor={knobColor} value={inst.vals[ctrl.id] || { inner: 0, outer: 0 }} control={{ inner: ctrl.inner, outer: ctrl.outer, onChange: (v) => onVal(ctrl.id, v) }} />;
  return <Knob angle={inst.vals[ctrl.id] || 0} style={effStyle} sweep={sweep} accent={accent} knobColor={knobColor} label={ctrl.name} pinned={!!inst.styleOverrides[ctrl.id]} onChange={(a) => onVal(ctrl.id, a)} onStyle={(s) => onStyle(ctrl.id, s)} onUnpin={() => onUnpin(ctrl.id)} onSweep={(s) => onSweep(ctrl.id, s)} />;
}
function Controls({ device, inst, accent, handlers, inputs, selectedInput, onInput }) {
  const order = []; const seen = new Set();
  (device.controls || []).forEach(c => { const s = c.section || ""; if (!seen.has(s)) { seen.add(s); order.push(s); } });
  const all = inputs || [];
  const matched = (sec) => all.filter(i => sec && i.toLowerCase().startsWith(sec.toLowerCase()));
  const claimed = new Set(); order.forEach(sec => matched(sec).forEach(i => claimed.add(i)));
  const lead = all.filter(i => !claimed.has(i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {lead.length > 0 && <Jacks inputs={lead} selected={selectedInput} onSelect={onInput} accent={accent} />}
      {order.map(sec => {
        const items = device.controls.filter(c => (c.section || "") === sec);
        const knobs = items.filter(c => c.kind !== "switch"); const switches = items.filter(c => c.kind === "switch");
        const jx = matched(sec);
        return (
          <div key={sec || "_"}>
            {sec && <div style={{ marginBottom: 9 }}><Label color={accent}>{sec}</Label></div>}
            <div style={{ display: "flex", flexWrap: "nowrap", gap: 14, alignItems: "flex-start", overflowX: "auto", paddingBottom: 6 }}>
              {jx.length > 0 && <Jacks inputs={jx} selected={selectedInput} onSelect={onInput} accent={accent} />}
              {knobs.map(c => <Control key={c.id} ctrl={c} inst={inst} accent={accent} {...handlers} />)}
            </div>
            {switches.length > 0 && <div style={{ display: "flex", flexWrap: "nowrap", gap: 14, marginTop: knobs.length ? 12 : 0, overflowX: "auto", paddingBottom: 4 }}>{switches.map(c => <Control key={c.id} ctrl={c} inst={inst} accent={accent} {...handlers} />)}</div>}
          </div>
        );
      })}
    </div>
  );
}
function Jacks({ inputs, selected, onSelect, accent }) {
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", paddingTop: 2 }}>
      {inputs.map(inp => { const on = inp === selected; return (
        <div key={inp} onClick={() => onSelect(inp)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", width: 44 }}>
          <svg width="32" height="32" viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="#0c0d0f" stroke={on ? accent : "#9aa0a8"} strokeWidth={on ? 6 : 3} /><circle cx="50" cy="50" r="19" fill="#050506" stroke="#5b5e64" strokeWidth="2" />{on && <circle cx="50" cy="50" r="8" fill={accent} />}</svg>
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: on ? accent : T.faint, textAlign: "center", lineHeight: 1.1 }}>{inp}</span>
        </div>); })}
    </div>
  );
}

/* ============================ INSTANCE CARD ============================ */
function InstanceCard({ device, inst, displayName, accent, isPedal, order, count, onRename, onMove, onEdit, onDelete, onSavePreset, handlers, onToggleEngaged, onInput }) {
  const light = device.color && /^#(e|f|c|d|b)/i.test(device.color);
  const ink = light ? "#1c1e23" : (device.face || T.text);
  return (
    <div style={{ background: T.panel, border: "1.5px solid " + T.line, borderRadius: 14, overflow: "visible" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderTopLeftRadius: 13, borderTopRightRadius: 13, borderBottom: "1px solid " + T.lineSoft, background: isPedal ? device.color : T.panel2 }}>
        {isPedal && <button onClick={onToggleEngaged} title="Engaged for this gig" style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}><span style={{ width: 11, height: 11, borderRadius: "50%", background: inst.engaged ? T.led : "#444", boxShadow: inst.engaged ? "0 0 8px 1px rgba(63,207,116,.7)" : "none" }} /><Power size={15} color={inst.engaged ? ink : "#777"} /></button>}
        {order != null && <div style={{ display: "flex", flexDirection: "column" }}><ChevronUp size={14} color={order > 1 ? (light ? "#555" : T.dim) : "#3a3f48"} style={{ cursor: order > 1 ? "pointer" : "default" }} onClick={() => order > 1 && onMove(-1)} /><ChevronDown size={14} color={order < count ? (light ? "#555" : T.dim) : "#3a3f48"} style={{ cursor: order < count ? "pointer" : "default" }} onClick={() => order < count && onMove(1)} /></div>}
        <input value={inst.label} onChange={e => onRename(e.target.value)} placeholder={displayName} style={{ flex: "0 0 auto", width: 86, background: "transparent", border: "none", outline: "none", fontFamily: MONO, fontSize: 11, color: light ? "#555" : T.dim }} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 15, color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{device.name}</div>{device.isHead && <span style={{ fontFamily: MONO, fontSize: 10, color: light ? "#555" : T.faint }}>head</span>}</div>
        <Btn small kind="quiet" onClick={onEdit} title="Edit just this one"><Pencil size={13} color={light ? "#555" : T.dim} /></Btn>
        {isPedal && <Btn small kind="quiet" onClick={onSavePreset} title="Save as preset"><Bookmark size={13} color={light ? "#555" : T.dim} /></Btn>}
        <Btn small kind="quiet" onClick={onDelete}><Trash2 size={14} color={light ? "#a33" : T.red} /></Btn>
      </div>
      <div style={{ padding: 15, opacity: isPedal && !inst.engaged ? 0.45 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <Label>knobs</Label>
          <div style={{ display: "inline-flex", gap: 3, background: T.bg, padding: 3, borderRadius: 9, border: "1.5px solid " + T.line }}>{[["default", "Default"], ["clock", "Clock"], ["numbered", "Numbered"]].map(([s, l]) => <button key={s} onClick={() => handlers.onDeviceStyle(s)} style={{ border: "none", cursor: "pointer", fontFamily: DISP, fontWeight: 600, fontSize: 11.5, padding: "5px 10px", borderRadius: 7, background: inst.knobStyle === s ? accent : "transparent", color: inst.knobStyle === s ? T.accentInk : T.dim }}>{l}</button>)}</div>
        </div>
        <Controls device={device} inst={inst} accent={accent} handlers={handlers} inputs={!isPedal ? device.inputs : []} selectedInput={inst.input} onInput={onInput} />
        <input style={{ ...inputStyle, marginTop: 14, fontSize: 13 }} placeholder="Notes…" value={inst.notes} onChange={e => handlers.onNotes(e.target.value)} />
      </div>
    </div>
  );
}

/* ============================ APP ============================ */
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [devices, setDevices] = useState(DEFAULTS);
  const [gigs, setGigs] = useState([]);
  const [presets, setPresets] = useState([]);
  const [tab, setTab] = useState("gigs");
  const [openGig, setOpenGig] = useState(null);
  const [editDevice, setEditDevice] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(() => { (async () => {
    const norm = (s) => s === "numbered" ? "numbered" : s;
    const fix = (i) => { i.knobStyle = norm(i.knobStyle); if (i.styleOverrides) Object.keys(i.styleOverrides).forEach(k => i.styleOverrides[k] = norm(i.styleOverrides[k])); if (i.spec) i.spec.style = norm(i.spec.style); };
    const d = await loadKey("pp2_devices"); const g = await loadKey("pp2_gigs"); const p = await loadKey("pp2_presets");
    if (d && d.length) { d.forEach(dev => dev.style = norm(dev.style)); setDevices(d); }
    if (g) { g.forEach(gg => { (gg.amps || []).forEach(fix); (gg.boards || []).forEach(b => (b.pedals || []).forEach(fix)); }); setGigs(g); }
    if (p) { p.forEach(pr => pr.knobStyle = norm(pr.knobStyle)); setPresets(p); }
    setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded) saveKey("pp2_devices", devices); }, [devices, loaded]);
  useEffect(() => { if (loaded) saveKey("pp2_gigs", gigs); }, [gigs, loaded]);
  useEffect(() => { if (loaded) saveKey("pp2_presets", presets); }, [presets, loaded]);
  const updateGig = (id, fn) => setGigs(gs => gs.map(g => g.id === id ? fn(g) : g));
  const flush = () => { saveKey("pp2_gigs", gigs); saveKey("pp2_devices", devices); saveKey("pp2_presets", presets); };

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: BODY, minHeight: 620 }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap'); *::-webkit-scrollbar{height:8px;width:8px}*::-webkit-scrollbar-thumb{background:" + T.line + ";border-radius:8px} input::placeholder{color:" + T.faint + "}"}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid " + T.lineSoft, background: T.board }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}><Guitar size={19} color={T.accentInk} /></div>
          <div><div style={{ fontFamily: DISP, fontWeight: 800, fontSize: 18, letterSpacing: ".2px" }}>Pedal Planner</div><div style={{ fontFamily: MONO, fontSize: 10, color: T.faint }}>{persistent ? "saved on this device" : "in-session only"}</div></div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>{[["gigs", "Gigs"], ["gear", "Gear"], ["presets", "Presets"]].map(([k, l]) => <button key={k} onClick={() => { setTab(k); setOpenGig(null); }} style={{ background: tab === k ? T.panel2 : "transparent", border: "1.5px solid " + (tab === k ? T.line : "transparent"), color: tab === k ? T.text : T.dim, padding: "8px 14px", borderRadius: 9, cursor: "pointer", fontFamily: DISP, fontWeight: 600, fontSize: 13.5 }}>{l}</button>)}</div>
      </div>

      <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
        {!loaded ? <div style={{ color: T.dim }}>Loading…</div>
          : openGig ? <GigEditor gig={gigs.find(g => g.id === openGig)} devices={devices} presets={presets} setPresets={setPresets} updateGig={updateGig} setOpenGig={setOpenGig} setModal={setModal} setEditDevice={setEditDevice} flush={flush} />
            : tab === "gigs" ? <GigsList gigs={gigs} setGigs={setGigs} setOpenGig={setOpenGig} devices={devices} />
              : tab === "gear" ? <Library devices={devices} setDevices={setDevices} setEditDevice={setEditDevice} setModal={setModal} />
                : <Presets presets={presets} setPresets={setPresets} devices={devices} />}
      </div>

      {editDevice && <DeviceEditor draft={editDevice.draft} onCancel={() => setEditDevice(null)} onSave={(d) => { editDevice.onSave(d); setEditDevice(null); }} />}

      {modal?.kind === "newType" && (
        <Modal title="New device" onClose={() => setModal(null)}>
          <div style={{ display: "flex", gap: 10 }}>{["amp", "pedal"].map(t => <button key={t} onClick={() => { setModal(null); setEditDevice({ draft: newDraft(t), onSave: (d) => setDevices(ds => [...ds, d]) }); }} style={{ flex: 1, background: T.panel2, border: "1.5px solid " + T.line, color: T.text, borderRadius: 11, padding: "22px 0", cursor: "pointer", fontFamily: DISP, fontWeight: 700, fontSize: 16, textTransform: "capitalize" }}>{t}</button>)}</div>
        </Modal>
      )}
      {modal?.kind === "pickAmp" && <Modal title="Choose an amp" onClose={() => setModal(null)}><DevicePicker devs={devices.filter(d => d.type === "amp")} onPick={(d) => { modal.onPick(d); setModal(null); }} /></Modal>}
      {modal?.kind === "pickPedal" && <PedalPicker devices={devices} presets={presets} onClose={() => setModal(null)} onDone={(d, p) => { modal.onPick(d, p); setModal(null); }} />}
    </div>
  );
}
const newDraft = (t) => ({ id: uid(), type: t, name: "", color: t === "amp" ? "#16181d" : "#2f6fb0", knob: t === "amp" ? "#e7e0cd" : "#eef1f4", isHead: false, preloaded: false, style: t === "amp" ? "numbered" : "default", inputs: t === "amp" ? ["Input 1", "Input 2"] : [], controls: [] });

function DevicePicker({ devs, onPick }) {
  if (!devs.length) return <Empty text="Nothing here yet — add one on the Gear tab." />;
  return <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>{devs.map(d => <button key={d.id} onClick={() => onPick(d)} style={{ display: "flex", alignItems: "center", gap: 11, textAlign: "left", background: T.panel2, border: "1.5px solid " + T.line, borderRadius: 11, padding: "11px 13px", cursor: "pointer", color: T.text }}><span style={{ width: 17, height: 17, borderRadius: 5, background: d.color, border: "1px solid rgba(255,255,255,.14)" }} /><span style={{ flex: 1, fontFamily: DISP, fontWeight: 700, fontSize: 14 }}>{d.name}</span><Plus size={17} color={T.accent} /></button>)}</div>;
}
function PedalPicker({ devices, presets, onClose, onDone }) {
  const [dev, setDev] = useState(null);
  const pedals = devices.filter(d => d.type === "pedal");
  if (!dev) return <Modal title="Add a pedal" onClose={onClose}><DevicePicker devs={pedals} onPick={(d) => { presets.some(p => p.deviceId === d.id) ? setDev(d) : onDone(d, null); }} /></Modal>;
  const mine = presets.filter(p => p.deviceId === dev.id);
  return (
    <Modal title={"Add " + dev.name} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={() => onDone(dev, null)} style={{ background: T.panel2, border: "1.5px solid " + T.line, borderRadius: 11, padding: "12px 14px", cursor: "pointer", color: T.text, textAlign: "left", fontFamily: DISP, fontWeight: 700, fontSize: 14 }}>Blank</button>
        {mine.map(p => <button key={p.id} onClick={() => onDone(dev, p)} style={{ display: "flex", alignItems: "center", gap: 8, background: T.panel2, border: "1.5px solid " + T.line, borderRadius: 11, padding: "12px 14px", cursor: "pointer", color: T.text, textAlign: "left" }}><Bookmark size={15} color={T.accent} /><span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 14 }}>{p.name}</span></button>)}
        <Btn kind="quiet" onClick={() => setDev(null)}><ArrowLeft size={14} /> Back</Btn>
      </div>
    </Modal>
  );
}

/* ============================ GIGS LIST ============================ */
function GigsList({ gigs, setGigs, setOpenGig }) {
  const newGig = () => { const g = { id: uid(), name: "New gig", allDay: false, startDate: "", endDate: "", startTime: "", endTime: "", amps: [], boards: [{ id: uid(), name: "", pedals: [] }], photos: [] }; setGigs(gs => [g, ...gs]); setOpenGig(g.id); };
  const dup = (g) => { const c = JSON.parse(JSON.stringify(g)); c.id = uid(); c.name = g.name + " (copy)"; c.amps.forEach(a => a.iid = uid()); c.boards.forEach(b => { b.id = uid(); b.pedals.forEach(p => p.iid = uid()); }); c.photos = []; setGigs(gs => [c, ...gs]); };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: DISP, fontSize: 22, fontWeight: 800 }}>Gigs</div>
        <Btn kind="primary" onClick={newGig}><Plus size={16} /> New gig</Btn>
      </div>
      {gigs.length === 0 && <Empty text="No gigs yet — tap New gig to start." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {gigs.map(g => (
          <div key={g.id} style={{ background: T.panel, border: "1.5px solid " + T.line, borderRadius: 13, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div onClick={() => setOpenGig(g.id)} style={{ cursor: "pointer", flex: 1 }}>
              <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 17 }}>{g.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.dim, fontSize: 13, marginTop: 4, fontFamily: BODY }}><Calendar size={14} /><span>{fmtGig(g)}</span></div>
              <div style={{ color: T.faint, fontSize: 12, marginTop: 4, fontFamily: BODY }}>{g.amps.length} amp{g.amps.length !== 1 ? "s" : ""} · {g.boards.length} board{g.boards.length !== 1 ? "s" : ""}{g.photos?.length ? " · " + g.photos.length + " photo" + (g.photos.length !== 1 ? "s" : "") : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small onClick={() => dup(g)}><Copy size={14} /> Duplicate</Btn>
              <Btn small kind="danger" onClick={() => { (g.photos || []).forEach(p => delKey("pp2_photo_" + p.id)); setGigs(gs => gs.filter(x => x.id !== g.id)); }}><Trash2 size={14} /></Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ GIG EDITOR ============================ */
function GigEditor({ gig, devices, presets, setPresets, updateGig, setOpenGig, setModal, setEditDevice, flush }) {
  const [photos, setPhotos] = useState({});
  const [saved, setSaved] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  useEffect(() => { (async () => { const out = {}; for (const p of (gig?.photos || [])) { const d = await loadKey("pp2_photo_" + p.id); if (d) out[p.id] = d; } setPhotos(out); })(); }, [gig?.id]);
  const fileRef = useRef(null);
  if (!gig) return null;
  const set = (k, v) => updateGig(gig.id, g => ({ ...g, [k]: v }));
  const ampName = (i) => gig.amps[i].label || (gig.amps.length === 1 ? "Amp" : "Amp " + (i + 1));
  const boardName = (i) => gig.boards[i].name || (gig.boards.length === 1 ? "Pedalboard" : "Pedalboard " + (i + 1));

  const addAmp = (dev) => updateGig(gig.id, g => ({ ...g, amps: [...g.amps, blankInstance(dev)] }));
  const updAmp = (iid, fn) => updateGig(gig.id, g => ({ ...g, amps: g.amps.map(a => a.iid === iid ? fn(a) : a) }));
  const delAmp = (iid) => updateGig(gig.id, g => ({ ...g, amps: g.amps.filter(a => a.iid !== iid) }));
  const addBoard = () => updateGig(gig.id, g => ({ ...g, boards: [...g.boards, { id: uid(), name: "", pedals: [] }] }));
  const delBoard = (bid) => updateGig(gig.id, g => ({ ...g, boards: g.boards.filter(b => b.id !== bid) }));
  const renBoard = (bid, name) => updateGig(gig.id, g => ({ ...g, boards: g.boards.map(b => b.id === bid ? { ...b, name } : b) }));
  const addPedal = (bid, dev, preset) => updateGig(gig.id, g => ({ ...g, boards: g.boards.map(b => b.id === bid ? { ...b, pedals: [...b.pedals, preset ? fromPreset(dev, preset) : blankInstance(dev)] } : b) }));
  const updPedal = (bid, iid, fn) => updateGig(gig.id, g => ({ ...g, boards: g.boards.map(b => b.id === bid ? { ...b, pedals: b.pedals.map(p => p.iid === iid ? fn(p) : p) } : b) }));
  const delPedal = (bid, iid) => updateGig(gig.id, g => ({ ...g, boards: g.boards.map(b => b.id === bid ? { ...b, pedals: b.pedals.filter(p => p.iid !== iid) } : b) }));
  const movePedal = (bid, idx, d) => updateGig(gig.id, g => ({ ...g, boards: g.boards.map(b => b.id === bid ? { ...b, pedals: move(b.pedals, idx, d) } : b) }));

  const mkHandlers = (commit) => ({
    onDeviceStyle: (s) => commit(i => ({ ...i, knobStyle: s })),
    onVal: (cid, v) => commit(i => ({ ...i, vals: { ...i.vals, [cid]: v } })),
    onStyle: (cid, s) => commit(i => ({ ...i, styleOverrides: { ...i.styleOverrides, [cid]: s } })),
    onUnpin: (cid) => commit(i => { const o = { ...i.styleOverrides }; delete o[cid]; return { ...i, styleOverrides: o }; }),
    onSweep: (cid, s) => commit(i => ({ ...i, sweep: { ...i.sweep, [cid]: s } })),
    onNotes: (v) => commit(i => ({ ...i, notes: v })),
  });
  const editInstance = (dev, inst, commit) => setEditDevice({ draft: JSON.parse(JSON.stringify(inst.spec || dev)), onSave: (spec) => commit(i => ({ ...i, spec })) });

  const addPhotos = async (files) => { const adds = []; for (const f of files) { try { const d = await downscale(f); const id = uid(); await saveKey("pp2_photo_" + id, d); adds.push({ id }); setPhotos(p => ({ ...p, [id]: d })); } catch (e) {} } if (adds.length) set("photos", [...(gig.photos || []), ...adds]); };
  const delPhoto = (id) => { delKey("pp2_photo_" + id); setPhotos(p => { const n = { ...p }; delete n[id]; return n; }); set("photos", (gig.photos || []).filter(x => x.id !== id)); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Btn kind="quiet" onClick={() => setOpenGig(null)} style={{ paddingLeft: 0 }}><ArrowLeft size={15} /> All gigs</Btn>
        <Btn kind="primary" onClick={() => { flush && flush(); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? <><Check size={15} /> Saved</> : "Save gig"}</Btn>
      </div>

      <div style={{ background: T.panel, border: "1.5px solid " + T.line, borderRadius: 14, padding: 16, marginBottom: 18 }}>
        <Field label="Gig name"><input style={{ ...inputStyle, fontFamily: DISP, fontSize: 18, fontWeight: 700 }} value={gig.name} onChange={e => set("name", e.target.value)} placeholder="e.g. RB Weekend" /></Field>
        <div style={{ marginTop: 14 }}>
          <Label>when</Label>
          <button onClick={() => setWhenOpen(o => !o)} style={{ ...inputStyle, marginTop: 5, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: BODY }}>
            <Calendar size={15} color={T.dim} /> {fmtGig(gig)}
          </button>
          {whenOpen && (
            <div style={{ marginTop: 10, background: T.panel2, border: "1.5px solid " + T.line, borderRadius: 11, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><input type="checkbox" id="ad" checked={gig.allDay} onChange={e => set("allDay", e.target.checked)} /><label htmlFor="ad" style={{ fontSize: 13, color: T.text, fontFamily: BODY }}>All-day</label></div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "10px 10px", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: T.dim }}>starts</span>
                <input type="date" style={inputStyle} value={gig.startDate} onChange={e => set("startDate", e.target.value)} />
                {!gig.allDay ? <input type="time" style={inputStyle} value={gig.startTime} onChange={e => set("startTime", e.target.value)} /> : <span />}
                <span style={{ fontFamily: MONO, fontSize: 11, color: T.dim }}>ends</span>
                <input type="date" style={inputStyle} value={gig.endDate} onChange={e => set("endDate", e.target.value)} />
                {!gig.allDay ? <input type="time" style={inputStyle} value={gig.endTime} onChange={e => set("endTime", e.target.value)} /> : <span />}
              </div>
              <Btn small onClick={() => setWhenOpen(false)} style={{ marginTop: 12 }}><Check size={13} /> Done</Btn>
            </div>
          )}
        </div>
      </div>

      <Sec title="Photos" onAdd={() => fileRef.current?.click()} addLabel="Add">
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { addPhotos(Array.from(e.target.files || [])); e.target.value = ""; }} />
        {(!gig.photos || gig.photos.length === 0) && <Empty text="Photos of your rig, for reference while you dial it in." />}
        {gig.photos?.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {gig.photos.map(p => (
              <div key={p.id} style={{ position: "relative" }}>
                {photos[p.id] ? <img src={photos[p.id]} alt="" onClick={() => setLightbox(photos[p.id])} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 11, border: "1.5px solid " + T.line, cursor: "zoom-in" }} /> : <div style={{ width: 120, height: 120, borderRadius: 11, background: T.panel2, display: "flex", alignItems: "center", justifyContent: "center" }}><ImageIcon size={22} color={T.faint} /></div>}
                <button onClick={() => delPhoto(p.id)} style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,.65)", border: "none", borderRadius: 7, width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} color="#fff" /></button>
              </div>
            ))}
          </div>
        )}
      </Sec>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <img src={lightbox} alt="" style={{ maxWidth: "94vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 8 }} />
          <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,.12)", border: "none", borderRadius: 10, width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={20} color="#fff" /></button>
        </div>
      )}

      <Sec title="Amps" onAdd={() => setModal({ kind: "pickAmp", onPick: addAmp })} addLabel="Add amp">
        {gig.amps.length === 0 && <Empty text="No amps." />}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {gig.amps.map((inst, i) => { const commit = (fn) => updAmp(inst.iid, fn); const dev = deviceOf(inst, devices); if (!dev) return null;
            return <InstanceCard key={inst.iid} device={dev} inst={inst} displayName={ampName(i)} accent={T.accent} isPedal={false} onRename={(v) => commit(x => ({ ...x, label: v }))} onInput={(v) => commit(x => ({ ...x, input: v }))} onEdit={() => editInstance(dev, inst, commit)} onDelete={() => delAmp(inst.iid)} handlers={mkHandlers(commit)} />; })}
        </div>
      </Sec>

      {gig.boards.map((board, bi) => (
        <Sec key={board.id}
          titleNode={<div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: T.accent }} /><input value={board.name} placeholder={boardName(bi)} onChange={e => renBoard(board.id, e.target.value)} style={{ background: "transparent", border: "none", outline: "none", fontFamily: DISP, fontWeight: 700, fontSize: 16, color: T.text, width: 210 }} /></div>}
          onAdd={() => setModal({ kind: "pickPedal", onPick: (d, p) => addPedal(board.id, d, p) })} addLabel="Add pedal"
          extra={gig.boards.length > 1 ? <Btn small kind="danger" onClick={() => delBoard(board.id)}><Trash2 size={13} /></Btn> : null}>
          {board.pedals.length === 0 && <Empty text="No pedals on this board." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {board.pedals.map((inst, idx) => { const commit = (fn) => updPedal(board.id, inst.iid, fn); const dev = deviceOf(inst, devices); if (!dev) return null;
              return <InstanceCard key={inst.iid} device={dev} inst={inst} displayName={dev.name} accent={T.accent} isPedal order={idx + 1} count={board.pedals.length} onMove={(d) => movePedal(board.id, idx, d)} onToggleEngaged={() => commit(x => ({ ...x, engaged: !x.engaged }))} onRename={(v) => commit(x => ({ ...x, label: v }))} onEdit={() => editInstance(dev, inst, commit)} onDelete={() => delPedal(board.id, inst.iid)}
                onSavePreset={() => { const name = window.prompt("Save these " + dev.name + " settings as:", dev.name + " — " + gig.name); if (name) setPresets(ps => [...ps, { id: uid(), name, deviceId: inst.deviceId, vals: JSON.parse(JSON.stringify(inst.vals)), knobStyle: inst.knobStyle, styleOverrides: inst.styleOverrides }]); }}
                handlers={mkHandlers(commit)} />; })}
          </div>
        </Sec>
      ))}
      <Btn onClick={addBoard} style={{ marginTop: 4 }}><Plus size={15} /> Add board</Btn>
    </div>
  );
}
function Sec({ title, titleNode, onAdd, addLabel = "Add", extra, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        {titleNode || <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: T.accent }} /><span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 16 }}>{title}</span></div>}
        <div style={{ display: "flex", gap: 6 }}>{extra}<Btn small onClick={onAdd}><Plus size={14} /> {addLabel}</Btn></div>
      </div>
      {children}
    </div>
  );
}

/* ============================ LIBRARY ============================ */
function Library({ devices, setDevices, setEditDevice, setModal }) {
  const dup = (d) => { const c = JSON.parse(JSON.stringify(d)); c.id = uid(); c.preloaded = false; c.name = d.name + " (copy)"; c.controls = c.controls.map(x => ({ ...x, id: uid() })); setDevices(ds => [...ds, c]); };
  const Card = (d) => (
    <div key={d.id} style={{ background: T.panel, border: "1.5px solid " + T.line, borderRadius: 13, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: d.color, border: "1px solid rgba(255,255,255,.14)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 11, height: 11, borderRadius: "50%", background: d.knob }} /></div>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 14 }}>{d.name}</div><div style={{ fontFamily: MONO, fontSize: 11, color: T.faint }}>{d.controls.filter(c => c.kind !== "switch").length} knobs{d.type === "amp" ? " · " + d.inputs.length + " inputs" : ""}{d.isHead ? " · head" : ""}{d.preloaded ? " · preloaded" : ""}</div></div>
      <Btn small kind="quiet" onClick={() => setEditDevice({ draft: JSON.parse(JSON.stringify(d)), onSave: (nd) => setDevices(ds => ds.map(x => x.id === nd.id ? nd : x)) })}><Pencil size={13} /></Btn>
      <Btn small kind="quiet" onClick={() => dup(d)}><Copy size={13} /></Btn>
      <Btn small kind="quiet" onClick={() => setDevices(ds => ds.filter(x => x.id !== d.id))}><Trash2 size={13} color={T.red} /></Btn>
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: DISP, fontSize: 22, fontWeight: 800 }}>Gear</div>
        <div style={{ display: "flex", gap: 6 }}><Btn small onClick={() => { if (window.confirm("Reset library to preloaded gear? Custom devices are removed.")) setDevices(DEFAULTS); }}><RotateCcw size={13} /> Reset</Btn><Btn kind="primary" onClick={() => setModal({ kind: "newType" })}><Plus size={16} /> New device</Btn></div>
      </div>
      <div style={{ marginBottom: 9 }}><Label color={T.accent}>amps</Label></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>{devices.filter(d => d.type === "amp").map(Card)}</div>
      <div style={{ marginBottom: 9 }}><Label color={T.accent}>pedals</Label></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{devices.filter(d => d.type === "pedal").map(Card)}</div>
    </div>
  );
}

/* ============================ DEVICE / INSTANCE EDITOR ============================ */
function DeviceEditor({ draft, onSave, onCancel }) {
  const [d, setD] = useState(draft);
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const colors = ["#16181d", "#b7bcc2", "#1f3b2c", "#f1ede4", "#2f6fb0", "#c9a23a", "#f2c14e", "#e8731f", "#c43b32", "#2a8fa0", "#1f5fa0", "#cfd3d6"];
  const knobs = ["#e7e0cd", "#1c1e23", "#eef1f4", "#d23b2f", "#3f8fdc", "#ef7d2b", "#f0892c"];
  const addCtrl = (kind) => setD(p => ({ ...p, controls: [...p.controls, kind === "knob" ? K(uid(), "New knob") : kind === "switch" ? SW(uid(), "New switch", ["Off", "On"]) : kind === "selector" ? SEL(uid(), "Selector", ["A", "B", "C"]) : CON(uid(), "Stacked", "Outer", "Inner")] }));
  const upd = (id, k, v) => setD(p => ({ ...p, controls: p.controls.map(c => c.id === id ? { ...c, [k]: v } : c) }));
  const del = (id) => setD(p => ({ ...p, controls: p.controls.filter(c => c.id !== id) }));
  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 60, overflowY: "auto" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: BODY }}>
        <style>{"@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');"}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div><Label color={T.accent}>{d.type}</Label><div style={{ fontFamily: DISP, fontSize: 22, fontWeight: 800 }}>{draft.name ? "Edit gear" : "New " + d.type}</div></div>
          <div style={{ display: "flex", gap: 8 }}><Btn onClick={onCancel}>Cancel</Btn><Btn kind="primary" disabled={!d.name.trim()} onClick={() => onSave(d)}><Check size={15} /> Save</Btn></div>
        </div>
        <div style={{ background: T.panel, border: "1.5px solid " + T.line, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <Field label="Name"><input style={inputStyle} value={d.name} onChange={e => set("name", e.target.value)} placeholder={d.type === "amp" ? "e.g. Vox AC30" : "e.g. Strymon Flint"} /></Field>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 14 }}>
            <div><div style={{ marginBottom: 6 }}><Label>type</Label></div><div style={{ display: "inline-flex", gap: 3, background: T.bg, padding: 3, borderRadius: 9, border: "1.5px solid " + T.line }}>{["amp", "pedal"].map(t => <button key={t} onClick={() => set("type", t)} style={{ border: "none", cursor: "pointer", fontFamily: DISP, fontWeight: 600, fontSize: 12.5, padding: "6px 12px", borderRadius: 7, textTransform: "capitalize", background: d.type === t ? T.accent : "transparent", color: d.type === t ? T.accentInk : T.dim }}>{t}</button>)}</div></div>
            <div><div style={{ marginBottom: 6 }}><Label>knobs</Label></div><div style={{ display: "inline-flex", gap: 3, background: T.bg, padding: 3, borderRadius: 9, border: "1.5px solid " + T.line }}>{[["default", "Default"], ["clock", "Clock"], ["numbered", "Numbered"]].map(([s, l]) => <button key={s} onClick={() => set("style", s)} style={{ border: "none", cursor: "pointer", fontFamily: DISP, fontWeight: 600, fontSize: 12.5, padding: "6px 11px", borderRadius: 7, background: d.style === s ? T.accent : "transparent", color: d.style === s ? T.accentInk : T.dim }}>{l}</button>)}</div></div>
            {d.type === "amp" && <div style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingBottom: 4 }}><input type="checkbox" id="ih" checked={d.isHead} onChange={e => set("isHead", e.target.checked)} /><label htmlFor="ih" style={{ fontSize: 13, color: T.dim }}>Head</label></div>}
          </div>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 16 }}>
            <div><div style={{ marginBottom: 6 }}><Label>enclosure / face</Label></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{colors.map(c => <Chip key={c} c={c} on={d.color === c} onClick={() => set("color", c)} />)}</div></div>
            <div><div style={{ marginBottom: 6 }}><Label>knob color</Label></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{knobs.map(c => <Chip key={c} c={c} on={d.knob === c} onClick={() => set("knob", c)} />)}</div></div>
          </div>
        </div>
        {d.type === "amp" && (
          <Block title="Input jacks" onAdd={() => set("inputs", [...d.inputs, "Input " + (d.inputs.length + 1)])}>
            {d.inputs.map((inp, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}><input style={{ ...inputStyle, flex: 1 }} value={inp} onChange={e => set("inputs", d.inputs.map((x, j) => j === i ? e.target.value : x))} /><Btn small kind="danger" onClick={() => set("inputs", d.inputs.filter((_, j) => j !== i))}><X size={14} /></Btn></div>)}
            {!d.inputs.length && <Empty text="Add the input jacks this amp has." />}
          </Block>
        )}
        <Block title="Controls" addNode={<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[["knob", "Knob"], ["selector", "Selector"], ["switch", "Switch"], ["concentric", "Stacked"]].map(([k, l]) => <Btn key={k} small onClick={() => addCtrl(k)}><Plus size={12} /> {l}</Btn>)}</div>}>
          {d.controls.map(c => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: T.panel2, padding: 9, borderRadius: 9 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: T.accent, width: 58 }}>{c.kind === "concentric" ? "stacked" : c.kind}</span>
              {c.kind === "concentric" ? <><input style={{ ...inputStyle, flex: "1 1 90px" }} value={c.outer} onChange={e => upd(c.id, "outer", e.target.value)} placeholder="Outer" /><input style={{ ...inputStyle, flex: "1 1 90px" }} value={c.inner} onChange={e => upd(c.id, "inner", e.target.value)} placeholder="Inner" /></> : <input style={{ ...inputStyle, flex: "2 1 110px" }} value={c.name} onChange={e => upd(c.id, "name", e.target.value)} placeholder="Name" />}
              {(c.kind === "switch" || c.kind === "selector") && <input style={{ ...inputStyle, flex: "2 1 150px" }} value={c.options.join(", ")} onChange={e => upd(c.id, "options", e.target.value.split(",").map(x => x.trim()).filter(Boolean))} placeholder="Positions, comma separated" />}
              <input style={{ ...inputStyle, flex: "1 1 80px" }} value={c.section || ""} onChange={e => upd(c.id, "section", e.target.value)} placeholder="Section" />
              <Btn small kind="danger" onClick={() => del(c.id)}><X size={14} /></Btn>
            </div>
          ))}
          {!d.controls.length && <Empty text="Add knobs, selector dials (DD-6 style), switches (2/3/4-way), or stacked/concentric knobs." />}
        </Block>
        <div style={{ color: T.faint, fontSize: 12, marginTop: 8, fontFamily: BODY }}>Editing from inside a gig only changes this one — your library copy stays put. “Section” groups controls (Normal / Vibrato, OCD / Tremolo).</div>
      </div>
    </div>
  );
}
const Chip = ({ c, on, onClick }) => <div onClick={onClick} style={{ width: 27, height: 27, borderRadius: 7, background: c, cursor: "pointer", border: on ? "2px solid " + T.accent : "1px solid rgba(255,255,255,.16)" }} />;
function Block({ title, onAdd, addNode, children }) {
  return (
    <div style={{ background: T.panel, border: "1.5px solid " + T.line, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><Label color={T.dim}>{title}</Label>{addNode || <Btn small onClick={onAdd}><Plus size={13} /> Add</Btn>}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

/* ============================ PRESETS ============================ */
function Presets({ presets, setPresets, devices }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}><div style={{ fontFamily: DISP, fontSize: 22, fontWeight: 800 }}>Presets</div><div style={{ color: T.dim, fontSize: 13, marginTop: 4, fontFamily: BODY }}>Saved settings for a single pedal. Save one from a pedal's bookmark in a gig, then reuse it anywhere.</div></div>
      {presets.length === 0 && <Empty text="No presets yet." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {presets.map(p => { const dev = devices.find(d => d.id === p.deviceId); return (
          <div key={p.id} style={{ background: T.panel, border: "1.5px solid " + T.line, borderRadius: 13, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 15, height: 15, borderRadius: 4, background: dev?.color || T.line }} />
            <div style={{ flex: 1 }}><div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 14 }}>{p.name}</div><div style={{ fontFamily: MONO, fontSize: 11, color: T.faint }}>{dev ? dev.name : "device removed"}</div></div>
            <Btn small kind="danger" onClick={() => setPresets(ps => ps.filter(x => x.id !== p.id))}><Trash2 size={14} /></Btn>
          </div>
        ); })}
      </div>
    </div>
  );
}
