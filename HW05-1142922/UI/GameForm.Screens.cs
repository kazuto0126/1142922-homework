using System.Drawing.Drawing2D;
using CandyLegend.Audio;
using CandyLegend.Core;

namespace CandyLegend.UI;

/// <summary>標題、關卡地圖，以及關卡說明／過關／失敗／暫停這些蓋在上面的視窗。</summary>
internal sealed partial class GameForm
{
    private static readonly PointF[] Nodes =
    {
        new(150, 520), new(320, 440), new(490, 520), new(660, 440), new(830, 520),
        new(1000, 440), new(1130, 300), new(960, 210), new(780, 290), new(590, 200),
    };

    private int _introLevel;
    private float _overlayT;
    private Bitmap? _titleLayer, _mapLayer;
    private int _mapKey = -1;

    // ───────────────────────── 標題 ─────────────────────────

    /// <summary>標題畫面不會動的部分（爆炸框、標題字）先畫成一張透明圖層，之後每一格直接貼上。</summary>
    private Bitmap TitleLayer()
    {
        if (_titleLayer != null) return _titleLayer;
        _titleLayer = new Bitmap(_bgNormal.Width, _bgNormal.Height, System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
        using Graphics g = Graphics.FromImage(_titleLayer);
        Art.Setup(g);
        g.ScaleTransform(S, S);

        // 遊戲名稱：金色漸層襯線字，兩側金色飾線（不模仿官方標誌）。
        Art.Fancy(g, "FAIRY TAIL", 150, 640, 262, 1, true, null, null, 1.6f);
        Art.Flourish(g, 300, 520, 372);
        Art.Flourish(g, 760, 980, 372);
        Art.Text(g, "六神器與百年任務", 30, Art.Fg, 640, 372, 1, true, true);
        for (int e = 0; e < 6; e++)
            Art.Text(g, Levels.ElementNames[e], 20, Art.Light[e], 640 + (e - 2.5f) * 118, 588, 1, true, true);
        Art.Outlined(g, "1142922　HW05", 20, Color.White, Art.Ink, 5, 24, 768, 0);
        Art.Outlined(g, "M：音樂開關　Esc：離開", 16, Color.White, Art.Ink, 4, W - 24, 770, 2);
        return _titleLayer;
    }

    private void DrawTitle(Graphics g)
    {
        Blit(g, _bgNormal);
        for (int i = 0; i < 16; i++)
        {
            float speed = 16 + i * 7 % 5 * 7;
            float x = (i * 173 + _time * speed) % (W + 200) - 100;
            float y = 50 + i * 97 % 680 + (float)Math.Sin(_time * 1.3 + i) * 16;
            Special special = i % 5 == 0 ? Special.Bomb : i % 7 == 0 ? Special.LineH : Special.None;
            Art.Draw(g, Art.CandySprite(i % 6, special), x, y, 64 + i * 31 % 3 * 22, 0.3f);
        }

        Blit(g, TitleLayer(), 0, 0, true);
        for (int e = 0; e < 6; e++)
        {
            float bob = (float)Math.Sin(_time * 3 + e * 0.9f) * 9;
            Art.Draw(g, Art.CandySprite(e), 640 + (e - 2.5f) * 118, 520 + bob, 104);
        }

        int pulse = (int)(150 + 105 * Math.Sin(_time * 3));
        Art.Text(g, "點擊畫面或按任意鍵開始", 26, Art.Alpha(Art.GoldHi, pulse), 640, 676, 1, true, true);
        if (_overlay == Overlay.None)
            Button(g, new RectangleF(1036, 700, 220, 52), "展示模式（D）", OpenDemo, null, 20);
    }

    // ───────────────────────── 關卡地圖 ─────────────────────────

    private void DrawMap(Graphics g)
    {
        // 地圖只有在進度改變時才重畫成圖層，平常每一格只貼圖，再加上「目前關卡」的閃動提示。
        int cleared = _progress.Cleared;
        int key = cleared * 100 + _progress.Stars.Sum();
        if (_mapLayer == null || key != _mapKey)
        {
            _mapLayer ??= new Bitmap(_bgNormal.Width, _bgNormal.Height, System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
            _mapKey = key;
            using Graphics layer = Graphics.FromImage(_mapLayer);
            Blit(layer, _bgNormal);
            Art.Setup(layer);
            layer.ScaleTransform(S, S);
            PaintMap(layer);
        }

        Blit(g, _mapLayer);
        for (int i = 0; i < Nodes.Length && i <= cleared; i++)
        {
            int index = i;
            float r = Levels.All[i].Mode == LevelMode.Boss ? 54 : 38;
            _buttons.Add(new UiButton(new RectangleF(Nodes[i].X - r, Nodes[i].Y - r, r * 2, r * 2), () => OpenIntro(index)));
        }

        if (cleared >= Nodes.Length || _overlay != Overlay.None) return;
        bool bossNode = Levels.All[cleared].Mode == LevelMode.Boss;
        float x = Nodes[cleared].X, y = Nodes[cleared].Y, radius = bossNode ? 54 : 38;
        float pulse = 0.5f + 0.5f * (float)Math.Sin(_time * 5);
        float ringRadius = radius + 7 + 6 * pulse;
        using (var ring = new Pen(Art.Alpha(Color.White, (int)(120 + 120 * pulse)), 5))
            g.DrawEllipse(ring, x - ringRadius, y - ringRadius, ringRadius * 2, ringRadius * 2);
        float bounce = Math.Abs((float)Math.Sin(_time * 4)) * 12;
        float top = y - radius - (bossNode ? 62 : 18);
        Art.Poly(g, Gold, 3.5f, x - 16, top - 26 - bounce, x + 16, top - 26 - bounce, x, top - bounce);
    }

    private void PaintMap(Graphics g)
    {
        int cleared = _progress.Cleared;

        Art.Panel(g, new RectangleF(40, 24, 500, 88), Art.Paper);
        Art.Fancy(g, "關卡地圖", 40, 62, 66, 0);
        Art.Text(g, "收集六件神器，打倒第 10 關的魔王！", 17, Art.Fg, 250, 44);
        Art.Text(g, "點擊發亮的關卡開始挑戰", 15, Muted, 250, 72, 0, false);

        Art.Panel(g, new RectangleF(1010, 24, 230, 88), Art.Paper);
        Art.Star(g, 1046, 56, 18, true);
        Art.Text(g, $"{_progress.Stars.Sum()} / {Levels.Count * 3}", 26, Art.Fg, 1074, 38);
        int awaken = Math.Clamp(cleared - 6, 0, 3);
        Art.Text(g, "神器強化", 14, Art.Fg, 1030, 82, 0, false);
        for (int k = 0; k < 3; k++) Art.Star(g, 1112 + k * 24, 91, 9, k < awaken, 2);

        // 路線
        for (int i = 0; i < Nodes.Length - 1; i++)
        {
            Art.Line(g, Art.Ink, 18, Nodes[i].X, Nodes[i].Y, Nodes[i + 1].X, Nodes[i + 1].Y);
            Art.Line(g, i < cleared ? Gold : Art.PaperDim, 9, Nodes[i].X, Nodes[i].Y, Nodes[i + 1].X, Nodes[i + 1].Y);
        }

        for (int i = 0; i < Nodes.Length; i++)
        {
            LevelDef level = Levels.All[i];
            bool boss = level.Mode == LevelMode.Boss, open = i <= cleared;
            float x = Nodes[i].X, y = Nodes[i].Y, r = boss ? 54 : 38;

            if (boss)
            {
                for (int side = -1; side <= 1; side += 2)
                    Art.Poly(g, open ? Art.Paper : Color.FromArgb(170, 166, 186), 4, x + side * 30, y - 40, x + side * 56, y - 84, x + side * 12, y - 50);
            }

            Art.Disc(g, Art.Alpha(Art.Ink, 200), 0, x + 5, y + 6, r);
            Art.Disc(g, open ? ModeColor(level.Mode) : Color.FromArgb(150, 146, 170), 4.5f, x, y, r);
            Art.Disc(g, Art.Alpha(Color.White, 80), 0, x - r * 0.3f, y - r * 0.4f, r * 0.36f, r * 0.2f);
            if (open)
            {
                Art.Outlined(g, level.Number.ToString(), boss ? 50 : 36, Color.White, Art.Ink, 8, x, y + 1);
            }
            else
            {
                // 鎖頭
                using var shackle = new Pen(Art.Ink, 5);
                g.DrawArc(shackle, x - 9, y - 20, 18, 22, 180, 180);
                Art.Fill(g, Art.Ink, new RectangleF(x - 13, y - 8, 26, 22), 5);
                Art.Disc(g, Color.FromArgb(150, 146, 170), 0, x, y + 2, 3.5f);
            }

            Art.Outlined(g, level.Name, 17, Color.White, Art.Ink, 5, x, y + r + 16);
            if (open)
            {
                for (int k = 0; k < 3; k++) Art.Star(g, x + (k - 1) * 22, y + r + 40, 9, k < _progress.Stars[i], 2);
            }
            else
            {
                Art.Outlined(g, level.ModeName, 13, Color.FromArgb(214, 208, 232), Art.Ink, 4, x, y + r + 38);
            }
        }

        // 神器收藏
        Art.Panel(g, new RectangleF(40, 612, 1200, 168), Art.Paper);
        Art.Fill(g, Art.Ink, new RectangleF(52, 624, 46, 144), 10);
        for (int k = 0; k < 4; k++) Art.Text(g, "神器收藏"[k].ToString(), 21, Color.White, 75, 634 + k * 32, 1);
        for (int i = 0; i < 6; i++)
        {
            bool owned = i < cleared, boosted = owned && Levels.IsBoosted(i, awaken);
            ArtifactInfo info = Levels.Artifacts[i];
            var cell = new RectangleF(112 + i * 187, 624, 176, 144);
            Art.Panel(g, cell, owned ? Art.Tint(Art.Main[i]) : Art.GlassDim, 10, 3, 2.8f);
            if (boosted)
            {
                using var pen = new Pen(Gold, 2.6f);
                var frame = cell;
                frame.Inflate(-3, -3);
                using GraphicsPath path = Art.Round(frame, 9);
                g.DrawPath(pen, path);
            }

            Art.Artifact(g, i, cell.X + 46, cell.Y + 46, 76, owned);
            if (boosted) Art.Pill(g, new RectangleF(cell.X + 6, cell.Y + 6, 44, 21), Gold, "強化", 12);
            float middle = cell.X + cell.Width / 2;
            if (owned)
            {
                Art.Draw(g, Art.CandySprite(i), cell.X + 108, cell.Y + 44, 42);
                Art.Text(g, "充能", 14, Art.Fg, cell.X + 128, cell.Y + 35, 0, false);
                Art.TextFit(g, info.Name, 21, Art.Fg, middle, cell.Y + 84, 1, cell.Width - 14);
                Art.TextFit(g, $"「{info.SkillName(boosted)}」", 15, boosted ? Gold : Art.Shade[i], middle, cell.Y + 114, 1, cell.Width - 10);
            }
            else
            {
                Art.Text(g, $"第 {i + 1} 關", 15, Muted, cell.X + 96, cell.Y + 26, 0, false);
                Art.Text(g, "破關取得", 15, Muted, cell.X + 96, cell.Y + 48, 0, false);
                Art.Text(g, "？？？", 21, Muted, middle, cell.Y + 90, 1);
            }
        }
    }

    private void OpenIntro(int index)
    {
        _introLevel = index;
        _overlay = Overlay.Intro;
        _overlayT = _time;
    }

    private static int JellyLayers(LevelDef level)
    {
        int layers = 0;
        foreach (string row in level.Jelly)
            foreach (char ch in row)
                if (ch is '1' or '2') layers += ch - '0';
        return layers;
    }

    private void DrawRewardLine(Graphics g, RectangleF box, int reward, string heading)
    {
        if (reward is >= 0 and < 6)
        {
            ArtifactInfo info = Levels.Artifacts[reward];
            Art.Panel(g, box, Art.Tint(Art.Light[reward]), 12, 0, 3);
            Art.Artifact(g, reward, box.X + 56, box.Y + box.Height / 2, Math.Min(100, box.Height - 8), true);
            Art.Text(g, heading, 15, Art.Shade[reward], box.X + 116, box.Y + 10);
            Art.Text(g, $"神器「{info.Name}」", 25, Art.Fg, box.X + 106, box.Y + 28);
            Art.Text(g, $"{info.Skill}：{info.Text}", 14, Art.Fg, box.X + 116, box.Y + 64, 0, false);
            if (box.Height > 100)
                Art.Text(g, $"消除{Levels.ElementNames[reward]}屬性糖晶充能，充滿自動發動", 14, Muted, box.X + 116, box.Y + 86, 0, false);
        }
        else if (reward >= 6)
        {
            // 神器強化：兩件神器的圖示並排，右邊寫兩招強化版的名字。
            int[] pair = Levels.Boosted(reward);
            Art.Panel(g, box, Art.Tint(Gold), 12, 0, 3);
            float iconSize = Math.Min(60, box.Height - 30);
            for (int k = 0; k < 2; k++)
                Art.Artifact(g, pair[k], box.X + 42 + k * 70, box.Y + box.Height / 2, iconSize, true);
            Art.Text(g, heading, 15, Art.GoldHi, box.X + 160, box.Y + 8);
            Art.Text(g, "神器強化", 25, Art.Fg, box.X + 158, box.Y + 26);
            ArtifactInfo a = Levels.Artifacts[pair[0]], b = Levels.Artifacts[pair[1]];
            Art.TextFit(g, $"{a.Skill} → {a.Skill2}　{b.Skill} → {b.Skill2}", 14, Art.Fg, box.X + 160, box.Y + 62, 0, box.Width - 170);
            if (box.Height > 100)
                Art.Text(g, "招式範圍更大、追加特殊效果，特寫與特效全面升級", 14, Muted, box.X + 160, box.Y + 86, 0, false);
        }
        else
        {
            Art.Panel(g, box, Art.Tint(Red), 12, 0, 3);
            Art.Text(g, "最終決戰", 25, Art.Fg, box.X + 24, box.Y + 14);
            Art.Text(g, "帶上六件神器，打倒終焉的黑羽——黑龍阿庫諾洛基亞！", 15, Art.Fg, box.X + 26, box.Y + 52, 0, false);
        }
    }

    // ───────────────────────── 關卡說明 ─────────────────────────

    private void DrawIntro(Graphics g)
    {
        Dim(g);
        LevelDef level = Levels.All[_introLevel];
        var box = new RectangleF(350, 100, 580, 600);
        Art.Panel(g, box, Art.Paper, 20, 10, 4.5f);
        Art.Fill(g, Art.Ink, new RectangleF(364, 114, 552, 96), 14);
        Art.Text(g, $"第 {level.Number} 關", 22, Gold, 386, 124);
        Art.Text(g, level.Name, 40, Color.White, 384, 150);
        Art.Pill(g, new RectangleF(756, 140, 140, 44), ModeColor(level.Mode), level.ModeName, 20);

        Art.Text(g, "過關目標", 22, Art.Fg, 386, 226);
        Art.Line(g, Art.Alpha(Art.GoldLine, 170), 1.6f, 486, 242, 908, 242);
        float y = 262;
        int layers = JellyLayers(level);
        if (layers > 0)
        {
            Art.Draw(g, Art.JellySprite(2), 414, y + 24, 70);
            Art.Text(g, $"清除所有果凍（共 {layers} 層）", 23, Art.Fg, 450, y + 8);
            y += 54;
        }

        if (level.Shards > 0)
        {
            Art.Draw(g, Art.ShardSprite, 414, y + 24, 60);
            Art.Text(g, level.Hazard == Hazard.Wind ? $"讓 {level.Shards} 條哈比的魚被風吹到盤面邊上" : $"讓 {level.Shards} 條哈比的魚掉到最底排", 23, Art.Fg, 450, y + 8);
            y += 54;
        }

        if (level.TargetScore > 0)
        {
            Art.Star(g, 414, y + 24, 22, true, 2.6f);
            Art.Text(g, $"分數達到 {level.TargetScore:N0}", 23, Art.Fg, 450, y + 8);
            y += 54;
        }

        if (level.BossHp > 0)
        {
            Art.Boss(g, 414, y + 30, 0.2f, _time, 0, false);
            Art.TextFit(g, $"打倒黑龍阿庫諾洛基亞（HP {level.BossHp:N0}）", 23, Art.Fg, 450, y + 8, 0, 456);
            // 魔王插圖取自網路，標明出處。
            Art.TextFit(g, "魔王圖：真島浩 線稿／Berto 上色（萌娘百科）", 12, Muted, 450, y + 38, 0, 456);
            y += 60;
        }

        Art.Medallion(g, 414, y + 22, 21);
        Art.Text(g, level.Moves.ToString(), 18, Color.FromArgb(70, 40, 6), 414, y + 23, 1, true, true);
        Art.Text(g, $"步數限制 {level.Moves} 步", 23, Art.Fg, 450, y + 8);
        y += 50;

        Art.Star(g, 396, y + 18, 11, true, 2);
        Art.Star(g, 420, y + 18, 11, true, 2);
        Art.Text(g, $"{level.Star2:N0} 分", 18, Art.Fg, 440, y + 6, 0, false);
        for (int k = 0; k < 3; k++) Art.Star(g, 606 + k * 24, y + 18, 11, true, 2);
        Art.Text(g, $"{level.Star3:N0} 分", 18, Art.Fg, 674, y + 6, 0, false);
        y += 44;
        if (level.FieldText.Length > 0)
        {
            Art.TextFit(g, "場地機關　" + level.FieldText, 18, Gold, 386, y + 2, 0, 520);
            y += 36;
        }

        bool had = level.Number <= _progress.Cleared;
        DrawRewardLine(g, new RectangleF(372, Math.Max(y, 498), 536, 92), level.Reward, had ? "已取得" : "破關獎勵");

        Button(g, new RectangleF(384, 612, 310, 68), "開始挑戰", () => StartLevel(_introLevel), Gold, 30);
        Button(g, new RectangleF(714, 612, 190, 68), "返回", () => _overlay = Overlay.None);
    }

    // ───────────────────────── 過關 ─────────────────────────

    private void DrawWin(Graphics g)
    {
        Session s = _s!;
        Dim(g, 150);
        float t = _time - _overlayT;
        bool boss = s.IsBoss;
        Art.Panel(g, new RectangleF(340, 90, 600, 620), Art.Paper, 20, 10, 4.5f);
        using (var glow = new LinearGradientBrush(new PointF(0, 96), new PointF(0, 230),
                   Color.FromArgb(70, boss ? Red : Art.GoldLine), Color.FromArgb(0, 0, 0, 0)))
            g.FillRectangle(glow, 346, 96, 588, 134);
        float pop = t < 0.25f ? 0.5f + t / 0.25f * 0.6f : 1.1f - Math.Min(0.1f, (t - 0.25f) * 0.5f);
        Art.Fancy(g, boss ? "魔王討伐成功！" : "過關！", boss ? 60 : 74, 640, 156, 1, false, null, null, 1.2f);

        for (int k = 0; k < 3; k++)
        {
            float appear = Math.Clamp((t - 0.3f - k * 0.25f) / 0.2f, 0, 1);
            bool lit = k < _wonStars && appear > 0;
            float size = lit ? 46 * (1.4f - 0.4f * appear) : 42;
            Art.Star(g, 640 + (k - 1) * 112, 262 - (k == 1 ? 14 : 0), size, lit, 4.5f);
        }

        Art.Text(g, "分數", 20, Muted, 640, 316, 1);
        Art.Text(g, s.Score.ToString("N0"), 58, Art.Fg, 640, 334, 1);
        Art.Text(g, s.IsBoss
                ? $"剩餘 {s.Moves} 步 × 400 ＝ +{s.WinBonus:N0}　　最長 {s.BestChain} 連鎖"
                : $"ラストラッシュ（{s.MovesAtGoal} 步）＋{s.FinaleScore:N0}　　最長 {s.BestChain} 連鎖",
            18, Art.Fg, 640, 412, 1, false);

        var box = new RectangleF(372, 456, 536, 118);
        if (_newReward != -1 && _firstClear) DrawRewardLine(g, box, _newReward, _newReward < 6 ? "獲得神器！" : "神器強化！");
        else if (boss)
        {
            Art.Panel(g, box, Art.Tint(Gold), 12, 0, 3);
            Art.Text(g, "恭喜全破！", 30, Art.Fg, 640, 474, 1);
            Art.Text(g, "六件神器的力量擊敗了黑龍阿庫諾洛基亞，糖晶王國恢復和平。", 16, Art.Fg, 640, 524, 1, false);
        }
        else
        {
            Art.Panel(g, box, Art.GlassDim, 12, 0, 3);
            Art.Text(g, $"本關最高分 {_progress.Best[_level.Number - 1]:N0}", 24, Art.Fg, 640, 484, 1);
            Art.Text(g, "獎勵已經取得過了，挑戰更高的星數吧！", 16, Muted, 640, 528, 1, false);
        }

        if (_level.Number < Levels.Count)
        {
            Button(g, new RectangleF(384, 612, 310, 68), "下一關", AfterWin, Gold, 30);
            Button(g, new RectangleF(714, 612, 190, 68), "回地圖", GoMap);
        }
        else
        {
            Button(g, new RectangleF(485, 612, 310, 68), "回地圖", GoMap, Gold, 30);
        }
    }

    // ───────────────────────── 失敗與暫停 ─────────────────────────

    private void DrawLose(Graphics g)
    {
        Session s = _s!;
        Dim(g);
        Art.Panel(g, new RectangleF(380, 170, 520, 460), Art.Paper, 20, 10, 4.5f);
        Art.Outlined(g, "步數用完了…", 54, Color.FromArgb(120, 110, 160), Art.Ink, 11, 640, 236);
        float y = 300;
        if (s.JellyTotal > 0)
        {
            Art.Text(g, $"果凍　{s.JellyCleared} / {s.JellyTotal}", 24, Art.Fg, 640, y, 1);
            y += 42;
        }

        if (_level.Shards > 0)
        {
            Art.Text(g, $"哈比的魚　{s.ShardsCollected} / {_level.Shards}", 24, Art.Fg, 640, y, 1);
            y += 42;
        }

        if (_level.TargetScore > 0)
        {
            Art.Text(g, $"分數　{s.Score:N0} / {_level.TargetScore:N0}", 24, Art.Fg, 640, y, 1);
            y += 42;
        }

        if (s.IsBoss)
        {
            Art.Text(g, $"魔王剩餘 HP　{s.BossHp:N0}", 24, Art.Fg, 640, y, 1);
            y += 42;
        }

        Art.Text(g, $"分數　{s.Score:N0}", 20, Muted, 640, y + 4, 1);
        Art.Text(g, "小提示：多做斬擊、爆裂糖晶，多消神器對應的屬性讓必殺技更常發動。", 15, Muted, 640, 470, 1, false);
        Button(g, new RectangleF(414, 520, 260, 68), "再試一次", () => StartLevel(_level.Number - 1), Gold, 28);
        Button(g, new RectangleF(694, 520, 172, 68), "回地圖", GoMap);
    }

    private void DrawPause(Graphics g)
    {
        Dim(g);
        Art.Panel(g, new RectangleF(440, 170, 400, 460), Art.Paper, 20, 10, 4.5f);
        Art.Outlined(g, "暫停", 60, Gold, Art.Ink, 11, 640, 232);
        Button(g, new RectangleF(480, 290, 320, 64), "繼續遊戲", () => _overlay = Overlay.None, Gold, 26);
        Button(g, new RectangleF(480, 370, 320, 64), "重新開始", () => StartLevel(_level.Number - 1));
        Button(g, new RectangleF(480, 450, 320, 64), "回地圖", GoMap);
        Button(g, new RectangleF(480, 530, 320, 64), Sound.MusicOn ? "背景音樂：開" : "背景音樂：關",
            () => Sound.MusicOn = !Sound.MusicOn);
    }
}
