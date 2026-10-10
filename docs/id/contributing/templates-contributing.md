# Berkontribusi Templat Kreasi (Bahasa Indonesia)

> [English](../../contributing/templates-contributing.md) | [简体中文](../../zh/contributing/templates-contributing.md) | [日本語](../../ja/contributing/templates-contributing.md) | [한국어](../../ko/contributing/templates-contributing.md) | **Bahasa Indonesia** | [Español](../../es/contributing/templates-contributing.md) | [Français](../../fr/contributing/templates-contributing.md) | [Deutsch](../../de/contributing/templates-contributing.md) | [Português](../../pt/contributing/templates-contributing.md) | [Русский](../../ru/contributing/templates-contributing.md) | [العربية](../../ar/contributing/templates-contributing.md)

Templat kreasi adalah folder di bawah [`template/<modul>/<id>/<versi>/`](../../../template/) dengan `template.json` dan aset lokalnya. Templat menggerakkan pemilih visual untuk generasi gambar, generasi video, dan generasi sampul — pengguna memulai dari preset Anda, bukan prompt kosong. Panduan ini menjelaskan cara menambahkannya.

---

## Apa yang TERMASUK / BUKAN templat kreasi

**Templat TERMASUK:**
- Preset yang telah disetel: default prompt, petunjuk gaya, pengaturan rasio/durasi/kualitas, plus sampul dan pratinjau yang menunjukkan hasilnya.
- Mandiri. Semua yang ditampilkan pemilih ada di dalam folder templat.

