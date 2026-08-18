/* 最小 ID3 解析器:只取播放器要的東西——標題/演出者/專輯/封面/歌詞。
   支援 v2.2(三字 frame)/v2.3/v2.4、unsynchronisation 旗標、檔尾 ID3v1,
   以及台灣老檔常態:Big5 位元組卻標成 latin1(有高位位元組就先試 Big5,
   解得出 CJK 才採用)。ponytail: SYLT 與 frame 級壓縮/加密不處理,罕見。 */

const EMPTY = { title: null, artist: null, album: null, picture: null, lyrics: null };

function synchsafe(b, i) {
  return ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
}
function u32(b, i) {
  return (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
}

// 標成 latin1 但其實是 Big5 的老檔:有高位位元組就先試 Big5,解得出中日韓
// 且沒有替換字元才採用;否則照 latin1。
function decodeLegacy(bytes) {
  let hasHigh = false;
  for (const b of bytes) if (b > 0x7f) { hasHigh = true; break; }
  if (hasHigh) {
    try {
      const t = new TextDecoder("big5").decode(bytes);
      if (!t.includes("\ufffd") && /[\u3000-\u9fff]/.test(t)) return t;
    } catch (_) {}
  }
  return new TextDecoder("latin1").decode(bytes);
}

function decodeText(enc, bytes) {
  if (enc === 0) return decodeLegacy(bytes);
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

// v2.2 三字 frame 對應到 v2.3 名稱
const V22 = { TT2: "TIT2", TP1: "TPE1", TAL: "TALB", ULT: "USLT", PIC: "APIC" };

function readId3v1(b, out) {
  if (b.length < 128) return;
  const s = b.length - 128;
  if (b[s] !== 0x54 || b[s + 1] !== 0x41 || b[s + 2] !== 0x47) return; // "TAG"
  const field = (a, len) => decodeLegacy(b.subarray(a, a + len)).replace(/\0.*$/, "").trim();
  if (!out.title) out.title = field(s + 3, 30) || null;
  if (!out.artist) out.artist = field(s + 33, 30) || null;
  if (!out.album) out.album = field(s + 63, 30) || null;
}

export function parseId3(buffer) {
  const out = { ...EMPTY };
  let b = new Uint8Array(buffer);
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) {
    readId3v1(b, out); // 沒有 v2 標頭:試檔尾 ID3v1
    return out;
  }
  const ver = b[3];
  const tagSize = synchsafe(b, 6);
  let end = Math.min(10 + tagSize, b.length);
  if (b[5] & 0x80) {
    // unsynchronisation:tag 內所有 FF 00 還原成 FF 再解析
    const fixed = [];
    for (let k = 10; k < end; k++) {
      fixed.push(b[k]);
      if (b[k] === 0xff && b[k + 1] === 0x00) k++;
    }
    const nb = new Uint8Array(10 + fixed.length);
    nb.set(b.subarray(0, 10));
    nb.set(fixed, 10);
    b = nb;
    end = b.length;
  }
  const v22 = ver === 2;
  const head = v22 ? 6 : 10;
  let i = 10;
  if (!v22 && (b[5] & 0x40)) i += synchsafe(b, 10) + 4; // extended header:跳過

  while (i + head <= end) {
    let id = v22
      ? String.fromCharCode(b[i], b[i + 1], b[i + 2])
      : String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    if (!(v22 ? /^[A-Z0-9]{3}$/ : /^[A-Z0-9]{4}$/).test(id)) break; // padding 或壞資料
    const size = v22
      ? (b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5]
      : ver === 4 ? synchsafe(b, i + 4) : u32(b, i + 4);
    if (v22) id = V22[id] || id;
    const bodyStart = i + head;
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
      let mime, descStart;
      if (v22) {
        // v2.2 PIC:enc(1)+format(3,如 JPG/PNG)+type(1)+desc\0+data
        const fmt = new TextDecoder("latin1").decode(body.subarray(1, 4));
        mime = fmt === "PNG" ? "image/png" : "image/jpeg";
        descStart = 5;
      } else {
        const [mimeEnd] = findTerm(body, 1, 0); // mime 一律 latin1
        mime = new TextDecoder("latin1").decode(body.subarray(1, mimeEnd));
        descStart = mimeEnd + 1 + 1; // \0 + picture type(1)
      }
      const [, dataStart] = findTerm(body, descStart, enc);
      if (dataStart < body.length && !out.picture) {
        out.picture = { mime: mime || "image/jpeg", data: body.slice(dataStart) };
      }
    }
    i = bodyStart + size;
  }
  readId3v1(new Uint8Array(buffer), out); // v2 缺的欄位用檔尾 v1 補
  return out;
}
