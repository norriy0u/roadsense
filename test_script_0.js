
const TRUCKS=[
  {id:'TRK-001',driver:'Ravi Sharma',  route:'Mumbai \u2192 Pune',        lat:19.076,lng:72.877},
  {id:'TRK-002',driver:'Amit Patel',   route:'Pune \u2192 Nashik',        lat:18.520,lng:73.856},
  {id:'TRK-003',driver:'Suresh Kumar', route:'Nashik \u2192 Aurangabad',  lat:19.997,lng:73.789},
  {id:'TRK-004',driver:'Deepak Rao',   route:'Aurangabad \u2192 Solapur', lat:19.877,lng:75.343},
  {id:'TRK-005',driver:'Manoj Singh',  route:'Solapur \u2192 Kolhapur',   lat:17.687,lng:75.906},
];
const EVENT_TYPES=[
  {type:'Smooth Road',         severity:'safe',    icon:'\u2705',category:'road'},
  {type:'Rough Surface',       severity:'caution', icon:'\u26a1',category:'road'},
  {type:'Pothole Detected',    severity:'alert',   icon:'\u{1f573}\ufe0f',category:'road'},
  {type:'High Cargo Vibration',severity:'caution', icon:'\u{1f4e6}',category:'cargo'},
  {type:'Cargo Risk Spike',    severity:'alert',   icon:'\u{1f6a8}',category:'cargo'},
  {type:'Speed Bump Detected', severity:'caution', icon:'\u{1f6a7}',category:'road'},
  {type:'Engine Noise High',   severity:'caution', icon:'\u{1f50a}',category:'cargo'},
  {type:'Stable Cargo',        severity:'safe',    icon:'\u2705',category:'cargo'},
  {type:'Sharp Turn Impact',   severity:'caution', icon:'\u21a9\ufe0f',category:'cargo'},
  {type:'Pothole Cluster',     severity:'alert',   icon:'\u26a0\ufe0f',category:'road'},
];
const ROUTES=['Mumbai \u2192 Pune','Pune \u2192 Nashik','Nashik \u2192 Aurangabad','Aurangabad \u2192 Solapur','Solapur \u2192 Kolhapur'];

let allEvents=[],truckState={},currentFilter='all',currentPage='overview';
let selectedTruck=null,roughnessLineChart=null,donutChart=null,barChart=null;
let totalEventsToday=0,leafletMap=null,leafletMarkers={},leafletPolylines={},truckPaths={};
let currentTheme='dark';

TRUCKS.forEach(t=>{
  truckState[t.id]={roughness:rand(10,40),cargoRisk:rand(5,30),status:'safe',lat:t.lat,lng:t.lng,
    history:Array.from({length:60},(_,i)=>({time:new Date(Date.now()-(59-i)*60000),roughness:rand(10,50)}))};
  truckPaths[t.id]=[[t.lat,t.lng]];
});

function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function lerp(a,b,t){return a+(b-a)*t;}
function roughnessColor(v){return v<30?'#2ECC71':v<65?'#F0A030':'#E04535';}
function roughnessLabel(v){return v<30?'Smooth':v<65?'Rough':'Severe';}
function riskLabel(v){return v<30?'\u2705 Safe \u2014 Cargo secure':v<65?'\u26a1 Caution \u2014 Monitor cargo':'\u{1f6a8} High Risk \u2014 Cargo at risk!';}
function riskColor(v){return v<30?'#2ECC71':v<65?'#F0A030':'#E04535';}
function formatTime(d){return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function formatTimeShort(d){return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});}

