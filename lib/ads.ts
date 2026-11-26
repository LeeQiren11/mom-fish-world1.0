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

/** Ứng dụng có chạy trong Zalo Mini App không (có window.zalo / zmp bridge). */
function inZaloMiniApp(): boolean {
  if (!isBrowser()) return false;
  // Zalo Mini App chạy trong webview có window.zalo hoặc ZMA bridge.
  const w = window as unknown as Record<string, unknown>;
  return typeof w.zalo === 'object' || typeof (w as { ZMA?: unknown }).ZMA === 'object';
}

/**
 * Import zmp-sdk/apis an toàn: trả null nếu không phải Zalo Mini App
 * hoặc phiên bản không có API quảng cáo.
 */
async function zmpAds(): Promise<{
  setupAd: () => Promise<void>;
  loadAd: (args: { ids: string | string[]; config?: { display?: boolean; onClose?: () => void } }) => Promise<void>;
  displayAd: (args: { id: string }) => Promise<void>;
  refreshAd: (args: { id?: string }) => Promise<void>;
} | null> {
  if (!inZaloMiniApp()) return null;
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
  const ads = await zmpAds();
  if (!ads) {
    // Fallback mock: mô phỏng xem quảng cáo (~1.5s) rồi hoàn thành.
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
          display: true,
          // onClose nhận reward token => xem xong
          onClose: () => finish({ completed: true }),
        },
      })
      .then(() => ads.displayAd({ id: 'ZMA_Reward' }))
      .catch(() => {
        // load/display lỗi => thử mock fallback để không chặn người chơi
        sleep(1200).then(() => finish({ completed: true, reason: 'error' }));
      });
  });
}

/**
 * Xem quảng cáo toàn màn hình (interstitial / fullscreen) — dùng cho mở app
 * hoặc chuyển trang. Không có thưởng.
 */
export async function showFullscreenAd(timeoutMs = 15000): Promise<AdResult> {
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
      .catch(() => sleep(800).then(() => finish({ completed: true, reason: 'error' })));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
