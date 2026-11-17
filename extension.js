'use strict';
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { findBrowser, CDPBrowser } = require('./browser');
const { getHtml } = require('./webview');
const { fontScript, themeScript, unreadScript, accountScript, selectionScript, pasteFilesScript, mobileScript } = require('./scripts');
const https = require('https');
const http = require('http');

const ACC_KEY = 'douyinChat.accounts';
const CUR_KEY = 'douyinChat.currentAccount';

/** 下载头像并转成 data URL（失败返回空串） */
function fetchDataUrl(url, depth = 0) {
  return new Promise(resolve => {
    if (!url || depth > 3) return resolve('');
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.douyin.com/' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchDataUrl(new URL(res.headers.location, url).toString(), depth + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return resolve(''); }
      const type = String(res.headers['content-type'] || 'image/jpeg').split(';')[0];
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > 400 * 1024) { req.destroy(); resolve(''); } else chunks.push(c); });
      res.on('end', () => resolve(`data:${type};base64,${Buffer.concat(chunks).toString('base64')}`));
      res.on('error', () => resolve(''));
    });
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.on('error', () => resolve(''));
  });
}

const CFG = 'douyinChat';
const cfg = () => vscode.workspace.getConfiguration(CFG);
const layoutCfg = () => ({ mobile: cfg().get('mobileLayout', true), phoneWidth: cfg().get('phoneWidth', 400) });

class Controller {
  constructor(context) {
    this.ctx = context;
    this.browser = null;
    this.targetId = null;
    this.sid = null;
    this.panel = null;
    this.visible = false;
    this.casting = false;
    this.pendingAck = null;
    this.ackTimer = null;
    this.starting = null;
    this.view = { w: 1000, h: 760, dpr: 1 };
    this.themeId = null;
    this.mobileId = null;
    this.fontId = null;
    this.popups = new Set();
    this.unread = 0;
    this.pollTimer = null;
    this.out = vscode.window.createOutputChannel('抖音私信');

    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.status.command = 'douyinChat.toggle';
    this.status.tooltip = '抖音私信（点击显示/隐藏）';
    this.updateStatus();
  }

  log(s) { this.out.appendLine(`[${new Date().toLocaleTimeString()}] ${s}`); }

  // ---------------- 多账号 ----------------
  get accounts() {
    let list = this.ctx.globalState.get(ACC_KEY);
    if (!Array.isArray(list) || !list.length) list = [{ id: 'default', name: '账号 1' }];
    return list;
  }
  saveAccounts(list) { return this.ctx.globalState.update(ACC_KEY, list); }
  get currentId() {
    const id = this.ctx.globalState.get(CUR_KEY);
    return this.accounts.some(a => a.id === id) ? id : this.accounts[0].id;
  }
  get current() { return this.accounts.find(a => a.id === this.currentId); }
  profileDir(id) {
    const base = this.ctx.globalStorageUri.fsPath;
    return id === 'default' ? path.join(base, 'chrome-profile') : path.join(base, 'profiles', id);
  }
  get userDataDir() { return this.profileDir(this.currentId); }

  postAccounts(open) {
    const cur = this.currentId;
    this.post({ type: 'accounts', open: !!open, list: this.accounts.map(a => ({ id: a.id, name: a.name, avatar: a.avatar || '', current: a.id === cur })) });
  }

  async updateAccount(id, patch) {
    const list = this.accounts.map(a => (a.id === id ? Object.assign({}, a, patch) : a));
    await this.saveAccounts(list);
    this.postAccounts(false);
    this.updateStatus();
  }

  async switchAccount(id) {
    const acc = this.accounts.find(a => a.id === id);
    if (!acc) return;
    if (id === this.currentId && (this.ready() || this.starting)) { this.postAccounts(false); return; }
    this.log(`切换账号 → ${acc.name}`);
    await this.saveAccounts(this.accounts);  // 确保默认账号被持久化
    await this.ctx.globalState.update(CUR_KEY, id);
    await this.stopBrowser();
    this.postAccounts(false);
    if (this.panel) {
      this.post({ type: 'status', text: `正在切换到「${acc.name}」…` });
      await this.boot();
    }
  }

  async addAccount() {
    const list = this.accounts;
    let n = list.length + 1;
    while (list.some(a => a.name === `账号 ${n}`)) n++;
    const acc = { id: 'a' + Date.now().toString(36), name: `账号 ${n}`, addedAt: Date.now() };
    await this.saveAccounts(list.concat(acc));
    vscode.window.showInformationMessage(`已添加「${acc.name}」，请使用抖音 App 扫码登录新账号。登录后会自动识别昵称和头像。`);
    await this.switchAccount(acc.id);
  }

