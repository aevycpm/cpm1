/* Aevy Community: a social feed. Text posts (optionally with one of your scripts attached), likes, comments,
   @mentions, new scripts mixed in, tabs All / Following / Discussions / Scripts. Live through Supabase Realtime.
   Tables and policies: supabase/schema.sql (section "Community posts"). */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,SB=window.AevySB&&window.AevySB.client;
if(!C||!A||!SB)return;
var esc=C.esc,$=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var posts=[],liked={},cmts={},openC={},tab='all',shown=15,loaded=false,problem='';
function me(){return A.current()}
function S(){return window.AevySocial}
function av(u,n){return window.AevyEco?AevyEco.avatar(u,n):''}
function badge(u){return window.AevyBadge?AevyBadge.html(u):''}
function isAdmin(){return A.isAdmin&&A.isAdmin()}
function ago(t){
  var d=Math.max(0,(Date.now()-t)/1000);
  if(d<45)return 'Just now';if(d<3600)return Math.round(d/60)+' min';if(d<86400)return Math.round(d/3600)+' h';if(d<86400*7)return Math.round(d/86400)+' d';
  return C.fmtDate(t);
}
function prow(r){return {id:r.id,owner:r.owner,body:r.body,sid:r.script_id,likes:r.likes||0,comments:r.comments||0,t:Date.parse(r.created)||Date.now()}}
function crow(r){return {id:r.id,pid:r.post_id,owner:r.owner,body:r.body,t:Date.parse(r.created)||Date.now()}}
function byId(id){for(var i=0;i<posts.length;i++)if(posts[i].id===id)return posts[i]}
/* text -> safe html with clickable @mentions */
function rich(t){
  return esc(t).replace(/@([a-z0-9_]{3,20})\b/gi,function(m,n){return A.byName(n)?'<a class="mention" href="#/u/'+n.toLowerCase()+'">@'+n+'</a>':m});
}
function nameOf(u){return u?'<a class="post-name" href="#/u/'+esc(u.username)+'">'+esc(u.name)+'</a>'+badge(u):'<span class="post-name">Member</span>'}
var HEART='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.7 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.4 3.1 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>';
var BUBBLE='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20.5l1.4-5.4A8.5 8.5 0 1 1 21 11.5z"/></svg>';

/* ---------- page ---------- */
var sec=document.createElement('section');sec.className='view';sec.id='view-community';sec.dataset.view='community';
sec.innerHTML='<div class="wrap com-social"><main class="cs-main"><div id="csComposer"></div>'+
 '<div class="hs-tabs" id="csTabs" role="tablist"><button type="button" data-tab="all" role="tab">All</button><button type="button" data-tab="following" role="tab">Following</button><button type="button" data-tab="posts" role="tab">Discussions</button><button type="button" data-tab="scripts" role="tab">Scripts</button></div>'+
 '<div class="feed-list" id="csFeed"><div class="empty">Loading...</div></div></main>'+
 '<aside class="cs-side"><div class="hs-card"><h3>Who to follow</h3><div id="csSuggest"></div></div><div class="hs-card"><h3>Online now</h3><div class="hs-onl" id="csOnline"></div></div>'+
 '<div class="hs-card"><h3>Most downloaded</h3><ol class="top" id="csTop"></ol></div></aside></div>';
$('main').appendChild(sec);

