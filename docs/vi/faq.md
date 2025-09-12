### 1. Chương trình báo "Không tìm thấy tệp cấu hình" hoặc "xxxxx yêu cầu cấu hình khóa API xxxxx." Làm thế nào để tôi khắc phục điều này?

Đây là một vấn đề thiết lập phổ biến. Có một vài lý do điều này có thể xảy ra:

1. **Vị trí hoặc Tên Tệp Không Chính Xác:**

* Chương trình yêu cầu một tệp cấu hình có tên chính xác là `config.toml`. Đảm bảo bạn không vô tình đặt tên là `config.toml.txt`.
* Tệp này phải được đặt trong một thư mục `config`. Cấu trúc đúng của thư mục làm việc nên là:
  ```
  /── config/
  │   └── config.toml
  └── krillinai.exe (tệp thực thi của bạn)
  ```
* **Đối với người dùng Windows:** Nên đặt toàn bộ thư mục phần mềm vào một thư mục không nằm trên ổ C: để tránh các vấn đề về quyền truy cập.

2. **Cấu Hình Khóa API Chưa Hoàn Chỉnh:**

* Ứng dụng yêu cầu các cấu hình riêng biệt cho mô hình ngôn ngữ lớn (để dịch), dịch vụ giọng nói (để chuyển văn bản thành giọng nói và tổng hợp giọng nói) và dịch vụ tts.
* Ngay cả khi bạn sử dụng OpenAI cho tất cả, bạn vẫn phải điền khóa vào các phần khác nhau của tệp `config.toml`. Tìm phần `llm`, phần `transcribe`, phần `tts` và điền các Khóa API tương ứng và thông tin cần thiết khác.

### 2. Tôi nhận được một lỗi chứa "lỗi yt-dlp." Tôi nên làm gì?

Lỗi này chỉ ra một vấn đề với trình tải video, thường liên quan đến mạng của bạn hoặc phiên bản của trình tải.

* **Mạng:** Nếu bạn sử dụng proxy, hãy đảm bảo nó được cấu hình đúng trong cài đặt proxy trong tệp `config.toml` của bạn.
* **Cập nhật `yt-dlp`:** Phiên bản của `yt-dlp` đi kèm với phần mềm có thể đã lỗi thời. Bạn có thể cập nhật nó thủ công bằng cách mở một terminal trong thư mục `bin` của phần mềm và chạy lệnh:
  ```
  ./yt-dlp.exe -U
  ```
  
  (Thay thế `yt-dlp.exe` bằng tên tệp đúng cho hệ điều hành của bạn nếu nó khác).

### 3. Phụ đề trong video cuối bị rối hoặc xuất hiện dưới dạng các khối vuông, đặc biệt trên Linux.

Điều này hầu như luôn do thiếu phông chữ trên hệ thống, đặc biệt là những phông hỗ trợ ký tự Trung Quốc. Để khắc phục điều này, bạn cần cài đặt các phông chữ cần thiết.

