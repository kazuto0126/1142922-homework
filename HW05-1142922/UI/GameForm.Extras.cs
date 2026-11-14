using System.Drawing.Drawing2D;
using CandyLegend.Audio;
using CandyLegend.Core;

namespace CandyLegend.UI;

/// <summary>開場動畫、展示模式選單、片尾名單。</summary>
internal sealed partial class GameForm
{
    // ───────────────────────── 開場動畫 ─────────────────────────

    private const float OpeningLength = 10.5f;
    private float _openT;

    /// <summary>
    /// 開場約 10 秒：紅色公會徽章浮現 → 六件神器依序閃過 → 黑龍剪影 → 「FAIRY TAIL」蓋章，接著淡入標題畫面。
    /// 任何點擊或按鍵都能跳過。
    /// </summary>
    private void DrawOpening(Graphics g)
    {
        float t = _openT;
        Art.Fill(g, Color.FromArgb(8, 6, 16), new RectangleF(-20, -20, W + 40, H + 40));
        float cx = W / 2f, cy = H / 2f;

        if (t < 1.9f)
        {
            // 1. 紅色徽章：從黑暗中浮現，外圈一道光環擴散。
            float a = Math.Clamp(t / 0.8f, 0, 1) * Math.Clamp((1.9f - t) / 0.3f, 0, 1);
            Glow(g, cx, cy, 260, Color.FromArgb(255, 60, 60), (int)(150 * a));
            Art.Mark(g, cx + 6, cy + 8, 300, Color.FromArgb((int)(200 * a), 40, 0, 0));
            Art.Mark(g, cx, cy, 300, Color.FromArgb((int)(255 * a), 216, 30, 40));
            float ring = Math.Clamp((t - 0.5f) / 0.9f, 0, 1);
            if (ring > 0 && ring < 1)
                using (var pen = new Pen(Color.FromArgb((int)(200 * (1 - ring)), 255, 200, 160), 6))
                    g.DrawEllipse(pen, cx - 160 - ring * 400, cy - 160 - ring * 400, 320 + ring * 800, 320 + ring * 800);
        }
        else if (t < 5.6f)
        {
            // 2. 六件神器依序閃過：每件 0.6 秒，從右邊衝進來、元素色爆光、名字蓋上。
            int i = Math.Min(5, (int)((t - 1.9f) / 0.6f));
            float local = (t - 1.9f - i * 0.6f) / 0.6f;
            float slide = local < 0.25f ? (1 - local / 0.25f) * 500 : local > 0.85f ? -(local - 0.85f) / 0.15f * 500 : 0;
            Color main = Art.Main[i];
            Art.Fill(g, Art.Alpha(main, 50), new RectangleF(0, cy - 170, W, 340));
            using (var pen = new Pen(Art.Alpha(main, 220), 4))
            {
                g.DrawLine(pen, 0, cy - 170, W, cy - 170);
                g.DrawLine(pen, 0, cy + 170, W, cy + 170);
            }

            for (int k = 0; k < 14; k++)
            {
                float y = cy - 150 + k * 23, len = 200 + (k * 97 % 300);
                float x = (k * 211 + t * 2400) % (W + len) - len;
                Art.Fill(g, Art.Alpha(Color.White, 40), new RectangleF(x, y, len, 3));
            }

            Glow(g, cx - 200 + slide, cy, 190, main, 160);
            Art.Artifact(g, i, cx - 200 + slide, cy, 260, true);
            ArtifactInfo info = Levels.Artifacts[i];
            Art.Outlined(g, info.Name, 64, Color.White, Art.Ink, 12, cx + 170 + slide * 0.6f, cy - 30, 1);
            Art.Outlined(g, Levels.ElementNames[i], 30, Art.Light[i], Art.Ink, 7, cx + 170 + slide * 0.6f, cy + 50, 1);
        }
        else if (t < 7.8f)
        {
            // 3. 黑龍剪影：龍形態壓成黑影，只剩發紅的眼睛，畫面震動。
            float local = t - 5.6f;
            float a = Math.Clamp(local / 0.5f, 0, 1) * Math.Clamp((7.8f - t) / 0.3f, 0, 1);
            float shake = local > 0.6f && local < 1.6f ? (float)Math.Sin(local * 80) * 6 : 0;
            Bitmap dragon = Art.BossArt;
            float h = 640, w = h * dragon.Width / dragon.Height;
            using (var attrs = new System.Drawing.Imaging.ImageAttributes())
            {
                attrs.SetColorMatrix(new System.Drawing.Imaging.ColorMatrix
                {
                    Matrix00 = 0.12f, Matrix11 = 0.05f, Matrix22 = 0.14f, Matrix33 = a,
                });
                g.DrawImage(dragon, new Rectangle((int)(cx - w / 2 + shake), (int)(cy - h / 2 + 20), (int)w, (int)h), 0, 0, dragon.Width, dragon.Height, GraphicsUnit.Pixel, attrs);
            }

            float eye = Math.Clamp((local - 0.5f) / 0.3f, 0, 1) * a;
            float ex = cx - w / 2 + w * 0.496f + shake, ey = cy - h / 2 + 20 + h * 0.569f;
            Glow(g, ex, ey, 70, Color.FromArgb(255, 40, 40), (int)(230 * eye));
            Art.Disc(g, Color.FromArgb((int)(255 * eye), 255, 120, 120), 0, ex, ey, 9, 6);
            if (local > 0.7f)
            {
                float s = Math.Clamp((local - 0.7f) / 0.15f, 0, 1);
                Art.Outlined(g, "黑龍、甦醒。", 46, Art.Alpha(Color.FromArgb(255, 90, 90), (int)(255 * s * a)), Art.Alpha(Art.Ink, (int)(255 * s * a)), 9, cx, cy + 250, 1);
            }
        }
        else
        {
            // 4. 標題蓋章：FAIRY TAIL 從大砸下來，一閃，副標與學號浮現。
            float local = t - 7.8f;
            float stamp = Math.Clamp(local / 0.18f, 0, 1);
            float fadeOut = Math.Clamp((OpeningLength - t) / 0.5f, 0, 1);
            Glow(g, cx, cy - 30, 420, Gold, (int)(120 * stamp * fadeOut));
            Art.Mark(g, cx, cy - 30, 380, Color.FromArgb((int)(60 * stamp * fadeOut), 216, 30, 40));
            GraphicsState state = g.Save();
            float scale = 2.4f - 1.4f * stamp;
            g.TranslateTransform(cx, cy - 40);
            g.ScaleTransform(scale, scale);
            Art.Fancy(g, "FAIRY TAIL", 150, 0, 0, 1, true, null, null, 1.6f);
            g.Restore(state);
            if (local > 0.18f && local < 0.45f)
                Art.Fill(g, Color.FromArgb((int)(230 * (1 - (local - 0.18f) / 0.27f)), 255, 250, 225), new RectangleF(-20, -20, W + 40, H + 40));
            float sub = Math.Clamp((local - 0.5f) / 0.4f, 0, 1) * fadeOut;
            Art.Text(g, "六神器與百年任務", 34, Art.Alpha(Art.Fg, (int)(255 * sub)), cx, cy + 80, 1, true, true);
            Art.Text(g, "1142922　HW05", 20, Art.Alpha(Gold, (int)(255 * sub)), cx, cy + 130, 1, true, true);
            if (fadeOut < 1) Art.Fill(g, Color.FromArgb((int)(255 * (1 - fadeOut)), 8, 6, 16), new RectangleF(-20, -20, W + 40, H + 40));
        }

        Art.Text(g, "點擊或按任意鍵跳過", 15, Color.FromArgb(150, 220, 214, 240), W - 24, H - 28, 2, false);
    }

