/**
 * dsh-cn-nav — Host 半侧。
 *
 * 对外只提供两个同源只读接口（都过 connection.requestRejection 信任栅栏）：
 *
 *   GET /dsh-cn-nav/usage   账户余额 + 今日/近 7 天消费（自建账本）
 *   GET /dsh-cn-nav/news    官方公告（抓 www.deepseek.com/news，10 分钟缓存）
 *
 * 数据获取方式与 dsh-whale-widget 相同，但**完全独立**：不读它的任何文件、
 * 不依赖它是否安装。做法是：
 *
 *   1. ctx.credentials.resolve('DEEPSEEK_API_KEY') 取 API key
 *   2. GET https://api.deepseek.com/user/balance（Bearer）
 *   3. 把每次观测写进自己的账本 $DSH_HOME/.dsh-cn-nav-usage.json
 *
 * 「今日已用 / 近 7 天」是余额差分：相邻两次观测之间余额下降多少就算多少消费，
 * 上涨则记为充值（不会把充值算成负消费）。整数记账单位 1e8，避免浮点漂移。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NS = 'dsh-cn-nav'
const ROUTE_USAGE = '/dsh-cn-nav/usage'
const ROUTE_NEWS = '/dsh-cn-nav/news'
const ROUTE_NOTICE = '/dsh-cn-nav/notice'

/** 金额整数单位：1 元 = 1e8 units（与桌宠的 accounting 一致，纯属好用的精度）。 */
const SCALE = 100000000
/** 自建账本文件名（放在 DSH_HOME）。 */
const LEDGER_NAME = '.dsh-cn-nav-usage.json'
/** 账本保留天数。 */
const KEEP_DAYS = 60
/** 后台自动观测间隔：5 分钟。 */
const POLL_MS = 5 * 60 * 1000
/** 按需观测的最小间隔，避免反复点「刷新」把接口打爆。 */
const MIN_OBSERVE_MS = 45 * 1000
/** 余额接口。 */
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TIMEOUT_MS = 10000
/** 凭证引用名：与 DSH 自己的 DeepSeek 适配器一致。 */
const CREDENTIAL_REF = 'DEEPSEEK_API_KEY'

/** 官方公告页（服务端渲染，直接解析 HTML）。 */
const NEWS_URL = 'https://www.deepseek.com/news'
const NEWS_TTL_MS = 10 * 60 * 1000
const NEWS_TIMEOUT_MS = 9000
const NEWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36'

/** 官网首页底部那条公告（服务端渲染的 <a> 里，带 ds-sparkle-image 小图标）。 */
const HOME_URL = 'https://www.deepseek.com/'

// ─────────────────────────────────────────────────────────── 小工具

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  return path.join(os.homedir(), '.dsh')
}

function ledgerPath() {
  return path.join(dshHome(), LEDGER_NAME)
}

/** 北京时间的那一天（账本所有 day 字段都是北京日）。 */
function beijingDay(time) {
  try {
    return new Date(Number(time) + 8 * 3600000).toISOString().slice(0, 10)
  } catch (error) {
    return ''
  }
}

/** 金额 → 整数单位。非法值返回 null。 */
function toUnits(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const units = Math.round(n * SCALE)
  if (!Number.isSafeInteger(units)) return null
  return units
}

function round6(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(value * 1e6) / 1e6
}

// ─────────────────────────────────────────────────────────── 自建账本

let ledgerCache = null