function composer(){
  var m=me(),box=$('#csComposer');if(!box)return;
  if(!m){box.innerHTML='<div class="hs-card cs-signin"><h3>Join the conversation</h3><p>Sign in to post, like and comment.</p><a class="btn btn-primary" href="#/auth">Sign in or create account</a></div>';return}
  var mine=C.mine().filter(function(s){return s.vis==='public'});
  box.innerHTML='<div class="hs-card cs-comp"><div class="cs-comp-row">'+av(m,42)+'<textarea class="field" id="csText" rows="2" maxlength="1000" placeholder="What is on your mind, '+esc(m.name.split(' ')[0])+'? Share an update, a question or a tip. Use @username to mention someone."></textarea></div>'+
   '<div class="cs-comp-foot">'+(mine.length?'<select class="field" id="csAttach" aria-label="Attach a script"><option value="">Attach one of your scripts (optional)</option>'+mine.map(function(s){return '<option value="'+esc(s.id)+'">'+esc(s.title)+'</option>'}).join('')+'</select>':'<span class="cs-hint"></span>')+
   '<span class="cs-count" id="csCount">0/1000</span><button class="btn btn-primary" id="csPost" type="button">Post</button></div><p class="m-err" id="csErr"></p></div>';
  var t=$('#csText');
  t.oninput=function(){$('#csCount').textContent=this.value.length+'/1000';this.style.height='auto';this.style.height=Math.min(220,this.scrollHeight)+'px'};
  $('#csPost').onclick=sendPost;
}
function sendPost(){
  var t=$('#csText'),b=$('#csPost'),e=$('#csErr'),body=t.value.trim(),a=$('#csAttach');
  if(!body){e.textContent='Write something first';return}
  e.textContent='';b.disabled=true;
  var row={owner:me().id,body:body};if(a&&a.value)row.script_id=a.value;
  SB.from('posts').insert(row).select('*').single().then(function(r){
    b.disabled=false;
    if(r.error){e.textContent=/too fast/i.test(r.error.message||'')?'You are posting too fast. Wait a moment':/42P01|PGRST205|row-level/i.test((r.error.message||'')+(r.error.code||''))?'Posting is not set up yet. Run the latest supabase/schema.sql':(r.error.message||'Could not post');return}
    addPost(prow(r.data));composer();paintFeed();
  },function(){b.disabled=false;e.textContent='Cannot reach the server'});
}
function addPost(p){if(byId(p.id))return false;posts.push(p);posts.sort(function(a,b){return b.t-a.t});return true}

