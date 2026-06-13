import { Vec3 } from '../values/Vec3';
import { Interactable } from './Interactable';

/**
 * ぶらぶら歩き回る案内人NPC。「動くInteractable」として
 * 吹き出し・タップ会話の機構(FN-005)にそのまま乗る。
 * position の y は吹き出しアンカー高さで固定し、足元は y=0 とみなす。
 */
export class Npc extends Interactable {
  /** 向いている方位(プレイヤーと同じ規約: yaw=0 で -Z) */
  public yaw = 0;
  /** 立ち止まりの残り時間 [s] */
  public pauseTimer = 0;
  /** 現在の目的地(XZ) */
  public targetX: number;
  public targetZ: number;
  /** 決定的な徘徊のためのシード付き擬似乱数 */
  public readonly rand: () => number;
  /** プレイヤーとの当たり判定(徘徊更新で position に追従させる) */
  public readonly collider: { position: Vec3; radius: number };

  constructor(
    id: string,
    name: string,
    /** スポーン足元座標(y=0) */
    spawn: Vec3,
    /** 吹き出しアンカー高さ [m] */
    public readonly anchorY: number,
    bubbleText: string | null,
    dialogue: readonly string[],
    /** 徘徊の中心(足元) */
    public readonly wanderCenter: Vec3,
    /** 徘徊半径 [m] */
    public readonly wanderRadius: number,
    seed = 1,
  ) {
    super(id, name, spawn.withY(anchorY), bubbleText, dialogue);
    this.targetX = spawn.x;
    this.targetZ = spawn.z;
    this.rand = createSeededRandom(seed);
    this.collider = { position: spawn.withY(0), radius: 0.45 };
  }

  /** 足元の地形高さ */
  public groundY = 0;

  /** 足元座標(y=地形の高さ) */
  get feet(): Vec3 {
    return new Vec3(this.position.x, this.groundY, this.position.z);
  }

  /** 足元座標を更新する(吹き出しアンカーとコライダーも追従) */
  moveTo(x: number, z: number, groundY = 0): void {
    this.groundY = groundY;
    this.position = new Vec3(x, groundY + this.anchorY, z);
    this.collider.position = new Vec3(x, 0, z);
  }
}

/** 線形合同法の擬似乱数(リロードしても同じ徘徊経路になる) */
function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
