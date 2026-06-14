/**
 * セーブコード(文字列)⇄ バイト列の純粋変換。
 * canvas/DOM には一切依存しないので node 上で単体テストできる。
 * 画像に詰める前段として「自己記述的なバイト列(マジック+長さ+本体)」を作る。
 *
 * レイアウト:
 *   [0..3]  MAGIC 'PWS1'(ASCII 4byte)… セーブ画像の識別
 *   [4..7]  本体バイト長(32bit ビッグエンディアン)
 *   [8..]   セーブコードの UTF-8 バイト列
 */
const MAGIC = [0x50, 0x57, 0x53, 0x31]; // 'P','W','S','1'
const HEADER_LENGTH = 8;

/** セーブコード文字列を、画像へ詰めるためのバイト列に符号化する */
export function packPayload(code: string): Uint8Array {
  const body = new TextEncoder().encode(code);
  const out = new Uint8Array(HEADER_LENGTH + body.length);
  out[0] = MAGIC[0];
  out[1] = MAGIC[1];
  out[2] = MAGIC[2];
  out[3] = MAGIC[3];
  // 32bit ビッグエンディアンで本体長を書く
  out[4] = (body.length >>> 24) & 0xff;
  out[5] = (body.length >>> 16) & 0xff;
  out[6] = (body.length >>> 8) & 0xff;
  out[7] = body.length & 0xff;
  out.set(body, HEADER_LENGTH);
  return out;
}

/** 画素から取り出したバイト列を検証し、セーブコード文字列へ復号する */
export function unpackPayload(bytes: Uint8Array): string {
  if (bytes.length < HEADER_LENGTH) {
    throw new Error('画像にセーブデータが見つかりません');
  }
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2] || bytes[3] !== MAGIC[3]) {
    throw new Error('このゲームのセーブ画像ではありません');
  }
  const length = ((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0;
  if (HEADER_LENGTH + length > bytes.length) {
    throw new Error('セーブ画像が壊れています');
  }
  const body = bytes.subarray(HEADER_LENGTH, HEADER_LENGTH + length);
  return new TextDecoder().decode(body);
}

/** payload を読み出すのに必要な合計バイト長(画素読み取りの停止判定に使う) */
export function payloadByteLength(header: Uint8Array): number {
  if (header.length < HEADER_LENGTH) return HEADER_LENGTH;
  const length = ((header[4] << 24) | (header[5] << 16) | (header[6] << 8) | header[7]) >>> 0;
  return HEADER_LENGTH + length;
}
