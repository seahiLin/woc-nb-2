import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findEmployees, getDashboard, pingDatabaseFn } from '../lib/dashboard.functions'
import type { Dashboard, DepartmentStat, EmployeeRow, TitleStat } from '../lib/dashboard-types'
import {
  DistributionChart,
  Legend,
  RangeBar,
  RetentionChart,
  Section,
  TrendChart,
  fmtDate,
  fmtDelta,
  fmtInt,
  fmtMoney,
  fmtMoneyShort,
  fmtPercent,
  fmtYearMonth,
} from '../components/charts'

export const Route = createFileRoute('/')({
  loader: () => getDashboard({ data: { force: false } }),
  component: DashboardPage,
})

function DashboardPage() {
  const initial = Route.useLoaderData()
  const fetchDashboard = useServerFn(getDashboard)
  const checkDatabase = useServerFn(pingDatabaseFn)

  const [result, setResult] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)

  const dashboard = result.dashboard

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setResult(await fetchDashboard({ data: { force: true } }))
    } finally {
      setRefreshing(false)
    }
  }, [fetchDashboard])

  const retry = useCallback(async () => {
    setRefreshing(true)
    try {
      const status = await checkDatabase()
      if (status.ok) {
        setResult(await fetchDashboard({ data: { force: true } }))
      } else {
        setResult((prev) => ({ ...prev, error: status.error, live: false }))
      }
    } finally {
      setRefreshing(false)
    }
  }, [checkDatabase, fetchDashboard])

  return (
    <div className="min-h-screen bg-paper">
      <TopBar dashboard={dashboard} refreshing={refreshing} onRefresh={refresh} />

      <main className="mx-auto max-w-[1140px] px-5 pb-24 sm:px-8">
        {dashboard ? (
          <>
            <Hero dashboard={dashboard} />
            <Findings dashboard={dashboard} />
            <Report dashboard={dashboard} />
          </>
        ) : (
          <Unavailable error={result.error} onRetry={retry} />
        )}

        {dashboard ? <SearchPanel /> : null}

        <footer className="mt-20 flex flex-col gap-2 border-t border-rule pt-6 text-[11.5px] text-ink-faint sm:flex-row sm:items-baseline sm:justify-between">
          <p>
            {dashboard
              ? `${dashboard.totals.firstHire.slice(0, 4)}–${dashboard.totals.lastHire.slice(0, 4)} 年入职记录 · 数据截至 ${fmtYearMonth(dashboard.asOf)}`
              : '暂无数据'}
          </p>
          <p className="font-mono">
            {dashboard ? `更新于 ${fmtDate(dashboard.generatedAt)}` : ''}
          </p>
        </footer>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 顶栏                                                                */
/* ------------------------------------------------------------------ */

function TopBar({
  dashboard,
  refreshing,
  onRefresh,
}: {
  dashboard: Dashboard | null
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-rule/80 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1140px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-paper" />
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-ink">
            员工与薪酬
          </span>
          <span className="hidden text-[12px] text-ink-faint sm:inline">
            {dashboard ? `数据截至 ${fmtYearMonth(dashboard.asOf)}` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-full border border-rule-strong px-3 py-1 text-[11.5px] text-ink-soft transition hover:border-ink/30 hover:text-ink disabled:opacity-40"
        >
          {refreshing ? '更新中…' : '更新数据'}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 首屏：一句话结论 + 四个关键数字                                       */
/* ------------------------------------------------------------------ */

function Hero({ dashboard }: { dashboard: Dashboard }) {
  const { totals, departments } = dashboard

  const highestDept = useMemo(
    () => departments.reduce((best, d) => (d.avgSalary > best.avgSalary ? d : best), departments[0]),
    [departments],
  )

  return (
    <header className="settle pt-14 pb-12 sm:pt-20">
      <p className="font-mono text-[10.5px] tracking-[0.24em] text-accent uppercase">
        员工结构与薪酬报告
      </p>

      <h1 className="mt-4 max-w-[24ch] text-[38px] leading-[1.04] font-semibold tracking-[-0.03em] text-ink sm:text-[56px]">
        {fmtInt(totals.activeEmployees)} 人在职，
        <br />
        中位年薪 {fmtMoneyShort(totals.medianSalary)}
      </h1>

      <p className="mt-6 max-w-[56ch] text-[15px] leading-[1.75] text-ink-soft">
        截至 {fmtYearMonth(dashboard.asOf)}，{fmtInt(totals.activeEmployees)} 人分布在{' '}
        {fmtInt(totals.departments)} 个部门。半数人的年薪落在 {fmtMoney(totals.p25Salary)} 与{' '}
        {fmtMoney(totals.p75Salary)} 之间，最高的是 {highestDept?.name}（平均{' '}
        {fmtMoney(highestDept?.avgSalary ?? 0)}）。
      </p>

      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-rule py-8 sm:grid-cols-4">
        <HeroStat
          label="在职员工"
          value={fmtInt(totals.activeEmployees)}
          note={`累计 ${fmtInt(totals.employees)} 人曾在此工作`}
        />
        <HeroStat
          label="中位年薪"
          value={fmtMoney(totals.medianSalary)}
          note={`均值 ${fmtMoney(totals.avgSalary)}`}
          accent
        />
        <HeroStat
          label="平均司龄"
          value={`${totals.avgTenureYears} 年`}
          note={`相对 ${fmtYearMonth(dashboard.asOf)} 计算`}
        />
        <HeroStat
          label="年薪区间"
          value={fmtMoneyShort(totals.maxSalary)}
          note={`最高值 · 最低 ${fmtMoneyShort(totals.minSalary)}`}
        />
      </dl>
    </header>
  )
}

function HeroStat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string
  value: string
  note: string
  accent?: boolean
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-[0.18em] text-ink-faint uppercase">
        {label}
      </dt>
      <dd
        className={`mt-2.5 text-[30px] leading-none font-semibold tabular tracking-[-0.02em] sm:text-[34px] ${
          accent ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </dd>
      <dd className="mt-2 text-[12px] leading-snug text-ink-soft">{note}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 关键发现                                                            */
/* ------------------------------------------------------------------ */

function Findings({ dashboard }: { dashboard: Dashboard }) {
  const { totals, departments, retention, titles, gender } = dashboard

  // 薪酬最高的部门与公司均值的差（不写死部门名）。
  const topPaid = departments.reduce(
    (best, d) => (d.avgSalary > best.avgSalary ? d : best),
    departments[0],
  )
  const topPremium =
    topPaid && totals.avgSalary > 0
      ? (topPaid.avgSalary - totals.avgSalary) / totals.avgSalary
      : 0

  const firstYear = retention[0]
  const lastYear = retention[retention.length - 1]
  const hiringDrop =
    firstYear && lastYear && firstYear.hired > 0
      ? (lastYear.hired - firstYear.hired) / firstYear.hired
      : 0

  // 同岗性别差异：只看样本量足够大的职衔（Manager 只有 9 人，不具统计意义）。
  const gaps = titles
    .filter((t) => t.maleAvg > 0 && t.femaleAvg > 0 && t.headcount >= 3000)
    .map((t) => Math.abs((t.femaleAvg - t.maleAvg) / t.maleAvg))
  const worstGap = gaps.length ? Math.max(...gaps) : 0

  const femaleShare =
    gender.male.headcount + gender.female.headcount > 0
      ? gender.female.headcount / (gender.male.headcount + gender.female.headcount)
      : 0

  // 薪酬最高的部门 = 一条“谁能拿到最多”的结论，比“差异”更有用。
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-rule bg-rule md:grid-cols-3">
      <Finding
        kicker="最舍得给钱的部门"
        value={topPaid?.name ?? '—'}
        detail={`平均 ${fmtMoney(topPaid?.avgSalary ?? 0)}`}
        caption={
          topPaid
            ? `比公司均值高 ${fmtPercent(topPremium, 0)}；该部门 ${fmtInt(topPaid.headcount)} 人。`
            : '—'
        }
        accent
      />
      <Finding
        kicker="招聘规模"
        value={fmtDelta(hiringDrop, 0)}
        detail={`${firstYear?.year ?? '—'} → ${lastYear?.year ?? '—'}`}
        caption={
          firstYear && lastYear
            ? `从 ${fmtInt(firstYear.hired)} 人降到 ${fmtInt(lastYear.hired)} 人。`
            : '—'
        }
      />
      <Finding
        kicker="同岗性别差异"
        value={fmtPercent(worstGap, 1)}
        detail="最大差距"
        caption={`同一职衔内男女平均薪酬几乎持平；整体女性占 ${fmtPercent(femaleShare, 0)}。`}
      />
    </div>
  )
}

function Finding({
  kicker,
  value,
  detail,
  caption,
  accent = false,
}: {
  kicker: string
  value: string
  detail: string
  caption: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col bg-paper-raised p-6">
      <p className="font-mono text-[10px] tracking-[0.18em] text-ink-faint uppercase">{kicker}</p>
      <p
        className={`mt-3 text-[26px] leading-none font-semibold tabular tracking-[-0.02em] ${
          accent ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="mt-2 font-mono text-[11px] tabular text-ink-soft">{detail}</p>
      <p className="mt-3 border-t border-rule pt-3 text-[12px] leading-relaxed text-ink-faint">
        {caption}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 报告主体                                                            */
/* ------------------------------------------------------------------ */

function Report({ dashboard }: { dashboard: Dashboard }) {
  const { totals, distribution, retention, departments, titles, gender, salaryTrend, topEarners } =
    dashboard

  const salaryDomain = useMemo(() => {
    const mins = titles.map((t) => t.minSalary).filter((v) => v > 0)
    const maxs = titles.map((t) => t.maxSalary).filter((v) => v > 0)
    return {
      min: mins.length ? Math.min(...mins) : 0,
      max: maxs.length ? Math.max(...maxs) : 1,
    }
  }, [titles])

  const peakBucket = distribution.buckets.reduce(
    (best, bucket) => (bucket.count > best.count ? bucket : best),
    distribution.buckets[0] ?? { from: 0, to: 0, count: 0 },
  )

  const firstYear = retention[0]
  const lastYear = retention[retention.length - 1]

  const trendGrowth =
    salaryTrend.length > 1 && salaryTrend[0].avgSalary > 0
      ? (salaryTrend[salaryTrend.length - 1].avgSalary - salaryTrend[0].avgSalary) /
        salaryTrend[0].avgSalary
      : 0

  // 部门按平均薪酬排名，用于“人多的部门不一定给得多”这句结论。
  const bySalary = [...departments].sort((a, b) => b.avgSalary - a.avgSalary)
  const topPaid = bySalary[0]
  const topPaidHeadcountRank = topPaid
    ? departments.findIndex((d) => d.id === topPaid.id) + 1
    : 0
  const biggest = departments[0]
  const biggestSalaryRank = biggest
    ? bySalary.findIndex((d) => d.id === biggest.id) + 1
    : 0

  // 留存：每年入职者中至今仍在职的平均比例。
  const avgRetention =
    retention.length > 0
      ? retention.reduce(
          (sum, row) => sum + (row.hired > 0 ? row.active / row.hired : 0),
          0,
        ) / retention.length
      : 0

  const hiringDrop =
    firstYear && lastYear && firstYear.hired > 0
      ? (lastYear.hired - firstYear.hired) / firstYear.hired
      : 0

  return (
    <div className="space-y-16">
      {/* 01 薪酬分布 ------------------------------------------------ */}
      <Section
        eyebrow="01 / 薪酬水平"
        title={`大多数人的年薪在 ${fmtMoneyShort(peakBucket.from)}–${fmtMoneyShort(peakBucket.to)}`}
        lede={
          <>
            把 {fmtInt(totals.activeEmployees)} 名在职员工的当前年薪按 $5K 一档切分。
            分布明显右偏：人数最多的一档是 {fmtMoneyShort(peakBucket.from)}–
            {fmtMoneyShort(peakBucket.to)}，但均值被少数高薪者拉高到中位数之上 ——
            均值 {fmtMoney(distribution.mean)}，中位数 {fmtMoney(distribution.median)}。
          </>
        }
        aside={
          <Legend
            items={[
              { label: '中位数', color: 'var(--color-accent)' },
              { label: '均值', color: 'var(--color-teal)' },
            ]}
          />
        }
      >
        <div className="rounded-sm border border-rule bg-paper-raised px-4 pt-5 pb-2 sm:px-6">
          <DistributionChart
            buckets={distribution.buckets}
            median={distribution.median}
            mean={distribution.mean}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-4">
          <PercentileTile label="P25" value={fmtMoney(totals.p25Salary)} note="四分之一的人低于此" />
          <PercentileTile label="中位数" value={fmtMoney(totals.medianSalary)} note="一半人低于此" accent />
          <PercentileTile label="均值" value={fmtMoney(totals.avgSalary)} note="被高薪者拉高" />
          <PercentileTile label="P75" value={fmtMoney(totals.p75Salary)} note="四分之一的人高于此" />
        </div>
      </Section>

      {/* 02 部门 ---------------------------------------------------- */}
      <Section
        eyebrow="02 / 部门"
        title="人多的部门不一定给得多"
        lede={
          <>
            {biggest?.name} 是最大的部门（{fmtInt(biggest?.headcount ?? 0)} 人），
            平均薪酬排第 {biggestSalaryRank || '—'}；而薪酬最高的 {topPaid?.name}
            （平均 {fmtMoney(topPaid?.avgSalary ?? 0)}）人数只排第 {topPaidHeadcountRank || '—'}。
          </>
        }
        aside="条形 = 平均年薪 · 竖线 = 中位数"
      >
        <DepartmentBars departments={departments} />
      </Section>

      {/* 03 招聘与留存 ---------------------------------------------- */}
      <Section
        eyebrow="03 / 招聘与留存"
        title={`招聘规模 ${firstYear?.year ?? ''}–${lastYear?.year ?? ''} 年缩了 ${fmtPercent(Math.abs(hiringDrop), 0)}`}
        lede={
          <>
            {firstYear?.year} 年入职 {fmtInt(firstYear?.hired ?? 0)} 人，
            {lastYear?.year} 年只有 {fmtInt(lastYear?.hired ?? 0)} 人。
            但留下来的人比例很稳定：各年入职者到 {fmtYearMonth(dashboard.asOf)} 的平均留存率是{' '}
            {fmtPercent(avgRetention, 0)}。
          </>
        }
        aside={<Legend items={[{ label: '至今在职', color: '#131519' }, { label: '已离开', color: '#d8d2c6' }]} />}
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-sm border border-rule bg-paper-raised px-4 py-5 sm:px-6">
            <RetentionChart data={retention} />
          </div>
          <div className="space-y-6">
            <Fact
              term="最早一批人"
              detail={`${firstYear?.year} 年入职的 ${fmtInt(firstYear?.hired ?? 0)} 人中，仍有 ${fmtInt(
                firstYear?.active ?? 0,
              )} 人在职（${fmtPercent((firstYear?.active ?? 0) / Math.max(firstYear?.hired ?? 1, 1), 0)}）。`}
            />
            <Fact
              term="平均司龄"
              detail={`在职员工平均已工作 ${totals.avgTenureYears} 年。这是一份“组织趋于稳定”的快照，而不是快速扩张期的公司。`}
            />
            <Fact
              term="薪酬随年份"
              detail={`${salaryTrend[0]?.year} 年平均 ${fmtMoney(
                salaryTrend[0]?.avgSalary ?? 0,
              )}，${salaryTrend[salaryTrend.length - 1]?.year} 年升到 ${fmtMoney(
                salaryTrend[salaryTrend.length - 1]?.avgSalary ?? 0,
              )}，累计 +${fmtPercent(trendGrowth, 0)}。`}
            />
          </div>
        </div>

        <div className="mt-8 rounded-sm border border-rule bg-paper-raised px-4 pt-5 pb-2 sm:px-6">
          <p className="mb-3 font-mono text-[10px] tracking-[0.18em] text-ink-faint uppercase">
            历年平均薪资
          </p>
          <TrendChart points={salaryTrend} />
        </div>
      </Section>

      {/* 04 职衔与性别 ---------------------------------------------- */}
      <Section
        eyebrow="04 / 职衔与性别"
        title="总额差距来自岗位构成，不是同岗差异"
        lede={
          <>
            {titles.length} 个职衔里，{titles[0]?.title} 与 {titles[1]?.title} 两个就占了
            {fmtPercent(
              ((titles[0]?.headcount ?? 0) + (titles[1]?.headcount ?? 0)) /
                Math.max(
                  titles.reduce((sum, t) => sum + t.headcount, 0),
                  1,
                ),
              0,
            )}
            。整体女性占 {fmtPercent(femaleShare(gender), 0)}，
            而在每个职衔内部，男女平均薪酬几乎一致。
          </>
        }
        aside="右侧：同职衔内 女性 − 男性 平均年薪"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.35fr_1fr]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule-strong">
                  <Th>职衔</Th>
                  <Th align="right">人数</Th>
                  <Th align="right">平均年薪</Th>
                  <Th className="w-[150px]">区间</Th>
                  <Th align="right">女性</Th>
                </tr>
              </thead>
              <tbody>
                {titles.map((row) => (
                  <tr key={row.title} className="border-b border-rule/70">
                    <td className="py-3 pr-4 text-[13px] font-medium text-ink">{row.title}</td>
                    <td className="py-3 pr-4 text-right font-mono text-[12px] tabular text-ink-soft">
                      {fmtInt(row.headcount)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-[12.5px] tabular text-ink">
                      {fmtMoney(row.avgSalary)}
                    </td>
                    <td className="py-3 pr-4">
                      <RangeBar
                        min={row.minSalary}
                        max={row.maxSalary}
                        median={row.medianSalary}
                        domainMin={salaryDomain.min}
                        domainMax={salaryDomain.max}
                      />
                    </td>
                    <td className="py-3 text-right font-mono text-[12px] tabular text-ink-faint">
                      {fmtPercent(row.femaleShare, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <GenderGap titles={titles} gender={gender} />
        </div>
      </Section>

      {/* 05 薪酬最高 ------------------------------------------------ */}
      <Section
        eyebrow="05 / 薪酬最高"
        title="当前薪酬最高的十人"
        lede={
          <>
            这十人里 {topEarners.filter((p) => p.department === topEarners[0]?.department).length}{' '}
            人来自 {topEarners[0]?.department ?? '—'}，{topEarners.filter((p) => p.title === topEarners[0]?.title).length}{' '}
            人的职衔是 {topEarners[0]?.title ?? '—'}。第 1 名比第 10 名多拿{' '}
            {fmtPercent(
              ((topEarners[0]?.salary ?? 0) - (topEarners[topEarners.length - 1]?.salary ?? 0)) /
                Math.max(topEarners[0]?.salary ?? 1, 1),
              0,
            )}。
          </>
        }
      >
        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-2">
          {topEarners.map((person, index) => (
            <li
              key={person.id}
              className="flex items-baseline gap-4 bg-paper-raised px-5 py-4"
            >
              <span className="w-5 shrink-0 font-mono text-[11px] tabular text-ink-faint">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{person.name}</p>
                <p className="truncate text-[11.5px] text-ink-soft">
                  {person.title ?? '—'} · {person.department ?? '—'}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[13.5px] tabular font-semibold text-ink">
                {fmtMoney(person.salary)}
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}

const femaleShare = (gender: Dashboard['gender']) => {
  const total = gender.male.headcount + gender.female.headcount
  return total > 0 ? gender.female.headcount / total : 0
}

/* ------------------------------------------------------------------ */
/* 部门条形图                                                          */
/* ------------------------------------------------------------------ */

function DepartmentBars({ departments }: { departments: DepartmentStat[] }) {
  const max = Math.max(...departments.map((d) => d.avgSalary), 1)
  const min = Math.min(...departments.map((d) => d.avgSalary), max)
  const floor = Math.max(min * 0.9, 0)
  const span = Math.max(max - floor, 1)

  return (
    <div className="rounded-sm border border-rule bg-paper-raised px-5 py-6 sm:px-7">
      <div className="space-y-4">
        {departments.map((dept) => {
          const width = ((dept.avgSalary - floor) / span) * 100
          return (
            <div key={dept.id} className="group">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[13.5px] font-medium text-ink">{dept.name}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">
                    {fmtInt(dept.headcount)} 人 · {fmtPercent(dept.share, 0)}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[12.5px] tabular font-medium text-ink">
                  {fmtMoney(dept.avgSalary)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-3">
                <div className="relative h-[9px] flex-1 overflow-hidden rounded-full bg-ink/[0.05]">
                  <div
                    className="grow h-full rounded-full bg-ink/70 transition-colors group-hover:bg-accent"
                    style={{ width: `${Math.max(width, 2)}%` }}
                  />
                  <div
                    className="absolute top-0 h-full w-[2px] bg-ink"
                    style={{
                      left: `${Math.min(
                        Math.max(
                          ((dept.medianSalary - floor) / span) * 100,
                          0,
                        ),
                        100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="w-[68px] shrink-0 text-right font-mono text-[11px] tabular text-ink-faint">
                  中位 {fmtMoneyShort(dept.medianSalary)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
                <span className="font-mono tabular">
                  {fmtMoneyShort(dept.minSalary)} – {fmtMoneyShort(dept.maxSalary)}
                </span>
                {dept.manager ? (
                  <>
                    <span className="h-2.5 w-px bg-rule-strong" />
                    <span className="truncate">
                      经理 {dept.manager.name} · {fmtYearMonth(dept.manager.since)} 起
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-6 border-t border-rule pt-3 font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">
        条形 = 平均年薪 · 竖线 = 中位数 · 区间 = 最低–最高
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 性别差异                                                            */
/* ------------------------------------------------------------------ */

function GenderGap({
  titles,
  gender,
}: {
  titles: TitleStat[]
  gender: Dashboard['gender']
}) {
  const rows = titles
    .filter((t) => t.maleAvg > 0 && t.femaleAvg > 0 && t.headcount >= 3000)
    .map((t) => ({
      title: t.title,
      gap: (t.femaleAvg - t.maleAvg) / t.maleAvg,
      maleAvg: t.maleAvg,
      femaleAvg: t.femaleAvg,
      headcount: t.headcount,
    }))
    .sort((a, b) => b.headcount - a.headcount)
    .slice(0, 5)

  const overall =
    gender.male.avgSalary > 0
      ? (gender.female.avgSalary - gender.male.avgSalary) / gender.male.avgSalary
      : 0

  return (
    <div className="rounded-sm border border-rule bg-paper-raised p-5 sm:p-6">
      <p className="mb-4 font-mono text-[10px] tracking-[0.18em] text-ink-faint uppercase">
        同职衔男女平均年薪
      </p>
      <div className="space-y-5">
        {rows.map((row) => (
          <div key={row.title}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12.5px] text-ink">{row.title}</span>
              <span className="shrink-0 font-mono text-[12px] tabular text-ink-soft">
                {fmtDelta(row.gap, 1)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="w-[54px] shrink-0 font-mono text-[10.5px] tabular text-ink-faint">
                男 {fmtMoneyShort(row.maleAvg)}
              </span>
              <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                <div
                  className="h-full rounded-full bg-teal/60"
                  style={{ width: `${Math.min((row.femaleAvg / row.maleAvg) * 100, 100)}%` }}
                />
              </div>
              <span className="w-[58px] shrink-0 text-right font-mono text-[10.5px] tabular text-ink-faint">
                女 {fmtMoneyShort(row.femaleAvg)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-rule pt-4">
        <p className="text-[12px] leading-relaxed text-ink-soft">
          全员口径下女性平均 {fmtMoney(gender.female.avgSalary)}、男性{' '}
          {fmtMoney(gender.male.avgSalary)}，差 {fmtDelta(overall, 1)}。拆到职衔内部差异更小，
          说明总额差距主要来自职衔构成。
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 检索                                                                */
/* ------------------------------------------------------------------ */

function SearchPanel() {
  const fetchEmployees = useServerFn(findEmployees)
  const [term, setTerm] = useState('')
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const query = term.trim()
    if (!query) {
      setRows([])
      setTruncated(false)
      setError(null)
      setState('idle')
      return
    }
    setState('loading')
    const handle = setTimeout(() => {
      fetchEmployees({ data: { term: query } })
        .then((response) => {
          setRows(response.rows)
          setTruncated(response.truncated)
          setError(response.error)
          setState('done')
        })
        .catch((cause: unknown) => {
          setRows([])
          setError(cause instanceof Error ? cause.message : '查询失败')
          setState('done')
        })
    }, 250)
    return () => clearTimeout(handle)
  }, [term, fetchEmployees])

  return (
    <Section
      eyebrow="06 / 员工检索"
      title="查一个人"
      lede="按工号精确查，或按姓 / 名的片段模糊查，直接看这个人现在的职衔、部门和年薪。"
      aside={
        <button
          type="button"
          onClick={() => {
            setTerm('')
            inputRef.current?.focus()
          }}
          className="text-[11.5px] text-ink-soft underline-offset-2 transition hover:text-ink hover:underline"
        >
          清空
        </button>
      }
    >
      <div className="rounded-sm border border-rule bg-paper-raised p-5 sm:p-6">
        <div className="relative">
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="例如 43624、Pesch、Tokuyasu"
            className="w-full rounded-sm border border-rule-strong bg-paper px-4 py-3 font-mono text-[13px] text-ink outline-none transition placeholder:font-sans placeholder:text-ink-faint focus:border-ink/40 focus:bg-paper-raised"
          />
          {state === 'loading' ? (
            <span className="absolute top-1/2 right-4 -translate-y-1/2 font-mono text-[10.5px] text-ink-faint">
              查询中…
            </span>
          ) : null}
        </div>

        <div className="mt-4">
          {state === 'idle' ? (
            <p className="text-[12.5px] text-ink-faint">输入关键字开始检索。</p>
          ) : state === 'loading' ? (
            <p className="text-[12.5px] text-ink-faint">正在查询…</p>
          ) : error ? (
            <p className="text-[12.5px] text-danger">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-[12.5px] text-ink-faint">没有匹配的员工。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule-strong">
                    <Th>工号</Th>
                    <Th>姓名</Th>
                    <Th>职衔</Th>
                    <Th>部门</Th>
                    <Th align="right">当前年薪</Th>
                    <Th align="right">入职</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-rule/70 transition-colors hover:bg-ink/[0.02]">
                      <td className="py-2.5 pr-4 font-mono text-[12px] tabular text-ink-faint">
                        {row.id}
                      </td>
                      <td className="py-2.5 pr-4 text-[13px] text-ink">
                        {row.name}
                        <span className="ml-1.5 font-mono text-[10px] text-ink-faint">
                          {row.gender}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-[12.5px] text-ink-soft">{row.title ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-[12.5px] text-ink-soft">
                        {row.department ?? '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-[12.5px] tabular text-ink">
                        {row.salary === null ? '—' : fmtMoney(row.salary)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[12px] tabular text-ink-faint">
                        {fmtDate(row.hireDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {truncated ? (
                <p className="mt-2 text-[11px] text-ink-faint">
                  结果超过 25 条，只显示前 25 条。请输入更精确的关键字。
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 小部件                                                              */
/* ------------------------------------------------------------------ */

function PercentileTile({
  label,
  value,
  note,
  accent = false,
}: {
  label: string
  value: string
  note: string
  accent?: boolean
}) {
  return (
    <div className="bg-paper-raised px-4 py-4">
      <p className="font-mono text-[10px] tracking-[0.16em] text-ink-faint uppercase">{label}</p>
      <p
        className={`mt-1.5 font-mono text-[16px] tabular font-medium ${
          accent ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-ink-faint">{note}</p>
    </div>
  )
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="border-l-2 border-accent-line pl-4">
      <p className="font-mono text-[10px] tracking-[0.16em] text-ink-faint uppercase">{term}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{detail}</p>
    </div>
  )
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th
      className={`py-2 pr-4 font-mono text-[10px] font-normal tracking-[0.12em] text-ink-faint uppercase ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function Unavailable({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="mt-20 rounded-sm border border-rule bg-paper-raised p-8 sm:p-10">
      <p className="font-mono text-[10px] tracking-[0.2em] text-danger uppercase">数据暂不可用</p>
      <h1 className="mt-3 text-[24px] font-semibold tracking-tight text-ink">
        没能加载到员工数据
      </h1>
      <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">
        这通常是暂时的。重试一次；如果仍然不行，稍后再来。
      </p>
      <details className="mt-4 max-w-xl">
        <summary className="cursor-pointer text-[11.5px] text-ink-faint">技术细节</summary>
        <p className="mt-2 font-mono text-[11px] leading-relaxed break-words text-ink-faint">
          {error ?? '未知错误'}
        </p>
      </details>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-full bg-ink px-5 py-2.5 text-[12.5px] font-medium text-paper transition hover:bg-ink/85"
      >
        重试
      </button>
    </div>
  )
}