  async removeAccount(id) {
    const list = this.accounts;
    const acc = list.find(a => a.id === id);
    if (!acc) return;
    if (list.length <= 1) { vscode.window.showWarningMessage('至少需要保留一个账号。如需退出登录，请使用「退出当前账号」。'); return; }
    const ok = await vscode.window.showWarningMessage(`确定移除账号「${acc.name}」？该账号的登录信息将被清除。`, { modal: true }, '移除');
    if (ok !== '移除') return;
    if (id === this.currentId) await this.switchAccount(list.find(a => a.id !== id).id);
    await this.saveAccounts(this.accounts.filter(a => a.id !== id));
    try { fs.rmSync(this.profileDir(id), { recursive: true, force: true }); } catch (e) { this.log('删除配置目录失败: ' + e.message); }
    this.postAccounts(false);
  }

  async renameAccount() {
    const acc = this.current;
    const name = await vscode.window.showInputBox({ prompt: '为当前账号设置显示名称', value: acc.name });
    if (name && name.trim()) await this.updateAccount(acc.id, { name: name.trim(), manualName: true });
  }

  async pickAccount() {
    const cur = this.currentId;
    const items = this.accounts.map(a => ({ label: (a.id === cur ? '$(check) ' : '$(account) ') + a.name, description: a.id === cur ? '当前账号' : '', id: a.id }));
    items.push({ label: '$(add) 添加账号', id: '__add' });
    const pick = await vscode.window.showQuickPick(items, { placeHolder: '切换抖音账号' });
    if (!pick) return;
    if (pick.id === '__add') await this.addAccount(); else await this.switchAccount(pick.id);
  }

  /** 登录后自动识别昵称/头像 */
  async detectAccount() {
    if (!this.ready()) return;
    this.lastDetect = Date.now();
    const id = this.currentId;
    let info;
    try {
      const r = await this.s('Runtime.evaluate', { expression: accountScript, awaitPromise: true, returnByValue: true });
      info = r.result && r.result.value ? JSON.parse(r.result.value) : null;
    } catch { info = null; }
    if (!info || !info.nickname || id !== this.currentId) return;
    this.needDetect = false;
    const acc = this.current;
    const patch = { uid: info.uid };
    if (!acc.manualName) patch.name = info.nickname;
    if (info.avatar && info.avatar !== acc.avatarUrl) {
      const data = await fetchDataUrl(info.avatar);
      if (data) { patch.avatar = data; patch.avatarUrl = info.avatar; }
    }
    this.log(`识别到账号：${info.nickname}`);
    const dup = info.uid && this.accounts.find(a => a.id !== id && a.uid === info.uid);
    if (dup) vscode.window.showWarningMessage(`当前登录的抖音账号与「${dup.name}」相同，可在切换账号中移除重复项。`);
    await this.updateAccount(id, patch);
  }

  updateStatus() {
    const running = this.browser && !this.browser.closed;
    this.status.text = `$(comment-discussion) 抖音${this.unread > 0 ? ' ' + this.unread : ''}`;
    if (this.panel) {
      try { this.panel.badge = this.unread > 0 ? { value: this.unread, tooltip: `${this.unread} 条未读消息` } : undefined; } catch { /* 旧版本 VSCode 不支持 */ }
      this.panel.description = this.accounts.length > 1 ? this.current.name : undefined;
    }
    this.status.backgroundColor = this.unread > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    this.status.tooltip = (running ? `抖音私信：${this.current.name}` : '抖音私信：未启动') + (this.unread > 0 ? `，${this.unread} 条未读消息` : '') + '（点击显示/隐藏）';
    if (cfg().get('showStatusBar', true)) this.status.show(); else this.status.hide();
  }

  post(m) { if (this.panel) this.panel.webview.postMessage(m).then(undefined, () => {}); }

  s(method, params) { return this.browser.send(method, params || {}, this.sid); }

  ready() { return this.browser && !this.browser.closed && this.sid; }

  // ---------------- 侧边栏视图（this.panel 保存 WebviewView） ----------------
  resolveWebviewView(view) {
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    const nonce = crypto.randomBytes(16).toString('base64');
    view.webview.html = getHtml(nonce, view.webview.cspSource, layoutCfg());
    view.webview.onDidReceiveMessage(m => this.onMessage(m).catch(e => this.log('消息处理出错: ' + e.message)));
    view.onDidChangeVisibility(() => {
      this.setVisible(view.visible);
      if (view.visible) this.post({ type: 'focus' });
    });
    view.onDidDispose(() => {
      if (this.panel !== view) return;
      this.panel = null;
      this.setVisible(false);
      if (cfg().get('closeBrowserOnPanelClose', false)) this.stopBrowser();
    });
    this.panel = view;
  }

