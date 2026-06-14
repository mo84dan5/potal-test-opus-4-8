import {
  GameSnapshot,
  isValidSnapshot,
  SnapshotCodec,
} from '../../domain/values/GameSnapshot';

/** セーブコードの接頭辞(形式の識別とコピペ事故の軽減)。将来の画像形式でも同じ文字列を内包する */
const PREFIX = 'PW1.';

/**
 * SnapshotCodec の実装(アダプタ)。スナップショットを JSON→base64 のセーブコード文字列にする。
 * - encode: `PW1.` + base64(encodeURIComponent(JSON)) … コピーして保存できる ASCII 文字列
 * - decode: 逆変換 + 形検証。壊れていれば例外
 * 文字列化の具象(base64)はここ(アダプタ)に閉じ込め、domain は SnapshotCodec ポートだけを知る。
 */
export class Base64JsonSnapshotCodec implements SnapshotCodec {
  encode(snapshot: GameSnapshot): string {
    const json = JSON.stringify(snapshot);
    // encodeURIComponent で全て ASCII 化してから base64(マルチバイトでも安全)
    return PREFIX + btoa(encodeURIComponent(json));
  }

  decode(code: string): GameSnapshot {
    const trimmed = code.trim();
    if (!trimmed.startsWith(PREFIX)) {
      throw new Error('セーブコードの形式が不正です');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeURIComponent(atob(trimmed.slice(PREFIX.length))));
    } catch {
      throw new Error('セーブコードを復号できませんでした');
    }
    if (!isValidSnapshot(parsed)) {
      throw new Error('セーブデータの内容が不正です');
    }
    return parsed;
  }
}
