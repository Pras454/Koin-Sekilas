// Koin Sekilas — harga kripto + odds Polymarket sekilas di kaca Even G2.
//
// Dua view, satu app (keduanya Track 02 Crypto & DeFi):
//   HARGA — watchlist token (config.ts): harga + perubahan 24j.
//   ODDS  — pasar Polymarket pilihan: harga Yes/No + perubahan 24j.
// Gerakan (lihat README untuk alasan pemilihan):
//   tap (CLICK)              → item berikutnya di view ini
//   tahan (LONG_PRESS)       → pindah view (Harga ↔ Odds)
//   geser atas/bawah         → ubah ambang alert item ini
//                            (mati → 1% → 3% → 5% → 10% → mati)
//   tap 2x (DOUBLE_CLICK)    → keluar
// Alert: saat harga/odds bergerak melewati ambang dari harga referensi
// (harga saat alert dipasang, atau saat pertama dilihat), layar item itu
// menampilkan peringatan. Data read-only, tanpa login, tanpa API key.

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import {
  WATCHLIST,
  MARKET_PICKS,
  ALERT_STEPS,
  DEFAULT_ALERT_INDEX,
  REFRESH_MS,
} from './config'
import { fetchPrices, type PriceQuote } from './prices'
import { fetchOdds, type OddsMarket } from './polymarket'

type View = 'prices' | 'odds'

interface AlertConfig {
  /** Indeks ke ALERT_STEPS. */
  thresholdIndex: number
  /** Nilai referensi alert (harga USD, atau harga Yes 0..1). */
  ref: number | null
  /** True bila pergerakan dari referensi sudah melewati ambang. */
  alerting: boolean
}

const bridge = await waitForEvenAppBridge()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let view: View = 'prices'
let priceIndex = 0
let oddsIndex = 0
let loading = true
let lastRefreshAt: Date | null = null

/** Harga terakhir yang diketahui per simbol (dipertahankan bila fetch gagal). */
const quotes = new Map<string, PriceQuote>()
/** true bila quote simbol ini tidak ter-refresh pada fetch terakhir. */
const staleQuotes = new Set<string>()
/** Pasar odds terakhir yang diketahui. */
let markets: OddsMarket[] = []

const priceAlerts = new Map<string, AlertConfig>()
const oddsAlerts = new Map<string, AlertConfig>()

function alertFor(map: Map<string, AlertConfig>, key: string): AlertConfig {
  let cfg = map.get(key)
  if (!cfg) {
    cfg = { thresholdIndex: DEFAULT_ALERT_INDEX, ref: null, alerting: false }
    map.set(key, cfg)
  }
  return cfg
}

// ---------------------------------------------------------------------------
// Formatting (layar 576x288, ~10 baris, ~40 karakter/baris)
// ---------------------------------------------------------------------------

function fmtPrice(p: number): string {
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 1) return '$' + p.toFixed(2)
  if (p >= 0.01) return '$' + p.toFixed(4)
  return '$' + p.toPrecision(3)
}

function fmtSigned(n: number, digits = 2): string {
  return (n >= 0 ? '+' : '') + n.toFixed(digits)
}