function toggleTheme(){
  currentTheme=currentTheme==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',currentTheme);
  document.getElementById('theme-toggle').textContent=currentTheme==='dark'?'\u{1f319}':'\u2600\ufe0f';
  updateChartTheme();
}
function getChartColors(){
  return{grid:currentTheme==='dark'?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)',
         tick:currentTheme==='dark'?'#5A5F6B':'#9CA3AF',
         tooltipBg:currentTheme==='dark'?'#1E2229':'#fff',
         tooltipText:currentTheme==='dark'?'#E8E8EA':'#111'};
}
function updateChartTheme(){
  const c=getChartColors();
  [roughnessLineChart,barChart].forEach(ch=>{
    if(!ch)return;
    if(ch.options.scales?.x){ch.options.scales.x.grid.color=c.grid;ch.options.scales.x.ticks.color=c.tick;}
    if(ch.options.scales?.y){ch.options.scales.y.grid.color=c.grid;ch.options.scales.y.ticks.color=c.tick;}
    ch.update('none');
  });
}

function updateClock(){
  const now=new Date();
  document.getElementById('clock-time').textContent=now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  document.getElementById('clock-date').textContent=now.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
}
setInterval(updateClock,1000);updateClock();

function navigateTo(page){
  currentPage=page;
  document.querySelectorAll('.page-view').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn[id^="nav-"]').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.getElementById('nav-'+page).classList.add('active');
  if(page==='analytics')renderAnalytics();
  if(page==='alerts')renderAlerts();
  if(page==='overview'&&leafletMap)setTimeout(()=>leafletMap.invalidateSize(),60);
}

function buildSvgIcon(color,isAlert){
  const glow=isAlert?`<circle cx="18" cy="18" r="17" fill="${color}" opacity="0.14"/>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
    ${glow}<circle cx="18" cy="18" r="13" fill="${color}" stroke="rgba(255,255,255,0.85)" stroke-width="2.5"/>
    <circle cx="18" cy="18" r="5.5" fill="rgba(255,255,255,0.9)"/></svg>`;
}

function initMap(){
  leafletMap=L.map('main-map',{zoomControl:true,scrollWheelZoom:true}).setView([19.0,74.5],7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'\u00a9 OpenStreetMap contributors',maxZoom:19
  }).addTo(leafletMap);
  TRUCKS.forEach(t=>{
    const state=truckState[t.id];
    leafletMarkers[t.id]=createTruckMarker(t,state);
    leafletPolylines[t.id]=L.polyline([[state.lat,state.lng]],
      {color:roughnessColor(state.roughness),weight:3,opacity:0.75,smoothFactor:1}).addTo(leafletMap);
  });
}

function createTruckMarker(truck,state){
  const color=roughnessColor(state.roughness),isAlert=state.roughness>=65;
  const icon=L.divIcon({className:'',
    html:`<div style="position:relative;cursor:pointer;">${isAlert?`<div class="ring-pulse" style="background:${color};opacity:0.22;"></div>`:''
    }${buildSvgIcon(color,isAlert)}</div>`,
    iconSize:[36,36],iconAnchor:[18,18],popupAnchor:[0,-22]});
  const marker=L.marker([state.lat,state.lng],{icon}).addTo(leafletMap)
    .bindPopup(buildPopupHTML(truck,state),{minWidth:220});
  marker.on('click',()=>marker.openPopup());
  return marker;
}

function buildPopupHTML(truck,state){
  const col=roughnessColor(state.roughness);
  return `<div class="popup-inner"><div class="popup-truck-id">${truck.id}</div>
    <div class="popup-driver">\u{1f465} ${truck.driver}</div>
    <div class="popup-row"><span>\u{1f6e3}\ufe0f ${truck.route}</span></div>
    <div class="popup-row">
      <span>Roughness: <strong style="color:${col}">${state.roughness}</strong></span>
      <span>Risk: <strong style="color:${riskColor(state.cargoRisk)}">${state.cargoRisk}</strong></span>
    </div></div>
    <button class="popup-btn" onclick="openTruckDetail('${truck.id}')">View Full Details \u2192</button>`;
}

