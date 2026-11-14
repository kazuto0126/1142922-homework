using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using CandyLegend.Core;

namespace CandyLegend.UI;

/// <summary>
/// 所有圖都是程式畫出來的（沒有任何外部圖檔）：粗黑描邊、賽璐璐陰影、網點與集中線，走日本漫畫的畫法。
/// 糖晶先畫成小圖存起來，遊戲中直接貼圖。
/// </summary>
internal static partial class Art
{
    public const int Sprite = 88;

    public static readonly Color Ink = Color.FromArgb(26, 20, 44);
    public static readonly Color Paper = Color.FromArgb(253, 248, 236);
    public static readonly Color PaperDim = Color.FromArgb(232, 224, 206);

    // 「深夜藍＋金」的高級感配色：深色半透明玻璃面板、細金框、象牙色文字。
    public static readonly Color Glass = Color.FromArgb(236, 16, 18, 42);
    public static readonly Color GlassDim = Color.FromArgb(236, 26, 26, 44);
    public static readonly Color GoldLine = Color.FromArgb(214, 176, 96);
    public static readonly Color GoldHi = Color.FromArgb(255, 236, 170);
    public static readonly Color GoldDeep = Color.FromArgb(176, 120, 36);
    public static readonly Color Fg = Color.FromArgb(242, 234, 214);

    /// <summary>帶一點屬性色的深色玻璃（給神器卡片、獎勵框用）。</summary>
    public static Color Tint(Color c, float amount = 0.22f) => Mix(Glass, Color.FromArgb(236, c), amount);

    public static readonly Color[] Main =
    {
        // 火＝橘紅、冰＝水藍、天空＝翠綠、雷＝亮黃、星＝夜空藍、劍＝紫。色相彼此拉開，紅粉、黃綠不再相近。
        Color.FromArgb(255, 88, 40), Color.FromArgb(96, 206, 255), Color.FromArgb(34, 196, 116),
        Color.FromArgb(255, 222, 40), Color.FromArgb(62, 84, 214), Color.FromArgb(186, 78, 230),
    };

    public static readonly Color[] Light =
    {
        Color.FromArgb(255, 196, 110), Color.FromArgb(222, 248, 255), Color.FromArgb(176, 255, 206),
        Color.FromArgb(255, 250, 180), Color.FromArgb(156, 176, 255), Color.FromArgb(236, 190, 255),
    };

    public static readonly Color[] Shade =
    {
        Color.FromArgb(196, 30, 30), Color.FromArgb(26, 118, 222), Color.FromArgb(8, 120, 76),
        Color.FromArgb(222, 138, 0), Color.FromArgb(24, 30, 120), Color.FromArgb(104, 30, 156),
    };

    private static float _scale = 1;
    private static readonly Bitmap?[,] Candy = new Bitmap?[6, 4];
    private static Bitmap? _core, _shard, _stone, _ice, _ice2, _jelly1, _jelly2;
    private static FontFamily _family = FontFamily.GenericSansSerif;

    /// <summary>英文與數字標題用的襯線體，Windows 內建。</summary>
    private static FontFamily _serif = FontFamily.GenericSerif;

    /// <summary>日文字型：招式名與片假名狀聲字用它，日文漢字（竜、絶、氷…）才不會缺字。</summary>
    private static FontFamily _japanese = FontFamily.GenericSansSerif;
    private static readonly Dictionary<int, Font> Fonts = new();
    private static readonly StringFormat[] Formats = new StringFormat[6];
    private static readonly ImageAttributes Fade = new();

