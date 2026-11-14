using System.Drawing.Drawing2D;
using CandyLegend.Core;

namespace CandyLegend.UI;

/// <summary>關卡中的記分板：左邊是目標、步數、分數，上面是關卡說明或魔王血條，右邊是獎勵／魔王與神器欄。</summary>
internal sealed partial class GameForm
{
    private static readonly Color Gold = Color.FromArgb(255, 214, 50);
    private static readonly Color Red = Color.FromArgb(255, 78, 66);
    private static readonly Color Pink = Color.FromArgb(255, 130, 190);
    private static readonly Color Green = Color.FromArgb(60, 196, 100);
    private static readonly Color Muted = Color.FromArgb(168, 162, 198);

    private static Color ModeColor(LevelMode mode) => mode switch
    {
        LevelMode.Jelly => Color.FromArgb(255, 150, 200),
        LevelMode.Shards => Gold,
        LevelMode.Mixed => Color.FromArgb(96, 224, 130),
        LevelMode.Score => Color.FromArgb(120, 200, 255),
        _ => Red,
    };

    private static readonly string[] AttackNames = { "黑龍的吞噬", "終焉的黑羽", "黑龍的咆哮" };

    /// <summary>掉落物被收集時，會飛向記分板上「收集哈比的魚」那一列的圖示。</summary>
    private float ShardGoalY => 186 + (_s != null && _s.JellyTotal > 0 ? 62 : 0);

    /// <summary>整關都不會變的文字與圖：只在關卡開始時畫進底圖一次。</summary>
    private void DrawHudStatic(Graphics g)
    {
        Session s = _s!;
        Art.Fill(g, Art.Ink, new RectangleF(28, 28, 296, 88), 12);
        Art.Text(g, $"第 {_level.Number} 關", 32, Color.White, 44, 34);
        Art.Text(g, _level.Name, 20, Color.White, 310, 46, 2);
        Art.Pill(g, new RectangleF(44, 80, 112, 28), ModeColor(_level.Mode), _level.ModeName, 16);
        Art.Text(g, $"最高分 {_progress.Best[_level.Number - 1]:N0}", 14, Color.FromArgb(214, 206, 236), 310, 86, 2, false);
        Art.Text(g, "過關目標", 20, Art.Fg, 34, 126);
        Art.Line(g, Art.Alpha(Art.GoldLine, 170), 1.6f, 128, 141, 322, 141);
        Art.Text(g, "剩餘步數", 20, Art.Fg, 34, 352);
        Art.Line(g, Art.Alpha(Art.GoldLine, 170), 1.6f, 128, 367, 322, 367);
        Art.Text(g, "分數", 20, Art.Fg, 34, 506);
        Art.Line(g, Art.Alpha(Art.GoldLine, 170), 1.6f, 84, 521, 322, 521);
        Art.Text(g, "連鎖", 20, Art.Fg, 34, 640);
        Art.Text(g, "H 提示　M 音樂　R 重來　Esc 暫停", 13, Art.Fg, 176, 756, 1, false);

        if (s.IsBoss)
        {
            Art.Outlined(g, "黑龍　阿庫諾洛基亞", 32, Red, Art.Ink, 7, 374, 44, 0);
            Art.Text(g, "魔王行動倒數", 18, Art.Fg, 374, 124);
            Art.Text(g, "消除糖晶就是攻擊，連鎖越多傷害越高；神器技能傷害更高！", 14, Muted, 374, 150, 0, false);
        }
        else
        {
            DrawLevelBanner(g);
        }

        Art.Panel(g, new RectangleF(956, 28, 296, 316), s.IsBoss ? Color.FromArgb(240, 30, 8, 20) : Color.FromArgb(240, 12, 12, 32), 12, 0, 3.5f);
        if (!s.IsBoss) DrawReward(g);
        Art.Text(g, "神器", 20, Art.Fg, 958, 352);
        // 六件神器到齊後，改成提示妖精的光耀的條件。
        bool allSix = s.Owned.All(o => o);
        Art.Text(g, allSix ? "六件都發動過（★全亮）→ 妖精的光耀" : "充能滿了會自動發動", 13, allSix ? Gold : Art.Fg, 1250, 358, 2, false);
    }

