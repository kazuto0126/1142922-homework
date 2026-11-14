using System.Drawing.Drawing2D;
using System.Runtime.InteropServices.JavaScript;
using CandyLegend.Audio;
using CandyLegend.Core;

namespace CandyLegend.UI;

internal enum Scene { Title, Map, Play, Opening }

internal enum Overlay { None, Intro, Win, Lose, Pause, Demo, Credits }

/// <summary>和 WinForms 的 Keys 同樣的數值（也等於瀏覽器的 keyCode）。</summary>
internal enum Keys
{
    Enter = 13, Escape = 27, Space = 32,
    A = 65, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
}

/// <summary>破關進度。網頁版存在瀏覽器的 localStorage。</summary>
internal sealed partial class Progress
{
    public int Cleared;
    public readonly int[] Best = new int[Levels.Count];
    public readonly int[] Stars = new int[Levels.Count];

    private const string Key = "hw05-1142922-save";

    public static Progress Load()
    {
        var progress = new Progress();
        try
        {
            string? text = JsLoad(Key);
            if (string.IsNullOrEmpty(text)) return progress;
            string[] lines = text.Split('\n');
            if (lines.Length < 3) return progress;
            progress.Cleared = Math.Clamp(int.Parse(lines[0]), 0, Levels.Count);
            string[] best = lines[1].Split(','), stars = lines[2].Split(',');
            for (int i = 0; i < Levels.Count && i < best.Length && i < stars.Length; i++)
            {
                progress.Best[i] = Math.Max(0, int.Parse(best[i]));
                progress.Stars[i] = Math.Clamp(int.Parse(stars[i]), 0, 3);
            }
        }
        catch (Exception ex) when (ex is FormatException or OverflowException or JSException)
        {
            return new Progress();
        }

        return progress;
    }

    public void Save()
    {
        try
        {
            JsSave(Key, $"{Cleared}\n{string.Join(',', Best)}\n{string.Join(',', Stars)}");
        }
        catch (JSException)
        {
            // 無痕視窗等不能存檔的情況：進度只留在這次。
        }
    }

    [JSImport("load", "store")]
    private static partial string? JsLoad(string key);

    [JSImport("save", "store")]
    private static partial void JsSave(string key, string value);
}

/// <summary>
/// 網頁版的遊戲畫面：取代 Windows 版 GameForm.cs 裡和視窗有關的部分（建立、計時、輸入）。
/// 畫面內容（標題、地圖、關卡、魔王、演出）全部用和 Windows 版共用的 GameForm.*.cs。
/// </summary>
internal sealed partial class GameForm
{
    public const int W = 1280, H = 800;

    private readonly float S;
    private readonly bool _headless = false;
    private readonly Progress _progress;
    private readonly List<UiButton> _buttons = new();
    private readonly Random _rng = new();
    private readonly Bitmap _bgNormal, _bgBoss;
    private float _time;
    private Scene _scene = Scene.Title;
    private Overlay _overlay = Overlay.None;
    private PointF _mouse = new(-100, -100);
    private string _typed = "";
    private string _toastText = "";
    private float _toast;

    private sealed record UiButton(RectangleF Rect, Action Click);

    public GameForm(float scale)
    {
        S = scale;
        _progress = Progress.Load();
        Art.Init(S);
        _bgNormal = Art.Background(W, H, S, false, 11);
        _bgBoss = Art.Background(W, H, S, true, 23);
        Sound.Init();
        Sound.Music(Sound.Title);
        _scene = Scene.Opening;
    }

    /// <summary>瀏覽器每一格呼叫一次：更新遊戲，再把畫面指令送去畫。</summary>
    public void Frame(float dt)
    {
        Tick(Math.Clamp(dt, 0, 0.05f));
        using (Graphics g = Graphics.ForScreen()) Render(g);
        Gfx.Flush();
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

    /// <summary>把整張預先畫好的底圖原樣貼上。</summary>
    private static void Blit(Graphics g, Bitmap bmp, float offsetX = 0, float offsetY = 0, bool blend = false)
    {
        GraphicsState state = g.Save();
        g.ResetTransform();
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

    // ───────────────────────── 輸入（座標已換算成 1280×800 的邏輯座標） ─────────────────────────

    public void MouseMove(float x, float y, bool left)
    {
        _mouse = new PointF(x, y);
        if (_scene == Scene.Play && _overlay == Overlay.None) PlayMouseMove(left);
    }

    public void MouseDown(float x, float y)
    {
        _mouse = new PointF(x, y);
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

    public void MouseUp() => _downCell = null;

    /// <summary>手機沒有鍵盤：畫面上的「暫停」鈕走同一條路。</summary>
    public void KeyDown(int keyCode)
    {
        var key = (Keys)keyCode;
        if (key == Keys.M)
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
                if (key == Keys.Escape) _overlay = Overlay.None;
            }
            else if (key == Keys.Escape) { }
            else if (key == Keys.D) OpenDemo();
            else GoMap();
            return;
        }

        if (_scene == Scene.Map)
        {
            if (_overlay == Overlay.Intro)
            {
                if (key == Keys.Escape) _overlay = Overlay.None;
                else if (key is Keys.Enter or Keys.Space) StartLevel(_introLevel);
                return;
            }

            if (key == Keys.Escape)
            {
                _scene = Scene.Title;
                return;
            }

            // 示範用密技：在地圖上依序按 A、C、E，直接解鎖全部關卡與神器。
            if (key is >= Keys.A and <= Keys.Z)
            {
                _typed = (_typed + (char)key).ToUpperInvariant();
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
                if (key is Keys.Enter or Keys.Space) AfterWin();
                else if (key == Keys.Escape) GoMap();
                return;
            case Overlay.Lose:
                if (key is Keys.Enter or Keys.Space or Keys.R) StartLevel(_level.Number - 1);
                else if (key == Keys.Escape) GoMap();
                return;
            case Overlay.Pause:
                if (key is Keys.Escape or Keys.Enter) _overlay = Overlay.None;
                else if (key == Keys.R) StartLevel(_level.Number - 1);
                return;
        }

        if (_ending) return;
        if (key == Keys.Escape) _overlay = Overlay.Pause;
        else if (key == Keys.R) StartLevel(_level.Number - 1);
        else if (key == Keys.H) ShowHint();
    }

    private void GoMap()
    {
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
}
