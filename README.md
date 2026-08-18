# 格莉奇音樂 · Glitch Music

「AI 腦 · 容量不足」角色格莉奇（Glitch）的專屬音樂播放器 PWA。
從[格莉奇OS](https://github.com/yazelin/ai-brain-site)拆出來的獨立站：
可以安裝成 App、離線播放、鎖屏控制，Android 螢幕關閉後繼續唱。

- 開始聽：<https://yazelin.github.io/glitch-music/>
- 格莉奇OS：<https://yazelin.github.io/ai-brain-site/>（站內「音樂」App 以 iframe 內嵌本站）

## 功能

| 功能 | 說明 |
| --- | --- |
| 內建曲庫 | `tracks.json` 資料驅動；加歌＝丟 mp3＋封面＋改 JSON，不用改程式 |
| 本機曲庫 | 「加入歌曲」或拖放：mp3／m4a／**mp4（取音軌）**／flac／ogg／wav，存進瀏覽器 IndexedDB（不上傳雲端）。mp3 讀 ID3（v2.2／v2.3／v2.4、unsynchronisation、檔尾 ID3v1、Big5 標成 latin1 的老檔）、mp4/m4a/m4v 讀 ilst atoms（含 moov>meta 變體），標題／演出者／專輯／封面都會帶出；解析器升級時啟動會自動補掃舊歌的標籤，不用重新匯入。歌曲 id＝內容 SHA-256：同一個檔重複匯入會自動略過（歌單頁匯入時仍會幫忙掛進該歌單），舊資料首次載入自動遷移合併。內建曲可從歌單移除，但會留在曲庫（它來自 tracks.json，刪了下次也會回來） |
| 播放模式 | 循環全部／單曲循環／隨機，加上一首／下一首（含鎖屏控制），設定會記住。自動接歌永遠跳過電台（電台＝轉台，不是歌單的一員） |
| 電台分頁 | 電台完全獨立於曲庫／歌單／佇列：自己的「電台」分頁，選一台就一直聽（不輪播、上一首下一首停用），轉台＝回電台頁點別台，點任何歌即退出電台模式。內建預設台（**警廣×4、國立教育廣播電臺**、飛碟電台、SomaFM×2、Radio Paradise、LISTEN.moe，皆為官方公開串流；HLS 台＝原生優先，3.5 秒起不來自動改走自架 hls.js——各家伺服器怪癖不一，例如教育電台的 wowza 原生解不動、hls.js 可以）只是預設值——可刪、可用「＋ 加電台」加自己的串流網址。播放顯示 LIVE；跨站音訊走第二顆 audio 元素、不接頻譜 graph（沒 CORS 的來源才不會被靜音），頻譜以模擬動畫呈現 |
| 多本歌單 | 「歌單」分頁：新增／改名／刪除歌單、從曲庫勾選加歌、**歌單頁就地匯入新歌（同時進曲庫並掛進該歌單）**、播放整本；「全部歌曲」是曲庫總表。佇列來源與內容都會記住 |
| 手勢操作 | 清單列按住 ☰ 拖曳排序、往左滑露出移除鈕再點才刪（防誤觸）；手機與滑鼠都通用 |
| 迷你播放列 | 非播放器分頁時顯示目前曲目與播放鍵，點了回播放器 |
| 主題配色 | 右上角一鍵循環四款：暗／淺 × glitch（藍綠紫）／補色（粉橘萊姆）。整站顏色走 design token，頻譜 canvas 的色相與混色模式跟著主題換（淺色底不能用加法發光），選擇會記住 |
| 頻譜視覺 | 桌面與 Android 接 Web Audio 真頻譜；iOS 不接 audio graph（背景會被掛起而斷音），改用時間函數模擬動畫 |
| 動態歌詞 | LRC 時間軸逐行高亮、自動捲動、點行跳播。自己的 mp3 讀內嵌 ID3 歌詞與同名 `.lrc`；沒有時間軸就退回靜態顯示。〈格莉奇 4KB〉的時間軸由 `scripts/align_lrc.py` 以 whisper 逐字時間戳對齊官方歌詞產生 |
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

單元測試（LRC 與 ID3 解析器）：

```bash
node --test tests/test_lrc.mjs tests/test_id3.mjs tests/test_mp4meta.mjs
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