    /// <summary>會變的部分：目標進度、步數、分數、魔王、神器充能。</summary>
    private void DrawHud(Graphics g)
    {
        Session s = _s!;
        DrawLeftPanel(g, s);
        if (s.IsBoss) DrawBossBar(g, s);
        else if (_level.Hazard != Hazard.None) DrawHazardCounter(g, s);
        DrawRightPanel(g, s);
    }

    private void GoalRow(Graphics g, float y, Bitmap? icon, string label, int value, int target, Color color, string? text = null)
    {
        bool done = value >= target;
        if (icon != null) Art.Draw(g, icon, 56, y + 28, 58);
        Art.Text(g, label, 18, Art.Fg, 90, y + 1);
        if (done)
        {
            Art.Poly(g, Green, 2.4f, 268, y + 14, 276, y + 6, 284, y + 14, 304, y - 4, 312, y + 4, 284, y + 30);
        }
        else
        {
            // 數字太長時自動縮小，不會和左邊的標籤疊在一起。
            float room = 318 - 90 - Art.Measure(g, label, 18) - 12;
            Art.TextFit(g, text ?? $"{value} / {target}", 22, Art.Fg, 318, y - 2, 2, room);
        }

        var track = new RectangleF(90, y + 32, 228, 16);
        Art.Track(g, track, 8);
        float fill = Math.Clamp(value / (float)Math.Max(1, target), 0, 1);
        if (fill > 0.02f) Art.Fill(g, done ? Green : color, new RectangleF(93, y + 35, 222 * fill, 10), 5);
    }

    private void DrawLeftPanel(Graphics g, Session s)
    {
        float y = 160;
        if (s.JellyTotal > 0)
        {
            GoalRow(g, y, Art.JellySprite(2), "清除果凍", s.JellyCleared, s.JellyTotal, Pink);
            y += 62;
        }

        if (_level.Shards > 0)
        {
            GoalRow(g, y, Art.ShardSprite, "收集哈比的魚", s.ShardsCollected, _level.Shards, Gold);
            y += 62;
        }

        if (_level.TargetScore > 0)
        {
            Art.Star(g, 56, y + 28, 22, true, 2.6f);
            int shown = (int)Math.Round(_scoreShown);
            GoalRow(g, y, null, "目標分數", Math.Min(shown, _level.TargetScore), _level.TargetScore,
                Color.FromArgb(120, 200, 255), $"{shown:N0} / {_level.TargetScore:N0}");
            y += 62;
        }

        if (s.Finale && s.State == PlayState.Playing)
            Art.Outlined(g, "ラストラッシュ!!", 30, Gold, Art.Ink, 7, 176, y + 30, 1, -4, 1 + 0.05f * (float)Math.Sin(_time * 12));

        if (s.IsBoss)
        {
            Art.Boss(g, 56, y + 34, 0.17f, _time, 0, s.Enraged);
            int dealt = s.BossMaxHp - (int)Math.Round(_bossHpShown);
            GoalRow(g, y, null, "打倒魔王", dealt, s.BossMaxHp, Red, $"{100L * dealt / Math.Max(1, s.BossMaxHp)}%");
        }

        // 步數
        bool low = s.Moves <= 5 && s.State == PlayState.Playing;
        float beat = (low ? 1 + 0.06f * (float)Math.Sin(_time * 9) : 1) * (1 + 0.3f * _movesPop);
        Art.Medallion(g, 176, 434, 58 * beat, low);
        Art.Outlined(g, s.Moves.ToString(), 60, low ? Color.White : Color.FromArgb(70, 40, 6), low ? Color.FromArgb(110, 10, 20) : Color.FromArgb(255, 246, 210), 5, 176, 436, 1, 0, beat);

        // 分數
        Art.Fancy(g, ((int)Math.Round(_scoreShown)).ToString("N0"), 46, 176, 556, 1, true, null, null, 0);
        float progress = _scoreShown <= _level.Star2
            ? 0.55f * _scoreShown / Math.Max(1, _level.Star2)
            : 0.55f + 0.45f * Math.Min(1, (_scoreShown - _level.Star2) / Math.Max(1, _level.Star3 - _level.Star2));
        var bar = new RectangleF(44, 600, 264, 16);
        Art.Track(g, bar, 8);
        if (progress > 0.02f) Art.Fill(g, Art.GoldLine, new RectangleF(47, 603, 258 * progress, 10), 5);
        Art.Star(g, 52, 596, 12, _scoreShown > 0, 2.2f);
        Art.Star(g, 44 + 264 * 0.55f, 596, 13, _scoreShown >= _level.Star2, 2.2f);
        Art.Star(g, 304, 596, 14, _scoreShown >= _level.Star3, 2.2f);

        // 連鎖
        if (_chainPop > 0 && _chainShown >= 2)
        {
            float pop = 1 + 0.5f * Math.Max(0, _chainPop - 0.7f) / 0.3f;
            Art.Outlined(g, $"×{_chainShown}", 58, Art.Main[(_chainShown + 2) % 6], Art.Ink, 9, 196, 700, 1, -6, pop);
        }
        else
        {
            Art.Text(g, s.BestChain >= 2 ? $"本關最長 {s.BestChain} 連鎖" : $"一步 {Session.FeverChain} 連鎖進入 FEVER", 17, Muted, 196, 690, 1);
        }

        if (s.FeverActive)
            Art.Outlined(g, s.FeverMoves > 0 ? $"FEVER ×2　あと {s.FeverMoves} 手" : "FEVER ×2", 24, Hue(_time * 0.6f), Art.Ink, 6, 176, 728);
    }

