# review1 押し出し処理と範囲保証の確認

対象issue: `.bayes/issue/99983/NPC行動範囲の制限機構.md`

## 確認1: src/domain/services/NpcWanderService.ts(id=0、貢献度+1)

```
src/domain/services/NpcWanderService.ts
1 import { Npc } from '../entities/Npc';
2 import { Collider } from '../values/Collider';
...省略
36     let nx = feet.x + (dx / dist) * step;
37     let nz = feet.z + (dz / dist) * step;
38
39     // 障害物からの押し出し(自分自身のコライダーは除く)
40     for (const c of colliders) {
41       if (c === npc.collider) continue;
...省略
49       nx = c.position.x + px * minDist;
50       nz = c.position.z + pz * minDist;
51     }
52
53     // 進行方向を向く(forward = (-sin yaw, -cos yaw) の規約)
54     npc.yaw = Math.atan2(-(dx / dist), -(dz / dist));
55     npc.moveTo(nx, nz);
```
→ 目的地は徘徊円内で選ばれるが、**L49-50 の押し出しは無制限**で、徘徊円の縁にいる時に円外の障害物方向へ押されると円外へ出る。**L51 の押し出し後・L55 の確定前に徘徊円へのクランプを追加**すれば範囲が保証される。

## 確認2: src/domain/entities/Npc.ts(id=1、貢献度+1)

```
src/domain/entities/Npc.ts
...省略
31     /** 徘徊の中心(足元) */
32     public readonly wanderCenter: Vec3,
33     /** 徘徊半径 [m] */
34     public readonly wanderRadius: number,
35     seed = 1,
36   ) {
```
→ 範囲定義(中心+半径)は保持済み。**新たなフィールドは不要**で、サービス側のクランプのみで実現できる。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 押し出しが無制限で徘徊円の保証がない | 押し出し後に `dist(pos, wanderCenter) > wanderRadius` なら境界へ引き戻すクランプを追加 |
| 長時間テストの許容誤差が radius+0.3 | クランプ導入により radius+1e-6 へ厳格化 |
