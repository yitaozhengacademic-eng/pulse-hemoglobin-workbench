export function dateWindow(admission,days=30){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(admission))throw Error('Enter a valid admission date');
  const date=new Date(admission+'T00:00:00Z');
  if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==admission)throw Error('Invalid admission date');
  return Array.from({length:days},(_,i)=>new Date(+date-(days-i)*86400000).toISOString().slice(0,10));
}
export function aggregateWindow(rows,admission){
  const dates=dateWindow(admission),lookup=new Map();
  for(const r of rows){if(lookup.has(r.date))throw Error('Duplicate dates in daily data');lookup.set(r.date,r);}
  const daily=dates.map(date=>lookup.get(date)||{date,pm25:null,temp:null,rh:null,hours:0});
  const values={};
  for(const key of ['pm25','temp','rh']){
    const valid=daily.filter(r=>typeof r[key]==='number'&&Number.isFinite(r[key])&&(key!=='pm25'||r.hours>=20));
    values[key]={n:valid.length,mean:valid.length>=27?valid.reduce((s,r)=>s+r[key],0)/valid.length:null};
  }
  return {start:dates[0],end:dates.at(-1),daily,values,complete:Object.values(values).every(v=>v.mean!==null)};
}
export async function fetchWeather(city,admission,signal){
  const dates=dateWindow(admission);
  const params=new URLSearchParams({latitude:city.lat,longitude:city.lon,start_date:dates[0],end_date:dates.at(-1),daily:'temperature_2m_mean,relative_humidity_2m_mean',models:'era5',timezone:'Asia/Shanghai'});
  const url='https://archive-api.open-meteo.com/v1/archive?'+params;
  const timeout=AbortSignal.timeout(20000);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const r=await fetch(url,{signal:combined});if(!r.ok)throw Error(`ERA5 request failed (${r.status})`);
  const j=await r.json();if(!j.daily?.time)throw Error(j.reason||'Unexpected ERA5 response');
  return {url,retrieved_at:new Date().toISOString(),rows:j.daily.time.map((date,i)=>({date,temp:j.daily.temperature_2m_mean[i],rh:j.daily.relative_humidity_2m_mean[i]}))};
}
export function parseDailyCSV(text){
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),head=lines.shift().split(',').map(x=>x.trim());
  const needed=['date','pm25','n_valid_hours'];if(needed.some(k=>!head.includes(k)))throw Error('CSV requires date, pm25 and n_valid_hours columns');
  const rows=lines.filter(x=>x.trim()).map(line=>{
    const cols=line.split(','),obj=Object.fromEntries(head.map((h,i)=>[h,(cols[i]||'').trim()]));
    dateWindow(obj.date,1);
    const pm25=obj.pm25===''?null:Number(obj.pm25),hours=Number(obj.n_valid_hours);
    if((pm25!==null&&(!Number.isFinite(pm25)||pm25<0||pm25>2000))||!Number.isInteger(hours)||hours<0||hours>24)throw Error('Invalid PM2.5 value or hourly count in CSV');
    return {date:obj.date,pm25,hours};
  });
  if(new Set(rows.map(x=>x.date)).size!==rows.length)throw Error('Duplicate dates in CSV. Import daily data for one city only.');
  return rows;
}
