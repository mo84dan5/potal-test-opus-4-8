# review1 自動旋回撤去対象の確認

対象issue: `.bayes/issue/99994/1本指操作を全て移動に統一.md`

## 確認1: src/application/usecases/ApplyStickUseCase.ts(id=0、貢献度+1)

```
src/application/usecases/ApplyStickUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
2
...省略
20     private readonly walkSpeed = 6,
21     /** 進行方向への旋回の追従の強さ [1/s] */
22     private readonly steerRate = 2.0,
23   ) {}
...省略
42     // 自動旋回: 進行方向の方位へヨーを指数追従させる。
43     // ただし目標が背後(前方〜真横の ±π/2 を超える)の場合は旋回せず、
44     // 下に引いた操作はそのまま「後進」になる
45     const targetYaw = Math.atan2(-unit.x, -unit.z);
46     const delta = wrapAngle(targetYaw - player.yaw);
47     if (Math.abs(delta) <= Math.PI / 2 + 1e-9) {
48       player.yaw += delta * (1 - Math.exp(-this.steerRate * dt));
49     }
50   }
51 }
52
53 /** 角度差を [-π, π] に正規化する */
54 function wrapAngle(a: number): number {
55   return Math.atan2(Math.sin(a), Math.cos(a));
```
→ 視点を回すのはこの自動旋回ブロックのみ(移動方向の算出 L33-40 は視点基準の平行移動)。**L42-49・steerRate(L21-22)・wrapAngle(L53-56)を削除すれば「1本指=移動のみ」になる**。dt 引数は旋回専用ではなく将来の拡張余地もないため、シグネチャから削除する(呼び出し側 main.ts も修正)。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| 左右に倒すと前方〜真横の範囲で自動旋回(視点回転) | 自動旋回を撤去し、左右は純粋な平行移動。視点回転は2本指見回し(FN-004)のみ |
| execute(stick, dt) | 旋回がなくなり dt 不要のため execute(stick) に変更 |
