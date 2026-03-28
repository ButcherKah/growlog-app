// GrowLog Local v2
// App modularizado para rodar localmente no navegador do celular.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

'use strict';
const DB_KEY='growlog_v3_local';
let db=(()=>{try{return JSON.parse(localStorage.getItem(DB_KEY))||{plants:[],meta:{lastPlantId:null}}}catch{return {plants:[],meta:{lastPlantId:null}}}})();
if(!db.meta) db.meta={lastPlantId:null};
let currentPlantId=db.meta.lastPlantId||null;
let editPlantId=null, editEntryId=null;
let tempNuts=[], tempPhotos=[];
const STAGES={germinacao:{label:'Germinação',cls:'stage-germinacao'},plantula:{label:'Plântula',cls:'stage-plantula'},vegetativo:{label:'Vegetativo',cls:'stage-vegetativo'},floracao:{label:'Floração',cls:'stage-floracao'},colheita:{label:'Colheita',cls:'stage-colheita'}};
const DEFAULT_WATERING_CYCLE='2-1';
function normalizeWateringCycle(v){return ['1-1','2-1','3-1'].includes(v)?v:DEFAULT_WATERING_CYCLE;}
function ensurePlantShape(p){if(!p.entries)p.entries=[];p.wateringCycle=normalizeWateringCycle(p.wateringCycle);return p;}
function normalizeDbShape(){if(!db.plants)db.plants=[];db.plants=db.plants.map(ensurePlantShape);}
normalizeDbShape();
function wateringEvents(p){return [...(p.entries||[])].sort(compareEntriesAsc).filter(e=>e.watered);}
function wateringSequence(p){const [feedCount,waterCount]=normalizeWateringCycle(p.wateringCycle).split('-').map(Number);return[...Array(feedCount).fill('feed'),...Array(waterCount).fill('water')]}
function nextWateringKind(p){const seq=wateringSequence(p);const history=wateringEvents(p);return seq[history.length%seq.length]}
function nextWateringLabel(p){return nextWateringKind(p)==='feed'?'com nutriente':'sem nutriente'}
function wateringCycleLabel(p){const v=normalizeWateringCycle(p.wateringCycle);if(v==='1-1')return'1 com / 1 sem';if(v==='3-1')return'3 com / 1 sem';return'2 com / 1 sem'}
function luxRangeFor(stage,days){const d=days??0;if(stage==='germinacao')return{min:1000,max:6000,label:'Germinação'};if(stage==='plantula')return{min:3000,max:d<=10?10000:12000,label:'Plântula'};if(stage==='vegetativo')return{min:d<=21?10000:15000,max:35000,label:'Vegetativo'};if(stage==='floracao')return{min:25000,max:55000,label:'Floração'};if(stage==='colheita')return{min:15000,max:40000,label:'Colheita'};return{min:10000,max:30000,label:'Geral'}}
function luxStatusFor(stage,days,lux){if(lux==null||lux==='')return null;const range=luxRangeFor(stage,days);if(lux<range.min)return{key:'low',label:'baixo',range};if(lux<=range.max)return{key:'ok',label:'adequado',range};if(lux<=Math.round(range.max*1.2))return{key:'high',label:'alto',range};return{key:'danger',label:'excessivo',range}}
function currentLuxStatusForPlant(p){const latest=getLatestEntry(p);if(!latest||latest.lux==null)return null;return luxStatusFor(effectiveStage(p),daysLive(p),latest.lux)}
function renderLuxFeedback(){const box=document.getElementById('lux-feedback');if(!box)return;const lux=numOrNull('ef-lux');const stage=document.querySelector('#entry-stage-opts .sopt.sel')?.dataset.v||'vegetativo';const days=numOrNull('ef-days')??(getPlant()?daysLive(getPlant()):null);const info=luxStatusFor(stage,days,lux);if(!info){box.className='lux-feedback hidden';box.innerHTML='';return;}box.className=`lux-feedback ${info.key}`;box.innerHTML=`<strong>Lux ${info.label}</strong><br>Faixa sugerida para ${info.range.label.toLowerCase()}: ${info.range.min}–${info.range.max} lux.`;}

