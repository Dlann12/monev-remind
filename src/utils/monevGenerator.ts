import {
  ensureMinMonevLength,
  type LatestDailyLogDraft
} from '@/services/monevPortalService'

export type MonevActivityCategory =
  | 'auto'
  | 'coding'
  | 'meeting'
  | 'design'
  | 'testing'
  | 'data'
  | 'docs'

export interface GenerateMonevOptions {
  shortActivity: string
  shortObstacle?: string
  category?: MonevActivityCategory
  role?: string
  company?: string
  variant?: number
}

type ConcreteCategory = Exclude<MonevActivityCategory, 'auto'> | 'general'

const CATEGORY_KEYWORDS: Record<Exclude<ConcreteCategory, 'general'>, RegExp> = {
  coding:
    /\b(cod(e|ing)|api|fitur|feature|frontend|backend|fullstack|vue|react|next|laravel|node|python|java|sql|database|db|endpoint|deploy|git|pr|branch|refactor|komponen|component|halaman|page|login|ui|integrasi|script|program|web|aplikasi|app|android|apk|server)\b/i,
  testing:
    /\b(test(ing)?|qa|bug|bugfix|fix(ing)?|debug(ging)?|error|audit|uji|validasi|cek|perbaik(i|an)|troubleshoot|evaluasi|verifikasi)\b/i,
  meeting:
    /\b(meeting|rapat|diskusi|sprint|standup|daily|koordinasi|presentasi|demo|briefing|review|mentor|mentoring|konsultasi|sharing|sync)\b/i,
  design:
    /\b(desain|design|figma|canva|poster|banner|konten|content|video|edit(ing)?|mockup|wireframe|prototype|ilustrasi|sosmed|social|branding|logo|flyer|slide|layout)\b/i,
  data:
    /\b(data|excel|spreadsheet|sheet|rekap|input|entry|entri|analisis|analisa|dashboard|chart|grafik|statistik|dataset|csv|scraping|kuesioner|survei|survey)\b/i,
  docs:
    /\b(dokumen(tasi)?|laporan|report|notulen|administrasi|admin|arsip|surat|sop|manual|panduan|catatan|proposal|materi|modul|artikel|penulisan)\b/i
}

export function detectMonevCategory(text: string): ConcreteCategory {
  const cleaned = text.trim()
  if (!cleaned) return 'general'
  // Check testing before coding if specifically about bugfix/testing, else coding
  for (const cat of [
    'coding',
    'testing',
    'meeting',
    'design',
    'data',
    'docs'
  ] as const) {
    if (CATEGORY_KEYWORDS[cat].test(cleaned)) {
      return cat
    }
  }
  return 'general'
}

function normalizeClause(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')
  if (!cleaned) return ''
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1)
}

function buildContextPhrase(role?: string, company?: string): string {
  const cleanRole = (role || '').trim()
  const cleanCompany = (company || '').trim()
  const ignoreRole =
    !cleanRole || cleanRole.toLowerCase().includes('menunggu sinkronisasi')
  const ignoreCompany =
    !cleanCompany || cleanCompany.toLowerCase().includes('monev kemnaker')

  if (!ignoreRole && !ignoreCompany) {
    return `sebagai ${cleanRole} di ${cleanCompany}`
  }
  if (!ignoreCompany) {
    return `di lingkungan ${cleanCompany}`
  }
  if (!ignoreRole) {
    return `pada peran ${cleanRole}`
  }
  return 'sesuai lingkup penugasan magang'
}

