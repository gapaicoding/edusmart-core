Product Requirements Document (PRD)

EduSmart — School Operating System (SchoolOS)

Versi: 1.0
Tanggal: 10 Agustus 2026
Status: Draft untuk internal review
Disusun berdasarkan: Brief Proposal EduSmart & hasil diskusi konsep platform

1. Executive Summary

EduSmart adalah platform terpadu untuk digitalisasi sekolah ("School Operating System"), bukan sekadar aplikasi absensi/PPDB/e-rapor terpisah seperti kebanyakan vendor di Indonesia. Platform ini melayani seluruh siklus operasional sekolah — dari akuisisi calon siswa (PPDB/CRM), proses belajar-mengajar (akademik + LMS), administrasi & keuangan, hingga analitik untuk yayasan dan dinas pendidikan — dengan AI Assistant sebagai pembeda utama.

Tim pengembang sudah berpengalaman membangun GAPAI Journal dengan stack Next.js + TypeScript, sehingga PRD ini dirancang agar dapat dieksekusi dengan stack yang sama, diperluas secara bertahap untuk mendukung multi-tenant, mobile app, dan integrasi AI.

Karena cakupan produk sangat luas (~20 modul, 13 tipe pengguna), dokumen ini menekankan pendekatan MVP → iterasi bertahap, bukan membangun semua modul sekaligus.

2. Latar Belakang & Peluang

Mayoritas vendor SMS di Indonesia hanya menjual fitur operasional tunggal (absensi QR, nilai, PPDB, CBT, perpustakaan) → pasar penuh, tapi terfragmentasi.

Sangat sedikit vendor yang membangun platform terpadu (all-in-one) yang melayani semua stakeholder: Yayasan, Kepala Sekolah, Guru, Wali Kelas, BK, TU, Bendahara, HR, Orang Tua, Siswa, bahkan Dinas Pendidikan.

AI belum banyak dimanfaatkan secara serius (pembuatan RPP/modul ajar, soal HOTS, analisis hasil belajar) — ini menjadi peluang diferensiasi kuat.

Tren global (SIS modern) mengarah pada integrasi SIS + LMS + Finance + Communication + Analytics dalam satu ekosistem, bukan aplikasi terpisah-pisah.

Opportunity statement: Membangun SMS yang diposisikan sebagai School Operating System, dengan AI sebagai fitur pembeda, dan arsitektur yang bisa scale dari 1 sekolah → multi-sekolah/yayasan → level dinas pendidikan.

3. Tujuan Produk (Goals)

Meningkatkan efisiensi administrasi & operasional sekolah (mengurangi kerja manual guru, TU, bendahara).

Memberi visibilitas real-time bagi Kepala Sekolah & Yayasan atas kondisi akademik, keuangan, dan operasional.

Meningkatkan transparansi informasi ke orang tua & siswa (nilai, presensi, tagihan, jadwal).

Menjadikan AI sebagai co-pilot guru (pembuatan modul ajar, soal, analisis hasil belajar) dan co-pilot manajemen (ringkasan, prediksi risiko siswa).

Menyediakan fondasi arsitektur multi-tenant agar bisa dijual ke banyak sekolah/yayasan sebagai SaaS.

Non-Goals (di luar cakupan awal)

Modul Dinas Pendidikan lintas-sekolah (fase jauh setelah traction B2B tercapai).

Payroll dengan kompleksitas pajak penuh (PPh21 dsb.) di fase awal — cukup payroll dasar.

LMS dengan fitur live class canggih (breakout room dsb.) di MVP — cukup integrasi Zoom/Meet link.

4. Target Pengguna & Persona

#

Persona

Kebutuhan Utama

1

Yayasan/Pemilik Sekolah

Executive dashboard: jumlah siswa, growth, retention, cashflow, piutang, KPI, multi-school view

2

Kepala Sekolah

Dashboard harian: kehadiran guru/siswa, kelas kosong, approval, supervisi guru

3

Wakil Kepala Sekolah (Kurikulum/Kesiswaan/Sarpras)

Jadwal, kalender akademik, tata tertib, inventaris, pengadaan

4

Guru

