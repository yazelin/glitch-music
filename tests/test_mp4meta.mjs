import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMp4Meta } from "../js/mp4meta.js";

// ---- 合成 MP4 box 的小工具:[4B size][4B type][payload] ----
const enc = new TextEncoder();
function u32(n) { return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]; }
function box(type, ...payloads) {
  const body = payloads.flatMap(p => [...p]);
  return new Uint8Array([...u32(8 + body.length), ...typeBytes(type), ...body]);
}
function typeBytes(t) { return t === "©nam" || t.startsWith("©") ? [0xa9, ...enc.encode(t.slice(1))] : [...enc.encode(t)]; }
// ilst 項目:type 下面一個 data box:[size][data][4B dataType][4B locale][payload]
function item(type, dataType, payload) {
  return box(type, box("data", u32(dataType), u32(0), payload));
}
function file(...top) { return new Uint8Array(top.flatMap(b => [...b])).buffer; }
// meta 是 full box:type 後面多 4 bytes version/flags
const meta = (...kids) => box("meta", u32(0), ...kids);

test("moov>udta>meta>ilst 的標題/演出者/專輯", () => {
  const f = file(
    box("ftyp", enc.encode("isomiso2")),
    box("moov", box("udta", meta(box("ilst",
      item("©nam", 1, enc.encode("MP4曲名")),
      item("©ART", 1, enc.encode("MP4歌手")),
      item("©alb", 1, enc.encode("MP4專輯")),
    )))),
  );
  const r = parseMp4Meta(f);
  assert.equal(r.title, "MP4曲名");
  assert.equal(r.artist, "MP4歌手");
  assert.equal(r.album, "MP4專輯");
});

test("covr 封面:dataType 13=jpeg、14=png", () => {
  const jpg = [0xff, 0xd8, 0xff, 1, 2];
  const f = file(box("moov", box("udta", meta(box("ilst", item("covr", 13, jpg))))));
  const r = parseMp4Meta(f);
  assert.equal(r.picture.mime, "image/jpeg");
  assert.deepEqual([...r.picture.data], jpg);
  const png = [0x89, 0x50, 3];
  const r2 = parseMp4Meta(file(box("moov", box("udta", meta(box("ilst", item("covr", 14, png)))))));
  assert.equal(r2.picture.mime, "image/png");
});

test("moov 排在大 mdat 後面也找得到", () => {
  const f = file(
    box("mdat", new Uint8Array(5000)),
    box("moov", box("udta", meta(box("ilst", item("©nam", 1, enc.encode("後置moov")))))),
  );
  assert.equal(parseMp4Meta(f).title, "後置moov");
});

test("沒有 metadata 或不是 mp4 都回全空,不丟例外", () => {
  const empty = { title: null, artist: null, album: null, picture: null };
  assert.deepEqual(parseMp4Meta(file(box("ftyp", enc.encode("isom")), box("moov"))), empty);
  assert.deepEqual(parseMp4Meta(new Uint8Array([1, 2, 3]).buffer), empty);
  assert.deepEqual(parseMp4Meta(new ArrayBuffer(0)), empty);
});

test("壞 box 尺寸不會讀爆", () => {
  const bad = new Uint8Array([...u32(999999), ...enc.encode("moov"), 1, 2]);
  assert.deepEqual(parseMp4Meta(file(bad)).title, null);
});
