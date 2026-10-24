import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '员工数据报告 · People Analytics' },
      {
        name: 'description',
        content:
          'Neon Postgres employees 数据集的分析报告：规模、薪酬分布、招聘留存、部门与职衔结构。',
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
