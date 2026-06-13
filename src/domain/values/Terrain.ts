/** 地形の高さ場。足元の高さ h(x,z) を返す */
export interface HeightField {
  heightAt(x: number, z: number): number;
}

/** 平坦な地形(高さ常に0) */
export const FLAT_TERRAIN: HeightField = {
  heightAt: () => 0,
};

/** この円内では地形を滑らかに高さ0へ減衰させる(ポータル・スポーン用) */
export interface FlatSpot {
  x: number;
  z: number;
  radius: number;
  /**
   * 内側の完全平坦域の半径 [m](省略時0)。
   * `d <= flatRadius` では高さ0、`flatRadius < d < radius` で元の起伏へ滑らかに復帰する。
   * 家など占有面積を持つ構造物の足元を確実に平らにするために使う。
   */
  flatRadius?: number;
}

/**
 * なだらかな丘の地形。正弦波の重ね合わせ(決定的・連続)で生成し、
 * 平坦化スポットの中心に近づくほど滑らかに高さ0へ減衰する。
 */
export class HillyTerrain implements HeightField {
  constructor(
    /** 起伏の振幅 [m](最大でおよそ ±amplitude) */
    private readonly amplitude: number,
    private readonly flatSpots: readonly FlatSpot[] = [],
  ) {}

  heightAt(x: number, z: number): number {
    // [-1, 1] 程度に正規化された波の重ね合わせ
    const wave =
      0.6 * Math.sin(x * 0.22) * Math.cos(z * 0.19) +
      0.4 * Math.sin((x + z) * 0.11);
    let h = wave * this.amplitude;

    for (const spot of this.flatSpots) {
      const d = Math.hypot(x - spot.x, z - spot.z);
      if (d >= spot.radius) continue;
      const inner = spot.flatRadius ?? 0;
      if (d <= inner) {
        h = 0; // 内側プラトーは完全に平坦
        continue;
      }
      const t = (inner < spot.radius)
        ? (d - inner) / (spot.radius - inner) // 内縁0 → 外縁1
        : 1;
      h *= t * t * (3 - 2 * t); // smoothstep で滑らかに元の起伏へ
    }
    return h;
  }
}
