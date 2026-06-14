import { describe, expect, it } from 'vitest';
import { GameSnapshot } from '../../domain/values/GameSnapshot';
import { Base64JsonSnapshotCodec } from './Base64JsonSnapshotCodec';

const snapshot: GameSnapshot = {
  version: 1,
  worldId: 'day',
  player: { x: 1, y: 0, z: 2, yaw: 0.5, pitch: 0.1 },
  flags: { guided: true },
  completedEvents: ['day-rock'],
  props: { 'day-rock': { x: 1, z: 7 } },
};

describe('Base64JsonSnapshotCodec', () => {
  const codec = new Base64JsonSnapshotCodec();

  it('encode→decode のラウンドトリップで一致する', () => {
    const code = codec.encode(snapshot);
    expect(typeof code).toBe('string');
    expect(code.startsWith('PW1.')).toBe(true);
    expect(codec.decode(code)).toEqual(snapshot);
  });

  it('前後の空白を許容する', () => {
    const code = codec.encode(snapshot);
    expect(codec.decode(`  ${code}\n`)).toEqual(snapshot);
  });

  it('接頭辞のない文字列は例外', () => {
    expect(() => codec.decode('garbage')).toThrow();
  });

  it('復号できない/内容が不正なコードは例外', () => {
    expect(() => codec.decode('PW1.@@@')).toThrow(); // base64 として不正
    expect(() => codec.decode(`PW1.${btoa(encodeURIComponent('123'))}`)).toThrow(); // 形が不正
  });
});
