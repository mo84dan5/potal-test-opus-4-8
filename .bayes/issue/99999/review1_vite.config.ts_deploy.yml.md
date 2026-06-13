# review1 デプロイ設定とビルド成果物の整合確認

対象issue: `.bayes/issue/99999/Three.jsポータルモバイルWebアプリ作成とGitHub_Pagesデプロイ.md`

## 確認1: vite.config.ts(関連コードPath id=10)

GitHub Pages のサブパス配信(`/potal-test-fable-05/`)と base 設定が一致しているかを確認。

```
vite.config.ts
1 import { defineConfig } from 'vite';
2
3 // GitHub Pages はリポジトリ名のサブパスで配信されるため base を固定する
4 export default defineConfig({
5   base: '/potal-test-fable-05/',
6   build: {
7     target: 'es2022',
8   },
9 });
```

→ リポジトリ名 `potal-test-fable-05` と一致。公開URL `https://mo84dan5.github.io/potal-test-fable-05/` で
配信HTMLが `/potal-test-fable-05/assets/index-Rx9HokFA.js` を参照し HTTP 200 / 492,090 bytes
(ローカルビルドの 492.09 kB と一致)を返すことを確認済み。**問題なし。**

## 確認2: .github/workflows/deploy.yml(関連コードPath id=11)

テスト→ビルド→Pagesアップロードの順序と、成果物パス `dist` の整合を確認。

```
.github/workflows/deploy.yml
1 name: Deploy to GitHub Pages
...省略
26       - run: npm ci
27       - run: npm test
28       - run: npm run build
29       - uses: actions/configure-pages@v5
30         with:
31           enablement: true
32       - uses: actions/upload-pages-artifact@v3
33         with:
34           path: dist
```

→ `npm test`(vitest 24件)が成功しないとデプロイされないゲートになっている。
`path: dist` は vite のデフォルト出力先と一致。Actions run #27359833068 成功を確認。**問題なし。**

## 修正の提案
なし(仕様書 FN-001〜003・画面仕様書とコードの記載齟齬も見つからなかった)。

備考: Actions の Node.js 20 deprecation 警告(2026-06-16以降 Node 24 強制)はアクション側の
ランタイム告知であり、checkout@v4 等は Node 24 でも動作するため現時点で対応不要。
