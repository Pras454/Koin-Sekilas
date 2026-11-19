# Koin Sekilas

Harga kripto + odds Polymarket sekilas di kaca Even G2.
Entri hackathon **Heads Up: Even Realities** (DoraHacks), **Track 02 Crypto & DeFi**.

Satu aplikasi, dua view:

| View | Isi |
| --- | --- |
| **HARGA** | Watchlist token: harga + perubahan 24j (BTC, ETH, SOL, DOGE, SHIB, PEPE — bisa diubah di `src/config.ts`). |
| **ODDS** | Pasar Polymarket pilihan: harga Yes/No + perubahan 24j dalam poin (4 pasar: kripto, politik, olahraga, kripto 2 — bisa diubah di `src/config.ts`). |

Keduanya read-only: tidak ada login, tidak ada dana pengguna, tidak ada eksekusi order.

## Cara pakai di kaca

| Gerakan | Fungsi |
| --- | --- |
| Tap | Item berikutnya di view ini |
| Tahan (long press) | Pindah view (Harga ↔ Odds) |
| Geser atas / bawah | Ubah ambang alert item ini: mati → 1% → 3% → 5% → 10% → mati |
| Tap 2x | Keluar |

**Alert ("write"-nya aplikasi ini):** setiap item punya ambang alert (default 3% untuk harga,
3 poin untuk odds). Referensi alert = harga saat ambang dipasang (atau saat pertama dilihat).
Bila harga/odds bergerak melewati ambang dari referensi, layar item itu menampilkan
`!! ALERT !!` dengan besar pergerakan dan harga referensinya. Alert hanya berlaku selama
sesi berjalan (tidak disimpan permanen — lihat "Keterbatasan").

> Catatan desain: brief awal menugaskan tap untuk mengganti ambang alert, tapi spesifikasi
> navigasi final memakai tap untuk pindah item. Supaya tidak ada satu gerakan dengan dua
> fungsi yang bertabrakan, ambang alert digeser ke **geser atas/bawah** (gesture alami
> untuk menaik-turunkan nilai di touchpad kaca / cincin R1), dan tap tetap untuk browsing.

## Setup

```bash
npm install
npm run dev        # Vite di http://localhost:5173
npm run build      # tsc + vite build → dist/
npm run pack       # build + evenhub pack → koin-sekilas.ehpk
npm run simulate   # buka di Even Hub Simulator (butuh display)
npm run test:sim   # uji otomatis terhadap simulator (lihat di bawah)
```

### Uji di simulator headless (tanpa display)

```bash
# Terminal 1: sajikan build
npm run build && npx vite preview --port 5173 --strictPort
# Terminal 2: simulator di bawah X virtual
xvfb-run -a evenhub-simulator http://127.0.0.1:5173 --automation-port 9898
# Terminal 3: jalankan uji
npm run test:sim   # scripts/test-simulator.mjs — 15 assert, screenshot ke /tmp/koin-shot-*.png
```

Simulator adalah aplikasi GUI native (Rust + WebKitGTK). Di VM headless ia butuh
`libwebkit2gtk-4.1-0` (`sudo apt-get install -y libwebkit2gtk-4.1-0`) dan Xvfb.
Catatan: install sistem di luar `~` bersifat ephemeral — bila simulator tiba-tiba gagal
load lagi setelah VM di-reboot, ulangi install tersebut.

## Cara kerja

- `src/config.ts` — satu-satunya file yang perlu diubah untuk mengganti watchlist,
  pasar Polymarket, langkah ambang alert, dan interval refresh (60 detik).
- `src/prices.ts` — harga token. Utama: CoinGecko Free API (satu panggilan untuk
  seluruh watchlist). Fallback per token: Binance Public API (`ticker/24hr`), lalu
  DexScreener (pair DEX likuiditas tertinggi, untuk token yang punya alamat EVM).
- `src/polymarket.ts` — odds. Daftar pasar + harga Yes/No dari Polymarket Gamma API
  (diurutkan volume, dipilih per tag dari config, **dedupe berdasarkan slug** karena
  tag Gamma tumpang tindih). Perubahan 24j dari Polymarket CLOB API
  (`prices-history` token Yes, jendela 24 jam).
- `src/main.ts` — bridge Even Hub, dua view, refresh berkala, evaluasi alert, dan
  routing event. Pola event mengikuti template resmi: `CLICK_EVENT = 0` dan protobuf
  menghilangkan field nol, jadi default diselesaikan DI DALAM cek envelope
  (`eventTypeOf`); urutan cek: `DOUBLE_CLICK` dulu, `CLICK` terakhir.
