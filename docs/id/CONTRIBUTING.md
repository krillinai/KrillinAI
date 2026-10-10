# Panduan Kontribusi (Bahasa Indonesia)

> [English](../../CONTRIBUTING.md) | [简体中文](../zh/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | **Bahasa Indonesia** | [Español](../es/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | [Deutsch](../de/CONTRIBUTING.md) | [Português](../pt/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [العربية](../ar/CONTRIBUTING.md)

Terima kasih telah mempertimbangkan untuk berkontribusi. OpenCreator adalah workspace kreator local-first yang dibangun di atas loop agen Codex, dan sebagian besar nilainya berasal dari tambahan yang kecil dan terfokus: satu folder Skill, satu templat kreasi, satu perbaikan dengan cakupan jelas. Panduan ini menjelaskan di mana setiap jenis kontribusi ditempatkan dan standar apa yang harus dipenuhi PR sebelum digabungkan.

---

## Peta kontribusi

| Jika Anda ingin… | Yang sebenarnya Anda tambahkan | Lokasi | Ukuran pengiriman |
|---|---|---|---|
| Memperbaiki bug atau meningkatkan alur kerja | kode | `apps/web/`, `apps/daemon/` | satu PR terfokus dengan pengujian |
| Menambahkan alur kerja Agen yang dapat digunakan kembali | sebuah **Skill** | [`skills/<skill-anda>/`](../../skills/) | satu folder berisi `SKILL.md` dan referensi opsional → [panduan](./contributing/skills-contributing.md) |
| Menambahkan preset gambar, video, atau sampul yang dapat digunakan kembali | sebuah **templat kreasi** | [`template/<modul>/<id>/<versi>/`](../../template/) | satu folder berisi `template.json` beserta asetnya → [panduan](./contributing/templates-contributing.md) |
| Menyumbangkan ilustrasi, ikon, atau desain UI | aset desain | lokasi aset yang disepakati | satu PR dengan pratinjau, file sumber, dan lisensi |
| Menghubungkan layanan AI atau media | sebuah **integrasi layanan** | modul Web atau Daemon terkait | satu PR dengan penanganan error, keamanan kredensial, dan pengujian |
| Meningkatkan dokumentasi atau terjemahan | dokumen | `README.md`, `docs/`, `docs/<locale>/README.md` | satu PR |

## Tempat bertanya dan peninjau

Gunakan [Issue](https://github.com/krillinai/OpenCreator/issues/new) untuk membahas ide atau menanyakan bidang yang sesuai. Saat mengirim PR, sebutkan anggota [Tim Inti](../../README.md#the-crew) yang terkait dengan kode dan bug, template kreasi, desain dan aset, atau Skills dan dokumentasi. Tim membantu standar kontribusi, peninjauan, dan pertanyaan komunitas; penggabungan mengikuti izin repositori dan pemeriksaan wajib.

---

## Persiapan lokal

Persiapan lengkap ada di [Panduan Cepat README](../../README.md#quick-start). Ringkasan untuk kontributor:

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable          # memilih pnpm yang dikunci dari packageManager
pnpm install
pnpm web:dev             # web + daemon lokal sesuai kebutuhan
pnpm typecheck           # pemeriksaan TypeScript di seluruh repositori
pnpm test                # pengujian unit dan integrasi workspace
```

Node.js 22+ dan executable Codex CLI diperlukan. Buka `http://127.0.0.1:19861/` setelah `pnpm web:dev`; Runtime menyiapkan proyek default saat pertama kali dijalankan dan composer siap digunakan segera setelah koneksi selesai.

---

## Cara berkontribusi

1. Jelaskan masalah, kasus penggunaan, dan perilaku yang diharapkan dalam [issue](https://github.com/krillinai/OpenCreator/issues).
2. Buat branch fitur atau perbaikan yang terfokus dari branch pengembangan terbaru.
3. Ikuti arsitektur yang ada: kemampuan produk umum diimplementasikan **sekali** di Web dan Daemon, dan perbedaan native Desktop diisolasi di balik capability eksplisit (misalnya `canSelectDirectory`).
4. Tambahkan cakupan pengujian unit, integrasi, atau E2E yang sesuai untuk perubahan perilaku, dan cantumkan verifikasi yang dilakukan maupun yang dilewati dalam PR.
5. Jangan pernah melakukan commit `.runtime/`, kredensial lokal, sesi Codex, cache build, atau data pengguna lainnya.

## Apa yang diperiksa reviewer

- **Satu implementasi untuk perilaku bersama.** Fitur yang sama tidak boleh diimplementasikan secara terpisah untuk Browser Bridge dan Desktop Bridge.
- **Capability gating, bukan stub senyap.** Entri khusus platform harus disembunyikan saat capability tidak tersedia — jangan pernah menampilkan tombol yang diam-diam tidak melakukan apa-apa.
- **Pengujian sesuai risiko perubahan.** Perubahan kecil pada teks atau gaya hanya perlu pemeriksaan terarah; perubahan pada state bersama, persistensi, atau kontrak Runtime memerlukan minimal pengujian modul dan typecheck.
- **Dokumentasi diperbarui bersama perilaku.** Jika perubahan Anda mengubah alur kerja yang terlihat pengguna, perbarui README atau dokumen terkait di `docs/` dalam PR yang sama.

## Alasan umum PR dikembalikan

- Logika yang sama ditambahkan secara terpisah di jalur Web dan Desktop, bukan di lapisan layanan bersama.
- Tombol yang tidak didukung platform tetap terlihat, tetapi handler-nya return secara diam-diam.
- Perilaku berubah tanpa pengujian atau catatan verifikasi.
- PR mencampur refaktor atau perbaikan yang tidak terkait dengan perubahan utama.
- File hasil generate, data `.runtime/`, atau kredensial di-commit.

---

OpenCreator · Create locally, work continuously.
