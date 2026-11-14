using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using CandyLegend.Audio;
using CandyLegend.Core;

namespace CandyLegend.UI;

internal enum Scene { Title, Map, Play, Opening }

internal enum Overlay { None, Intro, Win, Lose, Pause, Demo, Credits }

/// <summary>破關進度。存在使用者的 LocalAppData 裡，exe 旁邊不會多出任何檔案。</summary>
internal sealed class Progress
{
    public int Cleared;
    public readonly int[] Best = new int[Levels.Count];
    public readonly int[] Stars = new int[Levels.Count];

    private static string FilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HW05-1142922", "save.txt");

    public static Progress Load()
    {
        var progress = new Progress();
        try
        {
            if (!File.Exists(FilePath)) return progress;
            string[] lines = File.ReadAllLines(FilePath);
            if (lines.Length < 3) return progress;
            progress.Cleared = Math.Clamp(int.Parse(lines[0]), 0, Levels.Count);
            string[] best = lines[1].Split(','), stars = lines[2].Split(',');
            for (int i = 0; i < Levels.Count && i < best.Length && i < stars.Length; i++)
            {
                progress.Best[i] = Math.Max(0, int.Parse(best[i]));
                progress.Stars[i] = Math.Clamp(int.Parse(stars[i]), 0, 3);
            }
        }
        catch (Exception ex) when (ex is IOException or FormatException or UnauthorizedAccessException or OverflowException)
        {
            // 存檔壞掉就從頭開始，不影響遊戲。
            return new Progress();
        }

        return progress;
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllLines(FilePath, new[] { Cleared.ToString(), string.Join(',', Best), string.Join(',', Stars) });
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // 不能存檔（例如唯讀環境）時，這次的進度只留在記憶體裡。
        }
    }
}

/// <summary>
/// 遊戲視窗。畫面固定用 1280×800 的座標來畫，再依螢幕大小整體縮放，
/// 所以不管老師的筆電解析度或縮放比例是多少，版面都一樣。
/// </summary>
internal sealed partial class GameForm : Form
{
    public const int W = 1280, H = 800;

