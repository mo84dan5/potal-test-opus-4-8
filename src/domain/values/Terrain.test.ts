import { describe, expect, it } from 'vitest';
import { FLAT_TERRAIN, HillyTerrain } from './Terrain';

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
});