    private static void Glow(Graphics g, float x, float y, float radius, Color color, int alpha)
    {
        if (alpha <= 0) return;
        using var path = new GraphicsPath();
        path.AddEllipse(x - radius, y - radius, radius * 2, radius * 2);
        using var brush = new PathGradientBrush(path) { CenterColor = Art.Alpha(color, Math.Min(255, alpha)), SurroundColors = new[] { Art.Alpha(color, 0) } };
        g.FillPath(brush, path);
    }

    private void SkipOpening()
    {
        _scene = Scene.Title;
        _overlayT = _time;
    }

    // ───────────────────────── 展示模式 ─────────────────────────

    /// <summary>展示模式中：關卡用全部神器（含強化），結果不存檔，結束後回到展示選單。</summary>
    private bool _demo;
    private Action? _demoAction;

    private void OpenDemo()
    {
        _scene = Scene.Title;
        _overlay = Overlay.Demo;
        _demo = false;
        Sound.Music(Sound.Title);
    }

    /// <summary>開一關展示用的關卡；盤面落定、可以操作的那一刻執行 <paramref name="action"/>。</summary>
    private void StartDemo(int levelIndex, Action? action)
    {
        _demo = true;
        StartLevel(levelIndex);
        _demoAction = action;
    }

    private void DemoTick()
    {
        if (_demoAction == null || !CanInput) return;
        Action action = _demoAction;
        _demoAction = null;
        action();
    }

    private void DemoKick()
    {
        _pumping = true;
        _waitSettle = false;
        _wait = 0;
    }

