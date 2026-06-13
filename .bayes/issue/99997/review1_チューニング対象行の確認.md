# review1 チューニング対象行の確認

対象issue: `.bayes/issue/99997/旋回速度の調整と離した時の即時停止.md`

## 確認1: src/application/usecases/ApplyStickUseCase.ts(id=0、貢献度+1)

```
src/application/usecases/ApplyStickUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
2
...省略
20     private readonly walkSpeed = 6,
21     /** 進行方向への旋回の追従の強さ [1/s] */
22     private readonly steerRate = 4.5,
23   ) {}
24
25   execute(stick: StickInput | null, dt: number): void {
...省略
44     const delta = wrapAngle(targetYaw - player.yaw);
45     player.yaw += delta * (1 - Math.exp(-this.steerRate * dt));
```
→ 旋回速度は既定値 steerRate=4.5(L22)。**2.0 へ引き下げる**。テストは係数を明示指定しているため既定値変更の影響なし(確認3)。

## 確認2: src/domain/services/MovementService.ts(id=1、貢献度+1)

```
src/domain/services/MovementService.ts
1 import { Player } from '../entities/Player';
2 import { Vec3 } from '../values/Vec3';
...省略
53       player.velocity = player.velocity
54         .add(player.desiredVelocity.sub(player.velocity).scale(blend))
55         .withY(0);
56     } else {
57       // 入力なし: 慣性の指数減衰
58       player.velocity = player.velocity.scale(Math.exp(-this.config.damping * dt));
59     }
```
→ 解放後は指数減衰(L58)のため滑ってから停止する。**離した瞬間に速度ゼロにする halt() を追加**し、減衰はダッシュ後の減速としてのみ機能させる。

## 確認3: src/adapters/input/VirtualStickInputAdapter.ts(id=2、貢献度+1)

```
src/adapters/input/VirtualStickInputAdapter.ts
1 export interface StickState {
2   /** 正規化済みスティック値(右が正、|(x,y)| ≤ 1) */
...省略
88   private readonly onUp = (e: PointerEvent): void => {
89     if (e.pointerId !== this.pointerId) return;
90
91     const elapsed = e.timeStamp - this.startTime;
92     const dx = e.clientX - this.originX;
93     const dy = e.clientY - this.originY;
94     if (elapsed < DASH_MAX_TIME && Math.hypot(dx, dy) > DASH_MIN_DISTANCE) {
95       this.callbacks.onDash(dx, dy);
96     }
97     this.release();
98   };
```
→ 解放時は onDash 判定のみで「離した」通知がない。**onStickEnd コールバックを追加し、onDash より先に呼ぶ**(停止→ダッシュインパルスの順で、ダッシュの勢いが残る)。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| steerRate 既定値 4.5(旋回が速すぎる) | 2.0 に引き下げ |
| 解放後 damping=2.2 の指数減衰で滑る | 解放イベントで velocity=0(即時停止)。減衰はダッシュ後のみ |
| 解放通知コールバックなし | onStickEnd を追加(onDash の前に発火) |