    private void DrawLevelBanner(Graphics g)
    {
        // 上方只放模式名稱與一句目標說明。
        Art.Fancy(g, _level.ModeName, 46, 640, 64, 1, false, Art.Mix(ModeColor(_level.Mode), Color.White, 0.55f), ModeColor(_level.Mode));
        Art.Flourish(g, 400, 510, 64);
        Art.Flourish(g, 770, 880, 64);
        string goal = _level.Mode switch
        {
            LevelMode.Jelly => "在果凍上配對，把盤面上的果凍全部清光！",
            LevelMode.Shards => "讓哈比的魚一路掉到最底下那一排就能收集！",
            LevelMode.Score => "在步數內拿到目標分數！",
            _ => "果凍要清光，哈比的魚也要全部收集！",
        };
        Art.TextFit(g, goal, 23, Art.Fg, 640, 104, 1, 540);
        bool counter = _level.Hazard != Hazard.None;
        if (_level.FieldText.Length > 0)
            Art.TextFit(g, "場地機關　" + _level.FieldText, 15, Gold, counter ? 590 : 640, 140, 1, counter ? 380 : 540);
    }

    private void DrawBossBar(Graphics g, Session s)
    {
        if (s.Enraged && s.BossHp > 0 && Math.Sin(_time * 8) > -0.3)
            Art.Outlined(g, "狂暴化！", 26, Gold, Art.Ink, 6, 906, 44, 2);

        var track = new RectangleF(372, 68, 536, 36);
        Art.Track(g, track, 10);
        float shown = Math.Clamp(_bossHpShown / Math.Max(1, s.BossMaxHp), 0, 1);
        float real = Math.Clamp(s.BossHp / (float)Math.Max(1, s.BossMaxHp), 0, 1);
        if (shown > 0.005f) Art.Fill(g, Color.White, new RectangleF(376, 72, 528 * shown, 28), 7);
        if (real > 0.005f)
        {
            Art.Fill(g, s.Enraged ? Color.FromArgb(255, 120, 40) : Red, new RectangleF(376, 72, 528 * real, 28), 7);
            Art.Fill(g, Art.Alpha(Color.White, 80), new RectangleF(380, 74, Math.Max(0, 528 * real - 8), 8), 4);
        }

        Art.Outlined(g, $"HP {s.BossHp:N0} / {s.BossMaxHp:N0}", 19, Color.White, Art.Ink, 5, 640, 87);

        for (int i = 0; i < 3; i++)
        {
            bool lit = i < s.BossCounter;
            float pulse = lit && s.BossCounter == 1 ? 1 + 0.15f * (float)Math.Sin(_time * 10) : 1;
            Art.Disc(g, lit ? Red : Art.PaperDim, 3, 512 + i * 34, 137, 12 * pulse);
        }

        Art.Text(g, $"下一招：{AttackNames[(s.BossAttacks + 1) % 3]}", 18, Art.Fg, 906, 124, 2);
    }

