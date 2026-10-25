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
# The web view does not always list its text box at once: look again, then tap the box's label instead.
XY="$(find_xy "class:android.widget.EditText")"
[ -z "$XY" ] && { sleep 3; XY="$(find_xy "class:android.widget.EditText")"; }
[ -z "$XY" ] && XY="$(find_xy "Pick your ONE thing now")"
cp "$OUT/ui.xml" "$OUT/ui-today.xml" 2>/dev/null || true
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

# ---- Phone time + scroll bubble (2026-10-25). The emulator has no TikTok, so the phone's Settings app plays the
# scroll app: open it for over a minute (the list shows apps used for a full minute), mark it "Scroll", turn the
# bubble on, open Settings again: the bubble must show, and a tap on it must bring One Thing back.
BUBBLE="not tested (a Phone time step was not found: see the Not on screen line above)"
adb shell am start -W -a android.settings.SETTINGS > /dev/null 2>&1
sleep 65
adb shell am start -W -n "$PKG/.MainActivity" > /dev/null 2>&1
sleep 5
press "Today" || true
if press "re:See|Set up"; then
  sleep 3
  if press "Turn the bubble on" && press "Scroll app: Settings"; then
    sleep 3
    adb shell am start -W -a android.settings.SETTINGS > /dev/null 2>&1
    sleep 8
    echo "---- bubble evidence ----"
    adb logcat -d -s OneThingScroll:V | tail -15
    adb shell dumpsys activity services "$PKG" | grep -iE "ScrollWatchService|isForeground" | head -4 || true
    adb shell screencap -p /sdcard/bubble.png && adb pull /sdcard/bubble.png "$OUT/bubble.png" > /dev/null 2>&1
    if adb logcat -d -s OneThingScroll:V | grep -q "bubble shown"; then
      # The service logs the bubble's real place ("bubble at X,Y size WxH"); a formula missed it by the status bar.
      POS="$(adb logcat -d -s OneThingScroll:V | grep -oE 'bubble at [0-9]+,[0-9]+ size [0-9]+x[0-9]+' | tail -1)"
      echo "bubble position: ${POS:-not logged}"
      if [ -n "$POS" ]; then
        read -r BX BY BW BH < <(echo "$POS" | sed -E 's/bubble at ([0-9]+),([0-9]+) size ([0-9]+)x([0-9]+)/\1 \2 \3 \4/')
        adb shell input tap $(( BX + BW / 2 )) $(( BY + BH / 2 ))
      else
        read -r W H < <(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1 | tr 'x' ' ')
        D="$(adb shell wm density | grep -oE '[0-9]+' | tail -1)"
        adb shell input tap $(( W - 72 * D / 160 + 28 * D / 160 )) $(( H * 3 / 10 + 28 * D / 160 ))
      fi
      sleep 5
      adb logcat -d -s OneThingScroll:V | grep -E "bubble tapped|open refused" | tail -2
      front
      if front | grep -q "$PKG"; then BUBBLE="ok"; else BUBBLE="FAILED: tapping the bubble did not open One Thing"; fi
    else
      BUBBLE="FAILED: no bubble over the scroll app"
    fi
  fi
fi
echo "Scroll bubble: $BUBBLE"
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
case "$BUBBLE" in
  FAILED*) echo "The scroll bubble test failed."; exit 1 ;;
esac
echo "No crash. The app is still running."