function updateMapMarkers(){
  TRUCKS.forEach(t=>{
    const state=truckState[t.id];
    state.lat=Math.max(15,Math.min(22,state.lat+(Math.random()-0.5)*0.009));
    state.lng=Math.max(70,Math.min(78,state.lng+(Math.random()-0.5)*0.013));
    if(leafletMarkers[t.id]){
      const color=roughnessColor(state.roughness),isAlert=state.roughness>=65;
      leafletMarkers[t.id].setLatLng([state.lat,state.lng]);
      leafletMarkers[t.id].setIcon(L.divIcon({className:'',
        html:`<div style="position:relative;cursor:pointer;">${isAlert?`<div class="ring-pulse" style="background:${color};opacity:0.22;"></div>`:''
        }${buildSvgIcon(color,isAlert)}</div>`,
        iconSize:[36,36],iconAnchor:[18,18],popupAnchor:[0,-22]}));
      leafletMarkers[t.id].setPopupContent(buildPopupHTML(t,state));
    }
    truckPaths[t.id].push([state.lat,state.lng]);
    if(truckPaths[t.id].length>18)truckPaths[t.id].shift();
    if(leafletPolylines[t.id]){
      leafletPolylines[t.id].setLatLngs(truckPaths[t.id]);
      leafletPolylines[t.id].setStyle({color:roughnessColor(state.roughness)});
    }
  });
}

function centerMap(){
  if(!leafletMap)return;
  const lats=TRUCKS.map(t=>truckState[t.id].lat),lngs=TRUCKS.map(t=>truckState[t.id].lng);
  leafletMap.fitBounds([[Math.min(...lats)-0.3,Math.min(...lngs)-0.3],[Math.max(...lats)+0.3,Math.max(...lngs)+0.3]],{padding:[30,30]});
}

function updateStats(){
  const alerting=TRUCKS.filter(t=>truckState[t.id].status==='alert');
  const avgR=Math.round(TRUCKS.reduce((s,t)=>s+truckState[t.id].roughness,0)/TRUCKS.length);
  animateValue('stat-alerting',parseInt(document.getElementById('stat-alerting').textContent)||0,alerting.length,400);
  animateValue('stat-roughness',parseInt(document.getElementById('stat-roughness').textContent)||0,avgR,500);
  animateValue('stat-events',parseInt(document.getElementById('stat-events').textContent)||0,totalEventsToday,600);
  const alertEl=document.getElementById('stat-alerting');
  if(alerting.length>0){alertEl.classList.add('alerting');document.getElementById('stat-alerting-sub').textContent=alerting.map(t=>t.id).join(', ');document.getElementById('stat-alerting-sub').className='stat-delta down';}
  else{alertEl.classList.remove('alerting');document.getElementById('stat-alerting-sub').textContent='No critical alerts';document.getElementById('stat-alerting-sub').className='stat-delta';}
  document.getElementById('roughness-fill').style.width=avgR+'%';
  document.getElementById('roughness-pct-val').textContent=avgR+'%';
  document.getElementById('stat-events-sub').textContent='\u2191 '+rand(1,3)+' new in last minute';
  document.getElementById('nav-alerts-badge').textContent=allEvents.filter(e=>e.severity==='alert').length;
  document.getElementById('last-sync-time').textContent=formatTime(new Date());
}

function animateValue(id,from,to,dur){
  const el=document.getElementById(id);if(!el)return;
  const start=performance.now();
  (function step(now){
    const p=Math.min(1,(now-start)/dur),ease=1-Math.pow(1-p,3);
    el.textContent=Math.round(lerp(from,to,ease));
    if(p<1)requestAnimationFrame(step);
    else{el.textContent=to;el.classList.add('number-update');setTimeout(()=>el.classList.remove('number-update'),500);}
  })(start);
}

