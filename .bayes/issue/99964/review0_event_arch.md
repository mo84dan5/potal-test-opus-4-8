# review0_event_arch — 事実確認

親Issue: [イベントシステムの実装.md](./イベントシステムの実装.md)

## 確認1: タップは Interactable を対象に会話/扉を起こす(イベント開始の起点にできる)

src/application/usecases/TapInteractUseCase.ts
```
   const target = this.interaction.nearestInFrontWithin(
     this.session.player.position,
     this.session.player.forward,
     this.session.currentWorld.interactables.filter(
       (i) => i.dialogue.length > 0 || i.doorPortalId !== null,
     ),
     this.interactRange,
     this.frontMinDot,
   );
   if (!target) return false;
   if (target.doorPortalId !== null) { return this.enterDoor(target.doorPortalId); }
   this.session.dialogue = new DialogueSession(target.dialogue);
```
→ Interactable に `event` を足し、候補条件に `|| i.event` を加え、`target.event` ならイベント開始にできる。

## 確認2: 移動は MovementService が desiredVelocity を追従し地形/衝突に沿う(自動歩行に再利用)

src/domain/services/MovementService.ts
```
   if (player.desiredVelocity) {
     const blend = 1 - Math.exp(-this.config.acceleration * dt);
     player.velocity = player.velocity.add(player.desiredVelocity.sub(player.velocity).scale(blend)).withY(0);
   }
   halt(player) { player.velocity = Vec3.ZERO; player.desiredVelocity = null; }
```
src/application/usecases/TickUseCase.ts
```
   this.movement.tick(player, dt, currentWorld.terrain);
   this.collision.resolve(player, currentWorld.colliders);
```
→ `walkTo` は目的地方向へ `desiredVelocity` を設定するだけでよい(地形追従・衝突は既存処理が担当)。
到達で `movement.halt`。クリーンアーキ上、EventService は MovementService(ドメイン)に依存してよい。

## 確認3: 衝突はワールドのコライダー配列。プロップを足せば動かして道を開ける

src/domain/entities/World.ts
```
   public readonly colliders: readonly Collider[] = [],
   public readonly npcs: readonly Npc[] = [],
   public readonly terrain: HeightField = FLAT_TERRAIN,
```
src/application/usecases/TickUseCase.ts
```
   this.collision.resolve(player, currentWorld.colliders);
```
→ `World.props`(可動 EventProp)を追加し、衝突時に `props.map(p=>p.collider)` を含める。
プロップのコライダーは現在位置から導出するので、`moveProp` で位置を動かすと元の場所が開通する。

## 確認4: ポータル通過は毎フレーム判定(イベント中の自動歩行が誤通過しないようスキップが必要)

src/application/usecases/TickUseCase.ts
```
   private checkPortals(before: Vec3): TickResult {
     for (const portal of this.session.currentWorld.portals) {
       if (portal.isDoor) continue;
       if (!this.traversal.hasCrossed(portal, before, player.position)) continue;
       ...
```
→ イベント中(`session.activeEvent`)は checkPortals をスキップし、自動歩行が門を誤って通過しないようにする。

## 確認5: NPC は Interactable のサブクラス(イベントを持たせられる)

src/application/usecases/TickUseCase.ts(NPCはdialogueSpeakerで停止)
```
   for (const npc of world.npcs) {
     if (npc === this.session.dialogueSpeaker) continue;
     this.npcWander.tick(npc, dt, world.colliders, world.terrain);
   }
```
→ Npc は Interactable を継承。`Interactable.event` を足せば NPC タップでイベント開始できる。
NpcSpec に `eventId` を足し、`EVENTS` レジストリから注入する。

## 結論(設計確定 / SOLID・クリーンアーキ準拠)

| 層 | 追加 | 依存方向 |
| --- | --- | --- |
| domain/values | `EventScript`(EventStep/GameEvent/ActiveEvent) | 内向き(依存なし) |
| domain/entities | `EventProp`、Interactable.event、World.props、GameSession.activeEvent | three/DOM 非依存 |
| domain/services | `EventService`(単一責務: イベント進行) | MovementService に依存 |
| application | TapInteractUseCase(開始)・TickUseCase(プロップ衝突/ポータルスキップ) | domain へ依存 |
| adapter/composition | main(操作制限・配線)・Renderer(プロップ描画) | 内側へ依存 |
