/* 最小 ID3v2 解析器:只取播放器要的東西——標題/演出者/專輯/封面/歌詞。
   支援 v2.3(frame size 為一般 uint32)與 v2.4(synchsafe);文字編碼
   0=latin1、1/2=utf16(BOM/BE)、3=utf8。
   ponytail: 不處理 unsynchronisation flag 與 SYLT frame(罕見);
   撞到就 fallback 檔名,要補再說。 */

const EMPTY = { title: null, artist: null, album: null, picture: null, lyrics: null };

function synchsafe(b, i) {
  return ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
}
function u32(b, i) {
  return (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
}

function decodeText(enc, bytes) {
  if (enc === 0) return new TextDecoder("latin1").decode(bytes);
  if (enc === 3) return new TextDecoder("utf-8").decode(bytes);
  // 1 = utf16 含 BOM、2 = utf16-be 無 BOM
  if (enc === 1 && bytes.length >= 2) {
    const le = bytes[0] === 0xff && bytes[1] === 0xfe;
    return new TextDecoder(le ? "utf-16le" : "utf-16be").decode(bytes.subarray(2));
  }
  return new TextDecoder("utf-16be").decode(bytes);
}

// 依編碼找字串終止子(latin1/utf8 是單一 0x00,utf16 是 0x00 0x00 對齊雙位元組)
function findTerm(bytes, start, enc) {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < bytes.length; i += 2) {
      if (bytes[i] === 0 && bytes[i + 1] === 0) return [i, i + 2];
    }
  } else {
    for (let i = start; i < bytes.length; i++) if (bytes[i] === 0) return [i, i + 1];
  }
  return [bytes.length, bytes.length];
}

const stripNul = (s) => s.replace(/\0+$/, "");

export function parseId3(buffer) {
  const out = { ...EMPTY };
  const b = new Uint8Array(buffer);
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return out;
  const ver = b[3];
  const tagSize = synchsafe(b, 6);
  const end = Math.min(10 + tagSize, b.length);
  let i = 10;
  if (b[5] & 0x40) i += synchsafe(b, 10) + 4; // extended header:跳過

  while (i + 10 <= end) {
    const id = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding 或壞資料
    const size = ver === 4 ? synchsafe(b, i + 4) : u32(b, i + 4);
    const bodyStart = i + 10;
    if (size <= 0 || bodyStart + size > end) break; // 尺寸讀爆:停止,保留已解析的
    const body = b.subarray(bodyStart, bodyStart + size);

    if (id === "TIT2" || id === "TPE1" || id === "TALB") {
      const val = stripNul(decodeText(body[0], body.subarray(1))).trim();
      if (val) {
        if (id === "TIT2") out.title = val;
        if (id === "TPE1") out.artist = val;
        if (id === "TALB") out.album = val;
      }
    } else if (id === "USLT" && body.length > 4) {
      const enc = body[0];
      // enc(1) + lang(3) + desc\0 + text
      const [, txtStart] = findTerm(body, 4, enc);
      const val = stripNul(decodeText(enc, body.subarray(txtStart))).trim();
      if (val && !out.lyrics) out.lyrics = val;
    } else if (id === "APIC" && body.length > 3) {
      const enc = body[0];
      const [mimeEnd] = findTerm(body, 1, 0); // mime 一律 latin1
      const mime = new TextDecoder("latin1").decode(body.subarray(1, mimeEnd));
      const descStart = mimeEnd + 1 + 1; // \0 + picture type(1)
      const [, dataStart] = findTerm(body, descStart, enc);
      if (dataStart < body.length && !out.picture) {
        out.picture = { mime: mime || "image/jpeg", data: body.slice(dataStart) };
      }
    }
    i = bodyStart + size;
  }
  return out;
}
