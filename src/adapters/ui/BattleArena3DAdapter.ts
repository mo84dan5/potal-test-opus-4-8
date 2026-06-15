import * as THREE from 'three';
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
import { BattleArenaView } from './BattleArenaView';
import { BattleParticles } from './BattleParticles';
import { computeBattleCamera } from './battleCamera';

/** 1キャラの3D表示物と表示状態 */
interface ActorView {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  lastHp: number;
  flash: number;
}

/**
 * アクション戦闘の3D描画(アダプタ / BattleArenaView 実装)。
 * 専用の three.js シーン(三人称カメラ)で CombatArena を描く。
 * 入力は普段と同じ VirtualStickInputAdapter を再利用(移動=スティック、フリック=技/回避ダッシュ)。
 * ドメイン(CombatService/CombatArena)は描画・入力を一切知らない=安全に忘れられる。
 */
export class BattleArena3DAdapter implements BattleArenaView {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private input: VirtualStickInputAdapter | null = null;
  private arena: CombatArena | null = null;
  private service: CombatService | null = null;
  private playerView: ActorView | null = null;
  private enemyView: ActorView | null = null;
  private particles: BattleParticles | null = null;
  private hud:
    | {
        fillP: HTMLElement;
        fillE: HTMLElement;
        numP: HTMLElement;
        numE: HTMLElement;
        event: HTMLElement;
        chips: HTMLElement[];
      }
    | null = null;
  private host: HTMLElement | null = null;
  private raf = 0;
  private lastTime = 0;
  private pendingAction: CombatAction | null = null;
  private camReady = false;
  private onEnd: ((o: BattleOutcome) => void) | null = null;
  /** カメラ前方の取得に使い回す一時ベクトル(毎フレームの確保を避ける) */
  private readonly tmpDir = new THREE.Vector3();