Jadwal mengajar, materi, penilaian, jurnal mengajar, AI pembuat soal/modul

5

Wali Kelas

Rekap absensi/nilai kelasnya, catatan perilaku, komunikasi orang tua

6

Guru BK

Kasus siswa, konseling, pelanggaran, rekomendasi AI siswa berisiko

7

Tata Usaha

Surat, arsip, legalitas, mutasi, alumni

8

Bendahara

SPP, tagihan, pembayaran online (QRIS/VA), piutang

9

HR Guru

Data guru, kontrak, sertifikasi, KPI, cuti

10

Orang Tua

Presensi realtime anak, nilai, tagihan, chat guru, perizinan

11

Siswa

Jadwal, tugas, materi, nilai, portofolio

12

Dinas Pendidikan (fase lanjut)

Monitoring lintas sekolah, early warning

13

Calon Siswa/Orang Tua (PPDB)

Pendaftaran online, tracking status, pembayaran

5. Arsitektur Modul Produk

CORE PLATFORM (EduSmart)
│
├── 1. Student Information System (SIS)      → fondasi data
├── 2. PPDB & CRM
├── 3. Academic Management (jadwal, presensi, nilai, rapor)
├── 4. Learning Management System (LMS)
├── 5. AI Assistant
├── 6. Finance & Billing (SPP/BOS/QRIS/VA)
├── 7. HR & Teacher Management
├── 8. Parent & Student Portal
├── 9. Communication Center (WA/Email/Notifikasi)
├── 10. Website Profil Sekolah + CMS
├── 11. Agenda & Kalender
├── 12. Prestasi & Portofolio
├── 13. Sarana Prasarana & Inventaris
├── 14. Perpustakaan Digital
├── 15. Kesehatan (UKS)
├── 16. Tahfidz & Keagamaan (opsional)
├── 17. Surat Menyurat & Arsip Digital
├── 18. Analytics & BI (dashboard Kepsek/Yayasan)
└── 19. Dashboard Dinas Pendidikan (opsional, jauh ke depan)

6. Prioritas MVP (Fase 1)

Berdasarkan value tertinggi vs kompleksitas terendah:

Prioritas

Modul

Alasan

P0

SIS (data siswa, guru, orang tua, kelas)

Fondasi semua modul lain

P0

Academic Management (jadwal, presensi, nilai, rapor sederhana)

Fitur harian yang paling sering dipakai

P0

Parent & Student Portal

Nilai jual utama ke sekolah — transparansi

P0

Auth & Role Management (multi-role, multi-tenant)

Wajib untuk semua modul

P1

PPDB & CRM

Sumber pendapatan sekolah, mudah didemokan

P1

Finance & Billing (SPP + QRIS/VA)

Value tinggi untuk bendahara/yayasan

P1

Communication Center (WA notifikasi dasar)

Diferensiasi vs kompetitor

P2

AI Assistant (pembuat soal, RPP, ringkasan)

Diferensiasi utama — bisa masuk cepat setelah P0/P1 stabil karena berbasis LLM API, bukan data historis besar

P2

LMS ringan (materi, tugas, CBT sederhana)

Bisa MVP dengan fitur minimal dulu

P2

Analytics/BI dashboard Kepsek & Yayasan

Butuh data dari modul lain terlebih dahulu

Modul lain (Sarpras, Perpustakaan, UKS, Tahfidz, Website CMS, Dinas) masuk Fase 2/3 — lihat roadmap di bagian 10.

7. Functional Requirements (Ringkasan per Modul MVP)

7.1 Student Information System (SIS)

CRUD data siswa, guru, staff, orang tua, kelas, mapel, tahun ajaran.

Relasi siswa ↔ orang tua ↔ wali kelas.

Riwayat mutasi kelas/naik kelas per tahun ajaran.

Import/export data (Excel) untuk migrasi dari sistem lama.

7.2 Academic Management

Manajemen jadwal pelajaran (per kelas, per guru, cek bentrok).

Presensi siswa & guru (manual, QR code; fingerprint/RFID sebagai integrasi hardware opsional fase 2).

Input nilai (tugas, UH, UTS, UAS), skala kurikulum merdeka (capaian pembelajaran).

