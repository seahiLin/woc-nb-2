import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '员工数据看板 · People Intelligence' },
      {
        name: 'description',
        content: '读取 Neon Postgres employees 数据集的 HR 数据看板：规模、薪酬结构、部门与职衔。',
      },
      { name: 'color-scheme', content: 'dark' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-[#080a0f] text-slate-200 antialiased">{children}</body>
    </html>
  )
}