/* ---------- feed ---------- */
function items(){
  var f=S()?S().following():{},out=[];
  if(tab!=='scripts')posts.forEach(function(p){out.push({k:'p',t:p.t,p:p,o:p.owner})});
  if(tab!=='posts')C.vis().forEach(function(s){if(s.vis==='public')out.push({k:'s',t:s.created,s:s,o:s.owner})});
  if(tab==='following')out=out.filter(function(i){return f[i.o]});
  return out.sort(function(a,b){return b.t-a.t});
}
function postHTML(p){
  var u=A.byId(p.owner),m=me(),own=m&&m.id===p.owner,s=p.sid?C.byId(p.sid):null,on=!!liked[p.id];
  return '<article class="post" data-pid="'+esc(p.id)+'"><header class="post-head">'+(u?av(u,42):'<span class="avatar" style="width:42px;height:42px">?</span>')+
   '<div class="post-who"><span class="nm-line">'+nameOf(u)+'</span><div class="post-sub"><span>@'+esc(u?u.username:'member')+'</span><span class="dot">&middot;</span><span>'+ago(p.t)+'</span></div></div>'+
   ((own||isAdmin())?'<button class="cdel" type="button" data-pdel="'+esc(p.id)+'">Delete</button>':'')+'</header>'+
   '<div class="post-text">'+rich(p.body)+'</div>'+
   (s?'<a class="attach" href="#" data-open="'+esc(s.id)+'"><span class="fchip"><i style="background:#5b86f5"></i><span>'+esc(s.title)+'</span></span><small>'+esc(s.cat||'Script')+' &middot; '+(s.downloads||0)+' downloads</small></a>':'')+
   '<div class="post-acts"><button class="pact'+(on?' on':'')+'" type="button" data-plike="'+esc(p.id)+'" aria-pressed="'+on+'">'+HEART+'<span><b data-pl>'+p.likes+'</b> Like'+'</span></button>'+
   '<button class="pact" type="button" data-pcm="'+esc(p.id)+'">'+BUBBLE+'<span><b data-pc>'+p.comments+'</b> Comment</span></button></div>'+
   (openC[p.id]?cmtPanel(p):'')+'</article>';
}
function cmtPanel(p){
  var list=cmts[p.id],m=me();
  return '<div class="cpanel"><ul class="cl">'+(list?(list.length?list.map(function(c){return cmtHTML(c,p)}).join(''):'<li class="cempty">No comments yet. Be the first.</li>'):'<li class="cempty">Loading...</li>')+'</ul>'+
   (m?'<div class="cform">'+av(m,34)+'<input class="field" data-cin="'+esc(p.id)+'" maxlength="500" placeholder="Write a comment..." autocomplete="off"><button class="btn btn-sm btn-primary" type="button" data-csend="'+esc(p.id)+'">Send</button></div>':'<p class="cempty"><a href="#/auth"><u>Sign in</u></a> to comment.</p>')+'</div>';
}
function cmtHTML(c,p){
  var u=A.byId(c.owner),m=me(),can=m&&(c.owner===m.id||p.owner===m.id||isAdmin());
  return '<li class="cm" data-cid="'+esc(c.id)+'">'+(u?av(u,34):'')+'<div class="cm-b"><div class="cm-h">'+nameOf(u)+'<time>'+ago(c.t)+'</time>'+(can?'<button class="cdel" type="button" data-cdel="'+esc(c.id)+'" data-p="'+esc(p.id)+'">Delete</button>':'')+'</div><p>'+rich(c.body)+'</p></div></li>';
}
function paintFeed(){
  var box=$('#csFeed');if(!box)return;
  $$('#csTabs [data-tab]').forEach(function(b){var on=b.dataset.tab===tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
  if(problem){box.innerHTML='<div class="empty"><h3>Community is not set up yet</h3><p>'+esc(problem)+'</p></div>';return}
  var list=items(),part=list.slice(0,shown);
  box.innerHTML=part.length?part.map(function(i){return i.k==='p'?postHTML(i.p):C.cardHTML(i.s)}).join('')+(list.length>shown?'<button class="btn feed-more" id="csMore" type="button">Show more</button>':''):
    '<div class="empty"><h3>'+(tab==='following'?(me()?'Nothing from people you follow yet':'Sign in to see people you follow'):'Nothing here yet')+'</h3><p>'+(tab==='following'?'Follow a few members from the suggestions.':'Be the first to post.')+'</p></div>';
}
function paintOne(id){
  var p=byId(id);if(!p)return;
  $$('.post[data-pid="'+id+'"]').forEach(function(el){el.outerHTML=postHTML(p)});
}
function paintCounts(p){
  $$('.post[data-pid="'+p.id+'"]').forEach(function(el){
    var l=$('[data-pl]',el),c=$('[data-pc]',el);if(l)l.textContent=p.likes;if(c)c.textContent=p.comments;
  });
}
function paintSide(){
  var a=$('#csSuggest'),o=$('#csOnline'),t=$('#csTop');
  if(window.AevyHome){if(a)a.innerHTML=AevyHome.suggest();if(o)o.innerHTML=AevyHome.online()}
  if(t){
    var d=C.vis().filter(function(s){return s.downloads>0}).sort(function(a,b){return b.downloads-a.downloads}).slice(0,5);
    t.innerHTML=d.length?d.map(function(s,i){return '<li><span class="rk">'+(i+1)+'</span><a href="#" data-open="'+esc(s.id)+'">'+esc(s.title)+'</a><em>'+s.downloads+' dl</em></li>'}).join(''):'<li class="cempty">Nothing yet</li>';
  }
}

/* ---------- data ---------- */
function load(){
  return SB.from('posts').select('*').order('created',{ascending:false}).limit(80).then(function(r){
    if(r.error){problem=/42P01|PGRST205|does not exist|schema cache/i.test((r.error.message||'')+(r.error.code||''))?'Run the latest supabase/schema.sql in the Supabase SQL editor.':(r.error.message||'Could not load posts');return}
    problem='';posts=r.data.map(prow);loaded=true;
    var ids=posts.map(function(p){return p.id}),miss=posts.some(function(p){return !A.byId(p.owner)});
    return Promise.all([
      miss?A.refreshProfiles():null,
      me()&&ids.length?SB.from('post_likes').select('post_id').eq('owner',me().id).in('post_id',ids).then(function(x){liked={};(x.data||[]).forEach(function(l){liked[l.post_id]=1})}):(liked={},null)
    ]);
  });
}
function loadComments(id){
  return SB.from('post_comments').select('*').eq('post_id',id).order('created',{ascending:true}).limit(100).then(function(r){
    cmts[id]=r.error?[]:r.data.map(crow);
    var miss=cmts[id].some(function(c){return !A.byId(c.owner)});
    return miss?A.refreshProfiles():null;
  });
}

/* ---------- actions ---------- */
function onClick(e){
  var t=e.target;
  var tb=t.closest('#csTabs [data-tab]');if(tb){tab=tb.dataset.tab;shown=15;paintFeed();return}
  if(t.closest('#csMore')){shown+=15;paintFeed();return}
  var lk=t.closest('[data-plike]');if(lk){like(lk.dataset.plike);return}
  var cm=t.closest('[data-pcm]');if(cm){toggleC(cm.dataset.pcm);return}
  var sd=t.closest('[data-csend]');if(sd){sendC(sd.dataset.csend,sd.closest('.post'));return}
  var pd=t.closest('[data-pdel]');if(pd){delPost(pd.dataset.pdel);return}
  var cd=t.closest('[data-cdel]');if(cd){delC(cd.dataset.cdel,cd.dataset.p);return}
  var op=t.closest('[data-open]');if(op&&op.matches('a'))e.preventDefault();
}
function onKey(e){
  if(e.key==='Enter'&&e.target.dataset&&e.target.dataset.cin){e.preventDefault();sendC(e.target.dataset.cin,e.target.closest('.post'))}
}
sec.addEventListener('click',onClick);sec.addEventListener('keydown',onKey);
/* the profile page shows one member's posts with the same behaviour */
function mountPosts(box,uid){
  if(!box)return;
  if(!box.dataset.bound){box.dataset.bound='1';box.addEventListener('click',onClick);box.addEventListener('keydown',onKey)}
  SB.from('posts').select('*').eq('owner',uid).order('created',{ascending:false}).limit(30).then(function(r){
    if(r.error){box.innerHTML='<div class="empty"><h3>Posts are not available yet</h3><p>Run the latest supabase/schema.sql.</p></div>';return}
    r.data.forEach(function(x){var n=prow(x),old=byId(n.id);if(old){old.likes=n.likes;old.comments=n.comments}else posts.push(n)});
    posts.sort(function(a,b){return b.t-a.t});
    var mine=posts.filter(function(p){return p.owner===uid}),ids=mine.map(function(p){return p.id});
    var done=function(){box.innerHTML=mine.length?mine.map(postHTML).join(''):'<div class="empty"><h3>No posts yet</h3><p>Posts from the Community page show up here.</p></div>'};
    if(me()&&ids.length)SB.from('post_likes').select('post_id').eq('owner',me().id).in('post_id',ids).then(function(x){(x.data||[]).forEach(function(l){liked[l.post_id]=1});done()},done);else done();
  },function(){box.innerHTML='<div class="empty">Cannot reach the server</div>'});
}
function need(){if(me())return true;location.hash='#/auth';return false}
function like(id){
  if(!need())return;var p=byId(id);if(!p)return;
  var was=!!liked[id];
  liked[id]=was?0:1;p.likes=Math.max(0,p.likes+(was?-1:1));if(!liked[id])delete liked[id];
  $$('.post[data-pid="'+id+'"] [data-plike]').forEach(function(el){el.classList.toggle('on',!was);el.setAttribute('aria-pressed',!was)});paintCounts(p);
  var q=was?SB.from('post_likes').delete().eq('post_id',id).eq('owner',me().id):SB.from('post_likes').insert({post_id:id,owner:me().id});
  q.then(function(r){if(r.error){if(was)liked[id]=1;else delete liked[id];p.likes=Math.max(0,p.likes+(was?1:-1));paintOne(id);C.toast('Could not update like')}},function(){});
}
function toggleC(id){
  openC[id]=!openC[id];paintOne(id);
  if(openC[id]&&!cmts[id])loadComments(id).then(function(){if(openC[id])paintOne(id)});
}
function sendC(id,root){
  if(!need())return;
  var inp=$('[data-cin]',root||document),body=inp&&inp.value.trim();if(!body)return;
  inp.disabled=true;
  SB.from('post_comments').insert({post_id:id,owner:me().id,body:body}).select('*').single().then(function(r){
    if(r.error){inp.disabled=false;C.toast(/too fast/i.test(r.error.message||'')?'You are commenting too fast':(r.error.message||'Could not comment'));return}
    var c=crow(r.data);cmts[id]=cmts[id]||[];if(!cmts[id].some(function(x){return x.id===c.id}))cmts[id].push(c);
    var p=byId(id);if(p)p.comments=cmts[id].length>p.comments?cmts[id].length:p.comments;
    paintOne(id);
  },function(){inp.disabled=false;C.toast('Cannot reach the server')});
}
function delPost(id){
  if(!confirm('Delete this post?'))return;
  SB.from('posts').delete().eq('id',id).select('id').then(function(r){
    if(r.error||!r.data||!r.data.length){C.toast('Could not delete');return}
    posts=posts.filter(function(p){return p.id!==id});$$('.post[data-pid="'+id+'"]').forEach(function(el){el.remove()});paintFeed();
  });
}
function delC(cid,pid){
  if(!confirm('Delete this comment?'))return;
  SB.from('post_comments').delete().eq('id',cid).select('id').then(function(r){
    if(r.error||!r.data||!r.data.length){C.toast('Could not delete');return}
    cmts[pid]=(cmts[pid]||[]).filter(function(c){return c.id!==cid});
    var p=byId(pid);if(p)p.comments=Math.max(0,p.comments-1);paintOne(pid);
  });
}

/* ---------- live ---------- */
var chan=null;
function live(){
  if(chan)return;
  chan=SB.channel('aevy-community')
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'posts'},function(p){
     var n=prow(p.new);if(!addPost(n))return;
     var go=function(){if(sec.classList.contains('active'))paintFeed()};
     if(!A.byId(n.owner))A.refreshProfiles().then(go);else go();
   })
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'posts'},function(p){
     var x=byId(p.new.id);if(!x)return;x.likes=p.new.likes||0;x.comments=p.new.comments||0;paintCounts(x);
   })
   .on('postgres_changes',{event:'DELETE',schema:'public',table:'posts'},function(p){
     var id=p.old&&p.old.id;if(!id)return;posts=posts.filter(function(x){return x.id!==id});if(sec.classList.contains('active'))paintFeed();
   })
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'post_comments'},function(p){
     var c=crow(p.new);if(!cmts[c.pid]||cmts[c.pid].some(function(x){return x.id===c.id}))return;
     cmts[c.pid].push(c);if(openC[c.pid]){var go=function(){paintOne(c.pid)};A.byId(c.owner)?go():A.refreshProfiles().then(go)}
   })
   .on('postgres_changes',{event:'DELETE',schema:'public',table:'post_comments'},function(p){
     var id=p.old&&p.old.id;if(!id)return;
     Object.keys(cmts).forEach(function(k){if(cmts[k].some(function(c){return c.id===id})){cmts[k]=cmts[k].filter(function(c){return c.id!==id});if(openC[k])paintOne(k)}});
   })
   .subscribe();
}

/* ---------- route ---------- */
function render(h){
  if(h!=='community')return;
  composer();paintFeed();paintSide();
  (loaded?Promise.resolve():load()).then(function(){var t=$('#csText');if(!t||!t.value)composer();paintFeed();paintSide()},function(){});
  live();
}
window.AevyCommunity={render:render,mountPosts:mountPosts};
window.addEventListener('aevy:auth',function(){loaded=false;liked={};cmts={};openC={}});
window.addEventListener('aevy:following',function(){if(sec.classList.contains('active')){paintSide();if(tab==='following')paintFeed()}});
window.addEventListener('aevy:presence',function(){if(sec.classList.contains('active')){var o=$('#csOnline');if(o&&window.AevyHome)o.innerHTML=AevyHome.online()}});
setInterval(function(){if(sec.classList.contains('active')&&!document.hidden&&!document.activeElement.matches('input,textarea'))paintFeed()},60000);
})();
