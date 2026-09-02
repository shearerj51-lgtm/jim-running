const state = {
  baseRuns: [],
  localRuns: JSON.parse(localStorage.getItem("jimRunningLocalRuns") || "[]"),
  goalKm: 80
};

const $ = id => document.getElementById(id);

function parseTime(value) {
  if (value == null) return 0;
  const parts = String(value).trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatTime(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}

function paceString(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2,"0")}`;
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1];
    if (c === '"' && quoted && n === '"') { field += '"'; i++; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (c === "," && !quoted) { row.push(field); field = ""; continue; }
    if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && n === "\n") i++;
      row.push(field); field = "";
      if (row.some(v => v !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field || row.length) { row.push(field); if (row.some(v => v !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(headers.map((h,i) => [h, (r[i] ?? "").trim()])));
}

function normaliseGarmin(row) {
  const type = (row["Activity Type"] || "").toLowerCase();
  if (!type.includes("run")) return null;
  const distance = Number(String(row["Distance"] || "").replace(/,/g,""));
  const time = parseTime(row["Time"]);
  if (!distance || !time) return null;
  return {
    id: `garmin-${row["Date"]}-${row["Title"]}-${distance}`,
    source: "garmin",
    date: row["Date"] || "",
    title: row["Title"] || "Running",
    distance,
    time,
    hr: Number(row["Avg HR"]) || null,
    cadence: Number(row["Avg Run Cadence"]) || null,
    ascent: Number(row["Total Ascent"]) || null,
    calories: Number(row["Calories"]) || null,
    steps: Number(String(row["Steps"] || "").replace(/,/g,"")) || null
  };
}

function allRuns() {
  const map = new Map();
  [...state.baseRuns, ...state.localRuns].forEach(r => map.set(r.id, r));
  return [...map.values()].sort((a,b) => new Date(b.date) - new Date(a.date));
}

function inCurrentWeek(d) {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const start = new Date(now); start.setHours(0,0,0,0); start.setDate(now.getDate() - day);
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return d >= start && d < end;
}

function inCurrentMonth(d) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function inYTD(d) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d <= now;
}

function summarise(runs) {
  const distance = runs.reduce((a,r) => a + r.distance, 0);
  const time = runs.reduce((a,r) => a + r.time, 0);
  const hrRuns = runs.filter(r => r.hr);
  const avgHr = hrRuns.length ? Math.round(hrRuns.reduce((a,r) => a + r.hr, 0) / hrRuns.length) : null;
  return { distance, time, runs: runs.length, pace: distance ? time / distance : 0, avgHr };
}

function render() {
  const runs = allRuns();
  const monthRuns = runs.filter(r => inCurrentMonth(new Date(r.date)));
  const weekRuns = runs.filter(r => inCurrentWeek(new Date(r.date)));
  const ytdRuns = runs.filter(r => inYTD(new Date(r.date)));
  const month = summarise(monthRuns), week = summarise(weekRuns), ytd = summarise(ytdRuns);

  $("monthTitle").textContent = new Date().toLocaleDateString("en-GB", { month: "long" }).toUpperCase();
  $("monthDistance").textContent = month.distance.toFixed(1);
  $("monthRuns").textContent = `${month.runs} ${month.runs === 1 ? "RUN" : "RUNS"}`;
  $("monthPace").textContent = `${paceString(month.pace)} /KM`;
  $("weekDistance").textContent = `${week.distance.toFixed(1)} km`;
  $("weekRuns").textContent = `${week.runs} ${week.runs === 1 ? "run" : "runs"}`;
  $("ytdDistance").textContent = `${ytd.distance.toFixed(1)} km`;
  $("ytdRuns").textContent = `${ytd.runs} ${ytd.runs === 1 ? "run" : "runs"}`;

  const longest = runs.reduce((best,r) => !best || r.distance > best.distance ? r : best, null);
  $("longestDistance").textContent = longest ? `${longest.distance.toFixed(1)} km` : "0.0 km";
  $("longestDate").textContent = longest ? formatDate(longest.date) : "—";
  $("avgHr").textContent = month.avgHr ? `${month.avgHr} bpm` : "—";

  const pct = Math.min(100, (month.distance / state.goalKm) * 100);
  $("goalBar").style.width = `${pct}%`;
  $("goalText").textContent = `${month.distance.toFixed(1)} / ${state.goalKm} km`;
  $("goalPct").textContent = `${Math.round(pct)}%`;

  renderList(runs.slice(0,8));
  drawDistanceChart(runs);
  drawPaceChart(runs.slice(0,12).reverse());
  $("dataNote").textContent = `${state.baseRuns.length} Garmin runs loaded • ${state.localRuns.length} manually added`;
  $("lastUpdated").textContent = `Updated ${new Date().toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit"})}`;
}

function formatDate(value) {
  const d = new Date(value);
  return isNaN(d) ? value : d.toLocaleDateString("en-GB", {day:"numeric", month:"short", year:"numeric"});
}

function renderList(runs) {
  const el = $("runList");
  if (!runs.length) {
    el.innerHTML = `<div class="muted">No running activities found.</div>`;
    return;
  }
  el.innerHTML = runs.map(r => `
    <div class="run">
      <div>
        <div class="run-title">${escapeHTML(r.title || "Running")}</div>
        <div class="run-date">${formatDate(r.date)}${r.hr ? ` • ${r.hr} bpm` : ""}</div>
      </div>
      <div class="run-right">
        <div class="run-distance">${r.distance.toFixed(2)} km</div>
        <div class="run-pace">${paceString(r.time/r.distance)} /km</div>
      </div>
    </div>`).join("");
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
}

