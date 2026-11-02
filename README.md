# 通义听悟 Mobile

[![Android CI](https://github.com/Givenwels/tingwu-android-webview/actions/workflows/android.yml/badge.svg)](https://github.com/Givenwels/tingwu-android-webview/actions/workflows/android.yml)
[![PWA Pages](https://github.com/Givenwels/tingwu-android-webview/actions/workflows/pages.yml/badge.svg)](https://github.com/Givenwels/tingwu-android-webview/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

这是一个面向手机端的通义听悟快捷入口开源项目。同一个仓库里包含两个版本：

- **Android APK 版**：原生 Kotlin WebView 壳，适合安卓手机安装使用。
- **iPhone / iPad / PWA 版**：Vite + React + TypeScript 启动页，可通过 Safari 添加到主屏幕。

两个版本的目标一致：让手机桌面多一个「通义听悟」入口，打开后进入官方网页：

```text
https://tingwu.aliyun.com/
```

登录、上传、转写、摘要等功能来自通义听悟官网。Android 通过官网页面现有请求客户端补充只读的文件夹浏览，不读取账号密码，也不需要额外的 API Key。

> [!IMPORTANT]
> 这是社区开源的非官方项目，与阿里云、通义听悟及其关联公司没有隶属、合作或背书关系。“通义听悟”等名称和商标归其权利人所有。

## 项目定位

这个项目适合希望通过手机桌面图标快速进入通义听悟网页的用户。安卓用户可以安装 APK；iPhone / iPad 用户可以使用 Safari 添加 PWA 到主屏幕。

录音和转写仍由官网处理；目录和分类记录的读取直接使用官网页面客户端与会话，不经过第三方服务器。

核心原则：

- 尽可能保持官网原始登录和使用流程。
- Android 和 PWA 都只做入口与兼容性壳层。
- 相机权限随网页请求申请；麦克风权限在用户点击实时记录后申请，并只授权给通义听悟官网。
- 不采集用户数据。
- 源码简单，方便自行审计和修改。

## 获取方式

### Android APK

可在仓库的 [Releases](https://github.com/Givenwels/tingwu-android-webview/releases) 页面下载 APK。

最新版为 [1.0.16 正式版](https://github.com/Givenwels/tingwu-android-webview/releases/tag/v1.0.16)，使用固定专用证书签名并关闭调试功能。可覆盖安装同证书旧版正式包，历史 debug 包仅供开发验证。

### iPhone / iPad / PWA

用 Safari 打开 GitHub Pages 在线入口：

```text
https://givenwels.github.io/tingwu-android-webview/
```

然后通过 Safari 分享菜单选择 **添加到主屏幕**。PWA 源码位于仓库的 `pwa/` 目录。

## Android 版已支持

- 通义听悟和阿里登录页面在 WebView 内继续打开。
- 1.0.9 恢复 1.0.7 的手机首页和手机浏览器配置，不显示额外的“PC兼容”“实时记录”悬浮按钮，也不把电脑工作台展示为首页。
- 点击官网手机页原有“实时记录”入口时，进入独立的录音页面。只有这个页面使用桌面浏览器能力，并将官网录音页排成手机纵向布局；首页的视口、上传和记录列表不受影响。
- 1.0.10 补齐 WebView 采音需要的 `MODIFY_AUDIO_SETTINGS` 普通权限。进入录音页时先完成系统授权，再初始化官网的麦克风预检查；拒绝权限后可通过原有重试操作重新准备。录音前的语言、翻译、插图和开始按钮也使用手机布局。
- 1.0.11 修正开始录音后的手机布局：移除转写区的桌面左边距，将工具栏排进卡片，给转写正文确定的可滚动高度，并清除笔记区的负偏移，避免笔记遮挡录音控制条。
- 1.0.12 打开首页默认选中“我的/记录”，补充账号已有文件夹、子文件夹、面包屑、分类记录搜索及分页。点记录进入官网手机详情页；“全部记录”保留原有官网卡片，收藏和分享等标签仍可使用。目录只读，不创建、移动或删除文件。
- 1.0.12 在 Android 端检测录音完成后的整页导航与页面内跳转，回到手机版“我的”；结束确认弹窗的内容与按钮按手机宽度展示。采音仍在进行时不会因页面内路由改变而直接关闭录音页。
- 1.0.13 修正文件夹续页：兼容不同总数字段及服务端较短的分页，滚动接近底部时按需读取下一页，保留可点击的“加载更多”，并使用独立的滚动容器避免后续内容被裁掉。
- 1.0.13 仅在实际录音时启用麦克风前台服务及状态通知。息屏时使用有超时的 CPU 唤醒锁；亮屏、暂停、结束、离开录音或渲染进程退出后释放对应资源。准备页的短暂麦克风预检查不启动该服务，不强制亮屏，不开机自启，也不轮询页面保活。
- 两个页面共用同一应用的 Cookie 与官网存储；官网要求重新登录时，仍由用户完成官方登录。桌面工作台在准备过程中被遮罩，正常展示的只有录音配置、录音页或必要的登录弹窗。
- 1.0.14 修正文件夹记录切换：使用官网卡片的导航入口，为每条记录重新准备详情、正文和音频，返回后保留原文件夹及滚动位置。
- 1.0.14 补齐首页和详情页的系统状态栏、导航栏及屏幕开孔安全区域，避免返回按钮被系统界面遮挡。播放条使用原生布局，给网页保留独立空间。
- 1.0.14 使用 Android MediaSession 和媒体通知控制同一个官网播放器，支持通知栏、锁屏的暂停、继续与进度控制。仅适配官网播放器自动息屏暂停的行为，保留真实页面可见状态；用户主动暂停不会因返回应用而被自动撤销。
- 1.0.15 使用系统媒体面板提供跨应用播放控制。支持的小米手机可沿用顶部“听”的系统入口展开暂停、继续；移除重复的大悬浮条及其授权提示，不再申请“显示在其他应用上方”。覆盖升级时保留的旧悬浮设置不会再创建控件。应用内播放条、通知栏和锁屏控制继续使用同一媒体会话。
- 1.0.16 同步外部视频或系统音频焦点暂停后的真实播放状态，避免官网按钮仍显示播放中。后台恢复被拒绝或超时时保留暂停会话、进度和重试控制；暂停服务被关闭后，返回应用会恢复控制入口，等待用户继续播放。被动后台恢复失败不弹出打断其他应用的提示。
- 实际播放时启用媒体播放前台服务；仅在实际播放且息屏时使用有超时的 CPU 唤醒锁。暂停后退出前台、释放唤醒锁，并保留可继续的媒体会话；停止、离开当前详情、页面销毁或退出应用后清理会话和通知。不播放静音音频保活，不使用循环心跳或常亮屏幕。
- Cookie、第三方 Cookie、JavaScript 和 DOM Storage。
- Android 返回键优先返回网页历史。
- 网页文件单选、多选和 MIME 类型过滤。
- 网页明确请求图片或视频时，可使用系统文件选择器、相机或录像。
- 可信通义/阿里 HTTPS 域名可按需申请相机权限；只有精确的 `https://tingwu.aliyun.com` 来源与当前主页面都符合要求时，才允许官网请求麦克风。
- 使用官网原有的任务创建、开始、暂停、结束和保存流程。录音结束并返回后刷新手机页；录音和转写仍由官网处理，客户端不截取或代理音频。
- HTTP(S) 文件下载，携带当前 Cookie、User-Agent 和 Referer。
- `intent://`、电话、邮件、支付宝等特殊协议交给系统应用。
- 网络或 SSL 加载失败时显示重试和浏览器兜底。
- 浅色、深色系统主题。

## PWA / iPhone 版已支持

- 移动端优先启动页，适配 iPhone 和常见安卓屏幕。
- 桌面图标名称显示为「通义听悟」。
- 默认 1 秒自动跳转到通义听悟官网。
- 自动跳转失败时，可点击「进入通义听悟」按钮手动进入。
- iPhone / iPad Safari 未添加到主屏幕时，会暂停自动跳转并显示安装引导。
- 支持浅色和深色模式。

## 技术栈

Android 版：

- Kotlin
- Android WebView
- AndroidX AppCompat
- Gradle Kotlin DSL
- JUnit 4
- Android SDK 36，最低支持 Android 8.0（API 26）

PWA 版：

- Vite
- React
- TypeScript
- Tailwind CSS
- vite-plugin-pwa
- Vitest

## 安装现成 APK

APK 通过两种方式分发（任选其一）：

**方式一：在线入口页（推荐，手机直接访问）**

用手机浏览器打开：

```text
https://givenwels.github.io/tingwu-android-webview/
```

安卓手机会在启动页看到「下载安卓 App（APK）」按钮，点击即可下载。iPhone 用户按页面引导添加到主屏幕即可。

**方式二：GitHub Release 页面**

访问仓库的 [Releases 页面](https://github.com/Givenwels/tingwu-android-webview/releases)（或点击右侧「Releases」标签），优先下载固定专用证书签名的 `tingwu-vX.X.X-release.apk`。历史 `debug.apk` 仅用于功能验证：

```text
https://github.com/Givenwels/tingwu-android-webview/releases/latest
```

安装步骤：

1. 将 APK 发送到 Android 手机。
2. 在手机文件管理器中点击 APK。
3. 如果系统阻止安装，进入提示中的设置页面，为当前文件管理器或浏览器开启“允许安装未知应用”。
4. 返回并继续安装。

release APK 使用开发者自行保管的固定证书，且不可调试；这不代表阿里官方版本或已经通过手机厂商安全审核。debug APK 使用 Android 调试证书，仅适合个人测试。

播放已有录音不需要麦克风或悬浮窗权限。Android 13 及以上的媒体会话通知不受普通通知运行时权限限制。小米省电策略可能另行限制后台应用，应先确认实际播放会话与媒体通知是否正常，不能将页面跳转或播放器暂停的问题全部归为权限不足。

正式包名是 `com.tingwu.mobile`，历史测试包名是 `com.tingwu.mobile.debug`，两者可以并存。由测试包转到正式包时需要重新登录；确认正式包能看到账号内记录后，再移除旧测试包。同包名但不同证书的应用不能直接覆盖升级，请不要为安装而直接清除旧包数据。

安装来自互联网的 APK 前，请核对 Release 页面提供的 SHA-256，并只从本仓库下载。

## 使用 ADB 安装

手机打开开发者选项和 USB 调试，连接电脑后运行：

```powershell
.\.android-sdk\platform-tools\adb.exe devices
.\.android-sdk\platform-tools\adb.exe install -r ".\app\build\outputs\apk\debug\app-debug.apk"
```

如果手机上已经安装了使用不同证书签名的同包名应用，需要先卸载旧版本。

## Android 本地构建

环境：

- JDK 17
- Android SDK Platform 36
- Android Build Tools 36.0.0

项目已包含 Gradle Wrapper。本仓库当前也包含一个被 Git 忽略的项目本地 SDK，换电脑后可使用 Android Studio 自动安装 SDK。

Windows PowerShell：

```powershell
$env:JAVA_HOME = "你的 JDK 17 路径"
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

构建结果：

```text
app/build/outputs/apk/debug/app-debug.apk
```

Android Studio：

1. 打开本仓库根目录。
2. 等待 Gradle Sync 和 SDK 安装完成。
3. 选择 **Build → Build APK(s)**。

## PWA 本地运行与构建

进入 `pwa/` 目录：

```powershell
cd pwa
npm install
npm run dev
```

手机局域网预览：

```powershell
npm run dev -- --host
```

运行测试和打包：

```powershell
npm run test:run
npm run build
```

GitHub Pages 会通过 `.github/workflows/pages.yml` 自动部署 `pwa/dist`。

## 修改入口网址

Android 版本编辑 `app/build.gradle.kts`：

```kotlin
buildConfigField("String", "TINGWU_URL", "\"https://tingwu.aliyun.com/\"")
```

修改后重新构建 APK。

PWA 版本编辑 `pwa/src/config.ts`：

```ts
export const APP_CONFIG = {
  targetUrl: 'https://tingwu.aliyun.com/',
  autoRedirect: true,
  redirectDelay: 1000,
}
```

## 生成正式签名版本

先创建自己的密钥库：

```powershell
keytool -genkeypair `
  -keystore tingwu-release.jks `
  -alias tingwu `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

推荐在 Android Studio 中选择 **Build → Generate Signed App Bundle or APK**，选择 APK，并使用上面的密钥库生成 release APK。

也可通过环境变量构建固定签名的正式包：

```powershell
$env:TINGWU_KEYSTORE_PATH = "密钥库的绝对路径"
$env:TINGWU_KEYSTORE_PASSWORD = "密钥库密码"
$env:TINGWU_KEY_ALIAS = "tingwu"
# 密钥密码与密钥库密码不同时，再设置 TINGWU_KEY_PASSWORD。
npm ci --prefix scripts --ignore-scripts --no-audit --no-fund
npm test --prefix scripts
.\gradlew.bat testDebugUnitTest lintRelease assembleRelease
```

输出为 `app/build/outputs/apk/release/app-release.apk`。未提供签名环境变量时，release 构建只能生成未签名 APK。

浏览器测试需要 Node.js 18+ 与系统 Chrome。测试将官网请求替换为本地页面，并使用浏览器模拟音频设备，不使用房间中的真实麦克风，也不创建云端会议。它覆盖移动入口接管、首页不变、录音配置、320/360/412 像素下的录音前表单、转写布局、音轨停止、返回保存和旧版 JavaScript 语法；不能替代真实账号的端到端验收。

可额外运行 `npm run test:official-prestart --prefix scripts`，在独立浏览器中加载官网当前部署的录音前组件，保留官网样式和真正的麦克风预检查；账号接口和统计接口替换为本地空操作，不登录、不创建真实会议、不使用真实麦克风。组件标识或构建方式发生变化时，这项手动集成检查会报错，需重新核对官网实现。

`npm run test:official-active --prefix scripts` 使用官网实际页面外壳、标题和录音控制组件，检查 320/390/412 像素宽度下的录音中、暂停、继续、结束及纵向滚动。转写文字和笔记内容是本地测试内容，不连接真实会议服务。回归检查同时覆盖官网真实的 80 像素左边距和笔记负偏移，避免仅检查页面总宽度而漏掉内部裁切和重叠。

`npm run test:official-library --prefix scripts` 在全新浏览器中加载官网实际手机版首页和请求客户端，将账号与业务接口替换为本地数据，检查默认“我的”、文件夹层级、分类记录、手机详情路由及 320/390/412 像素布局。脚本从 document-start 注入，覆盖页面根节点尚未创建的时序；这不是对真实账号文件夹的验收。

设置环境变量 `TINGWU_TOUCH_SCROLL=1` 后运行同一检查，可用手机触摸手势验证续页；默认使用鼠标滚轮。两种方式都检查服务端每页只有七条时，27 条记录跨四页可达，并确认不会因页面追加而自动预取下一页。

`RecordingReturnTest` 对正式包检查录音完成后的整页导航与页面内历史跳转，另验证麦克风仍活动时保留录音页，停止采音后才返回。测试导航全部来自本地页面，不创建云端记录。

`RecordingMicrophoneTest` 在清空测试包数据的安卓模拟器中验证系统授权、官网相同的 `getUserMedia` 预检查、连续三次采音、`MediaRecorder` 取得音频数据以及结束释放。测试使用生产环境的录音 Activity 和 WebChromeClient，仅将网页请求替换为本地测试页；模拟器必须关闭宿主麦克风输入。真实账号的联网推流和转写仍需单独验收。

`RecordingBackgroundTest` 使用官网实际 Opus 编码器检查持续 70 秒息屏采音。在息屏期间不向 WebView 注入心跳或轮询页面；另外检查真实麦克风前台服务、状态通知、亮屏时无额外 CPU 锁，以及暂停、继续、结束后的服务与锁释放。模拟器使用静音输入，不能据此估算小米真机耗电或确认其安全中心判定。

额外的[正式包验证工具](scripts/release-harness/README.md)可直接检查已经签名、压缩且关闭调试的 release APK，无需改动该 APK。它在隔离模拟器内运行官网实际使用的录音器和 Opus 编码器，覆盖二十秒连续编码、暂停、恢复及释放麦克风；官网应用初始化和账号接口不运行。下载的官网脚本只放在临时测试目录中，不进入正式安装包。

不要把密钥库密码或签名文件提交到公开仓库。发布新版本时必须持续使用同一签名，否则 Android 无法覆盖升级。

## 权限与隐私

Manifest 只声明：

- `INTERNET`
- `ACCESS_NETWORK_STATE`
- `CAMERA`
- `RECORD_AUDIO`
- `MODIFY_AUDIO_SETTINGS`
- `WAKE_LOCK`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK`

没有声明联系人、位置、短信或旧式存储权限。

相机和麦克风都不会在 App 启动时主动申请。选择拍摄时按需申请相机；点击官网原有实时记录入口后，先申请麦克风，再加载录音页面，避免官网缓存一次失败的权限预检查。相机限可信 HTTPS 通义/阿里网页；网页麦克风进一步限制为标准 443 端口的 `https://tingwu.aliyun.com`，同时验证当前主页面，并在页面跳转时取消旧页面的待授权请求。其他网页不能获得麦克风。`MODIFY_AUDIO_SETTINGS` 是 WebView 配置音频输入设备所需的普通权限；1.0.13 另声明实际录音所需的 `FOREGROUND_SERVICE_MICROPHONE`，见 [Android 麦克风前台服务要求](https://developer.android.com/develop/background-work/services/fgs/service-types#microphone)。

开始录音时需在 App 内完成操作。官网实际进入录音并持有活动麦克风后，启动带状态通知的麦克风前台服务；预检查不启动录音服务。屏幕可以正常关闭，额外 CPU 锁仅在息屏录音期间持有，并设置超时；亮屏、暂停、结束或退出即释放。不会自动申请系统省电白名单。厂商省电策略、网络和官网会话仍需真机验证。

仅在可信页面实际播放音频/视频时启动 Android 播放前台服务，显示“通义听悟正在播放”通知，并使用有超时限制的 partial wake lock；暂停、结束、页面离开或退出应用时释放资源。普通浏览、打开应用或切后台都不会单独触发服务。Android 13+ 或部分国产系统可能仅在后台任务中显示服务。

播放状态通过指定 HTTPS 来源的 WebMessagePort 传递。录音入口和界面状态通过限定来源且校验主框架的 WebMessageListener 传递，不支持该能力的旧 WebView 使用指定来源的消息端口；不暴露通用 JavaScript 原生接口，也不传输音频内容。1.0.7 已移除改写页面可见性、拦截 `visibilitychange` 和伪装焦点的旧保活脚本，网页和系统能收到真实的可见状态。

支持 `DOCUMENT_START_SCRIPT` 的 WebView 会在官网脚本执行前开始观察播放；旧 WebView 会在页面加载完成后启用观察。旧版 WebView 若在加载完成前自动播放未挂载到页面的 Audio，可能无法识别这次已开始的播放，建议更新 Android System WebView。回到应用时会重新核对播放状态，以便重试系统此前拒绝的播放服务启动。

## 上传和下载说明

- 文件上传依赖网页标准 `<input type="file">`。
- 相机/录像入口是否出现，还取决于网页声明的文件类型、手机系统和已安装的相机应用。
- 普通 HTTP(S) 下载由 Android DownloadManager 执行。
- 下载文件放在 App 专属的外部 Downloads 目录，以避免旧式存储权限。
- `blob:` 等只存在于网页内存中的下载地址，Android DownloadManager 无法直接处理，是否可用取决于官网实现。

## 登录兼容性

本 App 尽量将通义和阿里登录跳转留在同一个 WebView 会话中。

部分身份认证服务可能基于安全策略拒绝嵌入式 WebView。若服务端明确禁止，客户端不能安全绕过；错误页中的“使用浏览器打开”可作为兜底。系统浏览器登录后的会话不一定会自动同步回 WebView。

## 常见问题

### 页面空白或一直加载

- 更新手机上的 Android System WebView 或 Chrome。
- 检查网络、VPN、代理和 DNS。
- 点击错误页的“重新加载”。

### 登录跳到支付宝或其他 App 失败

确认对应 App 已安装。若系统没有可处理特殊协议的应用，WebView 会尝试使用网页提供的 HTTPS fallback。

### 无法上传

- 检查相机权限是否被拒绝。
- 尝试选择本地文件而不是拍摄。
- 确认 Android System WebView 已更新。

### 手机界面怎样使用实时记录

1.0.13 打开首页默认进入“我的/记录”。“我的文件夹”读取当前通义听悟账号里已有的目录，可进入子文件夹、搜索分类记录或回到“全部记录”。向下滚动会按需加载后续页面，也可点击“加载更多”。点记录使用官网手机详情页。当前仅浏览分类，不提供新建或移动文件夹；目录加载失败时可点“刷新”，原有全部记录仍可使用。

1.0.10 首页保持手机版，点击网页自带的“实时记录”即可。App 接管这次点击，避免移动网页只弹出“请前往 PC”，并打开独立录音页。独立页以桌面浏览器能力运行官网流程，通过手机宽度视口和纵向卡片样式展示配置、转写、暂停、结束等控件；不会直接显示电脑工作台。首次进入时按系统提示允许麦克风，随后再加载官网录音流程。若曾拒绝，请在系统设置允许后点击“重新准备”；不会把麦克风状态伪造为已授权。

返回时优先调用官网的结束或保存操作；网页完成录音并跳回记录详情/首页后，再回到手机版并刷新。如果仍在录音，不会直接销毁页面以免丢失未保存内容。两个页面共享登录 Cookie，但网页登录策略仍可能要求补充登录。

官网的普通麦克风录音使用 `/doc/record` 流程，`/doc/live` 属于另一种记录类型。应由官网按钮完成创建与状态初始化，不直接深链接跳进一个未初始化的录音页面。

桌面标识仅作用于独立录音页。旧 WebView 不支持 User-Agent Client Hints 设置时退回桌面 User-Agent，入口桥接也有消息端口兼容分支；注入脚本避免依赖 ES2020 语法。仍建议更新 Android System WebView 或 Chrome。此方案不包含完整电脑虚拟机，也不保证官网账号下的录音、联网推流和转写已经通过真机验收。官网 DOM 改动、登录要求或账号额度仍可能影响录音。

### 小米安全中心间隔提示风险

release 包关闭调试，使用固定专用证书，不在启动时常驻保活，也不改写页面可见性。1.0.13 为用户主动开始的实际录音声明麦克风前台服务权限，并显示明确的录音通知；通知权限仅在首次实际录音时请求。暂停、结束和退出后停止服务，不申请开机自启、无障碍、悬浮窗或自动省电白名单。这些客户端约束不等同于已获得小米安全认证。

小米的最终判定还可能取决于历史扫描记录、签名、外部来源以及具体风险类别。若仍提示，请保留完整原文、风险名称、手机系统版本和 APK 版本，按小米安全中心提供的反馈或申诉入口复核。参考[小米风险应用审查标准](https://dev.mi.com/distribute/risk-app-review.html)。不要通过关闭系统安全检测来处理。

### 锁屏后音频停止

1.0.7 起，播放服务只随实际媒体播放状态启停。若特定手机仍会停止：

- 确认播放时通知栏、后台任务或任务管理中出现“通义听悟正在播放”。
- 在系统电池设置中将本 App 设为“不限制”或允许后台活动。
- 关闭省电模式后重试。
- 更新 Android System WebView 或 Chrome。

不同厂商对后台网页和音频的限制不同；若网页自身在页面不可见时主动暂停，App 尊重其行为，无法保证所有机型持续锁屏播放。

### 无法下载

确认系统下载管理器没有被禁用，并检查 App 专属 Downloads 目录或下载完成通知。

## 无真机时无法自动验证的项目

构建流程可以验证 APK、Manifest、签名和单元测试，但以下项目仍需要 Android 真机人工验收：

- 阿里账号实际登录。
- 通义听悟网页在当前账号下的上传流程。
- 相机上传、麦克风采音、官网实时推流与转写、实际锁屏播放及小米安全提示。
- 支付宝等第三方 App 跳转。
- 官网返回的实际下载类型。

## 开源与贡献

- 开源协议：[MIT License](LICENSE)
- 参与贡献：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全报告：[SECURITY.md](SECURITY.md)

欢迎提交兼容性报告和小而清晰的改进。请勿提交绕过官方登录安全策略、收集用户凭据或扩大不必要权限范围的修改。
