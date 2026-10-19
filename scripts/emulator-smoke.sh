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
    text, desc, cls = n.get("text") or "", n.get("content-desc") or "", n.get("class") or ""
    if want.startswith("class:"):
        hit = cls == want[6:]
    elif want.startswith("re:"):
        hit = bool(re.fullmatch(want[3:], text) or re.fullmatch(want[3:], desc))
    else:
        hit = text == want or desc == want
    if hit:
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds", "")))
        if x2 > x1 and y2 - y1 >= 40:  # a sliver at the screen edge does not count: scroll first
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

# ---- Focus lock (bounce-back): during focus, Home must bring One Thing back; after Stop it must not.
adb shell appops set "$PKG" SYSTEM_ALERT_WINDOW allow || true
adb shell appops set "$PKG" GET_USAGE_STATS allow || true
front() { adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -1; }
LOCK="not tested (the focus screens were not found)"
press "Today" || true
XY="$(find_xy "class:android.widget.EditText")"
if [ -n "$XY" ]; then
  adb shell input tap $XY
  sleep 1
  adb shell input text "Smoke%stest%sfocus"
  sleep 1
  press "Save" || true
fi
if press "Start focus" && press "re:Start [0-9]+ minutes"; then
  sleep 5
  echo "---- focus lock evidence after Start ----"
  if [ -n "$(find_xy "I finished it")" ]; then echo "Focus screen is open."; else echo "Focus screen did NOT open."; fi
  adb shell appops get "$PKG" | grep -iE "SYSTEM_ALERT_WINDOW|GET_USAGE_STATS" || true
  adb shell dumpsys activity services "$PKG" | grep -iE "ServiceRecord|FocusLockService|isForeground" | head -5 || true
  adb logcat -d -s OneThingFocus:V | tail -10
  adb shell input keyevent KEYCODE_HOME
  sleep 8
  echo "---- after Home ----"
  adb logcat -d -s OneThingFocus:V | tail -10
  front
  if front | grep -q "$PKG"; then
    echo "Focus lock: Home was pressed during focus, and One Thing came back."
    press "Stop focus" && press "Stop" || true
    sleep 2
    adb shell input keyevent KEYCODE_HOME
    sleep 5
    if front | grep -q "$PKG"; then LOCK="FAILED: still locked after Stop"; else LOCK="ok"; fi
  else
    LOCK="FAILED: Home left the app during focus"
  fi
fi
echo "Focus lock: $LOCK"
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
case "$LOCK" in
  FAILED*) echo "The focus lock test failed."; exit 1 ;;
esac
echo "No crash. The app is still running."
