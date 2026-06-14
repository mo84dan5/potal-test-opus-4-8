import { describe, expect, it } from 'vitest';
import { evaluateCondition, EventCondition, EventState } from './EventScript';

const state = (flags: Record<string, boolean>, done: string[] = []): EventState => ({
  flags: new Map(Object.entries(flags)),
  completedEvents: new Set(done),
});

describe('evaluateCondition', () => {
  it('flag: 既定は value=true との一致を見る', () => {
    expect(evaluateCondition({ kind: 'flag', flag: 'a' }, state({ a: true }))).toBe(true);
    expect(evaluateCondition({ kind: 'flag', flag: 'a' }, state({ a: false }))).toBe(false);
    expect(evaluateCondition({ kind: 'flag', flag: 'a' }, state({}))).toBe(false); // 未設定=false
  });

  it('flag: value を指定すればその値との一致を見る', () => {
    expect(evaluateCondition({ kind: 'flag', flag: 'a', value: false }, state({}))).toBe(true);
    expect(evaluateCondition({ kind: 'flag', flag: 'a', value: false }, state({ a: true }))).toBe(false);
  });

  it('eventDone: 完了イベント集合を見る', () => {
    expect(evaluateCondition({ kind: 'eventDone', eventId: 'e' }, state({}, ['e']))).toBe(true);
    expect(evaluateCondition({ kind: 'eventDone', eventId: 'e' }, state({}))).toBe(false);
  });

  it('not / and / or を組み合わせられる', () => {
    const s = state({ a: true, b: false });
    expect(evaluateCondition({ kind: 'not', cond: { kind: 'flag', flag: 'b' } }, s)).toBe(true);
    const and: EventCondition = {
      kind: 'and',
      conds: [{ kind: 'flag', flag: 'a' }, { kind: 'flag', flag: 'b', value: false }],
    };
    expect(evaluateCondition(and, s)).toBe(true);
    const or: EventCondition = {
      kind: 'or',
      conds: [{ kind: 'flag', flag: 'b' }, { kind: 'flag', flag: 'a' }],
    };
    expect(evaluateCondition(or, s)).toBe(true);
  });
});
