# Berkontribusi Skill (Bahasa Indonesia)

> [English](../../contributing/skills-contributing.md) | [简体中文](../../zh/contributing/skills-contributing.md) | [日本語](../../ja/contributing/skills-contributing.md) | [한국어](../../ko/contributing/skills-contributing.md) | **Bahasa Indonesia** | [Español](../../es/contributing/skills-contributing.md) | [Français](../../fr/contributing/skills-contributing.md) | [Deutsch](../../de/contributing/skills-contributing.md) | [Português](../../pt/contributing/skills-contributing.md) | [Русский](../../ru/contributing/skills-contributing.md) | [العربية](../../ar/contributing/skills-contributing.md)

Skill adalah folder di bawah [`skills/`](../../../skills/) dengan `SKILL.md` di root-nya, mengikuti [konvensi `SKILL.md`](https://agentskills.io). Skill mengemas alur kerja Agen yang dapat digunakan kembali: kapan menggunakannya, perintah atau tool apa yang dipanggil, dan cara menafsirkan outputnya. Panduan ini menjelaskan cara menambahkannya.

---

## Apa yang TERMASUK / BUKAN Skill

**Skill TERMASUK:**
- Alur kerja yang dapat diulang dan dapat diikuti Agen, dijelaskan dalam bahasa alami plus perintah.
- Pengetahuan domain yang tidak seharusnya ada di kode inti: cara memanggil tahap CLI, cara menyusun prompt untuk penyedia media, cara memvalidasi rencana.
- Kecil. Satu folder, satu `SKILL.md`, `references/` opsional untuk materi panjang yang dibaca Agen sesuai kebutuhan.

**Skill BUKAN:**
- Fitur produk. Perubahan UI, endpoint Runtime baru, dan perilaku workspace baru adalah kontribusi kode (`apps/web/`, `apps/daemon/`).
- Salinan Skill yang ada dengan perubahan redaksional kecil. Jika perubahan Anda meningkatkan alur kerja yang ada, edit Skill tersebut secara langsung.
- Pembungkus kredensial atau path lokal milik pengguna tertentu. Skill harus berfungsi dari checkout yang bersih.

## Mulai cepat

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<skill-anda>   # mulai dari Skill yang paling mirip
# edit skills/<skill-anda>/SKILL.md
pnpm web:dev                                     # verifikasi Agen mengenalinya dalam percakapan
```

Cara tercepat adalah menyalin Skill yang paling dekat dengan ide Anda lalu menuliskannya ulang — Skill `krillinai-*` yang ada menunjukkan struktur dan nada yang diharapkan.

## Anatomi Skill

```
skills/<skill-anda>/
├── SKILL.md            # wajib: frontmatter + instruksi
└── references/         # opsional: dokumen panjang yang dirujuk SKILL.md
    └── cli-contract.md
```

`SKILL.md` diawali dengan frontmatter YAML:

```yaml
---
name: skill-anda
description: Use when <kondisi pemicu>, including <kemampuan utama>.
---
```

Dua aturan yang ditegakkan reviewer:

- **`name` harus sama dengan nama folder.** Huruf kecil, dipisah tanda hubung.
- **`description` adalah permukaan penemuan.** Inilah yang dibaca Agen untuk memutuskan apakah Skill ini relevan. Tulis dengan format "Use when …", sebutkan pemicu dan hasilnya, dan batasi satu atau dua kalimat. Deskripsi yang samar ("membantu dengan video") akan dikembalikan.

Isi harus mencakup, secara berurutan:

1. **Kapan digunakan** — satu paragraf.
2. **Perintah** — blok kode dengan pemanggilan persis, termasuk variabel lingkungan atau direktori kerja yang diperlukan.
3. **Input dan flag** — tabel untuk hal yang tidak jelas; tandai wajib vs opsional.
4. **Output** — di mana hasil disimpan dan cara membacanya (misalnya, "baca path dari manifest").
5. **Mode kegagalan** — error yang diketahui dan cara mengatasinya.

Jaga `SKILL.md` tetap mudah dipindai. Pindahkan kontrak panjang, daftar flag lengkap, atau materi latar ke `references/` dan tautkan dengan path relatif — Agen hanya membaca referensi saat diperlukan.

## Pengujian lokal

Setelah `pnpm web:dev`, mulai percakapan dan jelaskan tugas yang seharusnya memicu Skill Anda. Verifikasi:

- Agen memilih Skill untuk permintaan yang tepat — dan tidak memilihnya untuk permintaan yang tidak terkait.
- Perintah dalam Skill berjalan dari checkout bersih tanpa perbaikan manual.
- Path output dan penanganan error sesuai dengan dokumentasi.

## Standar penggabungan

Reviewer akan memeriksa setiap item berikut — tempelkan ke PR Anda dan centang:

- [ ] Nama folder dan frontmatter `name` cocok; huruf kecil dengan tanda hubung.
- [ ] `description` menyebutkan kondisi pemicu dan hasil ("Use when …").
- [ ] Perintah berjalan dari checkout bersih; tanpa path lokal absolut atau kredensial.
- [ ] Input, output, dan mode kegagalan terdokumentasi.
- [ ] Materi referensi panjang ada di `references/`, bukan inline.
- [ ] Terverifikasi dalam percakapan nyata: Skill terpicu saat seharusnya dan hanya saat itu.
- [ ] Jika Skill tumpang tindih dengan yang sudah ada, PR menjelaskan mengapa Skill terpisah diperlukan.

## Pola penolakan umum

- **Duplikat Skill yang ada** dengan hanya perubahan redaksional kosmetik — tingkatkan yang sudah ada sebagai gantinya.
- **Fitur yang menyamar** — Skill hanya berfungsi jika disertai perubahan kode pada Runtime atau UI; kirimkan perubahan kode sebagai PR tersendiri.
- **Perintah yang belum diuji** — flag yang tidak ada, atau output yang tidak cocok dengan path yang terdokumentasi.
- **Prasyarat tidak terdokumentasi** — Skill diam-diam mengasumsikan konfigurasi penyedia, binary, atau layanan jaringan.

---

Ada pertanyaan? [Buka issue](https://github.com/krillinai/OpenCreator/issues/new) dengan topik `skill` dan kami akan membantu Anda menentukan cakupannya.
