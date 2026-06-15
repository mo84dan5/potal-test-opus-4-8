import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

const POOL_SIZE = 120;
const GRAVITY = 6;

/**
 * 戦闘エフェクト用の小球パーティクル群(描画専用・SRP)。
 * 固定数のメッシュをプールして使い回す。three.js 依存はここに閉じ込める。
 * 乱数は描画側のみで使う(ドメインの決定性に影響しない)。
 */
export class BattleParticles {
  private readonly pool: Particle[] = [];
  private readonly geom = new THREE.SphereGeometry(0.09, 6, 5);

  constructor(private readonly scene: THREE.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geom, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
    }
  }

  /** 位置を起点に放射状のバースト */
  burst(x: number, y: number, z: number, color: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.take();
      if (!p) return;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.5 + Math.random() * 0.7);
      p.vx = Math.cos(phi) * Math.cos(theta) * s;
      p.vy = Math.abs(Math.sin(phi)) * s + 1.2;
      p.vz = Math.cos(phi) * Math.sin(theta) * s;
      this.launch(p, x, y, z, color, 0.4 + Math.random() * 0.3);
    }
  }

  /** 始点→終点のビーム(長距離攻撃用に経路上へ粒をまく) */
  beam(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, color: number): void {
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const p = this.take();
      if (!p) return;
      const t = i / steps;
      p.vx = (Math.random() - 0.5) * 1.2;
      p.vy = (Math.random() - 0.5) * 1.2;
      p.vz = (Math.random() - 0.5) * 1.2;
      this.launch(
        p,
        fromX + (toX - fromX) * t,
        fromY + (toY - fromY) * t,
        fromZ + (toZ - fromZ) * t,
        color,
        0.25 + Math.random() * 0.2,
      );
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vy -= GRAVITY * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const k = p.life / p.maxLife;
      p.mat.opacity = k;
      p.mesh.scale.setScalar(0.4 + k);
    }
  }

  dispose(): void {
    for (const p of this.pool) {
      this.scene.remove(p.mesh);
      p.mat.dispose();
    }
    this.geom.dispose();
    this.pool.length = 0;
  }

  private take(): Particle | null {
    for (const p of this.pool) if (p.life <= 0) return p;
    return null; // プール満杯時は黙って捨てる(見た目の上限)
  }

  private launch(p: Particle, x: number, y: number, z: number, color: number, life: number): void {
    p.mesh.position.set(x, y, z);
    p.mat.color.setHex(color);
    p.mat.opacity = 1;
    p.life = life;
    p.maxLife = life;
    p.mesh.visible = true;
  }
}
