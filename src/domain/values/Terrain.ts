/** 地形の高さ場。足元の高さ h(x,z) を返す */
export interface HeightField {
  heightAt(x: number, z: number): number;
  /**
   * 任意: 現在の足元高さ currentY を考慮して、立つべき床面の高さを返す(多層床用)。
   * 例: 2階建ての家では、ロフト下の1階(currentY≈0)とロフト(currentY≈H)を区別する。
   * 未実装の高さ場は heightAt と同じ単層として扱う。
   */
  floorAt?(x: number, z: number, currentY: number): number;
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

/** 崖(メサ: 平らな頂上 + 急斜面の側面)の配置・寸法 */
export interface CliffSpec {
  /** 頂上の中心(XZ) */
  x: number;
  z: number;
  /** 頂上の半幅・半奥行 [m] */
  halfWidth: number;
  halfDepth: number;
  /** 頂上の高さ [m] */
  height: number;
  /** 頂上の縁から地面へ降りる斜面の水平距離 [m](小さいほど急=よじ登り向き) */
  slopeRun: number;
}

/**
 * 既存の高さ場に「崖(メサ)」を重ねる高さ場。
 * 頂上の矩形内は height、縁から slopeRun の範囲は height→0 へ線形に降りる急斜面、
 * それ以外は元の地形。`heightAt = max(元の地形, 各メサの高さ)`。
 * 単層(floorAt なし)なので、急斜面は MovementService のレート制限で「よじ登り」になる。
 */
export class CliffField implements HeightField {
  constructor(
    /** 崖を含まない元の地形(地面メッシュ描画はこちらを使うと崖と二重に描かない) */
    public readonly base: HeightField,
    private readonly cliffs: readonly CliffSpec[],
  ) {}

  private mesaHeight(c: CliffSpec, x: number, z: number): number {
    const dx = Math.abs(x - c.x) - c.halfWidth;
    const dz = Math.abs(z - c.z) - c.halfDepth;
    const d = Math.max(dx, dz, 0); // 頂上矩形からのはみ出し量
    if (d <= 0) return c.height; // 頂上
    if (d >= c.slopeRun) return 0; // 斜面の外
    return c.height * (1 - d / c.slopeRun); // 斜面(線形)
  }

  heightAt(x: number, z: number): number {
    let h = this.base.heightAt(x, z);
    for (const c of this.cliffs) h = Math.max(h, this.mesaHeight(c, x, z));
    return h;
  }
}

/** 2階建ての家(室内)の床高さ設定 */
export interface TwoFloorConfig {
  /** 2階(ロフト)の床面の高さ [m] */
  floorHeight: number;
  /** これ以上(z >= loftFrontZ)はロフト(2階) */
  loftFrontZ: number;
  /** 階段レーンの x 下限(x >= stairXMin が階段) */
  stairXMin: number;
  /** 階段の傾斜が始まる z(下端, h=0) */
  stairZBottom: number;
  /** 階段の傾斜が終わる z(上端, h=floorHeight)。通常 loftFrontZ と一致 */
  stairZTop: number;
}

/** 1フレームで登れる段差の上限 [m](これ以下なら床面として上がれる) */
export const TWO_FLOOR_STEP_UP = 0.6;

/**
 * 2階建ての家の床高さ場(多層)。各 (x,z) で複数の床面を持つ:
 * - 1階(h=0): 常に存在(ロフトの下にも床がある)
 * - 階段(x >= stairXMin かつ stairZBottom <= z < stairZTop): z に沿って 0→floorHeight に傾斜
 * - ロフト(z >= loftFrontZ): h=floorHeight
 *
 * `floorAt` は現在の足元高さ currentY を見て、currentY+STEP_UP 以下で最も高い床面を返す。
 * これにより 1階(currentY≈0)ではロフト下を歩け、階段でだけ徐々に上がってロフトに乗れる。
 * `heightAt`(配置・NPC初期化用)は最も高い床面を返す。
 */
export class TwoFloorField implements HeightField {
  constructor(private readonly c: TwoFloorConfig) {}

  /** (x,z) に存在する床面の高さ一覧(常に1階0を含む) */
  private surfacesAt(x: number, z: number): number[] {
    const c = this.c;
    const surfaces = [0]; // 1階(ロフト下にも床がある)
    if (x >= c.stairXMin && z >= c.stairZBottom && z < c.stairZTop) {
      const run = c.stairZTop - c.stairZBottom;
      const t = run > 0 ? (z - c.stairZBottom) / run : 1; // 0(下端)→1(上端)
      surfaces.push(t * c.floorHeight); // 階段ランプ
    }
    if (z >= c.loftFrontZ) surfaces.push(c.floorHeight); // ロフト(2階)
    return surfaces;
  }

  heightAt(x: number, z: number): number {
    return Math.max(...this.surfacesAt(x, z));
  }

  floorAt(x: number, z: number, currentY: number): number {
    const surfaces = this.surfacesAt(x, z);
    let best = -Infinity;
    for (const s of surfaces) {
      if (s <= currentY + TWO_FLOOR_STEP_UP && s > best) best = s; // 登れる範囲で最も高い面
    }
    // どの面にも届かない(上がれない)場合は最も低い面へ = 落下対象
    return best === -Infinity ? Math.min(...surfaces) : best;
  }
}
