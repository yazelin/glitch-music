"""glitch-music 的 PWA 圖示：深藍底 + 放射頻譜環 + 發光核

全部用程式畫，沒有 AI 生圖：任何尺寸都銳利，配色直接吃站上的 --cy/--mint/--purple。
畫的時候放大 SS 倍再縮回來，邊緣才不會有鋸齒。
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 4                      # 超取樣倍率
BG = (9, 15, 20)            # --bg0 #090f14
CY = (37, 194, 232)         # --cy
MINT = (124, 243, 192)      # --mint
PURPLE = (183, 139, 255)    # --purple
CORE = (223, 250, 255)      # 淡青，接近 --ink
NBAR = 32


def _hue_at(t):
    """沿圓周把三個品牌色接成一個循環：青 → 薄荷 → 紫 → 青"""
    stops = [CY, MINT, PURPLE, CY]
    x = t * 3
    i = min(int(x), 2)
    f = x - i
    a, b = stops[i], stops[i + 1]
    return tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3))


def _bar_len(t):
    """幾個正弦疊起來的平滑起伏，比亂數像頻譜、而且每次都一樣"""
    a = math.tau * t
    v = (0.60 * math.sin(3 * a)
         + 0.25 * math.sin(7 * a + 1.1)
         + 0.15 * math.sin(11 * a + 2.3))
    return (v + 1) / 2


def render(size, content=1.0):
    """content = 內容佔畫布的比例（maskable 要縮進中央安全區）"""
    n = size * SS
    c = n / 2

    # 底：中央比邊緣亮一點，免得像一塊死色塊
    yy, xx = np.mgrid[0:n, 0:n]
    rr = np.hypot(xx - c, yy - c) / c
    k = np.clip(1 - rr, 0, 1) ** 2.2
    bg = np.dstack([(BG[i] + (26, 42, 55)[i] * k).clip(0, 255).astype(np.uint8)
                    for i in range(3)])
    img = Image.fromarray(bg, 'RGB')

    r0 = c * 0.56 * content                 # 環的內半徑
    lo, hi = c * 0.11 * content, c * 0.30 * content
    w = c * 0.052 * content                 # bar 粗細

    bars = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bars)
    for i in range(NBAR):
        t = i / NBAR
        ang = math.tau * t - math.pi / 2
        ln = lo + (hi - lo) * _bar_len(t)
        col = _hue_at(t) + (255,)
        x0, y0 = c + r0 * math.cos(ang), c + r0 * math.sin(ang)
        x1, y1 = c + (r0 + ln) * math.cos(ang), c + (r0 + ln) * math.sin(ang)
        bd.line([x0, y0, x1, y1], fill=col, width=round(w))
        for x, y in ((x0, y0), (x1, y1)):    # 圓頭
            bd.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=col)

    halo = bars.filter(ImageFilter.GaussianBlur(n * 0.018))
    img.paste(halo, (0, 0), halo)
    img.paste(bars, (0, 0), bars)

    # 中央發光核：高斯剖面，中心要有一片夠寬的亮區
    # （逐圈畫橢圓那種 alpha 收太快，亮的只剩中間幾個像素，看起來像髒污）
    rc = r0 * 0.60
    a = (np.exp(-(np.hypot(xx - c, yy - c) / rc * 2.0) ** 2) * 255)
    core = Image.fromarray(
        np.dstack([np.full((n, n), v, np.uint8) for v in CORE]
                  + [a.clip(0, 255).astype(np.uint8)]), 'RGBA')

    # 一條細橫帶往旁邊錯開，帶點青。兩條會把核拉成一團橫向糊影。
    h = max(2, round(rc * 0.13))
    top = round(c - rc * 0.10)
    mask = core.crop((0, top, n, top + h)).split()[3]
    band = Image.new('RGBA', (n, h), CY + (255,))
    band.putalpha(mask)
    core.paste(band, (round(rc * 0.20), top), band)

    img.paste(core, (0, 0), core)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    import pathlib
    out = pathlib.Path(__file__).resolve().parent.parent / 'images'
    for name, size, content in (('icon-v2-192.png', 192, 1.0),
                                ('icon-v2-512.png', 512, 1.0),
                                ('icon-v2-maskable-512.png', 512, 0.84)):
        render(size, content).save(out / name)
        print('寫出', name)
