# review0_combat

親Issue: [戦闘の技クールダウン・エフェクト・長距離攻撃](./戦闘の技クールダウン・エフェクト・長距離攻撃.md)

クールダウン・エフェクト・長距離攻撃を足す前提として、現状の戦闘ドメインを事実確認する。

## src/domain/values/Combat.ts(技データ)
```
7 export interface Technique {
8   readonly name: string;
10   readonly range: number;
12   readonly damage: number;
14   readonly windup: number;
16   readonly recovery: number;
17 }
```
事実: Technique は range/damage/windup/recovery のみ。cooldown も ranged も無い。
→ `cooldown`(必須)と `ranged?` を追加。`DASH_COOLDOWN` 定数と `CombatEffect` 型も新設。

## src/domain/entities/CombatArena.ts(アクター/フィールド)
```
16   state: ActorState = 'idle';
18   timer = 0;
20   tech: Technique | null = null;
34   get invulnerable(): boolean { return this.state === 'dash'; }
49   outcome: BattleOutcome | null = null;
51   lastEvent: string | null = null;
```
事実: アクターは state/timer/tech を持つがクールダウンは無い。アリーナは lastEvent 文字列のみで
構造化エフェクトのキューが無い。
→ `CombatActor.techCd:[0,0,0]`/`dashCd` と `CombatArena.effects: CombatEffect[]` を追加。

## src/domain/services/CombatService.ts(進行)
```
81       case 'idle': {
82         if (input.action === 'dash') { self.state='dash'; self.timer=DASH_TIME; ... }
89         if (input.action === 0 || input.action === 1 || input.action === 2) {
90           self.state = 'windup'; self.tech = self.fighter.techniques[input.action];
91           self.timer = self.tech.windup;
106   private resolveHit(arena, self, foe) {
116         foe.hp = Math.max(0, foe.hp - tech.damage);
117         arena.lastEvent = `${self.fighter.name}の${tech.name}!`;
```
事実: idle で即座に技/ダッシュ発動(待ち時間なし)。resolveHit が命中処理。
→ 発動前に cd を確認し発動時に cd セット。updateActor 先頭で cd 減算。
発動(cast)・命中/回避/空振り(hit/dodge)で `arena.effects` に push(描画用データ)。

## src/domain/services/CombatService.ts(敵AI)
```
153 export class SimpleEnemyController implements EnemyController {
160     const slot = this.techCycle % 3;
168     if (this.decisionTimer <= 0) { ... action: slot ... }
```
事実: 敵は techCycle で技を選ぶ。クールダウンを考慮していない。
→ cd 中のスロットを避けて選ぶよう変更。

## src/adapters/ui/BattleArena3DAdapter.ts(3D描画)
事実: frame() で service.tick → syncActor/updateCamera/updateHud。HUD は HP/イベント/ヒントのみ。
パーティクル無し。
→ 毎フレーム `arena.effects` を drain して `BattleParticles` で生成。HUD にクールダウンチップを追加。

## 結論
- クールダウンは純粋ドメイン(決定的)で管理し、テスト可能。
- エフェクトはドメインがデータ(effects)を出し、ビューがパーティクル化(関心の分離)。
- 長距離は ranged フラグ + 長 range。ビューがビーム/着弾を描く。
- 記載と実コードに齟齬なし。`## 修正の提案` は不要。
