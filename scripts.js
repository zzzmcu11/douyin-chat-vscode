'use strict';
/** 注入到页面中执行的脚本 */

/** 浅色主题：把深色背景替换为指定颜色，把浅色文字替换为深色 */
function themeScript({ bg, text, threshold }) {
  return `(() => {
  if (window.__dyLightTheme) return;
  window.__dyLightTheme = true;
  const BG = ${JSON.stringify(bg)}, TEXT = ${JSON.stringify(text)}, TH = ${Number(threshold) || 90};
  const parse = c => {
    const m = c && c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  const fix = el => {
    if (!(el instanceof Element) || el.__dyFixed) return;
    el.__dyFixed = true;
    if (/^(IMG|VIDEO|CANVAS|SVG|PATH|PICTURE|IFRAME)$/i.test(el.tagName)) return;
    const s = getComputedStyle(el);
    const b = parse(s.backgroundColor);
    const gray = c => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 40;
    if (b && b.a > 0.3 && lum(b) < TH && gray(b)) el.style.setProperty('background-color', BG, 'important');
    const f = parse(s.color);
    if (f && lum(f) > 170) el.style.setProperty('color', TEXT, 'important');
  };
  const run = root => { fix(root); root.querySelectorAll && root.querySelectorAll('*').forEach(fix); };
  const start = () => {
    document.documentElement.style.setProperty('background-color', BG, 'important');
    document.documentElement.style.setProperty('color-scheme', 'light');
    if (document.body) { document.body.style.setProperty('background-color', BG, 'important'); run(document.body); }
    new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'childList') m.addedNodes.forEach(n => n.nodeType === 1 && run(n));
        else if (m.type === 'attributes' && m.target.__dyFixed) { m.target.__dyFixed = false; fix(m.target); }
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();`;
}

/** 读取未读数：自定义选择器 > 会话列表中的红色数字角标之和 > 页面标题里的 "(N)" */
function unreadScript(selector) {
  return `(() => {
  const sel = ${JSON.stringify(selector || '')};
  const num = t => { const m = String(t || '').trim().match(/^(\\d{1,4})\\+?$/); return m ? parseInt(m[1], 10) : NaN; };
  if (sel) {
    let n = 0;
    try { document.querySelectorAll(sel).forEach(e => { const v = num(e.textContent); if (!isNaN(v)) n += v; }); } catch (e) {}
    return n;
  }
  const scope = document.querySelector('[data-dy-m="list"]') || document.body;
  let sum = 0;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (el.children.length > 1) continue;
    const v = num(el.textContent);
    if (isNaN(v) || v <= 0) continue;
    // 找到真正带红色背景的小圆点（自身或最多上两层）
    let t = el, ok = false;
    for (let i = 0; i < 3 && t && t !== scope; i++, t = t.parentElement) {
      const r = t.getBoundingClientRect();
      if (r.width > 48 || r.height > 30) break;
      const m = getComputedStyle(t).backgroundColor.match(/rgba?\\(([^)]+)\\)/);
      if (m) {
        const [R, G, B, A = 1] = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
        if (A > 0.5 && R > 180 && G < 110 && B < 130) { ok = true; break; }
      }
    }
    if (ok) sum += v;
  }
  const tm = document.title.match(/[(（\\[](\\d+)\\+?[)）\\]]/);
  return Math.max(sum, tm ? parseInt(tm[1], 10) : 0);
})()`;
}

/** 识别当前登录的账号（昵称、头像、uid）；未登录返回空串 */
const accountScript = `(async () => {
  try {
    const r = await fetch('/aweme/v1/web/user/profile/self/?device_platform=webapp&aid=6383&channel=channel_pc_web&source=channel_pc_web&personal_center_strategy=1', { credentials: 'include' });
    const j = JSON.parse(await r.text());
    const u = j.user || (j.data && j.data.user);
    if (u && u.nickname) {
      const pick = a => a && a.url_list && a.url_list[0] || '';
      return JSON.stringify({ nickname: u.nickname, uid: String(u.uid || u.sec_uid || ''), avatar: pick(u.avatar_thumb) || pick(u.avatar_168x168) || pick(u.avatar_medium) });
    }
  } catch (e) {}
  return '';
})()`;

/** 当前选中的文字（输入框或页面选区） */
const selectionScript = `(() => {
  const a = document.activeElement;
  if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|url|tel|password|email)?$/i.test(a.type)))) {
    try { return a.value.substring(a.selectionStart, a.selectionEnd); } catch (e) {}
  }
  return String(window.getSelection() || '');
})()`;

