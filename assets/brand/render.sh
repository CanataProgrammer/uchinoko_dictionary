#!/usr/bin/env bash
# ═══════════════════════════════════════════
#  アイコン・埋め込み画像を書き出すスクリプト
#  icon.svg / og.html を編集したあとに、リポジトリのルートで実行する：
#     bash assets/brand/render.sh
#  必要なもの：Google Chrome（または Microsoft Edge）と Python
# ═══════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/../.."
BRAND="assets/brand"
# Chrome には絶対パスで渡す（Windows では C:/… 形式にする）
ROOT="$(pwd -W 2>/dev/null || pwd)"
PORT=8799

CHROME="${CHROME:-}"
for c in "/c/Program Files/Google/Chrome/Application/chrome.exe" \
         "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
         "$(command -v google-chrome || true)" "$(command -v chromium || true)"; do
  if [ -z "$CHROME" ] && [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; fi
done
[ -n "$CHROME" ] || { echo "Chrome / Edge が見つかりません" >&2; exit 1; }

PROFILE="$(mktemp -d)"
PROFILE_WIN="$(cygpath -w "$PROFILE" 2>/dev/null || echo "$PROFILE")"
python -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$PROFILE"' EXIT
for _ in $(seq 1 20); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.5
done

shot() { # 出力先 横 縦 倍率 背景色 URL
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE_WIN" \
    --window-size="$2,$3" --force-device-scale-factor="$4" --default-background-color="$5" \
    --virtual-time-budget=10000 --screenshot="$ROOT/$1" "http://localhost:$PORT/$6" >/dev/null 2>&1
  [ -s "$1" ] || { echo "書き出しに失敗しました: $1" >&2; exit 1; }
  echo "  $1"
}

echo "書き出し中…"
ICON="$BRAND/icon.svg?t=$(date +%s)"
shot "$BRAND/favicon-16.png"        512 512 0.03125   00000000 "$ICON"
shot "$BRAND/favicon-32.png"        512 512 0.0625    00000000 "$ICON"
shot "$BRAND/favicon-48.png"        512 512 0.09375   00000000 "$ICON"
shot "$BRAND/apple-touch-icon.png"  512 512 0.3515625 1c1f31ff "$ICON"
shot "$BRAND/icon-192.png"          512 512 0.375     00000000 "$ICON"
shot "$BRAND/icon-512.png"          512 512 1         00000000 "$ICON"
shot "$BRAND/og-image.png"          1200 630 1        f6f4efff "$BRAND/og.html?t=$(date +%s)"

# favicon.ico（16 / 32 / 48px の PNG をまとめる）
python - "$BRAND" <<'PY'
import struct, sys, pathlib
brand = pathlib.Path(sys.argv[1])
images = [(s, (brand / f'favicon-{s}.png').read_bytes()) for s in (16, 32, 48)]
header = struct.pack('<HHH', 0, 1, len(images))
offset = 6 + 16 * len(images)
entries, body = b'', b''
for size, data in images:
    entries += struct.pack('<BBBBHHII', size, size, 0, 0, 1, 32, len(data), offset + len(body))
    body += data
pathlib.Path('favicon.ico').write_bytes(header + entries + body)
print('  favicon.ico')
PY
echo "完了しました。"
