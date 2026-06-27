# 通义听悟 PWA / iPhone 版

这是本仓库的 iPhone / iPad / 通用 PWA 版本。它和安卓 APK 版本目标一致：给手机桌面一个「通义听悟」快捷入口。

它只负责启动页和跳转，不接通义听悟 API，不做上传、转写、摘要、登录系统或后端服务。

在线入口：

```text
https://givenwels.github.io/tingwu-android-webview/
```

## 功能

- 移动端优先启动页，适配 iPhone 和常见安卓屏幕。
- 可添加到手机主屏幕，图标名称为「通义听悟」。
- 从主屏幕打开后，默认 1 秒自动进入通义听悟官网。
- 保留「进入通义听悟」按钮，自动跳转失败时可手动进入。
- iPhone / iPad Safari 未添加到主屏幕时，会暂停自动跳转并显示安装引导。
- 支持浅色和深色模式。

## 技术栈

- Vite
- React
- TypeScript
- Tailwind CSS
- vite-plugin-pwa
- Vitest

## 目录

```text
pwa/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── public/
│   ├── apple-touch-icon.png
│   ├── pwa-192x192.png
│   └── pwa-512x512.png
└── src/
    ├── App.tsx
    ├── App.test.tsx
    ├── config.ts
    ├── index.css
    ├── main.tsx
    ├── platform.ts
    └── test/
        └── setup.ts
```

## 本地运行

从仓库根目录进入本目录：

```bash
cd pwa
npm install
npm run dev
```

手机局域网预览：

```bash
npm run dev -- --host
```

运行测试：

```bash
npm run test:run
```

打包：

```bash
npm run build
```

## 修改目标网址

编辑 `src/config.ts`：

```ts
export const APP_CONFIG = {
  appName: '通义听悟',
  displayName: '通义听悟 Mobile',
  description: '手机端快捷入口',
  targetUrl: 'https://tingwu.aliyun.com/',
  autoRedirect: true,
  redirectDelay: 1000,
}
```

- `targetUrl`：自动跳转和按钮跳转的目标地址。
- `autoRedirect`：是否自动跳转。
- `redirectDelay`：自动跳转延迟，单位毫秒。

## GitHub Pages 部署

仓库根目录的 `.github/workflows/pages.yml` 会在 `pwa/` 变化后自动构建并部署到 GitHub Pages。

首次使用时，在 GitHub 仓库设置里确认：

1. 打开 **Settings → Pages**。
2. 将 **Build and deployment → Source** 设为 **GitHub Actions**。
3. 回到 **Actions**，等待 `Deploy PWA to GitHub Pages` 完成。

## iPhone Safari 添加到主屏幕

1. 用 Safari 打开在线入口。
2. 点击 Safari 分享按钮。
3. 选择 **添加到主屏幕**。
4. 名称保持「通义听悟」，点击 **添加**。
5. 回到桌面点击图标，即可像 App 一样打开。

如果没有自动跳转，请点击启动页里的「进入通义听悟」按钮。
