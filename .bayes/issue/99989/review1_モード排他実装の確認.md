# review1 モード排他実装の確認

対象issue: `.bayes/issue/99989/2本指同時操作_移動しながら見回し.md`

## 確認1: src/adapters/input/VirtualStickInputAdapter.ts(id=0、貢献度+1)

```
src/adapters/input/VirtualStickInputAdapter.ts
1 export interface StickState {
2   /** 正規化済みスティック値(右が正、|(x,y)| ≤ 1) */
...省略
105     } else if (this.mode === 'stick') {
106       // 2本目の指: 移動を即時終了して見回しモードへ
107       this.endStick();
108       this.mode = 'look';
109     }
110     // look モード中の追加タッチはそのまま見回しに参加する
111   };
```
→ 現在は **アダプタ全体で単一の mode** を持ち、2本目のタッチで `endStick()`(移動の即時停止)→ look へ排他遷移している。これを廃止し、**ポインタごとに役割(stick / look)を割り当てる**方式へ変更する。スティック役は同時に1本のみ。

## 確認2: src/application/usecases/ApplyStickUseCase.ts(id=1、貢献度+1)

```
src/application/usecases/ApplyStickUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
2
...省略
26   execute(stick: StickInput | null): void {
27     const player = this.session.player;
28     const magnitude = stick ? Math.hypot(stick.x, stick.y) : 0;
29     if (!stick || magnitude < DEAD_ZONE) {
30       player.desiredVelocity = null;
31       return;
32     }
```
→ 毎フレーム `getStick()` を読む方式のため、**スティックが生きている限り移動は継続**する。見回し(ApplyLookUseCase)もデルタ駆動で独立。**ユースケース側の変更は不要**で、アダプタの役割割当だけで同時操作が成立する。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| アダプタ全体で mode 排他(2本目タッチで移動を即時停止して見回しへ) | ポインタごとに役割を割当: スティック役不在かつ下半分開始→stick、それ以外→look。移動を継続したまま2本目で見回し |
| 役割決定が onDown 内に埋め込み | 純関数 `roleForTouch(hasStickPointer, zone)` に切り出して単体テスト |
