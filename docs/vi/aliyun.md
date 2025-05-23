## Điều kiện tiên quyết
Cần có tài khoản [Alibaba Cloud](https://www.aliyun.com) và đã xác thực danh tính, hầu hết các dịch vụ đều có hạn mức miễn phí.

## Lấy khóa bí mật từ nền tảng mô hình lớn Alibaba Cloud
1. Đăng nhập vào [Nền tảng dịch vụ mô hình lớn Alibaba Cloud](https://bailian.console.aliyun.com/), di chuột đến biểu tượng trung tâm cá nhân ở góc trên bên phải của trang, trong menu thả xuống nhấp vào API-KEY.
![百炼](/docs/images/bailian_1.png)
2. Trong thanh điều hướng bên trái, chọn Tất cả API-KEY hoặc API-KEY của tôi, sau đó tạo hoặc xem API Key.

## Lấy `access_key_id` và `access_key_secret` của Alibaba Cloud
1. Truy cập vào [Trang quản lý AccessKey của Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Nhấp vào Tạo AccessKey, nếu cần chọn cách sử dụng, chọn "Sử dụng trong môi trường phát triển cục bộ".
![阿里云access key](/docs/images/aliyun_accesskey_1.png)
3. Bảo quản cẩn thận, tốt nhất là sao chép vào tệp cục bộ để lưu trữ.

## Kích hoạt dịch vụ giọng nói của Alibaba Cloud
1. Truy cập vào [Trang quản lý dịch vụ giọng nói của Alibaba Cloud](https://nls-portal.console.aliyun.com/applist), lần đầu truy cập cần kích hoạt dịch vụ.
2. Nhấp vào Tạo dự án.
![阿里云speech](/docs/images/aliyun_speech_1.png)
3. Chọn chức năng và kích hoạt.
![阿里云speech](/docs/images/aliyun_speech_2.png)
4. "Tổng hợp giọng nói văn bản theo luồng (Mô hình lớn CosyVoice)" cần nâng cấp lên phiên bản thương mại, các dịch vụ khác có thể sử dụng phiên bản trải nghiệm miễn phí.
![阿里云speech](/docs/images/aliyun_speech_3.png)
5. Sao chép app key là được.
![阿里云speech](/docs/images/aliyun_speech_4.png)

## Kích hoạt dịch vụ OSS của Alibaba Cloud
1. Truy cập vào [Bảng điều khiển dịch vụ lưu trữ đối tượng Alibaba Cloud](https://oss.console.aliyun.com/overview), lần đầu truy cập cần kích hoạt dịch vụ.
2. Chọn danh sách Bucket ở bên trái, sau đó nhấp vào Tạo.
![阿里云OSS](/docs/images/aliyun_oss_1.png)
3. Chọn Tạo nhanh, điền tên Bucket phù hợp với yêu cầu và chọn khu vực **Thượng Hải**, hoàn tất việc tạo (tên được điền ở đây chính là giá trị của cấu hình `aliyun.oss.bucket`).
![阿里云OSS](/docs/images/aliyun_oss_2.png)
4. Sau khi tạo xong, vào Bucket.
![阿里云OSS](/docs/images/aliyun_oss_3.png)
5. Tắt công tắc "Chặn truy cập công cộng" và thiết lập quyền đọc/ghi thành "Công khai đọc".
![阿里云OSS](/docs/images/aliyun_oss_4.png)
![阿里云OSS](/docs/images/aliyun_oss_5.png)