function save(){localStorage.setItem(DB_KEY,JSON.stringify(db));}
function setCurrentPlant(id){currentPlantId=id;db.meta.lastPlantId=id;save();}
function getPlant(){return db.plants.find(p=>p.id===currentPlantId)||null;}
function switchNav(btn,screen){document.querySelectorAll('.nitem').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById('screen-'+screen).classList.add('active');if(screen==='stats') renderStats();}
function quickAction(a){if(a==='addPlant') openAddPlant(); if(a==='openLast'&&db.meta.lastPlantId){setCurrentPlant(db.meta.lastPlantId);showDetail();} if(a==='showStats'){document.querySelector('.nitem[data-s="stats"]').click();}}
function compareEntriesAsc(a,b){const ad=(a.date||'')+(a.time||''), bd=(b.date||'')+(b.time||''); return ad.localeCompare(bd);}
function getLatestEntry(p){return [...(p.entries||[])].sort(compareEntriesAsc).at(-1)||null;}
function lastWaterEntry(p){return [...(p.entries||[])].sort(compareEntriesAsc).filter(e=>e.watered).at(-1)||null;}
function lastPhotoEntry(p){return [...(p.entries||[])].sort(compareEntriesAsc).filter(e=>e.photos?.length).at(-1)||null;}
function daysFrom(dateStr){if(!dateStr) return null; const d=new Date(dateStr+'T00:00:00'); return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));}
function daysLive(p){if(p.daysOverride!=null&&p.daysOverride!=='') return +p.daysOverride; return daysFrom(p.startDate);}
function weeksLive(p){if(p.weeksOverride!=null&&p.weeksOverride!=='') return +p.weeksOverride; const d=daysLive(p); return d!=null?Math.max(1,Math.floor(d/7)+1):null;}
function autoStageByDays(days,type){if(days==null) return 'vegetativo'; if(days<=3) return 'germinacao'; if(days<=14) return 'plantula'; if(type==='auto'){if(days<=35) return 'vegetativo'; if(days<=85) return 'floracao'; return 'colheita';} if(days<=42) return 'vegetativo'; if(days<=120) return 'floracao'; return 'colheita';}
function effectiveStage(p){if(p.stageOverride) return p.stageOverride; const last=getLatestEntry(p); if(last?.stage) return last.stage; return autoStageByDays(daysLive(p),p.type);}
function plantStageLabel(p){return STAGES[effectiveStage(p)]?.label||'—';}
function plantStageCls(p){return STAGES[effectiveStage(p)]?.cls||'stage-vegetativo';}
function fmtNum(v,suf=''){return v==null||v===''?'—':`${v}${suf}`;}

function suggestNextAction(p){
  const last=getLatestEntry(p),lastWater=lastWaterEntry(p),waterGap=daysFromEntryDate(lastWater),luxInfo=currentLuxStatusForPlant(p);
  if(!last) return 'Adicionar primeiro registro';
  if(waterGap!=null&&waterGap>=3) return `Próxima rega: ${nextWateringLabel(p)}`;
  if(luxInfo&&luxInfo.key!=='ok') return `Revisar luz (${luxInfo.label})`;
  if(daysFromEntryDate(last)>=4) return `Atualizar diário (${daysFromEntryDate(last)}d)`;
  if(effectiveStage(p)==='floracao'&&!(last?.photos?.length)) return 'Registrar foto da flora';
  return `Próxima rega: ${nextWateringLabel(p)}`;
}

function plantHealthNote(p){
  const last=getLatestEntry(p);
  if(!last) return 'Sem registros ainda.';
  const notes=[];
  if(last.temp!=null) notes.push(`temp ${last.temp}°C`);
  if(last.ur!=null) notes.push(`UR ${last.ur}%`);
  if(lastWaterEntry(p)) notes.push(`rega há ${daysFromEntryDate(lastWaterEntry(p))}d`);
  notes.push(`próxima ${nextWateringLabel(p)}`);
  return notes.length?notes.join(' · '):'Sem medições recentes';
}

