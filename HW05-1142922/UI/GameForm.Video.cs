using System.Diagnostics;
using System.Drawing.Imaging;
using CandyLegend.Audio;
using CandyLegend.Core;

namespace CandyLegend.UI;

/// <summary>
/// 錄製展示影片：遊戲照劇本自己玩一遍，每一格畫面直接送進 ffmpeg 編碼，聲音一格一格取出，
/// 音效與音樂分成兩個 WAV（之後合成「有音樂」與「沒有音樂」兩個版本）。字幕直接畫在畫面上。
/// 用法：HW05-1142922.exe --video 輸出資料夾 ffmpeg.exe
/// </summary>
internal sealed partial class GameForm
{
    private string? _caption;
    private bool _showCursor;

    private void DrawCaption(Graphics g)
    {
        if (_showCursor)
        {
            Art.Disc(g, Color.FromArgb(120, 255, 255, 255), 0, _mouse.X, _mouse.Y, 16);
            using var pen = new Pen(Art.Ink, 3);
            g.DrawEllipse(pen, _mouse.X - 16, _mouse.Y - 16, 32, 32);
            Art.Poly(g, Color.White, 2.4f, _mouse.X, _mouse.Y, _mouse.X + 6, _mouse.Y + 22, _mouse.X + 11, _mouse.Y + 13, _mouse.X + 21, _mouse.Y + 9);
        }

        if (string.IsNullOrEmpty(_caption)) return;
        string[] lines = _caption.Split('\n');
        float lineH = 34, height = lines.Length * lineH + 18;
        float width = lines.Max(l => Art.Measure(g, l, 24)) + 60;
        var box = new RectangleF(W / 2f - width / 2, H - height - 10, width, height);
        Art.Fill(g, Color.FromArgb(200, 8, 6, 18), box, 12);
        for (int i = 0; i < lines.Length; i++)
            Art.Outlined(g, lines[i], 24, Color.White, Art.Ink, 5, W / 2f, box.Y + 9 + lineH * (i + 0.5f), 1, 0, 1, lines[i].Any(ch => ch is >= '぀' and <= 'ヿ'));
    }

#if !RELEASE_EXE
    // 錄影工具只在開發版編譯：交付的 exe（發佈設定定義 RELEASE_EXE）不含啟動外部程式的程式碼。
    public static void Video(string dir, string ffmpeg)
    {
        Directory.CreateDirectory(dir);
        Sound.InitOffline();
        using var f = new GameForm(true, 1.5f);
        using var rec = new Recorder(f, dir, ffmpeg);
        f.Script(rec);
        rec.Finish();
    }

    private sealed class Recorder : IDisposable
    {
        public const int Fps = 30;
        private const int Samples = Synth.SR / Fps;
        private readonly GameForm _f;
        private readonly Process _ffmpeg;
        private readonly Stream _pipe;
        private readonly Bitmap _frame;
        private readonly byte[] _bytes;
        private readonly float[] _l = new float[Samples], _r = new float[Samples], _ml = new float[Samples], _mr = new float[Samples];
        private readonly BinaryWriter _sfx, _music;
        private readonly string _dir;
        public int Frames;

        public Recorder(GameForm f, string dir, string ffmpeg)
        {
            _f = f;
            _dir = dir;
            Size size = f.ClientSize;
            _frame = new Bitmap(size.Width, size.Height, PixelFormat.Format32bppArgb);
            _bytes = new byte[size.Width * size.Height * 4];
            _ffmpeg = Process.Start(new ProcessStartInfo(ffmpeg,
                $"-v error -y -f rawvideo -pix_fmt bgra -s {size.Width}x{size.Height} -r {Fps} -i - -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p \"{Path.Combine(dir, "video.mp4")}\"")
            {
                RedirectStandardInput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            })!;
            _pipe = _ffmpeg.StandardInput.BaseStream;
            _sfx = Wav(Path.Combine(dir, "sfx.wav"));
            _music = Wav(Path.Combine(dir, "music.wav"));
        }

