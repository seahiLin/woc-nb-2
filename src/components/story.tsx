/**
 * 文章的版式原语。
 *
 * 结构照数据故事的惯例来：封面（标题 + 一句副题 + 一张开幅图）→ 导语 →
 * 若干节，每节一条结论 → 结尾与口径。
 *
 * 版面只有一条规矩：正文永远在窄栏里（中文一行三十字上下），图永远比正文
 * 宽。宽与窄的对比就是版面全部的装饰，不需要卡片、底色或分隔装饰线。
 */

import type { ReactNode } from 'react'

/** 正文栏。`lead` 用于导语：字号更大、颜色更沉，读者先读这一句。 */
export function Prose({ children, lead = false }: { children: ReactNode; lead?: boolean }) {
  return (
    <p
      className={
        lead
          ? 'mx-auto max-w-[34rem] text-[18.5px] leading-[1.8] text-ink-soft sm:text-[19.5px]'
          : 'mx-auto mt-5 max-w-[34rem] text-[16.5px] leading-[1.85] text-ink-soft'
      }
    >
      {children}
    </p>
  )
}

/**
 * 一节 = 一条结论 + 一块图。
 * 标题就是结论，所以不另加栏目名、编号或小标签。
 */
export function Chapter({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-20 border-t border-rule pt-10 sm:mt-28 sm:pt-12">
      <h2 className="mx-auto max-w-[34rem] text-[25px] leading-[1.36] font-medium tracking-[-0.01em] text-balance sm:text-[29px]">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** 图：占满整幅宽度（比正文栏宽），下面可以带一行注。 */
export function Figure({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <figure className="mt-8">
      {children}
      {note ? (
        <figcaption className="mx-auto mt-3 max-w-[34rem] font-sans text-[11.5px] leading-relaxed text-ink-faint">
          {note}
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * 章节之间的一个巨号数字。
 * 全篇只用一次：它是节拍，不是装饰。
 */
export function BigNumber({
  value,
  caption,
}: {
  value: string
  caption: ReactNode
}) {
  return (
    <div className="mt-20 border-y border-rule py-10 sm:mt-28 sm:py-14">
      <div className="mx-auto max-w-[34rem]">
        <p className="text-[64px] leading-[0.92] font-medium tracking-[-0.035em] sm:text-[104px]">
          {value}
        </p>
        <p className="mt-6 max-w-[26rem] text-[16.5px] leading-[1.85] text-ink-soft">{caption}</p>
      </div>
    </div>
  )
}

/** 结尾的统计口径：小一号的字，只交代定义，不解释怎么读图。 */
export function MethodNote({ children }: { children: ReactNode }) {
  return (
    <section className="mt-24 border-t border-ink pt-6 sm:mt-32">
      <h2 className="font-sans text-[11.5px] tracking-[0.02em] text-ink-faint">统计口径</h2>
      <div className="mt-3 grid max-w-[52rem] gap-x-10 gap-y-3 text-[13.5px] leading-[1.75] text-ink-soft sm:grid-cols-2">
        {children}
      </div>
    </section>
  )
}
