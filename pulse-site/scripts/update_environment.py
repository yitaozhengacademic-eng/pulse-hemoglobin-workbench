"""Download public CNEMC city observations and ERA5 only. Standard library.

Scheduled daily by GitHub Actions. Missing days stay missing; no forecasts,
no CAMS substitution. Caches previously fetched air days to limit source load.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import argparse,csv,io,json,urllib.request,urllib.parse,time,datetime,hashlib
from zoneinfo import ZoneInfo
root=Path(__file__).resolve().parents[1];out=root/'dist/data/environment'
p=argparse.ArgumentParser();p.add_argument('--days',type=int,default=40);p.add_argument('--end');args=p.parse_args()
today=datetime.datetime.now(ZoneInfo('Asia/Shanghai')).date()
end=datetime.date.fromisoformat(args.end) if args.end else today-datetime.timedelta(days=1)
dates=[end-datetime.timedelta(days=i) for i in range(args.days)]
cities=json.loads((out/'cities.json').read_text());names=[c['city'] for c in cities]
data={c['id']:json.loads((out/(c['id']+'.json')).read_text()) for c in cities}
lookup={k:{r['date']:r for r in d['rows']} for k,d in data.items()}
receipts=[];errors=[]
def get(url):
    for i in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'PULSE-Teaching-Environmental-Archive/1.0'})
            return urllib.request.urlopen(req,timeout=35).read()
        except Exception:
            if i==2:raise
            time.sleep(i+1)
def air_day(d):
    ds=str(d)
    if all(ds in lookup[c['id']] and lookup[c['id']][ds].get('air_fetched') for c in cities):return None
    url='https://quotsoft.net/air/data/china_cities_'+d.strftime('%Y%m%d')+'.csv'
    raw=get(url);rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    hours={n:{} for n in names};seen_hours=set()
    for row in rows:
        if row.get('type')!='PM2.5':continue
        h=int(row['hour'])
        if h<0 or h>23:continue
        if h in seen_hours:raise ValueError('Duplicate hourly PM2.5 record in source file')
        seen_hours.add(h)
        if str(row.get('date'))!=d.strftime('%Y%m%d'):raise ValueError('Source date does not match requested date')
        for city in names:
            try:v=float(row.get(city,''))
            except (ValueError,TypeError):continue
            if 0<=v<=1500:hours[city][h]=v
    return ds,{n:dict(pm25=sum(v.values())/len(v) if len(v)>=20 else None,hours=len(v),air_fetched=True) for n,v in hours.items()},dict(date=ds,url=url,sha256=hashlib.sha256(raw).hexdigest())
with ThreadPoolExecutor(max_workers=3) as pool:
    futures={pool.submit(air_day,d):d for d in dates}
    for fut in as_completed(futures):
        try:
            result=fut.result()
            if result:
                ds,values,receipt=result;receipts.append(receipt)
                for c in cities:lookup[c['id']].setdefault(ds,dict(date=ds,temp=None,rh=None)).update(values[c['city']])
        except Exception as e:errors.append(dict(source='PM2.5',date=str(futures[fut]),error=str(e)[:160]))
def weather(c):
    params=dict(latitude=c['lat'],longitude=c['lon'],start_date=str(min(dates)),end_date=str(end),daily='temperature_2m_mean,relative_humidity_2m_mean',models='era5',timezone='Asia/Shanghai')
    url='https://archive-api.open-meteo.com/v1/archive?'+urllib.parse.urlencode(params)
    raw=get(url);j=json.loads(raw);d=j['daily']
    return c['id'],[dict(date=day,temp=d['temperature_2m_mean'][i],rh=d['relative_humidity_2m_mean'][i]) for i,day in enumerate(d['time'])],dict(city=c['city'],url=url,sha256=hashlib.sha256(raw).hexdigest())
with ThreadPoolExecutor(max_workers=2) as pool:
    futures={pool.submit(weather,c):c for c in cities}
    for fut in as_completed(futures):
        try:
            key,rows,receipt=fut.result();receipts.append(receipt)
            for row in rows:lookup[key].setdefault(row['date'],dict(date=row['date'],pm25=None,hours=0)).update(row)
        except Exception as e:errors.append(dict(source='ERA5',city=futures[fut]['city'],error=str(e)[:160]))
stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
for c in cities:
    k=c['id'];data[k]['rows']=sorted(lookup[k].values(),key=lambda r:r['date']);data[k]['last_refresh_attempt']=stamp
    (out/(k+'.json')).write_text(json.dumps(data[k],ensure_ascii=False,separators=(',',':'),allow_nan=False))
status=dict(last_attempt=stamp,requested_start=str(min(dates)),requested_end=str(end),receipts=receipts,errors=errors,
    pm_source='https://quotsoft.net/air/',weather_source='https://open-meteo.com/en/docs/historical-weather-api',
    complete_refresh=not errors,notice='ERA5 has a publication delay. Null values are retained; source success does not imply a complete 30-day window.')
(out/'status.json').write_text(json.dumps(status,ensure_ascii=False,separators=(',',':')))
print(json.dumps(dict(source_responses=len(receipts),failed_requests=len(errors),requested_end=str(end))))
if len(errors)>=len(dates)+len(cities):raise SystemExit('All upstream requests failed; previous observations retained.')