function readLedger() {
  if (ledgerCache !== null) return ledgerCache
  try {
    const parsed = JSON.parse(fs.readFileSync(ledgerPath(), 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.days && typeof parsed.days === 'object') {
      ledgerCache = parsed
      return ledgerCache
    }
  } catch (error) {
    /* 没有账本或解析失败：当作空账本 */
  }
  ledgerCache = { version: 1, currency: 'CNY', days: {} }
  return ledgerCache
}

function writeLedger(ledger) {
  ledgerCache = ledger
  const target = ledgerPath()
  const temp = target + '.tmp'
  try {
    fs.writeFileSync(temp, JSON.stringify(ledger, null, 0), 'utf8')
    fs.renameSync(temp, target)
  } catch (error) {
    try {
      fs.writeFileSync(target, JSON.stringify(ledger, null, 0), 'utf8')
    } catch (inner) {
      /* 写不进去就算了：内存里还有一份 */
    }
  }
}

/** 记一次观测：余额下降记消费，余额上升记充值。乱序/重复样本直接忽略。 */
function recordObservation(balance, currency, at) {
  const units = toUnits(balance)
  if (units === null) return null
  const ledger = readLedger()
  const day = beijingDay(at)
  if (day === '') return null

  // 币种变了（换了账户）：旧账不再可比，清空重来。
  if (ledger.currency && currency && ledger.currency !== currency) {
    ledger.days = {}
  }
  ledger.currency = currency || ledger.currency || 'CNY'
  ledger.days = ledger.days && typeof ledger.days === 'object' ? ledger.days : {}

  let row = ledger.days[day]
  if (!row) {
    row = ledger.days[day] = {
      day,
      firstAt: at,
      lastAt: at,
      openingUnits: units,
      lastUnits: units,
      debitUnits: 0,
      creditUnits: 0,
      samples: 1
    }
  } else {
    // 只丢弃「真正乱序」的样本（lastAt 比这次还新）。时间戳相同仍要记账：
    // 快速连点刷新会让两次观测落在同一毫秒，if (>=) 会把后一次当乱序丢掉，
    // 于是中间那笔充值/消费就永久丢了。
    if (Number(row.lastAt) > at) return ledger
    const delta = row.lastUnits - units
    if (delta > 0) row.debitUnits += delta
    if (delta < 0) row.creditUnits -= delta
    row.lastUnits = units
    row.lastAt = Math.max(at, Number(row.lastAt) || 0)
    row.samples = (Number(row.samples) || 0) + 1
  }
  ledger.lastAt = at
  ledger.lastBalanceUnits = units

  // 只留最近 KEEP_DAYS 天
  const keys = Object.keys(ledger.days).sort()
  while (keys.length > KEEP_DAYS) {
    delete ledger.days[keys.shift()]
  }

  writeLedger(ledger)
  return ledger
}

/** 账本 → 个人页视图。 */
function buildUsage() {
  const ledger = readLedger()
  const today = beijingDay(Date.now())
  const days = ledger.days && typeof ledger.days === 'object' ? ledger.days : {}
  const todayRow = days[today] || null
  const currency = ledger.currency || 'CNY'

  const balance =
    todayRow !== null
      ? todayRow.lastUnits / SCALE
      : typeof ledger.lastBalanceUnits === 'number'
        ? ledger.lastBalanceUnits / SCALE
        : null

  const last7 = []
  const todayStart = Date.parse(today + 'T00:00:00+08:00')
  if (Number.isFinite(todayStart)) {
    for (let i = 6; i >= 0; i--) {
      const day = beijingDay(todayStart - i * 86400000)
      const row = days[day]
      last7.push({ day, amount: row ? round6(row.debitUnits / SCALE) : null })
    }
  }
  const last7Total = last7.reduce((sum, row) => sum + (typeof row.amount === 'number' ? row.amount : 0), 0)

  // 最近一次观测（不管是不是今天）
  let lastAt = 0
  let lastRow = null
  for (const key of Object.keys(days)) {
    const row = days[key]
    if (row && Number(row.lastAt) > lastAt) {
      lastAt = Number(row.lastAt)
      lastRow = row
    }
  }

  return {
    ok: true,
    source: 'deepseek-balance',
    currency,
    balance: round6(balance),
    todayObserved: todayRow ? round6(todayRow.debitUnits / SCALE) : 0,
    todayCredit: todayRow ? round6(todayRow.creditUnits / SCALE) : 0,
    todayOpening: todayRow ? round6(todayRow.openingUnits / SCALE) : null,
    todaySamples: todayRow ? Number(todayRow.samples) || 1 : 0,
    firstObservedAt: todayRow ? Number(todayRow.firstAt) || null : null,
    observedAt: lastAt > 0 ? lastAt : null,
    last7,
    last7Total: round6(last7Total),
    daysTracked: Object.keys(days).length,
    balanceUrl: BALANCE_URL,
    pollMs: POLL_MS,
    ledgerFile: ledgerPath()
  }
}

// ─────────────────────────────────────────────────────────── 余额观测

let userId = ''
let lastAttemptAt = 0
let lastError = ''
let lastErrorAt = 0

async function resolveApiKey(ctx) {
  try {
    const credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
    if (!credentials || typeof credentials.resolve !== 'function') return ''
    const resolved = await credentials.resolve(CREDENTIAL_REF)
    if (!resolved) return ''
    const value = typeof resolved === 'string' ? resolved : resolved.value
    return typeof value === 'string' ? value.trim() : ''
  } catch (error) {
    return ''
  }
}

/** 观测一次余额。force=false 时受 MIN_OBSERVE_MS 节流。 */
async function observe(ctx, force) {
  const now = Date.now()
  if (!force && now - lastAttemptAt < MIN_OBSERVE_MS) {
    return { ok: lastError === '', error: lastError }
  }
  lastAttemptAt = now

  const key = await resolveApiKey(ctx)
  if (key === '') {
    lastError = 'no-key'
    lastErrorAt = now
    return { ok: false, error: 'no-key' }
  }
  if (key !== userId) userId = key

  let timeout = null
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    if (controller !== null) timeout = setTimeout(() => controller.abort(), BALANCE_TIMEOUT_MS)
    const response = await fetch(BALANCE_URL, {
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
      signal: controller === null ? undefined : controller.signal
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const payload = await response.json()
    const infos = payload && Array.isArray(payload.balance_infos) ? payload.balance_infos : []
    if (infos.length === 0) throw new Error('balance_infos empty')
    const info = infos[0] || {}
    const total = Number(info.total_balance)
    if (!Number.isFinite(total)) throw new Error('total_balance invalid')
    const currency = String(info.currency || 'CNY').toUpperCase()
    recordObservation(total, currency, Date.now())
    lastError = ''
    return { ok: true, balance: total, currency }
  } catch (error) {
    lastError = String((error && error.message) || error).slice(0, 120)
    lastErrorAt = now
    return { ok: false, error: lastError }
  } finally {
    if (timeout !== null) clearTimeout(timeout)
  }
}

/** /usage 的响应：观测不成功但手里有账本时，返回 stale 数据而不是空。 */
async function usagePayload(ctx, force) {
  const observed = await observe(ctx, force === true)
  const account = await readAccountName(ctx, force === true)
  const accountInfo = { name: account.name || '', avatarUrl: account.avatarUrl || '' }
  const view = buildUsage()
  diag(
    'usage',
    'ok=' + observed.ok + ' err=' + (observed.error || '-') + ' balance=' + view.balance +
      ' days=' + view.daysTracked + ' name=' + (accountInfo.name || '-')
  )
  if (observed.ok) return { ...view, account: accountInfo }

  const reason = observed.error === 'no-key' ? 'no-key' : 'fetch-failed'
  if (view.balance === null && view.daysTracked === 0) {
    return {
      ok: false,
      reason,
      message: observed.error,
      account: accountInfo,
      hint:
        reason === 'no-key'
          ? '没有找到 DEEPSEEK_API_KEY 凭证。在 DSH 设置里配置 DeepSeek API Key 后即可自动取数。'
          : '余额接口请求失败：' + observed.error
    }
  }
  return { ...view, account: accountInfo, stale: true, staleReason: reason, message: observed.error }
}

// ─────────────────────────────────────────────────────────── 官方公告

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    const key = String(body).toLowerCase()
    if (Object.prototype.hasOwnProperty.call(ENTITIES, key)) return ENTITIES[key]
    try {
      if (key.charAt(0) === '#') {
        const code = key.charAt(1) === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10)
        if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code)
      }
    } catch (error) {
      /* 解不出来就原样保留 */
    }
    return whole
  })
}