    private void DrawRightPanel(Graphics g, Session s)
    {
        if (s.IsBoss)
        {
            var box = new RectangleF(959, 31, 290, 310);
            Art.Fill(g, Color.FromArgb(44, 14, 34), box, 10);
            GraphicsState clip = g.Save();
            g.SetClip(box, CombineMode.Intersect);
            bool gone = s.State == PlayState.Won && (_overlay == Overlay.Win || (_ending && _endTimer > 1.7f));
            if (!gone)
            {
                float jolt = _bossFlash > 0 ? (float)(_rng.NextDouble() - 0.5) * 10 * _bossFlash : 0;
                float lunge = _bossAct > 0 ? (float)Math.Sin(_bossAct * Math.PI) * 0.1f : 0;
                Art.Boss(g, BossX + jolt, BossY + 16 + lunge * 60, 0.8f + lunge, _time, _bossFlash * 0.8f, s.Enraged);
            }

            g.Restore(clip);
        }

        // 充能完畢的神器：先在所有卡片底下鋪一圈屬性色的柔光，粒子最後再畫在卡片上面。
        for (int i = 0; i < 6; i++)
            if (s.Owned[i] && s.Charge[i] >= s.ChargeNeed)
                DrawChargeGlow(g, SlotRect(i), i);

        for (int i = 0; i < 6; i++)
        {
            RectangleF r = SlotRect(i);
            bool owned = s.Owned[i], full = owned && s.Charge[i] >= s.ChargeNeed;
            ArtifactInfo info = Levels.Artifacts[i];

            Art.Panel(g, r, owned ? Art.Tint(Art.Main[i], full ? 0.5f : 0.22f) : Art.GlassDim, 10, full ? 0 : 4, 3);
            bool boosted = owned && s.Boosted[i];
            if (boosted)
            {
                // 強化過的神器：外圈多一道會流動的金光。
                float shine = 0.5f + 0.5f * (float)Math.Sin(_time * 3 + i * 1.3f);
                using var pen = new Pen(Art.Alpha(Gold, (int)(150 + 100 * shine)), 2.6f);
                var frame = r;
                frame.Inflate(-3, -3);
                using GraphicsPath path = Art.Round(frame, 9);
                g.DrawPath(pen, path);
            }

            float bob = full ? (float)Math.Sin(_time * 6 + i) * 3 : 0;
            Art.Artifact(g, i, r.X + 40, r.Y + 39 + bob, 62, owned);
            if (boosted) Art.Pill(g, new RectangleF(r.X + 6, r.Y + 6, 42, 20), Gold, "強化", 12);

            if (!owned)
            {
                Art.Text(g, $"第 {i + 1} 關", 14, Muted, r.X + 78, r.Y + 20, 0, false);
                Art.Text(g, "破關取得", 14, Muted, r.X + 78, r.Y + 38, 0, false);
                Art.Text(g, "？？？", 17, Muted, r.X + r.Width / 2, r.Y + 72, 1);
                continue;
            }

            // 神器名稱獨立一列，長一點的招式名也放得下。
            Art.Draw(g, Art.CandySprite(i), r.X + 90, r.Y + 36, 36);
            Art.Text(g, "充能", 14, Art.Fg, r.X + 106, r.Y + 27, 0, false);
            Art.TextFit(g, info.Name, 18, Art.Fg, r.X + r.Width / 2, r.Y + 70, 1, r.Width - 14);
            var track = new RectangleF(r.X + 9, r.Bottom - 28, r.Width - 18, 19);
            Art.Track(g, track, 9);
            float charge = Math.Clamp(s.Charge[i] / (float)s.ChargeNeed, 0, 1);
            if (charge > 0.03f) Art.Fill(g, full ? Gold : Art.Main[i], new RectangleF(track.X + 3, track.Y + 3, (track.Width - 6) * charge, 13), 6);
            Art.Outlined(g, full ? "發動！" : $"{Math.Max(0, s.Charge[i])} / {s.ChargeNeed}", 13, Color.White, Art.Ink, 3.5f,
                track.X + track.Width / 2, track.Y + 10);
            // 妖精的光耀的燈：這件神器這一輪發動過就亮金星。
            if (s.Owned.All(o => o))
            {
                bool lit = s.GlitterLamp[i];
                float tw = lit ? 1 + 0.12f * (float)Math.Sin(_time * 6 + i) : 1;
                Art.Star(g, r.Right - 18, r.Y + 17, 11 * tw, lit, 1.6f);
            }

            if (_slotFlash[i] > 0) Art.Fill(g, Art.Alpha(Color.White, (int)(200 * _slotFlash[i])), r, 12);
        }

        for (int i = 0; i < 6; i++)
            if (s.Owned[i] && s.Charge[i] >= s.ChargeNeed)
                DrawChargeMotes(g, SlotRect(i), i);
    }

