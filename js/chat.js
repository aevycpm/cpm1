/* Aevy Assistant: floating chat panel.
   Streams from the Supabase Edge Function "aevy-chat" (live Claude answers).
   If the function is not deployed yet, an offline helper answers common Aevy questions so the panel still works. */
(function(){
'use strict';
var cfg=window.AEVY_CONFIG||{};
var URL_=(cfg.url||'')+'/functions/v1/aevy-chat';
var KEY='aevy.chat.v2',MAXH=30;
var hist=[],busy=false,live=null,ctrl=null,stopped=false,raf=0,pending='';

function $(s,r){return (r||document).querySelector(s)}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function load(){try{var a=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(a))hist=a.filter(function(m){return m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string'}).slice(-MAXH)}catch(e){}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(hist.slice(-MAXH)))}catch(e){}}

/* ---------- Icons ---------- */
var I={
  mark:'<svg width="16" height="16" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 25 16 6l9 19"/><path d="M11.2 19.4h9.6"/></svg>',
  chat:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/></svg>',
  copy:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  check:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  redo:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  trash:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  x:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  send:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  stop:'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>'
};

/* ---------- Markdown (safe subset): headings, lists, tables, quotes, code, emphasis, links ---------- */
function inline(s){
  return s.split(/(`[^`\n]+`)/).map(function(p,i){
    if(i%2)return '<code>'+esc(p.slice(1,-1))+'</code>';
    p=esc(p);
    p=p.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    p=p.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,'$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    p=p.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
    p=p.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g,'$1<em>$2</em>');
    return p;
  }).join('');
}
var RE_LI=/^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
var RE_TS=/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
function cells(l){return l.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(function(c){return c.trim()})}
function startsBlock(L,i){
  var l=L[i];
  return /^#{1,6}\s/.test(l)||RE_LI.test(l)||/^\s*>/.test(l)||/^\s*([-*_])\1{2,}\s*$/.test(l)||(i+1<L.length&&l.indexOf('|')>-1&&RE_TS.test(L[i+1]));
}
function listHTML(items,i0){
  var base=items[i0].ind,ord=items[i0].ord,html='',i=i0;
  while(i<items.length&&items[i].ind>=base){
    if(items[i].ind>base){var r=listHTML(items,i);html=html.replace(/<\/li>$/,r[0]+'</li>');i=r[1];continue}
    if(items[i].ord!==ord)break;
    html+='<li>'+inline(items[i].text)+'</li>';i++;
  }
  var tag=ord?'ol':'ul',st=ord&&items[i0].num>1?' start="'+items[i0].num+'"':'';
  return ['<'+tag+st+'>'+html+'</'+tag+'>',i];
}
function blocks(t){
  var L=t.replace(/\r/g,'').split('\n'),out=[],i=0,m;
  while(i<L.length){
    var l=L[i];
    if(!l.trim()){i++;continue}
    if((m=/^(#{1,6})\s+(.*)$/.exec(l))){var h=m[1].length<3?'h3':'h4';out.push('<'+h+'>'+inline(m[2])+'</'+h+'>');i++;continue}
    if(/^\s*([-*_])\1{2,}\s*$/.test(l)){out.push('<hr>');i++;continue}
    if(/^\s*>/.test(l)){var q=[];while(i<L.length&&/^\s*>/.test(L[i])){q.push(L[i].replace(/^\s*>\s?/,''));i++}out.push('<blockquote>'+blocks(q.join('\n'))+'</blockquote>');continue}
    if(i+1<L.length&&l.indexOf('|')>-1&&RE_TS.test(L[i+1])){
      var head=cells(l),rows=[];i+=2;
      while(i<L.length&&L[i].trim()&&L[i].indexOf('|')>-1){rows.push(cells(L[i]));i++}
      out.push('<div class="tbl"><table><thead><tr>'+head.map(function(c){return '<th>'+inline(c)+'</th>'}).join('')+'</tr></thead><tbody>'+
        rows.map(function(r){return '<tr>'+head.map(function(_,k){return '<td>'+inline(r[k]||'')+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>');
      continue;
    }
    if(RE_LI.test(l)){
      var items=[];
      while(i<L.length){
        var x=RE_LI.exec(L[i]);
        if(x){items.push({ind:x[1].replace(/\t/g,'  ').length,ord:/\d/.test(x[2]),num:parseInt(x[2],10)||1,text:x[3]});i++;continue}
        if(!L[i].trim()){var j=i+1;while(j<L.length&&!L[j].trim())j++;if(j<L.length&&RE_LI.test(L[j])){i=j;continue}break}
        if(/^\s{2,}\S/.test(L[i])&&items.length&&!startsBlock(L,i)){items[items.length-1].text+=' '+L[i].trim();i++;continue}
        break;
      }
      var k=0;while(k<items.length){var r=listHTML(items,k);out.push(r[0]);k=r[1]}
      continue;
    }
    var p=[];
    while(i<L.length&&L[i].trim()&&(p.length===0||!startsBlock(L,i))){p.push(L[i]);i++}
    out.push('<p>'+p.map(inline).join('<br>')+'</p>');
  }
  return out.join('');
}
function md(t){
  var parts=String(t).split(/```/),out='';
  parts.forEach(function(p,i){
    if(i%2){
      var m=/^([a-z0-9+#._-]*)[ \t]*\n?/i.exec(p),lang=m?m[1]:'',body=p.slice(m?m[0].length:0).replace(/\n$/,'');
      out+='<div class="cb"><div class="cb-h"><span>'+esc(lang||'code')+'</span><button type="button" class="cb-copy" data-copy>'+I.copy+'<b>Copy</b></button></div><pre><code>'+esc(body)+'</code></pre></div>';
    }else out+=blocks(p);
  });
  return out;
}

/* ---------- UI ---------- */
var fab=document.createElement('button');
fab.className='chat-fab';fab.type='button';fab.setAttribute('aria-label','Open AI assistant');
fab.innerHTML=I.chat+'Ask AI';
var box=document.createElement('section');
box.className='chat';box.setAttribute('role','dialog');box.setAttribute('aria-label','Aevy Assistant');box.setAttribute('aria-hidden','true');
box.innerHTML=
 '<div class="chat-head"><span class="bot-ico" aria-hidden="true">'+I.mark+'</span><div><h3>Aevy Assistant</h3><span class="st" id="chSt"><i></i><span>Online</span></span></div><span class="sp"></span>'+
 '<button type="button" id="chClear" aria-label="New conversation" title="New conversation">'+I.trash+'</button>'+
 '<button type="button" id="chClose" aria-label="Close chat">'+I.x+'</button></div>'+
 '<div class="chat-log" id="chLog" aria-live="polite"></div>'+
 '<form class="chat-form" id="chForm"><div class="composer"><textarea id="chIn" rows="1" maxlength="1500" placeholder="Message Aevy Assistant" aria-label="Message"></textarea>'+
 '<button class="send" id="chSend" type="submit" aria-label="Send message">'+I.send+'</button></div>'+
 '<p class="chat-foot">Responses are generated by AI and can contain mistakes. Do not share passwords.</p></form>';
document.body.appendChild(fab);document.body.appendChild(box);
var log=$('#chLog'),inp=$('#chIn'),send=$('#chSend'),st=$('#chSt');

var SUGG=['How do I publish a script?','Can I upload encrypted files?','Download all my scripts as a zip','Write a Lua hello world'];

function setStatus(){
  var t=$('span',st);
  if(live===false){st.className='st off';t.textContent='Offline helper'}
  else{st.className='st';t.textContent=live?'Live':'Online'}
}
function setBusy(on){
  busy=on;send.classList.toggle('stop',on);
  send.innerHTML=on?I.stop:I.send;
  send.setAttribute('aria-label',on?'Stop generating':'Send message');
}
function nearBottom(){return log.scrollHeight-log.scrollTop-log.clientHeight<90}
function toBottom(){log.scrollTop=log.scrollHeight}
function actions(last){
  var d=document.createElement('div');d.className='acts';
  d.innerHTML='<button type="button" data-act="copy" aria-label="Copy response" title="Copy">'+I.copy+'</button>'+(last?'<button type="button" data-act="redo" aria-label="Regenerate response" title="Regenerate">'+I.redo+'</button>':'');
  return d;
}
function addMsg(role,text,stream){
  var empty=$('.chat-empty',log);if(empty)empty.remove();
  var d=document.createElement('div');d.className='msg '+(role==='user'?'me':'bot');
  var b=document.createElement('div');b.className='bub';
  if(role==='user')b.textContent=text;
  else b.innerHTML=stream?'<span class="typing"><i></i><i></i><i></i></span>':md(text);
  d.appendChild(b);log.appendChild(d);toBottom();return b;
}
function emptyState(){
  var d=document.createElement('div');d.className='chat-empty';
  d.innerHTML='<span class="bot-ico lg" aria-hidden="true">'+I.mark+'</span><h4>How can I help?</h4><p>Ask about publishing, downloads and accounts, or get help with a script.</p>'+
    '<div class="chat-sug" id="chSug">'+SUGG.map(function(s){return '<button type="button">'+esc(s)+'</button>'}).join('')+'</div>';
  log.appendChild(d);
}
function render(){
  log.innerHTML='';
  if(!hist.length){emptyState();return}
  hist.forEach(function(m,i){
    var b=addMsg(m.role,m.content);
    if(m.role==='assistant')b.parentNode.appendChild(actions(i===hist.length-1));
  });
  toBottom();
}
function open(){box.classList.add('open');box.setAttribute('aria-hidden','false');fab.classList.add('hide');setTimeout(function(){inp.focus()},280);toBottom()}
function close(){box.classList.remove('open');box.setAttribute('aria-hidden','true');fab.classList.remove('hide');stop()}
function stop(){stopped=true;if(ctrl)ctrl.abort()}
fab.onclick=open;$('#chClose').onclick=close;
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&box.classList.contains('open')&&!document.querySelector('dialog[open]'))close()});
$('#chClear').onclick=function(){stop();hist=[];save();render();inp.focus()};
inp.addEventListener('input',function(){inp.style.height='auto';inp.style.height=Math.min(140,inp.scrollHeight)+'px'});
inp.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#chForm').requestSubmit()}});
$('#chForm').onsubmit=function(e){
  e.preventDefault();
  if(busy){stop();return}
  var t=inp.value.trim();if(!t)return;
  inp.value='';inp.style.height='auto';ask(t);
};
function copyText(t,btn,label){
  var ok=function(){var o=btn.innerHTML;btn.classList.add('done');btn.innerHTML=label?I.check+'<b>Copied</b>':I.check;setTimeout(function(){btn.classList.remove('done');btn.innerHTML=o},1400)};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(ok,function(){});
  else{var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');ok()}catch(x){}a.remove()}
}
log.addEventListener('click',function(e){
  var s=e.target.closest('.chat-sug button');if(s){ask(s.textContent);return}
  var c=e.target.closest('[data-copy]');
  if(c){copyText($('code',c.closest('.cb')).textContent,c,true);return}
  var a=e.target.closest('[data-act]');if(!a)return;
  if(a.dataset.act==='copy'){var i=Array.prototype.indexOf.call(log.children,a.closest('.msg'));copyText(hist[i]?hist[i].content:'',a,false)}
  if(a.dataset.act==='redo'&&!busy){
    var last=hist.pop(),q=hist.pop();
    if(last&&q){save();render();ask(q.content)}
  }
});

/* ---------- answering ---------- */
function paint(b,txt){
  pending=txt;if(raf)return;
  raf=requestAnimationFrame(function(){raf=0;var s=nearBottom();b.innerHTML=md(pending);if(s)toBottom()});
}
function ask(text){
  if(busy)return;
  stopped=false;setBusy(true);
  hist.push({role:'user',content:text});addMsg('user',text);
  var b=addMsg('assistant','',true),msgEl=b.parentNode;
  var done=function(full){
    if(raf){cancelAnimationFrame(raf);raf=0}
    full=(full||'').trim();
    if(!full)full=stopped?'Response stopped.':'No response was received. Please try again.';
    b.classList.remove('caret');b.innerHTML=md(full);
    Array.prototype.forEach.call(log.querySelectorAll('[data-act="redo"]'),function(x){x.remove()});
    msgEl.appendChild(actions(true));
    hist.push({role:'assistant',content:full});save();setBusy(false);ctrl=null;toBottom();setStatus();
  };
  var go=live===false?offline(text,b,done):online(b,done).catch(function(){live=false;setStatus();return offline(text,b,done)});
  return go;
}
function online(b,done){
  ctrl=new AbortController();
  var full='';
  var msgs=hist.slice(-16).map(function(m){return {role:m.role,content:m.content}});
  return fetch(URL_,{method:'POST',signal:ctrl.signal,headers:{'content-type':'application/json','apikey':cfg.key||''},body:JSON.stringify({messages:msgs})}).then(function(r){
    if(r.status===429){live=true;setStatus();done('You are sending messages too quickly. Wait a minute and try again.');return}
    if(!r.ok||!r.body)throw new Error('chat service '+r.status);
    live=true;setStatus();
    var rd=r.body.getReader(),dec=new TextDecoder(),first=true;
    function pump(){
      return rd.read().then(function(x){
        if(x.done){done(full);return}
        full+=dec.decode(x.value,{stream:true});
        if(first){first=false;b.classList.add('caret')}
        paint(b,full);
        return pump();
      });
    }
    return pump();
  }).catch(function(e){
    if(e&&e.name==='AbortError'){done(full);return}
    if(full){done(full);return}
    throw e;
  });
}

/* ---------- offline helper: answers questions about the site, typed out like a live reply ---------- */
var KB=[
 [/encrypt|binary|obfuscat|any (file|type)|\.luac|upload.*(file|any)/i,'Yes. Aevy accepts **any file type**, including encrypted and binary scripts.\n\n- Text files are stored as written.\n- Binary or encrypted files are stored losslessly and downloaded as the identical file, with its original extension.\n- The limit is 2 MB per file.\n\nBinary files cannot be previewed as text, so use **Download** to retrieve them.'],
 [/publish|upload|post|add (a )?script|new script/i,'To publish a script:\n\n1. Sign in, or create an account.\n2. Open **Publish** in the top menu.\n3. Paste your code or drop a file. The language is detected from the extension.\n4. Choose a category and visibility, then select **Publish script**.\n\nPrivate scripts are visible only to you. You can change visibility later with **Edit**.'],
 [/download|zip|save.*folder|backup|all (my )?(files|scripts)/i,'There are three ways to get your files:\n\n- **Single file:** open a script and select **Download**.\n- **Zip:** on **My files**, select scripts and download them as one archive, or download everything at once.\n- **Folder:** **Save to folder** writes the files directly to a folder on your computer (Chrome and Edge).\n\n**Backup** exports a JSON copy of your library that **Restore** can import.'],
 [/private|public|visib|who can see/i,'Each script is either **public** (anyone can read and download it) or **private** (only you can see it). Change this at any time from **Edit** on the script. Only the publisher can edit or delete a script.'],
 [/sign ?up|register|account|log ?in|sign ?in|google/i,'Select **Sign in** at the top right. You can create an account with an email and password, or continue with Google. Your username becomes your public publisher page and cannot be changed later.'],
 [/password|forgot|reset/i,'On the sign-in form, select **Forgot password?** to receive a reset link by email. Opening the link prompts you for a new password.'],
 [/delete.*account|remove.*account/i,'Open **Profile** and scroll to **Delete account**. After you confirm with your password, your profile, scripts and files are permanently removed. Download anything you want to keep first.'],
 [/video|youtube|watch/i,'Attach a YouTube or direct video link when you publish a script, or keep a personal list on the **Watch** page. Saved videos are private to your account.'],
 [/delete|remove/i,'Open your script and select **Delete**, or use the **Delete** button on **My files**. Only the publisher can delete a script.'],
 [/who are you|your name|what are you/i,'I am the Aevy Assistant. I can explain how the site works and help with scripting questions.'],
 [/^\s*(hello|hi|hey)\b/i,'Hello. I can help with publishing, downloads and accounts on Aevy, or with a scripting question. What are you working on?']
];
function hasLua(t){return /lua/i.test(t)&&/(hello|print|example|write|loop|function|table)/i.test(t)}
function offline(text,b,done){
  var ans=null;
  if(hasLua(text))ans='Here is a minimal Lua example:\n\n```lua\nlocal function greet(name)\n  return "Hello, " .. name .. "!"\nend\n\nfor i = 1, 3 do\n  print(i, greet("Aevy"))\nend\n```\n\nIt defines a local function, then loops three times and prints a greeting on each pass. `..` is Lua\'s string concatenation operator.';
  else for(var i=0;i<KB.length;i++)if(KB[i][0].test(text)){ans=KB[i][1];break}
  if(!ans)ans='I can answer questions about publishing, downloads, accounts and privacy on Aevy right now.\n\nOpen-ended and coding questions need the live assistant, which is available once the site owner deploys the chat service (see `supabase/functions/aevy-chat` in the project).';
  return new Promise(function(res){
    var i=0,full='';
    setTimeout(function(){
      if(stopped){done('');res();return}
      b.classList.add('caret');
      (function step(){
        if(stopped){done(full);res();return}
        var n=2+Math.floor(Math.random()*4);full+=ans.slice(i,i+n);i+=n;
        paint(b,full);
        if(i<ans.length)setTimeout(step,14+Math.random()*18);else{done(ans);res()}
      })();
    },420+Math.random()*380);
  });
}

load();render();setStatus();
window.AevyChat={open:open,close:close};
})();
