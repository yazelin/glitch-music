/* LRC 歌詞解析。純函式、無 DOM,node --test 直接測。
   支援 [mm:ss.xx] / [mm:ss] 時間標籤,同一行多標籤(副歌重複)展開;
   [ti:] [ar:] 這類 metadata 標籤忽略。輸出依時間排序的 [{t,text}]。 */

const TIME_RE = /\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g;

export function parseLrc(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const times = [];
    let m;
    TIME_RE.lastIndex = 0;
    while ((m = TIME_RE.exec(raw))) times.push(Number(m[1]) * 60 + Number(m[2]));
    if (!times.length) continue;
    const line = raw.replace(TIME_RE, "").trim();
    if (!line) continue;
    for (const t of times) out.push({ t, text: line });
  }
  return out.sort((a, b) => a.t - b.t);
}

// 目前播放秒數該亮哪一行(最後一個 t<=sec 的索引);還沒到第一行回 -1
export function lineIndexAt(lines, sec) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= sec) idx = i; else break;
  }
  return idx;
}
