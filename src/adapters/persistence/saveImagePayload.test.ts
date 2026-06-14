import { describe, expect, it } from 'vitest';
import { packPayload, payloadByteLength, unpackPayload } from './saveImagePayload';

describe('saveImagePayload', () => {
  it('pack→unpack のラウンドトリップで一致する', () => {
    const code = 'PW1.abcDEF123+/=';
    expect(unpackPayload(packPayload(code))).toBe(code);
  });

  it('マルチバイト文字でも往復する', () => {
    const code = 'PW1.セーブ💾日本語';
    expect(unpackPayload(packPayload(code))).toBe(code);
  });

  it('先頭にマジック PWS1、続けて 4byte の長さを書く', () => {
    const bytes = packPayload('AB'); // 'AB' は 2byte
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x57, 0x53, 0x31]);
    expect([bytes[4], bytes[5], bytes[6], bytes[7]]).toEqual([0, 0, 0, 2]);
    expect(bytes.length).toBe(8 + 2);
  });

  it('payloadByteLength はヘッダから合計バイト長を返す', () => {
    const bytes = packPayload('hello'); // 5byte
    expect(payloadByteLength(bytes.subarray(0, 8))).toBe(8 + 5);
  });

  it('余分な末尾バイト(画素のパディング)が付いていても本体長で切り出す', () => {
    const packed = packPayload('hi');
    const padded = new Uint8Array(packed.length + 7);
    padded.set(packed, 0); // 後ろはゼロ埋め
    expect(unpackPayload(padded)).toBe('hi');
  });

  it('マジックが違うと例外(別の画像)', () => {
    const bytes = packPayload('x');
    bytes[0] = 0x00;
    expect(() => unpackPayload(bytes)).toThrow();
  });

  it('短すぎる/長さが本体を超えるバイト列は例外', () => {
    expect(() => unpackPayload(new Uint8Array(3))).toThrow();
    const bytes = packPayload('abc');
    bytes[7] = 0xff; // 本体長を過大に改ざん
    expect(() => unpackPayload(bytes)).toThrow();
  });
});
