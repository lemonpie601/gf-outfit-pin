'use strict';
// Gacha Forge 의상 캐릭터 고정 (gf-outfit-pin) 1.1.0 — in-memory hook. 설치 파일은 건드리지 않습니다.
// 상점 의상 로테이션의 자리 수는 게임 설정(이미지 → 로테이션당 의상 수) 그대로 두고, 월드마다 고른 캐릭터로
// 먼저 채운 뒤 남은 자리는 나머지 보유 캐릭터 중에서 무작위로 채웁니다. 고른 캐릭터가 없으면 게임 기본 동작.
// 대상: Gacha Forge 1.27.x (Marinara Engine 2.5.2).
// NODE_OPTIONS의 다른 가챠 포지 훅들 "뒤에" --require 하세요 (뒤에 등록된 훅이 앞 훅의 결과를 받아 고칩니다).
const fs = require('node:fs');
const { registerHooks } = require('node:module');
const { fileURLToPath } = require('node:url');
const TAG = '[gf-outfit-pin]';
const TARGET = /[\\/]capability-runtime-snapshots[\\/]gacha-forge-1\.27\.\d+-[^\\/]+[\\/]server\.mjs$/;

// gopPick(runId, candidates, count, vp): vp(list, n) is the game's own picker (least-offered first, skips units
// that do not fit the theme). Pinned units fill the slots first (least-offered first among them); whatever is left
// goes to the other eligible units in random order. With nobody pinned, the game's picker alone.
const PICK = `function gopPick(runId,cands,n,vp){let pins=new Set(gopGet(runId));if(!pins.size||!(n>0))return vp(cands,n);let first=vp(cands.filter(c=>pins.has(c.unitId)),n),rest=vp(cands.filter(c=>!pins.has(c.unitId)),cands.length);for(let i=rest.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]]}return[...first,...rest.slice(0,Math.max(0,n-first.length))]}
`;

const HEAD = `/*gf-outfit-pin:head*/const gopFs=process.getBuiltinModule("node:fs"),gopFile=process.env.GF_OUTFIT_PIN_FILE||process.getBuiltinModule("node:url").fileURLToPath(new URL("../../gacha-outfit-pins.json",import.meta.url));let gopState=null;
const gopOk=x=>typeof x==="string"&&x.length>0&&x.length<=256;
function gopLoad(){if(gopState)return gopState;let runs={};try{let raw=JSON.parse(gopFs.readFileSync(gopFile,"utf8"));for(const[id,v]of Object.entries(raw&&raw.runs||{}))if(gopOk(id)&&Array.isArray(v))runs[id]=[...new Set(v.filter(gopOk))].slice(0,200)}catch(e){if(e&&e.code!=="ENOENT")process.stderr.write("[gf-outfit-pin] settings load failed; none pinned: "+e.message+"\\n")}return gopState={runs}}
function gopGet(runId){return gopLoad().runs[runId]||[]}
function gopSet(runId,ids){let st=gopLoad(),runs={...st.runs};if(ids.length)runs[runId]=ids;else delete runs[runId];let tmp=gopFile+".tmp";gopFs.writeFileSync(tmp,JSON.stringify({runs},null,2));gopFs.renameSync(tmp,gopFile);gopState={runs};return gopGet(runId)}
${PICK}`;

const EDITS = [
  // 의상 로테이션: 비어 있는 자리(Me)를 고정 캐릭터 먼저, 나머지는 무작위로 채울 후보 목록
  { old: 'Ue=Vp({candidates:ae.filter(je=>!ye.has(je.unitId)),offered:oe,themeKey:d,unitsById:re,count:Me});',
    new: 'Ue=gopPick(s,ae.filter(je=>!ye.has(je.unitId)),Me,(gopC,gopN)=>Vp({candidates:gopC,offered:oe,themeKey:d,unitsById:re,count:gopN}));' },
  // 설정 API: /api/gacha-forge/gf-outfit-pin/get, /api/gacha-forge/gf-outfit-pin/set
  { old: 's.post("/roster",', new: 's.post("/gf-outfit-pin/get",async p=>gopRoute(p,null)),s.post("/gf-outfit-pin/set",async p=>gopRoute(p,p&&p.body&&p.body.pinned)),s.post("/roster",' },
  { old: 'async function or(s){', new: 'async function gopRoute(p,want){let u=p&&p.body||{},o=l(u.runId);if(!o)return{ok:!1,error:"bad-request"};let{data:i}=await be(),meta=Ae(i,o);if(!meta)return{ok:!1,error:"bad-request"};let{candidates:C,byId:B}=await or(o),known=new Set(C.map(x=>x.unitId)),pinned=gopGet(o);if(want!==null){if(!Array.isArray(want)||want.length>200)return{ok:!1,error:"invalid-settings"};try{pinned=gopSet(o,[...new Set(want.filter(x=>gopOk(x)&&known.has(x)))])}catch(e){r.logger.error(e,"[gf-outfit-pin] save failed");return{ok:!1,error:"save-failed"}}}return{ok:!0,mode:"fill-random",run:{runId:o,name:String(meta.name||"").slice(0,100)},candidates:C.map(x=>{let d=B[x.unitId]||{};return{unitId:x.unitId,name:x.name,rarity:Number(d.rarity)||0,protagonist:!!d.isProtagonist}}),pinned:pinned.filter(x=>known.has(x)),perRotation:Math.min(rc(meta.images||{}),C.length)}}async function or(s){' },
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
      process.stderr.write(TAG + ' applied ' + EDITS.length + ' edits in memory (outfit pins: pinned first, rest random)\n');
      return { ...result, source: t.source, shortCircuit: true };
    } });
    process.stderr.write(TAG + ' hook registered (no package files changed)\n');
  }
}
module.exports = { applyEdits, TARGET, PICK };
