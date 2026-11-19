// Koin Sekilas — satu-satunya file yang perlu diubah untuk mengganti
// watchlist, pasar Polymarket, ambang alert, dan interval refresh.

export interface WatchToken {
  /** Simbol pendek yang tampil di kaca. */
  symbol: string
  /** Nama lengkap (untuk log/debug). */
  name: string
  /** ID CoinGecko, mis. "bitcoin". Dipakai sumber utama. */
  coingeckoId: string
  /** Pasangan Binance, mis. "BTCUSDT". Dipakai fallback (bila tidak di-geo-block). */
  binanceSymbol: string
  /**
   * Alamat token EVM untuk fallback DexScreener (pair DEX/meme).
   * Kosongkan untuk token tanpa pasangan DEX yang relevan (mis. DOGE).
   */
  dexScreenerAddress?: string
}

/** Watchlist harga. Urutan di sini = urutan tampil di kaca. */
export const WATCHLIST: WatchToken[] = [
  { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin', binanceSymbol: 'BTCUSDT' },
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum', binanceSymbol: 'ETHUSDT' },
  { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana', binanceSymbol: 'SOLUSDT' },
  { symbol: 'DOGE', name: 'Dogecoin', coingeckoId: 'dogecoin', binanceSymbol: 'DOGEUSDT' },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    coingeckoId: 'shiba-inu',
    binanceSymbol: 'SHIBUSDT',
    dexScreenerAddress: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
  },
  {
    symbol: 'PEPE',
    name: 'Pepe',
    coingeckoId: 'pepe',
    binanceSymbol: 'PEPEUSDT',
    dexScreenerAddress: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
  },
]

export interface MarketPick {
  /**
   * Tag Gamma API (mis. "crypto", "politics", "sports").
   * Pasar dipilih dari daftar tag ini, diurutkan volume tertinggi.
   * Tag dipilih agar tidak bergantung pada slug yang bisa kedaluwarsa;
   * bila tag kosong, app memakai pasar volume tertinggi apa pun.
   */
  tag: string
  /** Indeks ke-n dalam daftar tag (0 = volume tertinggi). */
  index: number
  /** Label pendek yang tampil di kaca. */
  label: string
}

/** Pasar Polymarket pilihan. Urutan di sini = urutan tampil di kaca. */
export const MARKET_PICKS: MarketPick[] = [
  { tag: 'crypto', index: 0, label: 'Kripto' },
  { tag: 'politics', index: 0, label: 'Politik' },
  { tag: 'sports', index: 0, label: 'Olahraga' },
  { tag: 'crypto', index: 1, label: 'Kripto 2' },
]

/**
 * Langkah ambang alert. `null` = alert mati.
 * Harga: persen pergerakan dari harga referensi.
 * Odds: poin persentase pergerakan harga Yes dari referensi.
 */
export const ALERT_STEPS: Array<number | null> = [null, 1, 3, 5, 10]

/** Indeks awal ALERT_STEPS untuk setiap item baru (2 = 3% / 3 poin). */
export const DEFAULT_ALERT_INDEX = 2

/** Interval refresh data (ms). CoinGecko Free ~10–30 call/menit — 60 dtk aman. */
export const REFRESH_MS = 60_000

/** Timeout per panggilan API (ms). */
export const FETCH_TIMEOUT_MS = 12_000