    private void DrawDemo(Graphics g)
    {
        Dim(g, 200);
        var box = new RectangleF(140, 40, 1000, 720);
        Art.Panel(g, box, Art.Paper, 20, 10, 4.5f);
        Art.Fancy(g, "展示模式", 50, 640, 92, 1, false);
        Art.Text(g, "點一下就直接跳到那個亮點；展示中的關卡不會存檔，結束後回到這個選單。", 17, Muted, 640, 140, 1, false, true);

        float y = 172;
        Section("神器必殺技");
        for (int i = 0; i < 6; i++)
        {
            int skill = i;
            Item(i, Levels.Artifacts[i].Skill2, Art.Main[i], () => StartDemo(6, () =>
            {
                _s!.Charge[skill] = _s.ChargeNeed;
                UseArtifact(skill);
            }));
        }

        y += 62;
        Section("合體魔法與妖精的光耀");
        for (int u = 0; u < Levels.Unisons.Length; u++)
        {
            int unison = u;
            Item(u, Levels.Unisons[u].Name, Art.Main[Levels.Unisons[u].A], () => StartDemo(6, () => UseUnison(unison)));
        }

        Item(2, "妖精の輝き", Gold, () => StartDemo(6, UseGlitter));
        y += 62;
        Section("場地機關");
        string[] fields = { "厚冰（霜華之谷）", "強風（天空草原）", "落雷（雷鳴峽谷）", "傳送門（星靈神殿）" };
        for (int i = 0; i < 4; i++)
        {
            int level = i + 1;
            Item(i, fields[i], Art.Main[new[] { 1, 2, 3, 4 }[i]], () => StartDemo(level, () =>
            {
                if (_s!.Level.Hazard != Hazard.None)
                {
                    _s.HazardCounter = 1;
                    Toast(_s.Level.Hazard == Hazard.Wind ? "走一步就會風向反轉" : "走一步就會落雷", 3);
                }
                else Toast(_s.Level.FieldText, 3.5f);
            }));
        }

        y += 62;
        Section("魔王阿庫諾洛基亞");
        Item(0, "龍化", Color.FromArgb(255, 90, 90), () => StartDemo(9, () =>
        {
            _s!.DemoTransform();
            DemoKick();
        }));
        Item(1, "防禦小遊戲", Color.FromArgb(200, 120, 255), () => StartDemo(9, () =>
        {
            _s!.DemoRoar();
            Sound.Music(Sound.BossPhase2);
            StartQte();
            DemoKick();
        }));
        Item(2, "擊倒魔王＋名單", Gold, () => StartDemo(9, () =>
        {
            _s!.DemoDefeat();
            DemoKick();
        }));
        Item(3, "只看片尾名單", Color.FromArgb(150, 220, 255), () => StartCredits(true));

        Button(g, new RectangleF(540, 688, 200, 54), "返回（Esc）", () => _overlay = Overlay.None);

        void Section(string title)
        {
            Art.Text(g, title, 22, Gold, 180, y, 0);
            y += 36;
        }

        void Item(int column, string text, Color color, Action click)
        {
            var r = new RectangleF(180 + column * 155, y, 145, 50);
            bool hot = r.Contains(_mouse);
            Art.Panel(g, r, Art.Tint(color, hot ? 0.55f : 0.3f), 10, hot ? 6 : 3, 2.5f);
            Art.TextFit(g, text, 16, Color.White, r.X + r.Width / 2, r.Y + r.Height / 2 - 9, 1, r.Width - 14);
            _buttons.Add(new UiButton(r, click));
        }
    }

    // ───────────────────────── 片尾名單 ─────────────────────────

    private float _creditsT;
    private bool _creditsToDemo;

    private static readonly (string Text, float Size, int Kind)[] CreditLines =
    {
        // Kind：0 一般、1 標題（金色）、2 小字（灰）、3 空行
        ("FAIRY TAIL", 72, 4),
        ("六神器與百年任務", 30, 0),
        ("", 40, 3),
        ("製作", 26, 1),
        ("1142922", 30, 0),
        ("HW05 消消樂作業", 20, 2),
        ("", 30, 3),
        ("原作", 26, 1),
        ("真島浩《FAIRY TAIL 魔導少年》", 24, 0),
        ("角色、招式名稱、公會徽章版權屬於原作者與講談社", 16, 2),
        ("", 30, 3),
        ("音樂", 26, 1),
        ("標題畫面・第 7–9 關　Butterfly", 22, 0),
        ("和田光司（數碼寶貝大冒險 OP）ALL CAST VERSION", 16, 2),
        ("關卡地圖　ピースサイン", 22, 0),
        ("米津玄師（我的英雄學院 OP）", 16, 2),
        ("第 1–3 關　crossing field", 22, 0),
        ("LiSA（刀劍神域 OP）", 16, 2),
        ("第 4–6 關　only my railgun", 22, 0),
        ("fripSide（科學超電磁砲 OP）", 16, 2),
        ("魔王第一階段　約束の日", 22, 0),
        ("米倉千尋（FAIRY TAIL OP14）", 16, 2),
        ("魔王第一階段　ANIMA", 22, 0),
        ("ReoNa（刀劍神域 Alicization War of Underworld OP）", 16, 2),
        ("魔王第二階段　FAIRY TAIL Main Theme", 22, 0),
        ("高梨康治", 16, 2),
        ("歌曲以 HDemucs（torchaudio）去除人聲，僅供課堂作業使用", 16, 2),
        ("", 30, 3),
        ("圖片", 26, 1),
        ("黑龍阿庫諾洛基亞（龍形態）", 22, 0),
        ("真島浩 線稿／Berto 上色（取自萌娘百科）", 16, 2),
        ("阿庫諾洛基亞人形態・妖精的光耀・公會徽章", 22, 0),
        ("FAIRY TAIL Wiki（Fandom）", 16, 2),
        ("", 30, 3),
        ("其他", 26, 1),
        ("糖晶、神器圖示、特效與音效：程式即時繪製／合成", 20, 0),
        ("C#　.NET 6　Windows Forms", 20, 0),
        ("", 60, 3),
        ("Thank you for playing!", 44, 4),
        ("だって俺たちは、フェアリーテイルだから！", 26, 1),
    };

