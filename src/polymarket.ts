// Odds Polymarket — GRATIS, read-only, tanpa API key, tanpa login.
//
// - Daftar pasar + harga Yes/No: Polymarket Gamma API
//   (https://gamma-api.polymarket.com/markets, CORS-enabled).
// - Perubahan 24 jam: Polymarket CLOB API publik
//   (https://clob.polymarket.com/prices-history) — harga token Yes
//   24 jam lalu dibandingkan harga sekarang, dalam poin persentase.
// Bila riwayat CLOB gagal, perubahan 24j ditampilkan sebagai "—" dan
// alert tetap memakai referensi sesi (harga saat pertama dilihat).

import { MARKET_PICKS, FETCH_TIMEOUT_MS } from './config'

export interface OddsMarket {
  question: string
  slug: string
  /** Harga Yes 0..1 (= probabilitas tersirat). */
  yesPrice: number
  /** Harga No 0..1. */
  noPrice: number
  /** Perubahan harga Yes 24 jam terakhir, dalam poin persentase. */
  change24hPts: number | null
  volume: number
  /** Label pendek dari config (mis. "Kripto"). */
  label: string
}

interface GammaMarket {
  question: string
  slug: string
  outcomes: string // JSON string, mis. '["Yes","No"]'
  outcomePrices: string // JSON string, mis. '["0.075","0.925"]'
  clobTokenIds: string // JSON string array
  volumeNum?: number
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

async function fetchGammaMarkets(tag: string, limit = 10): Promise<GammaMarket[]> {
  const tagParam = tag ? `tag=${encodeURIComponent(tag)}&` : ''
  const url =
    `https://gamma-api.polymarket.com/markets?${tagParam}` +
    `active=true&closed=false&order=volumeNum&ascending=false&limit=${limit}`
  const data = (await fetchJson(url)) as GammaMarket[]
  return Array.isArray(data) ? data : []
}

/** Harga token Yes 24 jam lalu (titik pertama riwayat 1 jam-an), atau null. */
async function fetchYes24hAgo(tokenId: string): Promise<number | null> {
  const now = Math.floor(Date.now() / 1000)
  const url =
    `https://clob.polymarket.com/prices-history?market=${tokenId}` +
    `&startTs=${now - 86400}&endTs=${now}&interval=1h&fidelity=60`
  const data = (await fetchJson(url)) as {
    history?: Array<{ t: number; p: number }>
  }
  const h = data.history ?? []
  return h.length ? h[0].p : null
}

/** Ambil pasar pilihan dari config. Pasar yang gagal tidak masuk hasil. */
export async function fetchOdds(): Promise<OddsMarket[]> {
  const out: OddsMarket[] = []
  const seen = new Set<string>()
  for (const pick of MARKET_PICKS) {
    try {
      let markets = await fetchGammaMarkets(pick.tag, 10)
      if (!markets.length) {
        // Tag tidak menghasilkan pasar — fallback ke volume tertinggi apa pun.
        markets = await fetchGammaMarkets('', 10)
      }
      // Ambil pasar ke-`index` yang BELUM terpilih: tag Gamma tumpang
      // tindih (satu pasar bisa bertag "crypto" sekaligus "politics"),
      // jadi tanpa dedupe, pasar yang sama bisa tampil dua kali.
      let m: GammaMarket | undefined
      for (let i = pick.index; i < markets.length; i++) {
        if (!seen.has(markets[i].slug)) {
          m = markets[i]
          break
        }
      }
      if (!m) continue
      seen.add(m.slug)
      const prices = JSON.parse(m.outcomePrices) as string[]
      const yes = parseFloat(prices[0] ?? 'NaN')
      const no = parseFloat(prices[1] ?? 'NaN')
      if (!Number.isFinite(yes) || !Number.isFinite(no)) continue
      let change24hPts: number | null = null
      try {
        const tokenIds = JSON.parse(m.clobTokenIds) as string[]
        const ago = tokenIds[0] ? await fetchYes24hAgo(tokenIds[0]) : null
        if (ago !== null) change24hPts = (yes - ago) * 100
      } catch {
        // Riwayat tidak tersedia — perubahan 24j tetap null.
      }
      out.push({
        question: m.question,
        slug: m.slug,
        yesPrice: yes,
        noPrice: no,
        change24hPts,
        volume: m.volumeNum ?? 0,
        label: pick.label,
      })
    } catch (e) {
      console.warn('[koin] Gamma gagal untuk tag', pick.tag, ':', e)
    }
  }
  return out
}
