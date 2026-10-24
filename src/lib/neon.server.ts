/**
 * Neon HTTP 客户端。
 *
 * 只做一件事：把参数化 SQL 通过 `POST https://<host>/sql` 发给 Neon 的
 * SQL-over-HTTP 端点。这条通道与 `@neondatabase/serverless` 的 `neon()`
 * 完全一致（同样的 `Neon-Connection-String` 头 + 同样的响应格式），
 * 但只用 `fetch`，不引入任何依赖，也就不需要动 lockfile。
 *
 * 连接串来自 Worker secret `CONNECTION_STRING`，绝不出现在仓库里，
 * 也绝不下发到浏览器。
 */

export interface NeonField {
  name: string
  dataTypeID: number
}

export class NeonError extends Error {
  code?: string
  detail?: string
  /** 是否值得换一个主机重试（网络不通 / 404）。 */
  retryable: boolean

  constructor(message: string, retryable = false) {
    super(message)
    this.name = 'NeonError'
    this.retryable = retryable
  }
}

interface ConnectionParts {
  host: string
  database: string
}

/** 从连接串里取出 host 与库名，用于展示与请求路由。 */
export function parseConnectionString(connectionString: string): ConnectionParts {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    throw new NeonError('CONNECTION_STRING 不是合法的连接串（应为 postgresql://…）')
  }
  if (!/^postgres(ql)?:$/.test(url.protocol) || !url.hostname) {
    throw new NeonError('CONNECTION_STRING 必须是 postgresql://user:pass@host/db 形式')
  }
  return {
    host: url.hostname,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'neondb',
  }
}

interface QueryOptions {
  /** 把结果按数组返回（默认按对象返回）。 */
  arrayMode?: boolean
  /** 请求超时，毫秒。 */
  timeoutMs?: number
}

interface NeonHttpResponse {
  results?: Array<{ fields: NeonField[]; rows: unknown[][] }>
  fields?: NeonField[]
  rows?: unknown[][]
  message?: string
}

async function postSql(
  connectionString: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<NeonHttpResponse> {
  const { host } = parseConnectionString(connectionString)
  // 连接串可能是 -pooler 主机；HTTP 端点两者都支持，先试原样，
  // 连不上再退回直连主机。
  const candidates = host.includes('-pooler') ? [host, host.replace('-pooler', '')] : [host]

  let lastError: NeonError | null = null

  for (const candidate of candidates) {
    try {
      return await requestSql(candidate, connectionString, payload, headers, timeoutMs)
    } catch (error) {
      const neonError = error instanceof NeonError ? error : new NeonError(String(error))
      // 只有“压根没连上”或 404 才换主机；SQL 报错（400）说明连接是通的。
      if (!neonError.retryable) throw neonError
      lastError = neonError
    }
  }

  throw lastError ?? new NeonError('无法连接 Neon')
}

async function requestSql(
  host: string,
  connectionString: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<NeonHttpResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`https://${host}/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connectionString,
        'Neon-Raw-Text-Output': 'true',
        'Neon-Array-Mode': 'true',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      let message = `Neon 返回 HTTP ${response.status}`
      try {
        const body = (await response.json()) as NeonHttpResponse
        if (body.message) message = body.message
      } catch {
        /* 响应体不是 JSON，保留状态码信息 */
      }
      throw new NeonError(message, response.status === 404)
    }

    return (await response.json()) as NeonHttpResponse
  } catch (error) {
    if (error instanceof NeonError) throw error
    throw new NeonError(
      controller.signal.aborted ? 'Neon 查询超时' : `无法连接 Neon：${(error as Error).message}`,
      true,
    )
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 执行一条参数化查询。`$1`、`$2`… 为占位符。
 *
 * 结果默认转成对象数组；`arrayMode: true` 时返回原始二维数组。
 */
export async function neonQuery<T = Record<string, unknown>>(
  connectionString: string,
  query: string,
  params: unknown[] = [],
  options: QueryOptions = {},
): Promise<T[]> {
  const body = await postSql(
    connectionString,
    { query, params },
    {},
    options.timeoutMs ?? 25_000,
  )

  const result = body.results?.[0] ?? { fields: body.fields ?? [], rows: body.rows ?? [] }
  const names = result.fields.map((field) => field.name)
  const rows = result.rows ?? []

  if (options.arrayMode) return rows as unknown as T[]

  return rows.map((row) => {
    const record: Record<string, unknown> = {}
    for (let i = 0; i < names.length; i += 1) record[names[i]] = normalizeValue(row[i])
    return record as unknown as T
  })
}

/**
 * 事务：多条语句在同一个只读事务里执行，结果按顺序返回。
 * 一次 HTTP 请求，口径一致，也省往返。
 */
export async function neonTransaction<T extends Record<string, unknown>[]>(
  connectionString: string,
  queries: Array<{ query: string; params?: unknown[] }>,
  options: { timeoutMs?: number } = {},
): Promise<T[]> {
  const body = await postSql(
    connectionString,
    queries.map((item) => ({ query: item.query, params: item.params ?? [] })),
    {
      'Neon-Batch-Isolation-Level': 'RepeatableRead',
      'Neon-Batch-Read-Only': 'true',
    },
    options.timeoutMs ?? 30_000,
  )

  if (!Array.isArray(body.results)) {
    throw new NeonError('Neon 返回了意外的结果格式')
  }

  return body.results.map((result) => {
    const names = result.fields.map((field) => field.name)
    return result.rows.map((row) => {
      const record: Record<string, unknown> = {}
      for (let i = 0; i < names.length; i += 1) record[names[i]] = normalizeValue(row[i])
      return record
    }) as unknown as T
  })
}

/** 在 Neon 里跑一条 `current_database()`，作为“连得上吗”的探针。 */
export async function neonPing(connectionString: string): Promise<string> {
  const rows = await neonQuery<{ db: string }>(
    connectionString,
    'select current_database() as db',
    [],
    { timeoutMs: 10_000 },
  )
  return String(rows[0]?.db ?? parseConnectionString(connectionString).database)
}

/**
 * Neon 的 `Neon-Raw-Text-Output: true` 会把所有值都当文本返回，
 * 这样 bigint 不会丢精度，日期也不会被时区改写。
 * 这里按“看起来像数字/布尔”的规则还原类型。
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return value
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}
