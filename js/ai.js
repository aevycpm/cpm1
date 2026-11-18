/* Aevy AI chat. Talks to the Supabase Edge Function "ai-chat" (the Gemini key stays on the server). */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,SB=window.AevySB&&window.AevySB.client;
if(!C||!A||!SB)return;
var esc=C.esc,$=function(s,r){return (r||document).querySelector(s)};
var MODES=[['assistant','Assistant'],['code','Code helper'],['writer','Writer'],['tutor','Tutor'],['translate','Translator']];
var IDEAS=['Explain a script I paste, line by line','Write a Lua function that ...','Help me write a great post title and description','Summarize this text in 5 bullets'];
var chats=[],cur=null,busy=false,img=null,search=false,side=false;
function me(){return A.current()}
function key(){return 'aevy.ai.v1.'+(me()?me().id:'x')}
function load(){try{chats=JSON.parse(localStorage.getItem(key())||'[]')}catch(e){chats=[]}}
function save(){try{localStorage.setItem(key(),JSON.stringify(chats.slice(0,40)))}catch(e){}}
function find(id){for(var i=0;i<chats.length;i++)if(chats[i].id===id)return chats[i]}
function fresh(){var c={id:'c'+Date.now(),title:'New chat',mode:'assistant',msgs:[]};chats.unshift(c);cur=c.id;save();return c}

