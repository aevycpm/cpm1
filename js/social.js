/* Aevy social layer: follow / following, direct messages, online status.
   Tables, policies and functions: supabase/schema.sql (section "Social"). */
(function(){
'use strict';
var A=window.AevyAuth,C=window.AevyCore,SB=window.AevySB&&window.AevySB.client;
if(!A||!C||!SB)return;
var esc=C.esc,$=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
function me(){return A.current()}
function badge(u){return window.AevyBadge?AevyBadge.html(u):''}
function av(u,n){return window.AevyEco?AevyEco.avatar(u,n):''}
function fail(e){C.toast((e&&e.message)||'Something went wrong');console.error(e)}
var HIDE_KEY='aevy.hideStatus';
function hidden(){try{return localStorage.getItem(HIDE_KEY)==='1'}catch(e){return false}}

/* ================= online / offline ================= */
var seen={};   /* user id -> last seen (ms); missing = hidden or never seen */
function isOnline(id){return !!seen[id]&&Date.now()-seen[id]<150000}
function ago(t){
  var d=Math.max(0,(Date.now()-t)/1000);
  if(d<150)return 'Online';
  if(d<3600)return 'Last seen '+Math.round(d/60)+' min ago';
  if(d<86400)return 'Last seen '+Math.round(d/3600)+' h ago';
  if(d<86400*7)return 'Last seen '+Math.round(d/86400)+' d ago';
  return 'Last seen '+C.fmtDate(t);
}
function presRows(rows){(rows||[]).forEach(function(r){if(r.last_seen)seen[r.user_id]=Date.parse(r.last_seen);else delete seen[r.user_id]})}
function beat(){
  if(!me()||document.hidden)return Promise.resolve();
  return SB.rpc('touch_presence',{hide:hidden()}).then(function(r){if(!r.error&&!hidden())seen[me().id]=Date.now()},function(){});
}
function pollOnline(ids){
  var args=ids&&ids.length?{ids:ids}:{};
  return SB.rpc('get_presence',args).then(function(r){if(!r.error){presRows(r.data);paint();window.dispatchEvent(new Event('aevy:presence'))}},function(){});
}
function paint(){
  $$('.avatar[data-uid]').forEach(function(a){a.classList.toggle('on',isOnline(a.dataset.uid))});
  $$('.pres[data-uid]').forEach(function(p){
    var t=seen[p.dataset.uid];p.textContent=t?ago(t):'';p.classList.toggle('on',isOnline(p.dataset.uid));
  });
}
setInterval(function(){beat().then(function(){return pollOnline()})},45000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)beat().then(function(){return pollOnline()})});

