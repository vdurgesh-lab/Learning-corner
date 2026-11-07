/* Learning Corner shared helper. Load it in <head>, after catalog.js and before the page's own script.
   - Learners: each child gets their own progress. Every app saves with localStorage, so this file
     quietly gives each learner their own space (keys are stored as "lcp.<learner>.<key>").
     Progress saved before learners existed moves to the first learner.
   - Remembers the last page each learner opened, for "Keep going" on the home page.
   - Adds the learner badge to a page's top bar. */
(function(){
  'use strict';
  let L=null;try{L=window.localStorage;L.getItem('lc.test')}catch(e){L=null}
  const P=Storage.prototype,RAW={get:P.getItem,set:P.setItem,rem:P.removeItem,key:P.key};
  const rget=k=>{try{return L?RAW.get.call(L,k):null}catch(e){return null}};
  const rset=(k,v)=>{try{if(L)RAW.set.call(L,k,v)}catch(e){}};
  const rrem=k=>{try{if(L)RAW.rem.call(L,k)}catch(e){}};
  const rkeys=()=>{const o=[];try{if(L)for(let i=0;i<L.length;i++)o.push(RAW.key.call(L,i))}catch(e){}return o};
  const J=(k,d)=>{try{const v=rget(k);return v==null?d:JSON.parse(v)}catch(e){return d}};
  const S=(k,v)=>rset(k,JSON.stringify(v));
  const mine=k=>typeof k==='string'&&!k.startsWith('lc.')&&!k.startsWith('lcp.');
  const AVATARS=['🦊','🐼','🐢','🦁','🐙','🦄','🐸','🐧','🐝','🚀','🦖','🐳'];
  const newId=()=>'p'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);

  let learners=J('lc.learners',[]);
  if(L&&!learners.length){ // first visit: make one learner and give them any progress saved so far
    const p={id:newId(),name:'Learner 1',avatar:AVATARS[0],grade:null};learners=[p];S('lc.learners',learners);
    rkeys().filter(mine).forEach(k=>{const v=rget(k);if(v!=null)rset('lcp.'+p.id+'.'+k,v)});
    rset('lc.current',p.id);
  }
  let curId=rget('lc.current');if(!learners.some(p=>p.id===curId)&&learners[0]){curId=learners[0].id;rset('lc.current',curId)}
  const pre=()=>'lcp.'+curId+'.';
  if(L&&curId){
    P.getItem=function(k){return RAW.get.call(this,this===L&&mine(k)?pre()+k:k)};
    P.setItem=function(k,v){return RAW.set.call(this,this===L&&mine(k)?pre()+k:k,v)};
    P.removeItem=function(k){return RAW.rem.call(this,this===L&&mine(k)?pre()+k:k)};
  }

  const SUBJ=window.LC_SUBJECTS||[],TOP=window.LC_TOPICS||[];
  const file=(location.pathname.split('/').pop()||'index.html');
  let here=null;
  for(const t of TOP){if(t.url===file)here={topic:t,grade:null};if(t.grades)for(const[g,u]of Object.entries(t.grades))if(u===file)here={topic:t,grade:+g}}
  if(here&&curId)S('lc.last.'+curId,{topic:here.topic.id,grade:here.grade,url:file,at:Date.now()});

  const LC=window.LC={
    AVATARS,subjects:SUBJ,topics:TOP,here,
    learners:()=>learners.slice(),
    current:()=>learners.find(p=>p.id===curId)||null,
    setCurrent(id){if(learners.some(p=>p.id===id)){curId=id;rset('lc.current',id)}},
    add(name,avatar,grade){const p={id:newId(),name:String(name||'').trim().slice(0,20)||'Learner '+(learners.length+1),avatar:avatar||AVATARS[learners.length%AVATARS.length],grade:grade??null};learners.push(p);S('lc.learners',learners);return p},
    update(id,ch){const p=learners.find(x=>x.id===id);if(!p)return;Object.assign(p,ch);if(ch.name!=null)p.name=String(ch.name).trim().slice(0,20)||p.name;S('lc.learners',learners)},
    erase(id){rkeys().filter(k=>k&&k.startsWith('lcp.'+id+'.')).forEach(rrem);rrem('lc.last.'+id)},
    remove(id){if(learners.length<2)return false;LC.erase(id);learners=learners.filter(p=>p.id!==id);S('lc.learners',learners);if(curId===id)LC.setCurrent(learners[0].id);return true},
    last(){const l=J('lc.last.'+curId,null);if(!l)return null;const t=TOP.find(x=>x.id===l.topic);return t?{...l,topicObj:t}:null},
    topic:id=>TOP.find(t=>t.id===id),
    subject:id=>SUBJ.find(s=>s.id===id),
    chipEl(cls){const p=LC.current();if(!p)return null;const a=document.createElement('a');a.className=(cls||'')+' lcme';a.href='index.html';
      a.title='Switch learner';a.setAttribute('aria-label',`Learner: ${p.name}. Switch learner`);a.innerHTML=`<span aria-hidden="true">${p.avatar}</span><span class="lcmen"> ${p.name.replace(/[<>&]/g,'')}</span>`;return a}
  };

  /* learner badge in the top bar: #nav (Fractions, Multiplication) or after #lcBtn (Money Time) */
  const css=document.createElement('style');
  css.textContent='.lcme{gap:4px}#nav .lcme{margin-left:auto}@media (max-width:440px){.lcme .lcmen{display:none}.tool.lcme{display:none}}';
  document.head.appendChild(css);
  document.addEventListener('DOMContentLoaded',()=>{
    const nav=document.getElementById('nav');
    if(nav&&nav.querySelector('a[href="index.html"]')){const c=LC.chipEl('navb');if(c)nav.append(c)}
    const lcb=document.getElementById('lcBtn');
    if(lcb){const c=LC.chipEl('tool');if(c){c.innerHTML=c.innerHTML.replace('lcmen','w');lcb.parentNode.insertBefore(c,lcb.nextSibling)}}
  });
})();
