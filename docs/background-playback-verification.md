# 播放与记录切换回归

1.0.14 对两个相互独立的问题做了修正：

- 官网 H5 的 `window.uni` 没有公开导航方法。直接更改记录编号所在的 hash 会复用第一次打开的 Result 页面及音频。文件夹列表改用官网 My 卡片的 `StaticItem.toResult`，让官网创建对应页面状态；浏览器返回时等待布局和历史滚动恢复完成，再还原文件夹滚动位置。
- 官网 AudioPlayer 的 `toggleRevive('pause')` 会在页面隐藏时暂停底层音频。兼容脚本只调整此生命周期策略，保留真实 `document.hidden`、焦点和可见性事件。原生控制通过限定官网来源的消息通道调用同一个播放器，Android 媒体会话不播放任何额外音频。

1.0.15 移除与系统顶部媒体面板重复的应用悬浮条、悬浮授权提示和 `SYSTEM_ALERT_WINDOW` 声明。系统 MediaSession、MediaStyle、播放控制回调及息屏播放策略沿用1.0.14；用户已确认其小米手机的顶部“听”能够展开系统播放面板，因此无需再创建另一套跨应用界面。

1.0.16 处理外部视频打断后的恢复：Chromium 可直接暂停 HTMLAudioElement，而官网 AudioPlayer 的 onPause 只发事件，不更新自己的 playing 字段。兼容脚本现在让官网按钮跟随真实音频状态。原生恢复异常或超时后保留暂停会话；界面重新可用时可以恢复被关闭的暂停服务，不自动开始播放。正常暂停继续释放前台状态与唤醒锁。

默认离线检查：

```powershell
npm ci --prefix scripts --ignore-scripts --no-audit --no-fund
npm test --prefix scripts
.\gradlew.bat testDebugUnitTest lintDebug lintRelease assembleRelease --no-daemon
```

联网集成检查使用官网实际 H5 组件、路由与 store，业务接口和音频均为本地测试响应，不登录用户账号或创建云端记录：

```powershell
npm run test:official-navigation --prefix scripts
npm run test:official-playback --prefix scripts
npm run test:official-library --prefix scripts
```

安卓测试用到的官网运行时只放在本机临时目录，通过构建属性加入独立测试 APK；不复制进正式 APK 或提交仓库。`prepare-official-playback.cjs` 从已缓存的官网 index 和 Result 资源中提取真实音频适配器及自动暂停方法，并记录来源哈希。源码结构变化时需要人工重新检查。

```powershell
node scripts/prepare-official-playback.cjs <cached-index.js> <cached-Result.js> <temporary-assets-directory>
.\gradlew.bat -p scripts/release-harness '-PtingwuRecorderTestAssets=<temporary-assets-directory>' assembleDebug --no-daemon
```

`PlaybackBackgroundTest` 必须在隔离模拟器中运行：先安装同证书正式包与独立测试 APK，撤销麦克风、普通通知权限，不授予悬浮权限。基础用例覆盖旧悬浮设置不会创建第二条控件、系统面板真实按钮、息屏70秒与锁屏控制、返回按钮和 SPA 消息通道。外部视频用例从另一个应用 UID 启动真实 VideoView，测试永久和临时音频焦点打断后的手动/后台恢复；故障注入用例验证后台提升被拒绝后仍可重试，以及暂停服务被停止后返回应用的恢复。测试不启用主机麦克风。模拟器没有小米系统超级岛，不能替代真机验证其展开动画或小红书的具体系统策略。

外部视频用例还需要把 AndroidX 的公开测试视频放进临时测试素材目录；文件不进入正式 APK 或仓库：

```powershell
Invoke-WebRequest 'https://raw.githubusercontent.com/androidx/media/release/libraries/test_data/src/test/assets/media/mp4/sample.mp4' -OutFile '<temporary-assets-directory>/focus-video.mp4'
```

当前素材101,674字节，SHA-256为 `6AECD03E411743FEEC6E9D2BB0209ADA82F176AD45A4A44CBD2DF0EE8290C8F6`。独立测试应用通过 VideoView 请求音频焦点，不登录任何视频平台账号。`START_FOREGROUND deny` 只用于模拟器故障注入，并在 finally 中恢复 default；它证明了失败处理路径，不能据此断言用户小米设备抛出的实际异常类型。

录音回归仍使用 `RecordingMicrophoneTest`、`RecordingReturnTest`、`RecordingBackgroundTest`，检查系统授权、官网实际 Opus 编码、结束返回及息屏采音。所有权限操作和应用数据准备只针对模拟器包，不能对用户真机执行清除数据或撤销权限。

系统文档：[媒体前台服务](https://developer.android.com/develop/background-work/services/fgs/service-types)、[通知权限与媒体会话豁免](https://developer.android.com/develop/ui/compose/notifications/notification-permission)、[小米媒体通知适配](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2161)。系统岛的外观与展开手势由手机系统提供，本项目不另绘跨应用“灵动岛”，也不申请其悬浮权限。
