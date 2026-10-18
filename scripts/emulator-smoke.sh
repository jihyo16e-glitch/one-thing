#!/usr/bin/env bash
# Smoke test for the One Thing APK on an Android emulator (GitHub Actions, see .github/workflows).
# Installs the APK, opens it, taps Skip -> the Talk button -> Speak, and fails if the app crashed.
# Usage: bash scripts/emulator-smoke.sh path/to/one-thing.apk
set -u
APK="$1"
PKG=app.onething.seed
OUT="${RUNNER_TEMP:-/tmp}/smoke"
mkdir -p "$OUT"

adb install -r "$APK" || { echo "Install failed."; exit 1; }
adb shell pm grant "$PKG" android.permission.RECORD_AUDIO || true
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS || true
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
sleep 15

# Prints "x y" of the first VISIBLE screen element whose text or label is exactly $1 (empty if none).
# Elements below the screen have bounds [0,0][0,0] and are skipped.
find_xy() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb pull /sdcard/ui.xml "$OUT/ui.xml" > /dev/null 2>&1
  python3 - "$1" "$OUT/ui.xml" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

want, path = sys.argv[1], sys.argv[2]
try:
    nodes = list(ET.parse(path).iter("node"))
except Exception:
    nodes = []
for n in nodes:
    if n.get("text") == want or n.get("content-desc") == want:
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds", "")))
        if x2 > x1 and y2 > y1:
            print((x1 + x2) // 2, (y1 + y2) // 2)
            break
PY
}

TAPPED=""
press() {
  local xy="" try
  for try in 1 2 3; do
    xy="$(find_xy "$1")"
    [ -n "$xy" ] && break
    adb shell input swipe 540 1600 540 700 300 # scroll down a little, then look again
    sleep 2
  done
  if [ -z "$xy" ]; then
    echo "Not on screen: $1"
    return 1
  fi
  adb shell input tap $xy
  TAPPED="$TAPPED [$1]"
  sleep 4
}

press "Skip" || true
press "Talk: speak or type what you need" && press "Speak" || true
sleep 10
adb shell screencap -p /sdcard/smoke.png && adb pull /sdcard/smoke.png "$OUT/smoke.png" > /dev/null 2>&1

adb logcat -d > "$OUT/logcat.txt"
echo "Tapped:${TAPPED:- nothing}"
echo "---- app log (last lines) ----"
grep -iE "AndroidRuntime|FATAL|Capacitor|SpeechRecognition|speech|onething" "$OUT/logcat.txt" | tail -60

if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  echo "---- crash ----"
  grep -A 40 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -60
  echo "The app crashed."
  exit 1
fi
if [ -z "$(adb shell pidof "$PKG")" ]; then
  echo "The app is not running any more."
  exit 1
fi
echo "No crash. The app is still running."