/** 把文件（图片）以 paste 事件投递到当前焦点元素 */
function pasteFilesScript(files) {
  return `(() => {
  const files = ${JSON.stringify(files)};
  const dt = new DataTransfer();
  for (const f of files) {
    const bin = atob(f.data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    dt.items.add(new File([arr], f.name || 'image.png', { type: f.type || 'image/png' }));
  }
  const target = document.activeElement || document.body;
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return true;
})()`;
}

/**
 * 手机竖屏两级布局（类似微信）：
 *  - 列表模式：只显示会话列表
 *  - 聊天模式：只显示聊天区，顶部左侧出现「‹」返回箭头
 *  - Esc / 鼠标侧键（后退）返回列表
 * 抖音类名是混淆的，所以按结构识别：
 *  会话列表 = 含「搜索」输入框的那一栏；聊天区 = 与之并排的另一栏（含消息输入框）
 */
function mobileScript({ listSelector = '', chatSelector = '' } = {}) {
  return `(() => {
  if (window.__dyMobile) return;
  const LIST_SEL = ${JSON.stringify(listSelector)}, CHAT_SEL = ${JSON.stringify(chatSelector)};
  let root = document.documentElement;
  let savedMode = 'list';
  try { savedMode = sessionStorage.getItem('__dyMode') === 'chat' ? 'chat' : 'list'; } catch (e) {}
  const st = { list: null, chat: null, box: null, head: null, mode: savedMode, btn: null, anc: [], log: [], press: null, scanQueued: false, lastClick: 0, ctxRow: null };

  const css = \`
html[data-dy-mobile], html[data-dy-mobile] body { min-width: 0 !important; overflow-x: hidden !important; }
[data-dy-anc] { min-width: 0 !important; max-width: none !important; }
[data-dy-m="box"] { min-width: 0 !important; width: 100% !important; max-width: none !important; }
html[data-dy-mobile] [data-dy-aux] { flex: 0 0 0 !important; width: 0 !important; min-width: 0 !important; overflow: visible !important; }
html[data-dy-mobile][data-dy-mode="list"] [data-dy-m="chat"],
html[data-dy-mobile][data-dy-mode="chat"] [data-dy-m="list"] { display: none !important; }
html[data-dy-mobile][data-dy-mode="list"] [data-dy-m="list"],
html[data-dy-mobile][data-dy-mode="chat"] [data-dy-m="chat"] {
  width: 100% !important; max-width: none !important; min-width: 0 !important; flex: 1 1 auto !important;
  left: 0 !important; margin-left: 0 !important;
}
html[data-dy-mode="chat"][data-dy-anim] [data-dy-m="chat"] { animation: dyInR .22s ease-out; }
html[data-dy-mode="list"][data-dy-anim] [data-dy-m="list"] { animation: dyInL .22s ease-out; }
html[data-dy-mobile][data-dy-mode="chat"] [data-dy-m="head"] { padding-left: 40px !important; }
@keyframes dyInR { from { transform: translateX(35%); opacity: .3; } to { transform: none; opacity: 1; } }
@keyframes dyInL { from { transform: translateX(-25%); opacity: .3; } to { transform: none; opacity: 1; } }
#__dy_back { position: fixed; z-index: 2147483647; width: 32px; height: 32px; border: 0; border-radius: 8px; padding: 0;
  display: none; align-items: center; justify-content: center; background: transparent; color: #222; cursor: pointer; }
#__dy_back:hover { background: rgba(0,0,0,.07); }
html[data-dy-mobile][data-dy-mode="chat"] #__dy_back { display: flex; }
\`;

  const R = el => el.getBoundingClientRect();
  const alive = el => !!el && el.isConnected;
  const desc = el => el ? el.tagName + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') : 'null';
  function log(ev) {
    st.log.push(new Date().toISOString().slice(11, 23) + ' ' + ev);
    if (st.log.length > 60) st.log.shift();
  }

  const findSearch = () => document.querySelector('input[placeholder*="搜索"], input[type="search"]');
  function findMsgInput(scope) {
    for (const el of (scope || document).querySelectorAll('[contenteditable="true"], [contenteditable=""], textarea, [role="textbox"]')) {
      if (el.closest('#__dy_back')) continue;
      return el;
    }
    return null;
  }
  function childOf(anc, el) { while (el && el.parentElement !== anc) el = el.parentElement; return el; }
  function lca(a, b) { let x = a.parentElement; while (x && !x.contains(b)) x = x.parentElement; return x; }
  const skip = el => /^(STYLE|SCRIPT|LINK|TEMPLATE)$/.test(el.tagName) || el === st.btn;

  function mark(key, el) {
    if (st[key] === el) { if (el && el.getAttribute('data-dy-m') !== key) el.setAttribute('data-dy-m', key); return; }
    if (st[key] && st[key].getAttribute('data-dy-m') === key) st[key].removeAttribute('data-dy-m');
    if (el) el.setAttribute('data-dy-m', key);
    st[key] = el;
  }

  /** 每次 DOM 变化后重新识别：搜索框所在栏 = 列表；和它同一父容器下的另一栏 = 聊天 */
  function scan() {
    st.scanQueued = false;
    let list = LIST_SEL ? document.querySelector(LIST_SEL) : null;
    let chat = CHAT_SEL ? document.querySelector(CHAT_SEL) : null;
    let box = null;
    const search = findSearch();
    if (!list && search) {
      const msg = findMsgInput();
      const b = msg && !msg.contains(search) ? lca(search, msg) : null;
      if (b && b !== document.body && b !== root) {
        box = b; list = childOf(b, search); chat = chat || childOf(b, msg);
      } else if (alive(st.box) && st.box.contains(search) && st.box !== document.body) {
        box = st.box; list = childOf(st.box, search);
      } else {
        // 首次识别（宽屏原始布局）：从搜索框往上找，直到出现右侧并排的高块兄弟元素
        for (let el = search; el && el.parentElement && el.parentElement !== document.body; el = el.parentElement) {
          const r = R(el);
          if (r.height < 200) continue;
          let best = null, bw = -1;
          for (const sib of el.parentElement.children) {
            if (sib === el || skip(sib)) continue;
            const q = R(sib);
            if (q.height > 200 && q.left >= r.right - 10 && q.width > bw) { best = sib; bw = q.width; }
          }
          if (best) { list = el; chat = chat || best; box = el.parentElement; break; }
        }
      }
    }
    if (list && !box) box = list.parentElement;
    if (!list || !box) return false;
    if (!chat) {
      let best = null, area = -1;
      for (const c of box.children) {
        if (c === list || skip(c) || /popup|portal|modal|toast|mask|layer/i.test(String(c.className || ''))) continue;
        if (findMsgInput(c)) { best = c; break; }
        if (c === st.chat) { best = c; break; }
        const r = R(c), a = r.width * r.height;
        if (a > area) { area = a; best = c; }
      }
      chat = best;
    }
    const changed = st.list !== list || st.chat !== chat || st.box !== box;
    mark('list', list);
    mark('chat', chat);
    if (st.box !== box) {
      if (st.box && st.box.getAttribute('data-dy-m') === 'box') st.box.removeAttribute('data-dy-m');
      st.anc.forEach(a => a.removeAttribute('data-dy-anc')); st.anc = [];
      st.box = box;
      for (let a = box.parentElement; a && a !== root; a = a.parentElement) { a.setAttribute('data-dy-anc', ''); st.anc.push(a); }
    }
    if (box.getAttribute('data-dy-m') !== 'box') box.setAttribute('data-dy-m', 'box');
    // 不隐藏 box 里的其他子元素（抖音的弹窗容器：表情面板、确认框、菜单都在里面），
    // 只把普通流式布局的那些宽度压成 0，防止挤占聊天区；里面的弹层照常显示
    for (const c of box.children) {
      if (c === list || c === chat || skip(c)) { if (c.hasAttribute && c.hasAttribute('data-dy-aux')) c.removeAttribute('data-dy-aux'); continue; }
      if (c.hasAttribute('data-dy-aux')) continue;
      const pos = getComputedStyle(c).position;
      if (pos === 'static' || pos === 'relative') { c.setAttribute('data-dy-aux', ''); log('压缩辅助容器宽度 ' + desc(c)); }
    }
    if (changed) log('识别 list=' + desc(list) + ' chat=' + desc(chat) + ' box=' + desc(box));
    if (!root.hasAttribute('data-dy-mobile')) { root.setAttribute('data-dy-mobile', ''); log('启用手机布局，模式=' + st.mode); }
    return true;
  }
  /** 弹层（表情面板等）若超出 400px 视口，用 CSS translate 拉回（不影响组件自己的 transform） */
  function clamp(el) {
    if (!(el instanceof Element) || !el.isConnected) return;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
    const r = R(el);
    if (r.width < 40 || r.height < 40 || r.width > innerWidth) return;
    const cur = parseFloat((el.style.translate || '0').split(' ')[0]) || 0;
    let dx = 0;
    if (r.right > innerWidth - 2) dx = innerWidth - 2 - r.right;
    else if (r.left < 2) dx = 2 - r.left;
    if (Math.abs(dx) >= 1) { el.style.setProperty('translate', (cur + dx) + 'px 0', 'important'); log('弹层越界，已拉回 ' + Math.round(dx) + 'px：' + desc(el)); }
  }
  function onAdded(nodes) {
    for (const n of nodes) {
      if (n.nodeType !== 1 || n === st.btn) continue;
      if (Date.now() - st.lastClick < 1500 || st.suspend) {
        const r = R(n), cs = getComputedStyle(n);
        log('点击后新增 ' + desc(n) + ' pos=' + cs.position + ' display=' + cs.display + ' rect=' + [r.left, r.top, r.width, r.height].map(Math.round).join(','));
      }
      const check = () => { clamp(n); n.querySelectorAll && Array.from(n.children).forEach(c => { clamp(c); Array.from(c.children).forEach(clamp); }); };
      requestAnimationFrame(check); setTimeout(check, 120); setTimeout(check, 400);
    }
  }

  function queueScan() {
    if (st.scanQueued) return;
    st.scanQueued = true;
    requestAnimationFrame(scan);
  }

  function findHead() {
    if (!alive(st.chat)) return null;
    const cr = R(st.chat);
    if (cr.width < 50) return null;
    for (const img of st.chat.querySelectorAll('img')) {
      const r = R(img);
      if (r.top - cr.top > 120 || r.width < 20 || r.width > 72) continue;
      let el = img;
      while (el.parentElement && el.parentElement !== st.chat && R(el).width < cr.width * 0.9) el = el.parentElement;
      if (R(el).height < 140) return el;
    }
    return null;
  }

  function placeBtn() {
    const b = st.btn;
    if (!b || st.mode !== 'chat') return;
    let head = alive(st.head) && st.chat && st.chat.contains(st.head) ? st.head : null;
    if (!head) {
      if (st.head && st.head.getAttribute('data-dy-m') === 'head') st.head.removeAttribute('data-dy-m');
      head = findHead();
      if (head && head !== st.chat && head !== st.list) head.setAttribute('data-dy-m', 'head'); else head = null;
      st.head = head;
    }
    const cr = alive(st.chat) ? R(st.chat) : { left: 0, top: 0 };
    if (head) {
      const hr = R(head);
      b.style.left = (Math.max(cr.left, hr.left) + 4) + 'px';
      b.style.top = (hr.top + hr.height / 2 - 16) + 'px';
    } else {
      b.style.left = (cr.left + 4) + 'px';
      b.style.top = (cr.top + 8) + 'px';
    }
  }

  function setMode(m, reason) {
    if (st.mode === m) return;
    st.mode = m;
    log('模式 → ' + m + '（' + reason + '）');
    try { sessionStorage.setItem('__dyMode', m); } catch (e) {}
    root.setAttribute('data-dy-mode', m);
    root.removeAttribute('data-dy-anim'); void root.offsetWidth; root.setAttribute('data-dy-anim', '');
    setTimeout(() => root.removeAttribute('data-dy-anim'), 260);
    if (m === 'chat') { st.head = null; requestAnimationFrame(placeBtn); setTimeout(placeBtn, 300); }
  }

  const back = reason => setMode('list', reason || '返回');

  function rowOf(target) {
    if (!alive(st.list) || !st.list.contains(target)) return null;
    if (target.closest('input')) return null;
    const search = findSearch();
    if (search) {
      let row = search;
      while (row.parentElement && row.parentElement !== st.list && R(row.parentElement).height < 80) row = row.parentElement;
      if (row.contains(target)) return null;
    }
    const lw = R(st.list).width;
    for (let el = target; el && el !== st.list; el = el.parentElement) {
      const r = R(el);
      if (r.height >= 44 && r.height <= 140 && r.width >= lw * 0.7) return el;
    }
    return null;
  }
  const rowName = row => (row.innerText || row.textContent || '').split('\\n').map(t => t.trim()).filter(Boolean)[0] || '';
  const rectOf = el => { const r = R(el); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const visible = el => { const r = R(el); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.opacity !== '0'; };

  function isItem(target) { return !!rowOf(target); }

  function start() {
    root = document.documentElement;
    root.setAttribute('data-dy-mode', st.mode);
    const style = document.createElement('style');
    style.id = '__dy_mobile_css';
    style.textContent = css;
    (document.head || root).appendChild(style);

    const b = document.createElement('button');
    b.id = '__dy_back';
    b.title = '返回（Esc）';
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    b.addEventListener('pointerdown', stop, true);
    b.addEventListener('mousedown', stop, true);
    b.addEventListener('click', e => { stop(e); back('点返回箭头'); }, true);
    document.body.appendChild(b);
    st.btn = b;

    // 按下时判断是否点在会话行上（此时节点还没被页面重绘替换），松开时进入聊天
    document.addEventListener('pointerdown', e => {
      // 会话行里的小图标按钮（如悬停出现的「…」）不算"进入会话"；自动化操作期间也不切换
      const tiny = e.target.closest && e.target.closest('svg, button, [role="button"]');
      const isTiny = tiny && st.list && st.list.contains(tiny) && R(tiny).width <= 40;
      st.press = !st.suspend && !isTiny && st.mode === 'list' && e.button === 0 && isItem(e.target) ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
    }, true);
    document.addEventListener('pointerup', e => {
      const p = st.press; st.press = null;
      if (!p || Date.now() - p.t > 1500 || Math.abs(e.clientX - p.x) > 10 || Math.abs(e.clientY - p.y) > 10) return;
      setMode('chat', '点击会话');   // 同步写入 sessionStorage，页面若整页刷新也能保持聊天模式
      setTimeout(scan, 60);
    }, true);

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.mode === 'chat') back('Esc'); }, true);
    document.addEventListener('mouseup', e => { if (e.button === 3 && st.mode === 'chat') { e.preventDefault(); back('鼠标后退键'); } }, true);
    window.addEventListener('resize', placeBtn);
    window.addEventListener('beforeunload', () => log('页面即将重新加载'));

    new MutationObserver(ms => { queueScan(); for (const m of ms) if (m.addedNodes.length) onAdded(m.addedNodes); }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', e => {
      if (st.mode === 'chat' && alive(st.chat) && st.chat.contains(e.target)) { st.lastClick = Date.now(); log('点击聊天区 ' + desc(e.target) + ' @' + Math.round(e.clientX) + ',' + Math.round(e.clientY)); }
    }, true);
    setInterval(() => { scan(); if (st.mode === 'chat') placeBtn(); }, 500);
    log('启动 ' + location.href + ' 初始模式=' + st.mode);
    scan();
    if (st.mode === 'chat') placeBtn();
  }

  window.__dyMobile = {
    back: () => back('命令'), setMode, scan,
    suspend(v) { st.suspend = !!v; log(v ? '开始自动删除' : '结束自动删除'); },
    /** 坐标处的会话行：返回 {name, rect}，并记住该行 */
    rowAt(x, y) {
      scan();
      if (st.mode !== 'list') return null;
      const row = rowOf(document.elementFromPoint(x, y));
      st.ctxRow = row;
      return row ? { name: rowName(row), rect: rectOf(row) } : null;
    },
    ctxRow() { return alive(st.ctxRow) ? { name: rowName(st.ctxRow), rect: rectOf(st.ctxRow) } : null; },
    /** 会话行内靠右的小图标按钮（悬停后出现的"…"等），按从右到左排序 */
    rowButtons() {
      const row = st.ctxRow; if (!alive(row)) return [];
      const rr = R(row), out = [];
      for (const el of row.querySelectorAll('svg, button, [role="button"], [class*="more"], [class*="More"], [class*="icon"]')) {
        const r = R(el);
        if (r.width < 8 || r.width > 40 || r.height < 8 || r.height > 40 || !visible(el)) continue;
        if (r.left + r.width / 2 < rr.left + rr.width * 0.55) continue;
        if (/^\\d+\\+?$/.test((el.textContent || '').trim())) continue;
        out.push(rectOf(el));
      }
      const seen = new Set();
      return out.sort((a, b) => b.x - a.x).filter(p => { const k = Math.round(p.x / 6) + ',' + Math.round(p.y / 6); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
    },
    /** 查找可见、文字完全匹配的元素（优先会话列表外、DOM 中靠后的，即菜单/弹窗） */
    findText(src) {
      const re = new RegExp(src);
      let best = null;
      for (const el of document.body.querySelectorAll('*')) {
        if (el === st.btn || el.closest('#__dy_back')) continue;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 12 || !re.test(t)) continue;
        if (Array.from(el.children).some(c => (c.innerText || '').trim() === t)) continue;   // 取最内层
        if (!visible(el)) continue;
        const inList = alive(st.list) && st.list.contains(el);
        const score = (inList ? 0 : 2) + (el.closest('[role="dialog"], [role="menu"], [class*="modal"], [class*="Modal"], [class*="popover"], [class*="dropdown"], [class*="menu"]') ? 1 : 0);
        if (!best || score >= best.score) best = { score, p: Object.assign(rectOf(el), { text: t }) };
      }
      return best ? best.p : null;
    },
    rowGone(name) {
      if (!alive(st.list)) return false;
      for (const el of st.list.querySelectorAll('*')) { const r = rowOf(el); if (r && rowName(r) === name) return false; }
      return true;
    },
    get mode() { return st.mode; },
    debug() {
      scan();
      const d = el => el ? { el: desc(el), rect: (r => [r.left, r.top, r.width, r.height].map(Math.round))(R(el)) } : null;
      return {
        mode: st.mode, url: location.href, viewport: [innerWidth, innerHeight],
        search: d(findSearch()), msgInput: d(findMsgInput()), list: d(st.list), chat: d(st.chat), box: d(st.box), head: d(st.head),
        boxChildren: st.box ? Array.from(st.box.children).map(c => ({ el: desc(c), mark: c.getAttribute('data-dy-m'), display: getComputedStyle(c).display })) : [],
        log: st.log,
      };
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();`;
}

