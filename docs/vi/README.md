<div align="center">
  <img src="/docs/images/logo.png" alt="KrillinAI" height="90">

  # Công cụ dịch và lồng ghép video AI tối giản

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![Discord](https://img.shields.io/discord/1333374141092331605?label=Discord&logo=discord&style=flat-square)](https://discord.gg/sKUAsHfy)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢 Phiên bản mới cho desktop win&mac đã phát hành, chào mừng bạn thử nghiệm và phản hồi [Tài liệu đang được cập nhật]

 ## Giới thiệu dự án  

Krillin AI là một giải pháp toàn diện cho việc địa phương hóa và nâng cao âm thanh và video. Công cụ đơn giản nhưng mạnh mẽ này tích hợp dịch video, lồng ghép giọng nói và nhân bản giọng nói, hỗ trợ xuất định dạng ngang và dọc, đảm bảo hiển thị hoàn hảo trên tất cả các nền tảng chính (Bilibili, Xiaohongshu, Douyin, Video Number, Kuaishou, YouTube, TikTok, v.v.). Với quy trình làm việc đầu cuối, Krillin AI chỉ cần vài cú nhấp chuột để biến nguyên liệu gốc thành nội dung đa nền tảng sẵn sàng sử dụng.

## Tính năng và chức năng chính:
🎯 **Khởi động một cú nhấp chuột**: Không cần cấu hình môi trường phức tạp, tự động cài đặt phụ thuộc, sẵn sàng sử dụng ngay lập tức, phiên bản desktop mới, dễ sử dụng hơn!

📥 **Lấy video**: Hỗ trợ tải xuống yt-dlp hoặc tải lên tệp cục bộ

📜 **Nhận diện chính xác**: Nhận diện giọng nói với độ chính xác cao dựa trên Whisper

🧠 **Phân đoạn thông minh**: Sử dụng LLM để phân đoạn và căn chỉnh phụ đề

🔄 **Thay thế thuật ngữ**: Thay thế từ ngữ chuyên ngành chỉ với một cú nhấp chuột 

🌍 **Dịch chuyên nghiệp**: Dịch cấp đoạn dựa trên LLM, giữ nguyên tính liên kết ngữ nghĩa

🎙️ **Nhân bản giọng nói**: Cung cấp giọng nói chọn lọc từ CosyVoice hoặc nhân bản giọng nói tùy chỉnh

🎬 **Ghép video**: Tự động xử lý video định dạng ngang và dọc cùng với bố cục phụ đề


## Hiệu ứng hiển thị
Hình dưới đây là hiệu ứng của tệp phụ đề được tạo ra sau khi nhập video cục bộ dài 46 phút, không cần điều chỉnh thủ công. Không có thiếu sót, chồng chéo, câu được ngắt tự nhiên, chất lượng dịch cũng rất cao.
![Hiệu ứng căn chỉnh](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Dịch phụ đề
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">



### Lồng ghép giọng nói
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Định dạng dọc
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Hỗ trợ dịch vụ nhận diện giọng nói
_**Tất cả các mô hình cục bộ trong bảng dưới đây đều hỗ trợ cài đặt tự động tệp thực thi + tệp mô hình, bạn chỉ cần chọn, KrillinAI sẽ chuẩn bị tất cả cho bạn.**_

| Nguồn dịch vụ       | Nền tảng hỗ trợ       | Tùy chọn mô hình                           | Cục bộ/Đám mây | Ghi chú                 |
| ------------------ | --------------------- | ------------------------------------------ | --------------- | ----------------------- |
| **OpenAI Whisper** | Tất cả nền tảng       | -                                          | Đám mây         | Nhanh và hiệu quả       |
| **FasterWhisper**  | Windows/Linux         | `tiny`/`medium`/`large-v2` (khuyên dùng medium+) | Cục bộ          | Nhanh hơn, không tốn chi phí đám mây |
| **WhisperKit**     | macOS (chỉ dành cho chip M) | `large-v2`                               | Cục bộ          | Tối ưu hóa cho chip Apple |
| **Alibaba Cloud ASR** | Tất cả nền tảng     | -                                          | Đám mây         | Tránh vấn đề mạng ở Trung Quốc đại lục |

## 🚀 Hỗ trợ mô hình ngôn ngữ lớn

✅ Tương thích với tất cả các dịch vụ mô hình ngôn ngữ lớn cục bộ/đám mây tuân thủ **chuẩn API OpenAI**, bao gồm nhưng không giới hạn:
- OpenAI
- DeepSeek
- Tongyi Qianwen
- Mô hình mã nguồn mở triển khai cục bộ
- Các dịch vụ API tương thích với định dạng OpenAI khác

## Hỗ trợ ngôn ngữ
Ngôn ngữ đầu vào hỗ trợ: tiếng Trung, tiếng Anh, tiếng Nhật, tiếng Đức, tiếng Thổ Nhĩ Kỳ, tiếng Hàn, tiếng Nga, tiếng Mã Lai (đang tiếp tục mở rộng)

Ngôn ngữ dịch hỗ trợ: tiếng Anh, tiếng Trung, tiếng Nga, tiếng Tây Ban Nha, tiếng Pháp và 101 ngôn ngữ khác

## Xem trước giao diện
![Xem trước giao diện](/docs/images/ui_desktop.png)


## 🚀 Bắt đầu nhanh
### Các bước cơ bản
Đầu tiên tải xuống tệp thực thi phù hợp với hệ điều hành của bạn từ [Release](https://github.com/krillinai/KrillinAI/releases), theo hướng dẫn dưới đây để chọn phiên bản desktop hay không phải desktop, sau đó đặt vào một thư mục trống, tải phần mềm vào một thư mục trống vì sau khi chạy sẽ tạo ra một số thư mục, đặt vào thư mục trống sẽ dễ quản lý hơn.  

【Nếu là phiên bản desktop, tức là tệp release có chữ desktop, xem tại đây】  
_Version desktop mới phát hành, nhằm giải quyết vấn đề người dùng mới khó chỉnh sửa tệp cấu hình đúng cách, vẫn còn nhiều lỗi, đang được cập nhật liên tục_
1. Nhấp đúp vào tệp để bắt đầu sử dụng (phiên bản desktop cũng cần cấu hình trong phần mềm)

【Nếu là phiên bản không phải desktop, tức là tệp release không có chữ desktop, xem tại đây】  
_Version không phải desktop là phiên bản ban đầu, cấu hình phức tạp hơn nhưng chức năng ổn định, đồng thời phù hợp cho triển khai trên máy chủ vì sẽ cung cấp giao diện người dùng theo cách web_
1. Tạo thư mục `config` trong thư mục, sau đó tạo tệp `config.toml` trong thư mục `config`, sao chép nội dung của tệp `config-example.toml` trong thư mục `config` và điền thông tin cấu hình của bạn.
2. Nhấp đúp hoặc thực thi tệp thực thi trong terminal để khởi động dịch vụ 
3. Mở trình duyệt, nhập `http://127.0.0.1:8888`, bắt đầu sử dụng (thay 8888 bằng cổng bạn đã điền trong tệp cấu hình)

### Đối với người dùng macOS
【Nếu là phiên bản desktop, tức là tệp release có chữ desktop, xem tại đây】  
Hiện tại, cách đóng gói phiên bản desktop do vấn đề chữ ký, không thể nhấp đúp để chạy trực tiếp hoặc cài đặt dmg, cần phải tin tưởng ứng dụng thủ công, cách làm như sau:
1. Mở terminal đến thư mục chứa tệp thực thi (giả sử tên tệp là KrillinAI_1.0.0_desktop_macOS_arm64)
2. Thực hiện lần lượt các lệnh sau:
```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【Nếu là phiên bản không phải desktop, tức là tệp release không có chữ desktop, xem tại đây】  
Phần mềm này không có chữ ký, vì vậy khi chạy trên macOS, sau khi hoàn thành cấu hình tệp trong "các bước cơ bản", cần phải tin tưởng ứng dụng thủ công, cách làm như sau:
1. Mở terminal đến thư mục chứa tệp thực thi (giả sử tên tệp là KrillinAI_1.0.0_macOS_arm64)
2. Thực hiện lần lượt các lệnh sau:
   ```
    sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
    sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
    ./KrillinAI_1.0.0_macOS_arm64
    ```
    để khởi động dịch vụ

### Triển khai Docker
Dự án này hỗ trợ triển khai Docker, vui lòng tham khảo [Hướng dẫn triển khai Docker](./docker.md)

### Hướng dẫn cấu hình Cookie (không bắt buộc)

Nếu bạn gặp phải tình trạng tải video không thành công

Vui lòng tham khảo [Hướng dẫn cấu hình Cookie](./get_cookies.md) để cấu hình thông tin Cookie của bạn.

### Giúp đỡ cấu hình (cần xem)
Cách cấu hình nhanh chóng và tiện lợi nhất:
* Chọn `transcription_provider` và `llm_provider` đều là `openai`, như vậy trong ba mục cấu hình lớn `openai`、`local_model`、`aliyun` chỉ cần điền `openai.apikey` là có thể thực hiện dịch phụ đề. (`app.proxy`、`model` và `openai.base_url` có thể điền theo tình hình của bạn)

Cách cấu hình sử dụng mô hình nhận diện ngôn ngữ cục bộ (tạm thời không hỗ trợ macOS) (cân nhắc chi phí, tốc độ và chất lượng)
* Điền `transcription_provider` là `fasterwhisper`, `llm_provider` là `openai`, như vậy trong ba mục cấu hình lớn `openai`、`local_model` chỉ cần điền `openai.apikey` và `local_model.faster_whisper` là có thể thực hiện dịch phụ đề, mô hình cục bộ sẽ tự động tải xuống. (`app.proxy` và `openai.base_url` như trên)

Các trường hợp sử dụng sau đây cần cấu hình Alibaba Cloud:
* Nếu `llm_provider` điền là `aliyun`, cần sử dụng dịch vụ mô hình lớn của Alibaba Cloud, vì vậy cần cấu hình mục `aliyun.bailian`
* Nếu `transcription_provider` điền là `aliyun`, hoặc khi khởi động nhiệm vụ đã bật chức năng "lồng ghép giọng nói", đều cần sử dụng dịch vụ giọng nói của Alibaba Cloud, vì vậy cần điền mục `aliyun.speech`
* Nếu bật chức năng "lồng ghép giọng nói", đồng thời tải lên âm thanh cục bộ để làm nhân bản giọng nói, thì cũng cần sử dụng dịch vụ lưu trữ đám mây OSS của Alibaba Cloud, vì vậy cần điền mục `aliyun.oss`  
Hướng dẫn cấu hình Alibaba Cloud: [Hướng dẫn cấu hình Alibaba Cloud](./aliyun.md)

## Câu hỏi thường gặp

Vui lòng tham khảo [Câu hỏi thường gặp](./faq.md)

## Quy tắc đóng góp
1. Không gửi tệp không cần thiết, như .vscode, .idea, v.v., hãy sử dụng .gitignore để lọc
2. Không gửi config.toml, mà hãy sử dụng config-example.toml để gửi

## Liên hệ với chúng tôi
1. Tham gia nhóm QQ của chúng tôi để giải đáp thắc mắc: 754069680
2. Theo dõi tài khoản mạng xã hội của chúng tôi, [Bilibili](https://space.bilibili.com/242124650), hàng ngày chia sẻ nội dung chất lượng trong lĩnh vực công nghệ AI

## Lịch sử sao

[![Biểu đồ lịch sử sao](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)