/* ================= follows ================= */
var following={};   /* ids I follow */
function loadFollowing(){
  following={};
  if(!me())return Promise.resolve();
  return SB.from('follows').select('following').eq('follower',me().id).limit(5000).then(function(r){
    if(!r.error)(r.data||[]).forEach(function(x){following[x.following]=1});
  },function(){});
}
function counts(id){
  var q=function(col){return SB.from('follows').select('*',{count:'exact',head:true}).eq(col,id).then(function(r){return r.count||0},function(){return 0})};
  return Promise.all([q('following'),q('follower')]);
}
function followBtn(id){
  var on=!!following[id];
  return '<button type="button" class="btn btn-sm'+(on?'':' btn-primary')+'" data-follow="'+esc(id)+'" aria-pressed="'+on+'">'+(on?'Following':'Follow')+'</button>';
}
function toggleFollow(id,btn){
  if(!me()){location.hash='#/auth';return}
  btn.disabled=true;
  var was=!!following[id],q=was?SB.from('follows').delete().eq('follower',me().id).eq('following',id):SB.from('follows').insert({follower:me().id,following:id});
  q.then(function(r){
    btn.disabled=false;
    if(r.error){fail(r.error);return}
    if(was)delete following[id];else following[id]=1;
    btn.outerHTML=followBtn(id);window.dispatchEvent(new Event('aevy:following'));
    var box=$('.pf-main[data-uid="'+id+'"]');if(box)refreshCounts(box);
  },function(e){btn.disabled=false;fail(e)});
}
function refreshCounts(box){
  var id=box.dataset.uid;
  counts(id).then(function(c){
    var f=$('[data-cnt="followers"] b',box),g=$('[data-cnt="following"] b',box);
    if(f)f.textContent=c[0].toLocaleString();if(g)g.textContent=c[1].toLocaleString();
  });
}
function listPeople(box,kind){
  var id=box.dataset.uid,panel=$('.pf-people',box);
  if(panel&&panel.dataset.kind===kind){panel.remove();return}
  if(panel)panel.remove();
  panel=document.createElement('div');panel.className='pf-people';panel.dataset.kind=kind;panel.textContent='Loading...';
  $('.pf-stats',box).insertAdjacentElement('afterend',panel);
  var col=kind==='followers'?'follower':'following',other=kind==='followers'?'following':'follower';
  SB.from('follows').select(col).eq(other,id).order('created',{ascending:false}).limit(200).then(function(r){
    if(r.error){panel.textContent='Could not load the list';return}
    var us=(r.data||[]).map(function(x){return A.byId(x[col])}).filter(Boolean);
    panel.innerHTML=us.length?us.map(function(u){return '<a class="pchip" href="#/u/'+esc(u.username)+'">'+av(u,28)+'<span>'+esc(u.name)+'</span>'+badge(u)+'<small>@'+esc(u.username)+'</small></a>'}).join(''):'<p class="muted-p">'+(kind==='followers'?'No followers yet.':'Not following anyone yet.')+'</p>';
    paint();
  },function(){panel.textContent='Could not load the list'});
}
/* adds Follow / Message buttons, counts and the online line to every profile header (see pfHeader in eco.js) */
function injectProfile(box){
  if(box.dataset.soc)return;box.dataset.soc='1';
  var id=box.dataset.uid,own=me()&&me().id===id,u=A.byId(id);
  var un=$('.pf-un',box);
  if(un)un.insertAdjacentHTML('afterend','<p class="pres" data-uid="'+esc(id)+'"></p>');
  var acts=$('.pf-acts',box);
  if(acts&&!own&&u)acts.insertAdjacentHTML('afterbegin',followBtn(id)+'<a class="btn btn-sm" href="#/messages/'+esc(u.username)+'">Message</a>');
  var st=$('.pf-stats',box);
  if(st)st.insertAdjacentHTML('beforeend','<li data-cnt="followers"><button type="button" class="linkish" data-list="followers"><b>-</b> <span>Followers</span></button></li><li data-cnt="following"><button type="button" class="linkish" data-list="following"><b>-</b> <span>Following</span></button></li>');
  refreshCounts(box);
  var av0=$('.pf-av .avatar',box);
  pollOnline([id]);
}
document.addEventListener('click',function(e){
  var f=e.target.closest('[data-follow]');if(f){e.preventDefault();toggleFollow(f.dataset.follow,f);return}
  var l=e.target.closest('[data-list]');if(l){var box=l.closest('.pf-main');if(box)listPeople(box,l.dataset.list)}
});

