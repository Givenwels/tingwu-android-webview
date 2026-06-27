import { useEffect } from 'react'
import { APP_CONFIG, type AppConfig } from './config'
import { getPlatformSnapshot, shouldShowIosInstallGuide } from './platform'

type AppProps = {
  config?: AppConfig
}

function App({ config = APP_CONFIG }: AppProps) {
  const showIosInstallGuide = shouldShowIosInstallGuide(getPlatformSnapshot())
  const shouldAutoRedirect = config.autoRedirect && !showIosInstallGuide

  const goToTarget = () => {
    window.location.href = config.targetUrl
  }

  useEffect(() => {
    if (!shouldAutoRedirect) {
      return
    }

    const timer = window.setTimeout(() => {
      window.location.href = config.targetUrl
    }, config.redirectDelay)

    return () => window.clearTimeout(timer)
  }, [config.redirectDelay, config.targetUrl, shouldAutoRedirect])

  return (
    <main className="app-viewport flex items-center justify-center bg-[#eef2f8] text-[#172036] dark:bg-[#0d1320] dark:text-[#edf2ff]">
      <div
        data-testid="launch-content"
        className="mx-auto flex w-full max-w-[430px] flex-col justify-center"
      >
        <section
          data-testid="launch-card"
          aria-labelledby="app-title"
          className="w-full rounded-[30px] border border-[#dfe5ef] bg-[#fbfcff] px-[clamp(1.25rem,6vw,2rem)] pb-7 pt-9 text-center shadow-[0_20px_55px_rgba(35,50,87,0.12)] dark:border-[#273149] dark:bg-[#171e2e] dark:shadow-[0_24px_60px_rgba(0,0,0,0.28)]"
        >
          <div
            aria-hidden="true"
            className="mx-auto flex size-[68px] items-center justify-center rounded-[22px] bg-[#3b5ccc] text-[32px] font-bold text-[#f8faff] shadow-[0_10px_24px_rgba(59,92,204,0.24)] dark:bg-[#6683e6] dark:text-[#10172a] dark:shadow-none"
          >
            听
          </div>

          <h1
            id="app-title"
            className="mt-7 text-[clamp(1.5rem,7vw,1.875rem)] font-bold tracking-[-0.035em]"
          >
            {config.displayName}
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-[#68738a] dark:text-[#a9b4ca]">
            {config.description}
          </p>

          <button
            type="button"
            onClick={goToTarget}
            className="mt-8 min-h-14 w-full rounded-[18px] bg-[#3b5ccc] px-6 py-3.5 text-base font-bold text-[#f8faff] shadow-[0_12px_26px_rgba(59,92,204,0.22)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:bg-[#3453bb] active:scale-[0.985] active:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3b5ccc] motion-reduce:transform-none dark:bg-[#6683e6] dark:text-[#10172a] dark:shadow-none dark:hover:bg-[#7590ee] dark:focus-visible:outline-[#8da3f2]"
          >
            进入{config.appName}
          </button>

          {showIosInstallGuide && (
            <section
              aria-label="iPhone 添加到主屏幕引导"
              className="mt-7 rounded-[22px] border border-[#d8e0ef] bg-[#f3f6fc] px-4 py-4 text-left dark:border-[#2c3853] dark:bg-[#111a2b]"
            >
              <p className="text-[15px] font-bold text-[#26334d] dark:text-[#edf2ff]">
                iPhone 上使用
              </p>
              <ol className="mt-3 space-y-2 text-[13px] leading-5 text-[#66728a] dark:text-[#aeb9cf]">
                <li>1. 请用 Safari 打开当前页面。</li>
                <li>2. 点击底部分享按钮。</li>
                <li>3. 选择“添加到主屏幕”。</li>
                <li>4. 之后从桌面图标打开，会自动进入{config.appName}。</li>
              </ol>
            </section>
          )}

          {shouldAutoRedirect && (
            <p
              role="status"
              className="mx-auto mt-5 inline-flex min-h-9 items-center rounded-full bg-[#eef2ff] px-3.5 text-[13px] font-medium text-[#52648c] dark:bg-[#222c43] dark:text-[#b9c7e8]"
            >
              <span
                aria-hidden="true"
                className="mr-2 size-1.5 rounded-full bg-[#5a78da] dark:bg-[#8da3f2]"
              />
              正在进入{config.appName}...
            </p>
          )}
        </section>

        <p className="mt-5 px-4 text-center text-[13px] leading-6 text-[#7b8599] dark:text-[#8f9bb2]">
          如果没有自动跳转，请点击按钮进入。
        </p>
      </div>
    </main>
  )
}

export default App
