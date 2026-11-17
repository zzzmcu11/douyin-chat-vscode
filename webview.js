'use strict';
/** Webview 页面：canvas 显示画面，捕获输入并转发给插件 */

function getHtml(nonce, cspSource, layout) {
  const L = JSON.stringify(layout || { mobile: false, phoneWidth: 400 });
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: var(--vscode-sideBar-background, var(--vscode-editor-background, #1e1e1e));
               font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  #phone { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; background: #e6e7ed; overflow: hidden;
           box-shadow: 0 0 0 1px rgba(128,128,128,.25), 0 4px 24px rgba(0,0,0,.25); }
  #bar { position: absolute; top: 0; left: 0; right: 0; height: 30px; display: flex; align-items: center; gap: 2px; padding: 0 6px 0 12px; box-sizing: border-box;
         background: #f4f4f7; color: #333; border-bottom: 1px solid #dcdde3; font-size: 12px; user-select: none; }
  #accBtn { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 70%; padding: 2px 6px 2px 2px !important; margin-left: -6px; }
  #accName { font-weight: 600; font-size: 12px; color: #222; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .caret { font-size: 9px; color: #888; }
  .spacer { flex: 1; }
  .av { flex: none; border-radius: 50%; background: #c7c9d3; color: #fff; font-weight: 600; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .av img { width: 100%; height: 100%; object-fit: cover; }
  #accAv { width: 20px; height: 20px; font-size: 11px; }
  #mask { position: absolute; inset: 0; background: rgba(0,0,0,.35); z-index: 10; opacity: 0; pointer-events: none; transition: opacity .2s; }
  #mask.open { opacity: 1; pointer-events: auto; }
  #sheet { position: absolute; left: 0; right: 0; bottom: 0; background: #fff; border-radius: 14px 14px 0 0; z-index: 11; color: #161823;
           transform: translateY(100%); transition: transform .22s ease-out; max-height: 75%; display: flex; flex-direction: column; }
  #sheet.open { transform: none; }
  .sh-title { text-align: center; font-weight: 600; font-size: 15px; padding: 16px 0 10px; }
  #accList { overflow-y: auto; }
  .acc { display: flex; align-items: center; gap: 12px; padding: 10px 20px; cursor: pointer; }
  .acc:hover { background: #f4f4f7; }
  .acc .av { width: 42px; height: 42px; font-size: 17px; }
  .acc .nm { flex: 1; font-size: 14px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .acc .ck { color: #fe2c55; font-size: 18px; font-weight: 700; }
  .acc .rm { visibility: hidden; color: #999; font-size: 12px; border: 0; background: none; cursor: pointer; padding: 4px 6px; }
  .acc:hover .rm { visibility: visible; }
  .acc .rm:hover { color: #fe2c55; }
  .acc.add .av { background: #f0f1f4; color: #555; font-size: 24px; font-weight: 400; }
  .sh-cancel { border-top: 8px solid #f2f2f5; text-align: center; padding: 13px 0; cursor: pointer; font-size: 14px; }
  .sh-cancel:hover { background: #f8f8fa; }
  #ctx { position: absolute; z-index: 20; background: #fff; border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06);
         padding: 4px 0; min-width: 140px; display: none; font-size: 13px; color: #161823; }
  #ctx.open { display: block; }
  #ctx .ttl { padding: 6px 14px 4px; color: #999; font-size: 12px; max-width: 200px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  #ctx .it { padding: 8px 14px; cursor: pointer; }
  #ctx .it:hover { background: #f4f4f7; }
  #ctx .danger { color: #fe2c55; }
  #fontPanel { position: absolute; top: 34px; right: 6px; z-index: 12; width: 240px; background: #fff; color: #161823; border-radius: 10px;
               box-shadow: 0 8px 28px rgba(0,0,0,.2), 0 0 0 1px rgba(0,0,0,.06); padding: 12px 14px 14px; display: none; font-size: 13px; }
  #fontPanel.open { display: block; }
  #fontPanel h4 { margin: 0 0 8px; font-size: 13px; }
  #fontPanel select { width: 100%; padding: 5px 6px; border: 1px solid #d5d6dc; border-radius: 6px; font-size: 13px; background: #fff; color: #161823; }
  .fs-row { display: flex; align-items: center; gap: 8px; margin-top: 14px; white-space: nowrap; }
  .fs-row input { min-width: 0; }
  .fs-row button { border: 1px solid #d5d6dc !important; background: #fff !important; border-radius: 6px; width: 28px; height: 26px; cursor: pointer; color: #333 !important; padding: 0 !important; }
  .fs-row input { flex: 1; }
  #fsVal { width: 40px; text-align: right; color: #555; }
  #fontPreview { margin-top: 10px; padding: 8px; background: #f4f4f7; border-radius: 6px; line-height: 1.5; }
  .fp-foot { display: flex; justify-content: space-between; margin-top: 12px; }
  .fp-foot a { color: #888; cursor: pointer; font-size: 12px; }
  .fp-foot a:hover { color: #fe2c55; }
  #bar button { background: transparent; border: none; color: #555; cursor: pointer; padding: 3px 7px; border-radius: 6px; font-size: 14px; line-height: 1; }
  #bar button:hover { background: rgba(0,0,0,.07); }
  #view { position: absolute; top: 30px; left: 0; right: 0; bottom: 0; overflow: hidden; }
  canvas { display: block; outline: none; cursor: default; }
  #ime { position: absolute; left: 0; top: 0; width: 2px; height: 20px; opacity: 0; border: 0; padding: 0; margin: 0; resize: none; overflow: hidden; z-index: 2; font-size: 14px; }
  #overlay { position: absolute; inset: 30px 0 0 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
             background: #e6e7ed; color: #333; font-size: 14px; z-index: 3; text-align: center; padding: 20px; }
  #overlay.hidden { display: none; }
  #overlay button { padding: 6px 16px; border-radius: 4px; border: 1px solid #999; background: #fff; cursor: pointer; }
</style>
</head>
<body>
<div id="phone">
<div id="bar">
  <button id="accBtn" title="切换账号"><span id="accAv" class="av"></span><span id="accName">抖音私信</span><span class="caret">▼</span></button>
  <span class="spacer"></span>
  <button id="fontBtn" title="字体与字号" style="font-size:12px;font-weight:600">Aa</button>
  <button id="home" title="回到私信首页">⌂</button>
  <button id="reload" title="刷新（F5）">⟳</button>
  <button id="theme" title="切换浅色背景">◐</button>
</div>
<div id="view">
  <canvas id="cv" tabindex="-1"></canvas>
  <textarea id="ime" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
</div>
<div id="overlay"><div id="msg">正在启动浏览器…</div><button id="retry" style="display:none">重试</button></div>
<div id="ctx"><div class="ttl" id="ctxTitle"></div><div class="it" id="ctxOpen">打开会话</div><div class="it danger" id="ctxDel">删除会话</div></div>
<div id="fontPanel">
  <h4>字体</h4>
  <select id="fontSel">
    <option value="">默认（跟随抖音）</option>
    <option value='"Microsoft YaHei", "微软雅黑", sans-serif'>微软雅黑</option>
    <option value='"PingFang SC", "苹方-简", sans-serif'>苹方</option>
    <option value='"Source Han Sans SC", "Noto Sans CJK SC", "Noto Sans SC", "思源黑体", sans-serif'>思源黑体</option>
    <option value='"HarmonyOS Sans SC", "HarmonyOS Sans", sans-serif'>鸿蒙黑体</option>
    <option value='"LXGW WenKai", "霞鹜文楷", "KaiTi", serif'>霞鹜文楷</option>
    <option value='"KaiTi", "楷体", "STKaiti", serif'>楷体</option>
    <option value='"SimSun", "宋体", "STSong", serif'>宋体</option>
    <option value='"Segoe UI", "Microsoft YaHei", sans-serif'>Segoe UI</option>
    <option value="__custom">自定义…（在设置中填写）</option>
  </select>
  <div class="fs-row"><span>字号</span><button id="fsDec">A-</button><input type="range" id="fsRange" min="80" max="160" step="5" value="100"><button id="fsInc">A+</button><span id="fsVal">100%</span></div>
  <div id="fontPreview">你好，这是字体预览 Aa 123</div>
  <div class="fp-foot"><a id="fontReset">恢复默认</a><a id="fontClose">完成</a></div>
</div>
<div id="mask"></div>
<div id="sheet">
  <div class="sh-title">切换账号</div>
  <div id="accList"></div>
  <div class="sh-cancel" id="shCancel">取消</div>
</div>
</div>

<script nonce="${nonce}">
(() => {
  const vscode = acquireVsCodeApi();
  const post = m => vscode.postMessage(m);
  const view = document.getElementById('view');
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const ime = document.getElementById('ime');
  const overlay = document.getElementById('overlay');
  const msgEl = document.getElementById('msg');
  const retry = document.getElementById('retry');
  const phone = document.getElementById('phone');
  const applyLayout = l => { phone.style.width = l && l.mobile ? 'min(100%, ' + (l.phoneWidth || 400) + 'px)' : '100%'; };
  applyLayout(${L});

  let meta = { deviceWidth: 1, deviceHeight: 1 };
  let pending = null, busy = false, pressed = 0;

  // ---------- 画面 ----------
  function drawNext() {
    if (!pending) { busy = false; return; }
    busy = true;
    const m = pending; pending = null;
    const img = new Image();
    img.onload = () => {
      if (cv.width !== img.width || cv.height !== img.height) { cv.width = img.width; cv.height = img.height; }
      meta = m.meta || meta;
      cv.style.width = meta.deviceWidth + 'px';
      cv.style.height = meta.deviceHeight + 'px';
      ctx.drawImage(img, 0, 0);
      post({ type: 'drawn' });
      drawNext();
    };
    img.onerror = () => { post({ type: 'drawn' }); drawNext(); };
    img.src = 'data:image/' + m.format + ';base64,' + m.data;
  }

  // ---------- 尺寸 ----------
  let resizeTimer = null;
  function sizeMsg(type) {
    const r = view.getBoundingClientRect();
    return { type, w: Math.max(200, Math.floor(r.width)), h: Math.max(200, Math.floor(r.height)), dpr: window.devicePixelRatio || 1 };
  }
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => post(sizeMsg('resize')), 150);
  }).observe(view);

  // ---------- 鼠标 ----------
  function mods(e) { return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0); }
  function pos(e) {
    const r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / (r.width || 1) * meta.deviceWidth,
      y: (e.clientY - r.top) / (r.height || 1) * meta.deviceHeight,
    };
  }
  const BTN = ['left', 'middle', 'right', 'back', 'forward'];
  function mouse(evType, e, extra) {
    const p = pos(e);
    post(Object.assign({ type: 'mouse', evType, x: p.x, y: p.y, modifiers: mods(e),
      button: evType === 'mouseMoved' ? (e.buttons & 1 ? 'left' : e.buttons & 4 ? 'middle' : e.buttons & 2 ? 'right' : 'none') : (BTN[e.button] || 'none'),
      buttons: e.buttons, clickCount: e.detail || 1 }, extra || {}));
  }
  cv.addEventListener('mousedown', e => {
    e.preventDefault();
    hideCtx(); hideFont();
    if (e.button === 2) return;   // 右键由 contextmenu 处理
    const r = view.getBoundingClientRect();
    ime.style.left = (e.clientX - r.left) + 'px';
    ime.style.top = (e.clientY - r.top) + 'px';
    ime.focus({ preventScroll: true });
    pressed++;
    mouse('mousePressed', e);
  });
  window.addEventListener('mouseup', e => { if (pressed > 0) { pressed--; mouse('mouseReleased', e); } });
  let moveEv = null;
  cv.addEventListener('mousemove', e => {
    if (!moveEv) requestAnimationFrame(() => { if (moveEv) mouse('mouseMoved', moveEv); moveEv = null; });
    moveEv = e;
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
    const p = pos(e);
    post({ type: 'mouse', evType: 'mouseWheel', x: p.x, y: p.y, deltaX: e.deltaX * k, deltaY: e.deltaY * k, modifiers: mods(e), button: 'none' });
  }, { passive: false });
  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    const p = pos(e), r = phone.getBoundingClientRect();
    post({ type: 'contextmenu', x: p.x, y: p.y, cx: e.clientX - r.left, cy: e.clientY - r.top, modifiers: mods(e) });
  });

  // ---------- 键盘 / 输入法 ----------
  const SPECIAL = { Enter: 13, Backspace: 8, Tab: 9, Delete: 46, Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
                    Home: 36, End: 35, PageUp: 33, PageDown: 34, F5: 116 };
  const down = new Set();
  let composing = false;
  let pasteGot = false;

  function key(evType, e, extra) {
    post(Object.assign({ type: 'key', evType, key: e.key, code: e.code, keyCode: e.keyCode || SPECIAL[e.key] || 0,
      modifiers: mods(e), autoRepeat: !!e.repeat, location: e.location || 0 }, extra || {}));
  }

  ime.addEventListener('compositionstart', () => { composing = true; });
  ime.addEventListener('compositionend', e => {
    composing = false;
    if (e.data) post({ type: 'text', text: e.data });
    ime.value = '';
  });
  ime.addEventListener('input', e => {
    if (composing || e.isComposing) return;
    if (e.inputType === 'insertFromPaste') { ime.value = ''; return; }
    const v = ime.value;
    ime.value = '';
    if (v) post({ type: 'text', text: v });
  });

  ime.addEventListener('keydown', e => {
    if (composing || e.isComposing || e.keyCode === 229) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'v') {
        pasteGot = false;
        setTimeout(() => { if (!pasteGot) post({ type: 'pasteFallback' }); }, 200);
        return; // 让浏览器触发 paste 事件
      }
      const cmd = { a: 'selectAll', c: 'copy', x: 'cut', z: e.shiftKey ? 'redo' : 'undo', y: 'redo' }[k];
      if (cmd) {
        e.preventDefault();
        if (cmd === 'copy' || cmd === 'cut') post({ type: 'copy' });
        key(e.key.length === 1 ? 'keyDown' : 'rawKeyDown', e, { commands: [cmd] });
        key('keyUp', e);
        return;
      }
      if (k.length === 1 || SPECIAL[e.key]) {
        e.preventDefault();
        key('rawKeyDown', e); down.add(e.code);
        return;
      }
      return;
    }
    if (SPECIAL[e.key]) {
      if (e.key === 'F5') { e.preventDefault(); post({ type: 'nav', action: 'reload' }); return; }
      e.preventDefault();
      key(e.key === 'Enter' ? 'keyDown' : 'rawKeyDown', e, e.key === 'Enter' ? { text: '\\r', unmodifiedText: '\\r' } : {});
      down.add(e.code);
    }
  });
  ime.addEventListener('keyup', e => {
    if (down.has(e.code)) { down.delete(e.code); key('keyUp', e); }
  });

  ime.addEventListener('paste', e => {
    pasteGot = true;
    e.preventDefault();
    const cd = e.clipboardData;
    if (!cd) return;
    const files = Array.from(cd.files || []).filter(f => f.size > 0);
    if (files.length) {
      Promise.all(files.map(f => new Promise(res => {
        const fr = new FileReader();
        fr.onload = () => res({ name: f.name, type: f.type, data: String(fr.result).split(',')[1] || '' });
        fr.onerror = () => res(null);
        fr.readAsDataURL(f);
      }))).then(list => post({ type: 'pasteFiles', files: list.filter(Boolean) }));
      return;
    }
    const t = cd.getData('text/plain');
    if (t) post({ type: 'text', text: t });
  });

  // ---------- 账号 ----------
  const mask = document.getElementById('mask'), sheet = document.getElementById('sheet'), accList = document.getElementById('accList');
  let accounts = [], sheetOpen = false;
  const COLORS = ['#fe2c55', '#25c4ee', '#7a5af8', '#f59e0b', '#10b981', '#3b82f6'];
  function avatar(a, cls) {
    const d = document.createElement('span');
    d.className = 'av' + (cls ? ' ' + cls : '');
    if (a.avatar) { const i = document.createElement('img'); i.src = a.avatar; d.appendChild(i); }
    else {
      let h = 0; for (const c of a.name || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
      d.style.background = COLORS[h % COLORS.length];
      d.textContent = (a.name || '?').replace(/^账号\\s*/, '').slice(0, 1) || '?';
    }
    return d;
  }
  function renderAccounts() {
    const cur = accounts.find(a => a.current) || accounts[0];
    const accAv = document.getElementById('accAv');
    accAv.replaceWith(Object.assign(avatar(cur || { name: '抖' }), { id: 'accAv' }));
    document.getElementById('accName').textContent = cur ? cur.name : '抖音私信';
    accList.innerHTML = '';
    for (const a of accounts) {
      const row = document.createElement('div');
      row.className = 'acc';
      row.appendChild(avatar(a));
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = a.name; row.appendChild(nm);
      if (a.current) { const ck = document.createElement('span'); ck.className = 'ck'; ck.textContent = '✓'; row.appendChild(ck); }
      else if (accounts.length > 1) {
        const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '移除';
        rm.onclick = e => { e.stopPropagation(); closeSheet(); post({ type: 'removeAccount', id: a.id }); };
        row.appendChild(rm);
      }
      row.onclick = () => { closeSheet(); if (!a.current) post({ type: 'switchAccount', id: a.id }); };
      accList.appendChild(row);
    }
    const add = document.createElement('div');
    add.className = 'acc add';
    const av = document.createElement('span'); av.className = 'av'; av.textContent = '+'; add.appendChild(av);
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = '添加账号'; add.appendChild(nm);
    add.onclick = () => { closeSheet(); post({ type: 'addAccount' }); };
    accList.appendChild(add);
  }
  function openSheet() { sheetOpen = true; mask.classList.add('open'); sheet.classList.add('open'); }
  function closeSheet() { sheetOpen = false; mask.classList.remove('open'); sheet.classList.remove('open'); ime.focus({ preventScroll: true }); }
  document.getElementById('accBtn').onclick = () => { if (sheetOpen) closeSheet(); else { renderAccounts(); openSheet(); post({ type: 'showAccounts' }); } };
  mask.onclick = closeSheet;
  document.getElementById('shCancel').onclick = closeSheet;
  window.addEventListener('keydown', e => { if (sheetOpen && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSheet(); } }, true);

  // ---------- 右键菜单 ----------
  const ctxEl = document.getElementById('ctx');
  let ctxInfo = null;
  function showCtx(m) {
    ctxInfo = m;
    document.getElementById('ctxTitle').textContent = m.name || '会话';
    ctxEl.classList.add('open');
    const pr = phone.getBoundingClientRect();
    const w = ctxEl.offsetWidth, h = ctxEl.offsetHeight;
    ctxEl.style.left = Math.max(4, Math.min(m.cx, pr.width - w - 4)) + 'px';
    ctxEl.style.top = Math.max(34, Math.min(m.cy, pr.height - h - 4)) + 'px';
  }
  function hideCtx() { ctxEl.classList.remove('open'); ctxInfo = null; }
  document.getElementById('ctxDel').onclick = () => { const m = ctxInfo; hideCtx(); if (m) post({ type: 'deleteConversation', name: m.name }); ime.focus({ preventScroll: true }); };
  document.getElementById('ctxOpen').onclick = () => { const m = ctxInfo; hideCtx(); if (m) { post({ type: 'mouse', evType: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 0 }); post({ type: 'mouse', evType: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 1, modifiers: 0 }); } ime.focus({ preventScroll: true }); };
  cv.addEventListener('wheel', () => hideCtx(), { passive: true });

  // ---------- 字体面板 ----------
  const fontPanel = document.getElementById('fontPanel'), fontSel = document.getElementById('fontSel');
  const fsRange = document.getElementById('fsRange'), fsVal = document.getElementById('fsVal'), fontPreview = document.getElementById('fontPreview');
  let font = { family: '', scale: 1 }, fontTimer = null;
  function renderFont() {
    const opt = Array.from(fontSel.options).find(o => o.value === font.family);
    if (opt) fontSel.value = font.family;
    else if (font.family) {
      let c = fontSel.querySelector('option[data-cur]');
      if (!c) { c = document.createElement('option'); c.dataset.cur = '1'; fontSel.insertBefore(c, fontSel.lastElementChild); }
      c.value = font.family; c.textContent = '自定义：' + font.family.slice(0, 24); fontSel.value = font.family;
    } else fontSel.value = '';
    fsRange.value = Math.round(font.scale * 100);
    fsVal.textContent = fsRange.value + '%';
    fontPreview.style.fontFamily = font.family || 'inherit';
    fontPreview.style.fontSize = (13 * font.scale) + 'px';
  }
  function sendFont() { clearTimeout(fontTimer); fontTimer = setTimeout(() => post({ type: 'setFont', family: font.family, scale: font.scale }), 200); }
  fontSel.onchange = () => {
    if (fontSel.value === '__custom') { post({ type: 'openFontSettings' }); renderFont(); return; }
    font.family = fontSel.value; renderFont(); sendFont();
  };
  const setScale = v => { font.scale = Math.max(0.8, Math.min(1.6, Math.round(v * 20) / 20)); renderFont(); sendFont(); };
  fsRange.oninput = () => setScale(fsRange.value / 100);
  document.getElementById('fsDec').onclick = () => setScale(font.scale - 0.05);
  document.getElementById('fsInc').onclick = () => setScale(font.scale + 0.05);
  document.getElementById('fontReset').onclick = () => { font = { family: '', scale: 1 }; renderFont(); sendFont(); };
  function hideFont() { fontPanel.classList.remove('open'); }
  document.getElementById('fontClose').onclick = () => { hideFont(); ime.focus({ preventScroll: true }); };
  document.getElementById('fontBtn').onclick = e => { e.stopPropagation(); hideCtx(); renderFont(); fontPanel.classList.toggle('open'); };
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (ctxEl.classList.contains('open') || fontPanel.classList.contains('open'))) { e.preventDefault(); e.stopPropagation(); hideCtx(); hideFont(); }
  }, true);
  document.addEventListener('mousedown', e => {
    if (!ctxEl.contains(e.target)) hideCtx();
    if (!fontPanel.contains(e.target) && e.target.id !== 'fontBtn') hideFont();
  }, true);

  // ---------- 工具栏 ----------
  const nav = action => () => { post({ type: 'nav', action }); ime.focus({ preventScroll: true }); };
  document.getElementById('reload').onclick = nav('reload');
  document.getElementById('home').onclick = nav('home');
  document.getElementById('theme').onclick = () => post({ type: 'toggleTheme' });
  retry.onclick = () => { retry.style.display = 'none'; msgEl.textContent = '正在启动浏览器…'; post(sizeMsg('retry')); };

  // ---------- 来自插件的消息 ----------
  window.addEventListener('message', ev => {
    const m = ev.data || {};
    switch (m.type) {
      case 'frame':
        pending = m;
        if (overlay.classList.contains('hidden') === false && m.data) overlay.classList.add('hidden');
        if (!busy) drawNext();
        break;
      case 'status':
        msgEl.textContent = m.text; retry.style.display = 'none'; overlay.classList.remove('hidden');
        break;
      case 'error':
        msgEl.textContent = m.text; retry.style.display = m.retry ? '' : 'none'; overlay.classList.remove('hidden');
        break;
      case 'ready':
        overlay.classList.add('hidden');
        break;
      case 'url':
        break;
      case 'accounts':
        accounts = m.list || [];
        renderAccounts();
        if (m.open && !sheetOpen) openSheet();
        break;
      case 'ctxmenu':
        showCtx(m);
        break;
      case 'font':
        font = { family: m.family || '', scale: Number(m.scale) || 1 };
        renderFont();
        break;
      case 'layout':
        applyLayout(m.layout);
        break;
      case 'focus':
        ime.focus({ preventScroll: true });
        break;
    }
  });

  window.addEventListener('focus', () => ime.focus({ preventScroll: true }));
  post(sizeMsg('ready'));
})();
</script>
</body>
</html>`;
}

module.exports = { getHtml };
