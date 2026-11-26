# 小程序官方客服说明（Zalo Mini App 审核材料）

> 本文档用于提交 Zalo 官方审核，说明应用功能、访问地址、收费方式与隐私合规情况。
> 语言：越南语（正文）+ 中文（对照），便于审核员与团队双方阅读。

---

## 1. 基本信息

| 项目 | 内容 |
| --- | --- |
| 应用名称 | **Mò Cá Thế Giới**（摸鱼世界 / Mom Fish World） |
| 应用类型 | Giải trí / Mini Game（休闲游戏合集） |
| App ID | `2165731632970250962` |
| Web 访问地址 | https://mom-fish-world1-0.vercel.app |
| 开发框架 | Next.js（Web 运行于 Zalo Mini App 容器内） |
| 目标用户 | Zalo 用户（越南语为主，兼顾中文用户） |

---

## 2. 应用简介

**Tiếng Việt（越南语）**

Mò Cá Thế Giới là bộ sưu tập các trò chơi mini giải trí nhẹ nhàng, giúp người dùng thư giãn trong giờ giải lao. Ứng dụng gồm 5 trò chơi:

1. **TRỌNG SINH（重生欠债）** — Mô phỏng trả nợ 300 triệu trong 7 ngày.
2. **TRỐN SẾP（躲老板）** — Trò chơi phản xạ 30 giây mỗi ván.
3. **TIỆM TRÀ SỮA CÔ BA（奶茶店）** — Mở tiệm 7 ngày, đạt mục tiêu 850.000đ.
4. **VỊT VĂN PHÒNG（打工鸭）** — Chăm sóc chú vịt, giữ năng lượng.
5. **MA SÓI（异步狼人杀）** — Trò chơi suy luận bất đồng bộ, không cần online cùng lúc.

Ngoài ra còn có **TỔNG KẾT TUẦN（周总结）** giúp người dùng xem lại thành tích trong tuần.

**中文（对照）**

摸鱼世界是一款轻松的休闲小游戏合集，帮助用户在休息时间放松。包含 5 款游戏：重生欠债、躲老板、奶茶店、打工鸭、异步狼人杀，以及周总结功能。

---

## 3. 访问地址

- **生产环境（Web 可直接打开）：** https://mom-fish-world1-0.vercel.app
- **分享链接：** https://zalo.me/momfishworld

> 审核员可直接在浏览器打开上方地址体验完整功能，无需安装。

---

## 4. 收费说明（完全免费）

**Tiếng Việt（越南语）**

Ứng dụng **hoàn toàn miễn phí**. Người dùng **không phải trả bất kỳ khoản phí nào** để chơi.

- Không có nội dung trả phí (IAP / nạp tiền).
- Không có gói đăng ký (subscription).
- Không bán bất kỳ vật phẩm ảo nào bằng tiền thật.

**中文（对照）**

应用**完全免费**，用户**无需支付任何费用**即可游玩。

- 无内购（IAP / 充值）。
- 无订阅。
- 不通过真实货币出售任何虚拟物品。

---

## 5. 广告说明

**Tiếng Việt（越南语）**

Ứng dụng **chỉ chứa quảng cáo tích hợp sẵn** (quảng cáo xem để nhận thưởng — rewarded ads) như một cách duy trì hoạt động của ứng dụng.

- Người dùng **chủ động xem quảng cáo** để nhận thêm **50 xu** trong trò chơi.
- Mỗi ngày tối đa **10 lần** xem quảng cáo nhận thưởng.
- **Không có quảng cáo cưỡng bức** (không có quảng cáo chặn màn hình, không tự động bật quảng cáo).
- Xu (coin) trong trò chơi chỉ dùng để hiển thị thành tích, **không quy đổi được thành tiền thật**.

> Ghi chú: Hiện tại tính năng quảng cáo đang ở dạng chỗ trống (placeholder), chưa tích hợp SDK quảng cáo thật. Khi tích hợp, sẽ tuân thủ chính sách quảng cáo của Zalo.

**中文（对照）**

应用**仅内置广告**（激励视频广告），作为维持应用运营的方式。

- 用户**主动观看广告**可获得额外 **50 金币**。
- 每天最多 **10 次**激励广告。
- **无强制广告**（无弹窗拦截、无自动播放广告）。
- 游戏内金币仅用于展示成绩，**不可兑换真实货币**。

> 备注：广告功能目前为占位状态，尚未接入真实广告 SDK；接入后将遵守 Zalo 广告政策。

---

## 6. 隐私与合规说明

- 应用**不收集**用户的敏感个人信息（不读取位置、通讯录、相机等敏感权限）。
- 仅通过 Zalo 官方登录（`scope.userinfo`）获取**用户 ID 与昵称**，用于游戏内标识与排行。
- 数据存储于服务端数据库，仅用于游戏进度与战绩记录。
- 隐私政策（越南语）将随审核一并提供。

---

## 7. 权限申请清单

| 权限 | 用途 | 是否申请 |
| --- | --- | --- |
| `scope.userinfo`（用户信息） | 登录与身份标识 | ✅ 需要 |
| 推送通知（OA） | 狼人杀回合提醒 | ✅ 需要（可选） |
| 位置 / 通讯录 / 相机 | — | ❌ 不申请 |

---

## 8. 客服与联系方式

如审核过程中有任何疑问，请联系开发者。
