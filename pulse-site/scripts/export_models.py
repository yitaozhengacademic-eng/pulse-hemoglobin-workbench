"""Export disclosed teaching weights, never patient rows or training identifiers.

Usage: python scripts/export_models.py --source PATH_TO_POOLED_ANALYSIS
Requires the original research Python environment. Does not alter source files.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, json, math
import numpy as np
import pandas as pd
import torch
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

args = argparse.ArgumentParser()
args.add_argument('--source', type=Path, required=True)
args = args.parse_args()
root = Path(__file__).resolve().parents[1]
source = args.source.resolve()
spec = importlib.util.spec_from_file_location('pulse_source', source/'code/pulse_compact_models.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
torch.set_num_threads(1)

def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, allow_nan=False, separators=(',', ':')))

models, nets, provenance = {}, {}, []
for key, label in [('clinical', 'PULSE_clinical_calendar'), ('environment', 'PULSE_joint_environment')]:
    models[key], nets[key] = [], []
    for fold in range(1, 6):
        for seed in (17, 29, 43):
            p = source/f'models/environment_fold{fold}_{label}_{seed}.pt'
            ck = torch.load(p, map_location='cpu', weights_only=False)
            pre = ck['preprocessor']
            net = module.PulseNet(len(ck['features']), 2, (6,7))
            net.load_state_dict(ck['model_state_dict']); net.eval()
            artifact = dict(fold=fold, seed=seed, epochs=ck['epochs'], features=ck['features'],
                            median=pre['median'], scale=pre['scale'], curve=ck['curve_coef'],
                            weights={k:v.tolist() for k,v in ck['model_state_dict'].items()})
            models[key].append(artifact); nets[key].append((artifact,net))
            provenance.append(dict(file=p.name, sha256=hashlib.sha256(p.read_bytes()).hexdigest(),
                                   training_n=len(pre['training_patients']), fold=fold, seed=seed))
    dump(root/f'dist/data/model-{key}.json', models[key])

# The original repeated-CV risk script did not save its fitted estimators.
# This is an explicitly versioned deployment refit, not an OOF prediction.
dec = pd.read_csv(source/'tables/decision_patient_dataset.csv')
dec['pm'] = dec.pm25_30
dec = dec.dropna(subset=['pm','temp_30','rh_30']).sort_values('patient_id')
assert len(dec) == dec.person_id.nunique() == 131
base = ['pod1_hgb','pre_hgb','age','male','sin_year','cos_year']
risks, risk_estimators = {}, {}
for key, features in [('clinical',base),('environment',base+['temp_30','rh_30','pm'])]:
    pipe = make_pipeline(SimpleImputer(strategy='median',add_indicator=True,keep_empty_features=True),
                         StandardScaler(),LogisticRegression(C=1.,max_iter=3000,random_state=20261025))
    pipe.fit(dec[features], dec.event100)
    imp,sc,lr = pipe.steps[0][1],pipe.steps[1][1],pipe.steps[2][1]
    risks[key] = dict(features=features, medians=imp.statistics_.tolist(),
                      indicator_indices=imp.indicator_.features_.tolist(), mean=sc.mean_.tolist(),
                      scale=sc.scale_.tolist(), coef=lr.coef_[0].tolist(), intercept=float(lr.intercept_[0]),
                      training_n=len(dec), events=int(dec.event100.sum()), lineage='131-record teaching deployment refit; not out-of-fold')
    risk_estimators[key] = pipe
dump(root/'dist/data/risk-models.json',risks)

trajectory = pd.read_csv(source/'tables/pooled_trajectory_dataset.csv').dropna(subset=['pm25_30','temp_30','rh_30'])
ranges = {f:dict(min=float(trajectory[f].min()),max=float(trajectory[f].max())) for f in models['environment'][0]['features']}
manifest = dict(version='PULSE-Teaching-Web-20261027.1', status='Teaching simulation; not validated for clinical use',
    data_lineage='Outcome-directed adjustment of 144 POD2-7 Hb cells in 86 records; 191-record assembled teaching cohort.',
    trajectory_lineage='Mean of 15 existing checkpoints per input set (5 outer folds x 3 seeds); no new trajectory training. Ensemble performance is not the reported OOF performance.',
    risk_lineage='New C=1 ridge-logistic deployment refit on all 131 eligible teaching records. Published OOF AUC does not validate this fitted deployment model.',
    mismatch=dict(manuscript_environment_mae=5.87,local_saved_environment_mae=10.031893761710053,
                  manuscript_clinical_calendar_mae=10.95,local_saved_clinical_calendar_mae=11.123572109309771,
                  note='Manuscript summary and available local artifacts differ; the website uses the identified local checkpoints.'),
    supported_days=[2,3,4,5,6,7], ranges=ranges, checkpoints=provenance,
    risk_input_sha256=hashlib.sha256((source/'tables/decision_patient_dataset.csv').read_bytes()).hexdigest())
dump(root/'dist/data/model-manifest.json', manifest)

# Purely invented verification vectors. No source patient is published.
rng = np.random.default_rng(20261027)
cases=[]
for i in range(24):
    x=dict(pre_HGB=float(rng.uniform(105,160)),pod1_hgb=float(rng.uniform(85,140)),age=float(rng.uniform(50,80)),
           male=int(i%2),bmi=float(rng.uniform(20,35)),duration_min=float(rng.uniform(70,150)),ebl_ml=float(rng.uniform(20,200)),
           sin_year=float(np.sin(i)),cos_year=float(np.cos(i)),pm25_30=float(rng.uniform(15,100)),
           temp_30=float(rng.uniform(-2,25)),rh_30=float(rng.uniform(30,85)))
    x['pod1_drop']=x['pre_HGB']-x['pod1_hgb'];x['pre_hgb']=x['pre_HGB'];x['pm']=x['pm25_30']
    if i%4==0: x['bmi']=None; x['ebl_ml']=None
    if i==1:x['age']=None
    expected={}
    for key in models:
        outputs=[]
        for a,n in nets[key]:
            v=np.array([np.nan if x[f] is None else x[f] for f in a['features']]);miss=~np.isfinite(v)
            z=np.arcsinh((np.where(miss,a['median'],v)-a['median'])/a['scale'])
            tb=module.basis(np.arange(1,8))
            with torch.inference_mode():res=n(torch.tensor(z[None],dtype=torch.float32),torch.tensor(miss[None],dtype=torch.float32),torch.tensor(tb,dtype=torch.float32)).numpy()[0]
            outputs.append((10*(x['pod1_hgb']/10+tb@np.array(a['curve'])+res)).tolist())
        frame=pd.DataFrame([{f:x[f] for f in risks[key]['features']}]).replace({None:np.nan})
        expected[key]=dict(trajectory=np.mean(outputs,axis=0).tolist(),risk=float(risk_estimators[key].predict_proba(frame)[0,1]))
    cases.append(dict(input=x,expected=expected))
dump(root/'tests/parity-vectors.json',cases)

# Audit existing fold predictions against the corresponding saved OOF table.
oof=pd.read_csv(source/'tables/environment_trajectory_oof.csv')
audit={}
for key,label in [('clinical','PULSE clinical calendar'),('environment','PULSE joint environment')]:
    errors=[]
    for fold in range(1,6):
        rows=oof[(oof.model==label)&(oof.fold==fold)]
        dd=rows[['patient_id','day']].merge(trajectory,on=['patient_id','day'],validate='one_to_one')
        ps=[]
        for a,n in nets[key]:
            if a['fold']!=fold:continue
            v=dd[a['features']].to_numpy(float);miss=~np.isfinite(v)
            z=np.arcsinh((np.where(miss,a['median'],v)-a['median'])/a['scale'])
            tb=module.basis(np.arange(2,8))
            with torch.inference_mode():res=n(torch.tensor(z,dtype=torch.float32),torch.tensor(miss,dtype=torch.float32),torch.tensor(tb,dtype=torch.float32)).numpy()
            slots=dd.day.to_numpy(int)-2
            ps.append(10*(dd.pod1_hgb.to_numpy()/10+(tb@np.array(a['curve']))[slots]+res[np.arange(len(dd)),slots]))
        actual=pd.DataFrame({'patient_id':dd.patient_id,'day':dd.day,'reproduced':np.mean(ps,axis=0)})
        cmp=rows.merge(actual,on=['patient_id','day'])
        errors.extend(abs(cmp.prediction-cmp.reproduced))
    audit[key]=dict(rows=len(errors),max_absolute_error=float(max(errors)))
    assert max(errors)<0.001,(key,max(errors))
dump(root/'docs/checkpoint-audit.json',audit)
print(json.dumps(dict(checkpoint_audit=audit,synthetic_cases=len(cases),risk_refit_n=len(dec)),indent=2))