        private static BinaryWriter Wav(string path)
        {
            var w = new BinaryWriter(File.Create(path));
            w.Write(new byte[44]);
            return w;
        }

        private static void CloseWav(BinaryWriter w)
        {
            long data = w.BaseStream.Length - 44;
            w.Seek(0, SeekOrigin.Begin);
            w.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
            w.Write((int)(36 + data));
            w.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt "));
            w.Write(16);
            w.Write((short)3);
            w.Write((short)2);
            w.Write(Synth.SR);
            w.Write(Synth.SR * 8);
            w.Write((short)8);
            w.Write((short)32);
            w.Write(System.Text.Encoding.ASCII.GetBytes("data"));
            w.Write((int)data);
            w.Dispose();
        }

        /// <summary>前進一格（1/30 秒）：更新遊戲、畫畫面、取聲音。</summary>
        public void Step()
        {
            _f.Tick(1f / Fps);
            using (Graphics g = Graphics.FromImage(_frame)) _f.Render(g);
            BitmapData data = _frame.LockBits(new Rectangle(0, 0, _frame.Width, _frame.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            System.Runtime.InteropServices.Marshal.Copy(data.Scan0, _bytes, 0, _bytes.Length);
            _frame.UnlockBits(data);
            _pipe.Write(_bytes, 0, _bytes.Length);
            Sound.RenderOffline(_l, _r, _ml, _mr, Samples);
            for (int i = 0; i < Samples; i++)
            {
                _sfx.Write(_l[i]);
                _sfx.Write(_r[i]);
                _music.Write(_ml[i]);
                _music.Write(_mr[i]);
            }

            Frames++;
            string state = (_f._caption ?? "") + (_f._qteOn ? " [QTE]" : "") + " " + _f._overlay + " " + _f._scene;
            if (state != _lastState)
            {
                _lastState = state;
                _log.AppendLine($"{Frames / (double)Fps,7:0.0}s  {state.Replace('\n', ' ')}");
            }
        }

        private string _lastState = "";
        private readonly System.Text.StringBuilder _log = new();

        public void Wait(float seconds)
        {
            int n = (int)Math.Round(seconds * Fps);
            for (int i = 0; i < n; i++) Step();
        }

        /// <summary>一直前進直到條件成立（或超過上限秒數）。</summary>
        public void Until(Func<bool> done, float max)
        {
            for (int i = 0; i < max * Fps && !done(); i++) Step();
        }

        public void Finish()
        {
            _pipe.Flush();
            _pipe.Close();
            _ffmpeg.WaitForExit();
            CloseWav(_sfx);
            CloseWav(_music);
            File.WriteAllText(Path.Combine(_dir, "frames.txt"), $"{Frames} frames, {Frames / (double)Fps:0.0} s\n" + _log);
        }

        public void Dispose()
        {
            _frame.Dispose();
            _ffmpeg.Dispose();
        }
    }

    // ───────────────────────── 劇本 ─────────────────────────

    /// <summary>讓機器人走一步（挑價值最高的一步），然後等到盤面靜止。</summary>
    private void BotMove(Recorder rec, float settle = 0.25f)
    {
        rec.Until(() => CanInput || _ending || _overlay != Overlay.None || _qteOn, 8);
        if (!CanInput) return;
        List<Move> moves = _s!.Board.FindMoves();
        if (moves.Count == 0) return;
        Move pick = moves.MaxBy(m => m.Value);
        _mouse = Center(pick.A.X, pick.A.Y);
        TrySwapCells(pick.A, pick.B);
        rec.Until(() => (!_pumping && CanInput) || _ending || _overlay != Overlay.None || _qteOn, 12);
        rec.Wait(settle);
    }

    private void Moves(Recorder rec, int count, float settle = 0.25f)
    {
        for (int i = 0; i < count && _s!.State == PlayState.Playing && !_ending && _overlay == Overlay.None; i++) BotMove(rec, settle);
    }

    private void Play(int levelIndex, int cleared)
    {
        _demo = false;
        _progress.Cleared = cleared;
        StartLevel(levelIndex);
    }

    private void Script(Recorder rec)
    {
        // 1. 開場動畫（約 10 秒）
        Sound.Music(Sound.Title);
        _scene = Scene.Opening;
        _openT = 0;
        _caption = "1142922　HW05《FAIRY TAIL — 六神器與百年任務》\n開場動畫：公會徽章 → 六件神器 → 黑龍剪影 → 標題";
        rec.Until(() => _scene == Scene.Title, 12);

        // 2. 標題
        _caption = "標題畫面（音樂：Butterfly 去人聲版）\n右下角「展示模式」可以直接跳到每個亮點，方便展示";
        rec.Wait(4.5f);

        // 3. 地圖
        _progress.Cleared = 9;
        GoMap();
        _caption = "關卡地圖：共十關。第 1–6 關各取得一件神器（取自 FAIRY TAIL 的招式）\n第 7–9 關神器強化，第 10 關魔王決戰";
        rec.Wait(6);

        // 4. 第 1 關：基本玩法
        Play(0, 6);
        _caption = "第 1 關 分數挑戰：9×9 盤面，三個以上同屬性就消除\n新掉下來的糖晶比較容易接成連鎖";
        rec.Wait(2.5f);
        Moves(rec, 2);
        _caption = "連四個 → 橫斬／直斬，L、T 型 → 炸彈，連五個 → 核心（消滅整種屬性）\n連鎖越長倍率越高：×1、×3、×6、×10……";
        Moves(rec, 2);
        _caption = "一步之內 7 連鎖就進入 FAIRY FEVER（三步分數 ×2）\n喊聲與特效都用日文漫畫風格";
        Moves(rec, 2);
        _caption = "消除對應屬性會幫神器充能（右下）\n充滿就自動發動必殺技，不用另外點";
        Moves(rec, 1);
        _caption = "達成目標後，剩下的步數變成「ラストラッシュ」\n每一步化成金光飛去把糖晶變成特殊糖晶引爆";
        _s!.Score = Math.Max(_s.Score, _s.Level.TargetScore - 10);
        _s.Moves = Math.Min(_s.Moves, 4);
        Moves(rec, 1);
        rec.Until(() => _overlay == Overlay.Win, 25);
        _caption = "過關畫面：分數、星級評價與破關獎勵（這關得到神器「紅蓮鳳凰劍」）";
        rec.Wait(3);

        // 5. 第 2 關：厚冰＋收集掉落物
        Play(1, 6);
        _caption = "第 2 關 霜華之谷：收集掉落物——讓哈比的魚掉到最底排\n場地機關「厚冰」：要消兩次才會破";
        rec.Wait(2.5f);
        Moves(rec, 4);

        // 6. 第 3 關：強風
        Play(2, 6);
        _caption = "第 3 關 天空草原：場地機關「強風」\n糖晶會往旁邊掉，每 4 步風向反轉，魚要被吹到下風處的邊上";
        rec.Wait(2.5f);
        _s!.HazardCounter = 1;
        Moves(rec, 4);

        // 7. 第 4 關：落雷
        Play(3, 6);
        _caption = "第 4 關 雷鳴峽谷：清除果凍\n場地機關「落雷」：每 3 步隨機劈碎兩格";
        rec.Wait(2.5f);
        _s!.HazardCounter = 1;
        Moves(rec, 4);

        // 8. 第 5 關：傳送門
        Play(4, 6);
        _caption = "第 5 關 星靈神殿：場地機關「傳送門」\n掉進底部傳送門的糖晶，會從另一行的頂端掉出來";
        rec.Wait(2.5f);
        Moves(rec, 4);

        // 9. 六招必殺技（強化版）
        // 用一個不會過關的展示關卡，技能打完盤面也不會跳出過關畫面。
        _demo = true;
        _progress.Cleared = 9;
        StartLevel(new LevelDef { Number = 7, Name = "神器展示", Mode = LevelMode.Score, Moves = 99, TargetScore = 99_999_999 });
        rec.Until(() => CanInput, 6);
        for (int i = 0; i < 6; i++)
        {
            ArtifactInfo info = Levels.Artifacts[i];
            _caption = $"神器必殺技 {i + 1}/6：「{info.Name}」→ 強化版「{info.Skill2}」\n全畫面漫畫特寫＋每招專屬特效（第 7–9 關破關後強化）";
            _s!.Charge[i] = _s.ChargeNeed;
            UseArtifact(i);
            rec.Until(() => CanInput, 10);
            rec.Wait(0.5f);
        }

        // 10. 合體魔法與妖精的光耀
        for (int u = 0; u < Levels.Unisons.Length; u++)
        {
            UnisonInfo info = Levels.Unisons[u];
            _caption = $"合體魔法（ユニゾンレイド）：兩件搭檔神器同時充滿就合放\n「{info.Name}」（{info.Pair}，取自原作）";
            UseUnison(u);
            rec.Until(() => CanInput, 10);
            rec.Wait(0.5f);
        }

        _caption = "六件神器都發動過（神器欄的★全亮）\n就施放妖精三大魔法之一「妖精的光耀」，打中整個盤面";
        for (int i = 0; i < 6; i++) _s!.GlitterLamp[i] = true;
        rec.Wait(1.2f);
        UseGlitter();
        rec.Until(() => CanInput, 10);
        rec.Wait(0.6f);

        // 11. 魔王戰
        Play(9, 9);
        _caption = "第 10 關 魔王決戰：黑龍阿庫諾洛基亞（第一階段：人形態）\n音樂：約束の日／ANIMA 去人聲版輪流播放";
        rec.Wait(2.5f);
        Moves(rec, 2);
        _caption = "消除糖晶就是攻擊，連鎖越多傷害越高\n魔王每隔幾步出招：終焉的黑羽、黑龍的咆哮、黑龍的吞噬";
        Moves(rec, 2);
        _caption = "血量剩一半：龍化！換成龍形態，音樂換成 FAIRY TAIL 主題曲加長版";
        _s!.DemoTransform();
        DemoKick();
        rec.Until(() => CanInput, 8);
        rec.Wait(0.5f);
        _caption = "龍化後的「黑龍的咆哮」要先蓄力\n防禦小遊戲：3.4 秒內照 1→4 點擊魔法陣擋下來";
        // 冰神器每次發動都會拖延魔王出招，錄影時直接讓咆哮開始蓄力。
        rec.Until(() => CanInput, 8);
        rec.Wait(1.5f);
        _s!.DemoRoar();
        StartQte();
        DemoKick();
        if (_qteOn)
        {
            _showCursor = true;
            rec.Wait(0.5f);
            for (int i = 0; i < _qteTargets.Count && _qteOn; i++)
            {
                PointF from = _mouse, to = _qteTargets[i];
                for (int k = 1; k <= 8; k++)
                {
                    float t = k / 8f;
                    _mouse = new PointF(from.X + (to.X - from.X) * t, from.Y + (to.Y - from.Y) * t);
                    rec.Step();
                }

                QteClick();
                rec.Wait(0.2f);
            }

            _showCursor = false;
            _caption = "擋下來就反擊（扣魔王 5% 血量）\n沒擋下會有一個十字的糖晶化為岩石";
            rec.Until(() => CanInput, 6);
            rec.Wait(2.5f);
        }

        _caption = "打倒黑龍！";
        _s!.BossHp = Math.Min(_s.BossHp, 1);
        Moves(rec, 1);
        rec.Until(() => _ending && _endTimer >= FinaleStart, 8);
        _caption = "擊倒魔王：金色妖精尾巴徽章\n「だって俺たちは、フェアリーテイルだから！」";
        rec.Until(() => _overlay == Overlay.Credits, 8);
        _caption = "片尾名單：列出所有歌曲、演唱者與圖片出處";
        rec.Wait(12);
        EndCredits();
        _caption = "過關結算";
        rec.Wait(3.5f);
        _caption = "謝謝觀看！　1142922　HW05";
        rec.Wait(3);
    }
#endif
}
