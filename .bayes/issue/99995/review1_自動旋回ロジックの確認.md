# review1 自動旋回ロジックの確認

対象issue: `.bayes/issue/99995/下スワイプを旋回なしの後進に変更.md`

## 確認1: src/application/usecases/ApplyStickUseCase.ts(id=0、貢献度+1)

```
src/application/usecases/ApplyStickUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
2
...省略
40     player.desiredVelocity = unit.scale(Math.min(1, magnitude) * this.walkSpeed);
41
42     // 自動旋回: 進行方向の方位へヨーを指数追従させる
43     const targetYaw = Math.atan2(-unit.x, -unit.z);
44     const delta = wrapAngle(targetYaw - player.yaw);
45     player.yaw += delta * (1 - Math.exp(-this.steerRate * dt));
46   }
47 }
```
→ 旋回は無条件で作動する(L43-45)。下スワイプ(後方移動)では `unit ≈ -forward` となり `delta ≈ ±π`(背後)へ旋回するため、視点が反転回転して「見回しが発火した」ように見える。**これが原因と確定**。

## 確認2: src/adapters/input/VirtualStickInputAdapter.ts(id=3、貢献度+1)

```
src/adapters/input/VirtualStickInputAdapter.ts
1 export interface StickState {
2   /** 正規化済みスティック値(右が正、|(x,y)| ≤ 1) */
...省略
73     if (this.mode === 'idle') {
74       this.mode = 'stick';
75       this.stickPointerId = e.pointerId;
76       this.originX = e.clientX;
77       this.originY = e.clientY;
78       this.startTime = e.timeStamp;
```
→ 1本指は常に stick モードであり、look(見回し)は2本目タッチ時のみ発火する。**入力アダプタ側に誤発火はなく、変更不要**。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 旋回は進行方向へ無条件に追従(後方移動時に±180°反転) | 目標方位との差が `|Δyaw| ≤ π/2`(前方〜真横)のときのみ旋回。それ以外(後方)は旋回せず後進 |
