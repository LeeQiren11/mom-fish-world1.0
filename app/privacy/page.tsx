import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chính sách bảo mật • 隐私政策',
  description: 'Chính sách bảo mật của Mõm Fish World',
};

export default function PrivacyPage() {
  return (
    <main className="space-y-4 p-4 pb-8 text-slate-700">
      <header className="rounded-3xl bg-white p-4 shadow-lg">
        <h1 className="text-xl font-black leading-tight text-sky-600">
          CHÍNH SÁCH BẢO MẬT
        </h1>
        <p className="mt-1 text-xs font-bold text-slate-400">
          Chính sách bảo mật • 隐私政策
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Cập nhật lần cuối: 26/11/2026
        </p>
      </header>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">1. Giới thiệu</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Chào mừng bạn đến với <strong>Mõm Fish World</strong> (「摸鱼世界」). Chúng tôi tôn trọng quyền
          riêng tư của bạn và cam kết bảo vệ thông tin cá nhân của bạn theo quy định của pháp luật Việt Nam,
          bao gồm Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">2. Thông tin chúng tôi thu thập</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Khi bạn sử dụng ứng dụng, chúng tôi chỉ thu thập những thông tin tối thiểu cần thiết:
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          <li>• <strong>Mã định danh người dùng Zalo (User ID)</strong> — dùng để phân biệt người chơi.</li>
          <li>• <strong>Tên hiển thị (nickname)</strong> — dùng để hiển thị trong trò chơi.</li>
          <li>• <strong>Dữ liệu trò chơi</strong> — điểm số, xu (coin), thành tích để lưu tiến trình chơi.</li>
        </ul>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">3. Chúng tôi KHÔNG thu thập</h2>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          <li>• Vị trí chính xác của bạn (GPS).</li>
          <li>• Danh bạ, tin nhắn, ảnh hoặc camera.</li>
          <li>• Thông tin thanh toán hoặc tài khoản ngân hàng.</li>
        </ul>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">4. Mục đích sử dụng thông tin</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Thông tin được sử dụng duy nhất cho mục đích:
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          <li>• Lưu tiến trình và thành tích trò chơi của bạn.</li>
          <li>• Hiển thị bảng xếp hạng và tổng kết tuần.</li>
          <li>• Gửi nhắc nhở lượt chơi (chỉ khi bạn tham gia trò chơi Ma Sói).</li>
        </ul>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">5. Quảng cáo</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Ứng dụng <strong>hoàn toàn miễn phí</strong> và chỉ chứa quảng cáo tích hợp sẵn (quảng cáo xem để
          nhận thưởng). Quảng cáo được cung cấp bởi bên thứ ba, có thể sử dụng mã định danh quảng cáo để
          hiển thị nội dung phù hợp. Bạn có thể bỏ qua quảng cáo và vẫn sử dụng đầy đủ trò chơi.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">6. Lưu trữ và bảo mật dữ liệu</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Dữ liệu được lưu trữ trên máy chủ an toàn và chỉ được truy cập qua kênh mã hóa. Chúng tôi áp dụng
          các biện pháp kỹ thuật hợp lý để bảo vệ dữ liệu khỏi truy cập trái phép, mất mát hoặc lạm dụng.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">7. Quyền của bạn</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Bạn có quyền yêu cầu truy cập, chỉnh sửa hoặc xóa dữ liệu cá nhân của mình bất cứ lúc nào bằng
          cách liên hệ với chúng tôi qua kênh hỗ trợ trong ứng dụng.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">8. Trẻ em</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Ứng dụng không hướng đến trẻ em dưới 13 tuổi. Nếu chúng tôi phát hiện đã thu thập thông tin của
          trẻ em dưới 13 tuổi, chúng tôi sẽ xóa thông tin đó ngay lập tức.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">9. Thay đổi chính sách</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Chúng tôi có thể cập nhật chính sách này theo thời gian. Khi có thay đổi quan trọng, chúng tôi sẽ
          thông báo trong ứng dụng.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-lg">
        <h2 className="text-base font-black text-slate-800">10. Liên hệ</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Nếu bạn có bất kỳ câu hỏi nào về chính sách bảo mật, vui lòng liên hệ với chúng tôi qua kênh hỗ
          trợ trong ứng dụng hoặc qua Zalo Official Account của chúng tôi.
        </p>
      </section>

      <footer className="rounded-3xl bg-white p-4 text-center text-xs font-bold text-slate-400 shadow-lg">
        Mõm Fish World • 摸鱼世界 — Chơi vui, không lo phí!
      </footer>
    </main>
  );
}