function renderTruckMiniCards(){
  const c=document.getElementById('truck-mini-cards');c.innerHTML='';
  TRUCKS.forEach((t,i)=>{
    const s=truckState[t.id],sc=s.status==='alert'?'status-alert':s.status==='caution'?'status-caution':'status-safe';
    const rc=s.cargoRisk>=66?'risk-alert':s.cargoRisk>=31?'risk-caution':'risk-safe';
    const col=roughnessColor(s.roughness);
    const div=document.createElement('div');
    div.className=`truck-mini-card ${sc} card-animate`;
    div.style.animationDelay=(i*50)+'ms';div.onclick=()=>openTruckDetail(t.id);
    div.innerHTML=`<div class="truck-mini-id">${t.id}</div>
      <div class="truck-mini-driver">\u{1f465} ${t.driver}</div>
      <div class="truck-mini-risk ${rc}">${s.cargoRisk}<span style="font-size:0.75rem;font-weight:500;opacity:0.55;">/100</span></div>
      <div class="truck-mini-label">Cargo Risk Score</div>
      <div style="margin-top:7px;display:flex;align-items:center;gap:6px;">
        <div style="width:7px;height:7px;border-radius:50%;background:${col};box-shadow:0 0 6px ${col}55;${s.status==='alert'?'animation:glow-pulse 1.5s ease-in-out infinite;':''}"></div>
        <span style="font-size:0.65rem;color:var(--text-muted);">${roughnessLabel(s.roughness)} \u00b7 RI ${s.roughness}</span>
      </div>`;
    c.appendChild(div);
  });
}

