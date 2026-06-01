// lib/pph21.js — Perhitungan PPh 21 berdasarkan PMK 168/2023 (Tarif Efektif Rata-rata / TER)

// ─── PTKP (Penghasilan Tidak Kena Pajak) Tahunan ──────────────────────────────
export const PTKP = {
  'TK/0': 54000000,
  'TK/1': 58500000,
  'TK/2': 63000000,
  'TK/3': 67500000,
  'K/0': 58500000,
  'K/1': 63000000,
  'K/2': 67500000,
  'K/3': 72000000,
}

export const STATUS_PTKP_LIST = ['TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3']

// ─── Kategori TER berdasarkan PTKP ────────────────────────────────────────────
export function getTERCategory(statusPtkp) {
  if (['TK/0', 'TK/1', 'K/0'].includes(statusPtkp)) return 'A'
  if (['TK/2', 'TK/3', 'K/1', 'K/2'].includes(statusPtkp)) return 'B'
  if (['K/3'].includes(statusPtkp)) return 'C'
  return 'A'
}

// ─── Tabel TER Kategori A (PMK 168/2023) ──────────────────────────────────────
// Format: [batas_atas_bruto, tarif_persen]
const TER_A = [
  [5400000, 0], [5650000, 0.25], [5950000, 0.5], [6300000, 0.75], [6750000, 1],
  [7500000, 1.25], [8550000, 1.5], [9650000, 1.75], [10050000, 2], [10350000, 2.25],
  [10700000, 2.5], [11050000, 3], [11600000, 3.5], [12500000, 4], [13750000, 5],
  [15100000, 6], [16950000, 7], [19750000, 8], [24150000, 9], [26450000, 10],
  [28000000, 11], [30050000, 12], [32400000, 13], [35400000, 14], [39100000, 15],
  [43850000, 16], [47800000, 17], [51400000, 18], [56300000, 19], [62200000, 20],
  [68600000, 21], [77500000, 22], [89000000, 23], [103000000, 24], [125000000, 25],
  [157000000, 26], [206000000, 27], [337000000, 28], [454000000, 29], [550000000, 30],
  [695000000, 31], [910000000, 32], [1400000000, 33], [Infinity, 34],
]

// ─── Tabel TER Kategori B ─────────────────────────────────────────────────────
const TER_B = [
  [6200000, 0], [6500000, 0.25], [6850000, 0.5], [7300000, 0.75], [9200000, 1],
  [10750000, 1.5], [11250000, 2], [11600000, 2.5], [12600000, 3], [13600000, 4],
  [14950000, 5], [16400000, 6], [18450000, 7], [21850000, 8], [26000000, 9],
  [27700000, 10], [29350000, 11], [31450000, 12], [33950000, 13], [37100000, 14],
  [41100000, 15], [45800000, 16], [49500000, 17], [53800000, 18], [58500000, 19],
  [64000000, 20], [71000000, 21], [80000000, 22], [93000000, 23], [109000000, 24],
  [129000000, 25], [163000000, 26], [211000000, 27], [374000000, 28], [459000000, 29],
  [555000000, 30], [704000000, 31], [957000000, 32], [1405000000, 33], [Infinity, 34],
]

// ─── Tabel TER Kategori C ─────────────────────────────────────────────────────
const TER_C = [
  [6600000, 0], [6950000, 0.25], [7350000, 0.5], [7800000, 0.75], [8850000, 1],
  [9800000, 1.25], [10950000, 1.5], [11200000, 1.75], [12050000, 2], [12950000, 3],
  [14150000, 4], [15550000, 5], [17050000, 6], [19500000, 7], [22700000, 8],
  [26600000, 9], [28100000, 10], [30100000, 11], [32600000, 12], [35400000, 13],
  [38900000, 14], [43000000, 15], [47400000, 16], [51200000, 17], [55800000, 18],
  [60400000, 19], [66700000, 20], [74500000, 21], [83200000, 22], [95600000, 23],
  [110000000, 24], [134000000, 25], [169000000, 26], [221000000, 27], [390000000, 28],
  [463000000, 29], [561000000, 30], [709000000, 31], [965000000, 32], [1419000000, 33],
  [Infinity, 34],
]

const TER_TABLES = { A: TER_A, B: TER_B, C: TER_C }

// ─── Hitung tarif TER bulanan ─────────────────────────────────────────────────
export function getTERRate(statusPtkp, brutoBulanan) {
  const kategori = getTERCategory(statusPtkp)
  const tabel = TER_TABLES[kategori]
  for (const [batas, tarif] of tabel) {
    if (brutoBulanan <= batas) return tarif
  }
  return 34
}

// ─── Hitung PPh 21 bulanan (metode TER, Jan-Nov) ──────────────────────────────
export function hitungPPh21Bulanan(brutoBulanan, statusPtkp, punyaNpwp = true, kenaanTanpaNpwp = true) {
  const tarif = getTERRate(statusPtkp, brutoBulanan)
  let pph = Math.round(brutoBulanan * tarif / 100)
  // Tanpa NPWP kena 20% lebih tinggi
  if (!punyaNpwp && kenaanTanpaNpwp) {
    pph = Math.round(pph * 1.2)
  }
  return pph
}

// ─── Tarif Progresif Tahunan (untuk perhitungan Desember) ─────────────────────
const TARIF_PROGRESIF = [
  [60000000, 5], [250000000, 15], [500000000, 25], [5000000000, 30], [Infinity, 35],
]

// Biaya jabatan: 5% dari bruto, maks Rp 6.000.000/tahun
function biayaJabatan(brutoTahunan) {
  return Math.min(Math.round(brutoTahunan * 0.05), 6000000)
}

// ─── Hitung PPh 21 tahunan (metode lama, untuk Desember) ──────────────────────
export function hitungPPh21Tahunan(brutoTahunan, statusPtkp, punyaNpwp = true, kenaanTanpaNpwp = true) {
  const netto = brutoTahunan - biayaJabatan(brutoTahunan)
  const ptkp = PTKP[statusPtkp] || PTKP['TK/0']
  let pkp = Math.max(0, netto - ptkp)
  // Pembulatan PKP ke ribuan terdekat ke bawah
  pkp = Math.floor(pkp / 1000) * 1000

  let pph = 0
  let sisa = pkp
  let batasSebelum = 0
  for (const [batas, tarif] of TARIF_PROGRESIF) {
    if (sisa <= 0) break
    const lapisan = Math.min(sisa, batas - batasSebelum)
    pph += lapisan * tarif / 100
    sisa -= lapisan
    batasSebelum = batas
  }
  pph = Math.round(pph)
  if (!punyaNpwp && kenaanTanpaNpwp) {
    pph = Math.round(pph * 1.2)
  }
  return pph
}

// ─── Hitung PPh 21 Desember ───────────────────────────────────────────────────
// = PPh tahunan - total PPh yang sudah dibayar Jan-Nov
export function hitungPPh21Desember(brutoTahunan, totalPphJanNov, statusPtkp, punyaNpwp = true, kenaanTanpaNpwp = true) {
  const pphTahunan = hitungPPh21Tahunan(brutoTahunan, statusPtkp, punyaNpwp, kenaanTanpaNpwp)
  return Math.max(0, pphTahunan - totalPphJanNov)
}