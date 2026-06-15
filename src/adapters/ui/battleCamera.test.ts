import { describe, expect, it } from 'vitest';
import { computeBattleCamera, DEFAULT_BATTLE_CAMERA } from './battleCamera';

describe('computeBattleCamera', () => {
  it('注視点は両者の中点(高さ targetY)', () => {
    const pose = computeBattleCamera(0, 2.2, 0, -2.2);
    expect(pose.tx).toBe(0);
    expect(pose.tz).toBe(0);
    expect(pose.ty).toBe(DEFAULT_BATTLE_CAMERA.targetY);
  });

  it('位置は高さ・背面距離が設定どおりで、X は中点へ followX 追従', () => {
    const pose = computeBattleCamera(4, 0, 0, 0); // 中点X=2
    expect(pose.py).toBe(DEFAULT_BATTLE_CAMERA.height);
    expect(pose.pz).toBe(DEFAULT_BATTLE_CAMERA.back);
    expect(pose.px).toBeCloseTo(2 * DEFAULT_BATTLE_CAMERA.followX);
    expect(pose.tx).toBe(2);
  });

  it('俯瞰: カメラは注視点より高く(py>ty)・背面に引く(pz>tz)', () => {
    const pose = computeBattleCamera(0, 2.2, 0, -2.2);
    expect(pose.py).toBeGreaterThan(pose.ty);
    expect(pose.pz).toBeGreaterThan(pose.tz);
  });

  it('設定を渡せば距離・高さを変えられる(ステージ紐づけの調整)', () => {
    const cfg = { height: 12, back: 16, followX: 0, targetY: 1 };
    const pose = computeBattleCamera(5, 0, -5, 0, cfg);
    expect(pose.py).toBe(12);
    expect(pose.pz).toBe(16);
    expect(pose.px).toBe(0); // followX=0 ならステージ中央に固定
    expect(pose.tx).toBe(0); // 中点
  });
});