    private float CreditsHeight => CreditLines.Sum(l => l.Size * 1.9f);
    /// <summary>捲到最後一行停在畫面中央時，第一行的位置。</summary>
    private float CreditsStop => H / 2f - (CreditsHeight - CreditLines[^1].Size * 1.9f);
    private float CreditsLength => (H + 20 - CreditsStop) / CreditsSpeed + 3.5f;
    private const float CreditsSpeed = 72;

    private void StartCredits(bool toDemo)
    {
        _creditsToDemo = toDemo;
        _creditsT = 0;
        if (toDemo) _scene = Scene.Title;
        _overlay = Overlay.Credits;
        Sound.Music(Sound.Title);
    }

    private void EndCredits()
    {
        if (_creditsToDemo)
        {
            OpenDemo();
            return;
        }

        _overlay = Overlay.Win;
        _overlayT = _time;
        Sound.Play(Snd.Star, 0.8f);
    }

    private void UpdateCredits(float dt)
    {
        _creditsT += dt;
        if (_creditsT >= CreditsLength) EndCredits();
    }

    private void DrawCredits(Graphics g)
    {
        Blit(g, _bgNormal);
        Art.Fill(g, Color.FromArgb(150, 6, 4, 14), new RectangleF(-20, -20, W + 40, H + 40));
        Art.Mark(g, W / 2f, H / 2f, 520, Color.FromArgb(28, 255, 196, 50));

        // 金粉往上飄
        var rng = new Random(91);
        for (int i = 0; i < 50; i++)
        {
            float x = (float)rng.NextDouble() * W, speed = 20 + (float)rng.NextDouble() * 50;
            float y = H - ((_creditsT * speed + (float)rng.NextDouble() * H) % (H + 40));
            Art.Disc(g, Color.FromArgb(150, 255, 226, 120), 0, x, y, 1.2f + (float)rng.NextDouble() * 2);
        }

        // 字幕由下往上捲，最後一行停在畫面中央。
        float top = Math.Max(H + 20 - _creditsT * CreditsSpeed, CreditsStop);
        float y0 = top;
        foreach (var (text, size, kind) in CreditLines)
        {
            float lineH = size * 1.9f;
            if (y0 > -80 && y0 < H + 80 && kind != 3)
            {
                float edge = Math.Clamp(Math.Min(y0 + 40, H + 40 - y0) / 120f, 0, 1);
                int alpha = (int)(255 * edge);
                switch (kind)
                {
                    case 4:
                        Art.Fancy(g, text, size, W / 2f, y0, 1, true);
                        break;
                    case 1:
                        Art.Outlined(g, text, size, Art.Alpha(Gold, alpha), Art.Alpha(Art.Ink, alpha), 6, W / 2f, y0, 1, 0, 1, text.Any(ch => ch is >= '぀' and <= 'ヿ'));
                        break;
                    case 2:
                        Art.Text(g, text, size, Art.Alpha(Color.FromArgb(190, 186, 214), alpha), W / 2f, y0, 1, false, true);
                        break;
                    default:
                        Art.Outlined(g, text, size, Art.Alpha(Color.White, alpha), Art.Alpha(Art.Ink, alpha), 5, W / 2f, y0, 1, 0, 1, text.Any(ch => ch is >= '぀' and <= 'ヿ'));
                        break;
                }
            }

            y0 += lineH;
        }

        Art.Text(g, "點擊或按任意鍵跳過", 15, Color.FromArgb(150, 220, 214, 240), W - 24, H - 28, 2, false);
    }
}
