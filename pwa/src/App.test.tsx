import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { APP_CONFIG } from './config'
import { shouldShowIosInstallGuide } from './platform'

const setNavigatorValue = <K extends keyof Navigator>(
  key: K,
  value: Navigator[K],
) => {
  Object.defineProperty(window.navigator, key, {
    configurable: true,
    value,
  })
}

const mockDisplayModeStandalone = (matches: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(display-mode: standalone)' ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

const mockIosSafari = () => {
  setNavigatorValue(
    'userAgent',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  )
  setNavigatorValue('platform', 'iPhone')
  setNavigatorValue('maxTouchPoints', 5)
}

const mockDesktopBrowser = () => {
  setNavigatorValue(
    'userAgent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  )
  setNavigatorValue('platform', 'Win32')
  setNavigatorValue('maxTouchPoints', 0)
}

describe('App', () => {
  beforeEach(() => {
    vi.useRealTimers()
    window.location.href = 'http://localhost/'
    mockDesktopBrowser()
    mockDisplayModeStandalone(false)
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: false,
    })
  })

  it('renders the launch page and automatic redirect status', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: APP_CONFIG.displayName }),
    ).toBeInTheDocument()
    expect(screen.getByText(APP_CONFIG.description)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `进入${APP_CONFIG.appName}` }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      `正在进入${APP_CONFIG.appName}...`,
    )
    expect(
      screen.getByText('如果没有自动跳转，请点击按钮进入。'),
    ).toBeInTheDocument()
  })

  it('uses the mobile launch layout and touch-friendly primary action', () => {
    render(<App />)

    expect(screen.getByRole('main')).toHaveClass('app-viewport')
    expect(screen.getByTestId('launch-content')).toHaveClass(
      'max-w-[430px]',
    )
    expect(
      screen.getByRole('button', { name: `进入${APP_CONFIG.appName}` }),
    ).toHaveClass('min-h-14')
    expect(screen.getByTestId('launch-card')).toHaveClass(
      'dark:bg-[#171e2e]',
    )
  })

  it('opens the configured target when the button is clicked', () => {
    const config = {
      ...APP_CONFIG,
      autoRedirect: false,
      targetUrl: 'https://example.com/manual',
    }

    render(<App config={config} />)
    fireEvent.click(
      screen.getByRole('button', { name: `进入${config.appName}` }),
    )

    expect(window.location.href).toBe(config.targetUrl)
  })

  it('automatically redirects after the configured delay', () => {
    vi.useFakeTimers()
    const config = {
      ...APP_CONFIG,
      redirectDelay: 1250,
      targetUrl: 'https://example.com/automatic',
    }

    render(<App config={config} />)

    act(() => vi.advanceTimersByTime(1249))
    expect(window.location.href).not.toBe(config.targetUrl)

    act(() => vi.advanceTimersByTime(1))
    expect(window.location.href).toBe(config.targetUrl)
  })

  it('does not redirect or show status when automatic redirect is disabled', () => {
    vi.useFakeTimers()
    const config = {
      ...APP_CONFIG,
      autoRedirect: false,
      targetUrl: 'https://example.com/disabled',
    }

    render(<App config={config} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(config.redirectDelay * 2))
    expect(window.location.href).not.toBe(config.targetUrl)
  })

  it('shows iPhone install guidance and pauses automatic redirect before home-screen install', () => {
    vi.useFakeTimers()
    mockIosSafari()
    mockDisplayModeStandalone(false)
    const config = {
      ...APP_CONFIG,
      redirectDelay: 1000,
      targetUrl: 'https://example.com/ios',
    }

    render(<App config={config} />)

    expect(screen.getByText('iPhone 上使用')).toBeInTheDocument()
    expect(screen.getByText(/添加到主屏幕/)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(config.redirectDelay * 2))
    expect(window.location.href).not.toBe(config.targetUrl)
  })

  it('keeps automatic redirect when opened from the iPhone home screen', () => {
    vi.useFakeTimers()
    mockIosSafari()
    mockDisplayModeStandalone(true)
    const config = {
      ...APP_CONFIG,
      redirectDelay: 1000,
      targetUrl: 'https://example.com/ios-standalone',
    }

    render(<App config={config} />)

    expect(screen.queryByText('iPhone 上使用')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      `正在进入${config.appName}...`,
    )

    act(() => vi.advanceTimersByTime(config.redirectDelay))
    expect(window.location.href).toBe(config.targetUrl)
  })

  it('detects iPadOS desktop-class Safari as an iOS install target', () => {
    const shouldShowGuide = shouldShowIosInstallGuide({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      standalone: false,
      displayModeStandalone: false,
    })

    expect(shouldShowGuide).toBe(true)
  })
})