  async open() {
    await vscode.commands.executeCommand('workbench.view.extension.douyinChat');
    if (this.panel) { this.panel.show(false); this.post({ type: 'focus' }); }
  }

  async toggle() {
    if (this.panel && this.panel.visible) await vscode.commands.executeCommand('workbench.action.closeSidebar');
    else await this.open();
  }

  async setVisible(v) {
    this.visible = v;
    if (!this.ready()) return;
    try {
      await this.s('Emulation.setFocusEmulationEnabled', { enabled: v });
      if (v) await this.startCast(); else await this.stopCast();
    } catch (e) { this.log('切换可见性失败: ' + e.message); }
  }

  // ---------------- 浏览器 ----------------
  ensureBrowser() {
    if (this.ready()) return Promise.resolve();
    if (!this.starting) this.starting = this.startBrowser().finally(() => { this.starting = null; });
    return this.starting;
  }

  async startBrowser() {
    const c = cfg();
    const exe = findBrowser(c.get('browserPath', '').trim());
    if (!exe) throw new Error('未找到 Chrome 或 Edge。请安装 Chrome，或在设置 douyinChat.browserPath 中填写浏览器可执行文件路径。');
    const mode = c.get('browserMode', 'headless');
    this.log(`启动浏览器: ${exe}（模式: ${mode}）`);
    const b = new CDPBrowser({ exe, userDataDir: this.userDataDir, mode, width: this.view.w, height: this.view.h + 80 });
    b.on('log', s => { if (/FATAL|ERROR/.test(s) && !/dbus|component_updater|gcm|sandbox_linux|viz_main/i.test(s)) this.log(s.trim()); });
    b.on('event', (m, p, sid) => this.onEvent(m, p, sid));
    b.on('exit', code => {
      this.log(`浏览器进程退出，code=${code}`);
      if (this.browser === b) {
        this.browser = null; this.sid = null; this.casting = false; this.pendingAck = null;
        this.stopPoll();
        this.updateStatus();
        this.post({ type: 'error', text: '浏览器已退出。', retry: true });
      }
    });
    this.browser = b;
    try {
      await b.launch();
    } catch (e) {
      this.browser = null;
      try { await b.close(); } catch { /* ignore */ }
      if (/SingletonLock|ProcessSingleton|profile/i.test(e.message)) {
        throw new Error('浏览器配置目录被占用，可能上一次的进程未退出。请稍后重试或执行「抖音私信：重启浏览器」。');
      }
      throw new Error('启动浏览器失败：' + e.message);
    }
    this.log('浏览器版本: ' + b.version.product);

    const { targetId, sessionId } = await b.attachPage();
    this.targetId = targetId;
    this.sid = sessionId;

    await this.s('Page.enable');
    await this.s('Page.setLifecycleEventsEnabled', { enabled: false }).catch(() => {});
    if (mode === 'headless') await this.fixUserAgent(b.version);
    await this.s('Page.setInterceptFileChooserDialog', { enabled: true }).catch(e => this.log('文件选择拦截失败: ' + e.message));
    await this.installTheme();
    await this.installMobile();
    await this.installFont();
    await this.applyViewport();
    await this.s('Emulation.setFocusEmulationEnabled', { enabled: this.visible }).catch(() => {});
    await this.s('Page.navigate', { url: c.get('startUrl', 'https://www.douyin.com/chat') });
    this.needDetect = true;
    this.lastDetect = Date.now() - 10000;
    this.startPoll();
    this.updateStatus();
  }

  async fixUserAgent(version) {
    const ua = String(version.userAgent || '').replace(/HeadlessChrome/g, 'Chrome');
    const full = (String(version.product || '').split('/')[1]) || '120.0.0.0';
    const major = full.split('.')[0];
    const isEdge = /Edg\//.test(ua) || /edge/i.test(this.browser.opts.exe);
    const brands = [
      { brand: isEdge ? 'Microsoft Edge' : 'Google Chrome', version: major },
      { brand: 'Chromium', version: major },
      { brand: 'Not.A/Brand', version: '99' },
    ];
    const platform = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
    const params = {
      userAgent: ua,
      acceptLanguage: 'zh-CN,zh;q=0.9',
      platform: process.platform === 'win32' ? 'Win32' : process.platform === 'darwin' ? 'MacIntel' : 'Linux x86_64',
      userAgentMetadata: {
        brands, fullVersionList: brands.map(b => ({ brand: b.brand, version: b.brand.startsWith('Not') ? '99.0.0.0' : full })),
        fullVersion: full, platform, platformVersion: '', architecture: process.arch === 'arm64' ? 'arm' : 'x86', model: '', mobile: false,
      },
    };
    try { await this.s('Emulation.setUserAgentOverride', params); }
    catch (e) {
      delete params.userAgentMetadata;
      await this.s('Emulation.setUserAgentOverride', params).catch(() => {});
    }
  }

