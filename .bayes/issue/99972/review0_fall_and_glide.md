# review0_fall_and_glide — 事実確認

親Issue: [落下を遅くしてタップで滑空状態にする.md](./落下を遅くしてタップで滑空状態にする.md)

## 確認1: 落下は一定速度(FALL_SPEED=14)の降下。滑空・滞空状態は無い

src/domain/services/MovementService.ts
```
23   /** これ以下の段差は床として即スナップ(段差越え)。これを超える落差は滑らかに降下する [m] */
24   export const FALL_STEP_THRESHOLD = 0.6;
25   /** 段差を踏み外したときの降下速度 [m/s] */
26   export const FALL_SPEED = 14;
...
57   floorY(terrain, x, z, currentY, dt): number {
58     const floor = terrain.floorAt ? terrain.floorAt(x, z, currentY) : terrain.heightAt(x, z);
59     const drop = currentY - floor;
60     if (drop <= FALL_STEP_THRESHOLD) return floor;
61     return Math.max(floor, currentY - FALL_SPEED * dt); // 大きな落差は滑らかに降下
62   }
```
→ 落下は 14m/s 固定。落下速度を遅く(6)し、滑空時はさらに遅く(1.5)する。滞空判定は `drop > threshold`。

## 確認2: 水平移動はスティック→desiredVelocity→velocity 積分。落下中も適用される

src/application/usecases/ApplyStickUseCase.ts
```
   const direction = player.right.scale(stick.x).add(player.forward.scale(-stick.y));
   player.desiredVelocity = unit.scale(Math.min(1, magnitude) * this.walkSpeed); // walkSpeed=6
```
src/domain/services/MovementService.ts(tick)
```
   player.position = pos.withY(this.floorY(terrain, pos.x, pos.z, currentY, dt));
   if (player.desiredVelocity) { ... 目標速度へ追従 ... }
```
→ 落下中もスティックで水平移動可能。滑空時は水平速度を緩やかにクランプ(GLIDE_MOVE_SPEED)する。

## 確認3: タップと2本目の指の検出箇所

src/adapters/input/VirtualStickInputAdapter.ts
```
   private readonly onDown = (e: PointerEvent): void => {
     if (e.cancelable) e.preventDefault();
     const role = roleForTouch(this.stickPointerId !== null, this.pointers.size > 0, zoneForTouch(...));
     this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
     ...
```
→ `this.pointers.size > 0`(set 前)が真なら**2本目以降の指**。ここで `onSecondaryTouch` を発火できる。
タップは既存の `onTap`(短時間・微小移動の解放時)を使う。

src/main.ts
```
   onTap: () => { if (tapInteract.execute()) { worldNameEl.textContent = session.currentWorld.name; } },
```
→ 滞空中(player.airborne)なら滑空開始へ分岐、そうでなければ従来の会話/扉。

## 確認4: Player の状態(フラグ追加先)

src/domain/entities/Player.ts
```
   export class Player {
     public desiredVelocity: Vec3 | null = null;
     constructor(public position: Vec3, public velocity: Vec3, public yaw: number, public pitch: number) {}
```
→ `airborne`/`gliding` を追加(既定 false)。MovementService が毎フレーム更新、着地で gliding 解除。

## 結論(設計確定)

| 項目 | 内容 |
| --- | --- |
| 落下を遅く | FALL_SPEED 14→6 |
| 滑空 | gliding 時 GLIDE_FALL_SPEED=1.5 で降下、水平を GLIDE_MOVE_SPEED=3 にクランプ |
| 状態 | Player.airborne/gliding。tick で更新、着地で gliding=false |
| 入力 | onTap / onSecondaryTouch が airborne 時に StartGlideUseCase を実行 |
