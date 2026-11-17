/* Aevy accounts on Supabase Auth (email or phone number, with a password; phone numbers are verified with an SMS code).
   Public profile data lives in the public.profiles table and is cached in memory so views can render synchronously.
   Usernames are unique through a unique index on profiles.username (see supabase/schema.sql). */
(function(){
'use strict';
var cfg=window.AEVY_CONFIG||{};
if(!window.supabase||!cfg.url||!cfg.key){console.error('Supabase library or js/config.js is missing');return}
/* PKCE keeps the auth tokens out of the URL hash, which this app uses for routing (#/scripts, #/auth ...). */
var sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.AevySB={client:sb};

var COLORS=['#5b86f5','#3fb68b','#e0954a','#9a7cf0','#e0607e','#4cb5d6'];
var profiles=[],index={},user=null,me=null,silent=0,recovering=false,booted=false;
var HOME=location.origin+location.pathname;

function ms(t){var n=t?Date.parse(t):NaN;return isNaN(n)?Date.now():n}
function pub(p){return {id:p.id,username:p.username,name:p.name,bio:p.bio||'',color:p.color,avatar:p.avatar||'',cover:p.cover||'',location:p.location||'',website:p.website||'',role:p.role==='admin'?'admin':'user',verified:!!p.verified,created:ms(p.created)}}
var PCOLS='id,username,name,bio,color,avatar,cover,location,website,role,verified,created';
function reindex(){index={};profiles.forEach(function(p){index[p.id]=p})}
function hash(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
function aevy(msg,extra){var e=new Error(msg);e.aevy=1;if(extra)for(var k in extra)e[k]=extra[k];return e}
function nice(e){
  if(e&&e.aevy)return e;
  var c=String((e&&(e.code||e.error_code))||''),m=String((e&&e.message)||e||''),s=e&&e.status;
  if(c==='invalid_credentials'||/invalid login credentials/i.test(m))return new Error('Wrong email or password');
  if(c==='email_not_confirmed'||/email not confirmed/i.test(m))return new Error('Confirm your email first: open the link we sent you, then sign in');
  if(c==='user_already_exists'||c==='email_exists'||/already registered/i.test(m))return new Error('An account with that email already exists');
  if(c==='weak_password'||/password should be at least|weak/i.test(m))return new Error('Password must be at least 8 characters');
  if(c==='same_password'||/different from the old/i.test(m))return new Error('Choose a password different from the current one');
  if(c==='validation_failed'&&/email/i.test(m))return new Error('Enter a valid email address');
  if(/invalid email|unable to validate email/i.test(m))return new Error('Enter a valid email address');
  if(c==='over_request_rate_limit'||c==='over_email_send_rate_limit'||c==='email_rate_limit_exceeded'||s===429||/rate limit|too many/i.test(m))return new Error('Too many attempts. Wait a minute and try again');
  if(c==='signup_disabled')return new Error('Sign ups are disabled for this project');
  if(c==='phone_provider_disabled'||c==='provider_disabled'||/phone.*(disabled|not enabled)|unsupported (phone )?provider/i.test(m))return new Error('Phone sign-in is not enabled yet. Turn it on in Supabase > Authentication > Providers > Phone');
  if(c==='sms_send_failed'||/sms/i.test(m)&&/fail|error/i.test(m))return new Error('Could not send the SMS code. Check the number (with country code) and try again');
  if(c==='phone_exists'||/phone.*(already|registered|exists)/i.test(m))return new Error('An account with that phone number already exists');
  if(c==='otp_expired'||c==='invalid_otp'||/token has expired|invalid.*(otp|token|code)|otp/i.test(m))return new Error('That code is wrong or expired. Request a new one');
  if(c==='user_banned')return new Error('This account has been disabled');
  if(c==='session_not_found'||c==='reauthentication_needed'||/jwt|session/i.test(m)&&s===401)return new Error('Please sign in again, then retry');
  if(/database error saving new user/i.test(m))return new Error('That username is taken. Try another one');
  if(c==='23505'||/duplicate key/i.test(m))return new Error('That username is taken. Try another one');
  if(c==='42501'||/row-level security|permission denied/i.test(m))return new Error('Permission denied by the database. Run the latest supabase/schema.sql in the Supabase SQL editor');
  if(c==='42P01'||c==='PGRST205'||/schema cache|does not exist/i.test(m))return new Error('The database tables are missing. Run supabase/schema.sql in the Supabase SQL editor');
  if(/failed to fetch|networkerror|load failed|fetch failed/i.test(m))return new Error('Cannot reach the server. Check your connection and disable ad blockers/VPN, then retry');
  return new Error(m||'Request failed');
}
function must(r){if(r.error)throw r.error;return r.data}
var PBASE='id,username,name,bio,color,avatar,cover,location,website,created';
function loadProfiles(){
  return sb.from('profiles').select(PCOLS).order('created',{ascending:true}).limit(1000).then(function(r){
    /* the badge columns (role, verified) are missing until the latest schema.sql is run: fall back so the site keeps working */
    if(r.error&&(r.error.code==='42703'||/role|verified/i.test(r.error.message||''))){
      console.warn('Run the latest supabase/schema.sql to enable badges');
      return sb.from('profiles').select(PBASE).order('created',{ascending:true}).limit(1000);
    }
    return r;
  }).then(function(r){
    profiles=must(r).map(pub);reindex();
  });
}
var EMAIL_RE=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/* phone numbers are stored as E.164: +<country code><number> */
function normPhone(v){var t=String(v||'').replace(/[\s().-]/g,'');if(t.slice(0,2)==='00')t='+'+t.slice(2);return /^\+[1-9]\d{7,14}$/.test(t)?t:null}
function isEmail(v){return String(v||'').indexOf('@')>-1}
function who(v){
  v=String(v||'').trim();
  if(!v)return {err:'Enter your email or phone number'};
  if(isEmail(v))return EMAIL_RE.test(v)?{email:v}:{err:'Enter a valid email address'};
  var ph=normPhone(v);
  return ph?{phone:ph}:{err:'Enter a valid email, or a phone number with country code (e.g. +8801712345678)'};
}
var pendingUp=null;
/* after sign-up: the profile trigger normally made it; if not, create it from the browser */
function finishUp(un,name){setMe();if(me||!un)return me;return A.claim(un,name).then(function(){return loadProfiles()}).then(function(){setMe();return me})}
function setMe(){me=user?(index[user.id]||null):null}
function ensureProfile(){return index[user.id]?Promise.resolve():loadProfiles()}

var A=window.AevyAuth={
  ready:null,
  current:function(){return me},
  isAdmin:function(){return !!(me&&me.role==='admin')},
  email:function(){return user?(user.email||(user.phone?'+'+String(user.phone).replace(/^\+/,''):'')):''},
  isPhone:function(v){return !!v&&!isEmail(v)},
  recovery:function(){return recovering},
  byName:function(n){var k=String(n).toLowerCase();return profiles.filter(function(u){return u.username===k})[0]},
  byId:function(id){return index[id]},
  all:function(){return profiles.slice()},
  refreshProfiles:function(){return loadProfiles().then(setMe)},
  /* true = free, false = taken, null = could not check (never blocks the form) */
  checkUsername:function(un){
    un=String(un||'').trim().toLowerCase();
    if(!/^[a-z0-9_]{3,20}$/.test(un))return Promise.resolve(null);
    return sb.from('profiles').select('id').eq('username',un).limit(1).then(function(r){
      if(r.error)return null;
      return r.data.length?!!(user&&r.data[0].id===user.id):true;
    },function(){return null});
  },
  /* Creates the profile of the signed-in user. The unique index on username makes the claim atomic. */
  claim:function(un,name){
    return sb.from('profiles').insert({id:user.id,username:un,name:name,bio:'',color:COLORS[hash(un)%COLORS.length]}).then(function(r){
      if(r.error){
        if(r.error.code==='23505')throw aevy('That username is taken. Try another one',{taken:1});
        throw r.error;
      }
    });
  },
  signUp:function(o){
    var un=String(o.username||'').trim().toLowerCase(),pw=o.password||'',w=who(o.id!=null?o.id:o.email);
    if(!/^[a-z0-9_]{3,20}$/.test(un))return Promise.reject(new Error('Username: 3 to 20 letters, numbers or underscores'));
    if(w.err)return Promise.reject(new Error(w.err));
    if(pw.length<8)return Promise.reject(new Error('Password must be at least 8 characters'));
    var name=((o.name||un).trim()||un).slice(0,40);
    silent++;
    return A.checkUsername(un).then(function(free){
      if(free===false)throw aevy('That username is taken. Try another one');
      /* username + name travel as user metadata; a database trigger creates the profile (works with or without confirmation) */
      var c=w.email?{email:w.email,password:pw,options:{data:{username:un,name:name},emailRedirectTo:HOME}}:{phone:w.phone,password:pw,options:{data:{username:un,name:name}}};
      return sb.auth.signUp(c).then(must);
    }).then(function(d){
      /* with confirmation on, an already registered address returns a user with no identities instead of an error */
      if(d.user&&d.user.identities&&d.user.identities.length===0)throw aevy(w.email?'An account with that email already exists. Use the Sign in tab':'An account with that phone number already exists. Use the Sign in tab');
      if(!d.session){
        if(w.phone){pendingUp={un:un,name:name};return {code:true,phone:w.phone}}   /* an SMS code was sent: ask for it */
        throw aevy('Account created. Open the confirmation link we emailed you, then sign in');
      }
      user=d.session.user;
      return loadProfiles().then(function(){return finishUp(un,name)});
    }).then(function(v){silent--;return v},function(e){silent--;throw nice(e)});
  },
  /* second step of a phone sign-up: the 6-digit SMS code */
  verifyPhone:function(phone,code){
    var tk=String(code||'').replace(/\D/g,'');
    if(tk.length<4)return Promise.reject(new Error('Enter the code from the SMS'));
    silent++;
    return sb.auth.verifyOtp({phone:phone,token:tk,type:'sms'}).then(must).then(function(d){
      user=d.session.user;
      var p=pendingUp||{};pendingUp=null;
      return loadProfiles().then(function(){return finishUp(p.un,p.name)});
    }).then(function(v){silent--;return v},function(e){silent--;throw nice(e)});
  },
  /* sends a fresh SMS code: kind 'up' = sign-up confirmation, 'reset' = password reset */
  sendCode:function(phone,kind){
    var w=normPhone(phone);
    if(!w)return Promise.reject(new Error('Enter a valid phone number with country code (e.g. +8801712345678)'));
    var q=kind==='up'?sb.auth.resend({type:'sms',phone:w}):sb.auth.signInWithOtp({phone:w,options:{shouldCreateUser:false}});
    return q.then(function(r){if(r.error)throw r.error;return w},function(e){throw nice(e)});
  },
  /* forgot password by phone: the SMS code signs the user in, then the app asks for a new password */
  verifyReset:function(phone,code){
    var tk=String(code||'').replace(/\D/g,'');
    if(tk.length<4)return Promise.reject(new Error('Enter the code from the SMS'));
    silent++;
    return sb.auth.verifyOtp({phone:phone,token:tk,type:'sms'}).then(must).then(function(d){
      user=d.session.user;
      return ensureProfile().then(function(){setMe();recovering=true;setTimeout(function(){window.dispatchEvent(new Event('aevy:recovery'))},0);return me});
    }).then(function(v){silent--;return v},function(e){silent--;throw nice(e)});
  },
  /* signed in but no profile yet: pick a username */
  pending:function(){return !!user&&!me},
  suggest:function(){
    if(!user)return {name:'',username:''};
    var md=user.user_metadata||{},full=md.full_name||md.name||'';
    var base=String(full||(user.email||'').split('@')[0]||'').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,16);
    return {name:full,username:base.length>=3?base:''};
  },
  completeProfile:function(o){
    if(!user)return Promise.reject(new Error('Sign in first'));
    var un=String(o.username||'').trim().toLowerCase();
    if(!/^[a-z0-9_]{3,20}$/.test(un))return Promise.reject(new Error('Username: 3 to 20 letters, numbers or underscores'));
    var name=((o.name||un).trim()||un).slice(0,40);
    silent++;
    return A.claim(un,name).then(function(){return loadProfiles()}).then(function(){setMe();return me})
      .then(function(v){silent--;return v},function(e){silent--;throw nice(e)});
  },
  resetPassword:function(email){
    email=String(email||'').trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return Promise.reject(new Error('Enter your email address first'));
    return sb.auth.resetPasswordForEmail(email,{redirectTo:HOME}).then(function(r){
      /* do not reveal whether an address has an account */
      if(r.error&&r.error.code!=='user_not_found')throw nice(r.error);
    },function(e){throw nice(e)});
  },
  /* used after the user opens the reset link from the email */
  setNewPassword:function(pw){
    if((pw||'').length<8)return Promise.reject(new Error('Password must be at least 8 characters'));
    return sb.auth.updateUser({password:pw}).then(must).then(function(){recovering=false},function(e){throw nice(e)});
  },
  signIn:function(idv,pw){
    var w=who(idv);
    if(w.err)return Promise.reject(new Error(w.err));
    silent++;
    return sb.auth.signInWithPassword(w.email?{email:w.email,password:pw}:{phone:w.phone,password:pw}).then(must).then(function(d){
      user=d.user;
      return ensureProfile().then(function(){setMe();return me});
    }).then(function(v){silent--;return v},function(e){silent--;throw nice(e)});
  },
  signOut:function(){
    silent++;
    return sb.auth.signOut().then(function(){user=null;me=null;silent--},function(){user=null;me=null;silent--});
  },
  update:function(p){
    if(!me)return Promise.reject(new Error('Sign in first'));
    var f={};
    if(p.name!=null)f.name=String(p.name).trim().slice(0,40)||me.name;
    if(p.bio!=null)f.bio=String(p.bio).slice(0,280);
    if(p.color)f.color=p.color;
    if(p.location!=null)f.location=String(p.location).trim().slice(0,40);
    if(p.website!=null){
      var w=String(p.website).trim();
      if(w&&!/^https?:\/\//i.test(w))w='https://'+w;
      if(w&&!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(w))return Promise.reject(new Error('Enter a valid website address'));
      f.website=w.slice(0,100);
    }
    if(p.avatar!=null)f.avatar=p.avatar;
    if(p.cover!=null)f.cover=p.cover;
    return sb.from('profiles').update(f).eq('id',me.id).select(PCOLS).single().then(must).then(function(d){
      var n=pub(d);profiles=profiles.map(function(u){return u.id===n.id?n:u});reindex();me=n;return n;
    }).then(null,function(e){throw nice(e)});
  },
  /* Uploads a profile photo ('avatar') or cover photo ('cover') to Storage and saves its address on the profile. */
  setImage:function(kind,blob){
    if(!me)return Promise.reject(new Error('Sign in first'));
    if(kind!=='avatar'&&kind!=='cover')return Promise.reject(new Error('Unknown image'));
    var path=me.id+'/'+kind+'.jpg';
    return sb.storage.from('avatars').upload(path,blob,{upsert:true,contentType:'image/jpeg',cacheControl:'3600'}).then(function(r){
      if(r.error)throw r.error;
      var url=sb.storage.from('avatars').getPublicUrl(path).data.publicUrl+'?v='+Date.now();
      var o={};o[kind]=url;return A.update(o);
    }).then(null,function(e){
      var m=String((e&&e.message)||e);
      if(/bucket not found/i.test(m))throw new Error('Photo storage is not set up. Run the latest supabase/schema.sql in the Supabase SQL editor');
      if(/row-level security|not authorized|unauthorized/i.test(m))throw new Error('Not allowed to upload. Run the latest supabase/schema.sql in the Supabase SQL editor');
      throw nice(e);
    });
  },
  removeImage:function(kind){
    if(!me)return Promise.reject(new Error('Sign in first'));
    var o={};o[kind]='';
    return A.update(o).then(function(n){sb.storage.from('avatars').remove([me.id+'/'+kind+'.jpg']).then(function(){},function(){});return n});
  },
  /* deletes every photo of the signed-in user (used before account deletion, best effort) */
  purgeImages:function(){
    if(!me)return Promise.resolve();
    return sb.storage.from('avatars').remove([me.id+'/avatar.jpg',me.id+'/cover.jpg']).then(function(){},function(){});
  },
  /* re-checks the password by signing in again */
  verify:function(pw,msg){
    return sb.auth.signInWithPassword(user.email?{email:user.email,password:pw}:{phone:user.phone,password:pw}).then(function(r){
      if(r.error){
        /* only a real credentials failure means "wrong password"; show any other cause as it is */
        if(r.error.code==='invalid_credentials'||/invalid login credentials/i.test(r.error.message||''))throw new Error(msg||'Password is wrong');
        throw r.error;
      }
    });
  },
  changePassword:function(oldPw,newPw){
    if(!me)return Promise.reject(new Error('Sign in first'));
    if((newPw||'').length<8)return Promise.reject(new Error('New password must be at least 8 characters'));
    silent++;
    return A.verify(oldPw,'Current password is wrong').then(function(){return sb.auth.updateUser({password:newPw}).then(must)})
      .then(function(){silent--},function(e){silent--;throw nice(e)});
  },
  /* cleanup: function returning a promise that deletes the user's scripts/videos first */
  remove:function(pw,cleanup){
    if(!me)return Promise.reject(new Error('Sign in first'));
    silent++;
    return A.verify(pw,'Password is wrong').then(function(){return cleanup?cleanup():null}).then(function(){
      /* security-definer function from schema.sql: deletes the auth user, which cascades to profile, scripts, files and videos */
      return sb.rpc('delete_my_account').then(must);
    }).then(function(){return sb.auth.signOut({scope:'local'}).catch(function(){})}).then(function(){
      user=null;me=null;return loadProfiles().catch(function(){});
    }).then(function(){silent--},function(e){silent--;throw nice(e)});
  }
};

/* Registered immediately so the PASSWORD_RECOVERY event of a reset link is never missed.
   Do not call Supabase inside this callback. */
sb.auth.onAuthStateChange(function(ev,session){
  if(ev==='PASSWORD_RECOVERY'){recovering=true;setTimeout(function(){window.dispatchEvent(new Event('aevy:recovery'))},0)}
  if(silent||!booted)return;
  /* sign-out or session change in another tab */
  var u=session?session.user:null,before=user?user.id:null,after=u?u.id:null;
  if(before===after){if(u)user=u;return}
  user=u;
  setTimeout(function(){
    (u?ensureProfile().catch(function(){}):Promise.resolve()).then(function(){setMe();window.dispatchEvent(new Event('aevy:auth'))});
  },0);
});

/* Wait for Supabase to restore a saved session (or finish a reset-link return), then load profiles. */
A.ready=sb.auth.getSession().then(function(r){
  user=(r.data&&r.data.session&&r.data.session.user)||null;
  return loadProfiles().catch(function(e){console.error(e)});
}).then(function(){
  setMe();
  /* signed in but no profile yet: send the visitor to the username step */
  if(user&&!me&&location.hash!=='#/auth'&&!recovering)history.replaceState(null,'','#/auth');
  booted=true;
});
})();