  async installTheme() {
    if (this.themeId) {
      await this.s('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.themeId }).catch(() => {});
      this.themeId = null;
    }
    const c = cfg();
    if (c.get('lightTheme', true)) {
      const r = await this.s('Page.addScriptToEvaluateOnNewDocument', {
        source: themeScript({ bg: c.get('backgroundColor'), text: c.get('textColor'), threshold: c.get('darkThreshold') }),
      });
      this.themeId = r.identifier;
      await this.s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }).catch(() => {});
    } else {
      await this.s('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
    }
  }

  async installMobile() {
    if (this.mobileId) {
      await this.s('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.mobileId }).catch(() => {});
      this.mobileId = null;
    }
    const c = cfg();
    if (!c.get('mobileLayout', true)) return;
    const r = await this.s('Page.addScriptToEvaluateOnNewDocument', {
      source: mobileScript({ listSelector: c.get('mobile.listSelector', ''), chatSelector: c.get('mobile.chatSelector', '') }),
    });
    this.mobileId = r.identifier;
  }

  fontCfg() {
    const saved = this.ctx.globalState.get('douyinChat.font');
    if (saved && typeof saved === 'object') return { family: saved.family || '', scale: Number(saved.scale) || 1 };
    return { family: cfg().get('fontFamily', '') || '', scale: (Number(cfg().get('fontSize', 100)) || 100) / 100 };
  }

  async installFont() {
    if (this.fontId) {
      await this.s('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.fontId }).catch(() => {});
      this.fontId = null;
    }
    const src = fontScript(this.fontCfg());
    const r = await this.s('Page.addScriptToEvaluateOnNewDocument', { source: src });
    this.fontId = r.identifier;
    return src;
  }

  async applyFont() {
    this.post(Object.assign({ type: 'font' }, this.fontCfg()));
    if (!this.ready()) return;
    const src = await this.installFont();
    await this.s('Runtime.evaluate', { expression: src }).catch(() => {});   // 立即生效，无需刷新
  }

  // ---------------- 右键删除会话 ----------------
  async ev(expr) {
    const r = await this.s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result ? r.result.value : undefined;
  }

  async mouseClick(x, y, button = 'left') {
    const b = button === 'right' ? 2 : 1;
    await this.s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await this.s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: b, clickCount: 1 });
    await this.s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 });
  }

  async onContextMenu(m) {
    if (!this.ready()) return;
    let row = null;
    try { row = JSON.parse(await this.ev(`JSON.stringify(window.__dyMobile ? window.__dyMobile.rowAt(${m.x}, ${m.y}) : null)`) || 'null'); } catch { row = null; }
    if (row && row.name) this.post({ type: 'ctxmenu', cx: m.cx, cy: m.cy, x: m.x, y: m.y, name: row.name });
    else await this.mouseClick(m.x, m.y, 'right');   // 不是会话行：照常把右键交给页面
  }

  async deleteConversation(name) {
    if (!this.ready()) return;
    const ok = await vscode.window.showWarningMessage(`确定删除与「${name}」的会话？`, { modal: true, detail: '将调用抖音网页版自身的删除功能，删除后该会话将从列表中移除。' }, '删除');
    if (ok !== '删除') return;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const MENU = '^(删除聊天|删除会话|删除该聊天|删除对话|删除聊天记录|删除)$';
    const CONFIRM = '^(删除|确定|确认|确认删除|删除聊天)$';
    const J = async e => { try { return JSON.parse(await this.ev(`JSON.stringify(${e})`) || 'null'); } catch { return null; } };
    const row = await J('__dyMobile.ctxRow()');
    if (!row) { vscode.window.showWarningMessage('会话已不在列表中，请重新右键。'); return; }
    this.log(`删除会话「${name}」：开始`);
    let item = null;
    await this.ev('__dyMobile.suspend(true)');
    try {
      // 方式一：抖音原生右键菜单
      await this.mouseClick(row.rect.x, row.rect.y, 'right');
      await sleep(450);
      item = await J(`__dyMobile.findText(${JSON.stringify(MENU)})`);
      this.log('  原生右键菜单：' + (item ? `找到「${item.text}」` : '无'));
      // 方式二：悬停后出现的「…」等按钮
      if (!item) {
        await this.s('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await this.s('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await this.s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: row.rect.x, y: row.rect.y, button: 'none', buttons: 0 });
        await sleep(400);
        const btns = (await J('__dyMobile.rowButtons()')) || [];
        this.log(`  悬停按钮候选：${btns.length} 个`);
        for (const b of btns) {
          await this.s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'none', buttons: 0 });
          await sleep(250);
          item = await J(`__dyMobile.findText(${JSON.stringify(MENU)})`);   // 有的菜单悬停即出现
          if (!item) { await this.mouseClick(b.x, b.y); await sleep(450); item = await J(`__dyMobile.findText(${JSON.stringify(MENU)})`); }
          if (item) { this.log(`  在按钮 (${Math.round(b.x)},${Math.round(b.y)}) 的菜单中找到「${item.text}」`); break; }
        }
      }
      if (!item) {
        this.log('  未找到删除入口');
        vscode.window.showWarningMessage('未能在抖音网页版中找到该会话的删除入口。请运行「抖音私信：诊断手机布局」并把日志发给开发者。');
        return;
      }
      this.log(`  点击菜单项「${item.text}」@${Math.round(item.x)},${Math.round(item.y)}`);
      await this.mouseClick(item.x, item.y);
      let gone = false, confirm = null;
      for (let i = 0; i < 12 && !gone; i++) {          // 最多等 3 秒：确认框动画 / 列表刷新
        await sleep(250);
        if (!confirm) {
          confirm = await J(`__dyMobile.findText(${JSON.stringify(CONFIRM)})`);
          if (confirm && Math.abs(confirm.x - item.x) < 2 && Math.abs(confirm.y - item.y) < 2) confirm = null;   // 还是刚才那个菜单项
          if (confirm) { this.log(`  确认弹窗：点击「${confirm.text}」@${Math.round(confirm.x)},${Math.round(confirm.y)}`); await this.mouseClick(confirm.x, confirm.y); continue; }
        }
        gone = await J(`__dyMobile.rowGone(${JSON.stringify(name)})`);
      }
      if (!confirm) this.log('  未出现确认弹窗');
      this.log('  结果：' + (gone ? '已从列表移除' : '列表中仍存在'));
      if (gone) vscode.window.setStatusBarMessage(`已删除与「${name}」的会话`, 3000);
      else vscode.window.showWarningMessage(`已执行删除操作，但「${name}」仍在会话列表中，可能需要刷新后确认。`);
    } catch (e) {
      this.log('  删除出错：' + e.message);
      vscode.window.showErrorMessage('删除会话失败：' + e.message);
    } finally {
      await this.ev('__dyMobile.suspend(false)').catch(() => {});
    }
  }

  async reapplyMobile() {
    this.post({ type: 'layout', layout: layoutCfg() });
    if (!this.ready()) return;
    await this.installMobile();
    await this.s('Page.reload');
  }

  async diagnose() {
    this.out.show(true);
    if (!this.ready()) { this.log('诊断：浏览器未运行'); return; }
    const r = await this.s('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__dyMobile ? window.__dyMobile.debug() : { error: "手机布局脚本未加载" }, null, 2)', returnByValue: true,
    });
    this.log('布局诊断（如有问题请把下面整段发给开发者）：\n' + (r.result && r.result.value));
  }

  async applyViewport() {
    const { w, h, dpr } = this.view;
    await this.s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  }

  async startCast() {
    if (!this.ready()) return;
    if (this.casting) await this.s('Page.stopScreencast').catch(() => {});
    this.clearAck();
    const c = cfg();
    const { w, h, dpr } = this.view;
    const params = {
      format: c.get('imageFormat', 'jpeg'),
      quality: c.get('imageQuality', 85),
      maxWidth: Math.round(w * dpr),
      maxHeight: Math.round(h * dpr),
      everyNthFrame: 1,
    };
    // 页面跳转（换进程）期间会短暂报 "Not attached to an active page"，重试即可
    for (let i = 0; ; i++) {
      try { await this.s('Page.startScreencast', params); break; }
      catch (e) {
        if (i >= 20 || !/Not attached|active page/i.test(e.message) || !this.ready()) throw e;
        await new Promise(r => setTimeout(r, 300));
      }
    }
    this.casting = true;
  }

  async stopCast() {
    if (!this.ready() || !this.casting) return;
    this.casting = false;
    await this.s('Page.stopScreencast').catch(() => {});
    this.ack();
  }

  clearAck() { clearTimeout(this.ackTimer); this.pendingAck = null; }

  ack() {
    clearTimeout(this.ackTimer);
    const id = this.pendingAck;
    this.pendingAck = null;
    if (id != null && this.ready()) this.s('Page.screencastFrameAck', { sessionId: id }).catch(() => {});
  }

  async stopBrowser() {
    this.stopPoll();
    const b = this.browser;
    this.browser = null; this.sid = null; this.casting = false; this.themeId = null; this.mobileId = null; this.fontId = null;
    this.clearAck();
    if (b) await b.close();
    this.unread = 0;
    this.updateStatus();
  }

  async restart() {
    await this.stopBrowser();
    if (this.panel) await this.boot();
  }

  async boot() {
    try {
      if (!this.ready()) this.post({ type: 'status', text: '正在启动浏览器…' });
      await this.ensureBrowser();
      await this.applyViewport();
      if (this.visible) await this.startCast();
      this.post({ type: 'focus' });
    } catch (e) {
      this.log(e.stack || e.message);
      this.post({ type: 'error', text: e.message, retry: true });
    }
  }

  // ---------------- 未读轮询 ----------------
  startPoll() {
    this.stopPoll();
    this.pollTimer = setInterval(() => this.pollUnread(), 5000);
  }

  stopPoll() { clearInterval(this.pollTimer); this.pollTimer = null; }

  async pollUnread() {
    if (!this.ready()) return;
    if (this.needDetect && Date.now() - (this.lastDetect || 0) > 15000) this.detectAccount().catch(() => {});
    let n;
    try {
      const r = await this.s('Runtime.evaluate', { expression: unreadScript(cfg().get('unreadSelector', '')), returnByValue: true });
      n = Number(r.result && r.result.value) || 0;
    } catch { return; }
    const prev = this.unread;
    if (n === prev) return;
    this.unread = n;
    this.updateStatus();
    if (n > prev) this.notify(n);
  }

  notify(n) {
    if (!cfg().get('unreadNotification', true)) return;
    if (this.visible && vscode.window.state.focused) return;   // 正在看就不打扰
    if (Date.now() - (this.lastNotify || 0) < 10000) return;   // 10 秒内不重复弹
    this.lastNotify = Date.now();
    const who = this.accounts.length > 1 ? `（${this.current.name}）` : '';
    vscode.window.showInformationMessage(`抖音私信${who}：您有 ${n} 条未读消息，请及时查看。`, '查看').then(p => { if (p) this.open(); });
  }

  // ---------------- CDP 事件 ----------------
  onEvent(method, p, sid) {
    switch (method) {
      case 'Page.screencastFrame':
        if (sid !== this.sid) return;
        if (!this.visible || !this.panel) { this.s('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); return; }
        this.pendingAck = p.sessionId;
        clearTimeout(this.ackTimer);
        this.ackTimer = setTimeout(() => this.ack(), 1000);
        this.post({ type: 'frame', data: p.data, format: cfg().get('imageFormat', 'jpeg'), meta: { deviceWidth: p.metadata.deviceWidth, deviceHeight: p.metadata.deviceHeight } });
        break;
      case 'Page.frameNavigated':
        if (sid === this.sid && p.frame && !p.frame.parentId) { this.log('页面跳转: ' + p.frame.url); this.post({ type: 'url', url: p.frame.url }); }
        break;
      case 'Page.navigatedWithinDocument':
        if (sid === this.sid && p.frameId === this.targetId) this.post({ type: 'url', url: p.url });
        break;
      case 'Page.fileChooserOpened':
        if (sid === this.sid) this.onFileChooser(p);
        break;
      case 'Page.javascriptDialogOpening':
        if (sid === this.sid) this.onDialog(p);
        break;
      case 'Inspector.targetCrashed':
        if (sid === this.sid) {
          this.log('页面崩溃，正在重新加载');
          this.s('Page.reload').catch(() => {});
        }
        break;
      case 'Target.targetCreated':
      case 'Target.targetInfoChanged': {
        const t = p.targetInfo;
        if (!t || t.type !== 'page' || t.targetId === this.targetId) return;
        if (method === 'Target.targetCreated') {
          if (t.openerId !== this.targetId) return;
          this.popups.add(t.targetId);
        }
        if (this.popups.has(t.targetId) && t.url && t.url !== 'about:blank') {
          this.popups.delete(t.targetId);
          this.handlePopup(t.targetId, t.url);
        }
        break;
      }
      case 'Target.targetDestroyed':
        this.popups.delete(p.targetId);
        break;
    }
  }

  async handlePopup(targetId, url) {
    this.browser.send('Target.closeTarget', { targetId }).catch(() => {});
    if (cfg().get('openLinksExternally', true)) vscode.env.openExternal(vscode.Uri.parse(url));
    else this.s('Page.navigate', { url }).catch(() => {});
  }

  async onFileChooser(p) {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: p.mode === 'selectMultiple',
      openLabel: '发送',
      filters: { '图片/视频': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'mp4', 'mov'], '所有文件': ['*'] },
    });
    if (!uris || !uris.length || !this.ready()) return;
    try {
      await this.s('DOM.setFileInputFiles', { files: uris.map(u => u.fsPath), backendNodeId: p.backendNodeId });
    } catch (e) {
      vscode.window.showErrorMessage('选择文件失败：' + e.message);
    }
  }

  async onDialog(p) {
    let accept = true, promptText;
    try {
      if (p.type === 'alert') vscode.window.showInformationMessage(p.message);
      else if (p.type === 'confirm') accept = (await vscode.window.showWarningMessage(p.message, { modal: true }, '确定')) === '确定';
      else if (p.type === 'prompt') {
        promptText = await vscode.window.showInputBox({ prompt: p.message, value: p.defaultPrompt || '' });
        accept = promptText !== undefined;
      }
    } finally {
      this.s('Page.handleJavaScriptDialog', { accept, promptText }).catch(() => {});
    }
  }

  // ---------------- Webview 消息 ----------------
  async onMessage(m) {
    switch (m.type) {
      case 'ready':
      case 'retry':
        this.view = { w: m.w, h: m.h, dpr: m.dpr };
        this.visible = this.panel ? this.panel.visible : false;
        this.postAccounts(false);
        this.post(Object.assign({ type: 'font' }, this.fontCfg()));
        this.updateStatus();
        await this.boot();
        break;
      case 'resize':
        this.view = { w: m.w, h: m.h, dpr: m.dpr };
        if (this.ready()) { await this.applyViewport(); if (this.visible) await this.startCast(); }
        break;
      case 'drawn':
        this.ack();
        break;
      case 'mouse': {
        if (!this.ready()) return;
        const params = { type: m.evType, x: m.x, y: m.y, modifiers: m.modifiers, button: m.button || 'none' };
        if (m.evType === 'mouseWheel') { params.deltaX = m.deltaX; params.deltaY = m.deltaY; }
        else { params.buttons = m.buttons; if (m.evType !== 'mouseMoved') params.clickCount = m.clickCount; }
        await this.s('Input.dispatchMouseEvent', params);
        break;
      }
      case 'key': {
        if (!this.ready()) return;
        const params = { type: m.evType, key: m.key, code: m.code, windowsVirtualKeyCode: m.keyCode, nativeVirtualKeyCode: m.keyCode,
          modifiers: m.modifiers, autoRepeat: m.autoRepeat, location: m.location };
        if (m.text) { params.text = m.text; params.unmodifiedText = m.unmodifiedText || m.text; }
        if (m.commands) params.commands = m.commands;
        await this.s('Input.dispatchKeyEvent', params);
        break;
      }
      case 'text':
        if (this.ready() && m.text) await this.s('Input.insertText', { text: m.text });
        break;
      case 'copy': {
        if (!this.ready()) return;
        const r = await this.s('Runtime.evaluate', { expression: selectionScript, returnByValue: true });
        const t = r.result && r.result.value;
        if (t) await vscode.env.clipboard.writeText(t);
        break;
      }
      case 'pasteFallback': {
        if (!this.ready()) return;
        const t = await vscode.env.clipboard.readText();
        if (t) await this.s('Input.insertText', { text: t });
        break;
      }
      case 'pasteFiles':
        if (this.ready() && m.files && m.files.length) {
          await this.s('Runtime.evaluate', { expression: pasteFilesScript(m.files), returnByValue: true, userGesture: true });
        }
        break;
      case 'nav':
        if (!this.ready()) return;
        if (m.action === 'back') await this.s('Runtime.evaluate', { expression: 'history.back()' });
        else if (m.action === 'forward') await this.s('Runtime.evaluate', { expression: 'history.forward()' });
        else if (m.action === 'reload') await this.s('Page.reload');
        else if (m.action === 'home') await this.s('Page.navigate', { url: cfg().get('startUrl', 'https://www.douyin.com/chat') });
        break;
      case 'toggleTheme':
        await this.toggleTheme();
        break;
      case 'showAccounts':
        this.postAccounts(true);
        if (this.ready()) this.detectAccount().catch(() => {});
        break;
      case 'switchAccount':
        await this.switchAccount(m.id);
        break;
      case 'addAccount':
        await this.addAccount();
        break;
      case 'removeAccount':
        await this.removeAccount(m.id);
        break;
      case 'contextmenu':
        await this.onContextMenu(m);
        break;
      case 'deleteConversation':
        await this.deleteConversation(m.name);
        break;
      case 'setFont':
        await this.ctx.globalState.update('douyinChat.font', { family: m.family || '', scale: Number(m.scale) || 1 });
        await this.applyFont();
        break;
      case 'openFontSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'douyinChat.fontFamily');
        break;
    }
  }

  async toggleTheme() {
    const c = cfg();
    await c.update('lightTheme', !c.get('lightTheme', true), vscode.ConfigurationTarget.Global);
    // 配置变更监听会负责重新应用
  }

  async reapplyTheme() {
    if (!this.ready()) return;
    await this.installTheme();
    await this.s('Page.reload');
  }

  async logout() {
    const ok = await vscode.window.showWarningMessage(`将退出账号「${this.current.name}」并清除其登录数据，确定？`, { modal: true }, '清除');
    if (ok !== '清除') return;
    await this.stopBrowser();
    try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch (e) {
      vscode.window.showErrorMessage('清除失败：' + e.message);
      return;
    }
    await this.updateAccount(this.currentId, { uid: '', avatar: '', avatarUrl: '' });
    vscode.window.showInformationMessage('已退出当前账号。');
    if (this.panel) await this.boot();
  }

  dispose() {
    this.stopPoll();
    if (this.browser) this.browser.close();
    this.status.dispose();
    this.out.dispose();
  }
}

