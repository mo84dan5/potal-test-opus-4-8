#!/bin/bash

# フォルダ→PDF変換スキルの依存ツールチェックスクリプト

echo "=== PDF変換ツールの依存関係チェック ==="
echo ""

# 色付き出力用
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# チェック結果の初期化
all_ok=true

# Node.js/npmのチェック
echo -n "Node.js/npm: "
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo -e "${GREEN}✓ インストール済み${NC} (node $(node --version), npm $(npm --version))"
else
    echo -e "${RED}✗ 見つかりません${NC}"
    echo "  → インストール方法: https://nodejs.org/"
    all_ok=false
fi

# md-to-pdfのチェック
echo -n "md-to-pdf: "
if command -v md-to-pdf &> /dev/null; then
    echo -e "${GREEN}✓ インストール済み${NC}"
else
    echo -e "${RED}✗ 見つかりません${NC}"
    echo "  → インストールコマンド: npm install -g md-to-pdf"
    all_ok=false
fi

# drawioのチェック
echo -n "drawio: "
if command -v drawio &> /dev/null; then
    echo -e "${GREEN}✓ インストール済み${NC}"
else
    echo -e "${RED}✗ 見つかりません${NC}"
    echo "  → インストールコマンド: brew install drawio"
    all_ok=false
fi

# Homebrewのチェック（macOSの場合）
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -n "Homebrew: "
    if command -v brew &> /dev/null; then
        echo -e "${GREEN}✓ インストール済み${NC}"
    else
        echo -e "${YELLOW}⚠ 見つかりません${NC}"
        echo "  → インストール方法: https://brew.sh/"
    fi
fi

# Google Chromeのチェック（macOS）
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -n "Google Chrome: "
    if [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
        echo -e "${GREEN}✓ インストール済み${NC}"
    else
        echo -e "${RED}✗ 見つかりません${NC}"
        echo "  → インストール方法: https://www.google.com/chrome/"
        all_ok=false
    fi
fi

echo ""
echo "==================================="

if [ "$all_ok" = true ]; then
    echo -e "${GREEN}✓ すべての依存ツールが利用可能です！${NC}"
    exit 0
else
    echo -e "${RED}✗ 一部のツールが不足しています。上記のインストール方法を参照してください。${NC}"
    exit 1
fi
