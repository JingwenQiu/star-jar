"""Generate PWA icons from the star-jar mascot.

Builds a macaron gradient tile, centres the mascot on it with a soft shadow,
then applies a rounded-square mask (or leaves it full-bleed + small for
maskable, which platforms crop to their own safe shape).
"""
from PIL import Image, ImageDraw, ImageFilter

SRC = 'assets/star-jar-mascot.png'
STOPS = [(255, 209, 220), (255, 234, 180), (200, 240, 226),
         (217, 201, 245), (199, 228, 255)]


def gradient(S):
    img = Image.new('RGBA', (S, S))
    px = img.load()
    span = len(STOPS) - 1
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * (S - 1)) * span
            i = min(int(t), span - 1)
            f = t - i
            a, b = STOPS[i], STOPS[i + 1]
            px[x, y] = (round(a[0] + (b[0] - a[0]) * f),
                        round(a[1] + (b[1] - a[1]) * f),
                        round(a[2] + (b[2] - a[2]) * f), 255)
    return img


def tile(S, art_ratio, radius_ratio, maskable=False):
    bg = gradient(S)

    art = Image.open(SRC).convert('RGBA')
    side = int(S * art_ratio)
    art.thumbnail((side, side), Image.LANCZOS)
    ox, oy = (S - art.width) // 2, (S - art.height) // 2

    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    shadow.paste((70, 58, 82, 105), (ox + 3, oy + 8), art)
    bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(S * 0.018)))

    bg.alpha_composite(art, (ox, oy))

    if maskable:
        # full bleed; the platform crops, so keep art inside the 80% safe zone
        return bg

    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=255)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out


JOBS = [
    ('icon-192.png', 192, 0.72, 0.22, False),
    ('icon-512.png', 512, 0.72, 0.22, False),
    ('icon-maskable-512.png', 512, 0.52, 0.0, True),
    ('apple-touch-icon.png', 180, 0.74, 0.20, False),
    ('favicon-64.png', 64, 0.78, 0.24, False),
]

for name, S, art, rad, maskable in JOBS:
    tile(S, art, rad, maskable).save('assets/' + name)
    print('wrote', name, f'{S}x{S}')
