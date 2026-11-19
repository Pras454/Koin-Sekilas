// Sumber harga token — semuanya GRATIS, read-only, tanpa API key, tanpa login.
//
// Urutan fallback per token:
//   1. CoinGecko Free API (satu panggilan untuk seluruh watchlist)
//   2. Binance Public API (ticker 24h) — catatan: Binance memblokir
//      lokasi tertentu (geo-block); dari VM ini mengembalikan error
//      "Service unavailable from a restricted location". Di perangkat
//      nyata di Indonesia kemungkinan jalan; di sini hanya fallback.
//   3. DexScreener (pair DEX dengan likuiditas tertinggi) — untuk token
//      yang punya dexScreenerAddress di config (meme).

import { WATCHLIST, FETCH_TIMEOUT_MS, type WatchToken } from './config'

export interface PriceQuote {
  price: number
  /** Perubahan 24 jam dalam persen. */
  change24h: number
  source: 'coingecko' | 'binance' | 'dexscreener'
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

async function fetchFromCoinGecko(out: Map<string, PriceQuote>): Promise<void> {
  const ids = WATCHLIST.map(t => t.coingeckoId).join(',')
  const url =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
  const data = (await fetchJson(url)) as Record<
    string,
    { usd?: number; usd_24h_change?: number }
  >
  for (const tok of WATCHLIST) {
    const d = data[tok.coingeckoId]
    if (d && typeof d.usd === 'number') {
      out.set(tok.symbol, {
        price: d.usd,
        change24h: d.usd_24h_change ?? 0,
        source: 'coingecko',
      })
    }
  }
}

async function fetchFromBinance(tok: WatchToken): Promise<PriceQuote | null> {
  try {
    const data = (await fetchJson(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${tok.binanceSymbol}`,
    )) as { lastPrice?: string; priceChangePercent?: string; code?: number }
    if (typeof data.code === 'number') return null // geo-block / error Binance
    if (typeof data.lastPrice !== 'string') return null
    return {
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent ?? '0'),
      source: 'binance',
    }
  } catch {
    return null
  }
}

async function fetchFromDexScreener(tok: WatchToken): Promise<PriceQuote | null> {
  if (!tok.dexScreenerAddress) return null
  try {
    const data = (await fetchJson(
      `https://api.dexscreener.com/latest/dex/tokens/${tok.dexScreenerAddress}`,
    )) as {
      pairs?: Array<{
        priceUsd?: string
        liquidity?: { usd?: number }
        priceChange?: { h24?: number }
      }>
    }
    const pairs = (data.pairs ?? []).filter(p => typeof p.priceUsd === 'string')
    if (!pairs.length) return null
    // Pair dengan likuiditas tertinggi = harga paling dapat dipercaya.
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
    const best = pairs[0]
    return {
      price: parseFloat(best.priceUsd as string),
      change24h: best.priceChange?.h24 ?? 0,
      source: 'dexscreener',
    }
  } catch {
    return null
  }
}

/**
 * Ambil harga seluruh watchlist. Token yang gagal di semua sumber tidak
 * masuk ke map — pemanggil mempertahankan harga terakhir yang diketahui.
 */
export async function fetchPrices(): Promise<Map<string, PriceQuote>> {
  const out = new Map<string, PriceQuote>()
  try {
    await fetchFromCoinGecko(out)
  } catch (e) {
    console.warn('[koin] CoinGecko gagal, memakai fallback:', e)
  }
  for (const tok of WATCHLIST) {
    if (out.has(tok.symbol)) continue
    const fromBinance = await fetchFromBinance(tok)
    if (fromBinance) {
      out.set(tok.symbol, fromBinance)
      continue
    }
    const fromDex = await fetchFromDexScreener(tok)
    if (fromDex) out.set(tok.symbol, fromDex)
  }
  return out
}
