<div align="center">
  <img src="../docs/images/logo.png" alt="KrillinAI" height="90">


  # # Công Cụ Dịch Thuật và Lồng Tiếng AI cho Âm Thanh & Video

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](../README.md)｜[简体中文](../docs/README_zh.md)｜[日本語](../docs/README_jp.md)｜[한국어](../docs/README_kr.md)｜[Tiếng Việt](../docs/README_vi.md)｜[Français](../docs/README_fr.md)｜[Deutsch](../docs/README_de.md)｜[Español](../docs/README_es.md)｜[Português](../docs/README_pt.md)｜[Русский](../docs/README_rus.md)｜[اللغة العربية](../docs/README_ar.md)**

  [![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=%20followers&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢 Phiên Bản Mới Cho Desktop Win & Mac – Chào Đón Trải Nghiệm Và Đóng Góp Ý Kiến

## Tổng Quan

Krillin AI là giải pháp toàn diện để địa phương hóa và nâng cấp video một cách dễ dàng. Công cụ tối giản nhưng mạnh mẽ này xử lý mọi thứ từ dịch thuật, lồng tiếng đến nhân bản giọng nói, định dạng – chuyển đổi liền mạch video giữa chế độ ngang và dọc để tối ưu hiển thị trên mọi nền tảng nội dung (YouTube, TikTok, Bilibili, Douyin, Kênh WeChat, RedNote, Kuaishou). Với quy trình làm việc end-to-end, Krillin AI biến footage thô thành nội dung hoàn thiện, sẵn sàng đăng tải chỉ với vài cú nhấp chuột.

## Tính năng chính:
🎯 **Khởi động một chạm** - Bắt đầu quy trình làm việc ngay lập tức, Phiên bản desktop mới - sử dụng dễ dàng hơn!

📥 **Tải video** - Hỗ trợ yt-dlp và tải file từ máy tính

📜 **Phụ đề chính xác** - Nhận diện với độ chính xác cao nhờ Whisper

🧠 **Phân đoạn thông minh** - Chia nhỏ và căn chỉnh phụ đề dựa trên LLM

🌍 **Dịch thuật chuyên nghiệp** - Dịch theo đoạn văn để đảm bảo tính nhất quán

🔄 **Thay thế thuật ngữ** - Đổi từ vựng chuyên ngành chỉ với một cú nhấp chuột

🎙️ **Lồng tiếng & Nhân bản giọng nói** - Lựa chọn giọng CosyVoice hoặc giọng nhân bản

🎬 **Tổng hợp video** - Tự động định dạng cho bố cục ngang/dọc

## Minh họa
Bức ảnh dưới đây thể hiện kết quả sau khi file phụ đề - được tạo tự động chỉ bằng một cú nhấp chuột từ video local 46 phút - được chèn vào timeline. Toàn bộ quá trình không hề có bất kỳ chỉnh sửa thủ công nào. Phụ đề hiển thị đầy đủ không bị thiếu hay chồng chéo, cách phân đoạn câu tự nhiên, chất lượng bản dịch cũng rất cao.
![Alignment](../docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Phụ đề dịch
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### Lồng tiếng
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Dọc
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Hỗ trợ Nhận dạng Giọng nói
_**Tất cả mô hình cục bộ trong bảng dưới đây hỗ trợ cài đặt tự động file thực thi + file mô hình. Chỉ cần lựa chọn, KrillinAI sẽ tự động xử lý phần còn lại cho bạn.**_

| Dịch vụ         | Nền tảng hỗ trợ        | Tùy chọn mô hình                    | Cục bộ/Đám mây | Ghi chú       |
|-----------------|------------------------------|-----------------------------------|-------------|----------------|
| **OpenAI Whisper** | Đa nền tảng      | -                                 | Đám mây	     | Tốc độ nhanh với kết quả xuất sắc |
| **FasterWhisper** | Windows/Linux     | `tiny`/`medium`/`large-v2` (recommend medium+) | Cục bộ    | Tốc độ nhanh hơn, không phụ thuộc dịch vụ đám mây |
| **WhisperKit**    | macOS (Apple Silicon only)   | `large-v2`                        | Cục bộ       | Tối ưu hóa riêng cho chip Apple |
| **Alibaba Cloud ASR** | Đa nền tảng	    | -                                 | Đám mây       | Không gặp vấn đề mạng tại Trung Quốc đại lục |

## 🚀 Hỗ trợ Mô hình Ngôn ngữ Lớn

✅ Tương thích với tất cả dịch vụ LLM đám mây/cục bộ tương thích **OpenAI API** bao gồm nhưng không giới hạn:
- OpenAI
- DeepSeek
- Qwen (Tongyi Qianwen)
- Các mô hình mã nguồn mở tự triển khai
- Các dịch vụ API tương thích định dạng OpenAI khác

## 🌍 Hỗ trợ Ngôn ngữ
Ngôn ngữ đầu vào: Hỗ trợ tiếng Trung, Anh, Nhật, Đức, Thổ Nhĩ Kỳ (đang tiếp tục bổ sung thêm)
Ngôn ngữ dịch: Hỗ trợ 56 ngôn ngữ bao gồm tiếng Anh, Trung, Nga, Tây Ban Nha, Pháp,...

## Xem trước giao diện
![ui preview](../docs/images/ui_desktop.png)

## 🚀 Bắt đầu nhanh
### Các bước cơ bản
Đầu tiên, tải file thực thi Release phù hợp với hệ thống thiết bị của bạn. Làm theo hướng dẫn dưới đây để chọn giữa phiên bản desktop hoặc non-desktop, sau đó đặt phần mềm vào thư mục trống. Chạy chương trình sẽ tạo ra một số thư mục, vì vậy việc đặt trong thư mục trống giúp quản lý dễ dàng hơn.

[Đối với phiên bản desktop (file release có chứa "desktop" trong tên), xem hướng dẫn tại đây]
Phiên bản desktop mới được phát hành để giải quyết khó khăn cho người mới trong việc chỉnh sửa file cấu hình. Phiên bản này vẫn còn một số lỗi và đang được cập nhật liên tục.

Nhấp đúp vào file để bắt đầu sử dụng.

[Đối với phiên bản non-desktop (file release không có "desktop" trong tên), xem hướng dẫn tại đây]
Phiên bản non-desktop là bản phát hành gốc, có cấu hình phức tạp hơn nhưng chức năng ổn định. Phiên bản này cũng phù hợp để triển khai trên server, vì cung cấp giao diện web.

Tạo thư mục config trong thư mục chứa phần mềm, sau đó tạo file config.toml trong đó. Sao chép nội dung từ file config-example.toml trong thư mục config của mã nguồn vào file config.toml của bạn và điền các thông tin cấu hình. (Nếu bạn muốn sử dụng các mô hình OpenAI nhưng không biết cách lấy key, có thể tham gia nhóm để được dùng thử miễn phí.)

Nhấp đúp vào file thực thi hoặc chạy trong terminal để khởi động dịch vụ.

Mở trình duyệt và truy cập http://127.0.0.1:8888 để bắt đầu sử dụng. (Thay 8888 bằng số cổng bạn đã chỉ định trong file config.)

### Dành cho người dùng macOS
[Đối với phiên bản desktop (file bản phát hành có chứa "desktop" trong tên), làm theo hướng dẫn sau]
Do vấn đề chứng thực, phiên bản desktop hiện chưa hỗ trợ chạy trực tiếp bằng double-click hoặc cài đặt qua DMG. Cần cấu hình thủ công như sau:

1. Mở Terminal và truy cập thư mục chứa file thực thi (giả sử tên file là KrillinAI_1.0.0_desktop_macOS_arm64)

2. Thực hiện lần lượt các lệnh sau:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64  
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64  
./KrillinAI_1.0.0_desktop_macOS_arm64  
```

[Đối với phiên bản non-desktop (file bản phát hành không có "desktop" trong tên), làm theo hướng dẫn sau]
Phần mềm này chưa được chứng thực, nên sau khi hoàn thành các bước cấu hình file ở mục "Các bước cơ bản", bạn cần thủ công cấp quyền trust ứng dụng trên macOS. Thực hiện theo các bước sau:
1. Mở Terminal và điều hướng đến thư mục chứa file thực thi (giả sử tên file là KrillinAI_1.0.0_macOS_arm64)
2. Thực hiện lần lượt các lệnh sau:
```
sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
./KrillinAI_1.0.0_macOS_arm64
```
Thao tác này sẽ khởi động dịch vụ.

### Triển khai bằng Docker
Dự án này hỗ trợ triển khai qua Docker. Vui lòng tham khảo [Docker Deployment Instructions](../docs/docker.md).

### Hướng dẫn cấu hình Cookie

Nếu gặp lỗi khi tải video xuống, vui lòng tham khảo [Cookie Configuration Instructions](./docs/get_cookies.md) để thiết lập thông tin cookie của bạn.

### Hướng dẫn cấu hình
Cách cấu hình nhanh chóng và tiện lợi nhất:
* Chọn openai cho cả transcription_provider và llm_provider. Với cách này, bạn chỉ cần điền openai.apikey trong ba nhóm cấu hình chính sau: openai, local_model và aliyun là có thể thực hiện dịch phụ đề. (Điền app.proxy, model và openai.base_url theo tình hình thực tế của bạn.)

Cách cấu hình sử dụng mô hình nhận dạng giọng nói cục bộ (tạm thời chưa hỗ trợ macOS) (lựa chọn cân bằng giữa chi phí, tốc độ và chất lượng):
* Điền fasterwhisper cho transcription_provider và openai cho llm_provider. Với cách này, bạn chỉ cần điền openai.apikey và local_model.faster_whisper trong hai nhóm cấu hình openai và local_model là có thể thực hiện dịch phụ đề. Mô hình cục bộ sẽ được tải xuống tự động. (Tương tự với app.proxy và openai.base_url như đã đề cập ở trên.)

Các trường hợp sử dụng sau yêu cầu cấu hình Alibaba Cloud:
* Nếu llm_provider điền aliyun nghĩa là sẽ sử dụng dịch vụ mô hình lớn của Alibaba Cloud, do đó cần cấu hình mục aliyun.bailian.
* Nếu transcription_provider điền aliyun, hoặc khi bật chức năng "lồng tiếng" khi bắt đầu tác vụ sẽ sử dụng dịch vụ giọng nói của Alibaba Cloud, do đó cần điền cấu hình mục aliyun.speech.
* Nếu bật chức năng "lồng tiếng" đồng thời tải lên file âm thanh cục bộ để nhân bản giọng nói thì sẽ sử dụng cả dịch vụ lưu trữ đám mây OSS của Alibaba Cloud, do đó cần điền cấu hình mục aliyun.oss.
Hướng dẫn cấu hình: [Alibaba Cloud Configuration Instructions](../docs/aliyun.md)

## Câu hỏi thường gặp
Vui lòng tham khảo [Frequently Asked Questions](../docs/faq.md)

## Hướng dẫn đóng góp

- Không gửi các file không cần thiết như .vscode, .idea,... Hãy sử dụng tốt file .gitignore để lọc chúng.
- Không gửi file config.toml mà hãy gửi file config-example.toml.

## Lịch sử sao

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)

