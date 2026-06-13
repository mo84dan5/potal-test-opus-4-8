---
name: folder-to-pdf
description: フォルダ内のMarkdown、drawio、HTMLファイルを自動的にPDFに変換し、同じフォルダ構造を保持して出力先に配置します。PDF変換、ドキュメント生成、提出用資料作成、複数ファイルの一括PDF化が必要な時に使用してください。
---

# フォルダ→PDF一括変換スキル

このスキルは、指定されたフォルダ内のドキュメントファイル（Markdown、drawio、HTML）を自動的にPDF形式に変換し、元のフォルダ構造を保持したまま出力先フォルダに配置します。

## このスキルを使用するタイミング

- ドキュメントをPDF形式で提出する必要がある
- 複数のMarkdown、drawio、HTMLファイルを一括でPDF化したい
- フォルダ構造を維持したままPDFを生成したい
- プレゼンテーション資料や仕様書を配布用にPDF化したい
- drawioの複数タブを1つのPDFにまとめたい

## 対応ファイル形式

- **Markdown (.md)**: md-to-pdfを使用して変換
- **draw.io (.drawio)**: drawio CLIを使用して変換（全タブを1つのPDFに含む）
- **HTML (.html)**: Google Chrome Headlessモードを使用して変換

## 必要な依存ツール

このスキルは以下のツールを使用します：

1. **md-to-pdf**: Markdown → PDF変換
   - インストール: `npm install -g md-to-pdf`

2. **drawio**: draw.io → PDF変換
   - インストール: `brew install drawio` (macOS)

3. **Google Chrome**: HTML → PDF変換
   - macOSの場合、通常は既にインストール済み

## 使用方法

### 基本的な使い方

```
入力フォルダ: <変換元のフォルダパス>
出力フォルダ: <変換先のフォルダパス>
```

例：
```
入力フォルダ: docs/01.requirement_definition/04.統合
出力フォルダ: docs/01.requirement_definition/05.提出用
```

### 変換の流れ

1. 入力フォルダの構造を確認
2. 必要な依存ツールの確認とインストール
3. 出力フォルダに同じ構造を作成
4. ファイル形式ごとに変換:
   - Markdownファイル → PDF
   - drawioファイル → PDF（全タブ含む）
   - HTMLファイル → PDF
5. 変換されたPDFを出力フォルダに配置
6. 元のフォルダに生成された一時PDFファイルを削除

## AI アシスタント向けの指示

このスキルが起動された時、以下の手順を実行してください：

### ステップ1: 入力の確認

1. ユーザーから入力フォルダと出力フォルダのパスを取得
2. 入力フォルダの存在を確認
3. フォルダ構造とファイル一覧を取得:
   ```bash
   tree -L 3 "<入力フォルダ>"
   find "<入力フォルダ>" -type f \( -name "*.md" -o -name "*.drawio" -o -name "*.html" \)
   ```

### ステップ2: 依存ツールの確認とインストール

1. 必要なツールの確認:
   ```bash
   which md-to-pdf
   which drawio
   which node
   which npm
   ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
   ```

2. 不足しているツールがあればインストール:
   - md-to-pdf: `npm install -g md-to-pdf`
   - drawio: `brew install drawio`

### ステップ3: 出力フォルダ構造の作成

1. 入力フォルダのディレクトリ構造を分析
2. 出力フォルダに同じ構造を作成:
   ```bash
   mkdir -p "<出力フォルダ>/サブフォルダ1" "<出力フォルダ>/サブフォルダ2" ...
   ```

### ステップ4: ファイルの変換

#### Markdownファイルの変換

1. すべてのMarkdownファイルを検索
2. md-to-pdfで変換（A4サイズ、20mmマージン）:
   ```bash
   cd "<入力フォルダ>"
   md-to-pdf file1.md file2.md ... --pdf-options '{"format": "A4", "margin": {"top": "20mm", "right": "20mm", "bottom": "20mm", "left": "20mm"}}'
   ```
3. 生成されたPDFを出力フォルダにコピー

#### drawioファイルの変換

1. すべてのdrawioファイルを検索
2. drawio CLIで変換（全タブを含む）:
   ```bash
   drawio -x "<入力フォルダ>/サブフォルダ" -o "<出力フォルダ>/サブフォルダ" -f pdf -a --crop
   ```
   または個別変換:
   ```bash
   drawio -x "<入力ファイル.drawio>" -o "<出力ファイル.pdf>" -f pdf -a --crop
   ```

オプション説明:
- `-x`: エクスポートモード
- `-o`: 出力先
- `-f pdf`: PDF形式
- `-a`: 全ページ（全タブ）を含む
- `--crop`: 図のサイズにトリミング

#### HTMLファイルの変換

