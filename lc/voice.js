/* Learning Corner voice: one calm, natural voice for every page.
   - Runs the Kokoro neural voice (Apache-2.0) inside the browser, in a background worker.
     Nothing is sent to a server; the model downloads once (about 92 MB) and the browser keeps it.
   - Pages keep their own speaking code. They ask LCVoice.active() and, if true, call
     LCVoice.speakPart(sentence) instead of the device voice. If the natural voice is off,
     still loading, or fails, the page keeps using the device voice, so there is never silence.
   - To change how the voice is made later (recorded clips, a cloud voice), change only this file.
   Load it in <head> with: <script src="lc/voice.js"></script> */
(function(){
  'use strict';
  const BASE=(document.currentScript&&document.currentScript.src)||location.href;
  const CFG={model:'onnx-community/Kokoro-82M-v1.0-ONNX',dtype:'q8',voice:'af_heart',sizeMB:92};
  const PREF='lc.voice';
  const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

  /* ---------- say numbers and math the way a teacher would ---------- */
  const ONES=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const BIG=[[1e9,'billion'],[1e6,'million'],[1e3,'thousand']];
  function under1000(n){let o=[];if(n>=100){o.push(ONES[Math.floor(n/100)],'hundred');n%=100}
    if(n>=20){o.push(TENS[Math.floor(n/10)]+(n%10?'-'+ONES[n%10]:''))}else if(n>0||!o.length)o.push(ONES[n]);return o.join(' ')}
  function intWords(n){if(!Number.isFinite(n))return String(n);if(n<0)return 'minus '+intWords(-n);if(n===0)return 'zero';
    const o=[];for(const[v,w]of BIG)if(n>=v){o.push(under1000(Math.floor(n/v)),w);n%=v}
    if(n>0)o.push(under1000(n));return o.join(' ')}
  function numWords(s){s=s.replace(/,/g,'');if(s.includes('.')){const[a,b]=s.split('.');return (a?intWords(+a):'zero')+' point '+b.split('').map(d=>ONES[+d]).join(' ')}return intWords(+s)}
  const plural=w=>/six$/.test(w)?w+'es':/y$/.test(w)?w.slice(0,-1)+'ies':w+'s';
  const ORD={2:['half','halves'],3:['third','thirds'],4:['fourth','fourths'],5:['fifth','fifths'],6:['sixth','sixths'],7:['seventh','sevenths'],8:['eighth','eighths'],9:['ninth','ninths'],10:['tenth','tenths'],12:['twelfth','twelfths'],100:['hundredth','hundredths']};
  function prepare(t){
    return String(t??'')
      .replace(/\p{Extended_Pictographic}|️/gu,'')
      .replace(/(\d+)\s*\/\s*(\d+)/g,(m,n,d)=>{n=+n;d=+d;const w=ORD[d];return w?`${intWords(n)} ${n===1?w[0]:w[1]}`:`${intWords(n)} over ${intWords(d)}`})
      .replace(/10\^(\d+)/g,(m,k)=>`ten to the power of ${intWords(+k)}`)
      .replace(/×/g,' times ').replace(/÷/g,' divided by ').replace(/−/g,' minus ').replace(/\s\+\s/g,' plus ').replace(/\s=\s/g,' equals ')
      .replace(/\b(\d+)s\b/g,(m,n)=>plural(intWords(+n)))
      .replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g,m=>numWords(m))
      .replace(/(^|[\s,(])\?(?=[\s,.)]|$)/g,'$1what')
      .replace(/[“”"]/g,'').replace(/\s+([.,?!])/g,'$1').replace(/\s+/g,' ').trim()}
  const sentences=t=>prepare(t).split(/(?<=[.?!])\s+/).map(x=>x.trim()).filter(Boolean);

  /* ---------- state ---------- */
  let worker=null,state='off',progress=0,err='',files={},ready=false;
  const listeners=new Set();
  const emit=()=>listeners.forEach(f=>{try{f({state,progress,err})}catch(e){}});
  const supported=()=>typeof Worker!=='undefined'&&typeof WebAssembly!=='undefined'&&!!(window.AudioContext||window.webkitAudioContext);

  /* ---------- audio ---------- */
  let ctx=null,cur=null,runId=0;
  function audio(){if(!ctx){const C=window.AudioContext||window.webkitAudioContext;ctx=new C()}if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx}
  ['pointerdown','keydown','touchstart'].forEach(ev=>addEventListener(ev,()=>{if(state!=='off')audio()},{passive:true}));
  function trim(pcm,sr){const th=.004,pad=Math.round(sr*.04);let a=0,b=pcm.length-1;while(a<b&&Math.abs(pcm[a])<th)a++;while(b>a&&Math.abs(pcm[b])<th)b--;
    return pcm.subarray(Math.max(0,a-pad),Math.min(pcm.length,b+pad))}
  function play(pcm,sr,vol){return new Promise(res=>{const c=audio(),buf=c.createBuffer(1,pcm.length,sr);buf.copyToChannel(pcm,0);
    const src=c.createBufferSource(),g=c.createGain(),t0=c.currentTime,dur=pcm.length/sr,v=Math.max(.05,Math.min(1,vol??.85));
    g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(v,t0+.012);g.gain.setValueAtTime(v,t0+Math.max(.012,dur-.02));g.gain.linearRampToValueAtTime(0,t0+dur);
    src.buffer=buf;src.connect(g);g.connect(c.destination);let done=false;const fin=()=>{if(done)return;done=true;if(cur===src)cur=null;res()};
    src.onended=fin;cur=src;src.start();setTimeout(fin,dur*1000+400)})}
  function stopAudio(){runId++;if(cur){try{cur.stop()}catch(e){}cur=null}while(urgent.length)later.unshift(urgent.pop())}

  /* ---------- generation: one job at a time, spoken lines before prefetched ones ---------- */
  const cache=new Map(),urgent=[],later=[],jobs=new Map();let busy=false,nextId=1;
  const key=(t,s)=>s.toFixed(2)+'|'+t;
  function synth(text,speed,prio){const k=key(text,speed);
    if(cache.has(k)){const v=cache.get(k);cache.delete(k);cache.set(k,v);if(prio&&v.job&&!v.started){const i=later.indexOf(v.job);if(i>=0){later.splice(i,1);urgent.push(v.job)}}return v.p}
    let job;const p=new Promise((resolve,reject)=>{job={text,speed,resolve,reject}});const entry={p,job,started:false};job.entry=entry;
    (prio?urgent:later).push(job);cache.set(k,entry);while(cache.size>400)cache.delete(cache.keys().next().value);pumpJobs();return p}
  function pumpJobs(){if(busy||!ready||!worker)return;const job=urgent.shift()||later.shift();if(!job)return;busy=true;job.entry.started=true;
    const id=nextId++;jobs.set(id,job);worker.postMessage({type:'synth',id,text:job.text,voice:CFG.voice,speed:job.speed})}

  /* ---------- worker ---------- */
  function start(){if(worker||!supported())return;state='loading';progress=0;err='';files={};emit();
    try{worker=new Worker(new URL('voice-worker.js',BASE),{type:'module'})}catch(e){fail('This browser cannot run the natural voice.');return}
    worker.onmessage=({data:m})=>{
      if(m.type==='progress'){if(m.file){const f=files[m.file]||(files[m.file]={l:0,t:0});if(m.total)f.t=m.total;f.l=m.status==='done'?f.t||f.l:(m.loaded||f.l)}
        let L=0,T=0;for(const f of Object.values(files)){L+=f.l;T+=f.t}progress=T?Math.min(.99,L/T):progress;emit()}
      else if(m.type==='ready'){ready=true;state='ready';progress=1;emit();pumpJobs()}
      else if(m.type==='error'){fail(m.msg||'The natural voice could not load.')}
      else if(m.type==='audio'){const job=jobs.get(m.id);jobs.delete(m.id);busy=false;
        if(job){if(m.err){cache.delete(key(job.text,job.speed));job.reject(new Error(m.err))}else job.resolve({pcm:trim(m.pcm,m.sr),sr:m.sr})}pumpJobs()}};
    worker.onerror=e=>{fail((e&&e.message)||'The natural voice could not load.')};
    worker.postMessage({type:'init',model:CFG.model,dtype:CFG.dtype,voice:CFG.voice})}
  function fail(msg){err=msg;state='error';ready=false;busy=false;if(worker){try{worker.terminate()}catch(e){}}worker=null;
    jobs.forEach(j=>j.reject(new Error(msg)));jobs.clear();[...urgent,...later].forEach(j=>j.reject(new Error(msg)));urgent.length=0;later.length=0;cache.clear();emit()}

  /* ---------- public ---------- */
  const LCVoice=window.LCVoice={
    sizeMB:CFG.sizeMB,voiceName:'Heart',prepare,sentences,
    supported,
    get state(){return state},get progress(){return progress},get error(){return err},
    wanted:()=>ls.get(PREF)==='natural',
    active:()=>ls.get(PREF)==='natural'&&ready,
    enable(){ls.set(PREF,'natural');audio();if(state==='error'){worker=null}start()},
    disable(){ls.set(PREF,'device');stopAudio();emit()},
    onChange(f){listeners.add(f);return()=>listeners.delete(f)},
    /* speed: 1 is normal; 0.85 is calm and slow */
    async speakPart(text,{speed=.85,volume=.85}={}){const t=prepare(text);if(!t)return;const run=runId;
      const a=await synth(t,speed,true);if(run!==runId)return;await play(a.pcm,a.sr,volume)},
    async speak(text,{speed=.85,volume=.85}={}){const parts=sentences(text),run=++runId;parts.forEach(p=>synth(p,speed,true).catch(()=>{}));
      for(const p of parts){let a;try{a=await synth(p,speed,true)}catch(e){return}if(run!==runId)return;await play(a.pcm,a.sr,volume);if(run!==runId)return;
        await new Promise(r=>setTimeout(r,/\?$/.test(p)?520:320))}},
    /* make sentences ahead of time; urgent ones (about to be spoken) go before background ones */
    prefetch(list,{speed=.85,urgent=false}={}){if(!ready)return;for(const t of list){const p=prepare(t);if(p)synth(p,speed,urgent).catch(()=>{})}},
    stop:stopAudio
  };
  if(LCVoice.wanted()&&supported())start();
})();