const LESSON_TEMPLATES: Record<ConcreteCategory, readonly string[]> = {
  coding: [
    'Melalui pengerjaan {topic}, saya semakin memahami praktik penulisan kode yang terstruktur, pemecahan masalah teknis secara sistematis, serta pentingnya menjaga keterbacaan dan keandalan komponen agar mudah dikembangkan bersama tim.',
    'Kegiatan {topic} memberikan pengalaman langsung mengenai alur pengembangan perangkat lunak profesional, mulai dari perancangan logika, integrasi antarmuka atau layanan, hingga evaluasi hasil sesuai standar kualitas tim teknis.',
    'Dari proses menyelesaikan {topic}, saya belajar bagaimana menganalisis kebutuhan fungsional secara lebih teliti, mengelola perubahan kode dengan rapi, serta berkomunikasi efektif ketika berdiskusi teknis bersama mentor.'
  ],
  testing: [
    'Melalui proses {topic}, saya memahami pentingnya pengujian menyeluruh dan verifikasi kasus tepi (edge case) sebelum perubahan digunakan, sehingga potensi kesalahan dapat dideteksi dan ditangani sejak dini.',
    'Kegiatan {topic} melatih ketelitian saya dalam menelusuri akar penyebab permasalahan, memvalidasi perbaikan secara bertahap, serta mendokumentasikan temuan pengujian agar kualitas sistem tetap terjaga.',
    'Dari pengerjaan {topic}, saya memperoleh pemahaman praktis mengenai metode pengecekan kualitas yang sistematis serta cara berkoordinasi dengan tim untuk memastikan setiap perbaikan berjalan sesuai spesifikasi.'
  ],
  meeting: [
    'Melalui sesi {topic}, saya belajar pentingnya komunikasi kerja yang jelas, penyampaian progres secara terstruktur, serta penyelarasan prioritas antaranggota tim agar target pekerjaan dapat tercapai tepat waktu.',
    'Kegiatan {topic} memberikan wawasan mengenai alur pengambilan keputusan di lingkungan kerja profesional, cara menerima masukan konstruktif dari mentor, serta penyusunan rencana tindak lanjut yang terukur.',
    'Dari diskusi pada {topic}, saya semakin terlatih mendengarkan kebutuhan lintas fungsi, mencatat poin-poin penting secara akurat, dan menerjemahkan arahan diskusi menjadi langkah kerja harian yang konkret.'
  ],
  design: [
    'Melalui pengerjaan {topic}, saya memperdalam pemahaman mengenai konsistensi visual, tata letak yang nyaman dibaca pengguna, serta penyesuaian desain agar selaras dengan identitas dan tujuan komunikasi instansi.',
    'Kegiatan {topic} melatih kepekaan saya terhadap detail tipografi, komposisi warna, dan alur penyampaian pesan visual, sekaligus membiasakan proses iterasi berdasarkan umpan balik dari mentor dan tim.',
    'Dari proses menyelesaikan {topic}, saya belajar menyeimbangkan estetika dengan kejelasan informasi serta mengelola aset desain secara rapi agar mudah digunakan kembali pada kebutuhan berikutnya.'
  ],
  data: [
    'Melalui pengerjaan {topic}, saya belajar pentingnya akurasi, konsistensi format, dan pengecekan silang dalam pengolahan data agar informasi yang dihasilkan valid serta siap dijadikan dasar pengambilan keputusan.',
    'Kegiatan {topic} meningkatkan keterampilan saya dalam merapikan struktur data, mengidentifikasi anomali sejak awal, dan menyajikan ringkasan hasil secara ringkas serta mudah dipahami oleh tim maupun mentor.',
    'Dari proses {topic}, saya semakin memahami alur pengelolaan data operasional yang rapi, efisiensi penggunaan perangkat olah data, serta tanggung jawab menjaga ketelitian setiap entri yang dikerjakan.'
  ],
  docs: [
    'Melalui penyusunan terkait {topic}, saya belajar menyusun informasi kerja secara sistematis, lugas, dan sesuai standar administrasi instansi agar mudah ditelusuri kembali oleh seluruh anggota tim.',
    'Kegiatan {topic} melatih ketelitian saya dalam memverifikasi kelengkapan berkas, merapikan struktur dokumentasi, serta menjaga ketepatan waktu penyelesaian tugas administratif harian.',
    'Dari pengerjaan {topic}, saya memperoleh pengalaman mengenai pentingnya dokumentasi yang rapi dan akurat sebagai bagian dari akuntabilitas kerja serta kelancaran koordinasi di lingkungan magang.'
  ],
  general: [
    'Melalui kegiatan {topic}, saya memperoleh pengalaman praktis mengenai alur kerja operasional harian, pengelolaan prioritas tugas secara disiplin, serta penerapan komunikasi profesional bersama tim dan mentor.',
    'Proses menyelesaikan {topic} membantu saya memahami standar kualitas kerja di lapangan, meningkatkan ketelitian dalam menjalankan instruksi, serta memperkuat kemampuan beradaptasi terhadap dinamika tugas harian.',
    'Dari pelaksanaan {topic}, saya belajar menyusun tahapan kerja yang terencana, mengevaluasi hasil secara mandiri sebelum dilaporkan, dan berkolaborasi secara efektif untuk mendukung target tim.'
  ]
}

const NO_OBSTACLE_TEMPLATES = [
  'Tidak terdapat kendala signifikan selama pelaksanaan kegiatan hari ini. Seluruh tahapan pengerjaan, koordinasi dengan rekan tim, serta penyelarasan arahan bersama mentor berjalan dengan lancar sesuai jadwal yang telah direncanakan.',
  'Secara umum tidak ditemui hambatan berarti dalam menyelesaikan target tugas hari ini. Beberapa penyesuaian kecil terkait detail teknis maupun alur kerja dapat langsung diatasi melalui pengecekan mandiri dan diskusi singkat bersama tim.',
  'Pelaksanaan tugas harian berjalan kondusif tanpa kendala yang menghambat penyelesaian pekerjaan. Komunikasi dengan mentor berlangsung responsif sehingga setiap pertanyaan teknis atau kebutuhan informasi dapat segera dikonfirmasi.'
] as const