    private static RectangleF SlotRect(int i) => new(956 + (i % 2) * 154, 384 + (i / 2) * 132, 142, 124);

    /// <summary>神器充能完畢的微光顏色：劍的劍氣是銀光，其他用屬性色（星的深藍調亮一點才看得到）。</summary>
    private static Color GlowColor(int i) => i switch
    {
        5 => Color.FromArgb(226, 232, 248),
        4 => Art.Mix(Art.Main[4], Art.Light[4], 0.45f),
        _ => Art.Main[i],
    };

    /// <summary>卡片外圍一層層往外淡掉的柔光，會慢慢呼吸。</summary>
    private void DrawChargeGlow(Graphics g, RectangleF r, int i)
    {
        Color c = GlowColor(i);
        float breathe = 0.75f + 0.25f * (float)Math.Sin(_time * 3.2f + i);
        const int layers = 7;
        for (int k = layers; k >= 1; k--)
        {
            var halo = r;
            float grow = 1.5f * k * (0.85f + 0.15f * breathe);
            halo.Inflate(grow, grow);
            Art.Fill(g, Art.Alpha(c, (int)(66 * breathe * (layers + 1 - k) / layers)), halo, 12 + grow);
        }

        using var pen = new Pen(Art.Alpha(Art.Mix(c, Color.White, 0.35f), (int)(150 + 90 * breathe)), 2f);
        var edge = r;
        edge.Inflate(1.5f, 1.5f);
        using GraphicsPath path = Art.Round(edge, 11);
        g.DrawPath(pen, path);
    }

