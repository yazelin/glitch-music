import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLrc, lineIndexAt } from "../js/lrc.js";

test("基本 LRC:時間標籤+文字", () => {
  const r = parseLrc("[00:01.50]我是格莉奇\n[00:04.20]請多指教");
  assert.deepEqual(r, [
    { t: 1.5, text: "我是格莉奇" },
    { t: 4.2, text: "請多指教" },
  ]);
});

test("同一行多個時間標籤(副歌重複)展開成多行並排序", () => {
  const r = parseLrc("[00:10.00][01:00.00]記憶體，記憶體\n[00:20.00]中間");
  assert.deepEqual(r.map(x => x.t), [10, 20, 60]);
  assert.equal(r[0].text, "記憶體，記憶體");
  assert.equal(r[2].text, "記憶體，記憶體");
});

test("分:秒.百分秒 與 分:秒 都吃;metadata 標籤([ti:][ar:]...)忽略", () => {
  const r = parseLrc("[ti:格莉奇 4KB]\n[ar:yaze_lin_j303]\n[01:02]晚安\n[00:59.999]早安");
  assert.deepEqual(r.map(x => [x.t, x.text]), [[59.999, "早安"], [62, "晚安"]]);
});

test("空文字行與空白行丟掉", () => {
  const r = parseLrc("[00:01.00]\n\n[00:02.00]   \n[00:03.00]有字");
  assert.deepEqual(r, [{ t: 3, text: "有字" }]);
});

test("壞輸入回空陣列", () => {
  assert.deepEqual(parseLrc(""), []);
  assert.deepEqual(parseLrc(null), []);
  assert.deepEqual(parseLrc("沒有任何標籤的純文字"), []);
});

test("lineIndexAt:回目前時間該亮的行,-1 代表還沒開始", () => {
  const lines = parseLrc("[00:01.00]a\n[00:05.00]b\n[00:09.00]c");
  assert.equal(lineIndexAt(lines, 0), -1);
  assert.equal(lineIndexAt(lines, 1), 0);
  assert.equal(lineIndexAt(lines, 4.99), 0);
  assert.equal(lineIndexAt(lines, 5), 1);
  assert.equal(lineIndexAt(lines, 100), 2);
  assert.equal(lineIndexAt([], 10), -1);
});
