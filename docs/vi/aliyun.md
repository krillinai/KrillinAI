## Điều kiện tiên quyết
Bạn cần có một tài khoản [Alibaba Cloud](https://www.aliyun.com) và hoàn thành xác minh danh tính. Hầu hết các dịch vụ đều có hạn mức miễn phí.

## Lấy `access_key_id` và `access_key_secret` của Alibaba Cloud
1. Truy cập trang [quản lý AccessKey của Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Nhấp vào "Tạo AccessKey." Nếu cần, chọn phương thức sử dụng là "Sử dụng trong môi trường phát triển cục bộ."
![Khóa truy cập Alibaba Cloud](/docs/images/aliyun_accesskey_1.png)
3. Giữ nó an toàn; tốt nhất là sao chép nó vào một tệp cục bộ để lưu trữ.

## Kích hoạt Dịch vụ Giọng nói Alibaba Cloud
1. Truy cập trang [quản lý Dịch vụ Giọng nói Alibaba Cloud](https://nls-portal.console.aliyun.com/applist). Bạn cần kích hoạt dịch vụ khi truy cập lần đầu.
2. Nhấp vào "Tạo Dự án."
![Giọng nói Alibaba Cloud](/docs/images/aliyun_speech_1.png)
3. Chọn các tính năng và kích hoạt chúng.
![Giọng nói Alibaba Cloud](/docs/images/aliyun_speech_2.png)
4. "Streaming Text-to-Speech (Mô hình Lớn CosyVoice)" cần được nâng cấp lên phiên bản thương mại; các dịch vụ khác có thể sử dụng phiên bản dùng thử miễn phí.
![Giọng nói Alibaba Cloud](/docs/images/aliyun_speech_3.png)
5. Chỉ cần sao chép khóa ứng dụng.
![Giọng nói Alibaba Cloud](/docs/images/aliyun_speech_4.png)

## Kích hoạt Dịch vụ OSS của Alibaba Cloud
1. Truy cập [Bảng điều khiển Dịch vụ Lưu trữ Đối tượng Alibaba Cloud](https://oss.console.aliyun.com/overview). Bạn cần kích hoạt dịch vụ khi truy cập lần đầu.
2. Chọn danh sách Bucket ở bên trái, sau đó nhấp vào "Tạo."
![OSS Alibaba Cloud](/docs/images/aliyun_oss_1.png)
3. Chọn "Tạo Nhanh," điền tên Bucket hợp lệ và chọn khu vực **Thượng Hải** để hoàn tất việc tạo (tên bạn nhập ở đây sẽ là giá trị cho mục cấu hình `aliyun.oss.bucket`).
![OSS Alibaba Cloud](/docs/images/aliyun_oss_2.png)
4. Sau khi tạo, vào Bucket.
![OSS Alibaba Cloud](/docs/images/aliyun_oss_3.png)
5. Tắt công tắc "Chặn Truy cập Công khai" và đặt quyền đọc và ghi thành "Đọc Công khai."
![OSS Alibaba Cloud](/docs/images/aliyun_oss_4.png)
![OSS Alibaba Cloud](/docs/images/aliyun_oss_5.png)