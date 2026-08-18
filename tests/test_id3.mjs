import { test } from "node:test";
import assert from "node:assert/strict";
import { parseId3 } from "../js/id3.js";

// ---- 合成 ID3v2 bytes 的小工具 ----
const enc = new TextEncoder();
function synchsafe(n) { return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]; }
function u32(n) { return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]; }
function frame(id, body, v = 3) {
  const size = v === 4 ? synchsafe(body.length) : u32(body.length);
  return [...enc.encode(id), ...size, 0, 0, ...body];
}
function tag(frames, v = 3) {
  const body = frames.flat();
  return new Uint8Array([...enc.encode("ID3"), v, 0, 0, ...synchsafe(body.length), ...body]).buffer;
}
const text = (s) => [3, ...enc.encode(s)]; // encoding 3 = utf8

test("v2.3 utf8 文字 frame:標題/演出者/專輯", () => {
  const buf = tag([
    frame("TIT2", text("格莉奇 4KB")),
    frame("TPE1", text("yaze_lin_j303")),
    frame("TALB", text("格莉奇專屬單曲")),
  ]);
  const r = parseId3(buf);
  assert.equal(r.title, "格莉奇 4KB");
  assert.equal(r.artist, "yaze_lin_j303");
  assert.equal(r.album, "格莉奇專屬單曲");
});

test("v2.4 synchsafe frame size 也吃", () => {
  const r = parseId3(tag([frame("TIT2", text("v4曲"), 4)], 4));
  assert.equal(r.title, "v4曲");
});

test("USLT 歌詞:enc+lang+desc\\0+text", () => {
  const body = [3, ...enc.encode("zho"), ...enc.encode("desc"), 0, ...enc.encode("[00:01.00]我是格莉奇\n[00:04.00]請多指教")];
  const r = parseId3(tag([frame("USLT", body)]));
  assert.ok(r.lyrics.includes("[00:01.00]我是格莉奇"));
});

test("APIC 封面:mime\\0 type desc\\0 data", () => {
  const png = [0x89, 0x50, 0x4e, 0x47, 1, 2, 3];
  const body = [3, ...enc.encode("image/png"), 0, 3, ...enc.encode("cover"), 0, ...png];
  const r = parseId3(tag([frame("APIC", body)]));
  assert.equal(r.picture.mime, "image/png");
  assert.deepEqual([...r.picture.data], png);
});

test("utf16 with BOM 文字也吃", () => {
  const utf16 = (s) => {
    const b = [1, 0xff, 0xfe];
    for (const ch of s) { const c = ch.codePointAt(0); b.push(c & 0xff, (c >> 8) & 0xff); }
    return b;
  };
  const r = parseId3(tag([frame("TIT2", utf16("中文歌"))]));
  assert.equal(r.title, "中文歌");
});

test("沒有 ID3 標頭回全空,不會丟例外", () => {
  const r = parseId3(new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer);
  assert.deepEqual(r, { title: null, artist: null, album: null, picture: null, lyrics: null });
});

test("ID3v2.2:三字 frame(TT2/TP1/TAL)+3-byte size", () => {
  const f22 = (id, body) => [...enc.encode(id), (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff, ...body];
  const body = [f22("TT2", text("老歌")), f22("TP1", text("老歌手"))].flat();
  const buf = new Uint8Array([...enc.encode("ID3"), 2, 0, 0, ...synchsafe(body.length), ...body]).buffer;
  const r = parseId3(buf);
  assert.equal(r.title, "老歌");
  assert.equal(r.artist, "老歌手");
});

test("unsynchronisation 旗標:FF 00 還原成 FF 再解析", () => {
  const inner = frame("TIT2", text("反同步"));
  // 人工插入 FF 00 序列:把 body 中每個 0xFF 後面塞 0x00
  const unsynced = [];
  for (const b of inner) { unsynced.push(b); if (b === 0xff) unsynced.push(0); }
  const buf = new Uint8Array([...enc.encode("ID3"), 3, 0, 0x80, ...synchsafe(unsynced.length), ...unsynced]).buffer;
  assert.equal(parseId3(buf).title, "反同步");
});

test("只有 ID3v1(檔尾 TAG 128 bytes)也抓得到", () => {
  const v1 = new Uint8Array(128);
  v1.set(enc.encode("TAG"));
  v1.set(enc.encode("Old Title"), 3);
  v1.set(enc.encode("Old Artist"), 33);
  v1.set(enc.encode("Old Album"), 63);
  const buf = new Uint8Array([0xff, 0xfb, 0x90, 0x00, ...new Uint8Array(100), ...v1]).buffer;
  const r = parseId3(buf);
  assert.equal(r.title, "Old Title");
  assert.equal(r.artist, "Old Artist");
  assert.equal(r.album, "Old Album");
});

test("Big5 位元組標成 latin1(台灣老檔常態)自動辨識", () => {
  // 「測試」的 Big5 bytes: B4 FA B8 D5
  const big5 = [0xb4, 0xfa, 0xb8, 0xd5];
  const r = parseId3(tag([frame("TIT2", [0, ...big5])]));
  assert.equal(r.title, "測試");
});

test("ID3v1 的 Big5 標籤也辨識", () => {
  const v1 = new Uint8Array(128);
  v1.set(enc.encode("TAG"));
  v1.set([0xb4, 0xfa, 0xb8, 0xd5], 3); // 測試
  const buf = new Uint8Array([0, 0, ...v1]).buffer;
  assert.equal(parseId3(buf).title, "測試");
});

test("壞 frame 尺寸(超出 tag)不會讀爆,已解析的照回", () => {
  const good = frame("TIT2", text("好曲"));
  const bad = [...enc.encode("TALB"), ...u32(999999), 0, 0, 1, 2];
  const r = parseId3(tag([good, bad]));
  assert.equal(r.title, "好曲");
  assert.equal(r.album, null);
});
