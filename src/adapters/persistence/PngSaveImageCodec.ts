import { packPayload, payloadByteLength, unpackPayload } from './saveImagePayload';

/** 画像に重ねて表示する人間向けの見出し(アプリ名・保存日時) */
export interface SaveImageLabel {
  appName: string;
  /** 保存日時(ISO 8601)。表示時に整形する */
  savedAt: string;
}

/**
 * セーブコード(文字列)⇄ 画像の変換ポート。
 * 文字列セーブコードを運ぶ「別トランスポート」であり、SnapshotCodec とは独立(OCP)。
 */
export interface SaveImageCodec {
  /** セーブコードを PNG の dataURL に符号化する(見出しも描画する) */
  encode(code: string, label: SaveImageLabel): string;
  /** 画像ファイル(写真)からセーブコードを復号する */
  decode(file: Blob): Promise<string>;
}

// データ画素のレイアウト。1論理画素 = SCALE×SCALE のブロックに RGB の3バイトを格納する。
// ブロック化&中心サンプルで、写真保存時の軽微な再圧縮/拡大に耐える。
const SCALE = 6;
const COLS = 48; // 1行あたりの論理画素数(画像幅 = COLS*SCALE)
const CAPTION_H = 58; // 下部キャプション帯の高さ(px)
const ASPECT = 1; // 仕上がりの縦横比(幅:高さ)。データが少なくても一定の正方形に整える
const BG = '#0b1026';

/** ISO 文字列を読みやすい日時に整形(失敗時は元の文字列) */
function formatSavedAt(savedAt: string): string {
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return savedAt;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * canvas を使った SaveImageCodec 実装(アダプタ)。
 * canvas/DOM 依存はこのクラスに閉じ込め、バイト詰めの純粋ロジックは saveImagePayload に分離している。
 */
export class PngSaveImageCodec implements SaveImageCodec {
  encode(code: string, label: SaveImageLabel): string {
    const payload = packPayload(code);
    const numPixels = Math.ceil(payload.length / 3);
    const rows = Math.max(1, Math.ceil(numPixels / COLS));
    const dataW = COLS * SCALE;
    const dataH = rows * SCALE;

    // 幅は COLS*SCALE のまま固定し(デコーダの中心サンプルを保つ)、
    // 高さだけを足して常に正方形(ASPECT)に整える。データが大きい時は必要分だけ伸びる。
    const minH = dataH + CAPTION_H;
    const targetH = Math.round(dataW / ASPECT);

    const canvas = document.createElement('canvas');
    canvas.width = dataW;
    canvas.height = Math.max(minH, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像の生成に失敗しました');

    // 背景
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // データ画素(各論理画素を SCALE 角のブロックで塗る)
    for (let k = 0; k < numPixels; k++) {
      const r = payload[k * 3] ?? 0;
      const g = payload[k * 3 + 1] ?? 0;
      const b = payload[k * 3 + 2] ?? 0;
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(col * SCALE, row * SCALE, SCALE, SCALE);
    }

    // キャプション帯(アプリ名・保存日時)は最下部に固定する
    const capY = canvas.height - CAPTION_H;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, capY, canvas.width, CAPTION_H);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillText(`💾 ${label.appName}`, 8, capY + 18);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(formatSavedAt(label.savedAt), 8, capY + 40);

    return canvas.toDataURL('image/png');
  }

  decode(file: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          resolve(this.readPixels(img));
        } catch (e) {
          reject(e instanceof Error ? e : new Error('画像を読み込めませんでした'));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('画像を読み込めませんでした'));
      };
      img.src = url;
    });
  }

  /** 読み込んだ画像の画素を走査してセーブコードを取り出す */
  private readPixels(img: HTMLImageElement): string {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < COLS) throw new Error('このゲームのセーブ画像ではありません');

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を読み込めませんでした');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;

    // 一様拡大に耐えるため、実ブロックサイズを画像幅から逆算する(厳密一致なら = SCALE)
    const block = w / COLS;
    const maxRows = Math.floor(h / block);
    const maxPixels = COLS * maxRows;

    const bytes: number[] = [];
    let needed = payloadByteLength(new Uint8Array(0)); // まずヘッダ長(8)を読む
    for (let k = 0; k < maxPixels; k++) {
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      const px = Math.min(w - 1, Math.floor(col * block + block / 2));
      const py = Math.min(h - 1, Math.floor(row * block + block / 2));
      const o = (py * w + px) * 4;
      bytes.push(data[o], data[o + 1], data[o + 2]);
      if (bytes.length >= 8 && needed <= 8) {
        // ヘッダが揃ったら本体長を確定する
        needed = payloadByteLength(Uint8Array.from(bytes.slice(0, 8)));
      }
      if (bytes.length >= needed && needed > 8) break;
    }
    return unpackPayload(Uint8Array.from(bytes));
  }
}
