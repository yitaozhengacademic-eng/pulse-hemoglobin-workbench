"""Seed ONLY city-level public environmental series, never clinical records."""
from pathlib import Path
import csv,json,datetime,argparse,hashlib
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);a=p.parse_args()
out=Path(__file__).resolve().parents[1]/'dist/data/environment';out.mkdir(parents=True,exist_ok=True)
cities=list(csv.DictReader((a.source/'city_centres.csv').open()))
labels=['Zhengzhou','Kaifeng','Luoyang','Pingdingshan','Anyang','Hebi','Xinxiang','Jiaozuo','Puyang','Xuchang','Luohe','Sanmenxia','Nanyang','Shangqiu','Xinyang','Zhoukou','Zhumadian','Jiyuan','Qingyang','Xingtai','Zaozhuang']
air=list(csv.DictReader((a.source/'city_daily_pm25.csv').open()))
weather=list(csv.DictReader((a.source/'city_daily_weather.csv').open()))
def number(v):
    try:
        x=float(v)
        return x if x==x else None
    except (ValueError,TypeError):return None
for i,c in enumerate(cities):
    c.update(id=f'city-{i:02}',label=labels[i],lon=float(c['lon']),lat=float(c['lat']))
    rows={r['date']:dict(date=r['date'],pm25=number(r['pm25']),hours=int(r['n_valid_hours']),temp=None,rh=None) for r in air if r['city']==c['city']}
    for r in weather:
        if r['city']!=c['city']:continue
        v=rows.setdefault(r['date'],dict(date=r['date'],pm25=None,hours=0))
        v.update(temp=number(r['temp']),rh=number(r['rh']))
    payload=dict(city=c['city'],latitude=c['lat'],longitude=c['lon'],timezone='Asia/Shanghai',
        retrieved_at='2026-10-25',source='CNEMC city hourly archive via Quotsoft; ERA5 via Open-Meteo',
        weather_source='ERA5; models=era5; Asia/Shanghai',rows=sorted(rows.values(),key=lambda x:x['date']))
    (out/(c['id']+'.json')).write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'),allow_nan=False))
(out/'cities.json').write_text(json.dumps(cities,ensure_ascii=False,separators=(',',':')))
(out/'status.json').write_text(json.dumps(dict(last_attempt='2026-10-25',seeded=True,note='Historical source snapshot. Daily GitHub Action extends recent city environmental data; weather is also refreshed directly on request.'),ensure_ascii=False))
print('Exported public city series:',len(cities))
