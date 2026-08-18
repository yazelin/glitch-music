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

test("壞 frame 尺寸(超出 tag)不會讀爆,已解析的照回", () => {
  const good = frame("TIT2", text("好曲"));
  const bad = [...enc.encode("TALB"), ...u32(999999), 0, 0, 1, 2];
  const r = parseId3(tag([good, bad]));
  assert.equal(r.title, "好曲");
  assert.equal(r.album, null);
});
