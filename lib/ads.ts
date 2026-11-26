'use client';

/**
 * Quản lý quảng cáo Zalo Mini App (rewarded / interstitial).
 *
 * Zalo Mini App dùng "ad widget" qua zmp-sdk/apis:
 *   - setupAd(): khởi tạo quảng cáo (gọi 1 lần khi app khởi động).
 *   - loadAd({ ids: ["ZMA_Reward"], config: { display, onClose } }): tải quảng cáo.
 *   - displayAd({ id }): hiển thị quảng cáo đã tải.
 *   - refreshAd({ id }): xóa quảng cáo phiên hiện tại.
 *
 * Các loại ad: ZMA_Masthead(480x270), ZMA_Middle(300x250), ZMA_Fullscreen(full),
 *              ZMA_Reward(full, có thưởng), ZMA_Bottom(tùy chỉnh).
 *
 * Quan trọng: tính năng ad của Zalo đang ở giai đoạn thử nghiệm, chỉ mở cho
 * một số đối tác. Ở môi trường không hỗ trợ (trình duyệt thường / chưa được
 * cấp quyền), ta fallback về một "ad giả" (mock) để luồng chơi vẫn chạy và
 * người dùng vẫn nhận thưởng như thiết kế — KHÔNG chặn người chơi.
 */

export type AdType = 'reward' | 'fullscreen' | 'masthead';

export interface AdResult {
  /** Đã xem hết / nhận thưởng thành công. */
  completed: boolean;
  /** Lý do nếu không hoàn thành (dùng để log / debug). */
  reason?: 'not_supported' | 'cancelled' | 'error' | 'timeout';
}

const isBrowser = () => typeof window !== 'undefined';

/**
 * Kiểm tra có đang chạy trong môi trường Zalo Mini App không.
 * Zalo Mini App dùng `window.zalo` làm bridge chính (do zmp-sdk inject),
 * nhưng một số phiên bản dùng tên khác. Ta kiểm tra nhiều dấu hiệu để không
 * bỏ sót môi trường thật — sai sót ở đây sẽ khiến app luôn rơi về "ad giả".
 */
function inZaloMiniApp(): boolean {
  if (!isBrowser()) return false;
  const w = window as unknown as Record<string, unknown>;
  const w2 = window as unknown as { zalo?: unknown; ZMA?: unknown; zma?: unknown };
  // Dấu hiệu bridge: window.zalo, window.ZMA, window.zma, hoặc query đặc trưng của Zalo.
  if (typeof w2.zalo === 'object' && w2.zalo !== null) return true;
  if (typeof w2.ZMA === 'object' && w2.ZMA !== null) return true;
  if (typeof w2.zma === 'object' && w2.zma !== null) return true;
  // Zalo Mini App webview thường mang query zalo=true / zmp=true hoặc host *.zdn.vn / *.zaloapp.com.
  const loc = w.location as { host?: string; search?: string } | undefined;
  const host = (loc && loc.host) || '';
  if (/(zdn\.vn|zaloapp\.com|zaloweb\.me|zalo\.me)$/i.test(host)) return true;
  const query = (loc && loc.search) || '';
  if (/[?&](zalo|zmp|appId)=/i.test(query)) return true;
  return false;
}

/**
 * Import zmp-sdk/apis an toàn: trả null nếu SDK thiếu API quảng cáo.
 * (Không còn phụ thuộc inZaloMiniApp() để quyết định có import không —
 *  ta luôn thử import, rồi dùng inZaloMiniApp() ở tầng gọi để fallback.)
 */
async function zmpAds(): Promise<{
  setupAd: () => Promise<void>;
  loadAd: (args: { ids: string | string[]; config?: { display?: boolean; onClose?: () => void } }) => Promise<void>;
  displayAd: (args: { id: string }) => Promise<void>;
  refreshAd: (args: { id?: string }) => Promise<void>;
} | null> {
  try {
    const apis = await import('zmp-sdk/apis');
    if (apis && typeof apis.loadAd === 'function' && typeof apis.displayAd === 'function') {
      return apis as unknown as {
        setupAd: () => Promise<void>;
        loadAd: (args: { ids: string | string[]; config?: { display?: boolean; onClose?: () => void } }) => Promise<void>;
        displayAd: (args: { id: string }) => Promise<void>;
        refreshAd: (args: { id?: string }) => Promise<void>;
      };
    }
  } catch {
    /* SDK thiếu API quảng cáo */
  }
  return null;
}

/** Khởi tạo quảng cáo (gọi 1 lần khi app mount). An toàn khi không hỗ trợ. */
export async function setupAds(): Promise<void> {
  const ads = await zmpAds();
  if (!ads || typeof ads.setupAd !== 'function') return;
  try {
    await ads.setupAd();
  } catch {
    /* không hỗ trợ thì bỏ qua */
  }
}

/**
 * Xem một quảng cáo có thưởng (rewarded). Trả về true nếu xem xong và nhận thưởng.
 * - Trong Zalo: load ZMA_Reward rồi displayAd, chờ onClose trả reward token.
 * - Ngoài Zalo (fallback): chờ 1 khoảng ngắn rồi coi như "xem xong" (mock),
 *   để luồng chơi không bị kẹt khi dev/test trên trình duyệt.
 */
export async function showRewardedAd(timeoutMs = 20000): Promise<AdResult> {
  // Không chạy trong Zalo Mini App => fallback mock (mô phỏng xem xong).
  if (!inZaloMiniApp()) {
    await sleep(1500);
    return { completed: true, reason: 'not_supported' };
  }

  const ads = await zmpAds();
  if (!ads) {
    // SDK không có API quảng cáo => fallback mock để không chặn người chơi.
    await sleep(1500);
    return { completed: true, reason: 'not_supported' };
  }

  return new Promise<AdResult>((resolve) => {
    let settled = false;
    const finish = (r: AdResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };

    const timer = setTimeout(() => finish({ completed: false, reason: 'timeout' }), timeoutMs);

    ads
      .loadAd({
        ids: ['ZMA_Reward'],
        config: {
          display: false,
          // onClose nhận reward token => xem xong. Chỉ kích hoạt khi ad đã display.
          onClose: () => finish({ completed: true }),
        },
      })
      .then(() => ads.displayAd({ id: 'ZMA_Reward' }))
      .catch(() => {
        // load/display lỗi => KHÔNG tự mock thưởng khi đang ở môi trường Zalo thật,
        // để tránh phát thưởng khi chưa xem quảng cáo. Trả về cancelled.
        finish({ completed: false, reason: 'error' });
      });
  });
}

/**
 * Xem quảng cáo toàn màn hình (interstitial / fullscreen) — dùng cho mở app
 * hoặc chuyển trang. Không có thưởng.
 */
export async function showFullscreenAd(timeoutMs = 15000): Promise<AdResult> {
  // Không chạy trong Zalo Mini App => fallback mock.
  if (!inZaloMiniApp()) {
    await sleep(1000);
    return { completed: true, reason: 'not_supported' };
  }

  const ads = await zmpAds();
  if (!ads) {
    await sleep(1000);
    return { completed: true, reason: 'not_supported' };
  }

  return new Promise<AdResult>((resolve) => {
    let settled = false;
    const finish = (r: AdResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => finish({ completed: false, reason: 'timeout' }), timeoutMs);

    ads
      .loadAd({ ids: ['ZMA_Fullscreen'], config: { display: true } })
      .then(() => ads.displayAd({ id: 'ZMA_Fullscreen' }))
      .then(() => finish({ completed: true }))
      .catch(() => finish({ completed: false, reason: 'error' }));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
