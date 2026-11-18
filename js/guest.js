/* Aevy guests: guests can only message other guests. This file blocks the other actions in the UI
   (the database enforces the same rules: supabase/schema.sql, "Guest accounts") and adds the
   "Continue as guest" button to the sign-in page. */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth;if(!C||!A)return;
var SEL='[data-act="like"],[data-act="cmt"],[data-follow],[data-plike],[data-pcm],[data-csend],[data-cin],a[href="#/publish"],a[href="#/ai"]';
function isG(){var m=A.current();return !!(m&&m.guest)}
window.addEventListener('click',function(e){
  if(!isG()||!e.target.closest(SEL))return;
  e.preventDefault();e.stopImmediatePropagation();
  C.toast('Guests can only send messages. Create a free account to like, comment, follow or post.');
},true);
function bar(){
  var old=document.getElementById('gsBar');
  if(!isG()){if(old)old.remove();return}
  if(old)return;
  var m=A.current(),h=document.querySelector('.site-header'),d=document.createElement('div');
  d.id='gsBar';d.className='gs-bar';
  d.innerHTML='<span>You are a guest <b>@'+C.esc(m.username)+'</b>. Guests can only message other guests.</span><button type="button" id="gsUp">Create account</button>';
  h.parentNode.insertBefore(d,h.nextSibling);
  d.querySelector('#gsUp').onclick=function(){
    if(!confirm('Leave this guest account and create a real one? Your guest chats will be lost.'))return;
    A.signOut().then(function(){window.dispatchEvent(new Event('aevy:auth'));location.hash='#/auth'});
  };
}
function authBtn(){
  var box=document.getElementById('stMain');
  if(!box||document.getElementById('guestGo'))return;
  var w=document.createElement('div');w.className='gs-wrap';
  w.innerHTML='<div class="gs-or"><span>or</span></div><button type="button" class="btn btn-lg gs-btn" id="guestGo">Continue as guest</button><p class="gs-note">A guest account is created for you with a random name and profile picture. Guests can only message other guests.</p>';
  box.appendChild(w);
  w.querySelector('#guestGo').onclick=function(){
    var b=this;b.disabled=true;b.textContent='Creating your guest profile...';
    A.guest().then(function(){location.hash='#/';window.dispatchEvent(new Event('aevy:auth'))},function(x){b.disabled=false;b.textContent='Continue as guest';C.toast(x.message||String(x))});
  };
}
function tick(){bar();authBtn()}
window.addEventListener('aevy:auth',function(){setTimeout(tick,50)});
window.addEventListener('hashchange',function(){setTimeout(tick,50)});
document.addEventListener('DOMContentLoaded',function(){setTimeout(tick,400)});
setTimeout(tick,1200);
})();