    private readonly float S;
    private readonly bool _headless;
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 8 };
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly Progress _progress;
    private readonly List<UiButton> _buttons = new();
    private readonly Random _rng = new();
    private readonly Bitmap _bgNormal, _bgBoss;
    private double _last;
    private float _time;
    private Scene _scene = Scene.Title;
    private Overlay _overlay = Overlay.None;
    private PointF _mouse = new(-100, -100);
    private string _typed = "";
    private string _toastText = "";
    private float _toast;

    private sealed record UiButton(RectangleF Rect, Action Click);

    public GameForm(bool headless = false, float forcedScale = 0)
    {
        _headless = headless;
        _progress = headless ? new Progress() : Progress.Load();
        Text = "1142922 HW05 FAIRY TAIL — 六神器與百年任務";
        AutoScaleMode = AutoScaleMode.None;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        DoubleBuffered = true;
        KeyPreview = true;
        BackColor = Color.Black;

        Rectangle area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, W, H);
        float fit = Math.Min((area.Width - 30) / (float)W, (area.Height - 70) / (float)H);
        S = forcedScale > 0 ? forcedScale : Math.Clamp(Math.Min(Math.Max(1f, DeviceDpi / 96f), fit), 0.5f, 3f);
        ClientSize = new Size((int)Math.Round(W * S), (int)Math.Round(H * S));

        Art.Init(S);
        _bgNormal = Art.Background(W, H, S, false, 11);
        _bgBoss = Art.Background(W, H, S, true, 23);

        if (headless) return;
        try
        {
            // 視窗左上角用 exe 自己的圖示。
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        }
        catch (Exception ex) when (ex is IOException or ArgumentException or System.ComponentModel.Win32Exception)
        {
            // 取不到圖示就用預設的，不影響遊戲。
        }

        Sound.Init();
        Sound.Music(Sound.Title);
        _scene = Scene.Opening;
        Native.timeBeginPeriod(1);
        _timer.Tick += (_, _) => Frame();
        _timer.Start();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _timer.Stop();
        if (!_headless)
        {
            Native.timeEndPeriod(1);
            Sound.Shutdown();
        }

        base.OnFormClosed(e);
    }

    private void Frame()
    {
        double now = _clock.Elapsed.TotalSeconds;
        float dt = (float)Math.Clamp(now - _last, 0, 0.05);
        _last = now;
        Tick(dt);
        Invalidate();
    }

    private void Tick(float dt)
    {
        _time += dt;
        if (_toast > 0) _toast -= dt;
        if (_scene == Scene.Opening)
        {
            _openT += dt;
            if (_openT >= OpeningLength) SkipOpening();
        }

        if (_overlay == Overlay.Credits) UpdateCredits(dt);
        else if (_scene == Scene.Play) UpdatePlay(dt);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        // 整個畫面每一格都會重畫，不需要先清背景。
    }

    protected override void OnPaint(PaintEventArgs e) => Render(e.Graphics);

    private void Render(Graphics g)
    {
        Art.Setup(g);
        g.ScaleTransform(S, S);
        _buttons.Clear();
        switch (_scene)
        {
            case Scene.Title: DrawTitle(g); break;
            case Scene.Map: DrawMap(g); break;
            case Scene.Opening: DrawOpening(g); break;
            default: DrawPlay(g); break;
        }

        switch (_overlay)
        {
            case Overlay.Intro: DrawIntro(g); break;
            case Overlay.Win: DrawWin(g); break;
            case Overlay.Lose: DrawLose(g); break;
            case Overlay.Pause: DrawPause(g); break;
            case Overlay.Demo: DrawDemo(g); break;
            case Overlay.Credits: DrawCredits(g); break;
        }

        if (_toast > 0)
        {
            float alpha = Math.Min(1, _toast * 2.5f);
            float width = Art.Measure(g, _toastText, 22) + 56;
            var box = new RectangleF(W / 2f - width / 2, H - 78 - (string.IsNullOrEmpty(_caption) ? 0 : 70), width, 48);
            Art.Panel(g, box, Art.Alpha(Art.Paper, (int)(245 * alpha)), 24, 5 * alpha, 3);
            Art.Text(g, _toastText, 22, Art.Alpha(Art.Fg, (int)(255 * alpha)), W / 2f, box.Y + 24, 1, true, true);
        }

        DrawCaption(g);
    }

    private void Toast(string text, float seconds = 2.2f)
    {
        _toastText = text;
        _toast = seconds;
    }

    /// <summary>把整張預先畫好的底圖原樣貼上（不縮放、不混色，最快）。</summary>
    private static void Blit(Graphics g, Bitmap bmp, float offsetX = 0, float offsetY = 0, bool blend = false)
    {
        GraphicsState state = g.Save();
        g.ResetTransform();
        g.CompositingMode = blend ? CompositingMode.SourceOver : CompositingMode.SourceCopy;
        g.InterpolationMode = InterpolationMode.NearestNeighbor;
        g.DrawImage(bmp, new Rectangle((int)offsetX, (int)offsetY, bmp.Width, bmp.Height));
        g.Restore(state);
    }

    private void Dim(Graphics g, int alpha = 170) => Art.Fill(g, Art.Alpha(Art.Ink, alpha), new RectangleF(-20, -20, W + 40, H + 40));

    private void Button(Graphics g, RectangleF r, string text, Action click, Color? fill = null, float size = 24)
    {
        Color color = fill ?? Art.Paper;
        bool hot = r.Contains(_mouse);
        RectangleF box = r;
        if (hot) box.Offset(-1, -2);
        if (fill != null) Art.GoldPanel(g, box, 12, hot);
        else Art.Panel(g, box, hot ? Art.Tint(Art.GoldLine, 0.3f) : color, 12, hot ? 8 : 5);
        Art.Text(g, text, size, fill == null ? Art.Fg : Art.Ink, box.X + box.Width / 2, box.Y + box.Height / 2 + 1, 1, true, true);
        _buttons.Add(new UiButton(r, click));
    }

    // ───────────────────────── 輸入 ─────────────────────────

    protected override void OnMouseMove(MouseEventArgs e)
    {
        _mouse = new PointF(e.X / S, e.Y / S);
        if (_scene == Scene.Play && _overlay == Overlay.None) PlayMouseMove(e.Button == MouseButtons.Left);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        _mouse = new PointF(e.X / S, e.Y / S);
        if (e.Button != MouseButtons.Left) return;
        if (_scene == Scene.Opening)
        {
            SkipOpening();
            return;
        }

        for (int i = _buttons.Count - 1; i >= 0; i--)
        {
            if (!_buttons[i].Rect.Contains(_mouse)) continue;
            Sound.Play(Snd.Click);
            _buttons[i].Click();
            return;
        }

        if (_overlay == Overlay.Credits) EndCredits();
        else if (_scene == Scene.Title && _overlay == Overlay.None) GoMap();
        else if (_scene == Scene.Play && _overlay == Overlay.None) PlayMouseDown();
    }

    protected override void OnMouseUp(MouseEventArgs e) => _downCell = null;

    protected override void OnKeyDown(KeyEventArgs e)
    {
        e.Handled = true;
        e.SuppressKeyPress = true;
        if (e.KeyCode == Keys.M)
        {
            Sound.MusicOn = !Sound.MusicOn;
            Toast(Sound.MusicOn ? "背景音樂：開" : "背景音樂：關");
            return;
        }

        if (_scene == Scene.Opening)
        {
            SkipOpening();
            return;
        }

        if (_overlay == Overlay.Credits)
        {
            EndCredits();
            return;
        }

        if (_scene == Scene.Title)
        {
            if (_overlay == Overlay.Demo)
            {
                if (e.KeyCode == Keys.Escape) _overlay = Overlay.None;
            }
            else if (e.KeyCode == Keys.Escape) Close();
            else if (e.KeyCode == Keys.D) OpenDemo();
            else GoMap();
            return;
        }

        if (_scene == Scene.Map)
        {
            if (_overlay == Overlay.Intro)
            {
                if (e.KeyCode == Keys.Escape) _overlay = Overlay.None;
                else if (e.KeyCode is Keys.Enter or Keys.Space) StartLevel(_introLevel);
                return;
            }

            if (e.KeyCode == Keys.Escape)
            {
                _scene = Scene.Title;
                return;
            }

            // 示範用密技：在地圖上依序按 A、C、E，直接解鎖全部關卡與神器。
            if (e.KeyCode is >= Keys.A and <= Keys.Z)
            {
                _typed = (_typed + (char)e.KeyCode).ToUpperInvariant();
                if (_typed.Length > 3) _typed = _typed[^3..];
                if (_typed == "ACE" && _progress.Cleared < Levels.Count - 1)
                {
                    _progress.Cleared = Levels.Count - 1;
                    Sound.Play(Snd.Charge);
                    Toast("示範模式：全部關卡與神器已解鎖");
                }
            }

            return;
        }

        switch (_overlay)
        {
            case Overlay.Win:
                if (e.KeyCode is Keys.Enter or Keys.Space) AfterWin();
                else if (e.KeyCode == Keys.Escape) GoMap();
                return;
            case Overlay.Lose:
                if (e.KeyCode is Keys.Enter or Keys.Space or Keys.R) StartLevel(_level.Number - 1);
                else if (e.KeyCode == Keys.Escape) GoMap();
                return;
            case Overlay.Pause:
                if (e.KeyCode is Keys.Escape or Keys.Enter) _overlay = Overlay.None;
                else if (e.KeyCode == Keys.R) StartLevel(_level.Number - 1);
                return;
        }

        if (_ending) return;
        if (e.KeyCode == Keys.Escape) _overlay = Overlay.Pause;
        else if (e.KeyCode == Keys.R) StartLevel(_level.Number - 1);
        else if (e.KeyCode == Keys.H) ShowHint();
    }

    private void GoMap()
    {
        // 展示模式中離開關卡：回到展示選單，不進地圖。
        if (_demo)
        {
            OpenDemo();
            return;
        }

        _scene = Scene.Map;
        _overlay = Overlay.None;
        _typed = "";
        Sound.Music(Sound.Map);
    }

    // ───────────────────────── 截圖（開發檢查用） ─────────────────────────

    private void Snapshot(string path)
    {
        using var bmp = new Bitmap(ClientSize.Width, ClientSize.Height, PixelFormat.Format32bppPArgb);
        _hudFrame = 0;
        using (Graphics g = Graphics.FromImage(bmp)) Render(g);
        bmp.Save(path, ImageFormat.Png);
    }

    private void Run(float seconds)
    {
        for (float t = 0; t < seconds; t += 1 / 60f) Tick(1 / 60f);
    }

    /// <summary>不開視窗，直接把各個畫面畫成 PNG：HW05-1142922.exe --shots 資料夾</summary>
    public static void Shots(string dir, string? only = null)
    {
        Directory.CreateDirectory(dir);
        using var f = new GameForm(true, 1f);

        // 六件神器全部充滿（屬性微光）＋盤面上幾顆六色紋章核心。
        f._progress.Cleared = 9;
        f.StartLevel(8);
        f.Run(2.2f);
        for (int i = 0; i < 6; i++) f._s!.Charge[i] = f._s.ChargeNeed;
        foreach (Point at in new[] { new Point(1, 2), new Point(4, 4), new Point(6, 7) })
            if (f._s!.Board.Cells[at.X, at.Y] is { Kind: PieceKind.Candy } core)
                core.Special = Special.Core;
        f.Run(0.3f);
        f.Snapshot(Path.Combine(dir, "a1-charged.png"));
        f.Run(0.45f);
        f.Snapshot(Path.Combine(dir, "a2-charged.png"));
        if (only == "charged") return;

        // 開場動畫的四個段落
        f._scene = Scene.Opening;
        foreach (float t in new[] { 1.0f, 3.5f, 6.8f, 8.6f })
        {
            f._openT = t;
            f.Snapshot(Path.Combine(dir, $"00-opening-{t:0.0}.png"));
        }

        f._scene = Scene.Title;
        f.Run(1);
        f.Snapshot(Path.Combine(dir, "01-title.png"));
        f.OpenDemo();
        f.Snapshot(Path.Combine(dir, "01-demo.png"));
        f.StartCredits(true);
        f.Run(6);
        f.Snapshot(Path.Combine(dir, "01-credits-a.png"));
        f.Run(f.CreditsLength - 7.5f);
        f.Snapshot(Path.Combine(dir, "01-credits-end.png"));
        f.Run(3);
        // 展示模式的跳轉：必殺技、龍化、擊倒魔王。
        f.StartDemo(6, () =>
        {
            f._s!.Charge[0] = f._s.ChargeNeed;
            f.UseArtifact(0);
        });
        f.Run(2.6f);
        f.Snapshot(Path.Combine(dir, "01-demo-skill.png"));
        f.GoMap();
        f.StartDemo(9, () =>
        {
            f._s!.DemoTransform();
            f.DemoKick();
        });
        f.Run(2.8f);
        f.Snapshot(Path.Combine(dir, "01-demo-transform.png"));
        f.GoMap();
        f.StartDemo(9, () =>
        {
            f._s!.DemoDefeat();
            f.DemoKick();
        });
        f.Run(7);
        f.Snapshot(Path.Combine(dir, "01-demo-defeat.png"));
        f.Run(2);
        f.Snapshot(Path.Combine(dir, "01-demo-credits.png"));
        f._demo = false;
        f._overlay = Overlay.None;
        f._scene = Scene.Title;
        f.GoMap();
        f._progress.Cleared = 3;
        f._progress.Stars[0] = 3;
        f._progress.Stars[1] = 2;
        f._progress.Stars[2] = 1;
        f.Run(0.5f);
        f.Snapshot(Path.Combine(dir, "02-map.png"));
        f.OpenIntro(3);
        f.Snapshot(Path.Combine(dir, "03-intro.png"));

        f.StartLevel(3);
        f.Run(2);
        f.Snapshot(Path.Combine(dir, "04-play-jelly.png"));
        f.Run(10.5f);
        f.Snapshot(Path.Combine(dir, "05-hint.png"));
        if (f._hint is Move hint) f.TrySwapCells(hint.A, hint.B);
        f.Run(0.32f);
        f.Snapshot(Path.Combine(dir, "06-clear.png"));
        f.Run(3);
        f._s!.Charge[0] = f._s.ChargeNeed;
        f._s.Charge[2] = f._s.ChargeNeed;
        f.UseArtifact(0);
        f.Run(0.75f);
        f.Snapshot(Path.Combine(dir, "07-skill.png"));
        f.Run(3);
        f.Snapshot(Path.Combine(dir, "08-after-skill.png"));

        f._progress.Cleared = 9;
        f.StartLevel(7);
        f.Run(2);
        f.Snapshot(Path.Combine(dir, "09-play-shards.png"));

        f.StartLevel(9);
        f.Run(2);
        for (int i = 0; i < 6; i++) f._s!.Charge[i] = Math.Max(0, f._s.ChargeNeed - 2 - i * 4);
        for (int n = 0; n < 4; n++)
        {
            List<Move> moves = f._s!.Board.FindMoves();
            if (moves.Count == 0) break;
            Move best = moves.MaxBy(m => m.Value);
            f.TrySwapCells(best.A, best.B);
            f.Run(n == 3 ? 0.5f : 4);
        }

        f.Snapshot(Path.Combine(dir, "10-boss.png"));
        f.Run(5);
        f.Snapshot(Path.Combine(dir, "11-boss-later.png"));

        // 魔王的三個招式各拍一張。
        for (int n = 0; n < 3; n++)
        {
            f._s!.BossCounter = 1;
            List<Move> moves = f._s.Board.FindMoves();
            if (moves.Count == 0) break;
            f.TrySwapCells(moves[0].A, moves[0].B);
            for (int k = 0; k < 400 && f._s.BossCounter == 1; k++) f.Run(1 / 60f);
            f.Run(0.55f);
            f.Snapshot(Path.Combine(dir, $"b{f._s.BossAttacks}-attack.png"));
            f.Run(2);
        }
        f._s!.BossHp = 1;
        for (int n = 0; n < 3 && f._overlay == Overlay.None; n++)
        {
            List<Move> moves = f._s.Board.FindMoves();
            if (moves.Count == 0 || f._ending) break;
            f.TrySwapCells(moves[0].A, moves[0].B);
            f.Run(1.6f);
        }

        f.Snapshot(Path.Combine(dir, "12-boss-dying.png"));
        f.Run(5);
        f.Snapshot(Path.Combine(dir, "13-win.png"));

        f._progress.Cleared = 0;
        f.StartLevel(0);
        f.Run(2);
        f._s!.Moves = 1;
        for (int n = 0; n < 3 && f._overlay == Overlay.None; n++)
        {
            List<Move> moves = f._s.Board.FindMoves();
            if (moves.Count == 0 || f._ending) break;
            f.TrySwapCells(moves[^1].A, moves[^1].B);
            f.Run(5);
        }

        f.Snapshot(Path.Combine(dir, "14-lose-or-win.png"));

        // 六個必殺技：一般版（s）與強化版（k）各拍特寫一張、演出三張。
        foreach (var (prefix, clearedTo) in new[] { ("s", 6), ("k", 9) })
        {
            f._progress.Cleared = clearedTo;
            for (int skill = 0; skill < 6; skill++)
            {
                f.StartLevel(skill == 1 ? 7 : 6);
                f.Run(2);
                f._s!.Charge[skill] = f._s.ChargeNeed;
                f.UseArtifact(skill);
                f.Run(0.5f);
                f.Snapshot(Path.Combine(dir, $"{prefix}{skill}-1-cut.png"));
                f.Run(CutLength - 0.5f + 0.1f);
                f.Snapshot(Path.Combine(dir, $"{prefix}{skill}-2-fx.png"));
                f.Run(0.3f);
                f.Snapshot(Path.Combine(dir, $"{prefix}{skill}-3-fx.png"));
                f.Run(0.45f);
                f.Snapshot(Path.Combine(dir, $"{prefix}{skill}-4-fx.png"));
                f.Run(3);
            }
        }

        // 魔王第二階段：龍化特寫、防禦小遊戲、擋下與沒擋下的結果。
        f._progress.Cleared = 9;
        f.StartLevel(9);
        f.Run(2);
        f.Snapshot(Path.Combine(dir, "p0-human.png"));
        f._s!.BossHp = f._s.BossMaxHp / 2 + 5;
        for (int guard = 0; guard < 10 && !f._tcutOn; guard++)
        {
            List<Move> bm = f._s.Board.FindMoves();
            if (bm.Count == 0) break;
            f.TrySwapCells(bm[0].A, bm[0].B);
            for (int k = 0; k < 160 && !f._tcutOn && f._pumping; k++) f.Run(0.05f);
        }

        f.Run(0.35f);
        f.Snapshot(Path.Combine(dir, "p1-transform-a.png"));
        f.Run(0.6f);
        f.Snapshot(Path.Combine(dir, "p2-transform-b.png"));
        f.Run(2.5f);
        f.Snapshot(Path.Combine(dir, "p3-phase2.png"));
        for (int round = 0; round < 2; round++)
        {
            for (int guard = 0; guard < 12 && !f._qteOn; guard++)
            {
                List<Move> bm = f._s.Board.FindMoves();
                if (bm.Count == 0) break;
                f.TrySwapCells(bm[0].A, bm[0].B);
                for (int k = 0; k < 200 && !f._qteOn && f._pumping; k++) f.Run(0.05f);
            }

            f.Run(0.6f);
            if (round == 0)
            {
                // 第一次照順序點兩個再拍，最後讓它時間到（沒擋下）。
                for (int i = 0; i < 2 && f._qteOn; i++)
                {
                    f._mouse = f._qteTargets[i];
                    f.QteClick();
                }

                f.Run(0.2f);
                f.Snapshot(Path.Combine(dir, "p4-qte.png"));
                f.Run(QteTime);
                f.Run(0.4f);
                f.Snapshot(Path.Combine(dir, "p5-roar-taken.png"));
            }
            else
            {
                for (int i = 0; i < 4 && f._qteOn; i++)
                {
                    f._mouse = f._qteTargets[i];
                    f.QteClick();
                }

                f.Run(0.5f);
                f.Snapshot(Path.Combine(dir, "p6-roar-blocked.png"));
            }

            f.Run(2);
        }

        // 擊倒魔王：金色妖精尾巴徽章。
        f._progress.Cleared = 9;
        f.StartLevel(9);
        f.Run(2);
        f._s!.BossHp = 1;
        for (int guard = 0; guard < 6 && !f._ending; guard++)
        {
            List<Move> bm = f._s.Board.FindMoves();
            if (bm.Count == 0) break;
            f.TrySwapCells(bm[0].A, bm[0].B);
            for (int k = 0; k < 200 && !f._ending && f._pumping; k++) f.Run(0.05f);
        }

        f.Run(FinaleStart + 0.4f);
        f.Snapshot(Path.Combine(dir, "f1-finale.png"));
        f.Run(1.2f);
        f.Snapshot(Path.Combine(dir, "f2-finale.png"));
        f.Run(4);

        // 場地機關：第 2–5 關開場，以及強風、落雷發動的瞬間。
        f._progress.Cleared = 6;
        for (int lv = 1; lv <= 4; lv++)
        {
            f.StartLevel(lv);
            f.Run(2.2f);
            f.Snapshot(Path.Combine(dir, $"h{lv + 1}-field.png"));
            LevelDef def = Levels.All[lv];
            if (def.Hazard == Hazard.None) continue;
            for (int guard = 0; guard < def.HazardEvery * 3 && f._s!.HazardEvents == 0; guard++)
            {
                List<Move> moves = f._s.Board.FindMoves();
                if (moves.Count == 0) break;
                int before = f._s.HazardEvents;
                f.TrySwapCells(moves[0].A, moves[0].B);
                for (int k = 0; k < 120 && f._s.HazardEvents == before; k++) f.Run(0.05f);
            }

            f.Run(0.12f);
            f.Snapshot(Path.Combine(dir, $"h{lv + 1}-event.png"));
            f.Run(2);
        }

        // 三個合體魔法：特寫一張、演出三張。
        f._progress.Cleared = 6;
        for (int u = 0; u < Levels.Unisons.Length; u++)
        {
            f.StartLevel(6);
            f.Run(2);
            f.UseUnison(u);
            f.Run(0.5f);
            f.Snapshot(Path.Combine(dir, $"u{u}-1-cut.png"));
            f.Run(CutLength - 0.5f + 0.1f);
            f.Snapshot(Path.Combine(dir, $"u{u}-2-fx.png"));
            f.Run(0.3f);
            f.Snapshot(Path.Combine(dir, $"u{u}-3-fx.png"));
            f.Run(0.45f);
            f.Snapshot(Path.Combine(dir, $"u{u}-4-fx.png"));
            f.Run(3);
        }

        // 妖精的光耀：特寫一張、演出三張，再拍一張燈亮了一半的神器欄。
        f._progress.Cleared = 9;
        f.StartLevel(9);
        f.Run(2);
        for (int i = 0; i < 3; i++) f._s!.GlitterLamp[i * 2] = true;
        f.Run(0.1f);
        f.Snapshot(Path.Combine(dir, "g0-lamps.png"));
        f.UseGlitter();
        f.Run(0.5f);
        f.Snapshot(Path.Combine(dir, "g1-cut.png"));
        f.Run(CutLength - 0.5f + 0.1f);
        f.Snapshot(Path.Combine(dir, "g2-fx.png"));
        f.Run(0.2f);
        f.Snapshot(Path.Combine(dir, "g3-fx.png"));
        f.Run(0.3f);
        f.Snapshot(Path.Combine(dir, "g4-fx.png"));
        f.Run(3);

        // 強化獎勵：地圖收藏、關卡說明、關卡中的獎勵欄。
        f._progress.Cleared = 9;
        f.GoMap();
        f.Run(0.5f);
        f.Snapshot(Path.Combine(dir, "k-map.png"));
        f.OpenIntro(7);
        f.Snapshot(Path.Combine(dir, "k-intro.png"));
        f.OpenIntro(9);
        f.Snapshot(Path.Combine(dir, "k-boss-intro.png"));
        f._overlay = Overlay.None;
        f._progress.Cleared = 7;
        f.StartLevel(7);
        f.Run(2);
        f.Snapshot(Path.Combine(dir, "k-play.png"));

        // 分數挑戰關與ラストラッシュ。
        f._progress.Cleared = 0;
        f.StartLevel(0);
        f.Run(2);
        f.Snapshot(Path.Combine(dir, "r1-score-level.png"));
        f._s!.Score = f._level.TargetScore - 100;
        f._scoreShown = f._s.Score;
        List<Move> goal = f._s.Board.FindMoves();
        if (goal.Count > 0) f.TrySwapCells(goal[0].A, goal[0].B);
        for (int k = 0; k < 600 && !f._s.Finale; k++) f.Run(1 / 60f);
        f.Run(0.3f);
        f.Snapshot(Path.Combine(dir, "r2-goal.png"));
        f.Run(1.1f);
        f.Snapshot(Path.Combine(dir, "r3-rush.png"));
        for (int k = 0; k < 3000 && f._overlay != Overlay.Win; k++) f.Run(1 / 60f);
        f.Run(1);
        f.Snapshot(Path.Combine(dir, "r4-win.png"));
        f._progress.Cleared = 9;

        // 新的手感與演出：開場口號、FEVER、剩三步警告、滑鼠懸停。
        f.StartLevel(4);
        f.Run(0.45f);
        f.Snapshot(Path.Combine(dir, "j1-ready.png"));
        f.Run(2);
        f._s!.FeverMoves = 3;
        f.ShowFever();
        f.Run(0.3f);
        f.Snapshot(Path.Combine(dir, "j2-fever.png"));
        f.Run(1.5f);
        f._mouse = Center(3, 5);
        f.Snapshot(Path.Combine(dir, "j3-hover.png"));
        f._s.Moves = 3;
        f._s.FeverMoves = 0;
        f.Run(0.4f);
        f.Snapshot(Path.Combine(dir, "j4-last-moves.png"));

        // 順便量每個畫面畫一格要多久（毫秒），確認 60fps 有餘裕。
        var timing = new System.Text.StringBuilder();
        using (var target = new Bitmap(f.ClientSize.Width, f.ClientSize.Height, PixelFormat.Format32bppPArgb))
        using (Graphics g = Graphics.FromImage(target))
        {
            void Measure(string name)
            {
                var watch = Stopwatch.StartNew();
                for (int i = 0; i < 60; i++)
                {
                    f.Tick(1 / 60f);
                    g.ResetTransform();
                    f.Render(g);
                }

                timing.AppendLine($"{name}: {watch.Elapsed.TotalMilliseconds / 60:0.0} ms/frame");
            }

            f._overlay = Overlay.None;
            f._scene = Scene.Title;
            Measure("title");
            f.GoMap();
            Measure("map");
            f._progress.Cleared = 9;
            f.StartLevel(6);
            f.Run(2);
            Measure("play idle");
            List<Move> all = f._s!.Board.FindMoves();
            if (all.Count > 0) f.TrySwapCells(all.MaxBy(m => m.Value).A, all.MaxBy(m => m.Value).B);
            Measure("play resolving");
            f._s.Charge[3] = f._s.ChargeNeed;
            f.Run(3);
            f.UseArtifact(3);
            Measure("play skill");
        }

        File.WriteAllText(Path.Combine(dir, "timing.txt"), timing.ToString());
        f.StartLevel(0);
        f.Run(2);
        f._overlay = Overlay.Pause;
        f.Snapshot(Path.Combine(dir, "15-pause.png"));
    }

    private static class Native
    {
        [DllImport("winmm.dll", ExactSpelling = true)]
        internal static extern uint timeBeginPeriod(uint period);

        [DllImport("winmm.dll", ExactSpelling = true)]
        internal static extern uint timeEndPeriod(uint period);
    }
}
