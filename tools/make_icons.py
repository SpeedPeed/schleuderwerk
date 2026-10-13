"""Zeichnet App-Icon und Startbildschirm per Code (keine externen Grafiken).
Ergebnis: tools/android-res/... (wird beim App-Bau ins Android-Projekt kopiert)

Start: python tools/make_icons.py   (benötigt Pillow)
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "android-res")
S = 1024
SKY_TOP, SKY_BOTTOM = (63, 134, 198), (247, 217, 171)
BODY, TRIM, GLASS, STRIPE = (232, 85, 61), (44, 44, 52), (43, 58, 85), (255, 210, 63)


def gradient(w, h):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(SKY_TOP, SKY_BOTTOM)))
    return img


def car_layer(size):
    """Low-Poly-Auto, schräg nach oben fliegend, mit Boost-Flamme."""
    L = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)
    cx, cy = S // 2, S // 2 + 20
    # Flamme
    d.polygon([(cx - 300, cy + 30), (cx - 470, cy - 10), (cx - 400, cy + 50), (cx - 500, cy + 90), (cx - 300, cy + 110)], fill=(255, 162, 46))
    d.polygon([(cx - 300, cy + 50), (cx - 400, cy + 50), (cx - 300, cy + 95)], fill=(255, 241, 122))
    # Karosserie
    d.polygon([(cx - 300, cy - 20), (cx + 170, cy - 20), (cx + 310, cy + 20), (cx + 310, cy + 120), (cx - 300, cy + 120)], fill=BODY)
    d.polygon([(cx - 200, cy - 20), (cx - 150, cy - 160), (cx + 90, cy - 160), (cx + 170, cy - 20)], fill=BODY)
    d.polygon([(cx - 170, cy - 30), (cx - 130, cy - 135), (cx - 20, cy - 135), (cx - 20, cy - 30)], fill=GLASS)
    d.polygon([(cx + 10, cy - 30), (cx + 10, cy - 135), (cx + 75, cy - 135), (cx + 140, cy - 30)], fill=GLASS)
    d.rectangle([cx - 300, cy + 30, cx + 310, cy + 55], fill=STRIPE)
    d.rectangle([cx + 290, cy + 60, cx + 325, cy + 95], fill=(255, 244, 176))
    d.rectangle([cx - 320, cy + 70, cx - 290, cy + 120], fill=TRIM)
    # Räder (Achteck = Low-Poly)
    import math
    for wx in (cx - 170, cx + 180):
        pts = [(wx + 85 * math.cos(a * math.pi / 4 + 0.39), cy + 130 + 85 * math.sin(a * math.pi / 4 + 0.39)) for a in range(8)]
        d.polygon(pts, fill=TRIM)
        pts = [(wx + 38 * math.cos(a * math.pi / 3), cy + 130 + 38 * math.sin(a * math.pi / 3)) for a in range(6)]
        d.polygon(pts, fill=(201, 201, 201))
    L = L.rotate(18, resample=Image.BICUBIC, center=(cx, cy))
    return L.resize((size, size), Image.LANCZOS)


def hill(img):
    d = ImageDraw.Draw(img)
    w, h = img.size
    d.polygon([(0, h * 0.78), (w * 0.35, h * 0.72), (w * 0.7, h * 0.8), (w, h * 0.74), (w, h), (0, h)], fill=(185, 162, 74))
    d.polygon([(0, h * 0.9), (w * 0.5, h * 0.86), (w, h * 0.92), (w, h), (0, h)], fill=(139, 90, 51))


def legacy_icon(round_):
    img = gradient(S, S)
    hill(img)
    car = car_layer(int(S * 0.82))
    img.paste(car, ((S - car.width) // 2, (S - car.height) // 2 - 30), car)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    if round_:
        md.ellipse([0, 0, S - 1, S - 1], fill=255)
    else:
        md.rounded_rectangle([0, 0, S - 1, S - 1], radius=180, fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def foreground():
    """Adaptives Icon: Motiv nur in der mittleren „Sicherheitszone“ (ca. 60 %)."""
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    car = car_layer(int(S * 0.6))
    out.paste(car, ((S - car.width) // 2, (S - car.height) // 2), car)
    return out


def background():
    img = gradient(S, S)
    hill(img)
    return img


def splash():
    w, h = 1280, 2560
    img = gradient(w, h)
    hill(img)
    car = car_layer(700)
    img.paste(car, ((w - 700) // 2, h // 2 - 450), car)
    return img


DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
leg, rnd, fg, bg = legacy_icon(False), legacy_icon(True), foreground(), background()
for name, k in DENS.items():
    d = os.path.join(OUT, f"mipmap-{name}")
    os.makedirs(d, exist_ok=True)
    s48, s108 = int(48 * k), int(108 * k)
    leg.resize((s48, s48), Image.LANCZOS).save(os.path.join(d, "ic_launcher.png"))
    rnd.resize((s48, s48), Image.LANCZOS).save(os.path.join(d, "ic_launcher_round.png"))
    fg.resize((s108, s108), Image.LANCZOS).save(os.path.join(d, "ic_launcher_foreground.png"))
    bg.resize((s108, s108), Image.LANCZOS).save(os.path.join(d, "ic_launcher_background.png"))
os.makedirs(os.path.join(HERE, "android-splash"), exist_ok=True)
splash().save(os.path.join(HERE, "android-splash", "splash.png"))
leg.resize((512, 512), Image.LANCZOS).save(os.path.join(HERE, "icon-preview.png"))
print("Icons und Startbild erzeugt.")
