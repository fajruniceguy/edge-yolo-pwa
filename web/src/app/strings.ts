export interface Strings {
  appTitle: string;
  tagline: string;
  takePhoto: string;
  takeAnother: string;
  photoAlt: string;
  modelLoading: (loadedMB: string, totalMB: string | null) => string;
  modelError: string;
  retry: string;
  processing: string;
  countLabel: string;
  confidence: string;
  confidenceHelp: string;
  capped: (n: number) => string;
  estimateNote: string;
  timings: string;
  stage: { decode: string; letterbox: string; inference: string; post: string; total: string; rerun: string };
  errImage: string;
  errGeneric: string;
  technical: string;
  session: (ep: string, threads: number, source: string) => string;
  sourceNetwork: string;
  sourceCache: string;
}

const id: Strings = {
  appTitle: 'Penghitung Stok',
  tagline: 'Foto rak, hitung produk langsung di perangkat. Foto tidak dikirim ke server.',
  takePhoto: 'Foto rak',
  takeAnother: 'Foto lagi',
  photoAlt: 'Foto rak yang dianalisis',
  modelLoading: (a, b) => `Memuat model… ${a}${b ? ` / ${b}` : ''} MB`,
  modelError: 'Model tidak bisa dimuat.',
  retry: 'Coba lagi',
  processing: 'Menganalisis foto…',
  countLabel: 'produk terdeteksi',
  confidence: 'Ambang kepercayaan',
  confidenceHelp: 'Geser untuk mengubah hasil tanpa menjalankan ulang model.',
  capped: (n) => `Dibatasi maksimum ${n} kotak.`,
  estimateNote:
    'Perkiraan saja. Produk kecil sering terlewat, dan model hanya menandai "ada produk", tidak mengenali jenisnya.',
  timings: 'Waktu per tahap',
  stage: {
    decode: 'Decode gambar',
    letterbox: 'Letterbox',
    inference: 'Inferensi',
    post: 'Pasca-proses',
    total: 'Total',
    rerun: 'Hitung ulang ambang',
  },
  errImage: 'Foto tidak bisa dibaca. Coba foto lain (JPEG atau PNG).',
  errGeneric: 'Terjadi kesalahan saat memproses foto.',
  technical: 'Detail teknis',
  session: (ep, threads, source) => `Mesin: ${ep} · ${threads} thread · model dari ${source}`,
  sourceNetwork: 'jaringan',
  sourceCache: 'cache',
};

const en: Strings = {
  appTitle: 'Stock Counter',
  tagline: 'Photograph a shelf and count products on your device. The photo is not sent to a server.',
  takePhoto: 'Photograph shelf',
  takeAnother: 'Take another',
  photoAlt: 'The analysed shelf photo',
  modelLoading: (a, b) => `Loading model… ${a}${b ? ` / ${b}` : ''} MB`,
  modelError: 'The model could not be loaded.',
  retry: 'Try again',
  processing: 'Analysing photo…',
  countLabel: 'products detected',
  confidence: 'Confidence threshold',
  confidenceHelp: 'Drag to change the result without re-running the model.',
  capped: (n) => `Capped at ${n} boxes.`,
  estimateNote:
    'An estimate only. Small products are often missed, and the model only marks "a product is here"; it does not identify what it is.',
  timings: 'Per-stage timings',
  stage: {
    decode: 'Decode image',
    letterbox: 'Letterbox',
    inference: 'Inference',
    post: 'Postprocess',
    total: 'Total',
    rerun: 'Threshold re-run',
  },
  errImage: 'The photo could not be read. Try another one (JPEG or PNG).',
  errGeneric: 'Something went wrong while processing the photo.',
  technical: 'Technical details',
  session: (ep, threads, source) => `Engine: ${ep} · ${threads} threads · model from ${source}`,
  sourceNetwork: 'network',
  sourceCache: 'cache',
};

export const lang: 'id' | 'en' = navigator.language.toLowerCase().startsWith('id') ? 'id' : 'en';
export const t: Strings = lang === 'id' ? id : en;
