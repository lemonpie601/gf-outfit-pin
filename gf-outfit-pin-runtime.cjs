'use strict';
// Gacha Forge 의상 캐릭터 고정 (gf-outfit-pin) — in-memory hook. 설치 파일은 건드리지 않습니다.
// 상점 의상 로테이션의 후보를 월드마다 고른 캐릭터로만 좁힙니다. 고른 캐릭터가 없거나 모두 로스터에서 빠지면 게임 기본 동작.
// NODE_OPTIONS의 다른 가챠 포지 훅들 "뒤에" --require 하세요 (뒤에 등록된 훅이 앞 훅의 결과를 받아 고칩니다).
const fs = require('node:fs');
const { registerHooks } = require('node:module');
const { fileURLToPath } = require('node:url');
const TAG = '[gf-outfit-pin]';
const TARGET = /[\\/]capability-runtime-snapshots[\\/]gacha-forge-1\.8\.13-[^\\/]+[\\/]server\.mjs$/;

const HEAD = `/*gf-outfit-pin:head*/const gopFs=process.getBuiltinModule("node:fs"),gopFile=process.env.GF_OUTFIT_PIN_FILE||process.getBuiltinModule("node:url").fileURLToPath(new URL("../../gacha-outfit-pins.json",import.meta.url));let gopState=null;
const gopOk=x=>typeof x==="string"&&x.length>0&&x.length<=256;
function gopLoad(){if(gopState)return gopState;let runs={};try{let raw=JSON.parse(gopFs.readFileSync(gopFile,"utf8"));for(const[id,v]of Object.entries(raw&&raw.runs||{}))if(gopOk(id)&&Array.isArray(v))runs[id]=[...new Set(v.filter(gopOk))].slice(0,200)}catch(e){if(e&&e.code!=="ENOENT")process.stderr.write("[gf-outfit-pin] settings load failed; none pinned: "+e.message+"\\n")}return gopState={runs}}
function gopGet(runId){return gopLoad().runs[runId]||[]}
function gopSet(runId,ids){let st=gopLoad(),runs={...st.runs};if(ids.length)runs[runId]=ids;else delete runs[runId];let tmp=gopFile+".tmp";gopFs.writeFileSync(tmp,JSON.stringify({runs},null,2));gopFs.renameSync(tmp,gopFile);gopState={runs};return gopGet(runId)}
function gopFilter(runId,list){let p=new Set(gopGet(runId));if(!p.size)return list;let f=list.filter(c=>p.has(c.unitId));return f.length?f:list}
`;

const EDITS = [
  // 의상 로테이션: 비어 있는 자리를 채울 후보와 자리 수를 고정 캐릭터 기준으로 계산
  { old: 'ye=new Set(K.map(je=>l(je.unitId))),we=th(c,ae);', new: 'ye=new Set(K.map(je=>l(je.unitId))),we=th(c,ae=gopFilter(s,ae));' },
  // 상점 화면에 보이는 로테이션 자리 수
  { old: 'N.outfitsPerRotation=th(N,Dn(d,H,E).candidates)', new: 'N.outfitsPerRotation=th(N,gopFilter(E,Dn(d,H,E).candidates))' },
  // 설정 API: /api/gacha-forge/gf-outfit-pin/get, /api/gacha-forge/gf-outfit-pin/set
  { old: 's.post("/roster",', new: 's.post("/gf-outfit-pin/get",async p=>gopRoute(p,null)),s.post("/gf-outfit-pin/set",async p=>gopRoute(p,p&&p.body&&p.body.pinned)),s.post("/roster",' },
  { old: 'async function or(s){', new: 'async function gopRoute(p,want){let u=p&&p.body||{},o=l(u.runId);if(!o)return{ok:!1,error:"bad-request"};let{data:i}=await be(),meta=Ae(i,o);if(!meta)return{ok:!1,error:"bad-request"};let{candidates:C,byId:B}=await or(o),known=new Set(C.map(x=>x.unitId)),pinned=gopGet(o);if(want!==null){if(!Array.isArray(want)||want.length>200)return{ok:!1,error:"invalid-settings"};try{pinned=gopSet(o,[...new Set(want.filter(x=>gopOk(x)&&known.has(x)))])}catch(e){r.logger.error(e,"[gf-outfit-pin] save failed");return{ok:!1,error:"save-failed"}}}return{ok:!0,run:{runId:o,name:String(meta.name||"").slice(0,100)},candidates:C.map(x=>{let d=B[x.unitId]||{};return{unitId:x.unitId,name:x.name,rarity:Number(d.rarity)||0,protagonist:!!d.isProtagonist}}),pinned:pinned.filter(x=>known.has(x)),perRotation:rc(meta.images||{})}}async function or(s){' },
];

const count = (h, n) => h.split(n).length - 1;
function applyEdits(source) {
  if (source.includes('/*gf-outfit-pin:head*/')) return { ok: false, error: 'already applied', source };
  let next = source;
  for (let i = 0; i < EDITS.length; i++) {
    if (count(next, EDITS[i].old) !== 1) return { ok: false, error: 'signature mismatch #' + (i + 1), source };
    next = next.replace(EDITS[i].old, () => EDITS[i].new);
  }
  return { ok: true, source: HEAD + next };
}

if (process.env.GF_OUTFIT_PIN_HOOK_TEST !== '1') {
  if (typeof registerHooks !== 'function') process.stderr.write(TAG + ' this Node.js has no module.registerHooks (need 22.15+); disabled\n');
  else {
    registerHooks({ load(url, context, nextLoad) {
      if (!url.startsWith('file:')) return nextLoad(url, context);
      let filename; try { filename = fileURLToPath(url); } catch { return nextLoad(url, context); }
      if (!TARGET.test(filename)) return nextLoad(url, context);
      const result = nextLoad(url, context);
      const source = result.source == null ? fs.readFileSync(filename, 'utf8') : Buffer.isBuffer(result.source) ? result.source.toString('utf8') : String(result.source);
      const t = applyEdits(source);
      if (!t.ok) { process.stderr.write(TAG + ' not applied: ' + t.error + '; game unchanged\n'); return result; }
      process.stderr.write(TAG + ' applied ' + EDITS.length + ' edits in memory (outfit character pins)\n');
      return { ...result, source: t.source, shortCircuit: true };
    } });
    process.stderr.write(TAG + ' hook registered (no package files changed)\n');
  }
}
module.exports = { applyEdits, TARGET };