/* ================= messages ================= */
var msgs=[],loaded=false,partner=null,chan=null;
function mrow(r){return {id:r.id,s:r.sender,r:r.recipient,body:r.body,t:Date.parse(r.created)||Date.now(),read:!!r.read_at}}
function addMsg(m){for(var i=0;i<msgs.length;i++)if(msgs[i].id===m.id)return false;msgs.push(m);return true}
function loadMsgs(){
  if(!me())return Promise.resolve();
  var id=me().id;
  return SB.from('messages').select('*').or('sender.eq.'+id+',recipient.eq.'+id).order('created',{ascending:false}).limit(500).then(function(r){
    if(r.error)throw r.error;msgs=(r.data||[]).map(mrow);loaded=true;badgeCount();
  });
}
function loadPair(other){
  var a=me().id;
  return SB.from('messages').select('*').or('and(sender.eq.'+a+',recipient.eq.'+other+'),and(sender.eq.'+other+',recipient.eq.'+a+')').order('created',{ascending:false}).limit(200).then(function(r){
    if(!r.error)(r.data||[]).forEach(function(x){addMsg(mrow(x))});
  });
}
function unreadFrom(id){return msgs.filter(function(m){return m.s===id&&m.r===me().id&&!m.read}).length}
function badgeCount(){
  var b=$('#unreadBadge');if(!b)return;
  var n=me()?msgs.filter(function(m){return m.r===me().id&&!m.read}).length:0;
  b.textContent=n>99?'99+':n;b.hidden=!n;
}
function convos(){
  var id=me().id,map={};
  msgs.forEach(function(m){var o=m.s===id?m.r:m.s;if(!map[o]||m.t>map[o].t)map[o]=m});
  return Object.keys(map).map(function(o){return {id:o,last:map[o]}}).sort(function(a,b){return b.last.t-a.last.t});
}
function clock(t){
  var d=new Date(t),n=new Date();
  try{return d.toDateString()===n.toDateString()?new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(d):new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short'}).format(d)}catch(e){return ''}
}

var sec=document.createElement('section');sec.className='view';sec.id='view-messages';sec.dataset.view='messages';
sec.innerHTML='<div class="page-head"><div class="wrap"><p class="eyebrow">Community</p><h1>Messages</h1><p>Private messages between Aevy members. Only you and the other person can read them.</p></div></div>'+
 '<div class="wrap"><div class="msgs" id="msgs"><aside class="m-side"><div class="m-search"><input class="field" id="mFind" placeholder="Find people by name or @username" autocomplete="off"></div><ul class="m-list" id="mList"></ul>'+
 '<label class="m-opt"><input type="checkbox" id="mStatus"> Show my online status</label></aside>'+
 '<section class="m-main" id="mMain"></section></div></div>';
$('main').appendChild(sec);
$('#mStatus').onchange=function(){try{localStorage.setItem(HIDE_KEY,this.checked?'0':'1')}catch(e){}beat()};

function paintList(){
  var q=$('#mFind').value.trim().toLowerCase().replace(/^@/,''),ul=$('#mList'),html='';
  if(q){
    var us=A.all().filter(function(u){return u.id!==me().id&&(u.username.indexOf(q)>-1||(u.name||'').toLowerCase().indexOf(q)>-1)}).slice(0,10);
    html=us.map(function(u){return '<li><a class="m-item" href="#/messages/'+esc(u.username)+'">'+av(u,38)+'<div><b>'+esc(u.name)+badge(u)+'</b><small>@'+esc(u.username)+'</small></div></a></li>'}).join('')||'<li class="m-empty">Nobody found.</li>';
  }else{
    var cs=convos();
    html=cs.map(function(c){
      var u=A.byId(c.id);if(!u)return '';var n=unreadFrom(c.id),mine=c.last.s===me().id;
      return '<li><a class="m-item'+(partner&&partner.id===c.id?' on':'')+'" href="#/messages/'+esc(u.username)+'">'+av(u,38)+'<div><b>'+esc(u.name)+badge(u)+'</b><small>'+(mine?'You: ':'')+esc(c.last.body.slice(0,60))+'</small></div><span class="m-meta"><time>'+clock(c.last.t)+'</time>'+(n?'<i class="ubadge">'+n+'</i>':'')+'</span></a></li>';
    }).join('')||'<li class="m-empty">No conversations yet. Search for someone above, or open a profile and press Message.</li>';
  }
  ul.innerHTML=html;paint();
}
$('#mFind').oninput=paintList;

function bubble(m){
  var mine=m.s===me().id;
  return '<div class="bub '+(mine?'me':'them')+'" data-mid="'+esc(m.id)+'"><p>'+esc(m.body)+'</p><span><time>'+clock(m.t)+'</time>'+(mine?(m.read?' &middot; Seen':'')+' <button type="button" class="unsend" data-unsend="'+esc(m.id)+'" title="Unsend">Unsend</button>':'')+'</span></div>';
}
function paintThread(stick){
  var box=$('#mThread');if(!box||!partner)return;
  var id=me().id,list=msgs.filter(function(m){return (m.s===id&&m.r===partner.id)||(m.s===partner.id&&m.r===id)}).sort(function(a,b){return a.t-b.t});
  box.innerHTML=list.length?list.map(bubble).join(''):'<p class="m-empty">Say hello to '+esc(partner.name)+'.</p>';
  if(stick!==false)box.scrollTop=box.scrollHeight;
}
function markRead(){
  if(!partner||!unreadFrom(partner.id))return;
  var pid=partner.id;
  msgs.forEach(function(m){if(m.s===pid&&m.r===me().id)m.read=true});badgeCount();paintList();
  SB.rpc('mark_read',{other:pid}).then(function(){},function(){});
}
function openThread(un){
  var u=A.byName(un),main=$('#mMain');
  sec.classList.toggle('thread-open',!!un);
  if(!un){partner=null;main.innerHTML='<div class="m-blank"><h3>Your messages</h3><p>Choose a conversation, or search for someone to start a new one.</p></div>';paintList();return}
  if(!u||u.id===me().id){partner=null;main.innerHTML='<div class="m-blank"><h3>Not found</h3><p>That member does not exist, or it is you.</p><a class="btn" href="#/messages">Back</a></div>';paintList();return}
  partner=u;
  main.innerHTML='<header class="m-head"><a class="m-back btn btn-sm" href="#/messages">Back</a>'+av(u,40)+'<div><a class="m-name" href="#/u/'+esc(u.username)+'">'+esc(u.name)+'</a>'+badge(u)+'<p class="pres" data-uid="'+esc(u.id)+'"></p></div></header>'+
   '<div class="m-thread" id="mThread"></div><div class="m-err" id="mErr"></div>'+
   '<div class="m-compose"><textarea class="field" id="mText" rows="1" maxlength="2000" placeholder="Write a message (Enter to send, Shift+Enter for a new line)"></textarea><button class="btn btn-primary" id="mSend" type="button">Send</button></div>';
  paintThread();paintList();paint();pollOnline([u.id]);
  loadPair(u.id).then(function(){if(partner&&partner.id===u.id){paintThread();markRead()}paintList()});
  markRead();
  var t=$('#mText');
  t.oninput=function(){this.style.height='auto';this.style.height=Math.min(140,this.scrollHeight)+'px'};
  t.onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}};
  $('#mSend').onclick=send;
  if(window.innerWidth>760)t.focus();
}
function send(){
  var t=$('#mText'),b=$('#mSend'),err=$('#mErr'),body=t.value.trim();
  if(!body||!partner)return;
  err.textContent='';b.disabled=true;
  SB.from('messages').insert({sender:me().id,recipient:partner.id,body:body}).select('*').single().then(function(r){
    b.disabled=false;
    if(r.error){err.textContent=/too fast/i.test(r.error.message||'')?'You are sending messages too fast. Wait a moment':/row-level security|42501|42P01|PGRST205/i.test((r.error.message||'')+(r.error.code||''))?'Messaging is not set up yet. Run the latest supabase/schema.sql':(r.error.message||'Could not send');return}
    addMsg(mrow(r.data));t.value='';t.style.height='auto';paintThread();paintList();t.focus();
  },function(){b.disabled=false;err.textContent='Cannot reach the server'});
}
sec.addEventListener('click',function(e){
  var u=e.target.closest('[data-unsend]');if(!u)return;
  var id=u.dataset.unsend;
  SB.from('messages').delete().eq('id',id).then(function(r){
    if(r.error){fail(r.error);return}
    msgs=msgs.filter(function(m){return m.id!==id});paintThread(false);paintList();
  },fail);
});

