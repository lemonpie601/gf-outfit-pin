/* Gacha Forge · 의상 캐릭터 고정 v1.1.0 — 개인 확장 (Gacha Forge 1.27 / Marinara Engine 2.5.2).
 * 게임 설정 왼쪽 목록에 [의상 캐릭터]를 더하고, 지금 열려 있는 월드에서 상점 의상에 꼭 넣을 캐릭터를 고릅니다.
 * 로테이션당 의상 수는 게임 설정 그대로이고, 고른 캐릭터가 먼저 들어간 뒤 남은 자리는 나머지 보유 캐릭터 중 무작위입니다.
 * 아무도 고르지 않으면 게임 기본(보유 캐릭터 전체, 덜 받은 캐릭터부터)입니다.
 * 서버 쪽 훅(gf-outfit-pin-runtime.cjs)이 먼저 설치되어 있어야 합니다. */
(() => {
  "use strict";
  const KEY = "__GF_OUTFIT_PIN";
  if (typeof window[KEY] === "function") { try { window[KEY](); } catch {} }

  const INSTANCE = Math.random().toString(36).slice(2, 10);
  const HOST_TAG = "marinara-capability-gacha-forge";
  const API = "/api/gacha-forge/gf-outfit-pin";
  const life = new AbortController();
  const on = (t, type, fn, opts = {}) => t.addEventListener(type, fn, { ...opts, signal: life.signal });
  let disposed = false;

  const host = () => document.querySelector(HOST_TAG);
  const RUN_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
  const currentRunId = () => {
    const h = host();
    const id = String((h && ((h._run && h._run.runId) || h._activeRunId)) || "").trim();
    return RUN_ID_RE.test(id) ? id : "";
  };

  function headers() {
    const out = { "X-Marinara-CSRF": "1", "Content-Type": "application/json" };
    try { const s = window.localStorage.getItem("marinara_admin_secret")?.trim(); if (s) out["X-Admin-Secret"] = s; } catch {}
    return out;
  }
  const ERRORS = {
    "invalid-settings": "값이 올바르지 않습니다.",
    "save-failed": "서버에서 설정 파일을 쓰지 못했습니다.",
    "bad-request": "이 월드를 서버에서 찾지 못했습니다. 게임에서 월드를 다시 열어 주세요.",
  };
  async function callApi(path, body) {
    let res;
    try {
      res = await fetch(path, { method: "POST", credentials: "same-origin", headers: headers(), body: new TextEncoder().encode(JSON.stringify(body)) });
    } catch { throw Object.assign(Error("서버에 연결하지 못했습니다."), { code: "network" }); }
    let data = null;
    try { data = await res.json(); } catch {}
    if (res.status === 404) throw Object.assign(Error("서버에 의상 캐릭터 고정 훅이 없습니다. gf-outfit-pin-runtime.cjs를 NODE_OPTIONS에 넣고 마리나라를 다시 시작해 주세요."), { code: "missing" });
    if (res.status === 401 || res.status === 403) throw Object.assign(Error("서버 권한 확인에 실패했습니다."), { code: "auth" });
    if (!res.ok || !data) throw Object.assign(Error("서버 오류가 발생했습니다 (HTTP " + res.status + ")."), { code: "http" });
    if (!data.ok) throw Object.assign(Error(ERRORS[data.error] || data.message || data.error || "서버 오류가 발생했습니다."), { code: data.error || "error" });
    return data;
  }

  const CSS = `
.gop-view{display:flex;flex-direction:column;gap:var(--sp-2,10px);flex:1 1 auto;min-width:0;min-height:0}
.gop-view .st-plate{flex:0 1 auto;min-height:0;display:flex;flex-direction:column}
.gop-tools{display:flex;align-items:center;gap:var(--sp-2,10px);flex-wrap:wrap;margin-bottom:var(--sp-2,10px)}
.gop-search{flex:1 1 calc(var(--f,10px)*14);min-width:0;background:var(--ink-3,#1e2a40);border:1px solid var(--steel-dark,#34435e);color:var(--text,#e8ecf6);
  font-size:var(--t-sm,13px);padding:calc(var(--f,10px)*.35) calc(var(--f,10px)*.6);border-radius:var(--radius-sm,3px)}
.gop-search:focus{outline:none;border-color:var(--coral,#f2643c)}
.gop-count{font-size:var(--t-xs,12px);letter-spacing:.04em;color:var(--steel-faint,#7e93ae)}
.gop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(var(--f,10px)*13),1fr));gap:calc(var(--f,10px)*.5);overflow:auto;min-height:0}
.gop-chip{display:flex;align-items:center;gap:calc(var(--f,10px)*.5);padding:calc(var(--f,10px)*.45) calc(var(--f,10px)*.6);cursor:pointer;user-select:none;
  background:var(--ink-3,#1e2a40);border:1px solid var(--steel-dark,#34435e);border-radius:var(--radius-sm,3px);color:var(--text,#e8ecf6);font-size:var(--t-sm,13px)}
.gop-chip:hover{border-color:var(--steel,#5b6f8e)}
.gop-chip:has(input:checked){border-color:var(--coral,#f2643c);background:color-mix(in srgb,var(--coral,#f2643c) 18%,var(--ink-3,#1e2a40))}
.gop-chip:has(input:focus-visible){outline:2px solid var(--coral,#f2643c);outline-offset:1px}
.gop-chip input{accent-color:var(--coral,#f2643c);margin:0;flex:none}
.gop-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gop-r{flex:none;font-size:var(--t-tiny,11px);color:var(--amber,#e9b44c);letter-spacing:.02em}
.gop-empty{font-size:var(--t-xs,12px);color:var(--steel-faint,#7e93ae)}
.gop-note{font-size:var(--t-tiny,11px);letter-spacing:.04em;line-height:1.5;color:var(--steel-faint,#7e93ae);margin-top:var(--sp-2,10px)}
.gop-foot{display:flex;align-items:center;gap:var(--sp-2,10px);flex:none}
.gop-status{flex:1 1 auto;min-width:0;min-height:1.2em;font-size:var(--t-xs,12px);letter-spacing:.04em;color:var(--steel-faint,#7e93ae)}
.gop-status[data-tone="error"]{color:var(--alarm,#ff6b6b)}
.gop-status[data-tone="ok"]{color:var(--jade,#3cc9a0)}
.gop-foot .st-compress.-go:not([disabled]){background:var(--coral,#f2643c);color:var(--on-coral,#fff)}
`;
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false && kid !== "") n.append(kid);
    return n;
  };
  const setStatus = (n, text, tone = "") => { n.textContent = text || ""; if (tone) n.dataset.tone = tone; else delete n.dataset.tone; };
  const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

  function createView() {
    const root = h("div", { class: "gop-view", "data-gop-view": INSTANCE });
    root.append(h("style", { text: CSS }));
    const world = h("span", { class: "k" });
    const search = h("input", { class: "gop-search", type: "search", placeholder: "이름 검색", "aria-label": "캐릭터 이름 검색" });
    const countEl = h("span", { class: "gop-count" });
    const clear = h("button", { class: "st-compress -ghost", type: "button", text: "모두 해제" });
    const grid = h("div", { class: "gop-grid", role: "group", "aria-label": "의상에 고정할 캐릭터" });
    const status = h("div", { class: "gop-status", role: "status" });
    const revert = h("button", { class: "st-compress -ghost", type: "button", text: "되돌리기" });
    const save = h("button", { class: "st-compress -go", type: "button", text: "이 월드에 적용" });
    root.append(
      h("div", { class: "st-plate" },
        h("div", { class: "hd" }, h("h3", { text: "의상 고정 캐릭터" }), world),
        h("div", { class: "gop-tools" }, search, countEl, clear),
        grid,
        h("div", { class: "gop-note", text: "로테이션당 의상 수는 게임 설정(이미지 → 로테이션당 의상 수) 그대로입니다. 고른 캐릭터가 먼저 들어가고, 남은 자리는 나머지 보유 캐릭터 중에서 무작위로 채웁니다. 고른 인원이 의상 수보다 많으면 고른 캐릭터 중 이전에 덜 받은 캐릭터부터 들어갑니다. 아무도 고르지 않으면 게임 기본입니다. 이미 다 채워진 이번 로테이션은 그대로이고, 다음 로테이션부터 반영됩니다." })),
      h("div", { class: "gop-foot" }, status, revert, save),
    );
    let server = null, loadedFor = "", busy = false, list = [], picked = new Set(), perRotation = 0;
    function refresh() {
      const n = picked.size;
      countEl.textContent = !server ? "" : !n ? "선택 없음 · 게임 기본" : !perRotation ? n + "명 고정" : n >= perRotation ? n + "명 고정 · 로테이션당 " + perRotation + "벌 모두 고정 캐릭터" : n + "명 고정 + " + (perRotation - n) + "명 무작위 · 로테이션당 " + perRotation + "벌";
      for (const input of grid.querySelectorAll("input")) input.disabled = busy;
      search.disabled = clear.disabled = !server || busy;
      clear.disabled = clear.disabled || !n;
      const dirty = !!server && !sameSet(picked, server);
      save.disabled = busy || !dirty || !loadedFor || loadedFor !== currentRunId();
      revert.disabled = busy || !dirty;
    }
    function render() {
      grid.textContent = "";
      const q = search.value.trim().toLowerCase();
      const shown = list.filter((c) => !q || c.name.toLowerCase().includes(q));
      if (!shown.length) grid.append(h("div", { class: "gop-empty", text: list.length ? "검색 결과가 없습니다." : server ? "보유한 캐릭터가 없습니다." : "" }));
      for (const c of shown) {
        const input = h("input", { type: "checkbox" });
        input.checked = picked.has(c.unitId);
        input.addEventListener("change", () => { if (input.checked) picked.add(c.unitId); else picked.delete(c.unitId); setStatus(status, ""); refresh(); });
        grid.append(h("label", { class: "gop-chip", title: c.name },
          input,
          h("span", { class: "gop-name", text: c.name }),
          c.protagonist ? h("span", { class: "gop-r", text: "주인공" }) : c.rarity ? h("span", { class: "gop-r", text: c.rarity + "★" }) : null));
      }
      refresh();
    }
    function fill(d) {
      list = (d.candidates || []).slice().sort((a, b) => (b.protagonist - a.protagonist) || (b.rarity - a.rarity) || a.name.localeCompare(b.name, "ko"));
      server = new Set(d.pinned || []);
      picked = new Set(server);
      perRotation = Number(d.perRotation) || 0;
      world.textContent = "이 월드만 · " + ((d.run && d.run.name) || (loadedFor ? "ID " + loadedFor.slice(0, 12) : ""));
      render();
    }
    search.addEventListener("input", render);
    clear.onclick = () => { picked.clear(); setStatus(status, ""); render(); };
    revert.onclick = () => { if (server) picked = new Set(server); setStatus(status, ""); render(); };
    async function load() {
      const rid = currentRunId();
      if (!rid) { server = null; loadedFor = ""; list = []; world.textContent = ""; setStatus(status, "월드를 확인하지 못했습니다. 게임에서 월드를 연 뒤 다시 눌러 주세요.", "error"); return render(); }
      if (busy) return;
      busy = true; refresh(); setStatus(status, "불러오는 중입니다…");
      try {
        const d = await callApi(API + "/get", { runId: rid });
        if (disposed) return;
        loadedFor = rid; fill(d); setStatus(status, "");
      } catch (e) { server = null; loadedFor = ""; list = []; render(); setStatus(status, e.message, "error"); }
      finally { busy = false; refresh(); }
    }
    save.onclick = async () => {
      if (busy || save.disabled) return;
      busy = true; refresh(); setStatus(status, "저장하는 중입니다…");
      try {
        const d = await callApi(API + "/set", { runId: loadedFor, pinned: [...picked] });
        fill(d);
        setStatus(status, picked.size ? "저장했습니다. 다음 의상 로테이션부터 고른 캐릭터가 먼저 들어가고 남은 자리는 무작위입니다." : "저장했습니다. 게임 기본으로 돌아갔습니다.", "ok");
      } catch (e) { setStatus(status, "저장하지 못했습니다. " + e.message, "error"); }
      finally { busy = false; refresh(); }
    };
    render();
    const dirty = () => !!server && !sameSet(picked, server);
    return { root, title: "의상 캐릭터", opened() { if (!server || !dirty() || loadedFor !== currentRunId()) load(); } };
  }

  /* ═════ Mount into the game's Settings rail as its own section ═════ */
  const view = createView();
  let active = null, hiddenKids = [], deselected = [], titleSwap = null, wanted = false, scheduled = false, observer = null, observed = null;
  const boundRails = new WeakSet();
  const roots = () => { const r = []; for (const el of document.querySelectorAll(HOST_TAG)) if (el.shadowRoot) r.push(el.shadowRoot); r.push(document); return r; };
  function findScreen() {
    for (const r of roots()) for (const s of r.querySelectorAll('[data-screen="settings"]')) if (s.isConnected && s.getClientRects().length) return s;
    return null;
  }
  function restore() {
    for (const [n, value, prio] of hiddenKids) if (n.isConnected) n.style.setProperty("display", value, prio);
    hiddenKids = [];
    for (const n of deselected) if (n.isConnected) n.setAttribute("aria-selected", "true");
    deselected = [];
    if (titleSwap && titleSwap.el.isConnected) titleSwap.el.textContent = titleSwap.text;
    titleSwap = null;
    if (active) { view.root.remove(); if (active.tab.isConnected) active.tab.setAttribute("aria-selected", "false"); }
    active = null;
  }
  function show(screen, rail, pane, tab) {
    if (!(active && active.pane === pane && view.root.parentNode === pane)) {
      restore();
      for (const n of Array.from(pane.children)) {
        if (n === view.root) continue;
        hiddenKids.push([n, n.style.getPropertyValue("display"), n.style.getPropertyPriority("display")]);
        n.style.setProperty("display", "none", "important");
      }
      pane.append(view.root);
      active = { pane, tab };
      view.opened();
    }
    for (const n of rail.children) {
      if (n === tab || n.getAttribute("aria-selected") !== "true") continue;
      n.setAttribute("aria-selected", "false");
      if (!deselected.includes(n)) deselected.push(n);
    }
    tab.setAttribute("aria-selected", "true");
    const h2 = screen.querySelector(".head-id h2") || screen.getRootNode().querySelector?.(".head-id h2");
    if (h2 && h2.textContent !== view.title) { if (!titleSwap || titleSwap.el !== h2) titleSwap = { el: h2, text: h2.textContent }; h2.textContent = view.title; }
  }
  function mount() {
    if (disposed) return;
    ensureObserver();
    const screen = findScreen();
    if (!screen) { restore(); wanted = false; return; }
    const rail = screen.querySelector(".st-rail"), pane = screen.querySelector(".st-pane");
    if (!rail || !pane) return;
    for (const stale of rail.querySelectorAll("[data-gf-outfit-pin-tab]")) if (stale.getAttribute("data-gf-outfit-pin-tab") !== INSTANCE) stale.remove();
    let tab = rail.querySelector('[data-gf-outfit-pin-tab="' + INSTANCE + '"]');
    if (!tab) {
      tab = h("button", { class: "st-sect", type: "button", role: "tab", "aria-selected": "false", "data-gf-outfit-pin-tab": INSTANCE }, h("span", { class: "k", text: "Gacha" }), h("span", { class: "n", text: "의상 캐릭터" }));
      on(tab, "click", (e) => { e.preventDefault(); e.stopPropagation(); if (disposed) return; wanted = true; mount(); });
      const after = rail.querySelector("[data-gf-featured-tab]") || rail.querySelector("[data-gf-customizer-tab]");
      if (after && after.nextSibling) rail.insertBefore(tab, after.nextSibling); else rail.append(tab);
    }
    if (!boundRails.has(rail)) {
      boundRails.add(rail);
      on(rail, "click", (e) => { if (disposed || e.target.closest?.("[data-gf-outfit-pin-tab]")) return; if (wanted) { wanted = false; restore(); } }, { capture: true });
    }
    if (!wanted) { if (active) restore(); return; }
    show(screen, rail, pane, tab);
  }
  function schedule() { if (disposed || scheduled) return; scheduled = true; setTimeout(() => { scheduled = false; mount(); }, 80); }
  function ensureObserver() {
    const el = document.querySelector(HOST_TAG);
    const next = el?.shadowRoot || document.body;
    if (!next || (next === observed && observer)) return;
    observer?.disconnect();
    observed = next;
    observer = new MutationObserver((recs) => { if (disposed) return; for (const r of recs) { if (active && view.root.contains(r.target)) continue; return schedule(); } });
    observer.observe(observed, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-screen", "style", "hidden"] });
    if (observed !== document.body && document.body) observer.observe(document.body, { childList: true });
  }
  if (document.readyState === "loading") on(document, "DOMContentLoaded", mount, { once: true }); else mount();
  on(window, "hashchange", schedule);
  on(window, "popstate", schedule);
  const interval = setInterval(() => {
    if (disposed) return;
    if (!observed || !observed.isConnected || (observed === document.body && document.querySelector(HOST_TAG)?.shadowRoot)) { observer?.disconnect(); observer = null; observed = null; schedule(); }
  }, 5000);
  window[KEY] = () => {
    if (disposed) return;
    disposed = true; life.abort(); clearInterval(interval); observer?.disconnect(); restore();
    for (const r of roots()) for (const t of r.querySelectorAll("[data-gf-outfit-pin-tab]")) t.remove();
    view.root.remove();
    if (window[KEY]) delete window[KEY];
  };
})();