Generate rapor digital (PDF) per siswa per semester.

Jurnal mengajar guru (materi diajarkan, kendala).

7.3 Parent & Student Portal (Web + Mobile)

Login orang tua/siswa (1 akun orang tua bisa multi-anak).

Lihat presensi realtime, nilai, jadwal, tugas.

Terima notifikasi (push + WA) untuk pengumuman, tagihan, izin.

Ajukan izin/sakit online → masuk approval wali kelas.

7.4 PPDB & CRM

Form pendaftaran online (custom per sekolah).

Pipeline CRM: Lead → Bertanya → Open House → Trial → Tes → Interview → Diterima → Daftar → Bayar → Aktif.

Dashboard funnel & conversion rate.

Broadcast WA follow-up (integrasi WhatsApp Business API).

7.5 Finance & Billing

Generate tagihan SPP/uang gedung per siswa per bulan.

Pembayaran online (QRIS, Virtual Account) via payment gateway.

Rekonsiliasi otomatis status "lunas/belum".

Laporan piutang & cashflow sederhana.

7.6 AI Assistant (v1)

Guru: generate modul ajar/RPP sesuai mapel & kelas (prompt-based, output bisa diedit & disimpan).

Guru: generate soal (pilihan ganda/essay/HOTS) lengkap kisi-kisi.

Kepala Sekolah: ringkasan operasional harian (presensi, kelas kosong, dsb — berbasis data platform, bukan LLM murni).

Guardrail: semua output AI untuk konten akademik ditandai "draft, perlu direview guru" — bukan otomatis final.

7.7 Communication Center

Notifikasi in-app + push (mobile) + WhatsApp (transactional: tagihan, izin, nilai keluar) + Email (fallback).

Broadcast pengumuman sekolah (per kelas/seluruh sekolah).

8. Non-Functional Requirements

Kategori

Requirement

Multi-tenancy

Satu instance melayani banyak sekolah/yayasan; isolasi data ketat per tenant

Skalabilitas

Desain awal harus siap untuk ratusan sekolah, ribuan user per sekolah

Keamanan

Enkripsi data at-rest & in-transit; RBAC granular per modul; audit log untuk data sensitif (nilai, keuangan)

Privasi Data Anak

Kepatuhan terhadap UU PDP Indonesia — data anak adalah data sensitif, perlu consent orang tua & retention policy jelas

Ketersediaan

Target uptime 99.5% untuk fitur inti (presensi, nilai, tagihan)

Performa

Dashboard load < 2 detik untuk data ringkasan; laporan besar via background job + notifikasi selesai

Localization

Bahasa Indonesia sebagai default; siap i18n untuk ekspansi

Offline-first (mobile)

Guru bisa input presensi/nilai saat koneksi lemah, sync otomatis saat online kembali

Auditability

Setiap perubahan nilai/keuangan tercatat siapa & kapan (untuk kepercayaan orang tua & sekolah)

9. Rekomendasi Arsitektur & Tech Stack

Karena tim sudah familiar dengan Next.js + TypeScript (dipakai di GAPAI Journal), rekomendasi berikut melanjutkan stack yang sama, diperluas secukupnya untuk kebutuhan multi-tenant SaaS + mobile, tanpa memaksa tim belajar stack yang sepenuhnya baru.

9.1 Web Application

Layer

Teknologi

Alasan

Framework

Next.js 15 (App Router) + TypeScript

Sama dengan GAPAI Journal — tim sudah fasih

UI

React + TailwindCSS + shadcn/ui

Komponen cepat dibangun, konsisten, mudah dikustom per-tenant (branding sekolah)

Form & Validasi

React Hook Form + Zod

Type-safe, reuse schema Zod untuk validasi backend juga

State/Data fetching

TanStack Query (React Query) + tRPC (atau REST bila lintas platform mobile)

tRPC cocok jika web-only; kalau mobile pakai React Native, lebih aman pakai REST/OpenAPI atau GraphQL agar kontrak API jelas lintas platform

Autentikasi

Auth.js (NextAuth) / Clerk dengan RBAC custom