    public static void Init(float scale)
    {
        _scale = scale;
        foreach (string name in new[] { "Microsoft JhengHei UI", "Microsoft JhengHei", "Microsoft YaHei UI", "Yu Gothic UI" })
        {
            using var probe = new Font(name, 12f);
            if (!string.Equals(probe.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
            _family = new FontFamily(name);
            break;
        }

        foreach (string name in new[] { "Palatino Linotype", "Georgia", "Times New Roman" })
        {
            using var probe = new Font(name, 12f);
            if (!string.Equals(probe.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
            _serif = new FontFamily(name);
            break;
        }

        _japanese = _family;
        foreach (string name in new[] { "Yu Gothic UI", "Meiryo UI", "Meiryo", "MS UI Gothic" })
        {
            using var probe = new Font(name, 12f);
            if (!string.Equals(probe.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
            _japanese = new FontFamily(name);
            break;
        }

        for (int i = 0; i < 6; i++)
        {
            Formats[i] = new StringFormat(StringFormat.GenericTypographic)
            {
                Alignment = (StringAlignment)(i % 3),
                LineAlignment = i >= 3 ? StringAlignment.Center : StringAlignment.Near,
                FormatFlags = StringFormatFlags.NoWrap | StringFormatFlags.NoClip | StringFormatFlags.MeasureTrailingSpaces,
            };
        }

        for (int e = 0; e < 6; e++)
        {
            for (int k = 0; k < 4; k++)
            {
                int element = e;
                Special special = k switch { 1 => Special.LineH, 2 => Special.LineV, 3 => Special.Bomb, _ => Special.None };
                Candy[e, k] = Make(g => PaintCandy(g, element, special));
            }
        }

        _core = Make(PaintCore);
        _shard = Make(PaintShard);
        _stone = Make(PaintStone);
        _ice = Make(PaintIce);
        _ice2 = Make(PaintThickIce);
        _jelly1 = Make(g => PaintJelly(g, 1));
        _jelly2 = Make(g => PaintJelly(g, 2));
    }

    /// <summary>程式圖示：一顆屬性核心。只在產生 .ico 檔時用到。</summary>
    public static Bitmap Icon(int size)
    {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using Graphics g = Graphics.FromImage(bmp);
        Setup(g);
        g.ScaleTransform(size / (float)Sprite, size / (float)Sprite);
        g.TranslateTransform(Sprite / 2f, Sprite / 2f);
        PaintCore(g);
        return bmp;
    }

    public static void Setup(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.AntiAlias;
        g.InterpolationMode = InterpolationMode.Bilinear;
        g.PixelOffsetMode = PixelOffsetMode.Half;
    }

    private static Bitmap Make(Action<Graphics> paint)
    {
        int px = (int)Math.Ceiling(Sprite * _scale);
        var bmp = new Bitmap(px, px, PixelFormat.Format32bppPArgb);
        using Graphics g = Graphics.FromImage(bmp);
        Setup(g);
        g.ScaleTransform(px / (float)Sprite, px / (float)Sprite);
        g.TranslateTransform(Sprite / 2f, Sprite / 2f);
        paint(g);
        return bmp;
    }

    // ───────────────────────── 小工具 ─────────────────────────

    public static Color Mix(Color a, Color b, float t)
    {
        t = Math.Clamp(t, 0, 1);
        return Color.FromArgb(
            (int)(a.A + (b.A - a.A) * t), (int)(a.R + (b.R - a.R) * t),
            (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t));
    }

    public static Color Alpha(Color c, int a) => Color.FromArgb(Math.Clamp(a, 0, 255), c);

    public static GraphicsPath Round(RectangleF r, float radius)
    {
        var path = new GraphicsPath();
        float d = Math.Min(radius * 2, Math.Min(r.Width, r.Height));
        if (d <= 0.5f)
        {
            path.AddRectangle(r);
            return path;
        }

        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    public static PointF[] StarPoints(float cx, float cy, float outer, float inner, int tips, float rotation = -90)
    {
        var pts = new PointF[tips * 2];
        for (int i = 0; i < pts.Length; i++)
        {
            double a = (rotation + i * 180.0 / tips) * Math.PI / 180;
            float radius = i % 2 == 0 ? outer : inner;
            pts[i] = new PointF(cx + (float)Math.Cos(a) * radius, cy + (float)Math.Sin(a) * radius);
        }

        return pts;
    }

    public static void Fill(Graphics g, Color c, RectangleF r, float radius = 0)
    {
        using var brush = new SolidBrush(c);
        if (radius <= 0)
        {
            g.FillRectangle(brush, r);
            return;
        }

        using GraphicsPath path = Round(r, radius);
        g.FillPath(brush, path);
    }

    public static void Poly(Graphics g, Color fill, float outline, params float[] xy)
    {
        var pts = new PointF[xy.Length / 2];
        for (int i = 0; i < pts.Length; i++) pts[i] = new PointF(xy[i * 2], xy[i * 2 + 1]);
        using var brush = new SolidBrush(fill);
        g.FillPolygon(brush, pts);
        if (outline <= 0) return;
        using var pen = new Pen(Ink, outline) { LineJoin = LineJoin.Round };
        g.DrawPolygon(pen, pts);
    }

    public static void Disc(Graphics g, Color fill, float outline, float cx, float cy, float rx, float ry = -1)
    {
        if (ry < 0) ry = rx;
        using var brush = new SolidBrush(fill);
        g.FillEllipse(brush, cx - rx, cy - ry, rx * 2, ry * 2);
        if (outline <= 0) return;
        using var pen = new Pen(Ink, outline);
        g.DrawEllipse(pen, cx - rx, cy - ry, rx * 2, ry * 2);
    }

    public static void Line(Graphics g, Color c, float width, float x1, float y1, float x2, float y2)
    {
        using var pen = new Pen(c, width) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(pen, x1, y1, x2, y2);
    }

    /// <summary>漫畫格：黑色硬陰影 + 粗黑框。</summary>
        /// <summary>
    /// 高級感面板：柔和的陰影、深色半透明玻璃、頂端一道微光、細金色雙框與四角的菱形飾釘。
    /// 傳入 Paper／PaperDim 會自動換成玻璃底色；其他顏色照用（例如金色按鈕）。
    /// </summary>
    public static void Panel(Graphics g, RectangleF r, Color fill, float radius = 14, float shadow = 6, float border = 3.5f)
    {
        if (fill.ToArgb() == Paper.ToArgb()) fill = Glass;
        else if (fill.ToArgb() == PaperDim.ToArgb()) fill = GlassDim;
        radius = Math.Min(radius, 12);

        if (shadow > 0)
        {
            for (int i = 3; i >= 1; i--)
            {
                var s = r;
                s.Inflate(i * 3, i * 3);
                s.Offset(0, shadow * 0.6f);
                Fill(g, Color.FromArgb(34, 0, 0, 8), s, radius + i * 3);
            }
        }

        using (GraphicsPath path = Round(r, radius))
        {
            using (var brush = new SolidBrush(fill)) g.FillPath(brush, path);
            GraphicsState state = g.Save();
            g.SetClip(path, CombineMode.Intersect);
            var top = new RectangleF(r.X, r.Y, r.Width, Math.Min(46, r.Height * 0.4f));
            using (var sheen = new LinearGradientBrush(new PointF(0, top.Y - 1), new PointF(0, top.Bottom + 1),
                       Color.FromArgb(38, 255, 255, 255), Color.FromArgb(0, 255, 255, 255)))
                g.FillRectangle(sheen, top);
            g.Restore(state);

            using var outer = new Pen(GoldLine, 2f);
            g.DrawPath(outer, path);
        }

        if (r.Width > 40 && r.Height > 40)
        {
            var inner = r;
            inner.Inflate(-5, -5);
            using GraphicsPath innerPath = Round(inner, Math.Max(2, radius - 5));
            using var line = new Pen(Color.FromArgb(90, GoldHi), 1f);
            g.DrawPath(line, innerPath);

            foreach (PointF c in new[] { new PointF(r.X + 5, r.Y + 5), new PointF(r.Right - 5, r.Y + 5), new PointF(r.X + 5, r.Bottom - 5), new PointF(r.Right - 5, r.Bottom - 5) })
            {
                using var brush = new SolidBrush(GoldHi);
                g.FillPolygon(brush, new[] { new PointF(c.X, c.Y - 4), new PointF(c.X + 4, c.Y), new PointF(c.X, c.Y + 4), new PointF(c.X - 4, c.Y) });
            }
        }
    }

    /// <summary>
    /// 金色漸層的標題字：外圈柔光、深色細描邊、上亮下暗的金色填色。latin 為 true 時用襯線體（Palatino）。
    /// </summary>
    public static void Fancy(Graphics g, string s, float px, float x, float y, int align = 1, bool latin = false,
        Color? top = null, Color? bottom = null, float glow = 1)
    {
        FontFamily family = latin ? _serif : _family;
        FontStyle style = family.IsStyleAvailable(FontStyle.Bold) ? FontStyle.Bold : FontStyle.Regular;
        using var path = new GraphicsPath();
        using var format = new StringFormat(StringFormat.GenericTypographic)
        {
            Alignment = (StringAlignment)align,
            LineAlignment = StringAlignment.Center,
            FormatFlags = StringFormatFlags.NoWrap | StringFormatFlags.NoClip,
        };
        path.AddString(s, family, (int)style, px, new PointF(x, y), format);
        RectangleF bounds = path.GetBounds();
        if (glow > 0)
        {
            for (int i = 4; i >= 1; i--)
            {
                using var pen = new Pen(Color.FromArgb((int)(26 * glow), 255, 200, 110), px * 0.05f * i) { LineJoin = LineJoin.Round };
                g.DrawPath(pen, path);
            }
        }

        using (var dark = new Pen(Color.FromArgb(230, 30, 16, 6), Math.Max(2, px * 0.07f)) { LineJoin = LineJoin.Round })
            g.DrawPath(dark, path);
        using (var brush = new LinearGradientBrush(new PointF(0, bounds.Top - 1), new PointF(0, bounds.Bottom + 1),
                   top ?? GoldHi, bottom ?? GoldDeep))
        {
            var blend = new ColorBlend
            {
                Colors = new[] { top ?? GoldHi, Mix(top ?? GoldHi, bottom ?? GoldDeep, 0.35f), bottom ?? GoldDeep, Mix(bottom ?? GoldDeep, top ?? GoldHi, 0.5f) },
                Positions = new[] { 0f, 0.45f, 0.75f, 1f },
            };
            brush.InterpolationColors = blend;
            g.FillPath(brush, path);
        }
    }

    /// <summary>金色按鈕：上亮下暗的金屬漸層、深金邊框、頂端一道高光。</summary>
    public static void GoldPanel(Graphics g, RectangleF r, float radius = 12, bool hot = false)
    {
        for (int i = 3; i >= 1; i--)
        {
            var s = r;
            s.Inflate(i * 3, i * 3);
            s.Offset(0, 4);
            Fill(g, Color.FromArgb(30, 0, 0, 8), s, radius + i * 3);
        }

        using GraphicsPath path = Round(r, radius);
        Color top = hot ? Color.FromArgb(255, 246, 200) : Color.FromArgb(255, 234, 160);
        Color bottom = hot ? Color.FromArgb(226, 170, 70) : Color.FromArgb(196, 138, 44);
        using (var brush = new LinearGradientBrush(new PointF(0, r.Top - 1), new PointF(0, r.Bottom + 1), top, bottom))
            g.FillPath(brush, path);
        var shine = r;
        shine.Inflate(-4, -3);
        shine.Height = r.Height * 0.42f;
        Fill(g, Color.FromArgb(70, 255, 255, 255), shine, radius - 3);
        using var pen = new Pen(Color.FromArgb(120, 76, 16), 2f);
        g.DrawPath(pen, path);
    }

    /// <summary>金屬圓牌：深金外環、放射漸層的金面、左上一道反光。red 為 true 時換成紅寶石色。</summary>
    public static void Medallion(Graphics g, float cx, float cy, float r, bool red = false)
    {
        Disc(g, Color.FromArgb(70, 0, 0, 8), 0, cx + 3, cy + 5, r + 2);
        Disc(g, red ? Color.FromArgb(120, 20, 30) : Color.FromArgb(150, 100, 28), 0, cx, cy, r);
        using (var path = new GraphicsPath())
        {
            path.AddEllipse(cx - r * 0.86f, cy - r * 0.86f, r * 1.72f, r * 1.72f);
            using var brush = new PathGradientBrush(path)
            {
                CenterPoint = new PointF(cx - r * 0.25f, cy - r * 0.3f),
                CenterColor = red ? Color.FromArgb(255, 150, 150) : Color.FromArgb(255, 244, 196),
                SurroundColors = new[] { red ? Color.FromArgb(200, 30, 46) : Color.FromArgb(214, 156, 52) },
            };
            g.FillPath(brush, path);
        }

        using (var ring = new Pen(red ? Color.FromArgb(255, 190, 190) : GoldHi, Math.Max(1.5f, r * 0.04f)))
            g.DrawEllipse(ring, cx - r * 0.86f, cy - r * 0.86f, r * 1.72f, r * 1.72f);
        Disc(g, Color.FromArgb(80, 255, 255, 255), 0, cx - r * 0.3f, cy - r * 0.45f, r * 0.4f, r * 0.2f);
    }

    /// <summary>膠囊標籤：有色的深色玻璃底、同色細框、淺色字。</summary>
    public static void Pill(Graphics g, RectangleF r, Color color, string text, float px)
    {
        using GraphicsPath path = Round(r, r.Height / 2);
        using (var brush = new SolidBrush(Tint(color, 0.35f))) g.FillPath(brush, path);
        using (var pen = new Pen(color, 1.6f)) g.DrawPath(pen, path);
        Text(g, text, px, Mix(color, Color.White, 0.55f), r.X + r.Width / 2, r.Y + r.Height / 2 + 1, 1, true, true);
    }

    /// <summary>進度條的凹槽：比面板更深的底色加一圈淡金細框，在深色面板上也看得到。</summary>
    public static void Track(Graphics g, RectangleF r, float radius)
    {
        Fill(g, Color.FromArgb(255, 6, 6, 16), r, radius);
        using GraphicsPath path = Round(r, radius);
        using var pen = new Pen(Color.FromArgb(120, GoldLine), 1.2f);
        g.DrawPath(pen, path);
    }

    /// <summary>標題兩側的金色飾線：細線加中間一顆菱形。</summary>
    public static void Flourish(Graphics g, float x0, float x1, float y)
    {
        using var pen = new Pen(GoldLine, 1.6f);
        g.DrawLine(pen, x0, y, x1, y);
        float mid = (x0 + x1) / 2;
        using var brush = new SolidBrush(GoldHi);
        g.FillPolygon(brush, new[] { new PointF(mid, y - 5), new PointF(mid + 5, y), new PointF(mid, y + 5), new PointF(mid - 5, y) });
    }

    /// <summary>網點（スクリーントーン），只在產生靜態底圖時使用。</summary>
    public static void Tone(Graphics g, RectangleF r, Color dot, float spacing, float radius, float radiusEnd)
    {
        GraphicsState state = g.Save();
        g.SetClip(r, CombineMode.Intersect);
        using var brush = new SolidBrush(dot);
        int row = 0;
        for (float y = r.Y; y < r.Bottom + spacing; y += spacing * 0.866f, row++)
        {
            float t = (y - r.Y) / Math.Max(1, r.Height);
            float rad = radius + (radiusEnd - radius) * t;
            if (rad < 0.3f) continue;
            for (float x = r.X + (row % 2) * spacing / 2; x < r.Right + spacing; x += spacing)
                g.FillEllipse(brush, x - rad, y - rad, rad * 2, rad * 2);
        }

        g.Restore(state);
    }

    // ───────────────────────── 文字 ─────────────────────────

    public static Font FontOf(float px, bool bold = true)
    {
        int key = (int)(px * 4) * 2 + (bold ? 1 : 0);
        if (Fonts.TryGetValue(key, out Font? font)) return font;
        FontStyle style = bold && _family.IsStyleAvailable(FontStyle.Bold) ? FontStyle.Bold : FontStyle.Regular;
        font = new Font(_family, px, style, GraphicsUnit.Pixel);
        Fonts[key] = font;
        return font;
    }

    /// <summary>align：0 靠左、1 置中、2 靠右；y 是文字頂端，middle 為 true 時 y 是垂直中心。</summary>
    public static void Text(Graphics g, string s, float px, Color c, float x, float y, int align = 0,
        bool bold = true, bool middle = false)
    {
        using var brush = new SolidBrush(c);
        g.DrawString(s, FontOf(px, bold), brush, x, y, Formats[align + (middle ? 3 : 0)]);
    }

    /// <summary>和 <see cref="Text"/> 一樣，但文字太長時會自動縮小字級，直到寬度不超過 maxWidth。</summary>
    public static void TextFit(Graphics g, string s, float px, Color c, float x, float y, int align, float maxWidth)
    {
        float size = px;
        while (size > 10 && Measure(g, s, size) > maxWidth) size -= 1;
        Text(g, s, size, c, x, y + (px - size) * 0.6f, align);
    }

    public static float Measure(Graphics g, string s, float px, bool bold = true) =>
        g.MeasureString(s, FontOf(px, bold), 4000, Formats[0]).Width;

    /// <summary>漫畫標題字：先描粗邊再填色。y 是文字的垂直中心。</summary>
    public static void Outlined(Graphics g, string s, float px, Color fill, Color stroke, float width,
        float x, float y, int align = 1, float angle = 0, float scale = 1, bool japanese = false)
    {
        using var path = new GraphicsPath();
        FontFamily family = japanese || HasKana(s) ? _japanese : _family;
        FontStyle style = family.IsStyleAvailable(FontStyle.Bold) ? FontStyle.Bold : FontStyle.Regular;
        using var format = new StringFormat(StringFormat.GenericTypographic)
        {
            Alignment = (StringAlignment)align,
            LineAlignment = StringAlignment.Center,
            FormatFlags = StringFormatFlags.NoWrap | StringFormatFlags.NoClip,
        };
        path.AddString(s, family, (int)style, px, PointF.Empty, format);
        GraphicsState state = g.Save();
        g.TranslateTransform(x, y);
        if (angle != 0) g.RotateTransform(angle);
        if (scale != 1) g.ScaleTransform(scale, scale);
        if (width > 0)
        {
            using var pen = new Pen(stroke, width) { LineJoin = LineJoin.Round };
            g.DrawPath(pen, path);
        }

        using var brush = new SolidBrush(fill);
        g.FillPath(brush, path);
        g.Restore(state);
    }

    private static bool HasKana(string s)
    {
        foreach (char ch in s)
            if (ch is >= '\u3040' and <= '\u30FF') return true;
        return false;
    }

    public static void Star(Graphics g, float cx, float cy, float size, bool lit, float outline = 2.5f)
    {
        PointF[] pts = StarPoints(cx, cy, size, size * 0.48f, 5);
        using var brush = new SolidBrush(lit ? Color.FromArgb(255, 214, 50) : Color.FromArgb(196, 190, 176));
        g.FillPolygon(brush, pts);
        using var pen = new Pen(Ink, outline) { LineJoin = LineJoin.Round };
        g.DrawPolygon(pen, pts);
        if (lit) Disc(g, Color.FromArgb(230, 255, 255, 255), 0, cx - size * 0.22f, cy - size * 0.28f, size * 0.14f, size * 0.09f);
    }

    // ───────────────────────── 糖晶 ─────────────────────────

    private static GraphicsPath ShapeOf(int element)
    {
        var p = new GraphicsPath();
        switch (element)
        {
            case 0: // 火：火焰
                p.AddBezier(0, 28, -32, 24, -27, -6, -9, -15);
                p.AddBezier(-9, -15, -8, -22, -3, -27, 3, -31);
                p.AddBezier(3, -31, 5, -17, 30, -9, 25, 11);
                p.AddBezier(25, 11, 23, 23, 13, 28, 0, 28);
                break;
            case 1: // 冰：六角冰晶
                p.AddPolygon(StarPoints(0, 0, 29, 25.1f, 6));
                break;
            case 2: // 天空：天龍的翅膀（溫蒂的天空滅龍魔法）
                p.AddBezier(-24, 27, -32, -4, -6, -30, 30, -29);
                p.AddBezier(30, -29, 26, -16, 20, -10, 13, -6);
                p.AddBezier(13, -6, 22, -2, 22, 6, 13, 9);
                p.AddBezier(13, 9, 18, 15, 12, 22, 2, 20);
                p.AddBezier(2, 20, 2, 27, -10, 31, -24, 27);
                break;
            case 3: // 雷：菱形
                p.AddPolygon(new[] { new PointF(0, -31), new PointF(31, 0), new PointF(0, 31), new PointF(-31, 0) });
                break;
            case 4: // 星：星星（露西的星靈）
                p.AddPolygon(StarPoints(0, 2, 32, 16, 5));
                break;
            default: // 劍：騎士盾（艾爾莎的換裝）
                p.AddLine(-26, -27, 26, -27);
                p.AddBezier(26, -27, 27, 4, 18, 20, 0, 31);
                p.AddBezier(0, 31, -18, 20, -27, 4, -26, -27);
                break;
        }

        p.CloseFigure();
        return p;
    }

        /// <summary>寶石質感：中心亮、邊緣深的放射漸層，右下一道邊緣反光。</summary>
    private static void Body(Graphics g, GraphicsPath path, int e)
    {
        using (var shade = new SolidBrush(Shade[e])) g.FillPath(shade, path);
        using (var radial = new PathGradientBrush(path))
        {
            radial.CenterPoint = new PointF(-8, -9);
            radial.CenterColor = Light[e];
            radial.SurroundColors = new[] { Shade[e] };
            radial.FocusScales = new PointF(0.25f, 0.25f);
            var blend = new ColorBlend
            {
                Colors = new[] { Shade[e], Main[e], Mix(Main[e], Light[e], 0.5f), Light[e] },
                Positions = new[] { 0f, 0.4f, 0.8f, 1f },
            };
            radial.InterpolationColors = blend;
            g.FillPath(radial, path);
        }

        GraphicsState state = g.Save();
        g.SetClip(path, CombineMode.Intersect);
        g.TranslateTransform(-3, -3);
        using (var rim = new Pen(Color.FromArgb(150, Light[e]), 4)) g.DrawPath(rim, path);
        g.Restore(state);
    }

        private static void Outline(Graphics g, GraphicsPath path, float width = 3.6f)
    {
        using var pen = new Pen(Color.FromArgb(235, 22, 16, 36), width) { LineJoin = LineJoin.Round };
        g.DrawPath(pen, path);
    }

        /// <summary>寶石的鏡面高光：一道彎彎的白色反光加一顆小星芒。</summary>
    private static void Gloss(Graphics g, float x = -15, float y = -17)
    {
        GraphicsState state = g.Save();
        g.TranslateTransform(x, y);
        g.RotateTransform(-35);
        using (var path = new GraphicsPath())
        {
            path.AddBezier(-8, 2, -6, -4, 6, -5, 9, -1);
            path.AddBezier(9, -1, 5, -2, -3, -1, -8, 2);
            using var brush = new SolidBrush(Color.FromArgb(240, 255, 255, 255));
            g.FillPath(brush, path);
        }

        g.Restore(state);
        using var star = new SolidBrush(Color.FromArgb(230, 255, 255, 255));
        g.FillPolygon(star, StarPoints(x + 13, y - 3, 4.2f, 1f, 4));
    }

    private static void Burst(Graphics g, Color fill, float outer, float inner, int tips)
    {
        PointF[] pts = StarPoints(0, 0, outer, inner, tips, -90 + 180f / tips / 2);
        using var brush = new SolidBrush(fill);
        g.FillPolygon(brush, pts);
        using var pen = new Pen(Ink, 2.6f) { LineJoin = LineJoin.Round };
        g.DrawPolygon(pen, pts);
    }

    private static void PaintCandy(Graphics g, int e, Special special)
    {
        using GraphicsPath path = ShapeOf(e);
        if (special == Special.Bomb) Burst(g, Color.FromArgb(255, 252, 214), 42, 31, 12);
        Body(g, path, e);

        switch (e)
        {
            case 0:
            {
                GraphicsState state = g.Save();
                g.TranslateTransform(0, 10);
                g.ScaleTransform(0.52f, 0.52f);
                using (var inner = new SolidBrush(Color.FromArgb(255, 224, 84))) g.FillPath(inner, path);
                g.TranslateTransform(0, 12);
                g.ScaleTransform(0.5f, 0.5f);
                using (var core = new SolidBrush(Color.FromArgb(255, 252, 214))) g.FillPath(core, path);
                g.Restore(state);
                break;
            }
            case 1:
            {
                // 白色雪花：六支主幹，每支帶一對小枝。
                using var pen = new Pen(Color.White, 3.4f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
                for (int i = 0; i < 6; i++)
                {
                    double a = (i * 60 - 90) * Math.PI / 180;
                    float cx = (float)Math.Cos(a), sy = (float)Math.Sin(a);
                    g.DrawLine(pen, 0, 0, cx * 19, sy * 19);
                    float bx = cx * 11, by = sy * 11;
                    for (int side = -1; side <= 1; side += 2)
                    {
                        double b = a + side * 0.75;
                        g.DrawLine(pen, bx, by, bx + (float)Math.Cos(b) * 7, by + (float)Math.Sin(b) * 7);
                    }
                }

                break;
            }
            case 2:
            {
                // 白色的大旋風：天空滅龍魔法的風。
                using var pen = new Pen(Color.White, 4f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
                g.DrawArc(pen, -14, -12, 26, 26, 160, 280);
                g.DrawArc(pen, -6, -5, 12, 12, 200, 250);
                g.DrawLine(pen, -18, 16, -2, 12);
                break;
            }
            case 3:
                // 深色的閃電：黃底配深色，對比最強。
                Poly(g, Ink, 0, 6, -22, -13, 4, -2, 4, -7, 22, 13, -5, 2, -5);
                Poly(g, Color.FromArgb(255, 252, 220), 0, 4, -15, -7, 2, 0, 2, -3, 12, 6, -3, 0, -3);
                break;
            case 4:
            {
                // 夜空藍底上的金色大星與兩顆小星。
                PointF[] gold = StarPoints(0, 3, 16, 7, 5);
                using (var brush = new SolidBrush(Color.FromArgb(255, 214, 60))) g.FillPolygon(brush, gold);
                using (var pen = new Pen(Ink, 2f) { LineJoin = LineJoin.Round }) g.DrawPolygon(pen, gold);
                using (var white = new SolidBrush(Color.White))
                {
                    g.FillPolygon(white, StarPoints(-14, -13, 5, 1.4f, 4));
                    g.FillPolygon(white, StarPoints(15, -6, 4, 1.2f, 4));
                }

                break;
            }
            default:
                // 盾上的劍徽：銀白劍身、金色護手，放大到一眼看得出是劍。
                Poly(g, Color.White, 2.4f, 0, -26, 6, -18, 6, 10, -6, 10, -6, -18);
                Line(g, Color.FromArgb(190, 196, 230), 1.6f, 0, -20, 0, 8);
                Poly(g, Color.FromArgb(255, 210, 60), 2.4f, -15, 9, 15, 9, 15, 16, -15, 16);
                Poly(g, Color.FromArgb(255, 210, 60), 2.4f, -3.5f, 16, 3.5f, 16, 3.5f, 25, -3.5f, 25);
                break;
        }

        if (special is Special.LineH or Special.LineV)
        {
            GraphicsState state = g.Save();
            g.SetClip(path, CombineMode.Intersect);
            if (special == Special.LineV) g.RotateTransform(90);
            Fill(g, Color.FromArgb(238, 255, 255, 255), new RectangleF(-44, -12, 88, 7.5f));
            Fill(g, Color.FromArgb(238, 255, 255, 255), new RectangleF(-44, 4.5f, 88, 7.5f));
            g.Restore(state);
        }

        Outline(g, path, 2.8f);
        if (e != 0) Gloss(g);
        else Gloss(g, -13, 4);

        if (special is Special.LineH or Special.LineV)
        {
            GraphicsState state = g.Save();
            if (special == Special.LineV) g.RotateTransform(90);
            Poly(g, Color.White, 2.2f, 33, -8, 42.5f, 0, 33, 8);
            Poly(g, Color.White, 2.2f, -33, -8, -42.5f, 0, -33, 8);
            g.Restore(state);
        }
        else if (special == Special.Bomb)
        {
            using var pen = new Pen(Color.FromArgb(235, 255, 255, 255), 2.6f) { DashStyle = DashStyle.Dash };
            g.DrawEllipse(pen, -20, -20, 40, 40);
        }
    }

    /// <summary>屬性核心：白色星爆上一枚六色的妖精尾巴公會紋章（六種屬性合而為一）。</summary>
    private static void PaintCore(Graphics g)
    {
        Burst(g, Color.White, 43, 33, 14);
        const float size = 76, cy = 1;

        // 深色粗描邊：把染成墨色的徽章往八方各挪一點疊起來。
        for (int k = 0; k < 16; k++)
        {
            double a = k * Math.PI / 8;
            Mark(g, (float)Math.Cos(a) * 2.4f, cy + (float)Math.Sin(a) * 2.4f, size, Ink);
        }

        GraphicsState state = g.Save();
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.DrawImage(RainbowMark, new RectangleF(-size / 2, cy - size / 2, size, size));
        g.Restore(state);

        // 左上角一點白光，和其他糖晶的光澤一致。
        PointF[] sparkle = StarPoints(-21, -24, 8, 2.2f, 4);
        using (var brush = new SolidBrush(Color.White)) g.FillPolygon(brush, sparkle);
        using (var pen = new Pen(Ink, 1.6f) { LineJoin = LineJoin.Round }) g.DrawPolygon(pen, sparkle);
    }

    /// <summary>掉落物「哈比的魚」：粉紅色的魚，和任何一種糖晶的外形都不一樣。</summary>
    private static void PaintShard(Graphics g)
    {
        Disc(g, Color.FromArgb(80, 255, 220, 236), 0, 0, 0, 36);
        GraphicsState state = g.Save();
        g.RotateTransform(-25);
        Poly(g, Color.FromArgb(236, 96, 150), 3.2f, 16, 0, 34, -15, 30, 0, 34, 15);
        using (var body = new GraphicsPath())
        {
            body.AddEllipse(-30, -15, 50, 30);
            using (var brush = new SolidBrush(Color.FromArgb(255, 150, 190))) g.FillPath(brush, body);
            GraphicsState clip = g.Save();
            g.SetClip(body, CombineMode.Intersect);
            Fill(g, Color.FromArgb(255, 226, 238), new RectangleF(-34, 2, 60, 20));
            g.Restore(clip);
            Outline(g, body);
        }

        Poly(g, Color.FromArgb(236, 96, 150), 2.4f, -6, -13, 4, -24, 10, -12);
        Line(g, Ink, 2f, -10, -13, -14, 13);
        Disc(g, Color.White, 2f, -20, -3, 5);
        Disc(g, Ink, 0, -21, -3, 2.6f);
        g.Restore(state);
        PointF[] sparkle = StarPoints(22, -24, 11, 3, 4);
        using (var brush = new SolidBrush(Color.White)) g.FillPolygon(brush, sparkle);
        using (var pen = new Pen(Ink, 1.8f) { LineJoin = LineJoin.Round }) g.DrawPolygon(pen, sparkle);
    }

    private static void PaintStone(Graphics g)
    {
        using var path = new GraphicsPath();
        path.AddPolygon(new[]
        {
            new PointF(-27, -8), new PointF(-15, -27), new PointF(8, -29), new PointF(27, -13),
            new PointF(29, 12), new PointF(14, 28), new PointF(-12, 29), new PointF(-28, 14),
        });
        using (var shade = new SolidBrush(Color.FromArgb(76, 74, 98))) g.FillPath(shade, path);
        Poly(g, Color.FromArgb(124, 122, 144), 0, -27, -8, -15, -27, 8, -29, 27, -13, 16, 8, -6, 14, -28, 14);
        Poly(g, Color.FromArgb(172, 172, 190), 0, -27, -8, -15, -27, 8, -29, 2, -12, -14, -4);
        Line(g, Ink, 2f, 2, -12, 16, 8);
        Line(g, Ink, 2f, 2, -12, -6, 14);
        Line(g, Ink, 1.6f, -6, 14, -2, 26);
        Outline(g, path);
    }

    private static void PaintIce(Graphics g)
    {
        var r = new RectangleF(-30, -30, 60, 60);
        Fill(g, Color.FromArgb(92, 186, 234, 255), r, 12);
        using (GraphicsPath path = Round(r, 12))
        {
            using var ink = new Pen(Alpha(Ink, 210), 4.4f);
            g.DrawPath(ink, path);
            using var white = new Pen(Color.White, 2.2f);
            g.DrawPath(white, path);
        }

        Line(g, Color.FromArgb(230, 255, 255, 255), 3f, -20, -6, -6, -20);
        Line(g, Color.FromArgb(230, 255, 255, 255), 2.2f, -21, 6, -13, -2);
        Line(g, Color.FromArgb(200, 255, 255, 255), 2.2f, 12, 21, 21, 12);
        Poly(g, Color.FromArgb(235, 226, 248, 255), 1.4f, -18, 29, -13, 40, -8, 29);
        Poly(g, Color.FromArgb(235, 226, 248, 255), 1.4f, 4, 29, 8, 37, 12, 29);
    }

    /// <summary>厚冰：比一般冰封更不透明、更藍，外框是兩層，四角有冰柱。</summary>
    private static void PaintThickIce(Graphics g)
    {
        var r = new RectangleF(-31, -31, 62, 62);
        Fill(g, Color.FromArgb(150, 120, 196, 255), r, 12);
        Fill(g, Color.FromArgb(70, 255, 255, 255), new RectangleF(-26, -27, 52, 20), 8);
        using (GraphicsPath path = Round(r, 12))
        {
            using var ink = new Pen(Alpha(Ink, 220), 5f);
            g.DrawPath(ink, path);
            using var white = new Pen(Color.White, 2.6f);
            g.DrawPath(white, path);
        }

        using (GraphicsPath inner = Round(new RectangleF(-23, -23, 46, 46), 8))
        using (var pen = new Pen(Color.FromArgb(220, 230, 248, 255), 2f))
            g.DrawPath(pen, inner);

        Line(g, Color.FromArgb(240, 255, 255, 255), 3.2f, -20, -6, -6, -20);
        Line(g, Color.FromArgb(240, 255, 255, 255), 2.4f, 10, 22, 22, 10);
        foreach (float x in new[] { -24f, 24f })
            foreach (float y in new[] { -24f, 24f })
                Poly(g, Color.FromArgb(245, 236, 250, 255), 1.6f, x - 5, y, x, y - 7 * Math.Sign(y) * -1, x + 5, y);
    }

    private static void PaintJelly(Graphics g, int layers)
    {
        var r = new RectangleF(-30, -30, 60, 60);
        Fill(g, layers == 2 ? Color.FromArgb(225, 214, 44, 150) : Color.FromArgb(150, 255, 110, 184), r, 14);
        Fill(g, Color.FromArgb(layers == 2 ? 70 : 90, 255, 255, 255), new RectangleF(-25, -26, 50, 18), 9);
        using GraphicsPath path = Round(r, 14);
        using var pen = new Pen(layers == 2 ? Color.FromArgb(255, 255, 214, 236) : Color.FromArgb(220, 255, 196, 226), 2.4f);
        g.DrawPath(pen, path);
        if (layers != 2) return;
        using GraphicsPath inner = Round(new RectangleF(-24, -24, 48, 48), 10);
        using var dash = new Pen(Color.FromArgb(230, 255, 255, 255), 2f) { DashStyle = DashStyle.Dash };
        g.DrawPath(dash, inner);
    }

    public static Bitmap SpriteOf(Piece p)
    {
        if (p.Kind == PieceKind.Shard) return _shard!;
        if (p.Kind == PieceKind.Stone) return _stone!;
        if (p.Special == Special.Core) return _core!;
        int k = p.Special switch { Special.LineH => 1, Special.LineV => 2, Special.Bomb => 3, _ => 0 };
        return Candy[(int)p.Element, k]!;
    }

    public static Bitmap CandySprite(int element, Special special = Special.None) =>
        special == Special.Core
            ? _core!
            : Candy[element, special switch { Special.LineH => 1, Special.LineV => 2, Special.Bomb => 3, _ => 0 }]!;

    public static Bitmap ShardSprite => _shard!;
    public static Bitmap StoneSprite => _stone!;
    public static Bitmap IceSprite => _ice!;

    /// <summary>厚冰：要打兩次才會解開。</summary>
    public static Bitmap ThickIceSprite => _ice2!;

    public static Bitmap JellySprite(int layers) => layers >= 2 ? _jelly2! : _jelly1!;

    /// <summary>以 (cx, cy) 為中心貼一張小圖；size 是邏輯邊長，alpha 小於 1 時半透明。</summary>
    public static void Draw(Graphics g, Bitmap sprite, float cx, float cy, float size = Sprite, float alpha = 1,
        float stretchX = 1, float stretchY = 1)
    {
        float w = size * stretchX, h = size * stretchY;
        var dest = new RectangleF(cx - w / 2, cy - h / 2, w, h);
        if (alpha >= 0.995f)
        {
            g.DrawImage(sprite, dest);
            return;
        }

        var matrix = new ColorMatrix { Matrix33 = Math.Max(0, alpha) };
        Fade.SetColorMatrix(matrix);
        var pts = new[] { new PointF(dest.Left, dest.Top), new PointF(dest.Right, dest.Top), new PointF(dest.Left, dest.Bottom) };
        g.DrawImage(sprite, pts, new RectangleF(0, 0, sprite.Width, sprite.Height), GraphicsUnit.Pixel, Fade);
    }

    // ───────────────────────── 神器 ─────────────────────────

    /// <summary>六件神器的圖示，畫在以 (cx, cy) 為中心、邊長 size 的方框裡。還沒拿到的只畫剪影。</summary>
    public static void Artifact(Graphics g, int index, float cx, float cy, float size, bool owned)
    {
        GraphicsState state = g.Save();
        g.TranslateTransform(cx, cy);
        g.ScaleTransform(size / 110f, size / 110f);
        Color C(int r, int gg, int b) => owned ? Color.FromArgb(r, gg, b) : Color.FromArgb(96, 90, 120);
        const float o = 3.2f;
        switch (index)
        {
            case 0: // 火：劍
                g.RotateTransform(35);
                Poly(g, C(255, 120, 40), o, -11, -38, 0, -56, 11, -38, 13, -8, 8, 16, -8, 16, -13, -8);
                Poly(g, C(255, 244, 224), 2f, -5, -38, 0, -48, 5, -38, 5, 14, -5, 14);
                Line(g, C(255, 160, 90), 2f, 0, -40, 0, 12);
                Poly(g, C(255, 204, 50), o, -22, 12, 22, 12, 17, 21, -17, 21);
                Poly(g, C(120, 50, 44), o, -4.5f, 21, 4.5f, 21, 4.5f, 40, -4.5f, 40);
                Disc(g, C(255, 80, 60), o, 0, 44, 6.5f);
                break;
            case 1: // 冰：長槍
                g.RotateTransform(20);
                Poly(g, C(150, 204, 238), o, -3.5f, -10, 3.5f, -10, 3.5f, 50, -3.5f, 50);
                Poly(g, C(226, 246, 255), o, -8, -14, -30, -34, -12, -28);
                Poly(g, C(226, 246, 255), o, 8, -14, 30, -34, 12, -28);
                using (var brush = new SolidBrush(C(110, 212, 255)))
                {
                    PointF[] hex = StarPoints(0, -30, 19, 16.4f, 6);
                    g.FillPolygon(brush, hex);
                    using var pen = new Pen(Ink, o) { LineJoin = LineJoin.Round };
                    g.DrawPolygon(pen, hex);
                }

                Poly(g, C(226, 250, 255), 0, 0, -44, 9, -30, 0, -20, -9, -30);
                Disc(g, C(110, 212, 255), o, 0, 52, 5);
                break;
            case 2: // 天空：龍捲風（天龍的波颪）——上寬下尖的漏斗，一圈圈白色風帶往下收，旁邊捲著風線
            {
                using (var funnel = new GraphicsPath())
                {
                    funnel.AddClosedCurve(Pts(-46, -40, -30, -14, -17, 10, -8, 30, 1, 50, 9, 30, 15, 8, 29, -16, 46, -42, 0, -50), 0.45f);
                    using (var brush = new SolidBrush(C(64, 204, 128))) g.FillPath(brush, funnel);
                    GraphicsState clip = g.Save();
                    g.SetClip(funnel, CombineMode.Intersect);
                    using (var shade = new SolidBrush(C(22, 140, 92))) g.FillPolygon(shade, Pts(8, -50, 50, -50, 50, 50, 4, 50, 14, 0));
                    for (int k = 0; k < 5; k++)
                    {
                        float y = -36 + k * 17, w = 46 - k * 9.5f, x = (k % 2 == 0 ? -1 : 1) * 2.5f;
                        using var band = new Pen(owned ? Color.FromArgb(235, 236, 255, 244) : C(150, 150, 150), 3.2f);
                        g.DrawArc(band, x - w, y - 6, w * 2, 12, 10, 160);
                    }

                    g.Restore(clip);
                    Outline(g, funnel, o);
                }

                Disc(g, C(196, 255, 214), o, 0, -45, 44, 8);
                using (var streak = new Pen(owned ? C(150, 240, 190) : C(130, 130, 130), 3f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                {
                    g.DrawBezier(streak, -54, -20, -62, -6, -50, 6, -36, 2);
                    g.DrawBezier(streak, 52, -4, 60, 10, 46, 22, 30, 16);
                    g.DrawBezier(streak, -38, 30, -46, 40, -32, 48, -20, 42);
                }

                Poly(g, C(120, 230, 150), 1.8f, 36, -28, 46, -32, 42, -22);
                Poly(g, C(120, 230, 150), 1.8f, -44, 14, -52, 22, -40, 24);
                break;
            }
            case 3: // 雷：兩道閃電交叉成 X（鳴御雷），交叉處迸出火花
            {
                if (owned) Disc(g, Color.FromArgb(110, 255, 230, 120), 0, 0, 0, 34);
                for (int k = 0; k < 2; k++)
                {
                    GraphicsState bolt = g.Save();
                    g.RotateTransform(k == 0 ? -38 : 38);
                    Poly(g, k == 0 ? C(255, 214, 40) : C(255, 236, 120), o, 13, -54, -21, 5, -1, 5, -13, 54, 23, -9, 3, -9, 19, -54);
                    Poly(g, owned ? Color.FromArgb(240, 255, 255, 255) : C(170, 170, 170), 0, 10, -44, -11, 1, 3, 1, -5, 38, 14, -5, 0, -5, 13, -44);
                    g.Restore(bolt);
                }

                if (owned)
                {
                    using var spark = new SolidBrush(Color.White);
                    g.FillPolygon(spark, StarPoints(0, 0, 16, 3.5f, 4, 45));
                    g.FillPolygon(spark, StarPoints(0, 0, 10, 2.5f, 4, 0));
                }

                break;
            }
            case 4: // 星：黃金星靈鑰匙
            {
                g.RotateTransform(35);
                Poly(g, C(255, 196, 50), o, -5, -8, 5, -8, 5, 46, -5, 46);
                Poly(g, C(255, 196, 50), o, 5, 26, 18, 26, 18, 33, 5, 33);
                Poly(g, C(255, 196, 50), o, 5, 37, 14, 37, 14, 44, 5, 44);
                using (var brush = new SolidBrush(C(255, 214, 80)))
                {
                    PointF[] star = StarPoints(0, -28, 27, 12, 5);
                    g.FillPolygon(brush, star);
                    using var pen = new Pen(Ink, o) { LineJoin = LineJoin.Round };
                    g.DrawPolygon(pen, star);
                }

                Disc(g, C(255, 130, 190), 2.4f, 0, -27, 6.5f);
                Line(g, C(255, 250, 220), 2.2f, -2, 0, -2, 40);
                break;
            }
            default: // 劍：天輪之鎧，八把劍劍柄朝內、劍尖朝外圍成一圈
            {
                g.RotateTransform(22.5f);
                for (int k = 0; k < 8; k++)
                {
                    GraphicsState sword = g.Save();
                    g.RotateTransform(k * 45);
                    Color blade = k % 2 == 0 ? C(236, 238, 252) : C(200, 206, 240);
                    Poly(g, blade, 2.6f, -4.5f, -19, -4.5f, -45, 0, -55, 4.5f, -45, 4.5f, -19);
                    Line(g, owned ? Color.White : C(0, 0, 0), 1.4f, -1.2f, -21, -1.2f, -45);
                    Poly(g, C(255, 196, 50), 2.4f, -10, -19, 10, -19, 10, -14, -10, -14);
                    Poly(g, C(170, 60, 90), 2f, -2.5f, -14, 2.5f, -14, 2.5f, -8, -2.5f, -8);
                    g.Restore(sword);
                }

                using (var ring = new Pen(Ink, 6)) g.DrawEllipse(ring, -11, -11, 22, 22);
                using (var gold = new Pen(C(255, 196, 50), 3)) g.DrawEllipse(gold, -11, -11, 22, 22);
                Disc(g, C(255, 90, 110), 2, 0, 0, 4.5f);
                break;
            }
        }

        g.Restore(state);
    }

    // ───────────────────────── 魔王 ─────────────────────────

    /// <summary>
    /// 魔王半身像。flash 是被打中時的閃白程度（0–1），enraged 會讓眼睛與氣焰變色。
    /// 以 (cx, cy) 為中心，原始大小約 300×340，scale 調整大小。
    /// </summary>
    private static Bitmap? _bossArt, _humanArt, _glitterArt;

    /// <summary>內嵌在 exe 裡的魔王插圖（龍形態），第一次用到才解碼。</summary>
    public static Bitmap BossArt => _bossArt ??= LoadPicture("Boss.acnologia.jpg");

    /// <summary>第一階段的人形態（Fairy Tail wiki 的動畫畫面）。</summary>
    public static Bitmap HumanArt => _humanArt ??= LoadPicture("Boss.acnologia_human.jpg");

    private static Bitmap? _markArt;

    /// <summary>妖精尾巴公會徽章的形狀（白色、透明底），畫的時候再染色。</summary>
    private static Bitmap MarkArt => _markArt ??= LoadPicture("Art.mark.png");

    /// <summary>以 (cx, cy) 為中心畫一個 size 大小、染成 color（含透明度）的妖精尾巴徽章。</summary>
    public static void Mark(Graphics g, float cx, float cy, float size, Color color)
    {
        using var attrs = new ImageAttributes();
        attrs.SetColorMatrix(new ColorMatrix
        {
            Matrix00 = color.R / 255f, Matrix11 = color.G / 255f, Matrix22 = color.B / 255f, Matrix33 = color.A / 255f,
        });
        Bitmap art = MarkArt;
        GraphicsState state = g.Save();
        g.InterpolationMode = InterpolationMode.HighQualityBilinear;
        // 用浮點座標貼圖：糖晶小圖是放大座標系畫的，取整數會讓描邊歪掉。
        float x = cx - size / 2, y = cy - size / 2;
        var dest = new[] { new PointF(x, y), new PointF(x + size, y), new PointF(x, y + size) };
        g.DrawImage(art, dest, new RectangleF(0, 0, art.Width, art.Height), GraphicsUnit.Pixel, attrs);
        g.Restore(state);
    }

    private static Bitmap? _rainbowMark;

    /// <summary>六色公會紋章：徽章形狀裡斜切成六條，由上而下是火、冰、天空、雷、星、劍六種屬性色。</summary>
    private static Bitmap RainbowMark => _rainbowMark ??= BuildRainbowMark(256);

    private static Bitmap BuildRainbowMark(int size)
    {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.DrawImage(MarkArt, new Rectangle(0, 0, size, size));
        }

        var rect = new Rectangle(0, 0, size, size);
        BitmapData data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        var px = new int[size * size];
        System.Runtime.InteropServices.Marshal.Copy(data.Scan0, px, 0, px.Length);

        // 條紋沿著 (0.5, 1) 方向切：先量出徽章在這個方向上的範圍，六條才會一樣寬。
        float lo = float.MaxValue, hi = float.MinValue;
        for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                if (((px[y * size + x] >> 24) & 0xFF) < 128) continue;
                float t = x * 0.5f + y;
                lo = Math.Min(lo, t);
                hi = Math.Max(hi, t);
            }

        for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                int i = y * size + x;
                int a = (px[i] >> 24) & 0xFF;
                if (a == 0) continue;
                int k = Math.Clamp((int)((x * 0.5f + y - lo) / (hi - lo) * 6), 0, 5);
                px[i] = (a << 24) | (Main[k].ToArgb() & 0xFFFFFF);
            }

        System.Runtime.InteropServices.Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);
        return bmp;
    }

    /// <summary>妖精的光耀特寫用的動畫截圖（光環收束的那一幕）。</summary>
    public static Bitmap GlitterArt => _glitterArt ??= LoadPicture("Art.glitter.jpg");

    private static Bitmap LoadPicture(string resource)
    {
#if WEB
        // 網頁版：圖片由瀏覽器在開始前解碼好。
        return CandyLegend.Web.WebImages.Get(resource);
#else
        using Stream stream = System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream(resource)!;
        using var decoded = new Bitmap(stream);
        var bitmap = new Bitmap(decoded.Width, decoded.Height, PixelFormat.Format32bppPArgb);
        using Graphics g = Graphics.FromImage(bitmap);
        g.DrawImage(decoded, 0, 0, decoded.Width, decoded.Height);
        return bitmap;
#endif
    }

    public static void Boss(Graphics g, float cx, float cy, float scale, float time, float flash, bool enraged)
    {
        GraphicsState state = g.Save();
        g.TranslateTransform(cx, cy);
        g.ScaleTransform(scale, scale);

        // 氣焰
        var aura = new PointF[28];
        for (int i = 0; i < aura.Length; i++)
        {
            double a = i * Math.PI * 2 / aura.Length;
            float wobble = (float)Math.Sin(time * 3.2 + i * 1.7) * 9;
            float radius = (i % 2 == 0 ? 168 : 132) + wobble;
            aura[i] = new PointF((float)Math.Cos(a) * radius * 0.92f, 10 + (float)Math.Sin(a) * radius);
        }

        using (var brush = new SolidBrush(Alpha(enraged ? Color.FromArgb(255, 40, 60) : Color.FromArgb(150, 70, 255), 110)))
            g.FillPolygon(brush, aura);

        // 黑龍本體：網路上的阿庫諾洛基亞插圖（真島浩線稿、Berto 上色，見 Assets\Boss）。
        // 大圖填滿魔王欄；小圖示（scale 很小時）改成以龍頭為中心的圓形徽章。
        // 第一階段是人形態，龍化（enraged）後換成龍形態。
        Bitmap art = enraged ? BossArt : HumanArt;
        float breathe = 1 + 0.015f * (float)Math.Sin(time * 2);
        bool icon = scale < 0.4f;
        float w = icon ? 520 : 362, h = w * art.Height / art.Width;
        float eyeU = enraged ? 0.496f : 0.53f, eyeV = enraged ? 0.569f : 0.31f;
        float x0 = icon ? -w * eyeU : -w / 2, y0 = icon ? -h * eyeV : -h / 2 - 32;
        g.ScaleTransform(breathe, breathe);
        using (var clip = new GraphicsPath())
        {
            if (icon) clip.AddEllipse(-150, -150, 300, 300);
            else clip.AddRectangle(new RectangleF(x0, y0, w, h));
            GraphicsState inner = g.Save();
            g.SetClip(clip, CombineMode.Intersect);
            g.InterpolationMode = InterpolationMode.HighQualityBilinear;
            g.DrawImage(art, x0, y0, w, h);

            // 狂暴化時整張染紅；被打中時閃白。
            if (enraged)
                using (var tint = new SolidBrush(Color.FromArgb((int)(60 + 30 * Math.Sin(time * 4)), 255, 30, 40)))
                    g.FillPath(tint, clip);
            if (flash > 0)
                using (var white = new SolidBrush(Color.FromArgb((int)(200 * Math.Min(1, flash)), 255, 255, 255)))
                    g.FillPath(white, clip);

            // 龍形態的眼睛會發紅光呼吸；人形態不加光，保留原圖。
            if (enraged)
            {
                float ex = x0 + w * eyeU, ey = y0 + h * eyeV;
                float glow = 0.5f + 0.5f * (float)Math.Sin(time * 5);
                Color eye = Color.FromArgb(255, 60, 60);
                Disc(g, Alpha(eye, (int)(60 + 60 * glow)), 0, ex, ey, 22 + 8 * glow, 16 + 6 * glow);
                Disc(g, Alpha(eye, 200), 0, ex, ey, 7, 5);
            }
            g.Restore(inner);
            if (icon)
                using (var pen = new Pen(Ink, 14))
                    g.DrawPath(pen, clip);
        }

        g.Restore(state);
    }

    // ───────────────────────── 背景 ─────────────────────────

    /// <summary>整張背景：漸層 + 集中線 + 網點。boss 為 true 時改成暗紅色調。</summary>
        /// <summary>
    /// 整張背景：深夜藍漸層、中央柔光、散景光點、淡淡的巨大魔法陣與四周暗角。
    /// boss 為 true 時改成深紅色調。只在進場時畫一次，之後直接貼圖。
    /// </summary>
    public static Bitmap Background(int width, int height, float scale, bool boss, int seed)
    {
        var bmp = new Bitmap((int)Math.Round(width * scale), (int)Math.Round(height * scale), PixelFormat.Format32bppPArgb);
        using Graphics g = Graphics.FromImage(bmp);
        Setup(g);
        g.ScaleTransform(scale, scale);
        var all = new RectangleF(0, 0, width, height);
        Color top = boss ? Color.FromArgb(14, 4, 10) : Color.FromArgb(8, 10, 28);
        Color bottom = boss ? Color.FromArgb(64, 10, 26) : Color.FromArgb(34, 22, 66);
        using (var brush = new LinearGradientBrush(new PointF(0, -1), new PointF(0, height + 1), top, bottom))
            g.FillRectangle(brush, all);

        // 中央柔光
        using (var glowPath = new GraphicsPath())
        {
            glowPath.AddEllipse(width / 2f - 620, height * 0.5f - 420, 1240, 840);
            using var glow = new PathGradientBrush(glowPath)
            {
                CenterColor = boss ? Color.FromArgb(70, 255, 70, 70) : Color.FromArgb(60, 120, 110, 255),
                SurroundColors = new[] { Color.FromArgb(0, 0, 0, 0) },
            };
            g.FillPath(glow, glowPath);
        }

        // 散景光點
        var rng = new Random(seed);
        for (int i = 0; i < 70; i++)
        {
            float x = (float)rng.NextDouble() * width, y = (float)rng.NextDouble() * height;
            float r = 2 + (float)Math.Pow(rng.NextDouble(), 3) * 26;
            Color c = rng.Next(3) == 0 ? GoldHi : boss ? Color.FromArgb(255, 140, 140) : Color.FromArgb(150, 170, 255);
            Disc(g, Color.FromArgb(r > 10 ? 18 : 60, c), 0, x, y, r);
        }

        // 淡淡的巨大魔法陣
        using (var pen = new Pen(Color.FromArgb(boss ? 26 : 22, GoldHi), 2))
        {
            float cx = width / 2f, cy = height * 0.55f;
            foreach (float r in new[] { 470f, 430f, 260f })
                g.DrawEllipse(pen, cx - r, cy - r, r * 2, r * 2);
            g.DrawPolygon(pen, StarPoints(cx, cy, 430, 165, 6, -90));
            for (int i = 0; i < 24; i++)
            {
                double a = i * Math.PI / 12;
                g.DrawLine(pen, cx + (float)Math.Cos(a) * 430, cy + (float)Math.Sin(a) * 430, cx + (float)Math.Cos(a) * 470, cy + (float)Math.Sin(a) * 470);
            }
        }

        // 四周暗角
        using (var vignettePath = new GraphicsPath())
        {
            vignettePath.AddEllipse(-width * 0.25f, -height * 0.3f, width * 1.5f, height * 1.6f);
            using var vignette = new PathGradientBrush(vignettePath)
            {
                CenterColor = Color.FromArgb(0, 0, 0, 0),
                SurroundColors = new[] { Color.FromArgb(200, 0, 0, 6) },
                FocusScales = new PointF(0.55f, 0.5f),
            };
            g.FillRectangle(vignette, all);
        }

        return bmp;
    }
}
