/* Inference-only port of the saved PyTorch PULSE architecture. No training data. */
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const linear=(x,w,b)=>w.map((r,i)=>dot(r,x)+b[i]);
function softmax(a){const m=Math.max(...a),e=a.map(x=>Math.exp(x-m)),s=e.reduce((a,b)=>a+b,0);return e.map(x=>x/s);}
function erf(x){const s=x<0?-1:1,a=Math.abs(x),t=1/(1+.3275911*a);return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a));}
const gelu=x=>.5*x*(1+erf(x/Math.SQRT2));
function norm(x,w,b){const m=x.reduce((a,b)=>a+b)/x.length,v=x.reduce((a,b)=>a+(b-m)**2,0)/x.length;return x.map((a,i)=>(a-m)/Math.sqrt(v+1e-5)*w[i]+b[i]);}
function attention(q,k,v,w,p){
  const iw=w[p+'.in_proj_weight'],ib=w[p+'.in_proj_bias'];
  const Q=q.map(x=>linear(x,iw.slice(0,16),ib.slice(0,16)));
  const K=k.map(x=>linear(x,iw.slice(16,32),ib.slice(16,32)));
  const V=v.map(x=>linear(x,iw.slice(32,48),ib.slice(32,48)));
  return Q.map(qv=>{
    const out=[];
    for(let h=0;h<2;h++){
      const ix=h*8,pr=softmax(K.map(kv=>dot(qv.slice(ix,ix+8),kv.slice(ix,ix+8))/Math.sqrt(8)));
      for(let j=ix;j<ix+8;j++)out.push(V.reduce((s,v,i)=>s+pr[i]*v[j],0));
    }
    return linear(out,w[p+'.out_proj.weight'],w[p+'.out_proj.bias']);
  });
}
export function basis(day){const t=(day-1)/6;return [t,t*t,t*t*t,...[.25,.5,.75].map(c=>t*Math.exp(-(((t-c)/.25)**2)))];}
export function predictCheckpoint(a,input){
  const w=a.weights,miss=a.features.map(f=>input[f]===null||input[f]===undefined||!Number.isFinite(input[f])?1:0);
  const z=a.features.map((f,i)=>Math.asinh(((miss[i]?a.median[i]:input[f])-a.median[i])/a.scale[i]));
  let tokens=z.map((v,i)=>w.feature_id[i].map((b,j)=>b+v*w.value_weight[i][j]+miss[i]*w.missing_weight[i][j]));
  let normalized=tokens.map(x=>norm(x,w['encoder.norm1.weight'],w['encoder.norm1.bias']));
  const selfAttention=attention(normalized,normalized,normalized,w,'encoder.self_attn');
  tokens=tokens.map((x,i)=>add(x,selfAttention[i]));
  tokens=tokens.map(x=>add(x,linear(linear(norm(x,w['encoder.norm2.weight'],w['encoder.norm2.bias']),w['encoder.linear1.weight'],w['encoder.linear1.bias']).map(gelu),w['encoder.linear2.weight'],w['encoder.linear2.bias'])));
  const h=linear(linear([z[6],z[7],miss[6],miss[7]],w['history.0.weight'],w['history.0.bias']).map(gelu),w['history.2.weight'],w['history.2.bias']);
  const bases=Array.from({length:7},(_,i)=>basis(i+1));
  const q=bases.map(b=>add(linear(b,w['query.weight'],w['query.bias']),h));
  const attended=attention(q,tokens,tokens,w,'attention');
  const mean=tokens[0].map((_,j)=>tokens.reduce((s,t)=>s+t[j],0)/tokens.length);
  const gate=softmax(linear([...mean,...h],w['gate.weight'],w['gate.bias']));
  return q.map((x,i)=>{
    const state=norm(add(x,attended[i]),w['norm.weight'],w['norm.bias']);
    const expert=[0,1].map(k=>linear(linear(state,w[`experts.${k}.0.weight`],w[`experts.${k}.0.bias`]).map(gelu),w[`experts.${k}.3.weight`],w[`experts.${k}.3.bias`])[0]);
    return input.pod1_hgb+10*(dot(bases[i],a.curve)+dot(expert,gate)*bases[i][0]);
  });
}
export function predictEnsemble(models,input){const all=models.map(m=>predictCheckpoint(m,input));return Array.from({length:7},(_,i)=>all.reduce((s,x)=>s+x[i],0)/all.length);}
export function predictRisk(m,input){
  const missing=m.features.map(f=>input[f]===null||input[f]===undefined||!Number.isFinite(input[f]));
  const a=m.features.map((f,i)=>missing[i]?m.medians[i]:input[f]);
  a.push(...m.indicator_indices.map(i=>+missing[i]));
  const lp=m.intercept+dot(a.map((v,i)=>(v-m.mean[i])/m.scale[i]),m.coef);
  return lp>=0?1/(1+Math.exp(-lp)):Math.exp(lp)/(1+Math.exp(lp));
}
export function calendarTerms(date){const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==date)throw Error('Invalid surgery date');const doy=Math.floor((d-Date.UTC(d.getUTCFullYear(),0,0))/86400000),v=2*Math.PI*doy/365.25;return {sin_year:Math.sin(v),cos_year:Math.cos(v)};}