Dukungan multi-role (guru, ortu, siswa, dst.) & multi-tenant session

9.2 Backend / API

Opsi A (disarankan untuk mulai cepat): Next.js API Routes / Route Handlers sebagai backend, dengan Prisma ORM ke PostgreSQL. Cocok untuk MVP, tim tidak perlu maintain repo terpisah.

Opsi B (saat skala membesar): Pisahkan backend jadi service Node.js terpisah (NestJS) begitu kebutuhan job async (generate rapor massal, kirim WA broadcast, AI batch) makin berat — Next.js tetap jadi frontend/BFF yang memanggil backend ini.

Rekomendasi: mulai dari Opsi A (monolith modular), disiapkan dengan struktur folder per-modul agar mudah diekstrak ke service terpisah nanti (modular monolith → microservice-ready).

9.3 Database & Multi-Tenancy

PostgreSQL sebagai database utama.

Prisma ORM dengan skema tenant_id di setiap tabel utama (shared database, shared schema, row-level isolation) — paling murah dioperasikan untuk fase awal (puluhan–ratusan sekolah).

Saat ada sekolah/yayasan besar yang butuh isolasi lebih ketat (compliance/enterprise), sediakan opsi schema-per-tenant atau database-per-tenant sebagai tier premium.

Row-Level Security (RLS) Postgres sebagai lapisan keamanan tambahan di atas tenant_id.

9.4 Mobile App (Orang Tua, Siswa, Guru)

React Native (dengan Expo) — pilihan paling logis karena reuse skill TypeScript/React yang sama dengan tim web, serta bisa share sebagian logic (tipe data, schema Zod, API client) via monorepo.

Alternatif lebih cepat untuk validasi awal: PWA (Progressive Web App) dari Next.js yang sama (installable, push notification via web push) sebagai MVP mobile, baru investasi React Native native app saat traction jelas (dibutuhkan untuk fitur seperti fingerprint/QR scan offline yang lebih baik di native).

Rekomendasi jalan: Fase 1 = PWA → Fase 2 = React Native (Expo) app native untuk Play Store/App Store begitu ada validasi produk.

9.5 Monorepo Structure

Gunakan Turborepo (atau Nx) agar web, mobile (nanti), dan backend berbagi kode:

edusmart/
├── apps/
│   ├── web/          (Next.js - dashboard sekolah/yayasan/guru/ortu)
│   ├── mobile/        (React Native/Expo - fase 2)
│   └── api/           (opsional, jika backend dipisah - NestJS)
├── packages/
│   ├── ui/             (shared components - shadcn based)
│   ├── db/             (Prisma schema & client)
│   ├── types/           (shared TypeScript types & Zod schema)
│   ├── api-client/      (typed API client dipakai web & mobile)
│   └── config/          (eslint, tsconfig, tailwind config)

9.6 AI Layer

Claude API (Anthropic) / OpenAI API untuk fitur generatif (RPP, soal, ringkasan).

pgvector (extension Postgres) untuk RAG sederhana — menyimpan embedding kurikulum/materi agar AI bisa merujuk konten yang relevan, bukan hanya generik.

