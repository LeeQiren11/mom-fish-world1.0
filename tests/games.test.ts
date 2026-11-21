/**
 * Test nhỏ cho phần thưởng xu — bảo vệ quyết định của P0-2 (Game 1).
 * Chạy cùng `npm test`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JOBS, MAX_COINS_PER_GAME, REBIRTH, calcCoins, calcCoinsByProgress } from '../lib/games';

describe('calcCoins', () => {
  it('không âm, chia 10, trần 1200', () => {
    assert.equal(calcCoins(0), 0);
    assert.equal(calcCoins(-500), 0);
    assert.equal(calcCoins(8500), 850);
    assert.equal(calcCoins(999999), MAX_COINS_PER_GAME);
  });
});

describe('calcCoinsByProgress (Game 1)', () => {
  it('trải đều 0..1200 theo tiến độ trả nợ', () => {
    assert.equal(calcCoinsByProgress(0, REBIRTH.DEBT), 0);
    assert.equal(calcCoinsByProgress(REBIRTH.DEBT / 2, REBIRTH.DEBT), 600);
    assert.equal(calcCoinsByProgress(REBIRTH.DEBT, REBIRTH.DEBT), MAX_COINS_PER_GAME);
  });

  it('vượt mục tiêu vẫn cap 1200; nợ tăng thêm thì 0 (không âm)', () => {
    assert.equal(calcCoinsByProgress(REBIRTH.DEBT * 2, REBIRTH.DEBT), MAX_COINS_PER_GAME);
    assert.equal(calcCoinsByProgress(-40_000_000, REBIRTH.DEBT), 0);
  });

  it('trả 12 triệu (4% nợ) chỉ được ~48 xu, không phải 1200 như công thức cũ', () => {
    assert.equal(calcCoinsByProgress(12_000_000, REBIRTH.DEBT), 48);
    assert.equal(calcCoins(12_000_000 / 10), MAX_COINS_PER_GAME, 'công thức cũ đúng là bị cap ngay tại đây');
  });
});

describe('Bảng nghề Game 1', () => {
  it('7 ngày làm nghề an toàn nhất vẫn không đủ 3 亿 (đúng ý đồ: đi làm không trả nổi nợ)', () => {
    const safe = JOBS.find((j) => j.id === 'ship')!;
    assert.ok(safe.gain * REBIRTH.DAYS < REBIRTH.DEBT);
  });

  it('nghề rủi ro cao nhất có thể trả hết nợ trong 7 ngày nếu may mắn', () => {
    const risky = JOBS.find((j) => j.id === 'stock')!;
    assert.ok(risky.gain * REBIRTH.DAYS > REBIRTH.DEBT);
  });

  it('nghề ổn định (bán trà sữa) đủ để chạm mục tiêu khi không trượt lần nào', () => {
    const stall = JOBS.find((j) => j.id === 'stall')!;
    assert.ok(stall.gain * REBIRTH.DAYS >= REBIRTH.DEBT);
  });
});
