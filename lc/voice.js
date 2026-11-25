/* Learning Corner voice: one calm, natural voice for every page.
   - Runs the Kokoro neural voice (Apache-2.0) inside the browser, in a background worker.
     Nothing is sent to a server; the model downloads once (about 92 MB) and the browser keeps it.
   - Pages keep their own speaking code. They ask LCVoice.active() and, if true, call
     LCVoice.speakPart(sentence) instead of the device voice. If the natural voice is off,
     still loading, or fails, the page keeps using the device voice, so there is never silence.
   - Sentences that never change are pre-made with the same voice (lc/voice-clips, made by
     tools/make_voice_clips.py) and play instantly; everything else is made live.
   - A small helper (voice-sw.js) lets the live voice use several processor cores.
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
  /* fraction names for any bottom number: 4 fourth, 16 sixteenth, 24 twenty-fourth */
  const ORDX={one:'first',two:'second',three:'third',five:'fifth',eight:'eighth',nine:'ninth',twelve:'twelfth'};
  function ordinal(d){const w=intWords(d).replace(/^one (hundred|thousand|million)$/,'$1'),m=/(.*?)([a-z]+)$/.exec(w),last=m[2];
    return m[1]+(ORDX[last]||(/y$/.test(last)?last.slice(0,-1)+'ieth':last+'th'))}
  function fracName(d,many){if(d===2)return many?'halves':'half';if(d===4&&!many)return 'fourth';const o=ordinal(d);return many?o+'s':o}
  const LETTER={a:'ay',b:'bee',c:'see',d:'dee',e:'ee',f:'eff',g:'jee',h:'aitch',i:'eye',j:'jay',k:'kay',l:'ell',m:'em',n:'en',o:'oh',p:'pee',q:'cue',r:'are',s:'ess',t:'tee',u:'you',v:'vee',w:'double you',x:'ex',y:'why',z:'zee'};
  function prepare(t){
    const one=/^\s*([A-Za-z])\s*[.?!]?\s*$/.exec(String(t??''));if(one)return LETTER[one[1].toLowerCase()];
    return String(t??'')
      .replace(/\p{Extended_Pictographic}|️/gu,'')
      .replace(/\$(\d+)\.(\d\d)\b/g,(m,d,c)=>{const ds=+d===1?'1 dollar':d+' dollars';return +c?`${ds} and ${+c} ${+c===1?'cent':'cents'}`:ds})
      .replace(/\$(\d+)\b/g,(m,d)=>+d===1?'1 dollar':d+' dollars').replace(/(\d+)\s*¢/g,(m,n)=>+n===1?'1 cent':n+' cents')
      .replace(/\b(\d+)\s+(\d+)\s*\/\s*(\d+)\b/g,'$1 and $2/$3')
      .replace(/(\d+)\s*\/\s*(\d+)/g,(m,n,d)=>{n=+n;d=+d;if(d<2||d>1000)return `${intWords(n)} over ${intWords(d)}`;return `${intWords(n)} ${fracName(d,n!==1)}`})
      .replace(/10\^(\d+)/g,(m,k)=>`ten to the power of ${intWords(+k)}`)
      .replace(/×/g,' times ').replace(/÷/g,' divided by ').replace(/−/g,' minus ').replace(/\s\+\s/g,' plus ').replace(/\s=\s/g,' equals ')
      .replace(/\b(\d+)s\b/g,(m,n)=>plural(intWords(+n)))
      .replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g,m=>numWords(m))
      .replace(/(^|[\s,(])\?(?=[\s,.)]|$)/g,'$1what')
      .replace(/[“”"]/g,'').replace(/\s+([.,?!])/g,'$1').replace(/\s+/g,' ').trim()}
  const sentences=t=>prepare(t).split(/(?<=[.?!])\s+/).map(x=>x.trim()).filter(Boolean);

  /* ---------- pre-made clips for sentences that never change ---------- */
  const CLIPBASE=new URL('voice-clips/',BASE);let CLIPS=null;
  fetch(new URL('manifest.json',CLIPBASE)).then(r=>r.ok?r.json():null).then(m=>{if(m&&m.speeds){CLIPS={};for(const k in m.speeds)CLIPS[k]=new Set(m.speeds[k])}}).catch(()=>{});
  function fnv(s){let h=0x811c9dc5;for(const b of new TextEncoder().encode(s)){h^=b;h=Math.imul(h,0x01000193)>>>0}return h.toString(16).padStart(8,'0')}
  function clipURL(text,speed){if(!CLIPS)return null;const tag=String(Math.round(speed*100)),set=CLIPS[tag];if(!set)return null;
    const c=fnv(tag+'|'+text);return set.has(c)?new URL(tag+'/'+c+'.mp3',CLIPBASE).href:null}
  function decode(buf){const c=audio();return new Promise((res,rej)=>{try{const p=c.decodeAudioData(buf,res,rej);if(p&&p.then)p.then(res,rej)}catch(e){rej(e)}})}

  /* ---------- helper for several processor cores (see voice-sw.js) ---------- */
  const SW=new URL('../voice-sw.js',BASE),SCOPE=new URL('../',BASE).pathname;
  const swOK=()=>'serviceWorker' in navigator&&window.isSecureContext;
  function isolate(){if(window.crossOriginIsolated||!swOK())return Promise.resolve(false);
    return navigator.serviceWorker.register(SW.href,{scope:SCOPE}).then(()=>navigator.serviceWorker.ready).then(()=>true).catch(()=>false)}
  function unisolate(){if(!swOK())return;navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>{const a=r.active||r.waiting||r.installing;if(a&&a.scriptURL===SW.href)r.unregister()})).catch(()=>{})}
  const ss={get(k){try{return sessionStorage.getItem(k)}catch(e){return null}},set(k,v){try{sessionStorage.setItem(k,v)}catch(e){}},del(k){try{sessionStorage.removeItem(k)}catch(e){}}};

  /* ---------- state ---------- */
  let worker=null,state='off',progress=0,err='',files={},ready=false;
  const listeners=new Set();
  const emit=()=>listeners.forEach(f=>{try{f({state,progress,err})}catch(e){}});
  const supported=()=>typeof Worker!=='undefined'&&typeof WebAssembly!=='undefined'&&!!(window.AudioContext||window.webkitAudioContext);

  /* ---------- audio ---------- */
  let ctx=null,cur=null,runId=0;
  function audio(){if(!ctx){const C=window.AudioContext||window.webkitAudioContext;ctx=new C()}if(ctx.state!=='running')ctx.resume().catch(()=>{});return ctx}
  /* Safari (Mac, iPhone, iPad) only lets sound start inside a click, a finished touch, or a key press.
     Unlock on those events (before the page's own handlers run) by playing a tiny silent sound. */
  let unlocked=false;
  function unlock(){if(state==='off')return;let c;try{c=audio()}catch(e){return}
    if(!unlocked){try{const b=c.createBuffer(1,1,22050),s=c.createBufferSource();s.buffer=b;s.connect(c.destination);s.start(0);unlocked=true}catch(e){}}}
  ['click','touchend','keydown','mousedown','pointerup'].forEach(ev=>addEventListener(ev,unlock,{passive:true,capture:true}));
  /* wait briefly for sound to be allowed; if it is not, the page uses the device voice for this sentence instead of playing silence */
  async function running(){const c=audio();if(c.state==='running')return c;
    for(let i=0;i<6&&c.state!=='running';i++){try{await Promise.race([c.resume(),new Promise(r=>setTimeout(r,60))])}catch(e){}}
    if(c.state!=='running')throw new Error('Sound is blocked until the page is tapped.');return c}
  function trim(pcm,sr){const th=.004,pad=Math.round(sr*.04);let a=0,b=pcm.length-1;while(a<b&&Math.abs(pcm[a])<th)a++;while(b>a&&Math.abs(pcm[b])<th)b--;
    return pcm.subarray(Math.max(0,a-pad),Math.min(pcm.length,b+pad))}
  async function play(pcm,sr,vol){const c=await running();return new Promise(res=>{const buf=c.createBuffer(1,pcm.length,sr);buf.copyToChannel(pcm,0);
    const src=c.createBufferSource(),g=c.createGain(),t0=c.currentTime,dur=pcm.length/sr,v=Math.max(.05,Math.min(1,vol??.85));
    g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(v,t0+.012);g.gain.setValueAtTime(v,t0+Math.max(.012,dur-.02));g.gain.linearRampToValueAtTime(0,t0+dur);
    src.buffer=buf;src.connect(g);g.connect(c.destination);let done=false;const fin=()=>{if(done)return;done=true;if(cur===src)cur=null;res()};
    src.onended=fin;cur=src;src.start();setTimeout(fin,dur*1000+400)})}
  function stopAudio(){runId++;if(cur){try{cur.stop()}catch(e){}cur=null}while(urgent.length)later.unshift(urgent.pop())}

  /* ---------- generation: one job at a time, spoken lines before prefetched ones ---------- */
  const cache=new Map(),urgent=[],later=[],jobs=new Map();let busy=false,nextId=1;
  const key=(t,s)=>s.toFixed(2)+'|'+t;
  function synth(text,speed,prio,noClip){const k=key(text,speed);
    if(cache.has(k)){const v=cache.get(k);cache.delete(k);cache.set(k,v);if(prio&&v.job&&!v.started){const i=later.indexOf(v.job);if(i>=0){later.splice(i,1);urgent.push(v.job)}}return v.p}
    const url=noClip?null:clipURL(text,speed);
    if(url){const p=fetch(url).then(r=>{if(!r.ok)throw new Error('clip');return r.arrayBuffer()}).then(decode).then(b=>({pcm:trim(b.getChannelData(0),b.sampleRate),sr:b.sampleRate}))
      .catch(()=>{cache.delete(k);return synth(text,speed,true,true)});cache.set(k,{p,job:null,started:true});return p}
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
    enable(){ls.set(PREF,'natural');audio();if(state==='error'){worker=null}
      /* first install the helper for more cores; the page then reloads once and the voice starts with it */
      if(!window.crossOriginIsolated&&swOK()&&!ss.get('lc.voice.reloaded')){state='loading';progress=0;emit();
        isolate().then(ok=>{if(ok&&!window.crossOriginIsolated){ss.set('lc.voice.reloaded','1');ss.set('lc.voice.reopen','1');location.reload()}else start()});return}
      start()},
    disable(){ls.set(PREF,'device');stopAudio();unisolate();emit()},
    /* true once, right after the reload that switched the helper on (the page can reopen its settings) */
    justTurnedOn(){const v=ss.get('lc.voice.reopen')==='1';ss.del('lc.voice.reopen');return v},
    get fast(){return !!window.crossOriginIsolated},
    onChange(f){listeners.add(f);return()=>listeners.delete(f)},
    /* speed: 1 is normal; 0.85 is calm and slow */
    async speakPart(text,{speed=.85,volume=.85}={}){const t=prepare(text);if(!t)return;const run=runId;
      const a=await synth(t,speed,true);if(run!==runId)return;await play(a.pcm,a.sr,volume)},
    async speak(text,{speed=.85,volume=.85}={}){const parts=sentences(text),run=++runId;parts.forEach(p=>synth(p,speed,true).catch(()=>{}));
      for(const p of parts){let a;try{a=await synth(p,speed,true)}catch(e){return}if(run!==runId)return;await play(a.pcm,a.sr,volume);if(run!==runId)return;
        await new Promise(r=>setTimeout(r,/\?$/.test(p)?520:320))}},
    /* make sentences ahead of time; urgent ones (about to be spoken) go before background ones */
    prefetch(list,{speed=.85,urgent=false}={}){if(!ready)return;for(const t of list)for(const x of segments(String(t??''))){const p=prepare(x.src);if(p)synth(p,speed,urgent).catch(()=>{})}},
    stop:stopAudio,
    /* the natural speed that matches a page's device-voice rate */
    speedFor(rate){return rate==null?.85:rate<.5?.6:rate<.68?.72:rate<.82?.85:.95},
    /* For pages that keep their own speech queue: say one piece of text in the natural voice.
       Resolves when it has been said (or was stopped). Rejects before any sound if the natural
       voice cannot say it, so the page can use the device voice for it instead.
       Options: rate (the page's device rate) or speed, volume (0-1), onstart(),
       boundary(charIndex): called about when each word of the original text is said. */
    async utter(text,{rate,speed,volume=.85,onstart,boundary}={}){
      if(!LCVoice.active())throw new Error('natural voice not ready');
      const sp=speed??LCVoice.speedFor(rate),run=runId,raw=String(text??'');
      const list=segments(raw).map(x=>({...x,t:prepare(x.src)})).filter(x=>x.t);if(!list.length)return;
      list.forEach(x=>{x.p=synth(x.t,sp,true);x.p.catch(()=>{})});
      let played=false;
      for(let i=0;i<list.length;i++){const x=list[i];let a;
        try{a=await x.p}catch(e){if(!played)throw e;return}
        if(run!==runId)return;
        if(boundary)words(x,a.pcm.length/a.sr,boundary,run);
        try{const pl=play(a.pcm,a.sr,volume);if(!played){played=true;if(onstart)onstart()}await pl}catch(e){if(!played)throw e;return}
        if(run!==runId)return;
        if(i<list.length-1)await new Promise(r=>setTimeout(r,/\?\s*$/.test(x.src)?480:300))}},
    /* A settings section any page can show: turn on, progress, errors, test. test() should speak through the page. */
    panel({test}={}){return panel(test)},
    browserTip(){return browserTip()}
  };
  /* split text at sentence ends, keeping where each piece starts in the original */
  function segments(raw){const out=[];let st=0,m;const re=/[.?!]+["”')]*\s+/g;
    while((m=re.exec(raw))){const end=m.index+m[0].length;out.push({off:st,src:raw.slice(st,end)});st=end}
    if(st<raw.length)out.push({off:st,src:raw.slice(st)});return out}
  /* there is no word timing from the model, so spread the words over the sentence by length */
  function words(x,dur,cb,run){const ws=[];let m;const re=/\S+/g;while((m=re.exec(x.src)))ws.push({i:x.off+m.index,w:m[0].replace(/[^\p{L}\p{N}]/gu,'').length+2+(/[,;:]$/.test(m[0])?3:0)});
    const tot=ws.reduce((s,a)=>s+a.w,0)||1;let acc=0;
    for(const a of ws){const t=dur*acc/tot*1000;acc+=a.w;setTimeout(()=>{if(run===runId)cb(a.i)},t)}}
  /* ---------- which browser works best ---------- */
  const isSafari=()=>{const u=navigator.userAgent;return /Safari\//.test(u)&&!/Chrome|Chromium|CriOS|FxiOS|Firefox|Edg|OPR|Android/.test(u)};
  function browserTip(){return isSafari()?'Tip: the natural voice works best in Chrome or Firefox. In Safari it can be slow or silent. For the best sound, open this page in Chrome or Firefox.':'The natural voice works best in Chrome or Firefox.'}
  /* ---------- shared settings section ---------- */
  function panel(test){
    if(!document.getElementById('lcv-css')){const st=document.createElement('style');st.id='lcv-css';st.textContent=
      '.lcv{display:grid;gap:8px;padding:12px 14px;border:2px solid #d5dee8;border-radius:12px;background:#f6f9fc;font-size:16px;line-height:1.4;text-align:left}'+
      '.lcv .lcv-h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:17px}.lcv .lcv-on{background:#e1f4e7;color:#1d6e3f;border-radius:99px;padding:1px 10px;font-size:14px;font-weight:600}'+
      '.lcv p{margin:0;color:#4a5568;font-size:15px}.lcv p.lcv-tip{color:#2c5c94;font-weight:600}.lcv .lcv-row{display:flex;flex-wrap:wrap;gap:8px}'+
      '.lcv button{font:inherit;font-size:16px;min-height:44px;padding:6px 14px;border-radius:10px;border:2px solid #2c5c94;background:#fff;color:#2c5c94;cursor:pointer}'+
      '.lcv button.lcv-main{background:#2c5c94;color:#fff}.lcv button:focus-visible{outline:3px solid #f5c542;outline-offset:2px}'+
      '.lcv .lcv-bar{height:10px;border-radius:99px;background:#e2e8f0;overflow:hidden}.lcv .lcv-bar i{display:block;height:100%;background:#2f855a;transition:width .3s}';
      document.head.append(st)}
    const el=document.createElement('div');el.className='lcv';
    const E=(t,a,...k)=>{const e=document.createElement(t);for(const n in a||{}){if(n==='class')e.className=a[n];else if(n==='onclick')e.onclick=a[n];else e.setAttribute(n,a[n])}e.append(...k.filter(x=>x!=null));return e};
    const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const draw=()=>{el.textContent='';el.append(E('div',{class:'lcv-h'},'Natural voice',LCVoice.active()?E('span',{class:'lcv-on'},'On'):null));
      if(!supported()){el.append(E('p',{},'This browser cannot run the natural voice, so the device voice is used. Open this page in Chrome or Firefox to use it.'));return}
      el.append(E('p',{class:'lcv-tip'},browserTip()));
      const pc=Math.round(progress*100);
      if(LCVoice.wanted()&&state==='loading'){el.append(E('p',{},`Getting the voice ready: ${pc}%. You can keep going. The device voice is used until it is ready.`),
        E('div',{class:'lcv-bar',role:'progressbar','aria-valuenow':pc,'aria-valuemin':0,'aria-valuemax':100,'aria-label':'Natural voice download'},E('i',{style:`width:${pc}%`})));return}
      if(LCVoice.wanted()&&state==='error'){el.append(E('p',{},'The natural voice could not load on this device, so the device voice is used.'),E('p',{style:'font-size:13px'},'Details: '+(err||'unknown')),
        E('div',{class:'lcv-row'},E('button',{type:'button',onclick(){LCVoice.enable()}},'Try again'),E('button',{type:'button',onclick(){LCVoice.disable()}},'Use the device voice')));return}
      if(LCVoice.active()){el.append(E('p',{},'A calm voice made right on this device'+(window.crossOriginIsolated?', using several processor cores':'')+'. On older computers it may pause for a moment before some sentences.'+(ios?' On iPhone and iPad, turn off silent mode to hear it.':'')),
        E('div',{class:'lcv-row'},test?E('button',{type:'button',onclick(){test()}},'▶ Hear it'):null,E('button',{type:'button',onclick(){LCVoice.disable()}},'Use the device voice instead')));return}
      el.append(E('p',{},`A calm, natural voice that sounds the same on every device. It downloads once (about ${CFG.sizeMB} MB), then also works offline. Best on Wi-Fi.`),
        E('div',{class:'lcv-row'},E('button',{type:'button',class:'lcv-main',onclick(){LCVoice.enable()}},'Turn on natural voice')))};
    draw();const off=LCVoice.onChange(()=>{if(!el.isConnected&&el.dataset.shown){off();return}draw()});
    requestAnimationFrame(()=>{el.dataset.shown='1'});return el}
  if(LCVoice.wanted()&&supported()){start();if(!window.crossOriginIsolated)isolate()}
})();