1. Tải xuống các phông chữ cần thiết, chẳng hạn như [Microsoft YaHei](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) và [Microsoft YaHei Bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc).
2. Tạo một thư mục phông chữ mới: `sudo mkdir -p /usr/share/fonts/msyh`.
3. Sao chép các tệp phông `.ttc` đã tải xuống vào thư mục mới này.
4. Thực hiện các lệnh sau để xây dựng lại bộ nhớ cache phông chữ:
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    sudo fc-cache -fv
    ```

### 4. Trên macOS, ứng dụng không khởi động và hiển thị lỗi như "KrillinAI bị hỏng và không thể mở."

Điều này do tính năng bảo mật của macOS, Gatekeeper, hạn chế các ứng dụng từ các nhà phát triển không xác định. Để khắc phục điều này, bạn phải xóa thuộc tính cách ly một cách thủ công.

1. Mở ứng dụng **Terminal**.
2. Gõ lệnh `xattr -cr` theo sau là một khoảng trắng, sau đó kéo tệp `KrillinAI.app` từ cửa sổ Finder của bạn vào Terminal. Lệnh sẽ trông giống như sau:
    ```
    xattr -cr /Applications/KrillinAI.app
    ```
3. Nhấn Enter. Bây giờ bạn nên có thể mở ứng dụng.

### 5. Tôi nhận được các lỗi như `lỗi ffmpeg`, `lỗi audioToSrt`, hoặc `trạng thái thoát 1` trong quá trình xử lý.

Các lỗi này thường chỉ ra các vấn đề với các phụ thuộc hoặc tài nguyên hệ thống.

* **`lỗi ffmpeg`:** Điều này cho thấy `ffmpeg` không được cài đặt hoặc không thể truy cập từ PATH của hệ thống. Đảm bảo bạn đã cài đặt một phiên bản đầy đủ, chính thức của `ffmpeg` và rằng vị trí của nó đã được thêm vào biến môi trường của hệ thống.
* **`lỗi audioToSrt` hoặc `trạng thái thoát 1`:** Lỗi này xảy ra trong giai đoạn chuyển đổi (từ âm thanh sang văn bản). Các nguyên nhân phổ biến là:
  * **Vấn đề với Mô Hình:** Mô hình chuyển đổi cục bộ (ví dụ: `fasterwhisper`) không thể tải hoặc bị hỏng trong quá trình tải xuống.
  * **Thiếu Bộ Nhớ (RAM):** Chạy các mô hình cục bộ tiêu tốn nhiều tài nguyên. Nếu máy của bạn hết bộ nhớ, hệ điều hành có thể kết thúc quá trình, dẫn đến lỗi.
  * **Lỗi Mạng:** Nếu bạn đang sử dụng dịch vụ chuyển đổi trực tuyến (như API Whisper của OpenAI), điều này chỉ ra một vấn đề với kết nối mạng của bạn hoặc một khóa API không hợp lệ.

### 6. Thanh tiến trình không di chuyển. Chương trình có bị treo không?

Không, miễn là bạn không thấy thông báo lỗi, chương trình đang hoạt động. Thanh tiến trình chỉ cập nhật sau khi một nhiệm vụ lớn (như chuyển đổi hoặc mã hóa video) hoàn thành hoàn toàn. Những nhiệm vụ này có thể mất nhiều thời gian, khiến thanh tiến trình tạm dừng trong một khoảng thời gian dài. Xin hãy kiên nhẫn và chờ đợi nhiệm vụ hoàn thành.

### 7. GPU dòng NVIDIA 5000 của tôi không được `fasterwhisper` hỗ trợ. Tôi nên làm gì?

Đã có thông báo rằng mô hình `fasterwhisper` có thể không hoạt động đúng với GPU dòng NVIDIA 5000 (tính đến giữa năm 2025). Bạn có một vài lựa chọn thay thế cho việc chuyển đổi:

1. **Sử dụng Mô Hình Dựa Trên Đám Mây:** Đặt `transcribe.provider.name` thành `openai` hoặc `aliyun` trong tệp `config.toml` của bạn. Sau đó, điền khóa API và chi tiết cấu hình tương ứng. Điều này sẽ sử dụng mô hình Whisper của nhà cung cấp đám mây thay vì mô hình cục bộ.
2. **Sử dụng Mô Hình Cục Bộ Khác:** Bạn có thể thử nghiệm với các mô hình chuyển đổi cục bộ khác, chẳng hạn như `whisper.cpp` gốc.

### 8. Làm thế nào để tôi tìm và điền mã giọng nói/tone chính xác cho chuyển văn bản thành giọng nói?

Các giọng nói có sẵn và mã tương ứng của chúng được xác định bởi nhà cung cấp dịch vụ giọng nói mà bạn đang sử dụng. Vui lòng tham khảo tài liệu chính thức của họ.

* **OpenAI TTS:** [Tài liệu](https://platform.openai.com/docs/guides/text-to-speech/api-reference) (xem các tùy chọn `voice`).
* **Alibaba Cloud:** [Tài liệu](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis) (xem tham số `voice` trong danh sách tone).

### 9. Làm thế nào tôi có thể sử dụng một Mô Hình Ngôn Ngữ Lớn (LLM) cục bộ, như một cái chạy trên Ollama, để dịch?

Có, bạn có thể cấu hình KrillinAI để sử dụng bất kỳ LLM cục bộ nào cung cấp một điểm cuối API tương thích với OpenAI.

1. **Khởi động LLM Cục Bộ của Bạn:** Đảm bảo dịch vụ cục bộ của bạn (ví dụ: Ollama chạy Llama3) đang hoạt động và có thể truy cập.
2. **Chỉnh sửa `config.toml`:** Trong phần cho mô hình ngôn ngữ lớn (người dịch):

* Đặt `name` (hoặc `type`) của nhà cung cấp thành `"openai"`.
* Đặt `api_key` thành bất kỳ chuỗi ngẫu nhiên nào (ví dụ: `"ollama"`), vì nó không cần thiết cho các cuộc gọi cục bộ.
* Đặt `base_url` thành điểm cuối API của mô hình cục bộ của bạn. Đối với Ollama, điều này thường là `http://localhost:11434/v1`.
* Đặt `model` thành tên của mô hình bạn đang phục vụ, ví dụ, `"llama3"`.

### 10. Tôi có thể tùy chỉnh kiểu phụ đề (phông chữ, kích thước, màu sắc) trong video cuối không?

Không. Hiện tại, KrillinAI tạo ra **phụ đề cứng**, có nghĩa là chúng được đốt trực tiếp vào các khung video. Ứng dụng **không cung cấp tùy chọn để tùy chỉnh kiểu phụ đề**; nó sử dụng một kiểu đã được định sẵn.

Để tùy chỉnh nâng cao, cách làm việc được khuyến nghị là:

1. Sử dụng KrillinAI để tạo tệp phụ đề `.srt` đã dịch.
2. Nhập video gốc của bạn và tệp `.srt` này vào một trình chỉnh sửa video chuyên nghiệp (ví dụ: Premiere Pro, Final Cut Pro, DaVinci Resolve) để áp dụng các kiểu tùy chỉnh trước khi xuất.

### 11. Tôi đã có một tệp `.srt` đã dịch. KrillinAI có thể sử dụng nó chỉ để thực hiện lồng ghép không?

Không, tính năng này hiện không được hỗ trợ. Ứng dụng chạy một quy trình đầy đủ từ chuyển đổi đến tạo video cuối cùng.