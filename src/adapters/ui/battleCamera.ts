/**
 * 戦闘カメラの画角計算(純粋関数)。three.js/DOM に依存せず数値だけ返すので単体テスト可能。
 * 既存の三人称カメラ(cameraView.ts)に倣う。アダプタは結果を three.js カメラへ適用するだけ。
 *
 * 方針: カメラは**ステージ(アリーナ)に紐づけ**た俯瞰。
 * 位置はアリーナ背面(+Z)の高所に固定し、X だけ両者の中点へ部分追従、注視点は両者の中点。
 * プレイヤーの向きで回り込まないため、間合い・位置関係が俯瞰しやすく安定する。
 */
export interface BattleCameraConfig {
  /** カメラ高さ [m](大きいほど俯瞰) */
  readonly height: number;
  /** ステージ背面(+Z)へどれだけ引くか [m](大きいほど遠景) */
  readonly back: number;
  /** カメラXの中点追従率(0=ステージ中央固定 / 1=中点に完全追従) */
  readonly followX: number;
  /** 注視点の高さ [m] */
  readonly targetY: number;
}

/** 既定の俯瞰カメラ設定(キャラから離してステージ全体を見下ろす) */
export const DEFAULT_BATTLE_CAMERA: BattleCameraConfig = {
  height: 8.5,
  back: 10.5,
  followX: 0.5,
  targetY: 0.8,
};

/** カメラの位置と注視点(数値のみ) */
export interface BattleCameraPose {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
}

/**
 * 2者の位置から俯瞰カメラの位置・注視点を求める。
 * 位置: (中点X*followX, height, back) … Z と高さはステージ固定、X だけ部分追従。
 * 注視点: 両者の中点(高さ targetY)。
 */
export function computeBattleCamera(
  playerX: number,
  playerZ: number,
  enemyX: number,
  enemyZ: number,
  cfg: BattleCameraConfig = DEFAULT_BATTLE_CAMERA,
): BattleCameraPose {
  const midX = (playerX + enemyX) / 2;
  const midZ = (playerZ + enemyZ) / 2;
  return {
    px: midX * cfg.followX,
    py: cfg.height,
    pz: cfg.back,
    tx: midX,
    ty: cfg.targetY,
    tz: midZ,
  };
}
