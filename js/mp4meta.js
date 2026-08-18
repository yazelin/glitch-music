/* 最小 MP4/M4A metadata 解析器:走 moov>udta>meta>ilst,取
   ©nam(標題)/©ART(演出者)/©alb(專輯)/covr(封面)。
   box = [4B size][4B type][payload];meta 是 full box(type 後多 4B 版本旗標)。
   ponytail: size=1 的 64-bit box 直接放棄(音樂檔的 moov 不會用到);
   aART/其他欄位不收,要補再說。 */

const EMPTY = { title: null, artist: null, album: null, picture: null };

function walk(b, start, end, cb) {
  let i = start;
  while (i + 8 <= end) {
    const size = (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0;
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (size < 8 || i + size > end) break; // size=0/1 或讀爆:停止
    cb(type, i + 8, i + size);
    i += size;
  }
}

function findChild(b, start, end, name, fullBox = false) {
  let found = null;
  walk(b, start, end, (type, s, e) => {
    if (type === name && !found) found = [fullBox ? s + 4 : s, e];
  });
  return found;
}

export function parseMp4Meta(buffer) {
  const out = { ...EMPTY };
  const b = new Uint8Array(buffer);
  const dec = new TextDecoder("utf-8");

  const moov = findChild(b, 0, b.length, "moov");
  if (!moov) return out;
  // iTunes 慣例是 moov>udta>meta>ilst;部分工具寫成 moov>meta>ilst,兩條都找
  const udta = findChild(b, moov[0], moov[1], "udta");
  const meta = (udta && findChild(b, udta[0], udta[1], "meta", true)) || findChild(b, moov[0], moov[1], "meta", true);
  if (!meta) return out;
  const ilst = findChild(b, meta[0], meta[1], "ilst");
  if (!ilst) return out;

  walk(b, ilst[0], ilst[1], (type, s, e) => {
    const data = findChild(b, s, e, "data");
    if (!data || data[1] - data[0] < 8) return;
    const dataType = (b[data[0]] << 24 | b[data[0] + 1] << 16 | b[data[0] + 2] << 8 | b[data[0] + 3]) >>> 0;
    const payload = b.subarray(data[0] + 8, data[1]); // dataType(4)+locale(4) 之後
    if (type === "covr" && (dataType === 13 || dataType === 14) && !out.picture) {
      out.picture = { mime: dataType === 14 ? "image/png" : "image/jpeg", data: payload.slice() };
      return;
    }
    if (dataType !== 1) return; // 1 = UTF-8 文字
    const text = dec.decode(payload).trim();
    if (!text) return;
    if (type === "©nam" && !out.title) out.title = text;
    if (type === "©ART" && !out.artist) out.artist = text;
    if (type === "©alb" && !out.album) out.album = text;
  });
  return out;
}
