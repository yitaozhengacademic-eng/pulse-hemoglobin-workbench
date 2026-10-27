import {predictEnsemble,predictRisk,calendarTerms} from './model.js';
import {dateWindow,aggregateWindow,fetchWeather,parseDailyCSV} from './environment.js';
const $=id=>document.getElementById(id),num=id=>$(id).value===''?null:Number($(id).value);
let cities=[],models={},riskModels,manifest,env=null,result=null,revision=0,envGeneration=0,controller=null,exampleMode=false;
const emptyChart=$('chart').innerHTML;
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`File load failed (${r.status})`);return r.json();};
function status(message,error=false){$('form-status').textContent=message;$('form-status').classList.toggle('error',error);}
function invalidate(){revision++;result=null;for(const id of ['export-json','export-csv','print'])$(id).disabled=true;$('chart').innerHTML=emptyChart;$('result-label').textContent='Recalculate to update';$('result-label').className='pill';$('result-summary').hidden=true;$('trajectory-values').hidden=true;$('risk-value').textContent='—';$('risk-description').textContent='Awaiting calculation';$('risk-clinical').textContent='—';$('risk-environment').textContent='—';for(const id of ['risk-bar-clinical','risk-bar-environment'])$(id).style.width='0%';$('threshold-status').textContent='Explore how flags change with the threshold.';$('threshold-status').className='small';}
function clearEnvironment(){envGeneration++;controller?.abort();env=null;invalidate();renderEnvironment();}
function renderEnvironment(){
  let start='',end='';try{const d=dateWindow($('admission').value);start=d[0];end=d.at(-1);}catch{}
  const city=cities.find(c=>c.id===$('city').value);
  $('window-label').textContent=start?`${city?.label||''} · ${start} — ${end}`:'Choose a city and admission date';
  const complete=env?.summary.complete;
  $('coverage-label').textContent=env?complete?'Coverage met':'Incomplete':'Not loaded';$('coverage-label').className='pill '+(env?(complete?'good':'partial'):'');
  for(const [key,short] of [['pm25','pm'],['temp','temp'],['rh','rh']]){
    const v=env?.summary.values[key];$(short+'-value').textContent=v?.mean!==null&&v?.mean!==undefined?v.mean.toFixed(1):'—';$(short+'-days').textContent=`${v?.n||0} / 30 days`;$(short+'-track').style.width=(v?.n||0)/30*100+'%';
  }
  $('daily-coverage').replaceChildren();
  for(const r of env?.summary.daily||[]){const air=Number.isFinite(r.pm25)&&r.hours>=20,weather=Number.isFinite(r.temp)&&Number.isFinite(r.rh);const b=document.createElement('span');b.className='coverage-day '+(air&&weather?'complete':air||weather?'partial':'');b.textContent=r.date.slice(-2);b.title=`${r.date} · PM₂.₅ ${air?r.pm25.toFixed(1)+' µg/m³':'missing or fewer than 20 hours'} · Weather ${weather?'complete':'missing'}`;$('daily-coverage').append(b);}
  $('refresh-time').textContent=env?`Original snapshot: ${env.snapshotDate}; latest refresh attempt: ${env.refreshAttempt||'not recorded'}. ${env.liveWeather?'ERA5 fetched online for this request.':'Using stored environmental observations.'}`:'';
  $('env-status').textContent=env?(complete?`All three variables have at least 27 valid days. ${env.imported?'PM₂.₅ was imported by the user; source provenance is unverified.':'PM₂.₅: monitoring archive. Weather: ERA5.'}`:'Fewer than 27 valid days for one or more variables. Clinical-calendar predictions remain available; environmental predictions are withheld.'):'PM₂.₅: CNEMC city archive · Weather: ERA5 / Open-Meteo. At least 27 valid days per variable.';
}
async function loadEnvironment(live=false,importedRows=null){
  const city=cities.find(c=>c.id===$('city').value),admission=$('admission').value;
  if(!city||!admission){$('env-status').textContent='Choose a city and admission date first.';return;}
  try{dateWindow(admission);}catch(e){$('env-status').textContent=e.message;return;}
  const ticket=++envGeneration;controller?.abort();controller=new AbortController();
  env=null;invalidate();renderEnvironment();$('fetch-env').disabled=true;$('env-status').textContent='Matching city environmental data…';
  try{
    const snapshot=await json(`./data/environment/${city.id}.json`);
    let rows=snapshot.rows.map(x=>({...x})),weatherReceipt=null,warning='';
    if(live){try{weatherReceipt=await fetchWeather(city,admission,controller.signal);const map=new Map(rows.map(r=>[r.date,r]));for(const w of weatherReceipt.rows)map.set(w.date,{...(map.get(w.date)||{date:w.date,pm25:null,hours:0}),...w});rows=[...map.values()];}catch(e){if(e.name==='AbortError')return;warning='The live ERA5 request failed. Stored weather is retained; retry later.';}}
    if(importedRows){const map=new Map(rows.map(r=>[r.date,r]));const dates=dateWindow(admission);for(const d of dates){const r=map.get(d)||{date:d,temp:null,rh:null};map.set(d,{...r,pm25:null,hours:0});}for(const r of importedRows)map.set(r.date,{...(map.get(r.date)||{temp:null,rh:null}),...r});rows=[...map.values()];}
    if(ticket!==envGeneration)return;
    env={city,admission,summary:aggregateWindow(rows,admission),snapshotDate:snapshot.retrieved_at,refreshAttempt:snapshot.last_refresh_attempt,liveWeather:weatherReceipt,imported:!!importedRows,source:importedRows?'User-imported daily PM2.5; provenance unverified':snapshot.source};
    renderEnvironment();if(warning)$('env-status').textContent+=' '+warning;
  }catch(e){if(ticket===envGeneration){env=null;renderEnvironment();$('env-status').textContent='Could not load environmental data: '+e.message+'. Clinical-calendar predictions remain available.';}}
  finally{if(ticket===envGeneration)$('fetch-env').disabled=false;}
}
function buildInput(){
  if(!$('clinical-form').reportValidity())throw Error('Check required fields and input ranges.');
  if($('surgery').value<$('admission').value)throw Error('Surgery date cannot precede admission date.');
  const x=Object.fromEntries(['pre_HGB','pod1_hgb','age','male','bmi','duration_min','ebl_ml'].map(k=>[k,num(k)]));
  x.pod1_drop=x.pre_HGB-x.pod1_hgb;x.pre_hgb=x.pre_HGB;Object.assign(x,calendarTerms($('surgery').value));
  if(env?.admission===$('admission').value&&env?.city.id===$('city').value&&env.summary.complete){x.pm25_30=env.summary.values.pm25.mean;x.temp_30=env.summary.values.temp.mean;x.rh_30=env.summary.values.rh.mean;x.pm=x.pm25_30;}
  return x;
}
const pretty=v=>(v*100).toFixed(1)+'%';
function renderChart(){
  const series=[result.clinical,...(result.environment?[result.environment]:[])],vals=series.flat();
  const width=720,height=300,left=48,right=22,top=24,bottom=40;
  const lo=Math.floor((Math.min(...vals,100)-8)/10)*10,hi=Math.ceil((Math.max(...vals,100)+8)/10)*10;
  const x=i=>left+i*(width-left-right)/6,y=v=>top+(hi-v)/(hi-lo)*(height-top-bottom);
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Hemoglobin trajectory from POD1 to POD7</title><desc id="chart-desc">Anchored at measured POD1. Solid: environmental model. Dashed: clinical-calendar model. Values are in the table below. Point forecasts, without prediction intervals.</desc>`;
  for(let v=lo;v<=hi;v+=10)svg+=`<line x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}" stroke="#eaf0eb" stroke-width="1"/><text x="${left-12}" y="${y(v)+3}" text-anchor="end" fill="#9aa7a0" font-size="10">${v}</text>`;
  svg+=`<line x1="${left}" y1="${y(100)}" x2="${width-right}" y2="${y(100)}" stroke="#ccb58c" stroke-dasharray="3 5"/><text x="${width-right}" y="${y(100)-6}" text-anchor="end" fill="#b19a77" font-size="9">100 g/L · event definition</text>`;
  const path=a=>a.map((v,i)=>`${i?'L':'M'}${x(i)},${y(v)}`).join(' ');
  if(result.environment){svg+=`<path d="${path(result.environment)} L${x(6)},${height-bottom} L${x(0)},${height-bottom} Z" fill="#edf6f0" opacity=".6"/>`;}
  svg+=`<path d="${path(result.clinical)}" fill="none" stroke="#9aaab5" stroke-width="2" stroke-dasharray="5 5"/>`;
  if(result.environment)svg+=`<path d="${path(result.environment)}" fill="none" stroke="#16695e" stroke-width="2.5"/>`;
  for(let i=0;i<7;i++){
    svg+=`<text x="${x(i)}" y="${height-13}" text-anchor="middle" fill="#81938a" font-size="10">POD ${i+1}</text>`;
    for(const [a,color] of [[result.clinical,'#9aaab5'],...(result.environment?[[result.environment,'#16695e']]:[])])svg+=`<circle cx="${x(i)}" cy="${y(a[i])}" r="${i?3.5:5}" fill="${i?'white':'#233d4d'}" stroke="${i?color:'#233d4d'}" stroke-width="2"><title>POD${i+1}: ${a[i].toFixed(2)} g/L</title></circle>`;
  }
  svg+='</svg>';$('chart').innerHTML=svg;
  $('result-label').textContent=exampleMode?'Fictional example':'Forecast ready';$('result-label').className='pill good';
  $('trajectory-values').hidden=false;$('trajectory-table').replaceChildren();
  for(let i=0;i<7;i++){const row=document.createElement('tr');for(const val of [`POD${i+1}${i===0?' (measured)':''}`,result.clinical[i].toFixed(1),result.environment?result.environment[i].toFixed(1):'Not calculated']){const c=document.createElement('td');c.textContent=val;row.append(c);}$('trajectory-table').append(row);}
  const trajectory=result.environment||result.clinical,nadir=Math.min(...trajectory.slice(1)),day=trajectory.indexOf(nadir)+1;
  $('result-summary').hidden=false;$('result-summary').textContent=`${result.environment?'With environment':'Clinical + calendar'}: the lowest predicted POD2–7 value is ${nadir.toFixed(1)} g/L (POD${day}).`;
}
function renderRisk(){
  if(!result)return;
  const p=result.risk.environment??result.risk.clinical;$('risk-value').textContent=pretty(p);$('risk-description').textContent=result.environment?'Environmental model':'Clinical + calendar model';
  $('risk-clinical').textContent=pretty(result.risk.clinical);$('risk-environment').textContent=result.environment?pretty(result.risk.environment):'Incomplete environment';
  $('risk-bar-clinical').style.width=result.risk.clinical*100+'%';$('risk-bar-environment').style.width=(result.risk.environment||0)*100+'%';
  const t=Number($('threshold').value)/100,flag=p>=t;$('threshold-status').textContent=`At an illustrative ${Math.round(t*100)}% threshold: ${flag?'flag triggered':'flag not triggered'}.`;$('threshold-status').className='small '+(flag?'flagged':'clear');
}
async function calculate(event){
  event?.preventDefault();
  try{
    const input=buildInput(),ticket=revision;$('predict').disabled=true;status('Computing locally in your browser…');await new Promise(r=>setTimeout(r,20));
    if(ticket!==revision)return;
    const clinical=predictEnsemble(models.clinical,input),environment=input.pm25_30!==undefined?predictEnsemble(models.environment,input):null;
    const risk={clinical:predictRisk(riskModels.clinical,input),environment:environment?predictRisk(riskModels.environment,input):null};
    if([...clinical,...(environment||[]),risk.clinical,...(environment?[risk.environment]:[])].some(v=>!Number.isFinite(v)))throw Error('The model returned a non-finite result. Check inputs.');
    result={input,clinical,environment,risk,generated_at:new Date().toISOString(),city:cities.find(c=>c.id===$('city').value)?.label,admission:$('admission').value,surgery:$('surgery').value};
    renderChart();renderRisk();for(const id of ['export-json','export-csv','print'])$(id).disabled=false;
    const missing=['bmi','duration_min','ebl_ml'].filter(k=>input[k]===null),outside=Object.entries(manifest.ranges).filter(([k,r])=>input[k]!=null&&(input[k]<r.min||input[k]>r.max)).map(([k])=>k);
    status(`${exampleMode?'Fictional example. ':'Calculation complete. '}${environment?'Both model sets calculated. ':'Incomplete environment: clinical-calendar model only. '}${missing.length?` ${missing.length} optional field(s) imputed using training rules.`:''}${outside.length?' Some inputs fall outside the local training range; this is extrapolation.':''}`);
  }catch(e){invalidate();status(e.message,true);}finally{$('predict').disabled=!models.clinical;}
}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('clinical-form').addEventListener('submit',calculate);
for(const el of $('clinical-form').querySelectorAll('input,select'))el.addEventListener('input',()=>{exampleMode=false;invalidate();status('Inputs changed. Generate a new forecast.');});
for(const id of ['city','admission'])$(id).addEventListener('change',()=>{clearEnvironment();if($('admission').value)loadEnvironment();});
$('fetch-env').addEventListener('click',()=>loadEnvironment(true));
$('threshold').addEventListener('input',()=>{$('threshold-value').textContent=$('threshold').value+'%';renderRisk();});
$('env-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2e6)throw Error('File exceeds 2 MB. Include daily records for one city only.');const rows=parseDailyCSV(await f.text());await loadEnvironment(true,rows);}catch(err){$('env-status').textContent='Import failed: '+err.message;}e.target.value='';});
$('example').addEventListener('click',async()=>{exampleMode=true;const values={city:'city-00',admission:'2026-03-15',surgery:'2026-03-18',pre_HGB:132,pod1_hgb:112,age:68,male:0,bmi:26.4,duration_min:95,ebl_ml:80};for(const [k,v] of Object.entries(values))$(k).value=v;await loadEnvironment(false);if(models.clinical)await calculate();else status('Fictional inputs loaded. Generate a forecast once the model is ready.');});
$('reset').addEventListener('click',()=>{$('clinical-form').reset();exampleMode=false;clearEnvironment();$('threshold').value=20;$('threshold-value').textContent='20%';$('fetch-env').disabled=false;status('Inputs cleared. No clinical inputs were saved to a server.');});
$('export-json').addEventListener('click',()=>{if(!result)return;download('PULSE-calculation.json',JSON.stringify({purpose:'Teaching simulation only; not for clinical use',version:manifest.version,example:exampleMode,...result,threshold:Number($('threshold').value)/100,environment_data:env,model_lineage:{trajectory:manifest.trajectory_lineage,risk:manifest.risk_lineage,discrepancy:manifest.mismatch}},null,2),'application/json');});
$('export-csv').addEventListener('click',()=>{if(!result)return;const rows=['purpose,day,clinical_calendar_hgb_g_L,environment_hgb_g_L',...result.clinical.map((v,i)=>`teaching_simulation,POD${i+1},${v.toFixed(4)},${result.environment?result.environment[i].toFixed(4):''}`)];download('PULSE-trajectory.csv','\uFEFF'+rows.join('\r\n'),'text/csv;charset=utf-8');});
$('print').addEventListener('click',()=>window.print());
try{
  [cities,manifest]=await Promise.all([json('./data/environment/cities.json'),json('./data/model-manifest.json')]);
  for(const city of cities){const o=document.createElement('option');o.value=city.id;o.textContent=city.label;$('city').append(o);}
  const [clinical,environment,risks]=await Promise.all([json('./data/model-clinical.json'),json('./data/model-environment.json'),json('./data/risk-models.json')]);
  models={clinical,environment};riskModels=risks;$('engine-status').textContent='● Local inference ready';$('predict').disabled=false;
}catch(e){$('engine-status').textContent='Models could not load';status('Open the website URL and refresh to retry. '+e.message,true);}
