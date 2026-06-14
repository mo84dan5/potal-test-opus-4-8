import { describe, expect, it } from 'vitest';
import { CliffField, FLAT_TERRAIN, HillyTerrain, TwoFloorField } from './Terrain';

describe('Terrain', () => {
  it('FLAT_TERRAIN は常に高さ0', () => {
    expect(FLAT_TERRAIN.heightAt(0, 0)).toBe(0);
    expect(FLAT_TERRAIN.heightAt(12.3, -45.6)).toBe(0);
  });

  it('HillyTerrain は決定的(同じ座標は常に同じ高さ)で振幅内に収まる', () => {
    const t = new HillyTerrain(0.8);
    const h1 = t.heightAt(7.5, -3.2);
    const h2 = t.heightAt(7.5, -3.2);
    expect(h1).toBe(h2);
    for (const [x, z] of [[0, 0], [10, 5], [-15, 20], [25, -25]] as const) {
      expect(Math.abs(t.heightAt(x, z))).toBeLessThanOrEqual(0.8 + 1e-9);
    }
  });

  it('起伏が存在する(どこかで高さが0でない)', () => {
    const t = new HillyTerrain(0.8);
    expect(Math.abs(t.heightAt(7, 11))).toBeGreaterThan(0.05);
  });

  it('平坦化スポットの中心では高さ0、縁の外では影響しない', () => {
    const bumpy = new HillyTerrain(1.0);
    const t = new HillyTerrain(1.0, [{ x: 7, z: 11, radius: 5 }]);
    expect(t.heightAt(7, 11)).toBeCloseTo(0); // 中心は完全に平坦
    expect(Math.abs(t.heightAt(8, 11))).toBeLessThan(Math.abs(bumpy.heightAt(8, 11))); // 内側は減衰
    expect(t.heightAt(20, 11)).toBeCloseTo(bumpy.heightAt(20, 11)); // 外側は元のまま
  });

  it('平坦化スポットの境界で連続(縁の内外で高さが滑らかに繋がる)', () => {
    const t = new HillyTerrain(1.0, [{ x: 0, z: 0, radius: 5 }]);
    const inner = t.heightAt(4.999, 0);
    const outer = t.heightAt(5.001, 0);
    expect(Math.abs(inner - outer)).toBeLessThan(0.01);
  });

  it('flatRadius 内は完全に平坦(プラトー)', () => {
    const t = new HillyTerrain(1.0, [
      { x: 7, z: 11, radius: 8, flatRadius: 4 },
    ]);
    // 中心〜プラトー内縁まではどこでも高さ0
    for (const [dx, dz] of [[0, 0], [3, 0], [0, -3.5], [2.5, 2.5], [3.99, 0]] as const) {
      expect(t.heightAt(7 + dx, 11 + dz)).toBeCloseTo(0);
    }
  });

  it('flatRadius の外側〜radius は smoothstep で起伏へ復帰し、radius 外は元のまま', () => {
    const bumpy = new HillyTerrain(1.0);
    const t = new HillyTerrain(1.0, [
      { x: 0, z: 0, radius: 8, flatRadius: 4 },
    ]);
    // プラトー外縁直後はまだほぼ平坦
    expect(Math.abs(t.heightAt(4.1, 0))).toBeLessThan(Math.abs(bumpy.heightAt(4.1, 0)));
    // radius の外は元の地形と一致
    expect(t.heightAt(12, 0)).toBeCloseTo(bumpy.heightAt(12, 0));
  });

  it('flatRadius のプラトー外縁で連続', () => {
    const t = new HillyTerrain(1.0, [{ x: 0, z: 0, radius: 8, flatRadius: 4 }]);
    const inside = t.heightAt(3.999, 0);
    const justOutside = t.heightAt(4.001, 0);
    expect(Math.abs(inside - justOutside)).toBeLessThan(0.01);
  });
});