function fmtPct01(p: number): string {
  return (p * 100).toFixed(1)
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// ---------------------------------------------------------------------------
// Alert evaluation
// ---------------------------------------------------------------------------

/** Pergerakan persen harga dari referensi (null bila belum ada referensi). */
function priceMovePct(cfg: AlertConfig, price: number): number | null {
  if (cfg.ref === null || cfg.ref === 0) return null
  return ((price - cfg.ref) / cfg.ref) * 100
}

/** Pergerakan odds dalam poin persentase dari referensi. */
function oddsMovePts(cfg: AlertConfig, yesPrice: number): number | null {
  if (cfg.ref === null) return null
  return (yesPrice - cfg.ref) * 100
}

function evaluatePriceAlerts(): void {
  for (const tok of WATCHLIST) {
    const q = quotes.get(tok.symbol)
    if (!q) continue
    const cfg = alertFor(priceAlerts, tok.symbol)
    if (cfg.ref === null) cfg.ref = q.price
    const threshold = ALERT_STEPS[cfg.thresholdIndex]
    const move = priceMovePct(cfg, q.price)
    cfg.alerting = threshold !== null && move !== null && Math.abs(move) >= threshold
  }
}

function evaluateOddsAlerts(): void {
  for (const m of markets) {
    const cfg = alertFor(oddsAlerts, m.slug)
    if (cfg.ref === null) cfg.ref = m.yesPrice
    const threshold = ALERT_STEPS[cfg.thresholdIndex]
    const move = oddsMovePts(cfg, m.yesPrice)
    cfg.alerting = threshold !== null && move !== null && Math.abs(move) >= threshold
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderPriceScreen(): string {
  const tok = WATCHLIST[priceIndex]
  const q = quotes.get(tok.symbol)
  const cfg = alertFor(priceAlerts, tok.symbol)
  const threshold = ALERT_STEPS[cfg.thresholdIndex]
  const head = `${tok.symbol} · ${priceIndex + 1}/${WATCHLIST.length}`

  if (!q) {
    return [
      head,
      'belum ada data',
      'menunggu refresh...',
      '',
      'tap: token berikut',
      'tahan: odds · 2x tap: keluar',
    ].join('\n')
  }

  const stale = staleQuotes.has(tok.symbol) ? ' *' : ''
  const alertLine =
    threshold === null
      ? 'Alert: mati'
      : `Alert ${threshold}% · ref ${cfg.ref !== null ? fmtPrice(cfg.ref) : '-'}`

  const move = priceMovePct(cfg, q.price)
  if (cfg.alerting && threshold !== null && move !== null) {
    return [
      `!! ALERT · ${tok.symbol} !!`,
      `${fmtPrice(q.price)} (${fmtSigned(move)}%)${stale}`,
      `ref ${cfg.ref !== null ? fmtPrice(cfg.ref) : '-'} · ambang ${threshold}%`,
      `24h ${fmtSigned(q.change24h)}%`,
      'tap: token berikut',
      'tahan: odds · 2x tap: keluar',
    ].join('\n')
  }

  return [
    head,
    `${fmtPrice(q.price)}${stale}`,
    `24h ${fmtSigned(q.change24h)}%`,
    alertLine,
    'tap: token berikut',
    'tahan: odds · 2x tap: keluar',
  ].join('\n')
}

function renderOddsScreen(): string {
  if (!markets.length) {
    return [
      `ODDS · 0/${MARKET_PICKS.length}`,
      'belum ada data',
      'menunggu refresh...',
      '',
      'tap: pasar berikut',
      'tahan: harga · 2x tap: keluar',
    ].join('\n')
  }
  const m = markets[oddsIndex % markets.length]
  const cfg = alertFor(oddsAlerts, m.slug)
  const threshold = ALERT_STEPS[cfg.thresholdIndex]
  const head = `ODDS · ${m.label} ${oddsIndex + 1}/${markets.length}`
  const question = truncate(m.question, 38)
  const prices = `Yes ${fmtPct01(m.yesPrice)}% · No ${fmtPct01(m.noPrice)}%`
  const change24h =
    m.change24hPts === null ? '24h —' : `24h ${fmtSigned(m.change24hPts, 1)} pts`
  const alertLine =
    threshold === null
      ? 'Alert: mati'
      : `Alert ${threshold} pts · ref ${cfg.ref !== null ? fmtPct01(cfg.ref) + '%' : '-'}`

  const move = oddsMovePts(cfg, m.yesPrice)
  if (cfg.alerting && threshold !== null && move !== null) {
    return [
      '!! ALERT · ODDS !!',
      question,
      `${prices} (${fmtSigned(move, 1)} pts)`,
      `ref ${cfg.ref !== null ? fmtPct01(cfg.ref) + '%' : '-'} · ambang ${threshold} pts`,
      'tap: pasar berikut',
      'tahan: harga · 2x tap: keluar',
    ].join('\n')
  }

  return [head, question, prices, change24h, alertLine, 'tap: pasar berikut', 'tahan: harga · 2x tap: keluar'].join('\n')
}

function renderLoadingScreen(): string {
  return ['Koin Sekilas', 'Memuat harga & odds...', '', 'Harga: CoinGecko', 'Odds: Polymarket'].join('\n')
}

function renderOfflineScreen(): string {
  return [
    'Koin Sekilas',
    'Offline — tidak ada data',
    'Refresh otomatis tiap',
    `${Math.round(REFRESH_MS / 1000)} detik.`,
    '',
    '2x tap: keluar',
  ].join('\n')
}

function currentContent(): string {
  if (loading) return renderLoadingScreen()
  if (quotes.size === 0 && markets.length === 0) return renderOfflineScreen()
  return view === 'prices' ? renderPriceScreen() : renderOddsScreen()
}

async function render(): Promise<void> {
  const content = currentContent()
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: 1,
      containerName: 'main',
      content,
    }),
  )
  // Cermin di WebView pendamping (membantu debug + demo tanpa kaca).
  const mirror = document.getElementById('mirror')
  if (mirror) {
    const stamp = lastRefreshAt
      ? ` — refresh ${lastRefreshAt.toLocaleTimeString('id-ID')}`
      : ''
    mirror.textContent = content + `\n\n[view: ${view}${stamp}]`
  }
}

// ---------------------------------------------------------------------------
// Data refresh
// ---------------------------------------------------------------------------

