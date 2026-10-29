/**
 * 图。
 *
 * 不引图表库：数据量小、形状固定，手写更可控，也不给客户端加体积。
 *
 * 用色只有一条规矩：红（`--color-ledger`）是「基准线」——分布里的中位数、
 * 部门图里的全员平均、性别图里的「同酬」。红在哪里出现，哪里就是比较的基准，
 * 没有别的装饰性用法。
 *
 * 每张图只回答一个问题，所以没有图例：需要图例说明的图，说明它讲了两件事。
 */

import { useEffect, useRef, useState } from 'react'
import type { DepartmentStat, RetentionYear, SalaryBucket, TitleStat, TopEarner } from '../lib/dashboard-types'

/* ------------------------------------------------------------------ */
/* 格式化                                                              */
/* ------------------------------------------------------------------ */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const int = new Intl.NumberFormat('en-US')

/** $72,012 */
export const fmtMoney = (value: number): string => usd.format(Math.round(value))

/** $72K / $1.2M */
export const fmtMoneyShort = (value: number): string => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`
  return usd.format(value)
}

/** 300,024 */
export const fmtInt = (value: number): string => int.format(Math.round(value))

/** 0.4 → 40% */
export const fmtPercent = (value: number, digits = 0): string =>
  `${(value * 100).toFixed(digits)}%`

/** '2002-08-02' → '2002 年 8 月' */
export const fmtYearMonth = (value: string): string => {
  const match = /^(\d{4})-(\d{2})/.exec(value)
  return match ? `${match[1]} 年 ${Number(match[2])} 月` : value
}

/** '2002-08-02' → '2002.08.02'，不依赖 locale，SSR 与浏览器一致。 */
export const fmtDate = (value: string): string => {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return `${match[1]}.${match[2]}.${match[3]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`
}

/* ------------------------------------------------------------------ */
/* 滚动进度                                                            */
/* ------------------------------------------------------------------ */

/**
 * 把元素在视口里的位置换算成 0–1 的进度。
 *
 * 只在元素位于首屏之外时才「武装」：读者已经看着它的时候不能突然清空重播。
 * 首屏内直接返回 1，图就是一张静态的图。prefers-reduced-motion 同理。
 */
function useScrollProgress() {
  const ref = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(1)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    if (element.getBoundingClientRect().top > window.innerHeight * 0.85) {
      setArmed(true)
      setProgress(0)
    }

    let frame = 0
    const update = () => {
      frame = 0
      const rect = element.getBoundingClientRect()
      const height = window.innerHeight
      const value = (height * 0.88 - rect.top) / (height * 0.6)
      setProgress(Math.min(Math.max(value, 0), 1))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return { ref, progress: armed ? progress : 1 }
}

/* ------------------------------------------------------------------ */
/* 开幅图：年薪分布                                                     */
/* ------------------------------------------------------------------ */

/**
 * 整幅宽的直方图。中间半数（p25–p75）用实墨，两头留浅，中位数是一条红线。
 * 柱子上方不放标题：这张图就是标题下面的第一句话。
 */
export function SalaryDistribution({
  buckets,
  median,
  p25,
  p75,
}: {
  buckets: SalaryBucket[]
  median: number
  p25: number
  p75: number
}) {
  if (buckets.length === 0) return null

  const W = 1000
  const H = 260
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1)
  const slot = W / buckets.length
  const barWidth = Math.max(slot - 2.5, 2)

  /** 金额 → 横坐标百分比：先定位档位，再在档内插值。 */
  const percentAt = (value: number) => {
    const found = buckets.findIndex((bucket) => value >= bucket.from && value < bucket.to)
    const index = found === -1 ? buckets.length - 1 : found
    const bucket = buckets[index]
    const within =
      bucket.to === bucket.from ? 0.5 : (value - bucket.from) / (bucket.to - bucket.from)
    return ((index + Math.min(Math.max(within, 0), 1)) * slot * 100) / W
  }

  return (
    <div className="relative pt-7">
      {/* 顶部标注用 HTML，不随 SVG 一起缩放，手机上也是这个字号。 */}
      <span
        className="absolute top-0 hidden -translate-x-1/2 font-sans text-[11px] whitespace-nowrap text-ink-faint sm:inline"
        style={{ left: `${percentAt(p25)}%` }}
      >
        25% {fmtMoneyShort(p25)}
      </span>
      <span
        className="absolute top-0 -translate-x-1/2 text-[12.5px] whitespace-nowrap text-ledger"
        style={{ left: `${percentAt(median)}%` }}
      >
        中位 {fmtMoney(median)}
      </span>
      <span
        className="absolute top-0 hidden -translate-x-1/2 font-sans text-[11px] whitespace-nowrap text-ink-faint sm:inline"
        style={{ left: `${percentAt(p75)}%` }}
      >
        75% {fmtMoneyShort(p75)}
      </span>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`当前年薪分布，中位数 ${fmtMoney(median)}`}
      >
        {buckets.map((bucket, index) => {
          const height = (bucket.count / max) * H
          const inMiddle = bucket.to > p25 && bucket.from < p75
          return (
            <rect
              key={bucket.from}
              x={index * slot + (slot - barWidth) / 2}
              y={H - height}
              width={barWidth}
              height={Math.max(height, 1)}
              fill="currentColor"
              className={`plot ${inMiddle ? 'text-ink/80' : 'text-ink/18'}`}
              style={{ animationDelay: `${index * 22}ms` }}
            />
          )
        })}

        {[p25, median, p75].map((value) => (
          <line
            key={value}
            x1={(percentAt(value) * W) / 100}
            x2={(percentAt(value) * W) / 100}
            y1={0}
            y2={H}
            stroke="currentColor"
            strokeWidth={value === median ? 1.6 : 1}
            className={value === median ? 'text-ledger' : 'text-ink/20'}
          />
        ))}

        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" strokeWidth={1} className="text-ink" />
      </svg>

      {/* 横轴：档位均匀，用绝对定位放标签，省掉一整套刻度代码。 */}
      <div className="relative mt-2 h-4 font-sans text-[10.5px] text-ink-faint">
        {buckets.map((bucket, index) =>
          index % 4 === 0 || index === buckets.length - 1 ? (
            <span
              key={bucket.from}
              className={`absolute -translate-x-1/2 tabular-nums ${
                index % 8 === 0 || index === buckets.length - 1 ? '' : 'hidden sm:inline'
              }`}
              style={{ left: `${((index + 0.5) * slot * 100) / W}%` }}
            >
              {bucket.from >= 120_000 ? '120K+' : index === 0 ? '$0' : `${bucket.from / 1000}K`}
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 招聘年份：滚动时逐年读出来                                           */
/* ------------------------------------------------------------------ */

/**
 * 每年招了多少人（浅），其中多少人今天还在（深）。
 *
 * 滚动进入视口时，柱子按年份从左往右填实，上方的读数跟着走到当前这一年。
 * 这是全篇唯一的滚动动效：它回答的是「再往下一点会看到什么」，
 * 不是给页面加装饰。
 */
export function HiringTimeline({ data }: { data: RetentionYear[] }) {
  const { ref, progress } = useScrollProgress()

  if (data.length === 0) return null

  const max = Math.max(...data.map((row) => row.hired), 1)
  const revealed = Math.round(progress * data.length)
  // 读数是从头到当前这一年的累计，所以它只会往上走，不会因为滚动跳回去。
  const counted = data.slice(0, Math.max(revealed, 1))
  const hired = counted.reduce((sum, row) => sum + row.hired, 0)
  const active = counted.reduce((sum, row) => sum + row.active, 0)
  const retained = hired > 0 ? active / hired : 0
  const firstYear = counted[0].year
  const lastYear = counted[counted.length - 1].year
  const span = firstYear === lastYear ? `${firstYear}` : `${firstYear}–${lastYear}`

  return (
    <div ref={ref}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-rule pb-3">
        <span className="text-[30px] leading-none tabular-nums sm:text-[36px]">{span}</span>
        <span className="text-[14.5px] text-ink-soft">招进 {fmtInt(hired)} 人</span>
        <span className="text-[14.5px] text-ink-soft">到今天还剩 {fmtInt(active)} 人</span>
        <span className="ml-auto text-[15px] tabular-nums text-ink">{fmtPercent(retained)}</span>
      </div>

      <div className="mt-4 flex items-end gap-[3px]" role="img" aria-label="每年招进的人数，以及其中至今仍在职的人数">
        {data.map((row, index) => {
          const on = index < revealed
          // 最晚几年只有个位数的入职，给 0.6% 的地板，否则柱子低到看不见。
          const hiredHeight = Math.max((row.hired / max) * 100, 0.6)
          const activeHeight = row.active > 0 ? Math.max((row.active / max) * 100, 0.6) : 0
          return (
            <div key={row.year} className="relative h-[150px] flex-1 sm:h-[190px]">
              <div
                className={`absolute inset-x-0 bottom-0 transition-colors duration-300 ${
                  on ? 'bg-ink/20' : 'bg-ink/[0.06]'
                }`}
                style={{ height: `${hiredHeight}%` }}
              />
              <div
                className={`absolute inset-x-0 bottom-0 transition-colors duration-300 ${
                  on ? 'bg-ink/85' : 'bg-ink/15'
                }`}
                style={{ height: `${activeHeight}%` }}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex gap-[3px] font-sans text-[10.5px] text-ink-faint" aria-hidden="true">
        {data.map((row, index) => (
          <span
            key={row.year}
            className={`flex-1 text-center tabular-nums ${
              index % 2 === 0 ? '' : 'hidden sm:inline'
            } ${index === revealed - 1 ? 'text-ink' : ''}`}
          >
            {String(row.year).slice(2)}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 部门：以全员平均为中轴的偏离条                                        */
/* ------------------------------------------------------------------ */

export function DepartmentDeviation({
  rows,
  average,
}: {
  rows: DepartmentStat[]
  average: number
}) {
  const widest = Math.max(...rows.map((row) => Math.abs(row.avgSalary - average)), 1)

  return (
    <div>
      {/* 轴的刻度：左端 −$X、右端 +$X，读者才知道条形量的是多大差距 */}
      <div className="mb-1.5 grid grid-cols-[6rem_1fr_5rem] items-end gap-x-3 font-sans text-[10.5px] text-ink-faint sm:grid-cols-[8.5rem_1fr_5.5rem] sm:gap-x-4">
        <span />
        <div className="flex justify-between">
          <span>−{fmtMoneyShort(widest)}</span>
          <span className="text-ledger">平均 {fmtMoneyShort(average)}</span>
          <span>+{fmtMoneyShort(widest)}</span>
        </div>
        <span />
      </div>

      {rows.map((row) => {
        const delta = row.avgSalary - average
        const above = delta >= 0
        const width = (Math.abs(delta) / widest) * 50
        return (
          <div
            key={row.id}
            className="grid grid-cols-[6rem_1fr_5rem] items-center gap-x-3 border-b border-rule/70 py-2.5 last:border-0 sm:grid-cols-[8.5rem_1fr_5.5rem] sm:gap-x-4"
          >
            <span className="truncate text-[14px] sm:text-[15px]">{row.name}</span>

            {/* 轨道只有 12px 高，中轴线露出上下两头，不会被条形盖掉 */}
            <div className="relative h-[12px]">
              <span className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-ledger/70" />
              <span
                className={`absolute top-1/2 h-[7px] -translate-y-1/2 ${
                  above ? 'bg-ink/80' : 'bg-ink/30'
                }`}
                style={{
                  left: above ? '50%' : `${50 - width}%`,
                  width: `${Math.max(width, 0.5)}%`,
                }}
              />
            </div>

            <span className="text-right text-[13.5px] tabular-nums sm:text-[15px]">
              {fmtMoney(row.avgSalary)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 职衔：区间条，竖线是中位数                                            */
/* ------------------------------------------------------------------ */

export function TitleRanges({ titles }: { titles: TitleStat[] }) {
  const mins = titles.map((row) => row.minSalary).filter((value) => value > 0)
  const maxs = titles.map((row) => row.maxSalary).filter((value) => value > 0)
  const domainMin = mins.length ? Math.min(...mins) : 0
  const domainMax = maxs.length ? Math.max(...maxs) : 1
  const span = domainMax - domainMin || 1

  const position = (value: number) =>
    Math.min(Math.max(((value - domainMin) / span) * 100, 0), 100)

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-[4.5rem_1fr_3.5rem] items-end gap-x-3 font-sans text-[10.5px] text-ink-faint sm:grid-cols-[8.5rem_1fr_6rem] sm:gap-x-4">
        <span />
        <div className="flex justify-between">
          <span>{fmtMoneyShort(domainMin)}</span>
          <span className="text-ledger">中位数</span>
          <span>{fmtMoneyShort(domainMax)}</span>
        </div>
        <span />
      </div>

      {titles.map((row) => {
        const left = position(row.minSalary)
        const right = position(row.maxSalary)
        return (
          <div
            key={row.title}
            className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-x-3 border-b border-rule/70 py-2.5 last:border-0 sm:grid-cols-[8.5rem_1fr_6rem] sm:gap-x-4"
          >
            <span className="truncate text-[14px] sm:text-[15px]">{row.title}</span>

            <div className="relative h-[13px]">
              <span
                className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-ink/20"
                style={{ left: `${left}%`, width: `${Math.max(right - left, 0.6)}%` }}
              />
              <span
                className="absolute top-1/2 h-[13px] w-[1.5px] -translate-y-1/2 bg-ledger"
                style={{ left: `${position(row.medianSalary)}%` }}
              />
            </div>

            <span className="text-right text-[12px] tabular-nums text-ink-faint sm:text-[13px]">
              {fmtInt(row.headcount)} 人
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 性别：每个职衔内的差额，红线是零                                      */
/* ------------------------------------------------------------------ */

export function GenderGap({
  rows,
  overall,
}: {
  rows: Array<{ title: string; gap: number; headcount: number; maleAvg: number; femaleAvg: number }>
  /** 全体在职的一行，放在最后，用自己的分隔线跟各职衔分开。 */
  overall?: { label: string; gap: number }
}) {
  if (rows.length === 0) return null
  const widest = Math.max(
    ...rows.map((row) => Math.abs(row.gap)),
    Math.abs(overall?.gap ?? 0),
    0.02,
  )

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-[6rem_1fr_4.5rem] items-end gap-x-3 font-sans text-[10.5px] text-ink-faint sm:grid-cols-[8.5rem_1fr_5.5rem] sm:gap-x-4">
        <span />
        <div className="flex justify-between">
          <span>−{fmtPercent(widest, 0)}</span>
          <span className="text-ledger">同酬</span>
          <span>+{fmtPercent(widest, 0)}</span>
        </div>
        <span />
      </div>

      {rows.map((row) => {
        const width = (Math.abs(row.gap) / widest) * 50
        const negative = row.gap < 0
        return (
          <div
            key={row.title}
            className="grid grid-cols-[6rem_1fr_4.5rem] items-center gap-x-3 border-b border-rule/70 py-2.5 last:border-0 sm:grid-cols-[8.5rem_1fr_5.5rem] sm:gap-x-4"
          >
            <span className="truncate text-[14px] sm:text-[15px]">{row.title}</span>
            <div className="relative h-[12px]">
              <span className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-ledger/70" />
              <span
                className={`absolute top-1/2 h-[7px] -translate-y-1/2 ${
                  negative ? 'bg-ink/80' : 'bg-ink/35'
                }`}
                style={{
                  left: negative ? `${50 - width}%` : '50%',
                  width: `${Math.max(width, 0.5)}%`,
                }}
              />
            </div>
            <span className="text-right text-[13px] tabular-nums sm:text-[14.5px]">
              {row.gap < 0 ? '−' : '+'}
              {fmtPercent(Math.abs(row.gap), 1)}
            </span>
          </div>
        )
      })}

      {overall ? (
        <div className="grid grid-cols-[6rem_1fr_4.5rem] items-center gap-x-3 border-t border-ink pt-2.5 sm:grid-cols-[8.5rem_1fr_5.5rem] sm:gap-x-4">
          <span className="text-[14px] sm:text-[15px]">{overall.label}</span>
          <div className="relative h-[12px]">
            <span className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-ledger/70" />
            <span
              className="absolute top-1/2 h-[7px] -translate-y-1/2 bg-ink/80"
              style={{
                left:
                  overall.gap < 0
                    ? `${50 - (Math.abs(overall.gap) / widest) * 50}%`
                    : '50%',
                width: `${Math.max((Math.abs(overall.gap) / widest) * 50, 0.5)}%`,
              }}
            />
          </div>
          <span className="text-right text-[13px] tabular-nums sm:text-[14.5px]">
            {overall.gap < 0 ? '−' : '+'}
            {fmtPercent(Math.abs(overall.gap), 1)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 最高薪：十根棒棒糖，红线是中位数                                      */
/* ------------------------------------------------------------------ */

export function EarnersLadder({
  people,
  median,
}: {
  people: TopEarner[]
  median: number
}) {
  if (people.length === 0) return null
  const max = Math.max(...people.map((person) => person.salary), median, 1)
  const medianLeft = (median / max) * 100

  return (
    <div>
      <div className="relative mb-1.5 h-4 font-sans text-[10.5px] text-ink-faint">
        <span className="absolute left-0">$0</span>
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-ledger"
          style={{ left: `${medianLeft}%` }}
        >
          中位 {fmtMoneyShort(median)}
        </span>
        <span className="absolute right-0">{fmtMoneyShort(max)}</span>
      </div>

      {people.map((person, index) => {
        const width = (person.salary / max) * 100
        return (
          <div
            key={person.id}
            className="grid grid-cols-[1.5rem_1fr_5.5rem] items-center gap-x-3 border-b border-rule/70 py-2 last:border-0 sm:grid-cols-[1.5rem_1fr_6.5rem] sm:gap-x-4"
          >
            <span className="font-sans text-[10.5px] tabular-nums text-ink-faint">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="relative min-w-0">
              <span className="block truncate text-[14px] sm:text-[15px]">{person.name}</span>
              <div className="relative mt-1 h-[7px]">
                <span className="absolute inset-y-0 bg-ink/20" style={{ width: `${width}%` }} />
                <span className="absolute inset-y-0 w-[1.5px] bg-ink" style={{ left: `${width}%` }} />
                <span
                  className="absolute top-1/2 h-[11px] w-px -translate-y-1/2 bg-ledger/80"
                  style={{ left: `${medianLeft}%` }}
                />
              </div>
            </div>
            <span className="text-right text-[13.5px] tabular-nums sm:text-[15px]">
              {fmtMoney(person.salary)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
