### 1. Không thấy tệp cấu hình `app.log`, không thể biết nội dung lỗi
Người dùng Windows vui lòng đặt thư mục làm việc của phần mềm này vào một thư mục không phải trên ổ C.

### 2. Phiên bản không phải desktop đã tạo tệp cấu hình nhưng vẫn báo lỗi “Không tìm thấy tệp cấu hình”
Đảm bảo tên tệp cấu hình là `config.toml`, chứ không phải `config.toml.txt` hoặc cái khác.
Sau khi cấu hình xong, cấu trúc thư mục làm việc của phần mềm này nên như sau:
```
/── config/
│   └── config.toml
├── cookies.txt （<- tệp cookies.txt tùy chọn）
└── krillinai.exe
```

### 3. Đã điền cấu hình mô hình lớn, nhưng báo lỗi “xxxxx cần cấu hình xxxxx API Key”
Dịch vụ mô hình và dịch vụ giọng nói mặc dù có thể sử dụng dịch vụ của openai, nhưng cũng có những trường hợp mô hình lớn sử dụng riêng không phải openai, vì vậy hai phần cấu hình này là tách biệt. Ngoài cấu hình mô hình lớn, vui lòng tìm cấu hình whisper bên dưới để điền thông tin khóa tương ứng.

### 4. Báo lỗi có chứa “yt-dlp error”
Vấn đề của trình tải video, hiện tại có vẻ chỉ là vấn đề mạng hoặc phiên bản của trình tải, hãy kiểm tra xem proxy mạng có đang mở và được cấu hình trong mục cấu hình proxy của tệp cấu hình hay không, đồng thời khuyên bạn nên chọn nút Hong Kong. Trình tải được phần mềm này tự động cài đặt, nguồn cài đặt tôi sẽ cập nhật nhưng không phải là nguồn chính thức, vì vậy có thể sẽ bị lạc hậu, nếu gặp vấn đề hãy thử cập nhật thủ công, phương pháp cập nhật:

Mở terminal tại vị trí thư mục bin của phần mềm, thực hiện
```
./yt-dlp.exe -U
```
Tại đây, thay thế `yt-dlp.exe` bằng tên phần mềm ytdlp thực tế trên hệ thống của bạn.

### 5. Sau khi triển khai, việc tạo phụ đề diễn ra bình thường, nhưng phụ đề được ghép vào video có nhiều ký tự lạ
Phần lớn là do Linux thiếu phông chữ tiếng Trung. Vui lòng tải xuống phông chữ [微软雅黑](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) và [微软雅黑-bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc) (hoặc tự chọn phông chữ phù hợp với yêu cầu của bạn), sau đó thực hiện theo các bước dưới đây:
1. Tạo thư mục msyh trong /usr/share/fonts/ và sao chép phông chữ đã tải xuống vào thư mục đó
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```