function renderSidebarTrucks(){
  const c=document.getElementById('sidebar-truck-list');c.innerHTML='';
  TRUCKS.forEach(t=>{
    const s=truckState[t.id],col=roughnessColor(s.roughness),isAlert=s.status==='alert';
    const btn=document.createElement('button');btn.className='nav-btn';btn.onclick=()=>openTruckDetail(t.id);
    btn.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;box-shadow:0 0 ${isAlert?8:4}px ${col}66;${isAlert?'animation:glow-pulse 1.5s ease-in-out infinite;':''}"></span>
      <span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.id}</span>
      <span style="font-size:0.63rem;color:var(--text-muted);">${s.cargoRisk}</span>`;
    c.appendChild(btn);
  });
}

function generateEvent(){
  const truck=TRUCKS[rand(0,TRUCKS.length-1)],evtDef=EVENT_TYPES[rand(0,EVENT_TYPES.length-1)],state=truckState[truck.id];
  if(evtDef.severity==='alert'){state.roughness=rand(65,95);state.cargoRisk=rand(66,95);state.status='alert';}
  else if(evtDef.severity==='caution'){state.roughness=rand(30,64);state.cargoRisk=rand(31,65);state.status='caution';}
  else{state.roughness=rand(5,29);state.cargoRisk=rand(3,29);state.status='safe';}
  state.history.push({time:new Date(),roughness:state.roughness});
  if(state.history.length>60)state.history.shift();
  const evt={id:'evt-'+Date.now()+'-'+Math.random().toString(36).substr(2,4),
    truckId:truck.id,driver:truck.driver,route:truck.route,type:evtDef.type,
    severity:evtDef.severity,icon:evtDef.icon,category:evtDef.category,timestamp:new Date(),
    lat:(state.lat+(Math.random()-0.5)*0.002).toFixed(5),lng:(state.lng+(Math.random()-0.5)*0.002).toFixed(5),
    roughness:state.roughness,cargoRisk:state.cargoRisk};
  allEvents.unshift(evt);if(allEvents.length>200)allEvents.pop();totalEventsToday++;return evt;
}

function renderEventFeed(evt){
  const feed=document.getElementById('event-feed'),sev=evt.severity;
  const card=document.createElement('div');card.className='event-card new-event';card.onclick=()=>openTruckDetail(evt.truckId);
  card.innerHTML=`<div class="event-icon-wrap ${sev}">${evt.icon}</div>
    <div class="event-info">
      <div class="event-truck">${evt.truckId} <span style="font-weight:400;color:var(--text-muted);">\u00b7 ${evt.driver}</span></div>
      <div class="event-type">${evt.type}</div>
      <div class="event-time">${formatTime(evt.timestamp)}</div>
    </div>
    <span class="event-severity-pill pill-${sev}">${sev.toUpperCase()}</span>`;
  feed.insertBefore(card,feed.firstChild);
  while(feed.children.length>22)feed.removeChild(feed.lastChild);
  document.getElementById('feed-count').textContent=feed.children.length+' events';
}

function renderAlerts(){
  const c=document.getElementById('alerts-list');
  let f=allEvents;
  if(currentFilter==='cargo')f=allEvents.filter(e=>e.category==='cargo');
  else if(currentFilter==='road')f=allEvents.filter(e=>e.category==='road');
  else if(currentFilter==='alert')f=allEvents.filter(e=>e.severity==='alert');
  if(!f.length){c.innerHTML='<div class="empty-state"><div class="empty-icon">\u{1f4ed}</div><div>No events matching this filter</div></div>';return;}
  c.innerHTML='';
  f.forEach(evt=>{
    const row=document.createElement('div');row.className=`alert-row sev-${evt.severity}`;row.onclick=()=>openTruckDetail(evt.truckId);
    row.innerHTML=`<div class="alert-row-icon">${evt.icon}</div>
      <div class="alert-row-main">
        <div class="alert-row-title">${evt.type}</div>
        <div class="alert-row-sub">\u{1f4cd} ${evt.lat}, ${evt.lng} \u00b7 ${evt.route} \u00b7 RI: ${evt.roughness} \u00b7 Risk: ${evt.cargoRisk}</div>
      </div>
      <div class="alert-row-truck">${evt.truckId}</div>
      <div class="alert-row-time">${formatTime(evt.timestamp)}</div>`;
    c.appendChild(row);
  });
}
function filterAlerts(f){
  currentFilter=f;document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('f-'+f).classList.add('active');renderAlerts();
}
function clearAlerts(){allEvents=allEvents.filter(e=>e.severity!=='safe');if(currentPage==='alerts')renderAlerts();}

function openTruckDetail(truckId){
  selectedTruck=truckId;const truck=TRUCKS.find(t=>t.id===truckId),state=truckState[truckId];
  document.getElementById('modal-truck-id').textContent=truck.id+' \u{1f69b}';
  document.getElementById('modal-truck-route').textContent='\u{1f6e3}\ufe0f '+truck.route;
  document.getElementById('modal-truck-driver').textContent='\u{1f465} '+truck.driver;
  document.getElementById('truck-modal').classList.add('open');
  updateGauge(state.cargoRisk);renderRoughnessChart(state.history);renderTimeline(truckId);
}
function closeModal(e){
  if(!e||e.target===document.getElementById('truck-modal')){
    document.getElementById('truck-modal').classList.remove('open');selectedTruck=null;
  }
}
function updateGauge(value){
  const arc=document.getElementById('gauge-arc'),valEl=document.getElementById('gauge-value'),lblEl=document.getElementById('gauge-status-label');
  arc.style.strokeDashoffset=236-(value/100)*236;arc.style.stroke=riskColor(value);
  valEl.textContent=value;valEl.style.color=riskColor(value);valEl.style.textShadow=`0 0 20px ${riskColor(value)}66`;
  lblEl.textContent=riskLabel(value);lblEl.style.color=riskColor(value);
}
function renderRoughnessChart(history){
  const ctx=document.getElementById('roughness-line-chart').getContext('2d');
  if(roughnessLineChart)roughnessLineChart.destroy();
  const c=getChartColors();
  roughnessLineChart=new Chart(ctx,{type:'line',data:{
    labels:history.map((h,i)=>i%10===0?formatTimeShort(h.time):''),
    datasets:[{label:'RI',data:history.map(h=>h.roughness),borderColor:'#E04535',
      backgroundColor:'rgba(224,69,53,0.07)',borderWidth:2,pointRadius:0,pointHoverRadius:4,fill:true,tension:0.4}]
  },options:{responsive:true,plugins:{
    legend:{display:false},
    tooltip:{mode:'index',intersect:false,callbacks:{label:c=>`RI: ${c.raw}`},
      backgroundColor:c.tooltipBg,titleColor:c.tooltipText,bodyColor:'#9498A0',borderColor:'rgba(255,255,255,0.08)',borderWidth:1}
  },scales:{
    x:{grid:{color:c.grid,drawBorder:false},ticks:{font:{size:10,family:'Inter'},color:c.tick}},
    y:{min:0,max:100,grid:{color:c.grid},ticks:{font:{size:10,family:'Inter'},color:c.tick},
       title:{display:true,text:'Roughness Index',font:{size:10,family:'Inter'},color:c.tick}}
  },animation:{duration:600,easing:'easeInOutQuart'}}});
}
function renderTimeline(truckId){
  const c=document.getElementById('modal-timeline'),evts=allEvents.filter(e=>e.truckId===truckId).slice(0,12);
  if(!evts.length){c.innerHTML='<div style="color:var(--text-muted);font-size:0.76rem;padding:10px;">No events recorded yet.</div>';return;}
  c.innerHTML='';
  evts.forEach(evt=>{
    const item=document.createElement('div');item.className=`timeline-item t-${evt.severity}`;
    item.innerHTML=`<div class="timeline-content">
      <div class="timeline-time">${formatTime(evt.timestamp)}</div>
      <div class="timeline-event">${evt.icon} ${evt.type} <span style="opacity:0.35;font-size:0.85em;">\u223c</span></div>
      <div class="timeline-coords">GPS: ${evt.lat}, ${evt.lng} \u00b7 RI: ${evt.roughness}</div>
    </div>`;
    c.appendChild(item);
  });
}

function renderAnalytics(){
  const smooth=allEvents.filter(e=>e.severity==='safe').length||42;
  const rough=allEvents.filter(e=>e.severity==='caution').length||31;
  const pothole=allEvents.filter(e=>e.severity==='alert').length||17;
  const total=smooth+rough+pothole;
  const c=getChartColors();
  if(donutChart)donutChart.destroy();
  donutChart=new Chart(document.getElementById('donut-chart').getContext('2d'),{type:'doughnut',
    data:{labels:['Smooth','Rough','Pothole/Severe'],datasets:[{data:[smooth,rough,pothole],
      backgroundColor:['#2ECC71','#F0A030','#E04535'],borderWidth:0,hoverBorderWidth:2,
      hoverBorderColor:'rgba(255,255,255,0.3)',borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'72%',
      plugins:{legend:{display:false},tooltip:{backgroundColor:c.tooltipBg,titleColor:c.tooltipText,
        bodyColor:'#9498A0',borderColor:'rgba(255,255,255,0.08)',borderWidth:1,
        callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw/total*100)}%)`}}},
      animation:{duration:900,easing:'easeInOutQuart'}}});
  const dominant=smooth>=rough&&smooth>=pothole?'Smooth':rough>=pothole?'Rough':'Pothole';
  document.getElementById('donut-center-val').textContent=dominant;
  document.getElementById('donut-legend').innerHTML=[
    {label:'Smooth',color:'#2ECC71',val:smooth},{label:'Rough',color:'#F0A030',val:rough},{label:'Pothole',color:'#E04535',val:pothole}
  ].map(l=>`<div style="display:flex;align-items:center;gap:5px;">
    <div style="width:9px;height:9px;border-radius:3px;background:${l.color};box-shadow:0 0 8px ${l.color}66;"></div>
    <span style="color:var(--text-secondary);">${l.label}: <strong style="color:var(--text-primary);">${Math.round(l.val/total*100)}%</strong></span>
  </div>`).join('');
  if(barChart)barChart.destroy();
  const routeData=ROUTES.map(r=>({route:r,value:rand(20,75)}));
  barChart=new Chart(document.getElementById('bar-chart').getContext('2d'),{type:'bar',
    data:{labels:routeData.map(r=>r.route),datasets:[{label:'RI',data:routeData.map(r=>r.value),
      backgroundColor:routeData.map(r=>r.value<30?'rgba(46,204,113,0.8)':r.value<65?'rgba(240,160,48,0.8)':'rgba(224,69,53,0.8)'),
      borderRadius:8,borderSkipped:false}]},
    options:{responsive:true,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:ctx=>`RI: ${ctx.raw}`},backgroundColor:c.tooltipBg,titleColor:c.tooltipText,
               bodyColor:'#9498A0',borderColor:'rgba(255,255,255,0.08)',borderWidth:1}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9,family:'Inter'},color:c.tick}},
              y:{min:0,max:100,grid:{color:c.grid},ticks:{font:{size:10,family:'Inter'},color:c.tick}}},
      animation:{duration:700,easing:'easeInOutQuart'}}});
  renderMaintenance();
}