- `app.json` — `package_id com.koinsekilas.app`, permission `network` dengan whitelist
  `api.coingecko.com`, `api.dexscreener.com`, `api.binance.com`,
  `gamma-api.polymarket.com`, `clob.polymarket.com`.
- SDK: `@evenrealities/even_hub_sdk` **0.0.16** (dibutuhkan karena `LONG_PRESS_EVENT`
  baru ada sejak 0.0.16; template asli memakai 0.0.10 yang tidak punya event ini).
  `min_app_version` 2.2.10 mengikuti floor SDK 0.0.16.

## Verifikasi (20 Nov 2026)

- `npm run build` — lolos (tsc + vite, bundle JS 91,9 kB).
- `evenhub pack` — lolos, menghasilkan `koin-sekilas.ehpk` (39.672 byte).
- Simulator headless — **15/15 assert lolos** (`npm run test:sim`): ping, bridge init,
  page created, refresh memuat 6 harga + 4 pasar odds dari API sungguhan, tap pindah
  token, long-press pindah Harga → Odds → Harga, tap di view odds pindah pasar,
  scroll mengubah ambang alert (3 → 5 pts, terverifikasi di screenshot).
- Screenshot bukti (framebuffer simulator 576×288, terverifikasi visual):
  `docs/simulator/shot-harga-btc.png`, `docs/simulator/shot-odds.png`,
  `docs/simulator/shot-odds-alert.png`.

### CORS — TIDAK ADA MASALAH (terverifikasi 20 Nov 2026)

Keempat API yang dipakai mengembalikan `Access-Control-Allow-Origin: *`, dan fetch
langsung dari WebView simulator terbukti jalan (harga BTC + odds Polymarket termuat
pada refresh pertama). **Tidak perlu backend proxy.**

Rencana cadangan bila suatu API suatu hari memblokir CORS: proxy read-only kecil yang
meneruskan request ke endpoint yang sama (mis. Cloudflare Worker tier gratis) — hanya
mengganti base URL di `src/prices.ts` / `src/polymarket.ts` dan menambah host proxy ke
whitelist `app.json`. Tidak dibangun sekarang karena tidak dibutuhkan.

Catatan: **Binance Public API memblokir lokasi VM ini** (geo-block: "Service unavailable
from a restricted location"). Binance tetap ada di kode sebagai fallback (kemungkinan
jalan di perangkat nyata di Indonesia), tapi tidak bisa diverifikasi dari VM ini.
CoinGecko + DexScreener sudah cukup sebagai sumber utama + fallback.

## Keterbatasan yang diketahui

- **Belum divalidasi di kaca G2 sungguhan.** Simulator bukan emulator hardware: performa,
  frame pacing, timing BLE, dan perilaku perangkat nyata tidak direproduksi. Docs Even
  mewajibkan validasi di hardware nyata sebelum deployment — kami tidak punya G2.
- Alert dan referensinya hanya hidup selama sesi (in-memory); restart app me-reset
  referensi ke harga saat pertama dilihat lagi.
- Tag Gamma API tumpang tindih dan berisik (pasar yang sama bisa bertag ganda); sudah
  ditangani dengan dedupe slug, tapi label tag di layar ("Kripto", "Politik") mengikuti
  tag yang dipilih di config, bukan klasifikasi resmi Polymarket.
- Pasar Polymarket dipilih dari daftar volume tertinggi per tag, jadi daftarnya berubah
  seiring waktu; slug tidak di-hardcode agar tidak kedaluwarsa.

## Deklarasi pra-hackathon (wajib aturan event)

Scaffold dan inti aplikasi ini **dibangun pada 20 November 2026, SEBELUM hackathon resmi
dimulai pada 23 November 2026**, dan dinyatakan di sini sesuai aturan event ("yang sudah
ada sebelum 23 Nov harus dinyatakan di README"). Yang sudah ada sebelum 23 Nov:

- Scaffold dari template resmi `even-realities/evenhub-templates` (`minimal`) +
  Even Hub SDK 0.0.16.
- Seluruh kode di repo ini pada commit awal (dua view Harga + Odds, alert, konfigurasi).
- Verifikasi build/pack/simulator seperti di atas.

Pengembangan lanjutan selama minggu hackathon (23–29 Nov) akan dicatat di commit-commit
berikutnya.

## Keamanan

- Tanpa API key, tanpa rahasia, tanpa login, tanpa penyimpanan data pengguna.
- Semua panggilan API read-only ke endpoint publik; tidak ada dana yang dipegang atau
  dipindahkan; tidak ada nasihat finansial — hanya menampilkan harga dan odds.