function plainText(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function pad2(value) {
  return value.length < 2 ? '0' + value : value
}

/**
 * 从官方公告页解析条目。结构（2026-10 实测）：
 *   <a href="/news/v4-preview/"> … 2026 年 4 月 24 日 … <h3>标题</h3> <p>摘要</p> …
 * 页面本身服务端渲染，按 DOM 顺序即从新到旧。
 */
function parseNews(html) {
  const items = []
  const seen = new Set()
  const anchorRe = /<a\b[^>]*href="(\/news\/[A-Za-z0-9._-]+\/)"[^>]*>([\s\S]{0,6000}?)<\/a>/gi
  let match
  while ((match = anchorRe.exec(html)) !== null) {
    const href = match[1]
    if (seen.has(href)) continue
    const inner = match[2]
    const titleMatch = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(inner)
    if (titleMatch === null) continue
    const title = plainText(titleMatch[1])
    if (title === '') continue
    // 摘要取标题**之后**的第一个 <p>：标题之前那一行是「动态 · 日期」的元信息。
    const afterTitle = inner.slice(titleMatch.index + titleMatch[0].length)
    const summaryMatch = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(afterTitle)
    const dateMatch = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(inner)
    seen.add(href)
    items.push({
      id: href,
      url: 'https://www.deepseek.com' + href,
      title,
      summary: summaryMatch === null ? '' : plainText(summaryMatch[1]).slice(0, 220),
      date:
        dateMatch === null
          ? ''
          : dateMatch[1] + '-' + pad2(String(dateMatch[2])) + '-' + pad2(String(dateMatch[3]))
    })
    if (items.length >= 12) break
  }
  return items
}

let newsCache = { at: 0, items: [], error: '' }

async function loadNews(force) {
  const now = Date.now()
  if (!force && newsCache.at > 0 && now - newsCache.at < NEWS_TTL_MS) {
    return { ok: true, cached: true, fetchedAt: newsCache.at, items: newsCache.items, source: NEWS_URL }
  }
  let timeout = null
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    if (controller !== null) timeout = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS)
    const response = await fetch(NEWS_URL, {
      headers: { 'user-agent': NEWS_UA, accept: 'text/html,application/xhtml+xml' },
      signal: controller === null ? undefined : controller.signal
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const html = await response.text()
    const items = parseNews(html)
    if (items.length === 0) throw new Error('parse produced no items')
    newsCache = { at: Date.now(), items, error: '' }
    return { ok: true, cached: false, fetchedAt: newsCache.at, items, source: NEWS_URL }
  } catch (error) {
    const message = String((error && error.message) || error).slice(0, 160)
    newsCache = { ...newsCache, error: message }
    if (newsCache.items.length > 0) {
      return { ok: true, cached: true, stale: true, fetchedAt: newsCache.at, items: newsCache.items, source: NEWS_URL, message }
    }
    return { ok: false, reason: 'fetch-failed', message }
  } finally {
    if (timeout !== null) clearTimeout(timeout)
  }
}

// ─────────────────────────────────────────────────────────── 账号昵称

let accountCache = { at: 0, name: '', avatarUrl: '' }

/** 读登录的 DeepSeek 账号昵称（没登录就返回空）。10 分钟缓存。 */
async function readAccountName(ctx, force) {
  const now = Date.now()
  if (!force && accountCache.at > 0 && now - accountCache.at < 10 * 60 * 1000) return accountCache
  try {
    const account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : undefined
    if (!account || typeof account.getProfile !== 'function') {
      diag('account', 'service unavailable')
      return accountCache
    }
    const client = {
      version: '1.0.0',
      locale: 'zh-CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
    }
    const profile = await account.getProfile(client)
    if (profile && profile.status === 'ready' && profile.value) {
      accountCache = {
        at: now,
        name: typeof profile.value.name === 'string' ? profile.value.name : '',
        avatarUrl: typeof profile.value.avatarUrl === 'string' ? profile.value.avatarUrl : ''
      }
      diag('account', 'name=' + accountCache.name)
      return accountCache
    }
    diag('account', 'profile=' + (profile ? profile.status : 'null'))
  } catch (error) {
    diag('account-failed', error)
  }
  accountCache = { ...accountCache, at: now }
  return accountCache
}

// ─────────────────────────────────────────────────────────── 首页公告条

let noticeCache = { at: 0, text: '', url: '', error: '' }

/**
 * 从官网首页 HTML 里抠出那条公告。
 *
 * 实测结构（2026-10）：
 *   <a href="…"><picture>…<img class="ds-sparkle-image"/></picture></span>
 *     <span class="opacity-[0.55] …">DeepSeek V4.1 Flash 现已更新至 …</span>
 *     <span>…箭头 svg…</span></a>
 * 所以优先取「内含 sparkle 图标的 <a>」，退而求其次取文案里有「更新至 / 欢迎测试」的 <a>。
 */
function parseHomeNotice(html) {
  const anchorRe = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]{0,4000}?)<\/a>/gi
  let fallback = null
  let match
  while ((match = anchorRe.exec(html)) !== null) {
    const href = match[1]
    const inner = match[2]
    const text = plainText(inner)
    if (text.length < 12 || text.length > 400) continue
    const url = href.indexOf('http') === 0 ? href : 'https://www.deepseek.com' + href
    if (inner.indexOf('sparkle') >= 0) return { text, url }
    if (fallback === null && /(现已更新至|更新至|欢迎测试|新增 API|网页搜索与抓取)/.test(text)) {
      fallback = { text, url }
    }
  }
  return fallback
}