1. すべてのHTMLファイルを検索
2. Google Chrome Headlessモードで変換:
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless \
     --disable-gpu \
     --print-to-pdf="<出力パス>.pdf" \
     --print-to-pdf-no-header \
     "file://$(pwd)/<入力パス>.html"
   ```

### ステップ5: クリーンアップ

1. 入力フォルダに残った一時PDFファイルを削除:
   ```bash
   rm "<入力フォルダ>"/*.pdf
   rm "<入力フォルダ>/サブフォルダ"/*.pdf
   ```

### ステップ6: 確認と報告

1. 出力フォルダの構造を確認:
   ```bash
   tree "<出力フォルダ>"
   ```

2. 生成されたPDFファイル数を確認:
   ```bash
   find "<出力フォルダ>" -type f -name "*.pdf" | wc -l
   ```

3. ユーザーに結果を報告:
   - 変換されたファイル数
   - ファイル形式ごとの内訳
   - 出力フォルダの場所
   - フォルダをFinderで開く

## 変換オプション

### PDF生成オプション（Markdown）

デフォルト設定:
- フォーマット: A4
- マージン: 上下左右 20mm
- コードハイライト: github スタイル

カスタマイズ例:
```bash
md-to-pdf file.md --pdf-options '{"format": "Letter", "margin": {"top": "10mm"}}'
```

### PDF生成オプション（drawio）

デフォルト設定:
- 全タブを1つのPDFに含む（-a オプション）
- 図のサイズに自動トリミング（--crop）
- 透明な背景

追加オプション:
- `--border <width>`: 図の周りにボーダーを追加
- `--scale <scale>`: スケール調整
- `--width <width>`: 幅を指定

## ベストプラクティス

### 常に実行すること

- 変換前に入力フォルダの内容を確認
- 依存ツールの存在を確認してからインストール
- フォルダ構造を正確に保持
- 変換後にPDFファイル数を確認
- 元のフォルダから一時ファイルをクリーンアップ

### 絶対にしないこと

- ツールの確認をスキップしない
- 元のファイルを削除しない（PDFのみ削除）
- ユーザーの確認なしに大量のツールをインストールしない
- エラーを無視して続行しない

## トラブルシューティング

### 問題: md-to-pdfが見つからない

**原因**: npmパッケージがインストールされていない

**解決策**:
```bash
npm install -g md-to-pdf
```

### 問題: drawioコマンドが見つからない

**原因**: drawioがインストールされていない

**解決策**:
```bash
brew install drawio
```

### 問題: Chrome headlessモードが失敗する

**原因**: Google Chromeのパスが正しくない

**解決策**:
1. Chromeの存在を確認:
   ```bash
   ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
   ```
2. パスが異なる場合は適切なパスを使用

### 問題: drawioのPDFに一部のタブしか含まれない

**原因**: `-a`（--all-pages）オプションが指定されていない

**解決策**: 必ず`-a`オプションを付けて変換:
```bash
drawio -x input.drawio -o output.pdf -f pdf -a
```

### 問題: フォルダ構造が保持されない

**原因**: サブフォルダが作成されていない

**解決策**: 変換前にすべてのサブフォルダを作成:
```bash
find "<入力フォルダ>" -type d | sed "s|<入力フォルダ>|<出力フォルダ>|" | xargs mkdir -p
```

## 実行例

### 例1: 要件定義書フォルダの変換

```
入力: docs/01.requirement_definition/04.統合
出力: docs/01.requirement_definition/05.提出用

入力フォルダ構造:
04.統合/
├── 01.wireframe/ (90個の.drawioファイル)
├── グラフ形式の検討/
│   ├── index.html
│   └── グラフ形式の検討.md
├── 画面遷移図.drawio
├── integration_test_policy.md
└── その他.mdファイル

出力結果:
05.提出用/
├── 01.wireframe/ (90個のPDF)
├── グラフ形式の検討/
│   ├── index.pdf
│   └── グラフ形式の検討.pdf
├── 画面遷移図.pdf
├── integration_test_policy.pdf
└── その他のPDF
```

### 例2: ドキュメントフォルダの変換

```
入力: project-docs/
出力: project-docs-pdf/

変換対象:
- README.md → README.pdf
- architecture.md → architecture.pdf
- diagrams/system.drawio → diagrams/system.pdf
- presentation.html → presentation.pdf
```

## 補足情報

### 対応プラットフォーム

- **macOS**: 完全対応（すべてのツールが利用可能）
- **Linux**: md-to-pdf、drawio対応（Chromeのパス調整が必要）
- **Windows**: WSL環境での使用を推奨

### パフォーマンス

- 小規模（〜20ファイル）: 数秒〜1分
- 中規模（20〜100ファイル）: 1〜5分
- 大規模（100ファイル以上）: 5分以上

drawioファイルの変換は比較的時間がかかります。

### ファイルサイズ

- Markdown PDF: 通常数MB以内
- drawio PDF: 図の複雑さに依存（1〜10MB程度）
- HTML PDF: 内容に依存

## 関連リソース

- [md-to-pdf ドキュメント](https://www.npmjs.com/package/md-to-pdf)
- [draw.io デスクトップ](https://github.com/jgraph/drawio-desktop)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