describe('TwoFloorField(2階建ての家の床高さ)', () => {
  const c = {
    floorHeight: 3.0,
    loftFrontZ: 0,
    stairXMin: 3.5,
    stairZBottom: -4,
    stairZTop: 0,
  };
  const f = new TwoFloorField(c);

  it('1階(階段・ロフト以外)は高さ0', () => {
    expect(f.heightAt(0, -5)).toBe(0); // 玄関側
    expect(f.heightAt(-3, -2)).toBe(0); // 左前(階段レーン外)
    expect(f.heightAt(0, -1)).toBe(0); // 中央前(x<stairXMin)
  });

  it('ロフト(z>=loftFrontZ)は高さ floorHeight', () => {
    expect(f.heightAt(0, 0)).toBe(3.0);
    expect(f.heightAt(-6, 6)).toBe(3.0);
    expect(f.heightAt(6, 3)).toBe(3.0);
  });

  it('階段レーンは z に沿って 0→floorHeight に単調増加し、上下端で連続', () => {
    expect(f.heightAt(5, -4)).toBeCloseTo(0); // 下端=1階と連続
    expect(f.heightAt(5, -2)).toBeCloseTo(1.5); // 中間
    const justBelowTop = f.heightAt(5, -0.001);
    expect(justBelowTop).toBeGreaterThan(2.9);
    expect(f.heightAt(5, 0)).toBe(3.0); // 上端=ロフトと連続
    // 単調増加
    expect(f.heightAt(5, -1)).toBeGreaterThan(f.heightAt(5, -3));
  });

  it('階段レーン外(x<stairXMin)の前方は1階のまま', () => {
    expect(f.heightAt(0, -2)).toBe(0);
    expect(f.heightAt(3.49, -2)).toBe(0);
    expect(f.heightAt(3.5, -2)).toBeGreaterThan(0); // 階段レーンに入ると上がる
  });

  it('floorAt: ロフト領域でも1階(currentY≈0)なら床は0=ロフト下に立てる', () => {
    // ロフトの真下: heightAt は 3 を返すが、足元が1階なら 0 に留まる
    expect(f.heightAt(-3, 4)).toBe(3.0);
    expect(f.floorAt(-3, 4, 0)).toBe(0); // 1階としてロフト下にいる
    expect(f.floorAt(-3, 4, 0.3)).toBe(0);
  });

  it('floorAt: ロフトの高さ付近(currentY≈H)ならロフト(H)に立つ', () => {
    expect(f.floorAt(-3, 4, 3.0)).toBe(3.0);
    expect(f.floorAt(0, 2, 2.8)).toBe(3.0); // 段差越え範囲内なので上がる
  });

  it('floorAt: 階段は currentY に沿って1段ずつ上がれる(大ジャンプはできない)', () => {
    // 階段下端から登り始め、各段は STEP_UP 以内
    expect(f.floorAt(5, -4, 0)).toBeCloseTo(0);
    // 中腹(stair=1.5)に1階(currentY=0)からは一気に上がれない → 0 のまま(下をくぐる)
    expect(f.floorAt(5, -2, 0)).toBe(0);
    // 中腹の高さにいれば階段面に乗る
    expect(f.floorAt(5, -2, 1.5)).toBeCloseTo(1.5);
  });
});

describe('CliffField(崖=メサ)', () => {
  const cliff = { x: 0, z: 0, halfWidth: 2, halfDepth: 2, height: 4, slopeRun: 1.5 };
  const f = new CliffField(FLAT_TERRAIN, [cliff]);

  it('頂上の矩形内は height', () => {
    expect(f.heightAt(0, 0)).toBe(4);
    expect(f.heightAt(1.9, -1.9)).toBe(4);
  });

  it('縁から slopeRun の斜面は height→0 へ線形に降りる', () => {
    expect(f.heightAt(2.75, 0)).toBeCloseTo(2); // はみ出し0.75 / 1.5 → 50%
    expect(f.heightAt(3.49, 0)).toBeGreaterThan(0);
  });

  it('斜面の外は元の地形(ここでは0)', () => {
    expect(f.heightAt(3.5, 0)).toBe(0); // はみ出し1.5 = slopeRun → 外
    expect(f.heightAt(10, 10)).toBe(0);
  });

  it('元の地形と崖の高い方を採用する', () => {
    const hilly = new CliffField(
      { heightAt: () => 1 }, // 一様に高さ1の地形
      [cliff],
    );
    expect(hilly.heightAt(0, 0)).toBe(4); // 崖の方が高い
    expect(hilly.heightAt(10, 10)).toBe(1); // 崖の外は地形
  });
});
