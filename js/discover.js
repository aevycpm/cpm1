/* Aevy Discover: a one-time "scripts from the community" card for new visitors.
   Shows up to 3 random PUBLIC scripts by other members, each with an explicit Download button.
   Nothing is ever downloaded automatically: the visitor must press Download.
   Shown once per browser (remembered in localStorage), a few seconds after the site has loaded.
   Turn it off in js/config.js with  discover: false . */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,cfg=window.AEVY_CONFIG||window.AevyConfig||{};
if(!C||!A||cfg.discover===false)return;
var KEY='aevy.discover.v1',esc=C.esc,box=null;
function $(s,r){return (r||document).querySelector(s)}
function seen(){try{return localStorage.getItem(KEY)==='1'}catch(e){return false}}
function mark(){try{localStorage.setItem(KEY,'1')}catch(e){}}
function pool(){
  var m=A.current();
  return C.vis().filter(function(s){return s.vis!=='private'&&(!m||s.owner!==m.id)});
}
function pick(n,skip){
  var p=pool().filter(function(s){return !skip||skip.indexOf(s.id)<0});
  if(p.length<n&&skip)p=pool();
  for(var i=p.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=p[i];p[i]=p[j];p[j]=t}
  return p.slice(0,n);
}
var DL='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14"/></svg>';
function row(s){
  var u=A.byId(s.owner),by=u?u.name||u.username:(s.author||'Member');
  return '<li class="dc-item"><button type="button" class="dc-main" data-open="'+esc(s.id)+'"><b>'+esc(s.title)+'</b><small>by '+esc(by)+' &middot; '+esc(s.cat||'Other')+(s.downloads?' &middot; '+s.downloads.toLocaleString()+' downloads':'')+'</small></button>'+
   '<button type="button" class="btn btn-sm dc-dl" data-act="dl" data-id="'+esc(s.id)+'" aria-label="Download '+esc(s.title)+'">'+DL+'<span>Download</span></button></li>';
}
var shown=[];
function paint(list){
  shown=list.map(function(s){return s.id});
  $('.dc-list',box).innerHTML=list.map(row).join('');
}
function close(){if(!box)return;box.classList.add('out');var b=box;box=null;setTimeout(function(){b.remove()},220)}
function show(){
  if(box||seen())return;
  var list=pick(3);if(!list.length)return;
  mark();
  box=document.createElement('aside');box.className='dc';box.setAttribute('aria-label','Scripts from the community');
  box.innerHTML='<header class="dc-head"><div><span class="dc-tag">Community picks</span><h3>New scripts to try</h3></div><button type="button" class="dc-x" aria-label="Close">&times;</button></header>'+
   '<ul class="dc-list"></ul><footer class="dc-foot"><button type="button" class="dc-shuffle">Show different scripts</button><a href="#/scripts">Browse all</a></footer>';
  document.body.appendChild(box);paint(list);
  box.querySelector('.dc-x').onclick=close;
  box.querySelector('.dc-shuffle').onclick=function(){var l=pick(3,shown);if(l.length)paint(l)};
  box.querySelector('.dc-foot a').onclick=close;
  box.addEventListener('click',function(e){if(e.target.closest('.dc-main'))close()});
}
function ready(){
  if(seen())return;
  var tries=0,t=setInterval(function(){
    tries++;
    var busy=document.querySelector('dialog[open]')||/^#\/(auth|publish)/.test(location.hash);
    if(pool().length&&!busy&&tries>=4){clearInterval(t);show()}
    if(tries>30)clearInterval(t);
  },1000);
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&box)close()});
(A.ready||Promise.resolve()).then(ready);
})();
