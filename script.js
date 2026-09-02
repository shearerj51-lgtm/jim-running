const state={
  garmin:[],
  manual:JSON.parse(localStorage.getItem("jimRunningManual")||"[]"),
  weekGoal:20,
  trendWeeks:4
};
const $=id=>document.getElementById(id);

function num(v){return Number(String(v??"").replace(/,/g,""))||0}
function timeSec(v){
  const p=String(v??"").trim().split(":").map(Number);
  if(p.some(Number.isNaN))return 0;
  if(p.length===3)return p[0]*3600+p[1]*60+p[2];
  if(p.length===2)return p[0]*60+p[1];
  return 0;
}
function dateObj(v){
  if(!v)return null;
  const s=String(v).trim();
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1],+(m[4]||12),+(m[5]||0),+(m[6]||0));
  const d=new Date(s);return isNaN(d)?null:d;
}
function dateValue(v){const d=dateObj(v);return d?d.getTime():0}
function dateText(v){const d=dateObj(v);return d?d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):String(v||"")}
function pace(sec){
  if(!sec||!isFinite(sec))return "—";
  const m=Math.floor(sec/60),s=Math.round(sec%60);
  return `${m}:${String(s).padStart(2,"0")}`;
}
function parseCSV(text){
  text=String(text).replace(/^\uFEFF/,"");
  const rows=[];let row=[],field="",q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(c==='"'&&q&&n==='"'){field+='"';i++;continue}
    if(c==='"'){q=!q;continue}
    if(c===','&&!q){row.push(field);field="";continue}
    if((c==="\n"||c==="\r")&&!q){
      if(c==="\r"&&n==="\n")i++;
      row.push(field);field="";
      if(row.some(x=>x!==""))rows.push(row);
      row=[];continue;
    }
    field+=c;
  }
  if(field||row.length){row.push(field);if(row.some(x=>x!==""))rows.push(row)}
  if(!rows.length)return[];
  const headers=rows[0].map(x=>x.trim());
  return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??"").trim()])));
}
function normalise(r,i){
  if(!(r["Activity Type"]||"").toLowerCase().includes("run"))return null;
  const distance=num(r.Distance),time=timeSec(r.Time);
  if(!distance||!time)return null;
  return {
    id:`g-${r.Date}-${i}`,source:"garmin",date:r.Date,title:r.Title||"Running",
    distance,time,hr:num(r["Avg HR"])||null,cadence:num(r["Avg Run Cadence"])||null,
    calories:num(r.Calories)||null,ascent:num(r["Total Ascent"])||null,steps:num(r.Steps)||null
  };
}
function all(){
  const map=new Map();
  state.garmin.forEach(r=>map.set(r.id,r));
  state.manual.forEach(r=>map.set(r.id,r));
  return [...map.values()].sort((a,b)=>dateValue(b.date)-dateValue(a.date));
}
function summary(rs){
  const km=rs.reduce((a,r)=>a+r.distance,0),sec=rs.reduce((a,r)=>a+r.time,0),hrs=rs.filter(r=>r.hr);
  return {km,sec,count:rs.length,pace:km?sec/km:0,hr:hrs.length?Math.round(hrs.reduce((a,r)=>a+r.hr,0)/hrs.length):null};
}
function startOfWeek(d=new Date()){
  const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;
}
function weekRuns(rs,start){
  const end=new Date(start);end.setDate(end.getDate()+7);
  return rs.filter(r=>{const d=dateObj(r.date);return d&&d>=start&&d<end});
}
function render(){
  const rs=all(),now=new Date(),ws=startOfWeek(),we=new Date(ws);we.setDate(we.getDate()+7);
  const month=rs.filter(r=>{const d=dateObj(r.date);return d&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()});
  const week=weekRuns(rs,ws);
  const ytd=rs.filter(r=>{const d=dateObj(r.date);return d&&d.getFullYear()===now.getFullYear()&&d<=now});
  const sm=summary(month),sw=summary(week),sy=summary(ytd);

  $("weekKm").textContent=sw.km.toFixed(1);
  $("weekRuns").textContent=`${sw.count} ${sw.count===1?"RUN":"RUNS"}`;
  $("weekPace").textContent=`${pace(sw.pace)} /KM`;
  const pct=Math.min(100,sw.km/state.weekGoal*100);
  $("weekGoalFill").style.width=`${pct}%`;
  $("weekGoalLabel").textContent=`${sw.km.toFixed(1)} / ${state.weekGoal} km`;
  $("weekGoalPct").textContent=`${Math.round(pct)}%`;

  $("weekLabel").textContent=`${ws.toLocaleDateString("en-GB",{day:"numeric",month:"short"})} → ${new Date(we-1).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`;
  $("weekRange").textContent=now.toLocaleDateString("en-GB",{year:"numeric"});
  renderWeekStrip(rs,ws);

  $("monthKm").textContent=`${sm.km.toFixed(1)} km`;$("monthCount").textContent=`${sm.count} ${sm.count===1?"run":"runs"}`;
  $("ytdKm").textContent=`${sy.km.toFixed(1)} km`;$("ytdCount").textContent=`${sy.count} ${sy.count===1?"run":"runs"}`;
  const longest=rs.reduce((a,r)=>!a||r.distance>a.distance?r:a,null);
  $("longestKm").textContent=longest?`${longest.distance.toFixed(1)} km`:"0.0 km";
  $("longestWhen").textContent=longest?dateText(longest.date):"—";
  const fastest=rs.filter(r=>r.distance>0).reduce((a,r)=>!a||r.time/r.distance<a.time/a.distance?r:a,null);
  $("bestPace").textContent=fastest?`${pace(fastest.time/fastest.distance)}`:"—";

  renderPBs(rs);
  renderList(rs.slice(0,10));
  drawWeekly(rs);
  drawPace(rs.slice(0,12).reverse());
  $("dataStatus").textContent=`${state.garmin.length} Garmin runs loaded • ${state.manual.length} manual runs`;
  $("updated").textContent=`Updated ${now.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}`;
}
function renderWeekStrip(rs,ws){
  const names=["MON","TUE","WED","THU","FRI","SAT","SUN"],today=new Date();today.setHours(0,0,0,0);
  $("weekStrip").innerHTML=names.map((name,i)=>{
    const d=new Date(ws);d.setDate(ws.getDate()+i);
    const next=new Date(d);next.setDate(d.getDate()+1);
    const dayRuns=rs.filter(r=>{const x=dateObj(r.date);return x&&x>=d&&x<next});
    const km=dayRuns.reduce((a,r)=>a+r.distance,0);
    const isToday=d.getTime()===today.getTime();
    return `<div class="day ${isToday?"today ":""}${dayRuns.length?"hasRun":""}">
      <div class="dayName">${name}</div><div class="dayNum">${d.getDate()}</div><div class="dayKm">${km?km.toFixed(1)+"k":"·"}</div>
    </div>`;
  }).join("");
}
function renderPBs(rs){
  const near5=rs.filter(r=>r.distance>=4.8&&r.distance<=5.3);
  const near10=rs.filter(r=>r.distance>=9.7&&r.distance<=10.5);
  const pb5=near5.length?near5.reduce((a,r)=>!a||r.time/r.distance<a.time/a.distance?r:a,null):null;
  const pb10=near10.length?near10.reduce((a,r)=>!a||r.time/r.distance<a.time/a.distance?r:a,null):null;
  const longest=rs.reduce((a,r)=>!a||r.distance>a.distance?r:a,null);
  $("pb5k").textContent=pb5?pace(pb5.time/pb5.distance*5):"—";
  $("pb5kMeta").textContent=pb5?`${pb5.distance.toFixed(2)} km • ${dateText(pb5.date)}`:"No qualifying run";
  $("pb10k").textContent=pb10?pace(pb10.time/pb10.distance*10):"—";
  $("pb10kMeta").textContent=pb10?`${pb10.distance.toFixed(2)} km • ${dateText(pb10.date)}`:"No qualifying run";
  $("pbLong").textContent=longest?`${longest.distance.toFixed(2)} km`:"—";
  $("pbLongMeta").textContent=longest?dateText(longest.date):"No runs";
}
function renderList(rs){
  $("runList").innerHTML=rs.length?rs.map(r=>`<div class="run">
    <div><div class="runTitle">${safe(r.title)}</div><div class="runDate">${dateText(r.date)}${r.hr?` • ${r.hr} bpm`:""}</div></div>
    <div class="runRight"><div class="runDist">${r.distance.toFixed(2)} km</div><div class="runPace">${pace(r.time/r.distance)} /km</div></div>
  </div>`).join(""):"<div class=\"mutedText\">No runs loaded yet.</div>";
}
function safe(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function canvas(c){
  const ratio=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;
  c.width=w*ratio;c.height=h*ratio;const x=c.getContext("2d");x.scale(ratio,ratio);return{x,w,h};
}
function getWeeklyBuckets(rs,count){
  const end=startOfWeek(new Date()),out=[];
  for(let i=count-1;i>=0;i--){
    const s=new Date(end);s.setDate(end.getDate()-i*7);
    out.push({start:s,runs:weekRuns(rs,s)});
  }
  return out;
}
function drawWeekly(rs){
  const {x,w,h}=canvas($("weeklyChart")),b=getWeeklyBuckets(rs,state.trendWeeks),vals=b.map(z=>z.runs.reduce((a,r)=>a+r.distance,0)),max=Math.max(1,...vals),left=12,right=w-10,top=15,bottom=h-32,cw=right-left;
  x.clearRect(0,0,w,h);
  vals.forEach((v,i)=>{
    const bw=cw/b.length*.62,xx=left+cw*(i+.5)/b.length,bh=(bottom-top)*v/max,yy=bottom-bh;
    x.fillStyle="#111";x.fillRect(xx-bw/2,yy,bw,bh);
    x.fillStyle="#777";x.font="9px sans-serif";x.textAlign="center";
    const lab=b[i].start.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
    x.fillText(lab,xx,h-10);if(v)x.fillText(v.toFixed(0),xx,yy-5);
  });
  const total=vals.reduce((a,v)=>a+v,0),avg=total/b.length;
  $("trendTotal").textContent=`${total.toFixed(1)} km`;
  $("trendAvg").textContent=`${avg.toFixed(1)} km / week`;
}
function drawPace(rs){
  const {x,w,h}=canvas($("paceChart"));x.clearRect(0,0,w,h);if(!rs.length)return;
  const vals=rs.map(r=>r.time/r.distance),lo=Math.min(...vals),hi=Math.max(...vals),range=Math.max(hi-lo,30),left=12,right=w-12,top=18,bottom=h-30;
  x.strokeStyle="#111";x.lineWidth=2;x.beginPath();
  vals.forEach((v,i)=>{const xx=left+(right-left)*(rs.length===1?.5:i/(rs.length-1)),yy=top+(bottom-top)*(v-lo)/range;i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke();
  x.fillStyle="#111";rs.forEach((r,i)=>{const v=r.time/r.distance,xx=left+(right-left)*(rs.length===1?.5:i/(rs.length-1)),yy=top+(bottom-top)*(v-lo)/range;x.beginPath();x.arc(xx,yy,4,0,Math.PI*2);x.fill()});
  x.fillStyle="#777";x.font="9px sans-serif";x.textAlign="left";x.fillText(pace(lo),0,10);x.textAlign="right";x.fillText(pace(hi),w,10);
}
async function load(text){state.garmin=parseCSV(text).map(normalise).filter(Boolean);render()}
async function initial(){
  try{const r=await fetch("Activities.csv",{cache:"no-store"});if(!r.ok)throw Error();await load(await r.text())}
  catch(e){state.garmin=[];render()}
}

$("trendButtons").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  state.trendWeeks=Number(b.dataset.weeks);
  document.querySelectorAll("#trendButtons button").forEach(x=>x.classList.toggle("active",x===b));
  drawWeekly(all());
});
$("addRun").onclick=()=>{
  $("modal").hidden=false;
  const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  $("runDate").value=d.toISOString().slice(0,10);$("runDistance").focus();
};
$("closeModal").onclick=()=>$("modal").hidden=true;
$("modal").onclick=e=>{if(e.target===$("modal"))$("modal").hidden=true};
$("runForm").onsubmit=e=>{
  e.preventDefault();const d=num($("runDistance").value),t=timeSec($("runTime").value);if(!d||!t)return;
  const iso=$("runDate").value.split("-");
  const date=`${iso[2]}/${iso[1]}/${iso[0]} 12:00`;
  state.manual.push({id:`m-${Date.now()}`,source:"manual",date,title:$("runTitle").value.trim()||"Manual run",distance:d,time:t,hr:num($("runHr").value)||null,cadence:num($("runCadence").value)||null});
  localStorage.setItem("jimRunningManual",JSON.stringify(state.manual));e.target.reset();$("modal").hidden=true;render();
};
$("manage").onclick=()=>$("managePanel").hidden=false;
$("closeManage").onclick=()=>$("managePanel").hidden=true;
$("csvFile").onchange=async e=>{const f=e.target.files[0];if(f)await load(await f.text())};
$("exportCsv").onclick=()=>{
  const head=["Activity Type","Date","Title","Distance","Time","Avg HR","Avg Run Cadence","Calories","Total Ascent","Steps"];
  const rows=all().map(r=>["Running",r.date,r.title,r.distance.toFixed(2),formatHMS(r.time),r.hr??"",r.cadence??"",r.calories??"",r.ascent??"",r.steps??""]);
  const csv=[head,...rows].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="Activities-combined.csv";a.click();
};
function formatHMS(s){s=Math.round(s);return`${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`}
window.onresize=render;
initial();
