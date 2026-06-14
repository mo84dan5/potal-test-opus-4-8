import { describe, expect, it } from 'vitest';
import { GameSnapshot } from '../../domain/values/GameSnapshot';
import { Base64JsonSnapshotCodec } from './Base64JsonSnapshotCodec';

const snapshot: GameSnapshot = {
  version: 2,
  appName: 'Portal Walk',
  savedAt: '2026-06-15T01:02:03.000Z',
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

  it('アプリ名・保存日時を含めて往復する', () => {
    const decoded = codec.decode(codec.encode(snapshot));
    expect(decoded.appName).toBe('Portal Walk');
    expect(decoded.savedAt).toBe('2026-06-15T01:02:03.000Z');
  });

  it('旧 v1 コード(appName/savedAt 無し)も読める(後方互換)', () => {
    const v1 = {
      version: 1, worldId: 'day', player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
      flags: {}, completedEvents: [], props: {},
    };
    const code = `PW1.${btoa(encodeURIComponent(JSON.stringify(v1)))}`;
    expect(() => codec.decode(code)).not.toThrow();
    expect(codec.decode(code).appName).toBeUndefined();
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
