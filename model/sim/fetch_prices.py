"""Pull DraftKings closing prices (spread, total, moneyline and their odds) from ESPN game files.
Usage: python model/sim/fetch_prices.py <box-score dir with nba_schedule_YYYY.parquet> <out.json>"""
import json, sys, requests, concurrent.futures as cf, pandas as pd
URL="https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-raw/main/nba/json/final/{}.json"
def get(gid):
    try:
        r=requests.get(URL.format(gid),timeout=60)
        if r.status_code==404: return gid,{}
        r.raise_for_status(); pc=r.json().get("pickcenter") or []
        for p in sorted(pc,key=lambda x:(x.get("provider") or {}).get("priority",99)):
            if p.get("spread") is None and p.get("overUnder") is None: continue
            h=p.get("homeTeamOdds") or {}; a=p.get("awayTeamOdds") or {}
            return gid,{"book":(p.get("provider") or {}).get("name"),"spread":p.get("spread"),"total":p.get("overUnder"),
                "ml_h":h.get("moneyLine"),"ml_a":a.get("moneyLine"),"sp_h":h.get("spreadOdds"),"sp_a":a.get("spreadOdds"),
                "ov":p.get("overOdds"),"un":p.get("underOdds")}
        return gid,{}
    except Exception as e: return gid,None
data_dir, out = sys.argv[1], sys.argv[2]
ids=[]
for y in [2026,2027]:
    s=pd.read_parquet(f"{data_dir}/nba_schedule_{y}.parquet"); s=s[(s.status_type_completed==True)&(s.season_type==2)]
    ids+=s.game_id.astype(str).tolist()
res={}
with cf.ThreadPoolExecutor(16) as ex:
    for g,v in ex.map(get,ids): res[g]=v
json.dump(res,open(out,"w"))
ok=[v for v in res.values() if v and v.get("ml_h") is not None]
print(len(ids),"games;",len(ok),"with moneylines;",sum(1 for v in res.values() if v is None),"errors")
