export interface GameInfo {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  emoji: string;
  bg: string;
  blurb: string;
}

export const GAMES: GameInfo[] = [
  {
    id: 'rebirth',
    slug: 'rebirth',
    title: 'TRỌNG SINH',
    subtitle: '重生欠债 • 欠款3亿越南盾',
    emoji: '💸',
    bg: 'bg-rose-200',
    blurb: 'Nợ 300 triệu, 7 ngày để trả!',
  },
  {
    id: 'boss',
    slug: 'boss',
    title: 'TRỐN SẾP',
    subtitle: '躲老板 • 30秒一局',
    emoji: '👔',
    bg: 'bg-amber-200',
    blurb: 'Sếp đến rồi! Trốn nhanh lên!',
  },
  {
    id: 'milktea',
    slug: 'milktea',
    title: 'TIỆM TRÀ SỮA CÔ BA',
    subtitle: '奶茶店 • 目标: 7天赚85万',
    emoji: '🧋',
    bg: 'bg-pink-200',
    blurb: 'Mở tiệm 7 ngày, kiếm 850.000đ.',
  },
  {
    id: 'duck',
    slug: 'duck',
    title: 'VỊT VĂN PHÒNG',
    subtitle: '打工鸭 • 饿肚子',
    emoji: '🦆',
    bg: 'bg-lime-200',
    blurb: 'Cho vịt ăn no, đầy năng lượng!',
  },
  {
    id: 'werewolf',
    slug: 'werewolf',
    title: 'MA SÓI',
    subtitle: '异步狼人杀 • 每轮15分钟',
    emoji: '🐺',
    bg: 'bg-violet-200',
    blurb: 'Ma Sói bất đồng bộ, không cần online cùng lúc.',
  },
];

export const WEEKLY = {
  slug: 'weekly',
  title: 'TỔNG KẾT TUẦN',
  subtitle: '周总结',
  emoji: '📊',
};

// ---------- Coins ----------
export const MAX_COINS_PER_GAME = 1200;
export const AD_REWARD = 50;
export const MAX_ADS_PER_DAY = 10;

/** calcCoins(score) = min(1200, score/10), không âm, làm tròn xuống. */
export function calcCoins(score: number): number {
  return Math.max(0, Math.min(MAX_COINS_PER_GAME, Math.floor(score / 10)));
}

/**
 * Xu theo TIẾN ĐỘ so với mục tiêu (dùng cho game có "mục tiêu tiền" như Game 1).
 * Vì sao cần: calcCoins(score) đạt trần 1200 khi score = 12.000, tức là chỉ cần
 * trả được 12 triệu / 300 triệu nợ là đã max xu — phần còn lại của ván không còn
 * ý nghĩa. Công thức này giữ nguyên thang 0..1200 nhưng trải đều trên cả mục tiêu.
 */
export function calcCoinsByProgress(done: number, target: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(target) || target <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, done / target));
  return Math.round(ratio * MAX_COINS_PER_GAME);
}

export function formatVND(n: number): string {
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}

// ---------- Game 1: Trọng sinh ----------
// Nợ 300 triệu, 7 ngày, mỗi ngày chọn 1 nghề.
// Cân bằng lại (trước đây gần như không thể thắng: 0,17% kể cả khi chơi tối ưu):
//   - lương/ngày phải đủ lớn để 7 ngày có thể chạm 300 triệu
//   - "炒股" là cửa ăn may để đuổi kịp khi thiếu hụt, không phải đường duy nhất
// Kết quả mô phỏng 200.000 ván: chơi ngẫu nhiên ~6%, chọn nghề hợp lý ~34%,
// bán trà sữa đều tay ~12%, all-in chứng khoán ~18%.
export const REBIRTH = { DEBT: 300000000, DAYS: 7 };

export interface Job {
  id: string;
  name: string;
  zh: string;
  emoji: string;
  gain: number;
  failRate: number;
  penalty: number; // số tiền bị trừ khi thất bại (nợ tăng thêm)
}

export const JOBS: Job[] = [
  { id: 'ship', name: 'Giao đồ ăn', zh: '送外卖', emoji: '🛵', gain: 30000000, failRate: 0.08, penalty: 0 },
  { id: 'stall', name: 'Bán trà sữa vỉa hè', zh: '摆摊奶茶', emoji: '🧋', gain: 45000000, failRate: 0.25, penalty: 0 },
  { id: 'stock', name: 'Chơi chứng khoán', zh: '炒股', emoji: '📈', gain: 90000000, failRate: 0.55, penalty: 40000000 },
  { id: 'slack', name: 'Mò cá', zh: '摸鱼', emoji: '🐟', gain: 12000000, failRate: 0, penalty: 0 },
];

// ---------- Game 2: Trốn sếp ----------
export const BOSS = {
  SECONDS: 30,
  DODGE_POINTS: 10,
  CAUGHT_POINTS: -20,
  CAUGHT_LIMIT: 3, // bị bắt >= 3 lần là thua
};

// ---------- Game 3: Tiệm trà sữa ----------
export const MILKTEA = { DAYS: 7, CUSTOMERS_PER_DAY: 6, TARGET: 850000 };

export interface Tea {
  id: string;
  name: string;
  zh: string;
  emoji: string;
  price: number;
  rate: number;
}

export const TEAS: Tea[] = [
  { id: 'classic', name: 'Cổ điển', zh: '经典', emoji: '🧋', price: 25000, rate: 0.8 },
  { id: 'strawberry', name: 'Dâu', zh: '草莓', emoji: '🍓', price: 35000, rate: 0.65 },
  { id: 'choco', name: 'Sô-cô-la', zh: '巧克力', emoji: '🍫', price: 45000, rate: 0.5 },
];

// ---------- Game 4: Vịt văn phòng ----------
export interface Food {
  id: string;
  name: string;
  zh: string;
  emoji: string;
  hunger: number; // âm = giảm đói
  energy: number;
}

export const FOODS: Food[] = [
  { id: 'bread', name: 'Bánh mì', zh: '面包', emoji: '🥖', hunger: -30, energy: 10 },
  { id: 'noodle', name: 'Mì tôm', zh: '面条', emoji: '🍜', hunger: -50, energy: 20 },
  { id: 'coffee', name: 'Cà phê', zh: '咖啡', emoji: '☕', hunger: -10, energy: 40 },
];

export const DUCK = {
  START_HUNGER: 80,
  START_ENERGY: 20,
  FED_HUNGER_MAX: 30, // đói <= 30 và năng lượng > 80 là thắng
  WIN_ENERGY_MIN: 80,
  TICK_MS: 3000,
  TICK_HUNGER: 2,
  TICK_ENERGY: 1,
};
