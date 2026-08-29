const A=require('./impl-A/index.js'), B=require('./impl-B/index.js'), C=require('./impl-C/index.js');
const mk=()=>[1,2,3,4,5,6,7,8].map(n=>({id:'i'+n,body:n}));
function scripted(){
  const calls=[]; let t2=0;
  return { calls, send: async(it)=>{
    calls.push(it.id);
    if(it.id==='i2'){ t2++; if(t2<=2) return {ok:false,retryable:true,reason:'混み合い'}; return {ok:true}; }
    if(it.id==='i4') return {ok:false,retryable:false,reason:'中身が不正'};
    if(it.id==='i6') throw new Error('接続断');
    return {ok:true};
  }};
}
const impls={
  A:{ run:(items,send,p,o)=>A.runBatch(items,send,{...o,progress:p}), np:()=>A.createProgress(), done:(p,items)=>A.isComplete(items,p) },
  B:{ run:(items,send,p,o)=>B.run(items,send,p,o), np:()=>B.createProgress(), done:(p,items)=>B.isComplete(items,p) },
  C:{ run:(items,send,p,o)=>C.runOnce(items,send,p,o), np:()=>C.createProgress(), done:(p,items)=>C.isComplete(items,p) },
};
(async()=>{
  const out={};
  for(const [k,i] of Object.entries(impls)){
    const s=scripted(); const items=mk();
    let p=i.np(); let runs=0; let last=null;
    const opt={ batchSize:3, maxPerRun:3, waitMs:0, retryDelayMs:0 };
    while(runs<20){
      runs++;
      const r=await i.run(items,s.send,p,opt);
      if(r&&r.progress) p=r.progress;
      last=r;
      if(i.done(p,items)) break;
    }
    const cnt={}; for(const id of s.calls) cnt[id]=(cnt[id]||0)+1;
    out[k]={ runs, 送信回数:cnt, 成功:(p.sent||p.succeeded||[]).length||JSON.stringify(p.sent||'?'), 失敗:(p.failed||[]).map(f=>f.id||f).sort() };
  }
  for(const k of ['A','B','C']){
    console.log('['+k+'] 実行'+out[k].runs+'回  成功'+out[k].成功+'件  失敗['+out[k].失敗.join(',')+']');
    console.log('     送信回数: '+JSON.stringify(out[k].送信回数));
  }
  const key=k=>JSON.stringify([out[k].送信回数,out[k].失敗,out[k].runs]);
  console.log('\n3体一致: '+(key('A')===key('B')&&key('B')===key('C')?'✓ 完全一致':'✗ 相違あり'));
})();
