import { describe, expect, it } from 'vitest';
import { roleForTouch, zoneForTouch } from './VirtualStickInputAdapter';

describe('zoneForTouch', () => {
  it('上半分から開始したタッチは見回しになる', () => {
    expect(zoneForTouch(0, 800)).toBe('look');
    expect(zoneForTouch(399, 800)).toBe('look');
  });

  it('下半分から開始したタッチは移動になる', () => {
    expect(zoneForTouch(401, 800)).toBe('stick');
    expect(zoneForTouch(800, 800)).toBe('stick');
  });

  it('中央線ちょうどは移動(下半分)に含める', () => {
    expect(zoneForTouch(400, 800)).toBe('stick');
  });
});

describe('roleForTouch', () => {
  it('最初の指は開始ゾーンで決まる(下半分=移動、上半分=見回し)', () => {
    expect(roleForTouch(false, false, 'stick')).toBe('stick');
    expect(roleForTouch(false, false, 'look')).toBe('look');
  });

  it('1本目が移動中の2本目は、位置によらず見回しになる', () => {
    expect(roleForTouch(true, true, 'stick')).toBe('look');
    expect(roleForTouch(true, true, 'look')).toBe('look');
  });

  it('1本目が見回し中の2本目は、位置によらず移動になる', () => {
    expect(roleForTouch(false, true, 'stick')).toBe('stick');
    expect(roleForTouch(false, true, 'look')).toBe('stick');
  });
});