/**
 * 字体与字号：只处理"直接包含文字"的元素和输入框，按比例缩放字号、替换字体；
 * 跳过图标字体（font-family 含 icon）、svg 等，避免图标乱码。
 * window.__dyFont.apply(family, scale) 可实时修改。
 */
function fontScript({ family = '', scale = 1 } = {}) {
  return `(() => {
  if (window.__dyFont) { window.__dyFont.apply(${JSON.stringify(family)}, ${Number(scale) || 1}); return; }
  const F = { family: ${JSON.stringify(family)}, scale: ${Number(scale) || 1} };
  const hasText = el => { for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true; return false; };
  const editable = el => el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
  function fix(el) {
    if (!(el instanceof HTMLElement) || /^(SVG|PATH|IMG|VIDEO|CANVAS|STYLE|SCRIPT|I)$/i.test(el.tagName) || el.id === '__dy_back') return;
    if (!hasText(el) && !editable(el)) return;
    if (el.__dyBase === undefined) {
      const cs = getComputedStyle(el);
      let base = parseFloat(cs.fontSize) || 14;
      const p = el.parentElement;
      // 继承自已被缩放的父元素时，取父元素的原始字号，避免二次放大
      if (p && p.__dyBase !== undefined && Math.abs(parseFloat(getComputedStyle(p).fontSize) - base) < 0.1) base = p.__dyBase;
      el.__dyBase = base;
      el.__dyIcon = /icon|iconfont|awesome|material/i.test(cs.fontFamily);
    }
    if (F.scale !== 1) el.style.setProperty('font-size', (el.__dyBase * F.scale).toFixed(2) + 'px', 'important');
    else el.style.removeProperty('font-size');
    if (F.family && !el.__dyIcon) el.style.setProperty('font-family', F.family, 'important');
    else if (!F.family) el.style.removeProperty('font-family');
  }
  const all = root => { fix(root); root.querySelectorAll && root.querySelectorAll('*').forEach(fix); };
  const active = () => F.scale !== 1 || !!F.family;
  let on = false;
  function start() {
    if (on || !document.body) return;
    on = true;
    new MutationObserver(ms => {
      if (!active()) return;
      for (const m of ms) {
        if (m.type === 'childList') m.addedNodes.forEach(n => n.nodeType === 1 ? all(n) : (n.parentElement && fix(n.parentElement)));
        else if (m.type === 'characterData' && m.target.parentElement) fix(m.target.parentElement);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    if (active()) all(document.body);
  }
  window.__dyFont = {
    apply(family, scale) {
      const was = active();
      F.family = family || ''; F.scale = Number(scale) || 1;
      if (document.body && (was || active())) all(document.body);
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();`;
}

module.exports = { fontScript, themeScript, unreadScript, accountScript, selectionScript, pasteFilesScript, mobileScript };
