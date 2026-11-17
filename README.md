# 抖音私信 for VSCode（Douyin Chat）

在 VSCode 侧边栏里使用抖音网页版私信：手机竖屏布局，会话列表和聊天页像微信那样分两级；支持多账号切换、新消息通知、右键删除会话、调节字体和字号，并且可以把抖音默认的深色背景换成浅色。

> ⚠️ 本项目是个人开发的非官方工具，与抖音、字节跳动没有任何关联。仅供个人学习和自用，请遵守抖音的用户协议，不要用于群发、营销等自动化用途。

<!-- 截图：把截图放到 docs/ 目录后取消下面这行的注释 -->
<!-- ![screenshot](docs/screenshot.png) -->

## 功能特性

- 📱 **手机竖屏、像微信一样的两级界面**：先看到会话列表，点进会话后只显示聊天窗口。返回会话列表可以点左上角的「‹」、按 `Esc`，或者按鼠标侧键（后退）。
- 🧭 **侧边栏常驻**：在左侧活动栏点击图标即可展开，不会占用编辑器标签页。按 `Ctrl+Alt+D` 可以快速展开或收起。
- 👥 **多账号切换**：交互参照抖音 App 的「切换账号」。每个账号的登录状态单独保存，切换时不用重新扫码。登录后会自动识别昵称和头像。
- 🔔 **新消息通知**：右下角弹出「抖音私信：您有 N 条未读消息，请及时查看。」，不显示消息内容。活动栏图标和状态栏上会显示未读数角标。
- 🗑️ **右键删除会话**：在会话上右键，选「删除会话」，插件会调用抖音网页版自己的删除功能。
- 🔤 **字体与字号**：可以选择字体，也可以按 80%～160% 的比例调整字号。只缩放文字，不缩放图标。
- 🎨 **浅色背景**：把深色背景换成 `rgb(230, 231, 237)`，背景色可以自定义。
- ⌨️ **完整输入**：支持中文输入法、复制粘贴、粘贴截图直接发送、通过文件选择框发送图片或视频、表情面板。
- 🔒 **零依赖**：只用 Node 内置模块，不带 puppeteer 之类的第三方库，安装包大约 50 KB。

## 安装

### 方式一：安装打包好的 .vsix

1. 从 [Releases](../../releases) 下载 `douyin-chat-x.y.z.vsix`。
2. 打开 VSCode 的扩展面板，点右上角「…」，选「从 VSIX 安装…」，选中下载的文件。
3. 安装完成后执行 `Developer: Reload Window` 重新加载窗口。

### 方式二：从源码打包

```bash
git clone https://github.com/<你的用户名>/douyin-chat-vscode.git
cd douyin-chat-vscode
npm run package          # 生成 dist/douyin-chat-x.y.z.vsix，不需要 npm install
```

**运行要求**：电脑上装有 **Chrome** 或 **Edge**（插件会自动查找；找不到时在设置 `douyinChat.browserPath` 里手动填写路径）。VSCode 版本需要 1.80 或更高。

## 使用

1. 点击最左侧活动栏里的抖音私信图标（对话气泡里有个音符）。
2. 第一次使用时，用抖音 App 扫码登录，之后登录状态会一直保留。
3. 顶栏从左到右依次是：
   - **头像/昵称 ▼**：切换账号、添加账号；
   - **Aa**：字体与字号；
   - **⌂**：回到私信首页；
   - **⟳**：刷新页面；
   - **◐**：开关浅色背景。

| 操作 | 方式 |
|---|---|
| 进入会话 | 在会话列表中点击会话 |
| 返回会话列表 | 点左上角「‹」/ 按 `Esc` / 按鼠标后退键 |
| 删除会话 | 在会话上右键，选「删除会话」 |
| 发送图片或文件 | 直接粘贴截图，或者点抖音的图片按钮（会弹出 VSCode 的文件选择框） |
| 展开或收起侧边栏 | `Ctrl+Alt+D`，或点状态栏上的「💬 抖音」 |

## 设置项