**Templat BUKAN:**
- *Jenis* templat baru. Modul saat ini adalah `image-generation`, `video-generation`, dan `cover-generator`. Jika Anda membutuhkan modul baru, buka issue untuk mendiskusikannya terlebih dahulu — itu adalah perubahan produk, bukan templat.
- Kumpulan prompt. Templat dengan prompt kosong atau generik dan tanpa default terlokalisasi akan dikembalikan; nilainya ada pada penyetelan.
- Karya orang lain tanpa hak. Lihat [Atribusi dan hak](#atribusi-dan-hak).

## Mulai cepat

```bash
corepack enable && pnpm install
cp -r template/cover-generator/images-go-hard-thumbnail template/<modul>/<id-templat-anda>
# edit template.json, ganti aset sampul/pratinjau
pnpm templates:validate     # harus lulus sebelum membuka PR
```

ID templat menggunakan huruf kecil dengan tanda hubung dan unik dalam modulnya. Versi dimulai dari `1` — satu folder per versi, jadi pembaruan membuat `<id>/2/` alih-alih mengedit `<id>/1/`.

## Anatomi folder

```
template/<modul>/<id>/1/
├── template.json        # wajib: metadata, default, konten terlokalisasi
├── cover.jpg            # wajib: ditampilkan di pemilih templat
├── preview.jpg          # modul gambar/sampul: pratinjau hasil lebih besar
├── previewVideo         # modul video: klip contoh, mis. example.mp4
└── author-avatar.jpg    # opsional: avatar penulis yang dikreditkan
```

## Panduan kolom template.json

| Kolom | Wajib | Catatan |
|---|---|---|
| `schemaVersion` | ya | Saat ini `1`. |
| `id`, `version`, `module` | ya | Harus cocok dengan path folder `<modul>/<id>/<versi>/`. |
| `runtimeTemplate` | ya | Memetakan ke eksekutor Runtime, mis. `{"id": "cover", "version": 2}`. Salin dari templat dalam modul yang sama. |
| `status` | ya | `published` untuk rilis; gunakan `draft` saat iterasi. |
| `title`, `description` | ya | `zh-CN` dan `en-US` wajib. Bahasa lain opsional. |
| `cover` | ya | Path relatif ke thumbnail pemilih. |
| `preview` / `previewVideo` | tergantung modul | `preview` untuk modul gambar dan sampul, `previewVideo` untuk video. |
| `defaults` | ya | Pengaturan dasar tempat pengguna memulai (prompt, rasio, durasi, kualitas…). |
| `defaultsByLocale` | sangat dianjurkan | Override prompt dan gaya terlokalisasi per bahasa. Penyetelan sesungguhnya ada di sini — lihat di bawah. |
| `tags` | dianjurkan | Label yang dapat dicari; jaga tetap faktual. |
| `author` | jika berlaku | `name`, `url`, `avatar` untuk sumber eksternal yang dikreditkan. |
| `featured`, `sortOrder` | tidak | Biarkan `featured: false`; maintainer yang memutuskan fitur unggulan. |

## Prompt adalah produknya

Reviewer menghabiskan sebagian besar waktu pada `defaults` dan `defaultsByLocale`:

- **Kedua bahasa harus berupa prompt sungguhan**, bukan terjemahan yang kehilangan penyetelannya. Prompt `zh-CN` dan `en-US` harus menghasilkan hasil yang setara dengan kekuatan frasa masing-masing bahasa.
- **Parameterkan apa yang memang dimaksudkan untuk berubah.** Jika teks judul atau subjek dapat diedit pengguna, nyatakan secara eksplisit dalam prompt (templat yang ada menggunakan penanda seperti "Customizable text: …").
- **Nyatakan batasan.** "Tanpa watermark, tanpa teks tambahan, tanpa orang tambahan" — batasan negatif sama pentingnya dengan deskripsi untuk output yang dapat direproduksi.
- **Cocokkan bentuk `defaults` modul.** Templat gambar membawa ratio/candidateCount/quality; templat video membawa size/duration; templat sampul membawa judul, bahasa teks, dan kolom gaya. Salin bentuknya dari templat yang ada di modul Anda.

## Aset

- Hasilkan `cover.jpg` dan pratinjau **dengan templat itu sendiri** — gambar stok atau karya yang tidak terkait akan ditolak.
- Jaga ukuran file tetap wajar; file-file ini didistribusikan bersama aplikasi dan dimuat di pemilih.
- Pratinjau harus mewakili hasil yang *tipikal*, bukan hasil terbaik dari lima puluh percobaan.

## Atribusi dan hak

Jika templat Anda mengadaptasi prompt atau gaya yang dipublikasikan orang lain:

- Anda harus memiliki hak untuk mendistribusikannya kembali.
- Isi kolom `author` dengan `name` dan `url` (serta `author-avatar.jpg` jika tersedia), seperti yang dilakukan templat yang ada.
- Jika ragu, buka issue dan tanyakan sebelum mengerjakannya.

## Standar penggabungan

- [ ] Path folder cocok dengan `id`/`version`/`module`; ID unik dalam modul.
- [ ] `pnpm templates:validate` lulus.
- [ ] `title` dan `description` tersedia dalam `zh-CN` dan `en-US`.
- [ ] `defaultsByLocale` berisi prompt yang disetel untuk kedua bahasa.
- [ ] Aset sampul dan pratinjau dihasilkan oleh templat itu sendiri.
- [ ] Atribusi `author` disertakan saat mengadaptasi karya eksternal.
- [ ] `featured: false`, `status: "published"` (atau `draft` dengan catatan di PR).

## Pola penolakan umum

- **Prompt generik** — templat tidak menambahkan apa pun dibanding prompt kosong; pemilih tidak membutuhkannya.
- **Bahasa hilang** — hanya satu bahasa yang disetel, atau terjemahan mesin yang kehilangan batasan gayanya.
- **Aset tidak cocok** — sampul tidak sesuai dengan apa yang benar-benar dihasilkan prompt.
- **Hak tidak jelas** — mengadaptasi karya orang lain tanpa atribusi atau izin.
- **Versi lama diedit di tempat** — buat folder versi baru alih-alih menulis ulang riwayat `<id>/1/`.

---

Ada pertanyaan? [Buka issue](https://github.com/krillinai/OpenCreator/issues/new) dengan ide templat Anda dan contoh hasilnya, dan kami akan membantu menentukan cakupannya.
