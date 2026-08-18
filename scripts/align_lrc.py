#!/usr/bin/env python3
"""把官方歌詞行對齊到 whisper 逐字時間戳,產 LRC。

用法:
  whisper-cli -m ggml-large-v3-turbo.bin -f song.wav -l zh --max-len 1 -oj -of words
  python3 scripts/align_lrc.py words.json  # 歌詞讀 tracks.json 第一首

ASR 對歌聲錯字率高沒關係:用 SequenceMatcher 的 matching blocks 做
單調對齊,只取「時間」,文字一律用官方歌詞。每行時間提前 0.25 秒
(唱歌起音比 ASR 切點早)。品質欄印出每行的對齊字數比例,人工驗收用。

ponytail: 全曲一次全域對齊;副歌重複若對錯段,手改輸出的 LRC 比加
啟發式便宜。
"""
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEAD = 0.25  # 秒,起音提前量

PUNCT = re.compile(r"[\s，。！？、…「」!?,.　]")


def lyric_lines():
    tracks = json.loads((ROOT / "tracks.json").read_text("utf-8"))
    lines = []
    for sec in tracks[0]["lyrics"]:
        for ln in sec["text"].split("\n"):
            ln = ln.strip()
            if ln:
                lines.append(ln)
    return lines


def asr_chars(words_json):
    d = json.loads(Path(words_json).read_text("utf-8"))
    segs = d.get("transcription") or d.get("segments") or []
    out = []
    for s in segs:
        t = (s.get("offsets") or {}).get("from", 0) / 1000
        for ch in s.get("text", ""):
            if not PUNCT.match(ch):
                out.append((ch, t))
    return out


def main():
    words_json = sys.argv[1]
    lines = lyric_lines()
    asr = asr_chars(words_json)
    asr_text = "".join(c for c, _ in asr)

    # 歌詞串成一條,記每行的字元起點
    starts, lyr = [], []
    for ln in lines:
        starts.append(len(lyr))
        lyr.extend(ch for ch in ln if not PUNCT.match(ch))
    lyr_text = "".join(lyr)

    # 全域單調對齊:lyric index -> asr index
    m = SequenceMatcher(None, lyr_text, asr_text, autojunk=False)
    lmap = {}
    for a, b, size in m.get_matching_blocks():
        for k in range(size):
            lmap[a + k] = b + k

    # 第一輪:每行的對齊時間與信心(對到字數比例)
    raw = []
    for i, ln in enumerate(lines):
        s = starts[i]
        e = starts[i + 1] if i + 1 < len(starts) else len(lyr_text)
        hits = [lmap[k] for k in range(s, e) if k in lmap]
        if hits:
            raw.append([asr[hits[0]][1], len(hits) / max(1, e - s), ln])
        else:
            raw.append([None, 0.0, ln])

    # 第二輪:信心 <0.3 視為不可靠(重複句常被 matcher 抓去別段),
    # 從「下一個可靠行」往回推(每行估 2.2 秒),比「前一行 +2」準得多——
    # 口白/間奏後面的行才不會被拉到大洞的開頭。
    RELIABLE, STEP = 0.3, 2.2
    for i, r in enumerate(raw):
        if r[1] >= RELIABLE:
            continue
        nxt = next((j for j in range(i + 1, len(raw)) if raw[j][1] >= RELIABLE), None)
        if nxt is not None:
            r[0] = raw[nxt][0] - STEP * (nxt - i)
        elif r[0] is None:
            r[0] = (raw[i - 1][0] or 0) + STEP if i else 0.0

    out, report = [], []
    prev_t = 0.0
    for t, q, ln in raw:
        t = max(0.0, (t or 0.0) - LEAD)
        t = max(t, prev_t + 0.01)  # 保持單調
        prev_t = t
        out.append((t, ln))
        report.append((t, q, ln))

    lrc = "\n".join(f"[{int(t//60):02d}:{t%60:05.2f}]{ln}" for t, ln in out)
    print(lrc)
    print("\n--- 對齊品質(時間 / 對到字數比例 / 行) ---", file=sys.stderr)
    for t, q, ln in report:
        flag = "  " if q >= .5 else ("?." if q > 0 else "!!")
        print(f"{flag} {t:7.2f}  {q:4.0%}  {ln}", file=sys.stderr)


if __name__ == "__main__":
    main()