| 设置 | 默认值 | 说明 |
|---|---|---|
| `douyinChat.browserPath` | `""` | Chrome / Edge 可执行文件路径。留空则自动查找。 |
| `douyinChat.browserMode` | `headless` | 后台浏览器的运行方式，修改后需重启浏览器。 |
| `douyinChat.startUrl` | `https://www.douyin.com/chat` | 启动时打开的页面。 |
| `douyinChat.mobileLayout` | `true` | 手机竖屏布局：先显示会话列表，点进会话后只显示聊天窗口，左上角「‹」或 Esc 返回（类似微信）。 |
| `douyinChat.phoneWidth` | `400` | 手机布局的最大宽度（像素）。侧边栏更宽时内容居中，更窄时跟随侧边栏宽度。 |
| `douyinChat.mobile.listSelector` | `""` | （可选）会话列表栏的 CSS 选择器。自动识别失败时填写。 |
| `douyinChat.mobile.chatSelector` | `""` | （可选）聊天栏的 CSS 选择器。自动识别失败时填写。 |
| `douyinChat.lightTheme` | `true` | 把页面深色背景替换为浅色。 |
| `douyinChat.backgroundColor` | `rgb(230, 231, 237)` | 浅色模式下的背景色。 |
| `douyinChat.textColor` | `rgb(30, 30, 30)` | 浅色模式下替换浅色文字所用的颜色。 |
| `douyinChat.fontFamily` | `""` | 页面字体（CSS font-family），例如 "Microsoft YaHei", sans-serif。留空则使用抖音默认字体。也可在顶栏「Aa」中选择。 |
| `douyinChat.fontSize` | `100` | 文字大小比例（%），只缩放文字不缩放图标。也可在顶栏「Aa」中调节。 |
| `douyinChat.darkThreshold` | `90` | 背景亮度低于该值（0-255）视为深色并替换。有深灰块没被替换就调大，误替换就调小。 |
| `douyinChat.imageFormat` | `jpeg` | 投屏画面格式：jpeg 更流畅，png 文字更清晰但更耗资源。 |
| `douyinChat.imageQuality` | `85` | JPEG 画质（30-100）。 |
| `douyinChat.closeBrowserOnPanelClose` | `false` | 侧边栏视图被关闭（移除）时同时关闭后台浏览器。关闭此项则浏览器保持运行，可继续接收未读提醒。 |
| `douyinChat.openLinksExternally` | `true` | 页面弹出的新窗口（如视频链接）用系统浏览器打开；关闭则在面板内打开。 |
| `douyinChat.unreadNotification` | `true` | 有新的未读消息时在右下角弹出通知（侧边栏可见且 VSCode 处于前台时不弹出）。 |
| `douyinChat.unreadSelector` | `""` | 未读数角标的 CSS 选择器（可选）。留空则从页面标题中解析未读数。 |
| `douyinChat.showStatusBar` | `true` | 在状态栏显示抖音入口和未读数。 |
| `douyinChat.autoStart` | `false` | VSCode 启动时自动在后台启动浏览器（用于接收未读提醒）。 |

## 命令

| 命令 | ID |
|---|---|
| 抖音私信：打开抖音私信（侧边栏） | `douyinChat.open` |
| 抖音私信：显示/隐藏抖音私信 | `douyinChat.toggle` |
| 抖音私信：刷新页面 | `douyinChat.reload` |
| 抖音私信：重启浏览器 | `douyinChat.restart` |
| 抖音私信：切换浅色背景 | `douyinChat.toggleTheme` |
| 抖音私信：退出当前账号（清除登录数据） | `douyinChat.logout` |
| 抖音私信：查看日志 | `douyinChat.showLog` |
| 抖音私信：返回会话列表 | `douyinChat.back` |
| 抖音私信：诊断手机布局 | `douyinChat.diagnose` |
| 抖音私信：切换账号 | `douyinChat.switchAccount` |
| 抖音私信：添加账号 | `douyinChat.addAccount` |
| 抖音私信：重命名当前账号 | `douyinChat.renameAccount` |

## 工作原理

VSCode 插件的 Webview 本质上是 iframe。抖音禁止被嵌入 iframe，而且 iframe 里的第三方 Cookie 也保存不住，所以没办法直接把网页嵌进来。本插件的做法是 **「后台真浏览器 + CDP 投屏」**：

