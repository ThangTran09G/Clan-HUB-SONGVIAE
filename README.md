# Sống Vì AE — Clan Hub \& Vòng Quay

Website Node.js/Express gồm vòng quay may mắn đồng bộ realtime và trang quản lý thành viên Clan.

## Chạy trên Windows

1. Cài Node.js LTS.
2. Giải nén ZIP và mở CMD trong thư mục dự án.
3. Chạy `npm install`.
4. Đặt mật khẩu Admin rồi chạy:

```bat
   set ADMIN\_PASSWORD=AdminCOC1
   npm start
   ```

5. Mở `http://localhost:3000`.

Mật khẩu mặc định nếu không đặt biến môi trường là `AdminCOC`, theo yêu cầu ban đầu. Nên đặt mật khẩu mạnh riêng khi website được công khai.

## Đưa lên Render

* Build Command: `npm install`
* Start Command: `npm start`
* Environment: đặt `ADMIN\_PASSWORD` thành mật khẩu riêng.
* Nếu dùng filesystem ephemeral của Render, `data.json` có thể bị mất khi deploy/restart. Dùng Persistent Disk hoặc database để lưu dữ liệu lâu dài.

## Chức năng

* Vòng quay realtime và lịch sử người trúng giải.
* Danh sách thành viên công khai, lọc theo tên, Town Hall, cấp bậc, trạng thái.
* Admin đăng nhập để thêm/sửa/xóa thành viên; một thành viên có thể sở hữu nhiều ID game.
* Thông tin ngân hàng và số điện thoại chỉ trả về cho API Admin đã xác thực.
* Xuất danh sách CSV UTF-8 có BOM, mở được bằng Microsoft Excel.
* Giao diện sáng/tối, logo Clan Sống Vì AE, nhạc YouTube khởi động sau tương tác người dùng.

## Lưu ý

* Xuất dữ liệu hiện tại ở định dạng CSV tương thích Excel, không phải tệp XLSX gốc.
* Trình duyệt có thể chặn tự động phát nhạc; nhạc được khởi động sau lần nhấn đầu tiên trên trang.
* Dữ liệu hiện lưu trong `data.json`. Với website production, nên dùng Persistent Disk hoặc cơ sở dữ liệu và sao lưu định kỳ.
* Không chia sẻ mật khẩu Admin. Thông tin tài khoản ngân hàng là dữ liệu nhạy cảm; chỉ nhập nếu thật sự cần.