async function refresh(): Promise<void> {
  const [freshPrices, freshOdds] = await Promise.all([
    fetchPrices().catch(e => {
      console.warn('[koin] fetchPrices gagal:', e)
      return new Map<string, PriceQuote>()
    }),
    fetchOdds().catch(e => {
      console.warn('[koin] fetchOdds gagal:', e)
      return [] as OddsMarket[]
    }),
  ])

  staleQuotes.clear()
  for (const tok of WATCHLIST) {
    const q = freshPrices.get(tok.symbol)
    if (q) quotes.set(tok.symbol, q)
    else if (quotes.has(tok.symbol)) staleQuotes.add(tok.symbol)
  }
  if (freshOdds.length) markets = freshOdds
  if (oddsIndex >= markets.length) oddsIndex = 0

  evaluatePriceAlerts()
  evaluateOddsAlerts()
  loading = false
  lastRefreshAt = new Date()
  const btc = quotes.get('BTC')
  console.log(
    `[koin] refresh: ${quotes.size} harga${btc ? ` (BTC ${fmtPrice(btc.price)})` : ''}, ` +
      `${markets.length} pasar odds, ${priceAlerts.size + oddsAlerts.size} alert terpasang`,
  )
  await render()
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const mainText = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
  containerID: 1,
  containerName: 'main',
  content: renderLoadingScreen(),
  isEventCapture: 1,
})

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [mainText],
  }),
)
console.log('Page created:', result === 0 ? 'success' : `failed (${result})`)

// Refresh pertama (tanpa menunggu interval), lalu berkala.
void refresh()
setInterval(() => void refresh(), REFRESH_MS)

// ---------------------------------------------------------------------------
// Event routing — pola wajib dari template minimal (lihat README).
//
// CLICK_EVENT = 0, dan protobuf menghilangkan field bernilai nol — satu tap
// tiba sebagai envelope TANPA field `eventType`. Default diselesaikan DI DALAM
// cek envelope (`eventTypeOf`), jangan flatten ke
// `event.sysEvent?.eventType ?? CLICK_EVENT` (akan salah baca semua event lain
// sebagai tap). Urutan cek: DOUBLE_CLICK dulu, CLICK terakhir.
// ---------------------------------------------------------------------------

function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

function cycleThreshold(direction: 1 | -1): void {
  const key = view === 'prices' ? WATCHLIST[priceIndex].symbol : markets[oddsIndex]?.slug
  if (!key) return
  const map = view === 'prices' ? priceAlerts : oddsAlerts
  const cfg = alertFor(map, key)
  const n = ALERT_STEPS.length
  cfg.thresholdIndex = (cfg.thresholdIndex + direction + n) % n
  // Referensi di-reset ke nilai sekarang: alert mengukur pergerakan sejak
  // ambang dipasang, bukan sejak app dibuka.
  cfg.ref =
    view === 'prices'
      ? (quotes.get(key)?.price ?? cfg.ref)
      : (markets[oddsIndex]?.yesPrice ?? cfg.ref)
  cfg.alerting = false
  const threshold = ALERT_STEPS[cfg.thresholdIndex]
  console.log(
    `[koin] alert ${key} → ${threshold === null ? 'mati' : threshold + (view === 'prices' ? '%' : ' pts')}`,
  )
  void render()
}

function nextItem(): void {
  if (view === 'prices') {
    priceIndex = (priceIndex + 1) % WATCHLIST.length
    console.log(`[koin] tap → token ${priceIndex + 1}/${WATCHLIST.length}`)
  } else {
    if (markets.length) oddsIndex = (oddsIndex + 1) % markets.length
    console.log(`[koin] tap → pasar ${oddsIndex + 1}/${markets.length}`)
  }
  void render()
}

function switchView(): void {
  view = view === 'prices' ? 'odds' : 'prices'
  console.log(`[koin] long-press → view ${view}`)
  void render()
}

const unsubscribe = bridge.onEvenHubEvent(event => {
  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)
  const listType = eventTypeOf(event.listEvent)

  // 1. Double-tap → keluar. Cek root-level: harus jalan dari envelope mana pun.
  if (
    sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    textType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    listType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    console.log('[koin] double-tap → keluar')
    void bridge.shutDownPageContainer(1)
    return
  }

  // 2. Tahan (long press) → pindah view. Hanya pada LONG_PRESS_EVENT (9),
  //    bukan pada LONG_PRESS_RELEASE_EVENT (10).
  if (
    sysType === OsEventTypeList.LONG_PRESS_EVENT ||
    textType === OsEventTypeList.LONG_PRESS_EVENT ||
    listType === OsEventTypeList.LONG_PRESS_EVENT
  ) {
    switchView()
    return
  }

  // 3. Geser atas/bawah → ubah ambang alert item yang sedang tampil.
  if (
    sysType === OsEventTypeList.SCROLL_TOP_EVENT ||
    textType === OsEventTypeList.SCROLL_TOP_EVENT ||
    listType === OsEventTypeList.SCROLL_TOP_EVENT
  ) {
    cycleThreshold(1)
    return
  }
  if (
    sysType === OsEventTypeList.SCROLL_BOTTOM_EVENT ||
    textType === OsEventTypeList.SCROLL_BOTTOM_EVENT ||
    listType === OsEventTypeList.SCROLL_BOTTOM_EVENT
  ) {
    cycleThreshold(-1)
    return
  }

  // 4. Tap → item berikutnya. Dicek TERAKHIR (CLICK = 0 adalah default
  //    envelope tanpa eventType).
  if (
    sysType === OsEventTypeList.CLICK_EVENT ||
    textType === OsEventTypeList.CLICK_EVENT ||
    listType === OsEventTypeList.CLICK_EVENT
  ) {
    nextItem()
    return
  }

  if (
    sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
    sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
  ) {
    unsubscribe()
  }
})
