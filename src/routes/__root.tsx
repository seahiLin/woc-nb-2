import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '员工与薪酬' },
      {
        name: 'description',
        content:
          '一份关于员工规模、薪酬分布、招聘留存与部门结构的分析。',
      },
      { name: 'color-scheme', content: 'light' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500&display=swap"
        />
        <HeadContent />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased">
        {children}
        {/* 客户端水合入口：没有它页面只渲染一次，按钮和搜索都不会响应 */}
        <Scripts />
      </body>
    </html>
  )
}