function renderHome(){
  const total=db.plants.length;
  const withEntries=db.plants.filter(p=>(p.entries||[]).length).length;
  const totalEntries=db.plants.reduce((a,p)=>a+(p.entries?.length||0),0);
  const totalWaterMl=db.plants.flatMap(p=>p.entries||[]).filter(e=>e.watered&&e.waterMl!=null).reduce((a,e)=>a+(+e.waterMl||0),0);
  document.getElementById('home-kpis').innerHTML=`
    <div class="kpi"><div class="k">Plantas</div><div class="v">${total}</div><div class="s">${withEntries} com histórico</div></div>
    <div class="kpi"><div class="k">Registros</div><div class="v">${totalEntries}</div><div class="s">diário consolidado</div></div>
    <div class="kpi"><div class="k">Água</div><div class="v">${(totalWaterMl/1000).toFixed(1)}L</div><div class="s">volume total</div></div>`;
  document.getElementById('home-badge').textContent=total?`${total} ativas`:'Local';
  document.getElementById('status-list').innerHTML=buildAlerts().map(a=>`
    <div class="status-item" onclick="openPlantFromAlert('${a.plant}')">
      <div class="status-tag ${a.cls}">${a.tag}</div>
      <div><strong>${esc(a.title)}</strong><p>${esc(a.msg)}</p></div>
    </div>`).join('') || `<div class="status-item"><div class="status-tag tag-blue">Ok</div><div><strong>Tudo em ordem</strong><p>Sem pendências no momento.</p></div></div>`;
}
function openPlantFromAlert(id){setCurrentPlant(id);showDetail();}
function buildAlerts(){
  const alerts=[];
  db.plants.forEach(p=>{
    const latest=getLatestEntry(p),waterGap=daysFromEntryDate(lastWaterEntry(p)),entryGap=daysFromEntryDate(latest),luxInfo=currentLuxStatusForPlant(p);
    if(!latest){alerts.push({plant:p.id,title:p.name,msg:'Ainda não tem registro. Vale cadastrar o primeiro acompanhamento.',tag:'Começar',cls:'tag-blue'});return;}
    if(waterGap!=null&&waterGap>=3) alerts.push({plant:p.id,title:p.name,msg:`Última rega há ${waterGap} dia(s). Próxima rega sugerida: ${nextWateringLabel(p)}.`,tag:'Rega',cls:'tag-amber'});
    if(luxInfo&&luxInfo.key!=='ok') alerts.push({plant:p.id,title:p.name,msg:`Lux ${luxInfo.label} para ${luxInfo.range.label.toLowerCase()} (${luxInfo.range.min}–${luxInfo.range.max}).`,tag:'Luz',cls:luxInfo.key==='danger'?'tag-red':'tag-blue'});
    if(entryGap!=null&&entryGap>=5) alerts.push({plant:p.id,title:p.name,msg:`Diário sem atualização há ${entryGap} dia(s).`,tag:'Registro',cls:'tag-red'});
    if(effectiveStage(p)==='floracao'&&!lastPhotoEntry(p)) alerts.push({plant:p.id,title:p.name,msg:'Está em floração sem foto registrada.',tag:'Foto',cls:'tag-blue'});
  });
  return alerts.slice(0,6);
}
function renderPlantList(){
  const root=document.getElementById('plant-list');
  root.innerHTML=db.plants.map(p=>`
    <div class="plant-card" onclick="openPlant('${p.id}')">
      <div class="p-top">
        <div>
          <div class="p-name">${esc(p.name)}</div>
          <div class="p-meta">${p.type==='auto'?'Autoflorescente':'Fotoperiódica'} · início ${fmtDate(p.startDate)}</div>
        </div>
        <div class="stage-badge ${plantStageCls(p)}">${plantStageLabel(p)}</div>
      </div>
      <div class="p-badges">
        <div class="chip mono">${daysLive(p)??'—'} dias</div>
        <div class="chip mono">${weeksLive(p)??'—'}ª semana</div>
        <div class="chip">${(p.entries||[]).length} registros</div>
      </div>
      <div class="p-notes">${esc(plantHealthNote(p))}</div>
      <div class="card-actions">
        <button class="btn btn-ghost" onclick="event.stopPropagation();openQuickEntryFor('${p.id}','water')">💧 Rega</button>
        <button class="btn btn-primary" onclick="event.stopPropagation();openPlant('${p.id}')">Abrir</button>
      </div>
    </div>`).join('') || `<div class="status-card"><p class="sec-label" style="margin-top:0">Nenhuma planta</p><div class="p-notes">Toque em <strong>Nova planta</strong> para começar seu diário de cultivo.</div></div>`;
}
function openPlant(id){setCurrentPlant(id);showDetail();}
function showPlants(){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById('screen-plants').classList.add('active');document.querySelectorAll('.nitem').forEach(b=>b.classList.remove('active'));document.querySelector('.nitem[data-s="plants"]').classList.add('active');renderHome();renderPlantList();}
function showDetail(){const p=getPlant();if(!p){showPlants();return;}document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById('screen-detail').classList.add('active');renderDetail();}
function renderDetail(){const p=getPlant();if(!p)return;document.getElementById('d-name').textContent=p.name;document.getElementById('d-sub').textContent=`${p.type==='auto'?'Autoflorescente':'Fotoperiódica'} · início ${fmtDate(p.startDate)}`;document.getElementById('sr-stage').textContent=plantStageLabel(p);document.getElementById('sr-stage').className='sr-val';document.getElementById('sr-days').textContent=daysLive(p)??'—';document.getElementById('sr-weeks').textContent=weeksLive(p)??'—';document.getElementById('detail-helper').innerHTML=detailSummary(p);document.getElementById('entries-list').innerHTML=[...(p.entries||[])].sort(compareEntriesAsc).reverse().map(entryCardHTML).join('')||`<div class="status-card" style="padding:18px"><div class="p-notes">Ainda não há registros. Use <strong>＋ Registro</strong> ou as ações rápidas.</div></div>`;}
function detailSummary(p){
  const latest=getLatestEntry(p);
  if(!latest) return '<strong>Primeiro passo:</strong> registre ambiente, rega ou foto para começar o histórico.';
  const parts=[],waterGap=daysFromEntryDate(lastWaterEntry(p)),luxInfo=currentLuxStatusForPlant(p);
  parts.push(`próxima rega <strong>${nextWateringLabel(p)}</strong>`);
  parts.push(`ciclo <strong>${wateringCycleLabel(p)}</strong>`);
  if(waterGap!=null) parts.push(`última rega há <strong>${waterGap}d</strong>`);
  if(latest.temp!=null||latest.ur!=null) parts.push(`ambiente recente ${latest.temp!=null?'<strong>'+latest.temp+'°C</strong>':''}${latest.temp!=null&&latest.ur!=null?' / ':''}${latest.ur!=null?'<strong>'+latest.ur+'%</strong> UR':''}`);
  if(latest.lux!=null&&luxInfo) parts.push(`lux <strong>${latest.lux}</strong> (${luxInfo.label})`);
  if(latest.ppfd!=null||latest.dli!=null) parts.push(`luz ${latest.ppfd!=null?'<strong>'+latest.ppfd+'</strong> PPFD':''}${latest.ppfd!=null&&latest.dli!=null?' · ':''}${latest.dli!=null?'<strong>'+latest.dli+'</strong> DLI':''}`);
  return `<strong>Resumo:</strong> ${parts.join(' · ')}.`;
}
function entryCardHTML(e){const badge=`<div class="stage-badge ${STAGES[e.stage||'vegetativo']?.cls||'stage-vegetativo'}">${STAGES[e.stage||'vegetativo']?.label||'—'}</div>`;const nuts=(e.nutrients||[]).map(n=>`<div class="nut-pill">${esc(n.name)}${n.qty?` · ${esc(n.qty)}ml/L`:''}</div>`).join('');const photos=(e.photos||[]).map((src,i)=>`<div class="photo-thumb" onclick="openLightbox('${e.id}',${i})"><img src="${src}" alt=""></div>`).join('');return `
  <div class="entry-card">
    <div class="e-top">
      <div>
        <div class="e-date">${fmtDate(e.date)}${e.time?` · ${e.time}`:''}</div>
        <div class="e-stage">${e.week?`Semana ${e.week}`:''}${e.days!=null?`${e.week?' · ':''}${e.days} dias`:''}</div>
      </div>
      ${badge}
    </div>
    <div class="e-grid">
      <div class="mini"><div class="k">Temp / UR</div><div class="v">${fmtNum(e.temp,'°C')} ${e.temp!=null&&e.ur!=null?'·':''} ${fmtNum(e.ur,'%')}</div></div>
      <div class="mini"><div class="k">Luz</div><div class="v">${fmtNum(e.lux)} lux</div></div>
      <div class="mini"><div class="k">PPFD / DLI</div><div class="v">${fmtNum(e.ppfd)} ${e.ppfd!=null&&e.dli!=null?'·':''} ${fmtNum(e.dli)}</div></div>
      <div class="mini"><div class="k">Rega</div><div class="v">${e.watered?`${fmtNum(e.waterMl,'ml')}`:'Não'}</div></div>
    </div>
    ${nuts?`<div class="nut-list">${nuts}</div>`:''}
    ${e.obs?`<div class="e-obs">${esc(e.obs)}</div>`:''}
    ${photos?`<div class="photo-strip">${photos}</div>`:''}
    <div class="e-actions">
      <button class="btn btn-ghost btn-icon" onclick="openEditEntry('${e.id}')">✏️</button>
      <button class="btn btn-danger btn-icon" onclick="confirmDeleteEntry('${e.id}')">🗑️</button>
    </div>
  </div>`;}