```
VSCode 插件进程 (Node)
 ├─ browser.js   用本机 Chrome/Edge 启动一个后台浏览器，每个账号一个独立的配置目录
 │               通过 --remote-debugging-pipe 管道与它通信，使用 Chrome DevTools Protocol（CDP）
 ├─ extension.js 投屏 (Page.startScreencast) → 把画面帧发给 Webview
 │               输入转发 (Input.dispatchMouseEvent / dispatchKeyEvent / insertText)
 │               负责多账号、未读轮询与通知、右键删除流程、字体和主题设置
 ├─ scripts.js   注入页面的脚本：手机两级布局、浅色主题、字体、未读数识别、账号识别
 └─ webview.js   侧边栏界面：canvas 显示画面，用隐藏的输入框承接中文输入法，
                 另有账号切换面板、右键菜单、字体面板
```

- 跑的是一个真实的浏览器，所以登录、请求签名、长连接都和网页版完全一致。
- 新消息通知靠定时读取会话列表里红色未读角标上的数字，不读取任何消息内容。
- 插件声明为 UI 扩展（`extensionKind: ui`），在 Remote-SSH 或 WSL 环境下也运行在本地，使用的是本地的浏览器。

## 项目结构

```
.
├── package.json          插件清单（命令、设置、视图、快捷键）
├── extension.js          插件主逻辑
├── browser.js            Chrome/Edge 启动器 + CDP 管道客户端
├── scripts.js            注入页面的脚本
├── webview.js            侧边栏 Webview 页面
├── media/
│   ├── icon.png          插件图标
│   └── activity.svg      活动栏图标
├── scripts/
│   └── build-vsix.js     零依赖打包脚本
└── .vscode/launch.json   F5 调试配置
```

## 开发与调试

1. 用 VSCode 打开项目目录，按 `F5`，会启动一个加载了本插件的「扩展开发宿主」窗口。
2. 修改代码后，在宿主窗口执行 `Developer: Reload Window` 即可生效。
3. 排查问题：
   - 「抖音私信：查看日志」：插件运行日志，包括浏览器启动、页面跳转、删除流程的每一步；
   - 「抖音私信：诊断手机布局」：输出识别到的页面结构和最近的布局事件。
4. 打包：`npm run package`，也可以用官方工具 `npx @vscode/vsce package`。

> 抖音网页版的类名是混淆过的，并且会随版本变化，所以布局识别是按结构特征来做的，比如「带搜索框的那一栏是会话列表」。如果抖音改版导致识别失效，可以先在设置里填 `douyinChat.mobile.listSelector` / `chatSelector` 应急，再根据诊断输出调整 `scripts.js`。

## 常见问题

**扫码登录失败，或提示环境异常？**
把 `douyinChat.browserMode` 改成 `visible`，执行「重启浏览器」，在弹出的真实浏览器窗口里登录。登录成功后再改回 `headless`。

**提示「浏览器配置目录被占用」？**
上一次启动的浏览器进程还没退出。稍等几秒，或者执行「抖音私信：重启浏览器」。

**深色块没有被替换，或者颜色替换错了？**
调整 `douyinChat.darkThreshold`：没被替换就调大，误替换就调小。

**未读数不准？**
在 `douyinChat.unreadSelector` 里填上未读角标的 CSS 选择器。

**表情面板、菜单、删除失败等问题？**
执行「诊断手机布局」，并查看「查看日志」，在提交 Issue 时附上这两份输出。

## 已知限制

- 画面是投屏的视频流，聊天完全够用，但看视频不够流畅。
- 同一时间只运行当前账号的浏览器，所以只有当前账号会收到新消息通知。
- 没有浏览器原生的右键菜单，复制粘贴请用快捷键。

## 隐私说明

- 所有数据都只保存在本机。登录数据（Cookie 等）放在 VSCode 的扩展存储目录里，每个账号一个独立的浏览器配置目录。
- 插件不收集、不上传任何数据。除了抖音自己的网络请求之外，插件只额外访问一次抖音的头像地址，用来显示账号头像。
- 「退出当前账号」或「移除账号」会删除对应的浏览器配置目录。

## 免责声明

本项目与抖音、字节跳动没有任何关联。「抖音」是其权利人的商标。本项目只是在用户自己的电脑上调用用户自己的浏览器访问抖音网页版，不破解、不绕过任何接口限制。使用者需自行承担使用本工具的一切风险，并遵守相关平台的用户协议与法律法规。

## 许可证

[MIT](LICENSE)
