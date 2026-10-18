"""Make the One Thing app icons: the white seed mascot on the accent teal (approved 2026-10-18 on
brand/mascot-moods.html, like Phantom's white ghost on purple). Original art, no fonts, no third-party images.

The seed paths are the ones in src/ui/Mascot.tsx (idle pose). Chromium (Playwright) draws the SVG,
so the curves match the app exactly.

Writes into app/public/icons/:
  icon-192.png           purpose "any"      rounded teal square, transparent corners
  icon-512.png           purpose "any"      same, 512 px
  icon-maskable-512.png  purpose "maskable" full-bleed teal square; the seed sits well inside the
                                            central 80% safe zone (farthest point ~32% of the side
                                            from the centre; the limit is 40%)
  shortcut-talk-96.png   the long-press "Talk" shortcut (manifest "shortcuts"): white mic on a teal circle

Run from anywhere (Pillow + Playwright required):  python -I scripts/make-icons.py
On the same machine, running it again gives the same PNG files.
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"
TEAL = "#0F766E"  # the app accent (styles.css --accent)

# The white seed, idle pose (src/ui/Mascot.tsx), drawn in a 240 x 240 box.
SEED = """
  <path d="M118.6 74C118.4 63 120.6 54 125.6 48.6" fill="none" stroke="#75CAAD" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M123 51.3Q174.1 64.4 179.6 11.9Q131.9 3.7 123 51.3Z" fill="#85DAB9"/>
  <path d="M125.6 48.6C134 40 145 32.5 160 22.5" fill="none" stroke="#75CAAD" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M120 69C160 69 200 115 200 160C200 200 170 222 120 222C70 222 40 200 40 160C40 115 80 69 120 69Z" fill="#FFFFFF"/>
  <ellipse cx="83" cy="160.6" rx="10.4" ry="4.9" fill="#CDEFE3"/>
  <ellipse cx="157" cy="160.6" rx="10.4" ry="4.9" fill="#CDEFE3"/>
  <rect x="90.1" y="125" width="16.2" height="29.7" rx="8.1" fill="#1C252E"/>
  <circle cx="101.2" cy="132" r="3" fill="#FFFFFF"/>
  <rect x="133.7" y="125" width="16.2" height="29.7" rx="8.1" fill="#1C252E"/>
  <circle cx="144.8" cy="132" r="3" fill="#FFFFFF"/>
"""


def icon_svg(px: int, maskable: bool) -> str:
    # The seed's box is x 40..200, y 3..222 (centre 120, 112.5). Scale 0.62 = about 57% of the side.
    seed = f'<g transform="translate(120 128) scale(0.62) translate(-120 -112.5)">{SEED}</g>'
    ground = f'<rect width="240" height="240" fill="{TEAL}"/>' if maskable else f'<rect width="240" height="240" rx="54" fill="{TEAL}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" viewBox="0 0 240 240">{ground}{seed}</svg>'


def talk_svg(px: int) -> str:
    """The long-press "Talk" shortcut: a white mic (src/ui/Icon.tsx "mic") on a teal circle."""
    mic = ('<g transform="translate(24 24) scale(2)" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
           '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="{TEAL}"/>{mic}</svg>'


# ---------------------------------------------------------------- Android APK (Capacitor, 2026-10-18)

RES_DIR = Path(__file__).resolve().parent.parent / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
# The seed's farthest point from (120, 112.5) is the leaf tip, 117 units away.


def seed_at(cx: float, cy: float, scale: float, body: str = SEED) -> str:
    return f'<g transform="translate({cx} {cy}) scale({scale}) translate(-120 -112.5)">{body}</g>'


def foreground_svg(px: int) -> str:
    """Adaptive-icon front layer: 108 dp canvas, the seed inside the 66 dp safe circle (117 units -> 32 dp)."""
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" viewBox="0 0 108 108">{seed_at(54, 54, 32 / 117)}</svg>'


def round_svg(px: int) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" viewBox="0 0 240 240">'
            f'<circle cx="120" cy="120" r="120" fill="{TEAL}"/>{seed_at(120, 128, 0.62)}</svg>')


def status_svg(px: int) -> str:
    """Status-bar icon: Android uses only the alpha channel, so a white seed with see-through eyes."""
    eyes = ('<rect x="90.1" y="125" width="16.2" height="29.7" rx="8.1" fill="black"/>'
            '<rect x="133.7" y="125" width="16.2" height="29.7" rx="8.1" fill="black"/>')
    shape = ('<path d="M118.6 74C118.4 63 120.6 54 125.6 48.6" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/>'
             '<path d="M123 51.3Q174.1 64.4 179.6 11.9Q131.9 3.7 123 51.3Z" fill="white"/>'
             '<path d="M120 69C160 69 200 115 200 160C200 200 170 222 120 222C70 222 40 200 40 160C40 115 80 69 120 69Z" fill="white"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" viewBox="0 0 24 24">'
            f'<defs><mask id="m" maskUnits="userSpaceOnUse" x="-500" y="-500" width="1000" height="1000">'
            f'<rect x="-500" y="-500" width="1000" height="1000" fill="white"/>{eyes}</mask></defs>'
            f'{seed_at(12, 12, 11 / 117, f"<g mask=\"url(#m)\">{shape}</g>")}</svg>')


def splash_svg(w: int, h: int) -> str:
    side = min(w, h)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="{TEAL}"/>{seed_at(w / 2, h / 2, side * 0.3 / 219)}</svg>')


def android_targets() -> dict:
    out = {}
    for name, d in DENSITIES.items():
        legacy, fg, small = round(48 * d), round(108 * d), round(24 * d)
        out[RES_DIR / f"mipmap-{name}" / "ic_launcher.png"] = (legacy, legacy, icon_svg(legacy, False))
        out[RES_DIR / f"mipmap-{name}" / "ic_launcher_round.png"] = (legacy, legacy, round_svg(legacy))
        out[RES_DIR / f"mipmap-{name}" / "ic_launcher_foreground.png"] = (fg, fg, foreground_svg(fg))
        out[RES_DIR / f"drawable-{name}" / "ic_stat_seed.png"] = (small, small, status_svg(small))
    splashes = {"drawable": (480, 320)}
    for name, (w, h) in {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280), "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}.items():
        splashes[f"drawable-port-{name}"] = (w, h)
        splashes[f"drawable-land-{name}"] = (h, w)
    for folder, (w, h) in splashes.items():
        out[RES_DIR / folder / "splash.png"] = (w, h, splash_svg(w, h))
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    targets = {
        OUT_DIR / "icon-192.png": (192, 192, icon_svg(192, False)),
        OUT_DIR / "icon-512.png": (512, 512, icon_svg(512, False)),
        OUT_DIR / "icon-maskable-512.png": (512, 512, icon_svg(512, True)),
        OUT_DIR / "shortcut-talk-96.png": (96, 96, talk_svg(96)),
    }
    if RES_DIR.exists():  # the Android project exists after `npx cap add android`
        targets.update(android_targets())
        (RES_DIR / "values" / "ic_launcher_background.xml").write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            f'    <color name="ic_launcher_background">{TEAL}</color>\n</resources>\n', encoding="utf-8")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=1)
        for path, (w, h, svg) in targets.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            page.set_viewport_size({"width": w, "height": h})
            page.set_content(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
            page.locator("svg").screenshot(path=str(path), omit_background=True)
            print(f"wrote {path} ({w}x{h})")
        browser.close()


if __name__ == "__main__":
    main()