const WITH_OBSTACLE_TEMPLATES = [
  'Sempat ditemui kendala terkait {obstacle} pada saat proses pengerjaan berlangsung. Namun, hambatan tersebut berhasil diatasi melalui penelusuran ulang secara bertahap serta koordinasi aktif bersama mentor dan rekan tim sehingga seluruh target tetap terselesaikan dengan baik.',
  'Dalam pelaksanaan kegiatan hari ini terdapat sedikit hambatan berupa {obstacle}. Sebagai solusi, saya melakukan evaluasi langkah kerja, mencari referensi pendukung, dan berdiskusi dengan tim sehingga permasalahan dapat ditangani dan pekerjaan kembali berjalan lancar.',
  'Kendala utama yang dihadapi adalah {obstacle} yang sempat memerlukan waktu penyesuaian tambahan. Melalui pengecekan teliti serta arahan konstruktif dari mentor, kendala tersebut berhasil diselesaikan tanpa mengganggu target harian.'
] as const

/**
 * Generates rich, formal Indonesian Monev daily log entries (>= 100 chars per field)
 * 100% offline from a short user activity summary.
 */
export function generateMonevFromShortActivity(
  options: GenerateMonevOptions
): LatestDailyLogDraft {
  const rawShort = options.shortActivity.trim()
  const topic =
    normalizeClause(rawShort) ||
    'pelaksanaan tugas operasional harian sesuai arahan mentor'
  const concreteCat: ConcreteCategory =
    options.category && options.category !== 'auto'
      ? options.category
      : detectMonevCategory(rawShort)

  const variantIdx = Math.abs(Math.floor(options.variant ?? 0)) % 3
  const contextPhrase = buildContextPhrase(options.role, options.company)

  const activityVariants = [
    `Pada hari ini, saya melaksanakan kegiatan utama yaitu ${topic} ${contextPhrase}. Pengerjaan dimulai dengan meninjau prioritas serta kebutuhan detail tugas, dilanjutkan dengan eksekusi secara bertahap dan pengecekan kesesuaian hasil agar memenuhi standar kualitas yang ditetapkan. Setelah selesai, progres dan hasil pekerjaan dicatat serta dikoordinasikan bersama tim dan mentor sebagai bahan evaluasi berkelanjutan.`,
    `Agenda kerja hari ini difokuskan pada penyelesaian tugas ${topic} ${contextPhrase}. Selama proses pelaksanaan, saya memastikan setiap tahapan dikerjakan secara terstruktur, rapi, dan selaras dengan arahan pembimbing lapangan maupun target tim. Di akhir sesi kerja, saya melakukan peninjauan ulang terhadap hasil yang dicapai untuk memastikan tidak ada detail penting yang terlewat serta menyiapkan pembaruan progres harian.`,
    `Hari ini saya mengerjakan rangkaian aktivitas yang berfokus pada ${topic} ${contextPhrase}. Kegiatan mencakup tahap identifikasi kebutuhan kerja, implementasi dan penyelesaian inti tugas sesuai rencana, serta verifikasi mandiri terhadap kualitas keluaran yang dihasilkan. Seluruh perkembangan tugas kemudian diselaraskan dengan rekan tim agar mendukung kelancaran target kerja mingguan secara menyeluruh.`
  ] as const

  const lessonList = LESSON_TEMPLATES[concreteCat]
  const rawLesson = lessonList[variantIdx % lessonList.length]!.replace(
    /\{topic\}/g,
    topic
  )

  const cleanObstacle = normalizeClause(options.shortObstacle || '')
  const rawObstacles = cleanObstacle
    ? WITH_OBSTACLE_TEMPLATES[variantIdx % WITH_OBSTACLE_TEMPLATES.length]!.replace(
        /\{obstacle\}/g,
        cleanObstacle
      )
    : NO_OBSTACLE_TEMPLATES[variantIdx % NO_OBSTACLE_TEMPLATES.length]!

  return {
    sourceDate: '',
    activity_log: ensureMinMonevLength(activityVariants[variantIdx]!, 'activity'),
    lesson_learned: ensureMinMonevLength(rawLesson, 'lesson'),
    obstacles: ensureMinMonevLength(rawObstacles, 'obstacles')
  }
}
