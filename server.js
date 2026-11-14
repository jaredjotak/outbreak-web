'use strict';
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const sharp = require('sharp');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ROOT = new URL(BASE_URL);
if (!['http:', 'https:'].includes(ROOT.protocol) || ROOT.pathname !== '/' || ROOT.search) throw Error('BASE_URL debe ser la raíz completa del sitio, por ejemplo https://ejemplo.com');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw Error('Define SESSION_SECRET de al menos 32 caracteres en .env');
if (process.env.NODE_ENV === 'production' && ROOT.protocol !== 'https:') throw Error('Usa HTTPS en producción.');

const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'public', 'assets', 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
const db = new Database(path.join(dataDir, 'outbreak.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS profiles (steam_id TEXT PRIMARY KEY, persona_name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', badge TEXT NOT NULL DEFAULT 'survivor', icon TEXT NOT NULL DEFAULT 'biohazard', background TEXT NOT NULL DEFAULT 'warcelona', background_url TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS used_openid_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
`);
const getProfile = db.prepare('SELECT * FROM profiles WHERE steam_id = ?');
const upsertProfile = db.prepare('INSERT INTO profiles (steam_id,persona_name,avatar,updated_at) VALUES (@steamId,@personaName,@avatar,@now) ON CONFLICT(steam_id) DO UPDATE SET persona_name = excluded.persona_name, avatar = CASE WHEN excluded.avatar != \'\' THEN excluded.avatar ELSE profiles.avatar END, updated_at = excluded.updated_at');
const saveProfile = db.prepare('UPDATE profiles SET badge = ?, icon = ?, background = ?, background_url = ?, updated_at = ? WHERE steam_id = ?');
const getSession = db.prepare('SELECT payload FROM sessions WHERE sid = ? AND expires_at > ?');
const saveSession = db.prepare('INSERT INTO sessions (sid,payload,expires_at) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at');
const delSession = db.prepare('DELETE FROM sessions WHERE sid = ?');
const saveNonce = db.prepare('INSERT OR IGNORE INTO used_openid_nonces (nonce,expires_at) VALUES (?,?)');
const cleanup = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
const cleanNonces = db.prepare('DELETE FROM used_openid_nonces WHERE expires_at < ?');

class SQLiteSessionStore extends session.Store {
  get(sid, callback) { try { const row = getSession.get(sid, Date.now()); callback(null, row ? JSON.parse(row.payload) : null); } catch (e) { callback(e); } }
  set(sid, sess, callback) { try { const expires = sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 7*86400000; saveSession.run(sid, JSON.stringify(sess), expires); callback?.(null); } catch (e) { callback?.(e); } }
  destroy(sid, callback) { try { delSession.run(sid); callback?.(null); } catch (e) { callback?.(e); } }
  touch(sid, sess, callback) { this.set(sid,sess,callback); }
}

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({limit:'20kb'}));
app.use(session({store:new SQLiteSessionStore(), name:'outbreak.sid', secret:process.env.SESSION_SECRET, resave:false, saveUninitialized:false, rolling:true, cookie:{httpOnly:true, secure:ROOT.protocol==='https:', sameSite:'lax', maxAge:7*86400000}}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');next();});
app.use(express.static(path.join(__dirname,'public'),{extensions:['html'],maxAge:0}));
const allowed = {badge:new Set(['survivor','veteran','hunter','guardian','elite']),icon:new Set(['biohazard','shield','blade','star','crown']),background:new Set(['warcelona','smoke','embers','steel'])};
const mapProfile = (p)=>({steamId:p.steam_id,personaName:p.persona_name,avatar:p.avatar,badge:p.badge,icon:p.icon,background:p.background,backgroundUrl:p.background_url});
const requireLogin = (req,res,next)=>req.session.steamId ? next() : res.status(401).json({error:'Debes iniciar sesión con Steam.'});
const requireCsrf = (req,res,next)=>{
  const origin=req.get('origin');if(origin && origin !== ROOT.origin) return res.status(403).json({error:'Origen no permitido'});
  const sent=req.get('X-CSRF-Token');if(!sent || !req.session.csrf || sent!==req.session.csrf) return res.status(403).json({error:'Token de sesión inválido'});
  next();
};
const ensureCsrf=(req)=>{if(!req.session.csrf)req.session.csrf=crypto.randomBytes(24).toString('hex');return req.session.csrf;};

app.get('/auth/steam',(req,res,next)=>{
  try{
    const state=crypto.randomBytes(24).toString('hex');
    req.session.loginState=state;
    const params=new URLSearchParams({
      'openid.ns':'http://specs.openid.net/auth/2.0',
      'openid.mode':'checkid_setup',
      'openid.return_to':`${BASE_URL}/auth/steam/callback?state=${state}`,
      'openid.realm':`${ROOT.origin}/`,
      'openid.identity':'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id':'http://specs.openid.net/auth/2.0/identifier_select'
    });
    req.session.save(err=>err?next(err):res.redirect('https://steamcommunity.com/openid/login?'+params.toString()));
  }catch(err){next(err);}
});
app.get('/auth/steam/callback',async(req,res)=>{
  const fail=()=>res.status(401).send('No se pudo verificar la cuenta Steam. <a href="/">Volver a OUTBREAK</a>');
  try{
    if(!req.session.loginState || req.query.state!==req.session.loginState)return fail();
    const expectedReturn=`${BASE_URL}/auth/steam/callback?state=${req.session.loginState}`;
    delete req.session.loginState;
    if(req.query['openid.ns']!=='http://specs.openid.net/auth/2.0'||req.query['openid.mode']!=='id_res'||req.query['openid.return_to']!==expectedReturn)return fail();
    const claimed=req.query['openid.claimed_id'];
    if(typeof claimed!=='string'||!/^https?:\/\/steamcommunity\.com\/openid\/id\/7656119\d{10}$/.test(claimed))return fail();
    const identity=req.query['openid.identity'];if(identity!==claimed)return fail();
    const nonce=req.query['openid.response_nonce'];if(typeof nonce!=='string'||nonce.length>250)return fail();
    const signed=req.query['openid.signed'];if(typeof signed!=='string'||signed.length>1000)return fail();
    const fields=new URLSearchParams();
    for(const [k,v] of Object.entries(req.query)){if(k.startsWith('openid.') && typeof v==='string')fields.append(k,v);}
    fields.set('openid.mode','check_authentication');
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
    let response;try{response=await fetch('https://steamcommunity.com/openid/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fields.toString(),signal:controller.signal});}finally{clearTimeout(timeout);}
    const answer=await response.text();if(!response.ok || !/is_valid\s*:\s*true/i.test(answer))return fail();
    const now=Date.now();cleanup.run(now);cleanNonces.run(now);
    const nonceTime=Date.parse(nonce.slice(0,20));
    if(!Number.isFinite(nonceTime) || Math.abs(now-nonceTime)>10*60*1000)return fail();
    if(saveNonce.run(nonce,now+15*60*1000).changes!==1)return fail();
    const steamId=claimed.split('/').pop();
    let personaName='Usuario Steam '+steamId.slice(-5),avatar='';
    if(process.env.STEAM_API_KEY){
      try{const u=new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');u.searchParams.set('key',process.env.STEAM_API_KEY);u.searchParams.set('steamids',steamId);
      const c=new AbortController(),to=setTimeout(()=>c.abort(),5500);let p;
      try{const r=await fetch(u,{signal:c.signal});p=(await r.json())?.response?.players?.[0];}finally{clearTimeout(to);}
      if(p){personaName=String(p.personaname||personaName).slice(0,80);avatar=String(p.avatarfull||'').slice(0,500);}}
      catch(e){console.warn('Avatar Steam no disponible:',e.message);}
    }
    upsertProfile.run({steamId,personaName,avatar,now});
    req.session.regenerate(err=>{
      if(err)return res.status(500).send('Error al iniciar sesión.');
      req.session.steamId=steamId;req.session.csrf=crypto.randomBytes(24).toString('hex');
      req.session.save(err=>err?res.status(500).send('No se pudo guardar la sesión'):res.redirect('/#perfiles'));
    });
  }catch(e){console.error('Login Steam error:',e.message);fail();}
});
app.get('/auth/logout',(req,res)=>req.session.destroy(()=>{res.clearCookie('outbreak.sid');res.redirect('/#perfiles');}));
app.get('/api/me',(req,res)=>{
  if(!req.session.steamId)return res.json({authenticated:false});
  const p=getProfile.get(req.session.steamId);
  if(!p)return res.json({authenticated:false});
  res.setHeader('Cache-Control','no-store');res.json({authenticated:true,csrf:ensureCsrf(req),profile:mapProfile(p)});
});
app.get('/api/profiles/:steamId',(req,res)=>{
  if(!/^7656119\d{10}$/.test(req.params.steamId))return res.status(400).json({error:'SteamID64 inválido'});
  const p=getProfile.get(req.params.steamId);if(!p)return res.status(404).json({error:'Perfil aún no registrado'});
  res.json({profile:mapProfile(p)});
});
app.post('/api/profile',requireLogin,requireCsrf,(req,res)=>{
  const {badge,icon,background}=req.body||{};
  if(!allowed.badge.has(badge)||!allowed.icon.has(icon)||!allowed.background.has(background))return res.status(400).json({error:'Selección inválida'});
  saveProfile.run(badge,icon,background,'',Date.now(),req.session.steamId);
  res.json({profile:mapProfile(getProfile.get(req.session.steamId))});
});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024,files:1,fields:0}});
app.post('/api/profile/background',requireLogin,requireCsrf,(req,res,next)=>upload.single('background')(req,res,next),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Selecciona una imagen'});
  try{
    const img=sharp(req.file.buffer,{limitInputPixels:24e6,failOn:'error'});
    const metadata=await img.metadata();if(!['jpeg','png','webp'].includes(metadata.format))return res.status(400).json({error:'Formato no permitido'});
    const file=crypto.randomBytes(24).toString('hex')+'.webp';
    await img.rotate().resize(1400,650,{fit:'cover',position:'centre'}).webp({quality:78}).toFile(path.join(uploadDir,file));
    const old=getProfile.get(req.session.steamId)?.background_url||'';
    const url='/assets/uploads/'+file;
    const p=getProfile.get(req.session.steamId);
    saveProfile.run(p.badge,p.icon,'custom',url,Date.now(),req.session.steamId);
    if(old.startsWith('/assets/uploads/'))fs.unlink(path.join(uploadDir,path.basename(old)),()=>{});
    res.json({profile:mapProfile(getProfile.get(req.session.steamId))});
  }catch(err){console.warn('Upload rechazado:',err.message);res.status(400).json({error:'No se pudo procesar la imagen'});}
});
app.use((err,req,res,next)=>{console.error(err.message);res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'Imagen demasiado grande':'Solicitud no válida'});});
app.get('/healthz', (req, res) => res.json({status:'ok', app:'OUTBREAK'}));
app.listen(PORT, '0.0.0.0', ()=>console.log(`OUTBREAK activo en ${BASE_URL}`));
