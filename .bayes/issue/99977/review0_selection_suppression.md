# review0_selection_suppression — 事実確認

親Issue: [移動サークル表示時のテキスト選択を抑止.md](./移動サークル表示時のテキスト選択を抑止.md)

## 確認1: html/body/#app/canvas に選択禁止が無い(HUD等にしか付いていない)

index.html
```
13       html,
14       body {
15         margin: 0;
16         padding: 0;
17         width: 100%;
18         height: 100%;
19         overflow: hidden;
20         background: #0b1026;
21         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
22       }
```
→ `html, body` に `user-select`/`-webkit-user-select`/`-webkit-touch-callout` の指定なし。
継承元が選択可能なため、canvas 上のドラッグでテキスト選択が発火する。

index.html(canvas)
```
27       #app canvas {
28         display: block;
29         width: 100%;
30         height: 100%;
31         touch-action: none;
32       }
```
→ `touch-action: none`(スクロール/ズーム抑止)はあるが、これは**テキスト選択とは別**。選択禁止指定が必要。

index.html(選択禁止が付いているのは一部のHUDのみ)
```
44         pointer-events: none;
45         user-select: none;
46         -webkit-user-select: none;
```
→ #hud / #hint / #bubble / #dialog にのみ選択禁止。**操作面である canvas と body には無い**のが原因。

## 確認2: スティックは pointerdown で起動し、preventDefault していない

src/adapters/input/VirtualStickInputAdapter.ts
```
122   private readonly onDown = (e: PointerEvent): void => {
123     const role = roleForTouch(
124       this.stickPointerId !== null,
125       this.pointers.size > 0,
126       zoneForTouch(e.clientY, window.innerHeight),
127     );
128     this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
129     this.starts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
130     this.element.setPointerCapture(e.pointerId);
```
→ `pointerdown` で `preventDefault()` を呼んでいない。CSS と併せて既定の選択/コールアウト動作を抑止する。

## 確認3: スティックUIは body 直下に生成される(body の選択禁止が継承で効く)

src/adapters/input/VirtualStickInputAdapter.ts
```
function createOverlay(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.display = 'none';
  document.body.appendChild(el);
  return el;
}
```
→ `.stick-base`/`.stick-knob` は body 直下。body にグローバル選択禁止を付ければ継承で効く(明示も追加)。

## 結論(設計確定)

| 対応 | 内容 |
| --- | --- |
| CSS(主) | `html, body` に `user-select:none` + `-webkit-user-select:none` + `-webkit-touch-callout:none` + `-webkit-tap-highlight-color:transparent`。`#app`/canvas/スティックUIにも明示 |
| JS(保険) | `VirtualStickInputAdapter.onDown` で `e.preventDefault()` |