  start(
    host: HTMLElement,
    player: CombatFighter,
    enemy: CombatFighter,
    hasSupport: boolean,
    onEnd: (o: BattleOutcome) => void,
  ): void {
    this.host = host;
    this.onEnd = onEnd;
    host.innerHTML = '';
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.domElement.className = 'bt-arena-canvas';
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1430);
    scene.fog = new THREE.Fog(0x0c1430, 14, 30);
    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x202840, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.3);
    sun.position.set(4, 9, 6);
    scene.add(sun);
    this.scene = scene;

    // 円形のアリーナ床 + 縁
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a335c, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(ARENA_RADIUS - 0.12, ARENA_RADIUS, 48),
      new THREE.MeshBasicMaterial({ color: 0x8aa0e0, side: THREE.DoubleSide }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.02;
    scene.add(rim);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    this.camReady = false;

    const playerActor = new CombatActor(player, COMBAT_MAX_HP + (hasSupport ? SUPPORT_HP_BONUS : 0));
    const enemyActor = new CombatActor(enemy, COMBAT_MAX_HP);
    playerActor.x = 0;
    playerActor.z = 2.2;
    enemyActor.x = 0;
    enemyActor.z = -2.2;
    this.arena = new CombatArena(playerActor, enemyActor);
    this.service = new CombatService(new SimpleEnemyController());

    this.playerView = this.buildActorView(scene, player.color);
    this.enemyView = this.buildActorView(scene, enemy.color);
    this.particles = new BattleParticles(scene);

    this.buildHud(host, player, enemy);

    // 普段と同じ入力アダプタ(移動=スティック / フリック方向=行動)
    this.input = new VirtualStickInputAdapter(host, {
      onStickEnd: () => {},
      onDash: (dx, dy) => {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        this.pendingAction = ay >= ax ? (dy < 0 ? 0 : 'dash') : dx > 0 ? 1 : 2;
      },
      onLook: () => {},
      onTap: () => {},
      onSecondaryTouch: () => {},
    });

    window.addEventListener('resize', this.onResize);
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.onResize);
    this.input?.dispose();
    this.input = null;
    this.particles?.dispose();
    this.particles = null;
    this.scene?.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.arena = null;
    this.service = null;
    this.playerView = null;
    this.enemyView = null;
    this.hud = null;
  }

  /** 簡素なアバター(胴+頭)と足元のリング(技の射程表示)を作る */
  private buildActorView(scene: THREE.Scene, color: number): ActorView {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 6, 12), bodyMat);
    body.position.y = 0.75;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xffe0c0, roughness: 0.7 }),
    );
    head.position.y = 1.45;
    group.add(head);
    // 正面マーカー(向きが分かるよう前面に小さな板)
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
    );
    nose.position.set(0, 1.45, 0.26);
    group.add(nose);
    scene.add(group);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff6b6b,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.visible = false;
    scene.add(ring);

    return { group, bodyMat, ring, ringMat, lastHp: COMBAT_MAX_HP, flash: 0 };
  }

  private buildHud(host: HTMLElement, player: CombatFighter, enemy: CombatFighter): void {
    const hud = document.createElement('div');
    hud.className = 'bt3d-hud';
    hud.innerHTML = `
      <div class="bt3d-hp left">
        <div class="bt3d-hp-label">${player.name}<span class="bt3d-hp-num"></span></div>
        <div class="bt3d-hp-track"><span class="bt3d-hp-fill" style="background:#4cd964"></span></div>
      </div>
      <div class="bt3d-hp right">
        <div class="bt3d-hp-label"><span class="bt3d-hp-num"></span>${enemy.name}</div>
        <div class="bt3d-hp-track"><span class="bt3d-hp-fill" style="background:#ff6b6b"></span></div>
      </div>
      <div class="bt3d-event"></div>
      <div class="bt3d-chips">
        <div class="bt3d-chip">↑ ${player.techniques[0].name}</div>
        <div class="bt3d-chip">→ ${player.techniques[1].name}</div>
        <div class="bt3d-chip">← ${player.techniques[2].name}</div>
        <div class="bt3d-chip dash">↓ 回避</div>
      </div>
      <div class="bt3d-hint">下半分でスティック移動 / フリック: 上右左=技 下=回避ダッシュ</div>`;
    host.appendChild(hud);
    const fills = hud.querySelectorAll('.bt3d-hp-fill');
    const nums = hud.querySelectorAll('.bt3d-hp-num');
    this.hud = {
      fillP: fills[0] as HTMLElement,
      fillE: fills[1] as HTMLElement,
      numP: nums[0] as HTMLElement,
      numE: nums[1] as HTMLElement,
      event: hud.querySelector('.bt3d-event') as HTMLElement,
      chips: Array.from(hud.querySelectorAll('.bt3d-chip')) as HTMLElement[],
    };
  }

  private readonly onResize = (): void => {
    const host = this.host;
    if (!this.renderer || !this.camera || !host) return;
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private readonly frame = (now: number): void => {
    if (!this.arena || !this.service || !this.renderer || !this.scene || !this.camera) return;
    const dt = Math.min((now - this.lastTime) / 1000, 1 / 30);
    this.lastTime = now;

    const stick = this.input?.getStick() ?? null;
    // スティックをカメラの水平基底で回し、カメラ相対のワールド移動方向にする
    let moveX = 0;
    let moveZ = 0;
    if (stick) {
      const fwd = this.camera.getWorldDirection(this.tmpDir);
      fwd.y = 0;
      const fl = Math.hypot(fwd.x, fwd.z) || 1;
      const fx = fwd.x / fl;
      const fz = fwd.z / fl;
      const rx = -fz; // 画面右(= forward × up の水平成分)
      const rz = fx;
      moveX = rx * stick.x + fx * -stick.y; // 上(−y)=画面奥(カメラ前方)
      moveZ = rz * stick.x + fz * -stick.y;
    }
    this.service.tick(this.arena, dt, { moveX, moveZ, action: this.pendingAction });
    this.pendingAction = null;

    this.syncActor(this.playerView!, this.arena.player, this.arena.enemy, dt);
    this.syncActor(this.enemyView!, this.arena.enemy, this.arena.player, dt);
    this.spawnEffects(dt);
    this.updateCamera(dt);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);

    if (this.arena.outcome) {
      const outcome = this.arena.outcome;
      const onEnd = this.onEnd;
      this.stop();
      onEnd?.(outcome);
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private syncActor(view: ActorView, actor: CombatActor, foe: CombatActor, dt: number): void {
    view.group.position.set(actor.x, 0, actor.z);
    view.group.rotation.y = Math.atan2(foe.x - actor.x, foe.z - actor.z);

    // 被弾フラッシュ(HP が減った瞬間)
    if (actor.hp < view.lastHp) view.flash = 0.25;
    view.lastHp = actor.hp;

    let emissive = 0x000000;
    let intensity = 0;
    if (actor.invulnerable) {
      emissive = 0x88aaff; // ダッシュ無敵の発光
      intensity = 0.9;
    }
    if (view.flash > 0) {
      emissive = 0xff3322; // 被弾
      intensity = 1.0;
      view.flash -= dt;
    }
    view.bodyMat.emissive.setHex(emissive);
    view.bodyMat.emissiveIntensity = intensity;

    // 技の予備動作: 足元に射程リングを出し、発生が近いほど濃く
    if (actor.state === 'windup' && actor.tech) {
      const progress = Math.min(1, Math.max(0, 1 - actor.timer / actor.tech.windup));
      view.ring.visible = true;
      view.ring.position.set(actor.x, 0.04, actor.z);
      view.ring.scale.set(actor.tech.range, actor.tech.range, actor.tech.range);
      view.ringMat.opacity = 0.3 + 0.6 * progress;
    } else {
      view.ring.visible = false;
    }
  }

  /** ドメインが出したエフェクト(effects)を drain してパーティクルに変換する */
  private spawnEffects(dt: number): void {
    const arena = this.arena;
    const particles = this.particles;
    if (!arena || !particles) return;
    const y = 0.9;
    for (const e of arena.effects) {
      if (e.kind === 'cast') {
        particles.burst(e.x, y, e.z, e.color, e.ranged ? 10 : 14, e.ranged ? 2.4 : 3.2);
      } else if (e.kind === 'hit') {
        if (e.ranged) particles.beam(e.fromX, y, e.fromZ, e.x, y, e.z, e.color);
        particles.burst(e.x, y, e.z, e.ranged ? 0x66ddff : 0xffaa33, 22, 5);
      } else {
        particles.burst(e.x, y, e.z, 0x66ffcc, 18, 4);
      }
    }
    arena.effects.length = 0;
    particles.update(dt);
  }

  private updateCamera(dt: number): void {
    const a = this.arena!;
    const cam = this.camera!;
    // ステージ紐づけの俯瞰(純粋関数で算出)。位置は +Z 高所固定・X だけ中点へ部分追従
    const pose = computeBattleCamera(a.player.x, a.player.z, a.enemy.x, a.enemy.z);
    const desired = new THREE.Vector3(pose.px, pose.py, pose.pz);
    if (!this.camReady) {
      cam.position.copy(desired);
      this.camReady = true;
    } else {
      cam.position.lerp(desired, Math.min(1, dt * 4));
    }
    cam.lookAt(pose.tx, pose.ty, pose.tz);
  }

  private updateHud(): void {
    const a = this.arena;
    const hud = this.hud;
    if (!a || !hud) return;
    hud.fillP.style.width = `${(Math.max(0, a.player.hp) / a.player.maxHp) * 100}%`;
    hud.fillE.style.width = `${(Math.max(0, a.enemy.hp) / a.enemy.maxHp) * 100}%`;
    hud.numP.textContent = ` ${Math.max(0, Math.round(a.player.hp))}`;
    hud.numE.textContent = `${Math.max(0, Math.round(a.enemy.hp))} `;
    hud.event.textContent = a.lastEvent ?? '';
    // クールダウン中のチップは暗く(再使用可能になったら明るく)
    const cds = [a.player.techCd[0], a.player.techCd[1], a.player.techCd[2], a.player.dashCd];
    for (let i = 0; i < hud.chips.length; i++) {
      const ready = cds[i] <= 0;
      hud.chips[i].style.opacity = ready ? '1' : '0.35';
      hud.chips[i].classList.toggle('ready', ready);
    }
  }
}