Buat AI service layer terpisah (route handler /api/ai/*) agar mudah ganti provider LLM tanpa mengubah UI.

Rate limiting & cost monitoring per tenant sejak awal (biaya AI API bisa membengkak cepat).

9.7 Integrasi Pihak Ketiga

Kebutuhan

Rekomendasi

Payment (SPP/PPDB)

Midtrans atau Xendit — dukung QRIS, VA, kartu, cocok untuk Indonesia

WhatsApp

WhatsApp Business Cloud API (Meta) langsung, atau via provider seperti Qontak/Woowa untuk mempercepat approval template

Email

Resend atau SendGrid

File/Media storage

Cloudflare R2 atau AWS S3 (untuk foto, dokumen, PDF rapor)

Push Notification

OneSignal atau Firebase Cloud Messaging

Search (opsional)

Meilisearch/Typesense untuk pencarian siswa/dokumen cepat

9.8 Infrastruktur & Deployment

Vercel untuk hosting Next.js web app (deploy cepat, preview per PR, cocok tim kecil).

Database: Neon / Supabase / atau managed PostgreSQL di AWS RDS — pilih yang mendukung branching DB untuk staging (Neon sangat cocok untuk tim kecil).

Background jobs (generate rapor massal, broadcast WA, AI batch): Inngest atau Trigger.dev — terintegrasi baik dengan Next.js, tanpa perlu maintain worker infra sendiri di awal.

Monitoring: Sentry (error tracking) + Vercel Analytics/PostHog (product analytics).

CI/CD: GitHub Actions, otomatis test + deploy.

9.9 Ringkasan Keputusan Stack

Web: Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui + Prisma + PostgreSQL
Mobile: PWA dulu (Fase 1) → React Native/Expo (Fase 2)
Backend: Modular monolith di Next.js dulu → ekstrak ke NestJS saat perlu
AI: Claude/OpenAI API + pgvector untuk RAG kurikulum
Infra: Vercel + Neon/Supabase Postgres + Inngest untuk job async
Monorepo: Turborepo agar siap tambah mobile app tanpa refactor besar

Pendekatan ini konsisten dengan stack GAPAI Journal, jadi tim tidak perlu context-switching besar, sambil tetap menyiapkan fondasi yang scalable untuk SaaS multi-tenant.

10. Roadmap Implementasi (Stage-by-Stage)

Stage 0 — Foundation & Setup

Setup monorepo (Turborepo), CI/CD, environment (dev/staging/prod).

Desain skema database inti (tenant, user, role, sekolah, tahun ajaran).

Implementasi Auth multi-role + multi-tenant + RBAC dasar.

Design system (Tailwind + shadcn) & branding dasar EduSmart (bisa reuse dari poster yang sudah dibuat).

Output: kerangka aplikasi kosong tapi bisa login, punya struktur tenant/role yang jalan.

Stage 1 — MVP Inti

Modul: SIS, Academic Management (jadwal, presensi, nilai dasar, rapor sederhana), Parent & Student Portal (web/PWA).

SIS: CRUD siswa/guru/kelas/ortu.

Presensi manual + QR code.

Input nilai & generate rapor PDF sederhana.

Portal orang tua: lihat presensi, nilai, jadwal.

Notifikasi dasar (email + in-app).

Output: Sekolah pilot bisa mulai pakai untuk operasional harian dasar.

Target validasi: 1–2 sekolah pilot (bisa termasuk sekolah yang terkait GAPAI Journal jika relevan).

Stage 2 — Monetisasi & Retensi

Modul: Finance & Billing, PPDB & CRM, Communication Center (WA).

Tagihan SPP + pembayaran QRIS/VA (Midtrans/Xendit).

Form PPDB online + pipeline CRM dasar.

Broadcast WA (pengumuman, tagihan, izin).

Output: Sekolah mulai merasakan efisiensi finansial & akuisisi siswa baru — modul ini yang paling mudah dijual ke Yayasan.

Stage 3 — Diferensiasi AI

Modul: AI Assistant v1.

Generator RPP/modul ajar per mapel & kelas.

Generator soal (PG/essay/HOTS + kisi-kisi).

Ringkasan operasional harian untuk Kepala Sekolah.

Rate limiting & monitoring biaya AI per tenant.

Output: Fitur pembeda utama vs kompetitor, siap dipakai untuk materi pemasaran.

Stage 4 — LMS & Portofolio

Modul: LMS ringan (materi, tugas, CBT sederhana), Prestasi & Portofolio Digital.

Upload materi (PDF/video link), tugas & pengumpulan online.

CBT sederhana (pilihan ganda, auto-grading).

Portofolio digital siswa (sertifikat, prestasi).

Output: Melengkapi sisi pembelajaran, bukan cuma administrasi.

Stage 5 — Analytics & Dashboard Eksekutif

Modul: Analytics & BI untuk Kepala Sekolah & Yayasan.

Dashboard growth siswa, retention, cashflow, KPI sekolah.

Multi-school view untuk yayasan dengan banyak unit (TK/SD/SMP/SMA).

Output: Nilai jual utama ke Yayasan/pemilik sekolah (paket premium).

Stage 6 — Mobile Native App

Migrasi/porting PWA ke React Native (Expo) untuk Orang Tua, Siswa, Guru.

Push notification native, kamera untuk scan QR presensi lebih smooth offline.

Output: Rilis di Play Store & App Store.

Stage 7 — Modul Pelengkap

Sarana Prasarana, Perpustakaan Digital, UKS, Tahfidz & Keagamaan, HR & Payroll lanjutan, Surat Menyurat & Arsip, Website Profil Sekolah + CMS. Prioritaskan berdasarkan permintaan sekolah pilot/pelanggan awal, bukan dibangun sekaligus.

Stage 8 — Ekspansi Enterprise

Dashboard Dinas Pendidikan (lintas sekolah, early warning).

Tier enterprise dengan isolasi data lebih ketat (schema/db-per-tenant).

Integrasi Google Workspace / Microsoft 365 SSO untuk sekolah besar.

Catatan penting: Setiap stage sebaiknya diakhiri dengan pilot ke sekolah nyata sebelum lanjut ke stage berikutnya — feedback dari pengguna asli (guru, ortu, TU) jauh lebih berharga daripada membangun semua modul berdasarkan asumsi.

11. Model Bisnis & Paket (Ringkas, untuk konteks prioritas fitur)

Tier

Target

Modul Termasuk

Starter

Sekolah kecil-menengah

SIS, Academic, Parent Portal, Finance dasar

Growth

Sekolah menengah-besar

+ PPDB/CRM, Communication Center, AI Assistant

Enterprise/Yayasan

Yayasan multi-unit (TK–SMA)

+ Analytics multi-school, HR/Payroll lanjutan, isolasi data dedicated

(Model harga detail bisa disusun terpisah — di luar cakupan PRD teknis ini, tapi memengaruhi prioritas: fitur AI & Analytics adalah pendorong upsell, jadi jangan ditunda terlalu lama.)

12. Metrik Keberhasilan (Success Metrics)

Adopsi: % guru yang login & input nilai/presensi mingguan.

Engagement ortu: % orang tua aktif membuka portal per bulan.

Efisiensi: waktu rata-rata pembuatan RPP/soal turun (dengan AI vs manual).

Retensi sekolah: churn rate bulanan sekolah pelanggan.

Kesehatan finansial: % tagihan SPP yang terbayar tepat waktu (indikasi kegunaan modul Finance).

AI usage: jumlah generate RPP/soal per guru per bulan, tingkat penerimaan (accept/edit rate) output AI.

13. Risiko & Mitigasi

Risiko

Mitigasi

Scope terlalu luas (~20 modul) → tim burnout/tidak selesai

Disiplin ikuti roadmap stage-by-stage, MVP dulu, validasi pasar sebelum lanjut

Biaya AI API membengkak

Rate limit per tenant, cache hasil generate serupa, monitoring biaya real-time

Kepercayaan data (nilai/keuangan anak)

Audit log ketat, backup rutin, kepatuhan UU PDP, komunikasi transparan ke sekolah

Adopsi guru rendah (gaptek/resisten)

UX sederhana, onboarding & training, fitur AI harus benar mengurangi beban kerja bukan menambah

Integrasi WA/Payment kompleks & approval lama

Mulai proses approval WhatsApp Business API & merchant payment gateway sejak Stage 0, paralel dengan development

Multi-tenant security bug (data bocor antar sekolah)

Testing khusus tenant-isolation, RLS di database, automated test untuk setiap query wajib ada tenant_id

14. Lampiran

Referensi visual: Poster/infografis EduSmart (mockup) — sudah dibuat sebagai bahan presentasi konsep, bisa dijadikan acuan design system awal.

Referensi dokumen: Brief_Proposal_School_Management_System.docx — versi ringkas untuk audiens non-teknis (sekolah/yayasan).

Dokumen ini (PRD) adalah versi teknis untuk tim pengembang, digunakan bersama roadmap di Bagian 10 sebagai acuan sprint planning.

Dokumen ini adalah living document — sebaiknya direview ulang setiap akhir stage untuk menyesuaikan prioritas berdasarkan feedback sekolah pilot.