<div align="center">

<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../images/OpenCreator_logo_vector_dark.svg" />
    <img src="../images/OpenCreator_logo_vector.svg" alt="OpenCreator" width="380" />
  </picture>
  <br />
  İçerik üreticileri için açık kaynaklı yapay zekâ çalışma alanı ve Skills
</h1>

<p>Senaryoları, videoları, görselleri, sesi, avatarları, çeviriyi ve düzenlemeyi; görsel araçları, yeniden kullanılabilir Skills ve Agents ile tek bir çalışma alanında birleştirir.</p>

<p><strong>OpenCreator daha önce KrillinAI adıyla biliniyordu.</strong></p>

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="OpenCreator, eski adıyla KrillinAI: Trendshift Günün 1 Numaralı Deposu" width="250" height="55" /></a>

[English](../../README.md) | [简体中文](../zh/README.md) | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Bahasa Indonesia](../id/README.md) | [Español](../es/README.md) | [Français](../fr/README.md) | [Deutsch](../de/README.md) | [Português](../pt/README.md) | [Русский](../ru/README.md) | [العربية](../ar/README.md) | [ภาษาไทย](../th/README.md) | **Türkçe**

[![GitHub Stars](https://badgen.net/github/stars/krillinai/OpenCreator?icon=github&label=Stars&color=EAB308)](https://github.com/krillinai/OpenCreator/stargazers)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/Apache-2.0)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=%E7%B2%89%E4%B8%9D&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/3GwBGsjs8)
[![QQ Grubu](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://qm.qq.com/q/W4YC0PLMeA)

[Öne Çıkanlar](#proje-özeti) · [İçerik Üretim Araçları](#içerik-üretim-araçları) · [Skills](#skills) · [Örnekler](#örnekler) · [Hızlı Başlangıç](#hızlı-başlangıç) · [Desktop](#desktop) · [Belgeler](#belgeler) · [Topluluk](#topluluk)

</div>

![OpenCreator Agent çalışma alanı](../images/opencreator-home-en.png)

## Proje Özeti

OpenCreator, yaratıcı ve yazılım geliştirme çalışmalarını yerel bilgisayarında sürdürmek isteyen bireyler ve ekipler için tasarlanmıştır. Yeni bir Agent döngüsü geliştirmek yerine Codex CLI'ı yürütme motoru olarak kullanır; bunun çevresine kararlı bir yerel Runtime, görsel bir çalışma alanı ve Desktop uygulaması ekler.

OpenCreator birbirine bağlı iki çalışma biçimi sunar:

- **İçerik çalışma alanı:** Video çevirme ve indirme, görsel ve video üretimi, seslendirme, makale ve sosyal medya gönderisi yazımı, kısa video senaryosu ve çöp adam animasyonu için görsel araçları ve üretim şablonlarını kullanın.
- **Agent görüşmesi:** Yaratıcı veya teknik görevleri doğal dille başlatın ve yönetin; görüşmeleri projelere göre düzenleyin; Runs işlemlerini arka planda sürdürün; onayları, ekleri, dosyaları, Skills, MCP'yi, zamanlamaları, bildirimleri, belleği ve tanılama bilgilerini tek yerden yönetin.

Web, tek frontend uygulamasıdır. Desktop aynı Web derlemesini yükler ve yalnızca klasör seçimi, pencere yaşam döngüsü, sistem tepsisi ve yerel bildirimler gibi işletim sistemi gerektiren yetenekleri ekler. Aynı veri ve içerik görünümü kullanıldığı için iki platform da ortak kullanıcı arayüzünü ve Runtime davranışını paylaşır.

## Proje Özellikleri

- 🤖 **Codex Native:** İkinci bir yürütme motoru geliştirmeden Codex Agent döngüsünü, modellerini, akıl yürütme yeteneklerini, araç çağrılarını, görüşmeleri, Skills ve MCP'yi kullanın.
- 🚀 **Kullanıma hazır Desktop uygulaması:** Codex CLI içeren Desktop uygulamasını doğrudan başlatın; yerel Runtime gerektiğinde çalışır ve varsayılan projeyi otomatik hazırlar.
- ⚙️ **Codex ayarlarını yeniden kullanır:** İlk açılışta yerel Codex yapılandırmasını tarar ve çalışan ChatGPT oturumunu veya API anahtarı ayarını yeniden kullanmayı önerir. Diğer model sağlayıcıları için yönlendirmeli bir form sunar.
- 🔄 **Yönetilen Runtime bileşenleri:** Paketlenmiş, etkin ve en yeni yt-dlp sürümlerini inceleyin; güncellemeleri denetleyin ve güncelleme başarısız olursa çalışan sürümü koruyarak elle güncelleyin.
- 🎨 **Çoklu ortam üretimi:** Video, görsel, ses, altyazı ve belgeleri tek bir bağlı iş akışında oluşturun ve yönetin.
- 🧩 **Üretim şablonları:** Komutları ve ayarları her seferinde sıfırdan kurmadan yeniden kullanılabilir şablonlarla görsel ve video üretimine başlayın.
- 🔗 **İki modlu iş akışı:** Görsel çalışma alanı veya Agent görüşmesi üzerinden çalışın; ortak durum makinesi adımları, ilerlemeyi ve sonuçları senkronize eder.
- 🕘 **Sürümleme:** Her revizyon önceki ayarları ve çıktıları koruyan yeni bir sürüm oluşturur.
- 🧩 **Yeniden kullanılabilir Skills:** Video iş akışı Skills'lerini kullanın, kendi Skills'inizi ekleyin ve MCP'yi Codex yerel yapılandırmasıyla yönetin.
- 🧠 **Bellek:** Genel, proje ve konu belleğini özetler ve tekrar üretilebilir Run giriş anlık görüntüleriyle saklayın.
- 🔐 **Yerel güvenlik:** Verileri, ekleri ve günlükleri varsayılan olarak yerel tutun; onaylar ve hassas bilgileri ayıklanmış tanılama günlükleri kullanın.
- 🌐 **Yerelleştirilmiş arayüz:** Web veya Desktop istemcisini sistem dilini otomatik algılayarak ya da elle seçerek kullanın.

## İçerik Üretim Araçları

Mevcut sürümde makale, Xiaohongshu gönderisi ve kısa video senaryosu yazma; çöp adam animasyonu oluşturma; video çevirme veya indirme; küçük resim, görsel ve video üretme; Smart Dubbing ile seslendirme gibi araçlar bulunur.

![OpenCreator içerik üretim paneli](../images/product/opencreator-dashboard-en.png)

> Yeni içerik üretim araçları sürekli eklenmektedir.

**Video Translation 14 kaynak dili ve 101 hedef dili destekler.** Kaynak diller arasında Basitleştirilmiş Çince, İngilizce, İspanyolca, Fransızca, İtalyanca, Brezilya Portekizcesi, Endonezce, Tayca, Japonca, Korece, Almanca, Türkçe, Rusça ve Malayca bulunur.

| Çalışma alanı | Durum | Yetenekler |
| --- | --- | --- |
| Video Translation | ✅ Kullanılabilir | Yerel veya herkese açık videoları içe aktarma; bulut ya da yerel Whisper ile transkripsiyon; altyazı bölümlendirme, hizalama, terminoloji ve çeviri için LLM bağlamı; çift dilli altyazı, dublaj, özel ses örneği, altyazı stili ve yatay/dikey kompozisyon; SRT, ses veya video dışa aktarma |
| Video Downloader | ✅ Kullanılabilir | YouTube, Bilibili, X, TikTok, Instagram, Douyin, Facebook, Xiaohongshu ve Pinterest bağlantılarını analiz etme; formatları karşılaştırma; video veya ses indirme |
| Thumbnail Generator | ✅ Kullanılabilir | Konu, video bağlantısı ve isteğe bağlı referans görselden küçük resim varyasyonları üretme |
| Image Generation | ✅ Kullanılabilir | İstem ve isteğe bağlı referans görselle GPT Image kullanarak görsel üretme; oran ve çıktı sayısını ayarlama |
| Article Writer | ✅ Kullanılabilir | Konu, bağlantı, video veya belgelerden konu seçenekleri, taslak ve makale üretme; görseller ekleyip Markdown, HTML veya PDF dışa aktarma |
| Xiaohongshu Posts | ✅ Kullanılabilir | Hedef kitle, gönderi türü ve uzunluk kontrolleriyle Xiaohongshu gönderisi üretme |
| Short Video Script | ✅ Kullanılabilir | Kitle, platform, süre ve tona göre çekime hazır bölümlendirilmiş kısa video senaryosu oluşturma |
| Stick Figure Animation | ✅ Kullanılabilir | Metin veya YouTube içeriğini anlatım, ses, storyboard görselleri, altyazı ve indirilebilir animasyona dönüştürme |
| Auto Clips | Geliştiriliyor | Uzun videoları analiz ederek öne çıkan bölümleri yeniden kullanılabilir kısa kliplere dönüştürme |
| Smart Dubbing | ✅ Kullanılabilir | Seçilebilir ses, tempo ve duygu kontrolleriyle senaryoları seslendirme |
| Video Generation | ✅ Kullanılabilir | İstem ve referans görsellerden Seedance ile video üretme |
| Digital Avatar | Geliştiriliyor | Senaryo, ses ve avatar sunumunu birleştirerek konuşan kişi videoları üretme |

## Üretim Şablonları

Her istemi ve ayarı sıfırdan oluşturmak yerine bir şablonla üretime başlayın. Video üretimi ve görsel tasarım gibi kategorilerde OpenCreator ve bağımsız üreticiler tarafından hazırlanan şablonları inceleyin.

Bir şablonu açarak örnek sonucu, istemi, ayarları, etiketleri, yazarı ve özgün kaynağı inceleyin. Kendi çalışmanızı başlatmak için **Use this template** seçeneğini kullanın.

![Video ve görsel kategorilerinde üretim şablonları](../images/product/creation-templates-gallery-en.png)

## Skills

İçerik üretim araçları görsel kontroller sunar; Skills ise Agent'a yeniden kullanılabilir talimatlar ve araç iş akışları sağlar. Depo, video üretim Skills'lerinin yanı sıra yerel Codex Skills'lerini yönetme desteği içerir.

Depodaki [skills/](../../skills/) klasörü, gömülü KrillinAI CLI ile çalışan Agent'lar için yeniden kullanılabilir talimatlar içerir.

| Skill | Yetenekler |
| --- | --- |
| KrillinAI CLI | Komut seçme, yapılandırmayı denetleme, ilerleme, manifest, çıktı ve hataları yorumlama |
| Subtitle | Platform altyazılarını indirme veya medyayı yazıya dökme, altyazı çevirme, çift dilli ve dikey altyazı üretme |
| TTS | Altyazılardan hedef dil dublajı üretme ve isteğe bağlı dublajlı video oluşturma |
| Landscape Render | Çift dilli altyazı veya dublajlı sesle yatay video oluşturma |
| Portrait Render | Başlık, çift dilli altyazı veya dublajla dikey video oluşturma |
| Cover | Eksiksiz bir metin isteminden kapak görseli üretme ve son istemi kaydetme |
| Pipeline Plan | Çok aşamalı çıktı planını deneme modunda doğrulama; gerçek işi aşama Skills'leriyle yürütme |

### Kendi Skills'lerinizi Genişletin

OpenCreator, sabit araçlarla sınırlı kalmadan SKILL.md ile tanımlanan yerel Codex Skills'lerini destekler. Kullanılabilirlik etkin Codex home ve yüklü Skills'e bağlıdır; video iş akışı Skills'leri CLI ve ilgili servislerin yapılandırılmasını gerektirir.

## Görüşme ve Çalışma Alanı Birlikte İlerler

Görevleri doğal dille anlatın, gerektiğinde ayrıntılı kontrol için görsel araçlara geçin.

### Ayrıntılı çalışma alanı kontrolleri

Altyazıları, sahneleri, sesi ve üretim ayarlarını hassas biçimde düzenleyin.

### Görüşmeyle esnek düzenleme

Agent'a neyi değiştirmesi gerektiğini söyleyin ve sonucu doğal dille iyileştirin.

### Senkronize durum

Görüşme ve çalışma alanı güncel görev durumunu paylaşır; hiçbir şeyi tekrar anlatmanız gerekmez.

### Bağımsız sürümler

Her revizyon önceki sonuçları veya ayarları ezmeden ayrı bir sürüm oluşturur.

## Desteklenen Modeller

Dil modeli kullanılabilirliği Codex model kataloğuna veya OpenAI uyumlu sağlayıcınıza bağlıdır. Görsel, video, ses ve transkripsiyon modelleri **Settings → AI Services** bölümünde yapılandırdığınız servisleri kullanır.

Gösterilen sağlayıcılar örnektir; gerçek kullanılabilirlik kimlik bilgilerinize, sağlayıcı hesabınıza ve platforma bağlıdır.

### Dil modelleri

GPT, DeepSeek, Qwen, Kimi, GLM, Grok, Doubao, ERNIE, Hunyuan ve MiniMax.

### Görsel

GPT Image, Seedream, Kling Image ve Gemini görsel modelleri.

### Video

Seedance, Kling ve Veo video modelleri.

### Ses ve transkripsiyon

Whisper, OpenAI TTS, MiniMax, Edge TTS, Alibaba Cloud Speech ve Volcengine Speech. Yerel transkripsiyon için kullanılabilir olduğunda faster-whisper, WhisperKit ve whisper.cpp de desteklenir.

## Örnekler

### Video Çevirisi

OpenCreator'ın Video Translation çalışma alanı altyazı hizalama, çeviri, dublaj ve dikey video iş akışını Agent deneyimine taşır.

![OpenCreator altyazı hizalama örneği](../images/examples/krillinai-subtitle-alignment.png)

### Video Üretimi

Seedance ile metin istemi veya referans görselden video üretin; model, en-boy oranı, çözünürlük ve süreyi ayarlayın, ardından her sürümü önizleyin, yeniden üretin veya indirin.

![Seedance ile OpenCreator video üretimi](../images/examples/video-generation-seedance-en.png)

### Video İndirme

Herkese açık bir video bağlantısını analiz edin, kullanılabilir formatları karşılaştırın ve video ya da sesi doğrudan projenize indirin.

Desteklenen kaynaklar arasında YouTube, Bilibili, X, TikTok, Instagram, Douyin, Facebook, Xiaohongshu ve Pinterest bulunur. Bazı kaynaklar platform çerezleri gerektirebilir.

### Çöp Adam Animasyonu

Metin veya YouTube içeriğini seslendirme, tutarlı karakter storyboard'ları, altyazılar ve indirilebilir animasyon içeren bir akışa dönüştürün.

## Hızlı Başlangıç

### Desktop Uygulamasını Kurma

Yayınlar sayfasından işletim sisteminize uygun paketi indirin:

- [Windows Releases](https://github.com/krillinai/OpenCreator/releases)
- macOS ve Linux paketleri de yayınlandıkça aynı sayfada bulunur.

Uygulamayı başlatın, Runtime'ın hazırlanmasını bekleyin ve **Settings → AI Services** bölümünden kullanmak istediğiniz sağlayıcıları yapılandırın.

### Web'i Kaynaktan Çalıştırma

Gereksinimler:

- Node.js 20 veya daha yeni bir sürüm
- pnpm 9 veya daha yeni bir sürüm
- Codex CLI
- İhtiyaç duyulan görsel, video, ses ve transkripsiyon servislerinin yapılandırması

Depoyu klonlayın ve bağımlılıkları kurun:

~~~bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
pnpm install
pnpm web:dev
~~~

Web geliştirme sunucusu yerel Runtime'ı gerektiğinde başlatır. Varsayılan çalışma alanı mevcut klasörün altında oluşturulur.

## Desktop

Desktop uygulaması aynı Web derlemesini yükler ve Electron Main, Preload Bridge, sistem tepsisi, pencere yaşam döngüsü, bildirimler ve paketleme gibi yerel yetenekleri ekler.

### Geliştirme Modu

~~~bash
pnpm desktop:dev
~~~

### Yerel Paketleme

~~~bash
pnpm desktop:package
~~~

Komut adları sürüme göre değişebilir; güncel script'ler için package.json dosyasını kontrol edin.

## Temel İş Akışları

### Görüşmeler ve Runs

Doğal dille bir görev başlatın. Agent görüşmesi; onayları, ekleri, dosyaları, araç çağrılarını ve arka planda çalışan Runs işlemlerini yönetir. Her Run için ilerleme, günlükler, tanılama ve sonuçlar çalışma alanından incelenebilir.

### Skills ve MCP

Codex Skills'lerini yönetin ve MCP sunucularını yerel yapılandırmadan bağlayın. Araç kullanımı gerektiren eylemler onay akışından geçer ve yerel Runtime tarafından yürütülür.

### Zamanlamalar ve Özel Görev Konuları

Tekrarlanan görevler için zamanlama oluşturun. Uzun veya bağımsız işleri ayrı konu başlıklarında çalıştırın; bildirimleri ve Run durumlarını çalışma alanından takip edin.

## OpenCreator Sistem Mimarisi

| Katman | Sorumluluk | Teknolojiler |
| --- | --- | --- |
| Web | Ortak React arayüzü, yaratıcı çalışma alanı ve Agent görüşmesi | apps/web · React · Vite |
| Browser Bridge | Tarayıcı yeteneklerini güvenli biçimde Runtime'a bağlar | apps/web · Browser APIs |
| Local Runtime | Süreç yaşam döngüsü, API, olaylar, onaylar, zamanlamalar ve kalıcılık | apps/daemon · Fastify · Runtime API · SSE |
| Runtime bileşenleri | Paketlenmiş, etkin ve en yeni sürümleri takip eder | yt-dlp · güncelleme doğrulama |
| Codex Engine | Agent döngüsü, oturumlar, akıl yürütme, araçlar, Skills ve MCP | Codex CLI · app-server |
| Medya araç zinciri | İndirme, transkripsiyon, dönüştürme, üretim ve dışa aktarma | yt-dlp · Whisper · FFmpeg |
| Yerel veri | Proje verileri, Runs, ekler, çıktılar ve kimlik bilgileri | SQLite · dosya sistemi |
| Desktop Host | Ortak Web derlemesini ve işletim sistemi yeteneklerini yükler | apps/desktop · Electron |

Temel ilkeler:

- Çalışma alanı ve Agent görüşmesi aynı iş akışı durumunun iki görünümüdür.
- Revizyonlar eski sonuçların üzerine yazmak yerine yeni sürümler oluşturur.
- Frontend doğrudan Codex başlatmaz ve ham Codex JSONL olaylarına bağlı değildir.
- Daemon süreç yaşam döngüsünü, olayların normalleştirilmesini, kalıcılığı, onayları ve bildirim kuyruğunu yönetir.
- Codex, Agent döngüsü, Skills ve MCP için yürütmenin kaynağı olmaya devam eder.
- Browser Bridge ve Desktop Bridge genel ürün mantığını ayrı ayrı uygulamaz.

## Depo Yapısı

~~~text
OpenCreator/
├── apps/
│   ├── web/          # Tek React frontend uygulaması
│   ├── daemon/       # Yerel Fastify Runtime ve Codex adaptörü
│   ├── desktop/      # Electron Main, Preload, yerel yetenekler ve paketleme
│   └── harness/      # Runtime komut satırı doğrulama aracı
├── packages/
│   ├── protocol/     # Web, Daemon ve Desktop arasında paylaşılan sözleşmeler
│   └── skill-market/ # Skill pazaryeri modelleri ve ortak mantık
├── docs/             # Tasarım belgeleri, API referansları ve çalışma kılavuzları
├── scripts/          # Depo seviyesindeki denetimler
└── .runtime/         # İlk çalıştırmada oluşturulan yerel Runtime verileri
~~~

## Yapılandırma

### AI Servisi API Anahtarları

Kullanılan model, transkripsiyon, ses ve görsel sağlayıcılarını **Settings → AI Services** bölümünden yapılandırın. Seçilen sağlayıcıya göre Base URL, API Key, model, proxy veya sağlayıcıya özel kimlik bilgileri istenir.

![OpenCreator AI Services ayarları](../images/product/opencreator-ai-services-en.png)

Kimlik bilgileri yerel Runtime'ın sistem kimlik bilgisi deposunda saklanır ve depoya kesinlikle commit edilmemelidir. Edge TTS gibi bazı yerel veya sistem tabanlı sağlayıcılar API anahtarı gerektirmez.

### Hesaplar ve Abonelikler

Codex hesabı, API anahtarı ve diğer sağlayıcı hesapları OpenCreator'dan bağımsızdır. Ücretli servislerin kullanım koşullarını ve kota sınırlarını ilgili sağlayıcıdan kontrol edin.

### Üçüncü Taraf Runtime Bileşenleri

**Settings → Third-party Components** bölümünden kullanılan yt-dlp nightly sürümünü, OpenCreator ile paketlenmiş sürümü, kaynağını ve en yeni sürümü inceleyin. OpenCreator yedi günde bir güncelleme kontrolü yapar ancak otomatik kurulum yapmaz. Güncellemeler açık kullanıcı eylemi gerektirir; indirme, doğrulama veya kurulum başarısız olursa çalışan sürüm korunur.

![OpenCreator üçüncü taraf bileşen ayarları](../images/product/opencreator-third-party-components-en.png)

### Runtime Ortam Değişkenleri

Çoğu kullanıcı ortam değişkenlerine ihtiyaç duymaz. Yalıtılmış veri, belirli bir Codex çalıştırılabilir dosyası veya özel proje dizini gerektiğinde kullanabilirsiniz:

| Değişken | Varsayılan | Amaç |
| --- | --- | --- |
| OPENCREATOR_DATA_DIR | .runtime | Veritabanı, Runs, ekler ve yönetilen çalışma alanları |
| OPENCREATOR_CODEX_BIN | codex | Codex CLI çalıştırılabilir dosyasının yolu |
| CODEX_HOME | ~/.codex | Codex oturumları, yapılandırma, Skills, MCP ve profiller |
| OPENCREATOR_DEFAULT_CWD | Geçerli çalışma dizini | Varsayılan daemon çalışma dizini |
| OPENCREATOR_DEFAULT_PROJECT_ROOT | Runtime politikası | Yönetilen proje kökü |
| OPENCREATOR_CODEX_THREAD_ROTATION_RUN_THRESHOLD | 50 | Uzun süreli zamanlamalarda konu yenileme eşiği; 0 ile kapatılabilir |

Örnek:

~~~bash
OPENCREATOR_DATA_DIR=/path/to/opencreator-data \
CODEX_HOME=/path/to/codex-home \
pnpm web:dev
~~~

## Veri ve Güvenlik

Runtime verileri varsayılan olarak depo kökündeki .runtime/ altında saklanır:

| Yol | İçerik |
| --- | --- |
| .runtime/app.sqlite | Projeler, konular, Runs, olaylar, zamanlamalar, bildirimler, ek meta verileri ve onaylar |
| .runtime/runs/ | Ayrıştırılmış günlükler, tanılama verileri ve Run meta verileri |
| .runtime/attachments/ | Kontrollü ek dosyaları |
| .runtime/workspaces/ | Runtime tarafından yönetilen proje çalışma alanları |

Codex oturumları ve yapılandırması CODEX_HOME içinde kalır; .runtime/ klasöründen ayrı yedeklenmelidir.

Güvenlik sınırları:

- Daemon yalnızca 127.0.0.1 üzerinde dinler; sağlık denetimi dışındaki API'ler Bearer token gerektirir.
- HTML önizleme komut dosyalarını, gezinmeyi ve açılır pencereleri varsayılan olarak devre dışı bırakır.
- Hassas bellek ikinci bir onay gerektirir; OpenCreator doğrulanmamış önerileri kalıcı olarak otomatik saklamaz.
- Tanılama ve Run günlükleri döndürülmeden veya dışa aktarılmadan önce hassas bilgileri ayıklar.
- Desktop paketlerinde ASAR bütünlüğü ve çerez şifrelemesi etkinleştirilir; RunAsNode, NODE_OPTIONS ve Node CLI Inspector devre dışıdır.

Yedekleme, geri yükleme, temizleme ve sıfırlama için [kullanıcı kılavuzuna ve sorun giderme referansına](../opencreator-user-guide-and-troubleshooting.md) bakın.

## Geliştirme

### Sık Kullanılan Komutlar

| Komut | Amaç |
| --- | --- |
| pnpm web:dev | Web'i başlatır ve yerel daemon'ı gerektiğinde açar |
| pnpm daemon:dev | Yalnızca daemon'ı başlatır |
| pnpm desktop:dev | Bağımlılıkları derler ve Electron'u geliştirme modunda açar |
| pnpm test | Workspace birim ve entegrasyon testlerini çalıştırır |
| pnpm typecheck | Depodaki TypeScript kontrollerini çalıştırır |
| pnpm build | Tüm workspace'leri derler |
| pnpm e2e | Web Playwright E2E testlerini çalıştırır |
| pnpm smoke:ci | Sahte Codex Runtime smoke testini çalıştırır |
| pnpm perf:check | Kayıtlı performans temelini kontrol eder |

Belgeleme, metin ve stil değişiklikleri için ilgili kontroller yeterlidir. Ortak davranış ve Runtime değişiklikleri hedefli modül testleri ve typecheck gerektirir. PR açıklamasında çalıştırdığınız kontrolleri belirtin.

## Belgeler

- **OpenCreator'ı kullanın:** [Hızlı Başlangıç](#hızlı-başlangıç) · [Kullanıcı kılavuzu ve sorun giderme](../opencreator-user-guide-and-troubleshooting.md)
- **Geliştirin ve genişletin:** [Katkı rehberi](../../CONTRIBUTING.md) · [Davranış kuralları](../../CODE_OF_CONDUCT.md) · [Skill katkısı](../contributing/skills-contributing.md) · [Üretim şablonu katkısı](../contributing/templates-contributing.md) · [Runtime API v1](../runtime-api-for-ui-v1.md) · [Görsel bileşen yönergeleri](../visual-component-guidelines.md)
- **Bakım ve yayın:** [Codex-native Runtime tasarımı](../2026-07-03-codex-native-agent-runtime-design.md) · [Desktop yayın kılavuzu](../operations/opencreator-desktop-release-runbook.md) · [Windows Desktop yayın rehberi](../operations/opencreator-desktop-windows-release.md)

## Çeviri İlkesi

Kök README.md dosyası kanonik İngilizce belgedir. Bakımı yapılan çeviriler docs/locale/README.md altında tutulur. Bir dili seçiciye yalnızca belge tamamen çevrildikten ve İngilizce yapıyla senkronize edildikten sonra ekleyin.

## Topluluk

GitHub'da OpenCreator'a en az 100 ülke ve bölgeden kullanıcı yıldız vermiştir.

### Ekip

Her ekip üyesi kendi alanından, standartlarından, katkı incelemelerinden ve topluluk desteğinden sorumludur.

| Kullanıcı | Sorumluluk |
| --- | --- |
| [wulien](https://github.com/wulien) | Kod ve hata düzeltmeleri |
| [DLe-kb](https://github.com/DLe-kb) | Üretim şablonları |
| [xiaheyuan](https://github.com/xiaheyuan) | Tasarım ve varlıklar |
| [krillinai](https://github.com/krillinai) | Skills ve belgeler |
| [hbxugang](https://github.com/hbxugang) | Kurumsal dağıtım |

### Katkıda Bulunanlar

Kod, belge, geri bildirim, issue, Skill, tasarım ve fikirleriyle katkı sağlayan herkese teşekkürler.

### Katkı Sağlama

Katkılar şu alanlarda memnuniyetle karşılanır:

| Tür | Katkı | Konum | Gönderim biçimi |
| --- | --- | --- | --- |
| Kod | Hata düzeltmeleri, üretim iş akışları ve ortak özellikler | apps/web/, apps/daemon/ | Test içeren tek odaklı PR |
| Skills | Yeniden kullanılabilir Agent iş akışları | skills/ | SKILL.md içeren tek klasör |
| Üretim şablonları | Görsel, video veya kapak şablonları | template/ | template.json ve varlıkları içeren klasör |
| Görsel ve tasarım | Özgün çizimler, ikonlar veya UI tasarımları | Kararlaştırılan varlık konumu | Önizleme, kaynak dosya ve lisans içeren PR |
| Üçüncü taraf servisleri | AI veya medya sağlayıcısı desteği | İlgili Web veya Daemon modülü | Hata yönetimi, kimlik bilgisi güvenliği ve testler |
| Belgeler ve çeviriler | Belge geliştirmeleri veya yeni yerel ayarlar | README.md, docs/ | Tek PR |

Yerel kurulum, inceleme ölçütleri ve sık reddedilme nedenleri için [CONTRIBUTING.md](../../CONTRIBUTING.md) dosyasına bakın.

## Star Geçmişi

OpenCreator daha önce KrillinAI olarak adlandırılıyordu. Bu grafik, yeniden adlandırma öncesi ve sonrasındaki depo geçmişini kapsar.

[![OpenCreator Star Geçmişi](https://api.star-history.com/svg?repos=krillinai/OpenCreator&type=date)](https://www.star-history.com/?type=date&repos=krillinai%2FOpenCreator)

## İlgili Projeler

| Proje | Rol |
| --- | --- |
| [OpenAI Codex](https://github.com/openai/codex) | Model erişimi, akıl yürütme, araç çağrıları, oturumlar, Skills ve MCP entegrasyonunun arkasındaki Agent yürütme motoru |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Herkese açık medya bağlantılarını analiz eder ve içerik iş akışları için video veya ses indirir |
| [FFmpeg](https://ffmpeg.org/) | Medya dönüştürme, kompozisyon, kare çıkarma ve çıktı doğrulama |
| [Whisper](https://github.com/openai/whisper), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [faster-whisper](https://github.com/SYSTRAN/faster-whisper) ve [WhisperKit](https://github.com/argmaxinc/WhisperKit) | Yerel ve bulut tabanlı konuşma transkripsiyonu seçenekleri |
| [React](https://react.dev/) | Web ve Desktop deneyimlerinin ortak kullanıcı arayüzü temeli |
| [Fastify](https://fastify.dev/) | Yerel Runtime'ın HTTP ve API temeli |
| [Electron](https://www.electronjs.org/) | Yerel yetenekler, uygulama yaşam döngüsü ve paketleme için Desktop host |
| [SQLite](https://www.sqlite.org/) | Projeler, görüşmeler, Runs, zamanlamalar, bellek ve çalışma alanı verileri için yerel kalıcılık |
| [Model Context Protocol](https://modelcontextprotocol.io/) | Harici araçları ve servisleri Agent çalışma alanına bağlayan açık protokol |

---

<div align="center">

**OpenCreator · Yerel üret, kesintisiz çalış.**

</div>
