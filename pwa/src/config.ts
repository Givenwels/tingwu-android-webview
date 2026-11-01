export const APP_CONFIG = {
  appName: '通义听悟',
  displayName: '通义听悟 Mobile',
  description: '手机端快捷入口',
  targetUrl: 'https://tingwu.aliyun.com/',
  autoRedirect: true,
  redirectDelay: 1000,
  androidApkUrl:
    'https://github.com/Givenwels/tingwu-android-webview/releases/download/v1.0.14/tingwu-v1.0.14-release.apk',
  androidApkSize: '约 0.7 MB',
  androidApkVersion: 'v1.0.14',
}

export type AppConfig = typeof APP_CONFIG