function renderMaintenance(){
  const flagged=[
    {id:'TRK-003',reason:'\u2699\ufe0f Suspension stress \u2014 847 km rough road',km:'847 km',urgency:'high'},
    {id:'TRK-005',reason:'\u{1f529} Tyre wear index elevated \u2014 612 km rough road',km:'612 km',urgency:'medium'},
    {id:'TRK-002',reason:'\u{1f6de} Pothole cluster exposure \u2014 431 km logged',km:'431 km',urgency:'medium'},
    {id:'TRK-001',reason:'\u2705 All systems nominal',km:'\u2014',urgency:'ok'},
    {id:'TRK-004',reason:'\u2705 All systems nominal',km:'\u2014',urgency:'ok'},
  ];
  const icons={high:'\u{1f534}',medium:'\u{1f7e1}',ok:'\u{1f7e2}'};
  const colors={high:'var(--alert)',medium:'var(--caution)',ok:'var(--safe)'};
  const c=document.getElementById('maintenance-list');c.innerHTML='';
  flagged.forEach(f=>{
    const item=document.createElement('div');item.className='maintenance-item';item.onclick=()=>openTruckDetail(f.id);
    item.innerHTML=`<div style="font-size:1.3rem;">${icons[f.urgency]}</div>
      <div style="flex:1;"><div class="maintenance-truck-id">${f.id}</div><div class="maintenance-reason">${f.reason}</div></div>
      ${f.km!=='\u2014'?`<div class="maintenance-km" style="color:${colors[f.urgency]};">${f.km}</div>`:''}`;
    c.appendChild(item);
  });
}

