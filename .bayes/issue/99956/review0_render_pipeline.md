# review0_render_pipeline

親Issue: [手書き風シェーダー(ポストエフェクト)](./手書き風シェーダー(ポストエフェクト).md)

最終描画にポストエフェクトを挟むため、現状のパイプラインを事実確認する。

## src/adapters/rendering/ThreeRendererAdapter.ts(本描画)
```
142     world.portals.forEach((portal, index) => {
143       if (portal.isDoor) return;
144       const rt = this.renderTargetPool[index];
...
166       this.renderer.setRenderTarget(rt);
167       this.renderer.render(targetView.scene, this.virtualCamera);
...
174     this.renderer.setRenderTarget(null);
175     this.renderer.render(view.scene, this.camera);
176   }
```
事実: ポータルは各レンダーターゲットへ接続先を描き、テクスチャとしてシーンに使う。
最後に setRenderTarget(null) で現在シーンをキャンバスへ直接描画している。
→ この最後の本描画を「sceneRT へ描く → SketchPass で画面へ」に置き換える。ポータルRT群は不変。

## src/adapters/rendering/ThreeRendererAdapter.ts(コンストラクタ/サイズ)
```
81     this.renderer = new THREE.WebGLRenderer({ antialias: true });
95     const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
100      this.renderTargetPool.push(new THREE.WebGLRenderTarget(size.x, size.y));
```
事実: 描画バッファサイズで RT を作る。
→ 同サイズで `sceneRT` を1枚作り、SketchPass の resolution に渡す。

## src/adapters/rendering/ThreeRendererAdapter.ts(リサイズ)
```
277     this.renderer.setSize(w, h);
279     const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
280     for (const rt of this.renderTargetPool) rt.setSize(size.x, size.y);
```
事実: リサイズで RT を再設定。
→ ここで sceneRT.setSize と SketchPass.setSize も呼ぶ。

## 結論
- 最終本描画だけをポスト化すれば、ポータル等の既存描画はそのまま使える(影響最小)。
- エフェクトは SketchPass に分離し、外せば従来描画に戻る(安全に忘れられる)。
- 記載と実コードに齟齬なし。`## 修正の提案` は不要。
