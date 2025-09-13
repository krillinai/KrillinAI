<div align="center">
  <img src="/docs/images/logo.jpg" alt="KrillinAI" height="90">

# Công Cụ Dịch và Lồng Ghép Video AI Tối Giản

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KrillinAI)

</div>

## Giới Thiệu Dự Án  ([Thử phiên bản trực tuyến ngay!](https://www.klic.studio/))
[**Khởi Đầu Nhanh**](#-quick-start)

KrilliAI là một giải pháp đa năng cho việc địa phương hóa và nâng cao âm thanh và video được phát triển bởi Krillin AI. Công cụ tối giản nhưng mạnh mẽ này tích hợp dịch video, lồng ghép và nhân bản giọng nói, hỗ trợ cả định dạng ngang và dọc để đảm bảo trình bày hoàn hảo trên tất cả các nền tảng chính (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, v.v.). Với quy trình làm việc từ đầu đến cuối, bạn có thể biến nguyên liệu thô thành nội dung đa nền tảng sẵn sàng sử dụng chỉ với vài cú nhấp chuột.

## Tính Năng và Chức Năng Chính:

🎯 **Khởi Đầu Một Cú Nhấp**: Không cần cấu hình môi trường phức tạp, tự động cài đặt phụ thuộc, sẵn sàng sử dụng ngay lập tức, với phiên bản máy tính để bàn mới để dễ dàng truy cập hơn!

📥 **Lấy Video**: Hỗ trợ tải xuống yt-dlp hoặc tải lên tệp cục bộ

📜 **Nhận Diện Chính Xác**: Nhận diện giọng nói chính xác cao dựa trên Whisper

🧠 **Phân Đoạn Thông Minh**: Phân đoạn và căn chỉnh phụ đề sử dụng LLM

🔄 **Thay Thế Thuật Ngữ**: Thay thế từ vựng chuyên ngành chỉ với một cú nhấp

🌍 **Dịch Chuyên Nghiệp**: Dịch LLM với ngữ cảnh để duy trì ngữ nghĩa tự nhiên

🎙️ **Nhân Bản Giọng Nói**: Cung cấp các tông giọng được chọn từ CosyVoice hoặc nhân bản giọng nói tùy chỉnh

🎬 **Biên Tập Video**: Tự động xử lý video ngang và dọc và bố cục phụ đề

💻 **Đa Nền Tảng**: Hỗ trợ Windows, Linux, macOS, cung cấp cả phiên bản máy tính để bàn và máy chủ

## Minh Họa Hiệu Ứng

Hình ảnh dưới đây cho thấy hiệu ứng của tệp phụ đề được tạo ra sau khi nhập một video cục bộ dài 46 phút và thực hiện nó chỉ với một cú nhấp, không cần điều chỉnh thủ công. Không có sự bỏ sót hay chồng chéo, phân đoạn tự nhiên và chất lượng dịch rất cao.
![Hiệu Ứng Căn Chỉnh](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Dịch Phụ Đề

---

https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### Lồng Ghép

---

https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Chế Độ Dọc

---

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Dịch Vụ Nhận Diện Giọng Nói Hỗ Trợ

_**Tất cả các mô hình cục bộ trong bảng dưới đây hỗ trợ cài đặt tự động các tệp thực thi + tệp mô hình; bạn chỉ cần chọn, và Klic sẽ chuẩn bị mọi thứ cho bạn.**_

| Nguồn Dịch Vụ          | Nền Tảng Hỗ Trợ | Tùy Chọn Mô Hình                             | Cục Bộ/Đám Mây | Ghi Chú                     |
|------------------------|------------------|----------------------------------------------|----------------|-----------------------------|
| **OpenAI Whisper**     | Tất cả Nền Tảng   | -                                            | Đám Mây        | Tốc độ nhanh và hiệu quả tốt |
| **FasterWhisper**      | Windows/Linux     | `tiny`/`medium`/`large-v2` (khuyến nghị medium+) | Cục Bộ        | Tốc độ nhanh hơn, không tốn chi phí dịch vụ đám mây |
| **WhisperKit**         | macOS (chỉ M-series) | `large-v2`                                  | Cục Bộ        | Tối ưu hóa gốc cho chip Apple |
| **WhisperCpp**         | Tất cả Nền Tảng   | `large-v2`                                  | Cục Bộ        | Hỗ trợ tất cả nền tảng       |
| **Alibaba Cloud ASR**  | Tất cả Nền Tảng   | -                                            | Đám Mây        | Tránh các vấn đề mạng ở Trung Quốc đại lục |

## 🚀 Hỗ Trợ Mô Hình Ngôn Ngữ Lớn

✅ Tương thích với tất cả các dịch vụ mô hình ngôn ngữ lớn cục bộ/đám mây tuân thủ **các thông số kỹ thuật API của OpenAI**, bao gồm nhưng không giới hạn ở:

- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Các mô hình mã nguồn mở triển khai cục bộ
- Các dịch vụ API khác tương thích với định dạng OpenAI

## 🎤 Hỗ Trợ TTS Chuyển Văn Bản Thành Giọng Nói

- Dịch Vụ Giọng Nói Alibaba Cloud
- OpenAI TTS

## Hỗ Trợ Ngôn Ngữ

Ngôn ngữ đầu vào được hỗ trợ: Tiếng Trung, Tiếng Anh, Tiếng Nhật, Tiếng Đức, Tiếng Thổ Nhĩ Kỳ, Tiếng Hàn, Tiếng Nga, Tiếng Mã Lai (liên tục tăng)

Ngôn ngữ dịch được hỗ trợ: Tiếng Anh, Tiếng Trung, Tiếng Nga, Tiếng Tây Ban Nha, Tiếng Pháp và 101 ngôn ngữ khác

## Xem Trước Giao Diện

![Xem Trước Giao Diện](/docs/images/ui_desktop_light.png)
![Xem Trước Giao Diện](/docs/images/ui_desktop_dark.png)

## 🚀 Khởi Đầu Nhanh

Bạn có thể đặt câu hỏi trên [Deepwiki của KrillinAI](https://deepwiki.com/krillinai/KrillinAI). Nó lập chỉ mục các tệp trong kho, vì vậy bạn có thể tìm câu trả lời nhanh chóng.

### Các Bước Cơ Bản

Đầu tiên, tải xuống tệp thực thi phù hợp với hệ điều hành của bạn từ [Release](https://github.com/KrillinAI/KrillinAI/releases), sau đó làm theo hướng dẫn dưới đây để chọn giữa phiên bản máy tính để bàn hoặc phiên bản không phải máy tính để bàn. Đặt tệp tải xuống phần mềm vào một thư mục trống, vì việc chạy nó sẽ tạo ra một số thư mục, và giữ nó trong một thư mục trống sẽ giúp quản lý dễ dàng hơn.

【Nếu là phiên bản máy tính để bàn, tức là tệp phát hành có "desktop," xem ở đây】
_Version máy tính để bàn được phát hành mới để giải quyết các vấn đề của người dùng mới gặp khó khăn trong việc chỉnh sửa tệp cấu hình đúng cách, và có một số lỗi đang được cập nhật liên tục._

1. Nhấp đúp vào tệp để bắt đầu sử dụng (phiên bản máy tính để bàn cũng yêu cầu cấu hình trong phần mềm)

【Nếu là phiên bản không phải máy tính để bàn, tức là tệp phát hành không có "desktop," xem ở đây】
_Version không phải máy tính để bàn là phiên bản ban đầu, có cấu hình phức tạp hơn nhưng ổn định về chức năng và phù hợp cho triển khai máy chủ, vì nó cung cấp giao diện người dùng ở định dạng web._

1. Tạo một thư mục `config` trong thư mục, sau đó tạo một tệp `config.toml` trong thư mục `config`. Sao chép nội dung của tệp `config-example.toml` từ thư mục `config` của mã nguồn vào `config.toml`, và điền thông tin cấu hình của bạn theo các chú thích.
2. Nhấp đúp hoặc thực thi tệp thực thi trong terminal để bắt đầu dịch vụ
3. Mở trình duyệt của bạn và nhập `http://127.0.0.1:8888` để bắt đầu sử dụng (thay thế 8888 bằng cổng bạn đã chỉ định trong tệp cấu hình)

### Đối với: Người Dùng macOS

【Nếu là phiên bản máy tính để bàn, tức là tệp phát hành có "desktop," xem ở đây】
Do vấn đề ký, phiên bản máy tính để bàn hiện tại không thể nhấp đúp để chạy hoặc cài đặt qua dmg; bạn cần phải tin tưởng ứng dụng một cách thủ công. Phương pháp như sau:

1. Mở terminal trong thư mục nơi tệp thực thi (giả sử tên tệp là KrillinAI_1.0.0_desktop_macOS_arm64) nằm
2. Thực hiện các lệnh sau theo thứ tự:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【Nếu là phiên bản không phải máy tính để bàn, tức là tệp phát hành không có "desktop," xem ở đây】
Phần mềm này không được ký, vì vậy khi chạy trên macOS, sau khi hoàn thành cấu hình tệp trong "Các Bước Cơ Bản," bạn cũng cần phải tin tưởng ứng dụng một cách thủ công. Phương pháp như sau:

1. Mở terminal trong thư mục nơi tệp thực thi (giả sử tên tệp là KrillinAI_1.0.0_macOS_arm64) nằm
2. Thực hiện các lệnh sau theo thứ tự:
   ```
   sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
   sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
   ./KrillinAI_1.0.0_macOS_arm64
   ```
   
   Điều này sẽ khởi động dịch vụ

### Triển Khai Docker

Dự án này hỗ trợ triển khai Docker; vui lòng tham khảo [Hướng Dẫn Triển Khai Docker](./docker.md)

Dựa trên tệp cấu hình đã cung cấp, đây là phần "Hỗ Trợ Cấu Hình (Cần Đọc)" đã được cập nhật cho tệp README của bạn:

### Hỗ Trợ Cấu Hình (Cần Đọc)

Tệp cấu hình được chia thành nhiều phần: `[app]`, `[server]`, `[llm]`, `[transcribe]`, và `[tts]`. Một nhiệm vụ bao gồm nhận diện giọng nói (`transcribe`) + dịch mô hình lớn (`llm`) + dịch vụ giọng nói tùy chọn (`tts`). Hiểu điều này sẽ giúp bạn nắm bắt tốt hơn tệp cấu hình.

**Cấu Hình Dễ Nhất và Nhanh Nhất:**

**Chỉ Dành Cho Dịch Phụ Đề:**
   * Trong phần `[transcribe]`, đặt `provider.name` thành `openai`.
   * Bạn chỉ cần điền khóa API OpenAI của mình trong khối `[llm]` để bắt đầu thực hiện dịch phụ đề. Các trường `app.proxy`, `model`, và `openai.base_url` có thể được điền theo nhu cầu.

**Chi Phí, Tốc Độ và Chất Lượng Cân Bằng (Sử Dụng Nhận Diện Giọng Nói Cục Bộ):**

* Trong phần `[transcribe]`, đặt `provider.name` thành `fasterwhisper`.
* Đặt `transcribe.fasterwhisper.model` thành `large-v2`.
* Điền cấu hình mô hình ngôn ngữ lớn của bạn trong khối `[llm]`.
* Mô hình cục bộ cần thiết sẽ được tự động tải xuống và cài đặt.

**Cấu Hình Chuyển Văn Bản Thành Giọng Nói (TTS) (Tùy Chọn):**

* Cấu hình TTS là tùy chọn.
* Đầu tiên, đặt `provider.name` trong phần `[tts]` (ví dụ: `aliyun` hoặc `openai`).
* Sau đó, điền khối cấu hình tương ứng cho nhà cung cấp đã chọn. Ví dụ, nếu bạn chọn `aliyun`, bạn phải điền phần `[tts.aliyun]`.
* Mã giọng nói trong giao diện người dùng nên được chọn dựa trên tài liệu của nhà cung cấp đã chọn.
* **Lưu Ý:** Nếu bạn dự định sử dụng tính năng nhân bản giọng nói, bạn phải chọn `aliyun` làm nhà cung cấp TTS.

**Cấu Hình Alibaba Cloud:**

* Để biết chi tiết về cách lấy `AccessKey`, `Bucket`, và `AppKey` cần thiết cho dịch vụ Alibaba Cloud, vui lòng tham khảo [Hướng Dẫn Cấu Hình Alibaba Cloud](https://www.google.com/search?q=./aliyun.md). Các trường lặp lại cho AccessKey, v.v., được thiết kế để duy trì cấu trúc cấu hình rõ ràng.

## Câu Hỏi Thường Gặp

Vui lòng truy cập [Câu Hỏi Thường Gặp](./faq.md)

## Hướng Dẫn Đóng Góp

1. Không gửi các tệp vô dụng, chẳng hạn như .vscode, .idea, v.v.; vui lòng sử dụng .gitignore để lọc chúng ra.
2. Không gửi config.toml; thay vào đó, gửi config-example.toml.

## Liên Hệ Với Chúng Tôi

1. Tham gia nhóm QQ của chúng tôi để đặt câu hỏi: 754069680
2. Theo dõi các tài khoản mạng xã hội của chúng tôi, [Bilibili](https://space.bilibili.com/242124650), nơi chúng tôi chia sẻ nội dung chất lượng trong lĩnh vực công nghệ AI mỗi ngày.

## Lịch Sử Sao

[![Biểu Đồ Lịch Sử Sao](https://api.star-history.com/svg?repos=KrillinAI/KrillinAI&type=Date)](https://star-history.com/#KrillinAI/KrillinAI&Date)