function renderStats(){
  const entries=db.plants.flatMap(p=>(p.entries||[]).map(e=>({...e,_pid:p.id,_pname:p.name})));
  const water=entries.filter(e=>e.watered&&e.waterMl!=null);
  const avg=(arr,fn)=>arr.length?(arr.reduce((a,x)=>a+(fn(x)||0),0)/arr.length):null;
  const tempAvg=avg(entries,e=>+e.temp)||0;
  const urAvg=avg(entries,e=>+e.ur)||0;
  const luxAvg=avg(entries,e=>+e.lux)||0;
  const totalWater=water.reduce((a,e)=>a+(+e.waterMl||0),0);
  document.getElementById('stats-grid').innerHTML=`
    <div class="stat-card"><div class="stat-title">Plantas</div><div class="stat-value">${db.plants.length}</div><div class="stat-sub">cadastro ativo</div></div>
    <div class="stat-card"><div class="stat-title">Registros</div><div class="stat-value">${entries.length}</div><div class="stat-sub">acompanhamentos salvos</div></div>
    <div class="stat-card"><div class="stat-title">Água total</div><div class="stat-value">${(totalWater/1000).toFixed(1)}L</div><div class="stat-sub">regas registradas</div></div>
    <div class="stat-card"><div class="stat-title">Temp média</div><div class="stat-value">${tempAvg?tempAvg.toFixed(1):'—'}°</div><div class="stat-sub">UR ${urAvg?urAvg.toFixed(0):'—'}% · Lux ${luxAvg?luxAvg.toFixed(0):'—'}</div></div>`;
  const byPlant=db.plants.map(p=>({name:p.name,val:(p.entries||[]).length||0}));
  document.getElementById('stats-charts').innerHTML=`
    <div class="chart-box">
      <div class="chart-title">Registros por planta</div>
      <div class="spark">
        ${byPlant.map(x=>`<div class="bar" style="height:${Math.max(12,(x.val/Math.max(1,...byPlant.map(y=>y.val)))*88)}px"><span>${esc(x.name.slice(0,6))}</span></div>`).join('')}
      </div>
    </div>`;
}
function selType(el){document.querySelectorAll('.topt').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');}
function openAddPlant(){
  editPlantId=null;
  document.getElementById('mp-title').textContent='Nova Planta';
  sv('mp-name','');sv('mp-date',todayISO());sv('mp-cycle',DEFAULT_WATERING_CYCLE);sv('mp-obs','');
  document.querySelectorAll('.topt').forEach((o,i)=>o.classList.toggle('sel',i===0));
  openModal('modal-plant');
}
function openEditPlant(){
  const p=getPlant();if(!p)return;
  editPlantId=p.id;
  document.getElementById('mp-title').textContent='Editar Planta';
  sv('mp-name',p.name);sv('mp-date',p.startDate||'');sv('mp-cycle',normalizeWateringCycle(p.wateringCycle));sv('mp-obs',p.obs||'');
  document.querySelectorAll('.topt').forEach(o=>o.classList.toggle('sel',o.dataset.v===p.type));
  openModal('modal-plant');
}
function savePlant(){
  const name=gv('mp-name').trim();
  if(!name){toast('Informe o nome da planta');return;}
  const type=document.querySelector('.topt.sel')?.dataset.v||'auto';
  const startDate=gv('mp-date');
  const wateringCycle=normalizeWateringCycle(gv('mp-cycle'));
  const obs=gv('mp-obs').trim();
  if(editPlantId){
    const p=db.plants.find(x=>x.id===editPlantId);
    if(p){p.name=name;p.type=type;p.startDate=startDate;p.wateringCycle=wateringCycle;p.obs=obs;ensurePlantShape(p);}
  }else{
    const id=uid();
    db.plants.push(ensurePlantShape({id,name,type,startDate,wateringCycle,obs,entries:[],stageOverride:null,daysOverride:null,weeksOverride:null}));
    db.meta.lastPlantId=id;
  }
  save();closeModal('modal-plant');editPlantId?renderDetail():showPlants();toast(editPlantId?'Planta atualizada ✓':'Planta adicionada ✓');editPlantId=null;
}
function confirmDeletePlant(){const p=getPlant();if(!p)return;showConfirm('Excluir planta',`Excluir ${p.name} e todos os registros?`,()=>{db.plants=db.plants.filter(x=>x.id!==p.id);if(currentPlantId===p.id) currentPlantId=db.plants[0]?.id||null;db.meta.lastPlantId=currentPlantId;save();showPlants();toast('Planta excluída');});}
function openStageEditor(){const p=getPlant();if(!p)return;selSopt(document.querySelector(`#stage-opts .sopt[data-v="${effectiveStage(p)}"]`),'stage-opts');sv('ms-days',daysLive(p)??'');sv('ms-weeks',weeksLive(p)??'');openModal('modal-stage');}
function saveStage(){const p=getPlant();if(!p)return;p.stageOverride=document.querySelector('#stage-opts .sopt.sel')?.dataset.v||null;p.daysOverride=numOrNull('ms-days');p.weeksOverride=numOrNull('ms-weeks');save();closeModal('modal-stage');renderDetail();renderHome();renderPlantList();toast('Estágio atualizado ✓');}
function openQuickEntry(kind){if(kind==='water'){openAddEntry();setTimeout(()=>{setTgl('tgl-water',true);setVis('water-fields',true);},20)}else if(kind==='climate'){openAddEntry();}}
function openQuickEntryFor(id,kind){setCurrentPlant(id);showDetail();setTimeout(()=>openQuickEntry(kind),20);}
function daysFromEntryDate(e){return e?.date?daysFrom(e.date):null;}
function openAddEntry(){
  editEntryId=null;tempNuts=[];tempPhotos=[];document.getElementById('me-title').textContent='Novo Registro';
  const p=getPlant();sv('ef-date',todayISO());sv('ef-time',nowTime());sv('ef-week',p?weeksLive(p)??'':'');sv('ef-days',p?daysLive(p)??'':'');
  selSopt(document.querySelector(`#entry-stage-opts .sopt[data-v="${p?effectiveStage(p):'vegetativo'}"]`),'entry-stage-opts');
  ['ef-temp','ef-ur','ef-dimmer','ef-dist','ef-lux','ef-ppfd','ef-dli','ef-water','ef-ec','ef-ph','ef-obs'].forEach(id=>sv(id,''));
  if(p?.entries?.length){const l=[...p.entries].sort(compareEntriesAsc).at(-1);sv('ef-ledon',l.ledOn||'');sv('ef-ledoff',l.ledOff||'');if(l.dimmer!=null) sv('ef-dimmer',l.dimmer);if(l.dist!=null) sv('ef-dist',l.dist);}else{sv('ef-ledon','');sv('ef-ledoff','');}
  setTgl('tgl-water',false);setVis('water-fields',false);setTgl('tgl-nut',false);setVis('nut-section',false);
  renderNuts();renderPhotoPreview();resetPhotoInputs();renderLuxFeedback();openModal('modal-entry');
}
function openEditEntry(eid){
  const p=getPlant(),e=(p?.entries||[]).find(x=>x.id===eid);if(!e)return;
  editEntryId=eid;tempNuts=e.nutrients?[...e.nutrients]:[];tempPhotos=e.photos?[...e.photos]:[];
  document.getElementById('me-title').textContent='Editar Registro';
  sv('ef-date',e.date||'');sv('ef-time',e.time||'');sv('ef-week',e.week??'');sv('ef-days',e.days??'');
  selSopt(document.querySelector(`#entry-stage-opts .sopt[data-v="${e.stage||'vegetativo'}"]`),'entry-stage-opts');
  sv('ef-temp',e.temp??'');sv('ef-ur',e.ur??'');sv('ef-dimmer',e.dimmer??'');sv('ef-dist',e.dist??'');sv('ef-lux',e.lux??'');sv('ef-ppfd',e.ppfd??'');sv('ef-dli',e.dli??'');sv('ef-ledon',e.ledOn||'');sv('ef-ledoff',e.ledOff||'');sv('ef-water',e.waterMl??'');sv('ef-ec',e.ec??'');sv('ef-ph',e.ph??'');sv('ef-obs',e.obs||'');
  setTgl('tgl-water',!!e.watered);setVis('water-fields',!!e.watered);setTgl('tgl-nut',!!(e.nutrients?.length));setVis('nut-section',!!(e.nutrients?.length));
  renderNuts();renderPhotoPreview();resetPhotoInputs();renderLuxFeedback();openModal('modal-entry');
}
function saveEntry(){const p=getPlant();if(!p) return;const date=gv('ef-date');if(!date){toast('Informe a data');return;}const watered=isTglOn('tgl-water');const entry={id:editEntryId||uid(),date,time:gv('ef-time')||null,week:numOrNull('ef-week'),days:numOrNull('ef-days'),stage:document.querySelector('#entry-stage-opts .sopt.sel')?.dataset.v||null,temp:numOrNull('ef-temp'),ur:numOrNull('ef-ur'),dimmer:numOrNull('ef-dimmer'),dist:numOrNull('ef-dist'),lux:numOrNull('ef-lux'),ppfd:numOrNull('ef-ppfd'),dli:numOrNull('ef-dli'),ledOn:gv('ef-ledon')||null,ledOff:gv('ef-ledoff')||null,watered,waterMl:watered?numOrNull('ef-water'):null,ec:watered?numOrNull('ef-ec'):null,ph:watered?numOrNull('ef-ph'):null,nutrients:tempNuts.length?[...tempNuts]:[],photos:tempPhotos.length?[...tempPhotos]:[],obs:gv('ef-obs').trim()||null};if(!p.entries)p.entries=[];if(editEntryId){const i=p.entries.findIndex(x=>x.id===editEntryId);if(i>-1)p.entries[i]=entry;}else p.entries.push(entry);p.entries.sort(compareEntriesAsc);if(entry.stage) p.stageOverride=null;save();closeModal('modal-entry');renderDetail();renderHome();toast(editEntryId?'Registro atualizado ✓':'Registro salvo ✓');editEntryId=null;}
function confirmDeleteEntry(eid){showConfirm('Excluir registro','Tem certeza que deseja excluir este registro?',()=>{const p=getPlant();if(!p)return;p.entries=(p.entries||[]).filter(e=>e.id!==eid);save();renderDetail();renderHome();toast('Registro excluído');});}
function addNutrient(){const name=gv('nut-input').trim();if(!name)return;tempNuts.push({name,qty:gv('nut-qty')||null});sv('nut-input','');sv('nut-qty','');renderNuts();setTgl('tgl-nut',true);setVis('nut-section',true);}
function removeNut(i){tempNuts.splice(i,1);renderNuts();}
function renderNuts(){document.getElementById('nut-tags').innerHTML=tempNuts.map((n,i)=>`<div class="nut-tag" onclick="removeNut(${i})">${esc(n.name)}${n.qty?' · '+n.qty+'ml/L':''} <span style="opacity:.5;margin-left:2px">×</span></div>`).join('');}
function resetPhotoInputs(){const g=document.getElementById('ef-photo-gallery');const c=document.getElementById('ef-photo-camera');if(g)g.value='';if(c)c.value='';}
function handlePhotoInput(ev){const files=Array.from(ev.target.files);ev.target.value='';if(!files.length)return;let done=0;files.forEach(file=>{const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=()=>{const MAX=1100;let w=img.width,h=img.height;if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);tempPhotos.push(c.toDataURL('image/jpeg',.80));if(++done===files.length){renderPhotoPreview();toast(`${done} foto${done>1?'s':''} adicionada${done>1?'s':''} ✓`);}};img.src=e.target.result;};r.readAsDataURL(file);});}
function renderPhotoPreview(){document.getElementById('photo-preview').innerHTML=tempPhotos.map((src,i)=>`<div class="photo-item"><img src="${src}" onclick="openLightboxTemp(${i})" alt=""><button class="photo-del" onclick="removeTempPhoto(${i})">×</button></div>`).join('');}
function removeTempPhoto(i){tempPhotos.splice(i,1);renderPhotoPreview();}
let _lbPhotos=[],_lbIdx=0;
function openLightbox(eid,idx){const p=getPlant(),e=(p?.entries||[]).find(x=>x.id===eid);if(!e?.photos?.length)return;_lbPhotos=e.photos;_lbIdx=idx;showLB();}
function openLightboxTemp(idx){_lbPhotos=tempPhotos;_lbIdx=idx;showLB();}
function showLB(){document.getElementById('lb-img').src=_lbPhotos[_lbIdx]||'';document.getElementById('lb-counter').textContent=`${_lbIdx+1} / ${_lbPhotos.length}`;document.getElementById('lightbox').classList.add('open');}
function lbStep(d){_lbIdx=(_lbIdx+d+_lbPhotos.length)%_lbPhotos.length;showLB();}
function closeLightbox(){document.getElementById('lightbox').classList.remove('open');}
document.getElementById('lightbox').addEventListener('click',e=>{if(e.target===e.currentTarget)closeLightbox();});
function toggleSection(tglId,secId){const on=!isTglOn(tglId);setTgl(tglId,on);setVis(secId,on);if(tglId==='tgl-water'&&!on){setTgl('tgl-nut',false);setVis('nut-section',false);}if(tglId==='tgl-nut'&&on&&!isTglOn('tgl-water')){setTgl('tgl-water',true);setVis('water-fields',true);}}
function setTgl(id,on){document.getElementById(id).classList.toggle('on',on)}
function isTglOn(id){return document.getElementById(id).classList.contains('on')}
function setVis(id,on){document.getElementById(id).classList.toggle('vis',on)}
function selSopt(el,gid){if(!el)return;document.querySelectorAll(`#${gid} .sopt`).forEach(o=>o.classList.remove('sel'));el.classList.add('sel');}
function getPhotoperiodHours(on,off){if(!on||!off) return null;const [oh,om]=on.split(':').map(Number);const [fh,fm]=off.split(':').map(Number);let mins=(fh*60+fm)-(oh*60+om);if(mins<=0) mins+=24*60;return +(mins/60).toFixed(2);}
function estimatePpfdFromLux(lux){return lux?+(lux/65).toFixed(0):null}
function estimateDli(ppfd,hours){return (ppfd!=null&&hours!=null)?+((ppfd*hours*3600)/1000000).toFixed(1):null}
function recalcLightMetrics(source){
  const on=gv('ef-ledon'),off=gv('ef-ledoff'),lux=numOrNull('ef-lux');let ppfd=numOrNull('ef-ppfd');const hours=getPhotoperiodHours(on,off);
  if(source!=='ppfd'&&lux!=null&&(!ppfd||ppfd===0)){ppfd=estimatePpfdFromLux(lux);sv('ef-ppfd',ppfd);}
  const dli=estimateDli(ppfd,hours);
  if(dli!=null) sv('ef-dli',dli);
  renderLuxFeedback();
}
function exportPlantCSV(){const p=getPlant();if(!p)return;dlBlob(new Blob(['\uFEFF'+plantCSV(p)],{type:'text/csv;charset=utf-8'}),`${p.name}_growlog.csv`);toast('CSV exportado ✓');}
function exportAllCSV(){if(!db.plants.length){toast('Nenhuma planta para exportar');return;}dlBlob(new Blob(['\uFEFF'+db.plants.map(plantCSV).join('\n\n')],{type:'text/csv;charset=utf-8'}),'growlog_completo.csv');toast('CSV exportado ✓');}
function plantCSV(p){const h=['Data','Hora','Semana','Dias','Estágio','Temp(°C)','UR(%)','Dimmer(%)','Dist luz(cm)','Liga','Desliga','Lux','PPFD','DLI','Rega','Água(ml)','EC','pH','Nutrientes','Observações'];const rows=(p.entries||[]).sort(compareEntriesAsc).map(e=>[e.date,e.time||'',e.week??'',e.days??'',e.stage?STAGES[e.stage]?.label||e.stage:'',e.temp??'',e.ur??'',e.dimmer??'',e.dist??'',e.ledOn||'',e.ledOff||'',e.lux??'',e.ppfd??'',e.dli??'',e.watered?'Sim':'Não',e.waterMl??'',e.ec??'',e.ph??'',(e.nutrients||[]).map(n=>n.name+(n.qty?' '+n.qty+'ml/L':'')).join('; '),(e.obs||'').replace(/[\n\r,]/g,' ')]);return `# ${p.name} (${p.type}) — início: ${p.startDate||'?'}\n`+[h,...rows].map(r=>r.join(',')).join('\n');}
function exportBackup(){dlBlob(new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),'growlog_backup.json');toast('Backup exportado ✓');}
function importBackup(ev){
  const file=ev.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!data.plants||!Array.isArray(data.plants)) throw new Error();
      showConfirm('Importar backup',`Importar ${data.plants.length} planta(s)? Os dados atuais serão substituídos.`,()=>{
        db=data;
        if(!db.meta) db.meta={lastPlantId:null};
        normalizeDbShape();
        save();showPlants();toast(`${data.plants.length} planta(s) importada(s) ✓`);
      },'Importar');
    }catch{toast('⚠️ Arquivo inválido');}
  };
  r.readAsText(file);
  ev.target.value='';
}
function dlBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
let _confirmCb=null;
function showConfirm(title,msg,onOk,okLabel='Excluir'){document.getElementById('confirm-title').textContent=title;document.getElementById('confirm-msg').textContent=msg;document.getElementById('confirm-ok').textContent=okLabel;_confirmCb=onOk;document.getElementById('confirm-overlay').classList.add('open');}
function resolveConfirm(ok){document.getElementById('confirm-overlay').classList.remove('open');if(ok&&typeof _confirmCb==='function')_confirmCb();_confirmCb=null;}
const openModal=id=>document.getElementById(id).classList.add('open');
const closeModal=id=>document.getElementById(id).classList.remove('open');
document.querySelectorAll('.overlay').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open');}));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const todayISO=()=>{const d=new Date();const offset=d.getTimezoneOffset();const local=new Date(d.getTime()-offset*60000);return local.toISOString().slice(0,10)};
const nowTime=()=>new Date().toTimeString().slice(0,5);
const gv=id=>document.getElementById(id)?.value??'';
const sv=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val;};
const numOrNull=id=>{const v=gv(id);return v!==''?+v:null;};
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate=d=>{if(!d)return'—';const[y,m,dd]=d.split('-');return`${dd}/${m}/${y}`;};
const fmtDateShort=d=>{if(!d)return'—';const[,m,dd]=d.split('-');return`${dd}/${m}`;};
let _toastT;
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(_toastT);_toastT=setTimeout(()=>el.classList.remove('show'),2400);}
document.addEventListener('change',(ev)=>{
  if(ev.target?.id==='ef-lux'||ev.target?.id==='ef-ppfd'||ev.target?.id==='ef-ledon'||ev.target?.id==='ef-ledoff'||ev.target?.id==='ef-days'){
    renderLuxFeedback();
  }
});
document.addEventListener('click',(ev)=>{
  if(ev.target?.closest('#entry-stage-opts .sopt')){
    setTimeout(renderLuxFeedback,0);
  }
});
renderHome();renderPlantList();
