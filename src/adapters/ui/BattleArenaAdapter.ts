import { CombatActor, CombatArena } from '../../domain/entities/CombatArena';
import { CombatService, SimpleEnemyController } from '../../domain/services/CombatService';
import { BattleOutcome } from '../../domain/values/Battle';
import {
  ARENA_RADIUS,
  CombatAction,
  CombatFighter,
  COMBAT_MAX_HP,
  SUPPORT_HP_BONUS,
} from '../../domain/values/Combat';
import { VirtualStickInputAdapter } from '../input/VirtualStickInputAdapter';

/** 0xRRGGBB → #rrggbb */
function colorCss(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/**
 * アクション戦闘のトップダウン2D描画(アダプタ)。
 * 入力は普段の3人称移動と同じ `VirtualStickInputAdapter` を**そのまま再利用**する:
 * 移動=スティック、フリック=技(上/右/左)とダッシュ(下)。
 * ドメイン(CombatService/CombatArena)は描画も入力も知らない。決着で onEnd を呼ぶ。
 */
export class BattleArenaAdapter {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private input: VirtualStickInputAdapter | null = null;
  private arena: CombatArena | null = null;
  private service: CombatService | null = null;
  private raf = 0;
  private lastTime = 0;
  private pendingAction: CombatAction | null = null;
  private onEnd: ((o: BattleOutcome) => void) | null = null;

  /** 戦闘開始。host にキャンバスを作り、ループを回す */
  start(
    host: HTMLElement,
    player: CombatFighter,
    enemy: CombatFighter,
    hasSupport: boolean,
    onEnd: (o: BattleOutcome) => void,
  ): void {
    this.onEnd = onEnd;
    host.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'bt-arena-canvas';
    canvas.width = host.clientWidth || window.innerWidth;
    canvas.height = host.clientHeight || Math.round(window.innerHeight * 0.7);
    host.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    const playerActor = new CombatActor(player, COMBAT_MAX_HP + (hasSupport ? SUPPORT_HP_BONUS : 0));
    const enemyActor = new CombatActor(enemy, COMBAT_MAX_HP);
    playerActor.x = 0;
    playerActor.z = 2.2;
    enemyActor.x = 0;
    enemyActor.z = -2.2;
    this.arena = new CombatArena(playerActor, enemyActor);
    this.service = new CombatService(new SimpleEnemyController());

    // 普段と同じ入力アダプタ。フリック(onDash)の方向で行動を決める
    this.input = new VirtualStickInputAdapter(canvas, {
      onStickEnd: () => {},
      onDash: (dx, dy) => {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        // 上=技0 / 右=技1 / 左=技2 / 下=ダッシュ
        this.pendingAction = ay >= ax ? (dy < 0 ? 0 : 'dash') : dx > 0 ? 1 : 2;
      },
      onLook: () => {},
      onTap: () => {},
      onSecondaryTouch: () => {},
    });

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** 後片付け(ループ停止・入力アダプタ破棄) */
  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.input?.dispose();
    this.input = null;
    this.arena = null;
    this.service = null;
  }

  private readonly frame = (now: number): void => {
    if (!this.arena || !this.service) return;
    const dt = Math.min((now - this.lastTime) / 1000, 1 / 30);
    this.lastTime = now;

    const stick = this.input?.getStick() ?? null;
    this.service.tick(this.arena, dt, {
      strafe: stick ? stick.x : 0,
      forward: stick ? -stick.y : 0, // スティック上(y<0)=前進(相手へ)
      action: this.pendingAction,
    });
    this.pendingAction = null;

    this.render();

    if (this.arena.outcome) {
      const outcome = this.arena.outcome;
      const onEnd = this.onEnd;
      this.stop();
      onEnd?.(outcome);
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private render(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const arena = this.arena;
    if (!ctx || !canvas || !arena) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // フィールド(円)
    const cx = W / 2;
    const cy = H / 2 + 20;
    const scale = (Math.min(W, H) / 2 - 48) / ARENA_RADIUS;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const toScreen = (x: number, z: number): [number, number] => [cx + x * scale, cy + z * scale];

    this.drawActor(ctx, arena.enemy, arena.player, scale, toScreen);
    this.drawActor(ctx, arena.player, arena.enemy, scale, toScreen);

    // HPバー(左=みかた / 右=あいて)
    this.drawHp(ctx, 14, 14, 0.42 * W, arena.player, 'みかた', 0x4cd964, false);
    this.drawHp(ctx, W - 14 - 0.42 * W, 14, 0.42 * W, arena.enemy, 'あいて', 0xff6b6b, true);

    // 直近イベント
    if (arena.lastEvent) {
      ctx.fillStyle = '#ffe27a';
      ctx.font = 'bold 18px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(arena.lastEvent, cx, 64);
    }

    // 操作ヒント
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('下半分でスティック移動 / フリック: 上右左=技 下=回避ダッシュ', cx, H - 12);
  }

  private drawActor(
    ctx: CanvasRenderingContext2D,
    self: CombatActor,
    foe: CombatActor,
    scale: number,
    toScreen: (x: number, z: number) => [number, number],
  ): void {
    const [sx, sy] = toScreen(self.x, self.z);
    const r = 0.5 * scale;

    // 技の予備動作(windup): 射程の輪を進行度で描く(相手へ「来るぞ」と見せる)
    if (self.state === 'windup' && self.tech) {
      const [fx, fy] = toScreen(foe.x, foe.z);
      ctx.strokeStyle = 'rgba(255,120,120,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,80,0.7)';
      ctx.beginPath();
      ctx.arc(sx, sy, self.tech.range * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 本体
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = colorCss(self.fighter.color);
    ctx.fill();
    // ダッシュ中(無敵)は白い縁取り
    if (self.invulnerable) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // 相手を向く印
    const [fx2, fy2] = toScreen(foe.x, foe.z);
    const a = Math.atan2(fy2 - sy, fx2 - sx);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
    ctx.stroke();

    // 名前
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(self.fighter.name, sx, sy - r - 6);
  }

  private drawHp(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    actor: CombatActor,
    label: string,
    color: number,
    alignRight: boolean,
  ): void {
    const pct = Math.max(0, actor.hp) / actor.maxHp;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y + 16, w, 10);
    ctx.fillStyle = colorCss(color);
    const fillW = w * pct;
    ctx.fillRect(alignRight ? x + w - fillW : x, y + 16, fillW, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = alignRight ? 'right' : 'left';
    ctx.fillText(`${label}  ${Math.max(0, Math.round(actor.hp))}`, alignRight ? x + w : x, y + 10);
  }
}
