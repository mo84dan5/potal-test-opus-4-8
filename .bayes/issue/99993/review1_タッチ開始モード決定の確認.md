# review1 タッチ開始モード決定の確認

対象issue: `.bayes/issue/99993/画面上下半分で見回しと移動を分離.md`

## 確認1: src/adapters/input/VirtualStickInputAdapter.ts(id=0、貢献度+1)

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
79       this.stick = { x: 0, y: 0 };
80       moveTo(this.base, this.originX, this.originY);
81       moveTo(this.knob, this.originX, this.originY);
82       this.base.style.display = 'block';
83       this.knob.style.display = 'block';
84     } else if (this.mode === 'stick') {
85       // 2本目の指: 移動を即時終了して見回しモードへ
86       this.endStick();
87       this.mode = 'look';
88     }
89     // look モード中の追加タッチはそのまま見回しに参加する
```
→ idle からのタッチは無条件で stick になる(L73-74)。**ここに開始位置の上下判定を入れ、上半分なら look、下半分なら stick とする**。look モードは既に「1本指でも動く」実装(デルタを本数で平均化)なので、見回し側の追加変更は不要。

## 確認2: src/application/usecases/ApplyLookUseCase.ts(id=1、貢献度+1)

```
src/application/usecases/ApplyLookUseCase.ts
1 import { GameSession } from '../../domain/entities/GameSession';
2
...省略
15   execute(dx: number, dy: number): void {
16     const player = this.session.player;
17     player.yaw -= dx * this.sensitivity;
18     player.pitch = Math.max(
19       -PITCH_LIMIT,
20       Math.min(PITCH_LIMIT, player.pitch - dy * this.sensitivity),
21     );
22   }
```
→ デルタ駆動で指の本数に依存しない。**変更不要と確定**。

## 修正の提案
| 現状 | 提案 |
| --- | --- |
| idle からのタッチは常に移動(stick) | 開始位置が上半分なら look、下半分なら stick。判定は純関数 `zoneForTouch(y, height)` に切り出して単体テストを書く |