async function loadHomeNotice(force) {
  const now = Date.now()
  if (!force && noticeCache.at > 0 && now - noticeCache.at < NEWS_TTL_MS && noticeCache.text !== '') {
    return {
      ok: true,
      cached: true,
      text: noticeCache.text,
      url: noticeCache.url,
      fetchedAt: noticeCache.at,
      source: HOME_URL
    }
  }
  let timeout = null
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    if (controller !== null) timeout = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS)
    const response = await fetch(HOME_URL, {
      headers: { 'user-agent': NEWS_UA, accept: 'text/html,application/xhtml+xml' },
      signal: controller === null ? undefined : controller.signal
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const html = await response.text()
    const notice = parseHomeNotice(html)
    if (notice === null) throw new Error('notice not found in homepage')
    noticeCache = { at: Date.now(), text: notice.text, url: notice.url, error: '' }
    diag('home-notice', notice.text.slice(0, 60))
    return { ok: true, cached: false, text: notice.text, url: notice.url, fetchedAt: noticeCache.at, source: HOME_URL }
  } catch (error) {
    const message = String((error && error.message) || error).slice(0, 160)
    noticeCache = { ...noticeCache, error: message }
    diag('home-notice-failed', message)
    if (noticeCache.text !== '') {
      return {
        ok: true,
        cached: true,
        stale: true,
        text: noticeCache.text,
        url: noticeCache.url,
        fetchedAt: noticeCache.at,
        source: HOME_URL,
        message
      }
    }
    return { ok: false, reason: 'fetch-failed', message }
  } finally {
    if (timeout !== null) clearTimeout(timeout)
  }
}

