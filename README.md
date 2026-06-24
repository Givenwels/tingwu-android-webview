# 通义听悟 Android WebView

[![Android CI](https://github.com/Givenwels/tingwu-android-webview/actions/workflows/android.yml/badge.svg)](https://github.com/Givenwels/tingwu-android-webview/actions/workflows/android.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

这是一个原生 Kotlin Android WebView 壳。打开 App 后会直接在 App 内加载：

```text
https://tingwu.aliyun.com/
```

登录、上传、转写、摘要等功能全部来自通义听悟官网。本工程不接通义 API，也不读取账号密码。

> [!IMPORTANT]
> 这是社区开源的非官方项目，与阿里云、通义听悟及其关联公司没有隶属、合作或背书关系。“通义听悟”等名称和商标归其权利人所有。

## 项目定位

这个项目适合希望通过 Android 桌面图标快速进入通义听悟网页的用户。它不是通义听悟的重实现，也不会代理、抓取或修改官网数据。

核心原则：

- 尽可能保持官网原始登录和使用流程。
- 相机、麦克风等敏感权限只在网页确实请求时申请。
- 不采集用户数据。
- 源码简单，方便自行审计和修改。

## 下载

可在仓库的 [Releases](https://github.com/Givenwels/tingwu-android-webview/releases) 页面下载 APK。

当前 Release 提供 debug 签名 APK，适合个人侧载和功能验证。请阅读下面的安装与安全说明。

## 已支持

- 通义听悟和阿里登录页面在 WebView 内继续打开。
- 默认使用手机端网页 UI，更符合 Android App 壳的使用方式。
- 右上角提供小型“PC兼容”按钮；只有遇到官网提示需要 PC 端时，再手动切换。
- 锁屏或普通切后台时启用后台播放保活，尽可能保持正在播放的网页音频。
- Cookie、第三方 Cookie、JavaScript 和 DOM Storage。
- Android 返回键优先返回网页历史。
- 网页文件单选、多选和 MIME 类型过滤。
- 网页明确请求图片或视频时，可使用系统文件选择器、相机或录像。
- 可信通义/阿里 HTTPS 域名可按需申请相机和麦克风权限。
- HTTP(S) 文件下载，携带当前 Cookie、User-Agent 和 Referer。
- `intent://`、电话、邮件、支付宝等特殊协议交给系统应用。
- 网络或 SSL 加载失败时显示重试和浏览器兜底。
- 浅色、深色系统主题。

## 技术栈

- Kotlin
- Android WebView
- AndroidX AppCompat
- Gradle Kotlin DSL
- JUnit 4
- Android SDK 36，最低支持 Android 8.0（API 26）

## 安装现成 APK

已构建的安装包位于：

```text
output/通义听悟-debug.apk
```

安装步骤：

1. 将 APK 发送到 Android 手机。
2. 在手机文件管理器中点击 APK。
3. 如果系统阻止安装，进入提示中的设置页面，为当前文件管理器或浏览器开启“允许安装未知应用”。
4. 返回并继续安装。

debug APK 使用 Android 调试证书签名，适合个人安装和测试，不适合提交应用商店。

安装来自互联网的 APK 前，请核对 Release 页面提供的 SHA-256，并只从本仓库下载。

## 使用 ADB 安装

手机打开开发者选项和 USB 调试，连接电脑后运行：

```powershell
.\.android-sdk\platform-tools\adb.exe devices
.\.android-sdk\platform-tools\adb.exe install -r ".\output\通义听悟-debug.apk"
```

如果手机上已经安装了使用不同证书签名的同包名应用，需要先卸载旧版本。

## 本地构建

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

1. 打开 `android-app` 目录。
2. 等待 Gradle Sync 和 SDK 安装完成。
3. 选择 **Build → Build APK(s)**。

## 修改入口网址

编辑 `app/build.gradle.kts`：

```kotlin
buildConfigField("String", "TINGWU_URL", "\"https://tingwu.aliyun.com/\"")
```

修改后重新构建 APK。

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

不要把密钥库密码或签名文件提交到公开仓库。发布新版本时必须持续使用同一签名，否则 Android 无法覆盖升级。

## 权限与隐私

Manifest 只声明：

- `INTERNET`
- `ACCESS_NETWORK_STATE`
- `CAMERA`
- `RECORD_AUDIO`
- `WAKE_LOCK`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- `FOREGROUND_SERVICE_MICROPHONE`

没有声明联系人、位置、短信或旧式存储权限。

相机和麦克风不会在启动时申请。只有可信 HTTPS 通义/阿里网页主动请求相关能力时，Android 才显示权限对话框。第三方网页不会获得媒体权限。

后台播放保活会在 App 打开时预先启动一个 Android 前台服务，并显示“通义听悟锁屏播放已启用”通知；Android 13+ 或部分国产系统如果未授予通知权限，可能只在后台任务/任务管理中显示。真正退出 App 时会停止。它使用 partial wake lock 让 CPU 不要立刻休眠，但不会点亮屏幕。

1.0.4 起，App 还会对可信通义/阿里网页注入一个轻量页面可见性保活脚本，尽量避免网页因为锁屏触发 `visibilitychange` 后主动暂停播放。

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

### “实时记录”仍然提示需要 PC 端

- 安装 1.0.2 或更高版本。
- 默认打开是手机端 UI；如“实时记录”提示需要 PC 端，点击右上角“PC兼容”按钮，页面会按 PC 兼容模式重新加载。
- 使用完 PC 兼容模式后，可点击右上角“手机模式”切回移动端 UI。
- 更新 Android System WebView 或 Chrome，然后彻底退出并重新打开 App。
- 如果旧页面仍被缓存，可在 Android 设置中清除本 App 的存储后重新登录。

PC 兼容模式通过桌面浏览器标识加载官网 PC 页面，但功能是否最终可用仍由通义听悟官网、账号权限和当前网页版本决定。

### 锁屏后音频停止

1.0.4 起，锁屏播放保活会在 App 仍处于前台时预先启动，并尽量保持网页可见性状态。若特定手机仍会停止：

- 确认通知栏、后台任务或任务管理中出现“通义听悟锁屏播放已启用”。
- 在系统电池设置中将本 App 设为“不限制”或允许后台活动。
- 关闭省电模式后重试。
- 更新 Android System WebView 或 Chrome。

不同厂商对后台网页、音频和麦克风的限制不同；如果通义听悟网页自身在页面不可见时主动暂停音频，或实时录音在长时间锁屏时被系统限制，原生壳仍可能无法完全绕过。

### 无法下载

确认系统下载管理器没有被禁用，并检查 App 专属 Downloads 目录或下载完成通知。

## 无真机时无法自动验证的项目

构建流程可以验证 APK、Manifest、签名和单元测试，但以下项目仍需要 Android 真机人工验收：

- 阿里账号实际登录。
- 通义听悟网页在当前账号下的上传流程。
- 相机、麦克风和录音行为。
- 支付宝等第三方 App 跳转。
- 官网返回的实际下载类型。

## 开源与贡献

- 开源协议：[MIT License](LICENSE)
- 参与贡献：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全报告：[SECURITY.md](SECURITY.md)

欢迎提交兼容性报告和小而清晰的改进。请勿提交绕过官方登录安全策略、收集用户凭据或扩大不必要权限范围的修改。
