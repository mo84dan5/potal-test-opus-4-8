/** セーブデータのフォーマット版(後方互換の判定に使う) */
export const SNAPSHOT_VERSION = 1;

/**
 * ゲーム状態の直列化スナップショット(セーブ対象)。
 * これ自体はプレーンなデータで、文字列化の手段(base64/画像)には依存しない。
 */
export interface GameSnapshot {
  version: number;
  /** 現在のワールドID */
  worldId: string;
  /** プレイヤーの姿勢 */
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  /** 進行フラグ */
  flags: Record<string, boolean>;
  /** 完了済みイベントID */
  completedEvents: string[];
  /** 可動プロップの現在位置(id → XZ)。イベント結果(岩の移動など)を復元するため */
  props: Record<string, { x: number; z: number }>;
}

/**
 * スナップショット ⇔ 文字列(セーブコード)の変換ポート(DIP)。
 * domain はこの契約だけを知り、base64 等の実装はアダプタが担う。
 * 将来の「画像で保存」も、この文字列(セーブコード)を運ぶ別トランスポートを足すだけでよい。
 */
export interface SnapshotCodec {
  /** スナップショットをコピー可能な文字列(セーブコード)へ符号化する */
  encode(snapshot: GameSnapshot): string;
  /** セーブコードを復号する。不正な文字列なら例外を投げる */
  decode(code: string): GameSnapshot;
}

/** スナップショットの形が妥当か(decode 実装の検証用に共有) */
export function isValidSnapshot(value: unknown): value is GameSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.version === 'number' &&
    typeof s.worldId === 'string' &&
    typeof s.player === 'object' &&
    s.player !== null &&
    typeof s.flags === 'object' &&
    s.flags !== null &&
    Array.isArray(s.completedEvents) &&
    typeof s.props === 'object' &&
    s.props !== null
  );
}
