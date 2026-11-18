/* Aevy home: a social feed. Left: your card + shortcuts. Centre: composer + feed (Latest / Following / Trending).
   Right: live stats, who to follow, who is online. */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth;
if(!C||!A)return;
var esc=C.esc,$=function(s,r){return (r||document).querySelector(s)};
var tab='latest',shown=12,STEP=12;
function me(){return A.current()}
function av(u,n){return window.AevyEco?AevyEco.avatar(u,n):''}
function badge(u){return window.AevyBadge?AevyBadge.html(u):''}
function S(){return window.AevySocial}
function ico(p){return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'}
var I={
  scripts:ico('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'),
  people:ico('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.7.8 3 2.6 3 5.6"/>'),
  msg:ico('<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20.5l1.4-5.4A8.5 8.5 0 1 1 21 11.5z"/>'),
  files:ico('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  play:ico('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>'),
  plus:ico('<path d="M12 5v14M5 12h14"/>')
};

function isCreator(id){var u=A.byId?A.byId(id):null,B=window.AevyBadge;return !!(u&&B&&B.isCreator(u))}
function feedList(){
  /* Home only shows posts from Creators; new users' first posts stay on their profile until they earn the badge */
  var all=C.vis().filter(function(s){return isCreator(s.owner)}),f=S()?S().following():{};
  if(tab==='following')all=all.filter(function(s){return f[s.owner]});
  if(tab==='trending'){
    var week=Date.now()-14*864e5;
    all=all.filter(function(s){return s.created>week||(s.likes||0)+(s.downloads||0)>0});
    all.sort(function(a,b){return ((b.likes||0)*3+(b.downloads||0)+(b.views||0)*.2)-((a.likes||0)*3+(a.downloads||0)+(a.views||0)*.2)||b.created-a.created});
  }else all.sort(function(a,b){return b.created-a.created});
  return all;
}
function emptyMsg(){
  if(tab==='following'){
    if(!me())return '<h3>Sign in to see your following feed</h3><p>Follow creators and their new scripts show up here.</p><a class="btn btn-primary" href="#/auth">Sign in</a>';
    return '<h3>Nothing from people you follow yet</h3><p>Follow a few creators from the suggestions and their scripts will appear here.</p>';
  }
  return '<h3>No scripts yet</h3><p>Be the first to share something.</p><a class="btn btn-primary" href="#/publish">Publish a script</a>';
}
function paintFeed(){
  var box=$('#homeFeed');if(!box)return;
  var list=feedList(),part=list.slice(0,shown);
  box.innerHTML=part.length?part.map(C.cardHTML).join('')+(list.length>shown?'<button class="btn feed-more" id="feedMore" type="button">Show more</button>':''):'<div class="empty">'+emptyMsg()+'</div>';
  document.querySelectorAll('#homeTabs [data-tab]').forEach(function(b){var on=b.dataset.tab===tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
}

function leftCard(){
  var m=me();
  if(!m)return '';   /* signed out: no welcome card, the feed starts straight away */
  return '<a class="hs-card hs-me" href="#/profile"><span class="hs-cover" style="--c:'+esc(m.color)+'"></span><span class="hs-av">'+av(m,64)+'</span>'+
   '<b>'+esc(m.name)+badge(m)+'</b><small>@'+esc(m.username)+'</small>'+
   '<span class="hs-nums"><span><b id="hsScripts">'+C.mine().length+'</b>Scripts</span><span><b id="hsFollowers">-</b>Followers</span><span><b id="hsFollowing">-</b>Following</span></span></a>';
}
function nav(){
  return '<nav class="hs-card hs-nav" aria-label="Shortcuts"><a href="#/scripts">'+I.scripts+'Scripts</a><a href="#/community">'+I.people+'Community</a>'+
   '<a href="#/messages">'+I.msg+'Messages</a><a href="#/files">'+I.files+'My files</a><a href="#/watch">'+I.play+'Watch</a></nav>';
}
function composer(){
  var m=me();
  return '<div class="hs-card composer">'+(m?av(m,42):'<span class="avatar" style="width:42px;height:42px">A</span>')+
   '<a class="composer-in" href="#/publish">'+(m?'Share a script, '+esc(m.name.split(' ')[0])+'...':'Sign in to share a script...')+'</a><a class="btn btn-primary btn-sm" href="#/publish">'+I.plus+'Publish</a></div>';
}
function suggestHTML(){
  var m=me(),f=S()?S().following():{},count={};
  C.vis().forEach(function(s){count[s.owner]=(count[s.owner]||0)+1});
  var us=A.all().filter(function(u){return (!m||u.id!==m.id)&&!f[u.id]&&isCreator(u.id)}).sort(function(a,b){return (count[b.id]||0)-(count[a.id]||0)||b.created-a.created}).slice(0,5);
  if(!us.length)return '<p class="hs-empty">No suggestions right now.</p>';
  return us.map(function(u){
    return '<div class="hs-row"><a class="hs-who" href="#/u/'+esc(u.username)+'">'+av(u,38)+'<span><b>'+esc(u.name)+badge(u)+'</b><small>@'+esc(u.username)+' &middot; '+(count[u.id]||0)+' scripts</small></span></a>'+
      (m&&S()?S().followBtn(u.id):'<a class="fbtn" href="#/auth">Follow</a>')+'</div>';
  }).join('');
}
function onlineHTML(){
  var m=me(),ids=S()?S().onlineIds():[],us=ids.map(function(id){return A.byId(id)}).filter(function(u){return u&&(!m||u.id!==m.id)}).slice(0,8);
  if(!us.length)return '<p class="hs-empty">Nobody else is online right now.</p>';
  return us.map(function(u){return '<a class="hs-on" href="#/u/'+esc(u.username)+'" title="'+esc(u.name)+'">'+av(u,38)+'<small>'+esc(u.username)+'</small></a>'}).join('');
}
function rightCol(){
  return '<div class="hs-card"><h3><span class="live-dot" aria-hidden="true"></span>Live today</h3><ul class="hs-live">'+
   '<li><b data-t="visitors">-</b><span>Visitors</span></li><li><b data-t="views">-</b><span>Views</span></li><li><b data-t="downloads">-</b><span>Downloads</span></li><li><b data-t="total">-</b><span>All time</span></li></ul></div>'+
   '<div class="hs-card"><h3>Who to follow</h3><div id="homeSuggest">'+suggestHTML()+'</div></div>'+
   '<div class="hs-card"><h3>Online now</h3><div class="hs-onl" id="homeOnline">'+onlineHTML()+'</div></div>';
}
function stories(){
  var m=me(),ids=S()?S().onlineIds():[],on={};ids.forEach(function(i){on[i]=1});
  var count={};C.vis().forEach(function(s){count[s.owner]=(count[s.owner]||0)+1});
  var us=A.all().filter(function(u){return !m||u.id!==m.id}).sort(function(a,b){return (on[b.id]?1:0)-(on[a.id]?1:0)||(count[b.id]||0)-(count[a.id]||0)}).slice(0,14);
  var mine='<a class="st" href="'+(m?'#/publish':'#/auth')+'"><span class="st-av me">'+(m?av(m,58):'<span class="avatar" style="width:58px;height:58px">A</span>')+'<i>+</i></span><small>'+(m?'Your script':'Sign in')+'</small></a>';
  return '<div class="stories" aria-label="People">'+mine+us.map(function(u){
    return '<a class="st" href="#/u/'+esc(u.username)+'"><span class="st-av'+(on[u.id]?' live':(count[u.id]?' ring':''))+'">'+av(u,58)+'</span><small>'+esc(u.username)+'</small></a>';
  }).join('')+'</div>';
}
function meChip(){
  var m=me();if(!m)return '<div class="ig-me"><span class="avatar" style="width:44px;height:44px">A</span><div><b>Join Aevy</b><small>Sign in to follow creators</small></div><a href="#/auth">Sign in</a></div>';
  return '<div class="ig-me">'+av(m,44)+'<div><a href="#/profile"><b>'+esc(m.username)+'</b></a><small>'+esc(m.name)+'</small></div></div>';
}
function render(){
  var root=$('#homeRoot');if(!root)return;
  root.classList.toggle('guest',!me());
  root.innerHTML='<main class="hs-mid">'+composer()+
   '<div class="hs-tabs" id="homeTabs" role="tablist"><button type="button" data-tab="latest" role="tab">Latest</button><button type="button" data-tab="trending" role="tab">Trending</button><button type="button" data-tab="following" role="tab">Following</button></div>'+
   '<div class="feed-list" id="homeFeed"></div></main>'+
   '<aside class="hs-right ig-right">'+meChip()+'<div class="hs-card"><h3>Suggested for you</h3><div id="homeSuggest">'+suggestHTML()+'</div></div>'+
   '<p class="ig-foot"><a href="#/about">About</a><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="#/guidelines">Guidelines</a><a href="#/contact">Contact</a><span>&copy; 2026 Aevy</span></p></aside>';
  paintFeed();
  if(me()&&S())S().counts(me().id).then(function(c){var a=$('#hsFollowers'),b=$('#hsFollowing');if(a)a.textContent=c[0];if(b)b.textContent=c[1]});
}
document.addEventListener('click',function(e){
  var t=e.target.closest('#homeTabs [data-tab]');
  if(t){tab=t.dataset.tab;shown=STEP;paintFeed();return}
  if(e.target.closest('#feedMore')){shown+=STEP;paintFeed()}
});
/* keep the side cards fresh without redrawing the feed */
window.addEventListener('aevy:presence',function(){if(C.view()!=='home')return;var o=$('#homeOnline');if(o)o.innerHTML=onlineHTML()});
setInterval(function(){if(C.view()!=='home')return;var o=$('#homeSuggest');if(o&&!o.querySelector('button:disabled'))o.innerHTML=suggestHTML()},60000);
window.addEventListener('aevy:following',function(){if(C.view()!=='home')return;var o=$('#homeSuggest');if(o)o.innerHTML=suggestHTML();if(tab==='following')paintFeed()});
window.AevyHome={render:render,suggest:suggestHTML,online:onlineHTML};
})();