// ─────────────────────────────────────────────────────────── HTTP

/** 浏览器信任栅栏：非本站请求直接拒绝。 */
function rejectCode(ctx, req) {
  try {
    const connection = (typeof ctx.get === 'function' ? ctx.get('connection') : undefined) || ctx.connection
    if (!connection || typeof connection.requestRejection !== 'function') return 0
    const code = connection.requestRejection(req)
    if (code === undefined || code === null || code === false) return 0
    return typeof code === 'number' ? code : 403
  } catch (error) {
    return 0
  }
}

function sendJson(res, code, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(body.length)
  })
  res.end(body)
}

function jsonRoute(ctx, routePath, produce) {
  return {
    kind: 'exact',
    path: routePath,
    handler: async (req, res) => {
      const code = rejectCode(ctx, req)
      if (code !== 0) {
        res.writeHead(code)
        res.end()
        return
      }
      let payload
      try {
        payload = await produce(req)
      } catch (error) {
        payload = { ok: false, reason: 'error', message: String((error && error.message) || error).slice(0, 160) }
      }
      sendJson(res, 200, payload)
    }
  }
}

// ─────────────────────────────────────────────────────────── 诊断与启动

/** 写一行诊断到 $DSH_HOME/.dsh-cn-nav-diag.log（有上限，失败静默）。 */
function diag(kind, detail) {
  try {
    const file = path.join(dshHome(), '.dsh-cn-nav-diag.log')
    const text = detail === undefined ? '' : String((detail && detail.message) || detail)
    try {
      if (fs.statSync(file).size > 512 * 1024) fs.writeFileSync(file, '', 'utf8')
    } catch (error) {
      /* 文件还不存在 */
    }
    fs.appendFileSync(file, new Date().toISOString() + ' [' + kind + '] ' + text.slice(0, 300) + '\n', 'utf8')
  } catch (error) {
    /* 诊断写入失败绝不影响功能 */
  }
}