function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return {ctx, w:rect.width, h:rect.height};
}

function drawDistanceChart(runs) {
  const {ctx,w,h} = setupCanvas($("distanceChart"));
  const months = Array.from({length:12},(_,i)=>i);
  const values = months.map(m => runs.filter(r => { const d=new Date(r.date); return d.getFullYear()===2026 && d.getMonth()===m; }).reduce((a,r)=>a+r.distance,0));
  const max = Math.max(...values, 1);
  const pad = {l:10,r:8,t:10,b:28};
  const chartW = w-pad.l-pad.r, chartH = h-pad.t-pad.b;
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  values.forEach((v,i)=>{
    const bw = chartW/12 * .58;
    const x = pad.l + chartW*(i+.5)/12;
    const bh = chartH * v/max;
    ctx.fillStyle = "#111";
    ctx.fillRect(x-bw/2, pad.t+chartH-bh, bw, bh);
    ctx.fillStyle = "#777";
    ctx.fillText(["J","F","M","A","M","J","J","A","S","O","N","D"][i], x, h-9);
    if(v>0){ ctx.fillStyle="#111"; ctx.font="9px sans-serif"; ctx.fillText(v.toFixed(0),x,pad.t+chartH-bh-5); ctx.font="10px sans-serif"; }
  });
}

function drawPaceChart(runs) {
  const {ctx,w,h} = setupCanvas($("paceChart"));
  if (!runs.length) return;
  const vals = runs.map(r=>r.time/r.distance);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = Math.max(max-min, 30);
  const pad = {l:10,r:10,t:15,b:28};
  const cw=w-pad.l-pad.r, ch=h-pad.t-pad.b;
  ctx.strokeStyle="#111"; ctx.lineWidth=2; ctx.beginPath();
  vals.forEach((v,i)=>{
    const x=pad.l+(runs.length===1?cw/2:cw*i/(runs.length-1));
    const y=pad.t+((v-min)/range)*ch;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  runs.forEach((r,i)=>{
    const v=r.time/r.distance;
    const x=pad.l+(runs.length===1?cw/2:cw*i/(runs.length-1));
    const y=pad.t+((v-min)/range)*ch;
    ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#777"; ctx.font="9px sans-serif"; ctx.textAlign="center";
    ctx.fillText(formatDate(r.date).replace(" 2026",""),x,h-9);
  });
  ctx.textAlign="left"; ctx.fillStyle="#777"; ctx.fillText(paceString(min),0,10);
  ctx.textAlign="right"; ctx.fillText(paceString(max),w,10);
}

async function loadCSVText(text) {
  state.baseRuns = parseCSV(text).map(normaliseGarmin).filter(Boolean);
  render();
}

async function loadDefaultCSV() {
  try {
    const res = await fetch("Activities.csv", {cache:"no-store"});
    if (!res.ok) throw new Error("CSV not found");
    await loadCSVText(await res.text());
  } catch (e) {
    state.baseRuns = [];
    render();
  }
}

function openModal() {
  $("modal").hidden = false;
  $("activityDate").value = new Date().toISOString().slice(0,10);
  $("activityDistance").focus();
}
function closeModal() { $("modal").hidden = true; }

$("addBtn").addEventListener("click", openModal);
$("closeModal").addEventListener("click", closeModal);
$("modal").addEventListener("click", e => { if(e.target === $("modal")) closeModal(); });

$("activityForm").addEventListener("submit", e => {
  e.preventDefault();
  const distance = Number($("activityDistance").value);
  const time = parseTime($("activityTime").value);
  if (!distance || !time) return;
  const date = $("activityDate").value + "T12:00:00";
  const run = {
    id: `local-${Date.now()}`,
    source: "manual",
    date,
    title: $("activityTitle").value.trim() || "Manual run",
    distance,
    time,
    hr: Number($("activityHr").value) || null,
    cadence: Number($("activityCadence").value) || null,
    ascent: null,
    calories: null,
    steps: null
  };
  state.localRuns.push(run);
  localStorage.setItem("jimRunningLocalRuns", JSON.stringify(state.localRuns));
  e.target.reset();
  closeModal();
  render();
});

$("manageBtn").addEventListener("click", () => $("managePanel").hidden = false);
$("closeManageBtn").addEventListener("click", () => $("managePanel").hidden = true);

$("csvInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  await loadCSVText(await file.text());
});

$("exportBtn").addEventListener("click", () => {
  const headers = ["Activity Type","Date","Favorite","Title","Distance","Calories","Time","Avg HR","Max HR","Avg Run Cadence","Max Run Cadence","Avg Pace","Best Pace","Total Ascent","Total Descent","Avg Stride Length","Training Stress Score®","Steps","Decompression","Best Lap Time","Number of Laps","Moving Time","Elapsed Time","Min Elevation","Max Elevation"];
  const rows = allRuns().map(r => [
    "Running", r.date, "False", r.title, r.distance.toFixed(2), r.calories ?? "", formatTime(r.time),
    r.hr ?? "", "", r.cadence ?? "", "", paceString(r.time/r.distance), "", r.ascent ?? "", "", "", "", r.steps ?? "", "", "", "", formatTime(r.time), formatTime(r.time), "", ""
  ]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download="Activities-combined.csv"; a.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("resize", render);
loadDefaultCSV();
