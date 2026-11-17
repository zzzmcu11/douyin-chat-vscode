'use strict';
/**
 * 零依赖的 Chrome/Edge 启动器 + CDP（--remote-debugging-pipe）客户端。
 * 通过 fd3 写、fd4 读，消息以 '\0' 分隔。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

function exists(p) {
  try { return !!p && fs.statSync(p).isFile(); } catch { return false; }
}

function findBrowser(custom) {
  if (custom) return exists(custom) ? custom : null;
  const list = [];
  if (process.platform === 'win32') {
    const bases = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']].filter(Boolean);
    for (const b of bases) {
      list.push(path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
    for (const b of bases) {
      list.push(path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      list.push(path.join(b, 'Chromium', 'Application', 'chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    const apps = [
      'Google Chrome.app/Contents/MacOS/Google Chrome',
      'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'Chromium.app/Contents/MacOS/Chromium',
    ];
    for (const a of apps) {
      list.push(path.join('/Applications', a));
      list.push(path.join(os.homedir(), 'Applications', a));
    }
  } else {
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];
    const dirs = (process.env.PATH || '').split(path.delimiter).concat(['/usr/bin', '/usr/local/bin', '/snap/bin']);
    for (const n of names) for (const d of dirs) list.push(path.join(d, n));
  }
  return list.find(exists) || null;
}

class CDPBrowser extends EventEmitter {
  /**
   * @param {{exe:string,userDataDir:string,mode:'headless'|'offscreen'|'visible',width?:number,height?:number,extraArgs?:string[]}} opts
   */
  constructor(opts) {
    super();
    this.opts = opts;
    this.proc = null;
    this.closed = true;
    this._id = 0;
    this._pending = new Map();
    this._buf = Buffer.alloc(0);
  }

  async launch() {
    const { exe, userDataDir, mode, width = 1000, height = 760, extraArgs = [] } = this.opts;
    fs.mkdirSync(userDataDir, { recursive: true });
    const args = [
      '--remote-debugging-pipe',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=Translate,MediaRouter,OptimizationHints',
      '--lang=zh-CN',
      '--disable-blink-features=AutomationControlled',
      `--window-size=${width},${height}`,
      ...extraArgs,
    ];
    if (mode === 'headless') args.push('--headless=new');
    if (mode === 'offscreen') args.push('--window-position=-32000,-32000');
    args.push('about:blank');

    this.proc = spawn(exe, args, {
      stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });
    this.closed = false;
    const writer = this.proc.stdio[3];
    const reader = this.proc.stdio[4];
    this._writer = writer;

    this.proc.stderr.on('data', d => this.emit('log', d.toString()));
    reader.on('data', chunk => this._onData(chunk));
    reader.on('error', () => {});
    writer.on('error', () => {});

    const exitPromise = new Promise(resolve => {
      this.proc.once('exit', (code, signal) => {
        this.closed = true;
        for (const { reject, timer } of this._pending.values()) {
          clearTimeout(timer);
          reject(new Error('浏览器进程已退出'));
        }
        this._pending.clear();
        this.emit('exit', code, signal);
        resolve();
      });
    });
    this._exitPromise = exitPromise;

    await new Promise((resolve, reject) => {
      this.proc.once('error', reject);
      this.proc.once('spawn', resolve);
    });
    // 确认 CDP 通道可用
    this.version = await this.send('Browser.getVersion', {}, undefined, 20000);
    return this.version;
  }

  _onData(chunk) {
    this._buf = this._buf.length ? Buffer.concat([this._buf, chunk]) : chunk;
    let idx;
    while ((idx = this._buf.indexOf(0)) !== -1) {
      const raw = this._buf.subarray(0, idx).toString('utf8');
      this._buf = this._buf.subarray(idx + 1);
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id !== undefined && this._pending.has(msg.id)) {
        const p = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result || {});
      } else if (msg.method) {
        this.emit('event', msg.method, msg.params || {}, msg.sessionId);
      }
    }
  }

  send(method, params = {}, sessionId, timeout = 30000) {
    if (this.closed) return Promise.reject(new Error('浏览器未运行'));
    const id = ++this._id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`${method}: 超时`));
      }, timeout);
      this._pending.set(id, { resolve, reject, timer, method });
      try {
        this._writer.write(JSON.stringify(msg) + '\0');
      } catch (e) {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(e);
      }
    });
  }

  /** 获取（或创建）一个页面并以 flatten 模式附加，返回 {targetId, sessionId} */
  async attachPage() {
    await this.send('Target.setDiscoverTargets', { discover: true });
    const { targetInfos } = await this.send('Target.getTargets');
    let page = (targetInfos || []).find(t => t.type === 'page');
    let targetId = page && page.targetId;
    if (!targetId) ({ targetId } = await this.send('Target.createTarget', { url: 'about:blank' }));
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    return { targetId, sessionId };
  }

  async close() {
    if (!this.proc || this.closed) return;
    try { await this.send('Browser.close', {}, undefined, 3000); } catch { /* ignore */ }
    const killTimer = setTimeout(() => { try { this.proc.kill('SIGKILL'); } catch { /* ignore */ } }, 3000);
    await Promise.race([this._exitPromise, new Promise(r => setTimeout(r, 5000))]);
    clearTimeout(killTimer);
  }
}

module.exports = { findBrowser, CDPBrowser };
