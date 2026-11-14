# HW05 網頁版

《FAIRY TAIL — 六神器與百年任務》的瀏覽器版本，不用下載就能玩：
**https://kazuto0126.github.io/1142922-homework/hw05/**

## 怎麼做到的

Windows 版是 C# WinForms + GDI+。網頁版用 .NET 10 WebAssembly 讓同一份 C# 在瀏覽器裡執行：

- **共用原始碼**：遊戲規則（`Core`）、所有畫面與演出（`UI/Art.cs`、`UI/GameForm.*.cs`）、音效合成（`Audio/Synth.cs`）直接連結 `../HW05-1142922` 的檔案，沒有複製一份。
- **`Shim/Drawing.cs`**：自己實作遊戲用到的那一小部分 `System.Drawing`（Graphics、GraphicsPath、筆刷、漸層、字型、點陣圖）。每個畫圖呼叫都記成一串數字指令，一格畫面只呼叫一次 JavaScript。
- **`wwwroot/gfx.js`**：把指令畫到 `<canvas>` 上。離屏點陣圖用 `OffscreenCanvas`。
- **`Web/Sound.cs` + `wwwroot/sound.js`**：取代 Windows 的 winmm。音效由 C# 合成後交給 Web Audio；音樂改成 mp3 串流，音量正規化和柔和限幅照 Windows 版的算法。
- **`Web/GameForm.Web.cs`**：取代 Windows 版和視窗有關的部分（計時、滑鼠／觸控、鍵盤、存檔改用 localStorage）。

## 建置與本機測試

需要 .NET 10 SDK。

```
dotnet publish -c Release -o publish
python serve.py 8765 publish/wwwroot
```

接著打開 http://localhost:8765 。

`wwwroot/music/` 的 mp3 是從 `../HW05-1142922/Assets/Music/*.wav` 用 ffmpeg 轉的（112 kbps）。`gains.json` 是各首歌壓到統一音量（RMS 0.05）的倍率。