/* tiny safe Markdown: code blocks, inline code, bold, italic, links, lists, headings */
function md(t){
  var blocks=[];
  t=String(t).replace(/```(\w*)\n?([\s\S]*?)```/g,function(_,l,c){blocks.push('<div class="ai-code"><div class="ai-ch"><span>'+esc(l||'code')+'</span><button type="button" data-copy>Copy</button></div><pre><code>'+esc(c.replace(/\n$/,''))+'</code></pre></div>');return '\u0000'+(blocks.length-1)+'\u0000'});
  t=esc(t).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/(^|[\s(])\*([^*\n]+)\*/g,'$1<i>$2</i>')
   .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
   .replace(/^#{1,3} (.+)$/gm,'<h4>$1</h4>');
  t=t.replace(/(?:^|\n)((?:[-*] .+(?:\n|$))+)/g,function(_,l){return '<ul>'+l.trim().split('\n').map(function(x){return '<li>'+x.replace(/^[-*] /,'')+'</li>'}).join('')+'</ul>'})
   .replace(/(?:^|\n)((?:\d+\. .+(?:\n|$))+)/g,function(_,l){return '<ol>'+l.trim().split('\n').map(function(x){return '<li>'+x.replace(/^\d+\. /,'')+'</li>'}).join('')+'</ol>'});
  t=t.replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>');
  return ('<p>'+t+'</p>').replace(/\u0000(\d+)\u0000/g,function(_,i){return '</p>'+blocks[i]+'<p>'}).replace(/<p><\/p>/g,'');
}
function msgHTML(m){
  if(m.r==='user')return '<div class="ai-m me"><div class="ai-b">'+(m.img?'<small class="ai-img">[image attached]</small>':'')+esc(m.t).replace(/\n/g,'<br>')+'</div></div>';
  var src=(m.src||[]).map(function(s){return '<a href="'+esc(s.u)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(s.t||s.u)+'</a>'}).join('');
  return '<div class="ai-m bot"><span class="ai-av">AI</span><div class="ai-b">'+md(m.t)+(src?'<div class="ai-src">Sources: '+src+'</div>':'')+'<div class="ai-tools"><button type="button" data-copy-all>Copy</button><button type="button" data-redo>Regenerate</button></div></div></div>';
}
function shell(){
  var c=find(cur)||fresh();
  return '<div class="ai-app'+(side?' side':'')+'"><aside class="ai-side"><button class="btn btn-primary" id="aiNew" type="button">+ New chat</button><ul id="aiList">'+
   chats.map(function(x){return '<li class="'+(x.id===cur?'on':'')+'"><button type="button" data-open="'+x.id+'">'+esc(x.title)+'</button><button type="button" class="ai-x" data-del="'+x.id+'" aria-label="Delete chat">&times;</button></li>'}).join('')+'</ul></aside>'+
   '<section class="ai-main"><header class="ai-top"><button type="button" class="icon-btn ai-menu" id="aiMenu" aria-label="Chats">&#9776;</button><b>Aevy AI</b>'+
   '<select id="aiMode" class="field sel" aria-label="Mode">'+MODES.map(function(m){return '<option value="'+m[0]+'"'+(c.mode===m[0]?' selected':'')+'>'+m[1]+'</option>'}).join('')+'</select>'+
   '<label class="ai-web"><input type="checkbox" id="aiWeb"'+(search?' checked':'')+'> Web search</label></header>'+
   '<div class="ai-log" id="aiLog">'+(c.msgs.length?c.msgs.map(msgHTML).join(''):'<div class="ai-empty"><div class="ai-logo">AI</div><h2>How can I help?</h2><p>Ask anything: code, writing, study, ideas, images.</p><div class="ai-ideas">'+IDEAS.map(function(i){return '<button type="button" data-idea="'+esc(i)+'">'+esc(i)+'</button>'}).join('')+'</div></div>')+'</div>'+
   '<div class="ai-comp"><div id="aiPrev"></div><div class="ai-box"><label class="ai-att" title="Attach image"><input type="file" id="aiFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>&#128247;</label><textarea id="aiIn" rows="1" maxlength="8000" placeholder="Message Aevy AI"></textarea><button type="button" class="ai-send" id="aiSend" aria-label="Send">&#10148;</button></div><small>AI can make mistakes. Check important information.</small></div></section></div>';
}
function render(){
  var root=$('#aiRoot');if(!root)return;
  if(!me()){root.innerHTML='<div class="empty"><h3>Sign in to use Aevy AI</h3><p>Chat with an AI assistant for code, writing and more.</p><a class="btn btn-primary" href="#/auth">Sign in</a></div>';return}
  load();if(!find(cur))cur=chats[0]?chats[0].id:null;
  root.innerHTML=shell();wire();scroll();
}
function scroll(){var l=$('#aiLog');if(l)l.scrollTop=l.scrollHeight}
function typing(on){var l=$('#aiLog');if(!l)return;var o=$('#aiTyp');if(o)o.remove();if(on){l.insertAdjacentHTML('beforeend','<div class="ai-m bot" id="aiTyp"><span class="ai-av">AI</span><div class="ai-b"><span class="ai-dots"><i></i><i></i><i></i></span></div></div>');scroll()}}
function send(text,redo){
  var c=find(cur);if(!c||busy)return;
  text=String(text||'').trim();
  if(!redo){if(!text&&!img)return;c.msgs.push({r:'user',t:text||'Describe this image.',img:!!img});if(c.title==='New chat')c.title=(text||'Image').slice(0,36)}
  var payload=c.msgs.map(function(m,i){var o={role:m.r==='user'?'user':'model',text:m.t};if(img&&!redo&&i===c.msgs.length-1&&m.r==='user')o.image=img;return o});
  img=null;busy=true;save();render();typing(true);
  SB.functions.invoke('ai-chat',{body:{messages:payload,mode:c.mode,search:search}}).then(function(r){
    var d=r.data,e=r.error;
    if(e||!d||d.error){throw new Error((d&&d.error)||(e&&e.message)||'AI is not reachable. Check that the ai-chat function is deployed.')}
    c.msgs.push({r:'bot',t:d.text,src:d.sources||[]});
  }).catch(function(x){c.msgs.push({r:'bot',t:'Sorry, something went wrong: '+(x.message||x)})}).then(function(){busy=false;save();render()});
}
function wire(){
  var inp=$('#aiIn');
  function grow(){inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,160)+'px'}
  inp.oninput=grow;
  inp.onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();var v=inp.value;inp.value='';send(v)}};
  $('#aiSend').onclick=function(){var v=inp.value;inp.value='';send(v)};
  $('#aiNew').onclick=function(){var c=find(cur);if(!c||c.msgs.length)fresh();side=false;render()};
  $('#aiMenu').onclick=function(){side=!side;$('.ai-app').classList.toggle('side',side)};
  $('#aiMode').onchange=function(){find(cur).mode=this.value;save()};
  $('#aiWeb').onchange=function(){search=this.checked};
  $('#aiFile').onchange=function(){var f=this.files[0];if(!f)return;if(f.size>4e6){C.toast('Image must be under 4 MB');return}
    var rd=new FileReader();rd.onload=function(){img={mime:f.type,data:String(rd.result).split(',')[1]};$('#aiPrev').innerHTML='<span class="ai-chip">'+esc(f.name)+' <button type="button" id="aiRm">&times;</button></span>';$('#aiRm').onclick=function(){img=null;$('#aiPrev').innerHTML=''}};rd.readAsDataURL(f)};
  $('#aiList').onclick=function(e){var o=e.target.closest('[data-open]'),d=e.target.closest('[data-del]');
    if(o){cur=o.dataset.open;side=false;render()}
    if(d){chats=chats.filter(function(x){return x.id!==d.dataset.del});if(cur===d.dataset.del)cur=chats[0]?chats[0].id:null;save();render()}};
  $('#aiLog').onclick=function(e){
    var i=e.target.closest('[data-idea]');if(i){inp.value=i.dataset.idea;inp.focus();return}
    var cp=e.target.closest('[data-copy]');if(cp){var code=cp.closest('.ai-code').querySelector('code').textContent;navigator.clipboard&&navigator.clipboard.writeText(code).then(function(){cp.textContent='Copied';setTimeout(function(){cp.textContent='Copy'},1200)});return}
    var ca=e.target.closest('[data-copy-all]');if(ca){var m=ca.closest('.ai-b').cloneNode(true);var t=m.querySelector('.ai-tools');if(t)t.remove();navigator.clipboard&&navigator.clipboard.writeText(m.innerText).then(function(){C.toast('Copied')});return}
    if(e.target.closest('[data-redo]')){var c=find(cur);if(c&&c.msgs.length&&c.msgs[c.msgs.length-1].r==='bot'){c.msgs.pop();send('',true)}}};
}
function check(){if((location.hash||'').indexOf('#/ai')===0)setTimeout(render,0)}
window.addEventListener('hashchange',check);window.addEventListener('aevy:auth',check);setTimeout(check,300);
window.AevyAI={render:render};
})();
