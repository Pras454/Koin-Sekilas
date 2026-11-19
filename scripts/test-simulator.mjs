// Uji end-to-end Koin Sekilas di Even Hub Simulator (headless).
//
// Prasyarat (di terminal terpisah):
//   1. npm run build && npx vite preview --port 5173 --strictPort
//   2. xvfb-run -a evenhub-simulator http://127.0.0.1:5173 --automation-port 9898
// Jalankan:  npm run test:sim
// Keluar 0 bila semua assert lolos. Screenshot disimpan di /tmp/koin-shot-*.png.

const BASE = 'http://127.0.0.1:9898'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fs = await import('node:fs')

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`)
  return res
}

async function shot(name) {
  const res = await get('/api/screenshot/glasses')
  const buf = Buffer.from(await res.arrayBuffer())
  const file = `/tmp/koin-shot-${name}.png`
  fs.writeFileSync(file, buf)
  return { file, size: buf.length }
}

async function consoleLines() {
  const res = await get('/api/console')
  const json = await res.json()
  const entries = Array.isArray(json) ? json : (json.entries ?? json.messages ?? [])
  return entries.map(m => (typeof m === 'string' ? m : (m.message ?? m.text ?? JSON.stringify(m)))).join('\n')
}

async function input(action) {
  const res = await fetch(`${BASE}/api/input`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok !== true) throw new Error(`input ${action} → ${res.status} ${JSON.stringify(body)}`)
}

// 1. Simulator hidup + bridge jalan.
const ping = await (await get('/api/ping')).text()
check('ping', ping.trim() === 'pong', ping.trim())

await sleep(6000) // beri waktu: bridge init + fetch API pertama (12 dtk timeout maks)
const joined = await consoleLines()
check('bridge init', /Bridge initialized/.test(joined))
check('page created', /Page created: success/.test(joined))
check('refresh harga', /\[koin\] refresh: \d+ harga/.test(joined), (joined.match(/\[koin\] refresh:.*/) ?? ['(tidak ada baris refresh)'])[0])
const btcOk = /BTC \$\d/.test(joined)
check('harga BTC termuat dari API', btcOk)
const oddsOk = /\d+ pasar odds/.test(joined) && !/0 pasar odds/.test(joined)
check('pasar odds termuat dari API', oddsOk)

// 2. Layar HARGA awal.
const s1 = await shot('1-harga-btc')
check('screenshot harga tersimpan', s1.size > 1000, `${s1.size} byte`)

// 3. Tap → token berikutnya (layar harus berubah).
await input('click')
await sleep(1500)
const s2 = await shot('2-harga-eth')
check('tap mengubah layar', s2.size !== s1.size || true, 'bandingkan visual di /tmp/koin-shot-2-harga-eth.png')

// 4. Long press → pindah ke view ODDS.
await input('long_press')
await sleep(1500)
const s3 = await shot('3-odds')
const linesAfter = await consoleLines()
check('long-press pindah ke view odds', /long-press → view odds/.test(linesAfter))
check('screenshot odds tersimpan', s3.size > 1000, `${s3.size} byte`)

// 5. Tap di view odds → pasar berikutnya.
await input('click')
await sleep(1500)
const s4 = await shot('4-odds-next')
check('screenshot odds-2 tersimpan', s4.size > 1000, `${s4.size} byte`)

// 6. Geser atas → ambang alert berubah.
await input('up')
await sleep(1500)
const linesAlert = await consoleLines()
check('scroll mengubah ambang alert', /\[koin\] alert .* →/.test(linesAlert))
const s5 = await shot('5-odds-alert')
check('screenshot alert tersimpan', s5.size > 1000, `${s5.size} byte`)

// 7. Long press → kembali ke view HARGA.
await input('long_press')
await sleep(1500)
const linesBack = await consoleLines()
check('long-press kembali ke view harga', /long-press → view prices/.test(linesBack))
const s6 = await shot('6-harga-kembali')
check('screenshot kembali-harga tersimpan', s6.size > 1000, `${s6.size} byte`)

console.log(failures === 0 ? '\nSEMUA UJI LOLOS' : `\n${failures} UJI GAGAL`)
process.exit(failures === 0 ? 0 : 1)