/* live: new messages and unsends arrive without a refresh */
function listen(){
  if(chan){try{SB.removeChannel(chan)}catch(e){}chan=null}
  if(!me())return;
  chan=SB.channel('aevy-dm-'+me().id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},function(p){
     var m=mrow(p.new);if(m.s!==me().id&&m.r!==me().id)return;
     if(!addMsg(m))return;
     var open=sec.classList.contains('active')&&partner&&partner.id===m.s;
     if(m.r===me().id){
       if(open){paintThread();markRead()}
       else{var u=A.byId(m.s);C.toast('New message'+(u?' from '+u.name:''))}
     }else if(open)paintThread();
     badgeCount();if(sec.classList.contains('active'))paintList();
   })
   .on('postgres_changes',{event:'DELETE',schema:'public',table:'messages'},function(p){
     var id=p.old&&p.old.id;if(!id)return;
     msgs=msgs.filter(function(m){return m.id!==id});badgeCount();
     if(sec.classList.contains('active')){paintThread(false);paintList()}
   })
   .on('postgres_changes',{event:'*',schema:'public',table:'follows'},function(){
     $$('.pf-main[data-uid]').forEach(refreshCounts);
   })
   .subscribe();
}

/* ================= start / route ================= */
function start(){
  badgeCount();
  if(!me()){msgs=[];loaded=false;partner=null;if(chan){try{SB.removeChannel(chan)}catch(e){}chan=null}return Promise.resolve()}
  $('#mStatus').checked=!hidden();
  return Promise.all([loadFollowing(),loadMsgs().catch(function(e){console.warn('Messages: run the latest supabase/schema.sql',e)})]).then(function(){
    listen();beat().then(function(){return pollOnline()});badgeCount();window.dispatchEvent(new Event('aevy:following'));
  });
}
function renderView(h,raw){
  if(h!=='messages'||!me())return;
  var un=decodeURIComponent((raw.split('/')[1]||'')).toLowerCase();
  (loaded?Promise.resolve():loadMsgs().catch(function(){})).then(function(){$('#mFind').value='';openThread(un)});
}
window.AevySocial={render:renderView,visible:function(){return !hidden()},setVisible:function(v){try{localStorage.setItem(HIDE_KEY,v?'0':'1')}catch(e){}beat()},online:isOnline,following:function(){return following},counts:counts,followBtn:followBtn,
  onlineIds:function(){return Object.keys(seen).filter(isOnline)}};
window.addEventListener('aevy:auth',function(){start()});
A.ready.then(function(){return start()});

/* decorate profile headers and avatars as they appear */
var pend;
new MutationObserver(function(){
  clearTimeout(pend);pend=setTimeout(function(){$$('.pf-main[data-uid]').forEach(injectProfile);paint()},120);
}).observe(document.body,{childList:true,subtree:true});
})();
