/**
 * 現在時刻を供給するポート(DIP)。
 * 「いま何時か」はプラットフォーム都合の非決定的な外部入力なので、
 * domain サービスは `new Date()` を直接呼ばず、この契約越しに時刻を得る。
 * 本番は実時計、テストは固定時計を注入でき、サービスを決定的に保てる。
 */
export interface Clock {
  /** 現在時刻を ISO 8601 文字列で返す(例: 2026-06-15T03:04:05.000Z) */
  nowIso(): string;
}

/** 実時計(合成ルートで注入する既定実装) */
export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
};
