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
      const t = d / spot.radius; // 0(中心)→1(縁)
      h *= t * t * (3 - 2 * t); // smoothstep で滑らかに 0 へ
    }
    return h;
  }
}
