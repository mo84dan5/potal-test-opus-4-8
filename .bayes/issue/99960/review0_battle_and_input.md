# review0_battle_and_input

親Issue: [戦闘イベントの作り込み(アクションバトル)](./戦闘イベントの作り込み(アクションバトル).md)

アクション戦闘へ作り込むため、現状の戦闘ドメインと再利用する入力アダプタを事実確認する。

## src/domain/services/BattleService.ts(現状: 仮実装の attack)
```
47   attack(s: BattleSession): void {
48     if (s.phase !== 'fight') return;
49     const damage = PLAYER_ATTACK + (s.supportId ? SUPPORT_BONUS : 0);
50     s.enemyHp = Math.max(0, s.enemyHp - damage);
51     if (s.enemyHp <= 0) {
52       s.outcome = 'win';
53       s.phase = 'result';
54       return;
55     }
56     s.playerHp = Math.max(0, s.playerHp - ENEMY_ATTACK);
```
事実: fight は「attack でHPを削るだけ」の仮実装。
→ この仮ロジック(attack/playerHp/enemyHp)を撤去し、実戦闘は CombatService に委譲。
BattleService は遷移のみ+ `finishFight(s, outcome)` で result へ。

## src/domain/entities/BattleSession.ts(現状: 仮HP)
```
14   outcome: BattleOutcome | null = null;
15   playerHp = BATTLE_MAX_HP;
16   enemyHp = BATTLE_MAX_HP;
17
18   constructor(public readonly def: BattleDefinition) {}
```
事実: 仮HPを保持。→ 撤去し、HPはアクション戦闘ドメイン(CombatActor)が持つ。

## src/domain/values/Battle.ts(現状: 仮攻撃定数とキャラ定義)
```
20 export interface BattleCharacter {
21   readonly id: string;
22   readonly name: string;
24   readonly color: number;
25 }
50 export const BATTLE_MAX_HP = 100;
52 export const PLAYER_ATTACK = 16;
54 export const ENEMY_ATTACK = 12;
56 export const SUPPORT_BONUS = 6;
```
事実: BattleCharacter は id/name/color のみ。仮攻撃定数あり。
→ `techniques`(3種)を BattleCharacter と Opponent に追加。仮攻撃定数は撤去(Combat.ts へ移行)。

## src/adapters/input/VirtualStickInputAdapter.ts(再利用する入力)
```
11   /** はじいて離した瞬間(ダッシュ)。dx/dy はスワイプ全体の移動量 [px] */
12   onDash(dx: number, dy: number): void;
87   getStick(): StickState | null {
88     return this.stick;
89   }
```
事実: 移動は `getStick()`(x:右+, y:下+ で正規化)、フリックは `onDash(dx,dy)`(px デルタ)。
→ 戦闘でも同じアダプタを生成して使う(同じ操作系)。フリック方向で行動を決める:
上(dy<0)=技1 / 右(dx>0)=技2 / 左(dx<0)=技3 / 下(dy>0)=ダッシュ。
※ base/knob は body 直下・z-index:10。オーバーレイ(z:50)より前に出すため z-index を引き上げる。

## src/adapters/ui/BattleOverlayAdapter.ts(現状: fight はボタン)
```
private renderFight(s: BattleSession): void {
  ...
  <button class="bt-primary" type="button">こうげき</button>`);
  this.button(card, '.bt-primary', () => { this.service.attack(s); this.render(); });
}
```
事実: fight は「こうげき」ボタンで service.attack を呼ぶだけ。
→ fight ではアリーナ(BattleArenaAdapter)を起動し、決着で outcome を確定し result へ遷移。

## 結論
- 実戦闘は純粋ドメイン(CombatArena/CombatService)に新設し、BattleService は遷移に専念(SRP)。
- 入力は既存 VirtualStickInputAdapter を再利用(同じ操作系・DRY)。
- ジャスト回避は「ダッシュ中無敵」で表現。敵AIは EnemyController で分離(DIP)。
- 記載と実コードに齟齬なし。`## 修正の提案` は不要。