    /// <summary>沿著卡片邊緣繞圈的屬性光點：火星、冰晶、風痕、電弧、星光、銀色劍氣。</summary>
    private void DrawChargeMotes(Graphics g, RectangleF r, int i)
    {
        Color c = GlowColor(i), hi = i == 5 ? Color.White : Art.Light[i];
        var ring = r;
        ring.Inflate(3, 3);
        const int count = 7;
        float speed = i switch { 0 => 0.055f, 1 => 0.03f, 2 => 0.09f, 3 => 0.05f, 4 => 0.035f, _ => 0.11f };
        for (int j = 0; j < count; j++)
        {
            float u = Frac(_time * speed + j / (float)count + i * 0.13f);
            PointF p = Perimeter(ring, u);
            float tw = 0.5f + 0.5f * (float)Math.Sin(_time * 5 + j * 2.1f + i);
            switch (i)
            {
                case 0:
                {
                    // 火：往上飄的火星，越飄越淡。
                    float rise = Frac(_time * 0.9f + j * 0.37f);
                    var q = new PointF(p.X + (float)Math.Sin(_time * 4 + j) * 2, p.Y - rise * 12);
                    Art.Disc(g, Art.Alpha(c, (int)(150 * (1 - rise))), 0, q.X, q.Y, 4.2f * (1 - rise * 0.5f));
                    Art.Disc(g, Art.Alpha(hi, (int)(230 * (1 - rise))), 0, q.X, q.Y, 2f * (1 - rise * 0.5f));
                    break;
                }
                case 1:
                    // 冰：一閃一閃的小冰晶。
                    Snowflake(g, p, 3.5f + 2.5f * tw, Art.Alpha(hi, (int)(140 + 110 * tw)));
                    break;
                case 2:
                    // 天空：順著邊緣流動的風痕。
                    Streak(g, ring, u, 0.05f, Art.Alpha(Art.Mix(hi, Color.White, 0.4f), (int)(170 + 85 * tw)), 3.2f);
                    Streak(g, ring, u - 0.07f, 0.03f, Art.Alpha(c, (int)(120 + 80 * tw)), 2.2f);
                    break;
                case 3:
                    // 雷：短短的電弧，每 0.12 秒換一次位置。
                    Spark(g, Perimeter(ring, Frac(j / (float)count + (int)(_time / 0.12f) * 0.618f * (j + 1))), c, j);
                    break;
                case 4:
                    // 星：會眨眼的四芒星。
                    Twinkle(g, p.X, p.Y, 3 + 4 * tw, Art.Alpha(Color.White, (int)(120 + 130 * tw)));
                    Art.Disc(g, Art.Alpha(c, (int)(70 * tw)), 0, p.X, p.Y, 6 * tw + 2);
                    break;
                default:
                    // 劍：銀色的劍氣，細長又快，前端最亮。
                    Streak(g, ring, u, 0.06f, Art.Alpha(c, (int)(150 + 80 * tw)), 2.6f);
                    Twinkle(g, p.X, p.Y, 4 + 3 * tw, Art.Alpha(Color.White, (int)(170 + 80 * tw)));
                    break;
            }
        }
    }

    private static float Frac(float v) => v - (float)Math.Floor(v);

    /// <summary>細瘦的四芒星光點。</summary>
    private static void Twinkle(Graphics g, float x, float y, float size, Color color)
    {
        using var brush = new SolidBrush(color);
        g.FillPolygon(brush, Art.StarPoints(x, y, size, size * 0.26f, 4));
    }

    /// <summary>u 在 0–1 之間，沿著矩形外框順時針走一圈。</summary>
    private static PointF Perimeter(RectangleF r, float u)
    {
        float w = r.Width, h = r.Height, d = Frac(u) * 2 * (w + h);
        if (d < w) return new PointF(r.X + d, r.Y);
        d -= w;
        if (d < h) return new PointF(r.Right, r.Y + d);
        d -= h;
        if (d < w) return new PointF(r.Right - d, r.Bottom);
        d -= w;
        return new PointF(r.X, r.Bottom - d);
    }

    /// <summary>沿著外框畫一段從透明漸亮到 color 的光痕，頭在 u。</summary>
    private static void Streak(Graphics g, RectangleF ring, float u, float length, Color color, float width)
    {
        const int steps = 6;
        PointF prev = Perimeter(ring, u - length);
        for (int k = 1; k <= steps; k++)
        {
            PointF next = Perimeter(ring, u - length + length * k / steps);
            using var pen = new Pen(Art.Alpha(color, color.A * k / steps), width * (0.5f + 0.5f * k / steps))
            {
                StartCap = LineCap.Round, EndCap = LineCap.Round,
            };
            g.DrawLine(pen, prev, next);
            prev = next;
        }
    }

