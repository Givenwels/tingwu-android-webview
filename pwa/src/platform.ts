export type PlatformSnapshot = {
  userAgent: string
  platform: string
  maxTouchPoints: number
  standalone: boolean
  displayModeStandalone: boolean
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean
}

export function getPlatformSnapshot(): PlatformSnapshot {
  const navigatorWithStandalone = window.navigator as NavigatorWithStandalone

  return {
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    maxTouchPoints: window.navigator.maxTouchPoints ?? 0,
    standalone: Boolean(navigatorWithStandalone.standalone),
    displayModeStandalone: Boolean(
      window.matchMedia?.('(display-mode: standalone)').matches,
    ),
  }
}

export function isIosLike(snapshot: PlatformSnapshot): boolean {
  const userAgent = snapshot.userAgent.toLowerCase()
  const platform = snapshot.platform.toLowerCase()
  const isClassicIos = /iphone|ipad|ipod/.test(userAgent)
  const isIpadDesktopMode =
    platform === 'macintel' && snapshot.maxTouchPoints > 1

  return isClassicIos || isIpadDesktopMode
}

export function isStandalone(snapshot: PlatformSnapshot): boolean {
  return snapshot.standalone || snapshot.displayModeStandalone
}

export function shouldShowIosInstallGuide(
  snapshot: PlatformSnapshot,
): boolean {
  return isIosLike(snapshot) && !isStandalone(snapshot)
}
