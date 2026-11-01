# 播放与记录切换回归

1.0.14 对两个相互独立的问题做了修正：

- 官网 H5 的 `window.uni` 没有公开导航方法。直接更改记录编号所在的 hash 会复用第一次打开的 Result 页面及音频。文件夹列表改用官网 My 卡片的 `StaticItem.toResult`，让官网创建对应页面状态；浏览器返回时等待布局和历史滚动恢复完成，再还原文件夹滚动位置。
- 官网 AudioPlayer 的 `toggleRevive('pause')` 会在页面隐藏时暂停底层音频。兼容脚本只调整此生命周期策略，保留真实 `document.hidden`、焦点和可见性事件。原生控制通过限定官网来源的消息通道调用同一个播放器，Android 媒体会话不播放任何额外音频。

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

`PlaybackBackgroundTest` 必须在隔离模拟器中运行：先安装同证书正式包与独立测试 APK，撤销麦克风、普通通知权限。三个主用例在已授予悬浮窗 app-op 的状态下运行，验证真实息屏70秒、悬浮条暂停/继续、锁屏媒体会话暂停/继续/拖动、返回按钮实际点击和 SPA 消息通道。`overlayDenialLeavesMediaSessionControlsUsable` 则单独在悬浮窗 app-op 为 deny 时运行，确认授权可拒绝且媒体会话仍然可用。测试会本地播放静音 WAV，不启用主机麦克风。

录音回归仍使用 `RecordingMicrophoneTest`、`RecordingReturnTest`、`RecordingBackgroundTest`，检查系统授权、官网实际 Opus 编码、结束返回及息屏采音。所有权限操作和应用数据准备只针对模拟器包，不能对用户真机执行清除数据或撤销权限。

系统文档：[媒体前台服务](https://developer.android.com/develop/background-work/services/fgs/service-types)、[通知权限与媒体会话豁免](https://developer.android.com/develop/ui/compose/notifications/notification-permission)。跨应用悬浮条需要用户单独授予“显示在其他应用上方”；本项目不承诺厂商系统灵动岛兼容性或安全中心认证。