    private static void Snowflake(Graphics g, PointF p, float size, Color color)
    {
        using var pen = new Pen(color, 1.3f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        for (int k = 0; k < 3; k++)
        {
            double a = k * Math.PI / 3 + Math.PI / 6;
            float dx = (float)Math.Cos(a) * size, dy = (float)Math.Sin(a) * size;
            g.DrawLine(pen, p.X - dx, p.Y - dy, p.X + dx, p.Y + dy);
        }
    }

    private void Spark(Graphics g, PointF p, Color color, int seed)
    {
        // 小小的鋸齒電弧，形狀依時間跳動。
        int tick = (int)(_time / 0.06f) + seed * 17;
        var pts = new PointF[4];
        float ang = (float)((tick * 2.39) % (Math.PI * 2));
        for (int k = 0; k < pts.Length; k++)
        {
            float along = (k - 1.5f) * 4.5f;
            float jag = ((tick * 31 + k * 57) % 7 - 3) * 1.3f;
            pts[k] = new PointF(p.X + (float)Math.Cos(ang) * along - (float)Math.Sin(ang) * jag,
                p.Y + (float)Math.Sin(ang) * along + (float)Math.Cos(ang) * jag);
        }

        using (var glow = new Pen(Art.Alpha(color, 110), 4f) { LineJoin = LineJoin.Round }) g.DrawLines(glow, pts);
        using (var core = new Pen(Color.FromArgb(240, 255, 255, 230), 1.5f) { LineJoin = LineJoin.Round }) g.DrawLines(core, pts);
    }

    private void DrawReward(Graphics g)
    {
        int reward = _level.Reward;
        bool had = _level.Number <= _progress.Cleared && !(_firstClear && _s!.State == PlayState.Won);
        const float bob = 0;
        Art.Disc(g, Art.Alpha(Color.White, 26), 0, 1104, 158, 118);
        Art.Disc(g, Art.Alpha(Color.White, 30), 0, 1104, 158, 84);
        Art.Pill(g, new RectangleF(1040, 40, 128, 30), Gold, had ? "已取得" : "破關獎勵", 17);
        if (reward is >= 0 and < 6)
        {
            ArtifactInfo info = Levels.Artifacts[reward];
            Art.Artifact(g, reward, 1104, 164 + bob, 170, true);
            Art.Outlined(g, info.Name, 30, Color.White, Art.Ink, 7, 1104, 270);
            Art.Text(g, $"技能「{info.Skill}」", 16, Art.Light[reward], 1104, 290, 1);
            Art.TextFit(g, info.Text, 13, Color.FromArgb(226, 220, 244), 1104, 316, 1, 280);
        }
        else if (reward >= 6)
        {
            // 神器強化：兩件神器並排，下面寫強化後的招式名。
            int[] pair = Levels.Boosted(reward);
            for (int k = 0; k < 2; k++)
            {
                int a = pair[k];
                float x = 1104 + (k == 0 ? -58 : 58);
                Art.Disc(g, Art.Alpha(Gold, 60), 0, x, 150, 54);
                Art.Artifact(g, a, x, 150, 100, true);
                Art.TextFit(g, Levels.Artifacts[a].Skill2, 15, Art.Light[a], x, 206, 1, 112);
            }

            Art.Outlined(g, "神器強化", 30, Gold, Art.Ink, 7, 1104, 262);
            Art.Text(g, "兩件神器換成強化版招式", 15, Color.FromArgb(226, 220, 244), 1104, 290, 1, false);
            Art.Text(g, "範圍更大，追加特殊效果", 15, Color.FromArgb(226, 220, 244), 1104, 312, 1, false);
        }
    }

    /// <summary>強風／落雷還剩幾步：橫幅右下角的小圓點，最後一步會閃。</summary>
    private void DrawHazardCounter(Graphics g, Session s)
    {
        bool wind = _level.Hazard == Hazard.Wind;
        Color color = wind ? Color.FromArgb(120, 230, 170) : Color.FromArgb(255, 220, 80);
        Art.Text(g, wind ? (s.WindDir > 0 ? "風向 →" : "← 風向") : "落雷", 15, color, 830, 140, 1, false);
        for (int i = 0; i < _level.HazardEvery; i++)
        {
            bool lit = i < s.HazardCounter;
            float pulse = lit && s.HazardCounter == 1 ? 1 + 0.2f * (float)Math.Sin(_time * 10) : 1;
            Art.Disc(g, lit ? color : Art.PaperDim, 2, 872 + i * 15, 141, 5 * pulse);
        }
    }
}
