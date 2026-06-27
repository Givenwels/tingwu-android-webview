import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

const normalizeBasePath = (value?: string) => {
  if (!value || value === '/') {
    return '/'
  }

  return `/${value.replace(/^\/+|\/+$/g, '')}/`
}

export default defineConfig(() => {
  const basePath = normalizeBasePath(process.env.VITE_BASE_PATH)

  return {
    base: basePath,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png'],
        manifest: {
          name: '通义听悟',
          short_name: '听悟',
          description: '手机端快捷入口',
          lang: 'zh-CN',
          display: 'standalone',
          start_url: basePath,
          scope: basePath,
          theme_color: '#3b5ccc',
          background_color: '#f8fafc',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
      }),
    ],
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