let ctrl;

function activate(context) {
  ctrl = new Controller(context);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('douyinChat.view', ctrl, {
    webviewOptions: { retainContextWhenHidden: true },
  }));
  const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  reg('douyinChat.open', () => ctrl.open());
  reg('douyinChat.toggle', () => ctrl.toggle());
  reg('douyinChat.reload', () => ctrl.ready() && ctrl.s('Page.reload'));
  reg('douyinChat.restart', () => ctrl.restart());
  reg('douyinChat.toggleTheme', () => ctrl.toggleTheme());
  reg('douyinChat.logout', () => ctrl.logout());
  reg('douyinChat.showLog', () => ctrl.out.show());
  reg('douyinChat.switchAccount', () => ctrl.pickAccount());
  reg('douyinChat.addAccount', () => ctrl.addAccount());
  reg('douyinChat.renameAccount', () => ctrl.renameAccount());
  reg('douyinChat.diagnose', () => ctrl.diagnose().catch(e => ctrl.log('诊断失败: ' + e.message)));
  reg('douyinChat.back', () => ctrl.ready() && ctrl.s('Runtime.evaluate', { expression: 'window.__dyMobile && window.__dyMobile.back()' }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (!e.affectsConfiguration(CFG)) return;
    if (['lightTheme', 'backgroundColor', 'textColor', 'darkThreshold'].some(k => e.affectsConfiguration(`${CFG}.${k}`))) {
      ctrl.reapplyTheme().catch(err => ctrl.log('应用主题失败: ' + err.message));
    }
    if (['mobileLayout', 'phoneWidth', 'mobile.listSelector', 'mobile.chatSelector'].some(k => e.affectsConfiguration(`${CFG}.${k}`))) {
      ctrl.reapplyMobile().catch(err => ctrl.log('应用手机布局失败: ' + err.message));
    }
    if (['fontFamily', 'fontSize'].some(k => e.affectsConfiguration(`${CFG}.${k}`))) {
      // 在设置里改字体时，以设置为准
      Promise.resolve(ctrl.ctx.globalState.update('douyinChat.font', undefined)).then(() => ctrl.applyFont()).catch(err => ctrl.log('应用字体失败: ' + err.message));
    }
    if (['imageFormat', 'imageQuality'].some(k => e.affectsConfiguration(`${CFG}.${k}`)) && ctrl.visible) ctrl.startCast().catch(() => {});
    if (e.affectsConfiguration(`${CFG}.showStatusBar`)) ctrl.updateStatus();
    if (['browserMode', 'browserPath'].some(k => e.affectsConfiguration(`${CFG}.${k}`)) && ctrl.ready()) {
      vscode.window.showInformationMessage('浏览器设置已更改，重启浏览器后生效。', '立即重启').then(p => { if (p) ctrl.restart(); });
    }
  }));
  context.subscriptions.push({ dispose: () => ctrl.dispose() });

  if (cfg().get('autoStart', false)) ctrl.ensureBrowser().catch(e => ctrl.log(e.message));
}

async function deactivate() {
  if (ctrl) await ctrl.stopBrowser();
}

module.exports = { activate, deactivate };
