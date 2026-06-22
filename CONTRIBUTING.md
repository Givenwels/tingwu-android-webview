# 参与贡献

欢迎提交 Issue 和 Pull Request。

## 开发流程

1. Fork 本仓库并创建功能分支。
2. 使用 JDK 17 和 Android SDK 36。
3. 修改代码后运行：

```powershell
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

4. 确保测试、Lint 和构建全部通过。
5. Pull Request 中说明修改目的、用户影响和验证方式。

## 贡献边界

本项目定位为轻量 WebView 壳：

- 不接入或模拟通义听悟 API。
- 不收集账号、密码、Cookie 或用户文件。
- 不尝试绕过阿里登录或 WebView 安全策略。
- 不加入与网页入口无关的复杂业务功能。

涉及可信媒体域名、外部协议或权限范围的修改，请同时补充单元测试和安全说明。