function exportData(){
  const csv='Timestamp,Truck,Event,Severity,RoughnessIndex,CargoRisk,Lat,Lng\n'
    +allEvents.slice(0,80).map(e=>`${formatTime(e.timestamp)},${e.truckId},${e.type},${e.severity},${e.roughness},${e.cargoRisk},${e.lat},${e.lng}`).join('\n');
  const a=Object.assign(document.createElement('a'),
    {href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),download:'roadsense-export.csv'});
  a.click();URL.revokeObjectURL(a.href);
}

function simulationTick(){
  for(let i=0;i<rand(1,2);i++){const evt=generateEvent();renderEventFeed(evt);}
  updateStats();renderTruckMiniCards();renderSidebarTrucks();updateMapMarkers();
  if(selectedTruck){const s=truckState[selectedTruck];updateGauge(s.cargoRisk);renderTimeline(selectedTruck);renderRoughnessChart(s.history);}
  if(currentPage==='alerts')renderAlerts();
}

window.addEventListener('DOMContentLoaded',()=>{
  for(let i=0;i<18;i++){const evt=generateEvent();renderEventFeed(evt);}
  updateStats();renderTruckMiniCards();renderSidebarTrucks();initMap();
  (function scheduleNext(){setTimeout(()=>{simulationTick();scheduleNext();},rand(3500,6000));})();
});