/**
 * 等 webServer 真正就绪后再回调。
 *
 * 为什么必须轮询、不能直接读 ctx.webServer：冷启动时 `webserver` 这一行
 * 「已声明但尚未提供」，Cordis 对未就绪服务的属性访问会抛错，整个插件的 fiber
 * 直接变成 failed —— 实测过：重启后 fiberPhase: "failed"、路由全 404、账本停止更新。
 * ctx.get() 是安全探测，拿不到就返回 undefined。
 */
function whenWebServer(ctx, callback) {
  let timer = null
  let tries = 0
  const stop = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  const tick = () => {
    timer = null
    let server = null
    try {
      server = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    } catch (error) {
      server = null
    }
    if (server && typeof server.register === 'function') {
      callback(server)
      return
    }
    tries += 1
    if (tries >= 240) {
      diag('webServer-timeout', 'webServer 一直未就绪，路由未注册')
      return
    }
    timer = setTimeout(tick, 300)
  }
  tick()
  return stop
}

function registerRoutes(ctx, webServer) {
  const disposers = []
  disposers.push(
    webServer.register(
      jsonRoute(ctx, ROUTE_USAGE, (req) => {
        const url = String((req && req.url) || '')
        return usagePayload(ctx, /[?&]force=1/.test(url))
      })
    )
  )
  disposers.push(
    webServer.register(
      jsonRoute(ctx, ROUTE_NEWS, (req) => {
        const url = String((req && req.url) || '')
        return loadNews(/[?&]force=1/.test(url))
      })
    )
  )
  disposers.push(
    webServer.register(
      jsonRoute(ctx, ROUTE_NOTICE, (req) => {
        const url = String((req && req.url) || '')
        return loadHomeNotice(/[?&]force=1/.test(url))
      })
    )
  )
  diag('routes-registered', ROUTE_USAGE + ' ' + ROUTE_NEWS + ' ' + ROUTE_NOTICE)
  return () => {
    while (disposers.length > 0) {
      const dispose = disposers.pop()
      try {
        if (typeof dispose === 'function') dispose()
      } catch (error) {
        /* 卸载时路由可能已被移除 */
      }
    }
  }
}

export function apply(ctx) {
  diag('apply-enter', 'pid=' + process.pid)
  try {
    // 1) 余额轮询：与 webServer 无关，先起来。
    const startPolling = () => {
      const startTimer = setTimeout(() => {
        observe(ctx, true).catch(() => {})
      }, 3000)
      // 启动时也探一次账号名：既能预热缓存，也方便在诊断日志里确认读到没有。
      const accountTimer = setTimeout(() => {
        readAccountName(ctx, true).catch(() => {})
      }, 4500)
      const pollTimer = setInterval(() => {
        observe(ctx, false).catch(() => {})
      }, POLL_MS)
      return () => {
        clearTimeout(startTimer)
        clearTimeout(accountTimer)
        clearInterval(pollTimer)
      }
    }
    if (typeof ctx.effect === 'function') {
      ctx.effect(startPolling, `${NS}: balance poll`)
    } else {
      startPolling()
    }

    // 2) 路由：等 webServer 就绪。
    const stopWaiting = whenWebServer(ctx, (webServer) => {
      try {
        const dispose = registerRoutes(ctx, webServer)
        if (typeof ctx.effect === 'function') ctx.effect(() => dispose, `${NS}: data routes`)
      } catch (error) {
        diag('routes-failed', error)
      }
    })
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => stopWaiting, `${NS}: webServer wait`)
    }
    diag('apply-ok', 'polling started; waiting for webServer')
  } catch (error) {
    // 绝不因为这里出错就让整个 fiber 变成 failed。
    diag('apply-failed', error)
    try {
      ctx.logger?.warn?.(`[${NS}] apply 失败：` + String((error && error.message) || error))
    } catch (inner) {
      /* 日志失败不影响加载 */
    }
  }
}
