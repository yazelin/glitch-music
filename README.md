# 格莉奇音樂 · Glitch Music

「AI 腦 · 容量不足」角色格莉奇（Glitch）的專屬音樂播放器 PWA。
從[格莉奇OS](https://github.com/yazelin/ai-brain-site)拆出來的獨立站：
可以安裝成 App、離線播放、鎖屏控制，Android 螢幕關閉後繼續唱。

- 開始聽：<https://yazelin.github.io/glitch-music/>
- 格莉奇OS：<https://yazelin.github.io/ai-brain-site/>（站內「音樂」App 以 iframe 內嵌本站）

## 功能

| 功能 | 說明 |
| --- | --- |
| 播放清單 | `tracks.json` 資料驅動；加歌＝丟 mp3＋封面＋改 JSON，不用改程式 |
| 頻譜視覺 | 桌面與 Android 接 Web Audio 真頻譜；iOS 不接 audio graph（背景會被掛起而斷音），改用時間函數模擬動畫 |
| 歌詞 | 側欄面板，段落與副歌樣式，資料在 `tracks.json` 內 |
| 鎖屏控制 | Media Session：播放／暫停、±10 秒、進度、（多首時）上一首／下一首 |
| PWA | 可安裝；SW 快取音檔並對 Range 請求合成 206，離線可播 |
| 離線徽章 | 「已可離線」由 SW 逐項 `cache.match` 實查後才顯示，不自我宣告 |

## 背景播放的平台現實

- Android Chrome／已安裝 PWA：`<audio>` 在螢幕關閉後繼續播放，鎖屏有控制列。
- iOS Safari 分頁：播放中鎖屏會續播。
- iOS 加入主畫面（standalone）：歷史上有鎖屏暫停災情，需真機驗證；本站已避開
  最大地雷（背景掛起的 AudioContext 讓聲音跟著斷），iOS 一律不把音訊接進 Web Audio。

## 開發

純 HTML/CSS/JS，無框架、無建置步驟。

```bash
git clone https://github.com/yazelin/glitch-music.git
cd glitch-music
python3 -m http.server 8000
```

改了 `index.html`、`manifest.webmanifest`、`tracks.json`、圖或音檔之後：

```bash
python3 scripts/update_sw_hashes.py
```

它依內容 hash 更新 `sw.js` 的兩層快取名（shell／asset），不用手動 bump 版號。

### 加一首歌

1. mp3 放進 `audio/`、封面放進 `images/`。
2. `tracks.json` 加一筆 `{id,title,artist,album,src,cover,duration,lyrics}`。
3. `sw.js` 的 `warm:start` 清單加上新音檔路徑，跑 `scripts/update_sw_hashes.py`。

## 部署

GitHub Pages，`main` 分支根目錄。推上去即生效。

---

作者：[GitHub](https://github.com/yazelin) | [Facebook](https://www.facebook.com/yaze.lin.gm) | [Buy Me a Coffee](https://buymeacoffee.com/yazelin)
