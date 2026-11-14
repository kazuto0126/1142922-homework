using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace CandyLegend.UI;

/// <summary>
/// 原創主角：魔法公會的少年魔導士。走 2000 年代末日本電視動畫的畫法：
/// 粗黑輪廓、大眼睛、略尖的下巴、分束的尖髮、硬邊的賽璐璐陰影與頭髮高光。
/// 全部用向量畫在 520×760 的區域裡（頭頂在上、畫面下緣切在腰部）。
/// </summary>
internal static partial class Art
{
    public const int HeroW = 520, HeroH = 760;

    private static readonly Color Skin = Color.FromArgb(255, 228, 204);
    private static readonly Color SkinShade = Color.FromArgb(240, 178, 158);
    private static readonly Color HairBase = Color.FromArgb(44, 66, 150);
    private static readonly Color HairShade = Color.FromArgb(24, 30, 86);
    private static readonly Color HairShine = Color.FromArgb(130, 206, 255);
    private static readonly Color Coat = Color.FromArgb(36, 34, 66);
    private static readonly Color CoatShade = Color.FromArgb(20, 18, 40);
    private static readonly Color Trim = Color.FromArgb(246, 196, 60);
    private static readonly Color Cape = Color.FromArgb(214, 36, 52);
    private static readonly Color CapeShade = Color.FromArgb(140, 16, 36);

    private static PointF[] Pts(params float[] xy)
    {
        var pts = new PointF[xy.Length / 2];
        for (int i = 0; i < pts.Length; i++) pts[i] = new PointF(xy[i * 2], xy[i * 2 + 1]);
        return pts;
    }

    private static GraphicsPath PolyPath(params float[] xy)
    {
        var path = new GraphicsPath();
        path.AddPolygon(Pts(xy));
        return path;
    }

    private static GraphicsPath CurvePath(float tension, params float[] xy)
    {
        var path = new GraphicsPath();
        path.AddClosedCurve(Pts(xy), tension);
        return path;
    }

    private static void FillInk(Graphics g, GraphicsPath path, Color fill, float outline)
    {
        using (var brush = new SolidBrush(fill)) g.FillPath(brush, path);
        if (outline <= 0) return;
        using var pen = new Pen(Ink, outline) { LineJoin = LineJoin.Round };
        g.DrawPath(pen, path);
    }

    /// <summary>在 <paramref name="clip"/> 範圍裡塗一塊硬邊陰影（賽璐璐上色）。</summary>
    private static void CelShade(Graphics g, GraphicsPath clip, Color color, params float[] xy)
    {
        GraphicsState state = g.Save();
        g.SetClip(clip, CombineMode.Intersect);
        using var brush = new SolidBrush(color);
        g.FillPolygon(brush, Pts(xy));
        g.Restore(state);
    }

    /// <summary>把主角畫成一張透明背景的圖（依螢幕比例），標題畫面直接貼上。</summary>
    public static Bitmap HeroBitmap(float size = 1)
    {
        int w = (int)Math.Ceiling(HeroW * _scale * size), h = (int)Math.Ceiling(HeroH * _scale * size);
        var bmp = new Bitmap(w, h, PixelFormat.Format32bppPArgb);
        using Graphics g = Graphics.FromImage(bmp);
        Setup(g);
        g.ScaleTransform(_scale * size, _scale * size);
        Hero(g);
        return bmp;
    }

    public static void Hero(Graphics g)
    {
        HeroBackHair(g);
        HeroBody(g);
        HeroHead(g);
        HeroArm(g);
    }

    private static void HeroBackHair(Graphics g)
    {
        // 頭髮的大輪廓：一束一束往外翹的尖髮。
        using GraphicsPath hair = PolyPath(
            178, 252, 132, 236, 162, 206, 104, 178, 158, 158, 112, 112, 178, 112, 168, 52,
            228, 88, 252, 18, 284, 80, 336, 30, 338, 100, 402, 82, 360, 140, 418, 158,
            364, 188, 400, 226, 344, 250, 340, 160, 180, 160);
        FillInk(g, hair, HairBase, 4.5f);
        CelShade(g, hair, HairShade,
            300, 140, 420, 120, 420, 260, 330, 260, 344, 196);
        CelShade(g, hair, HairShade,
            100, 190, 170, 196, 186, 260, 100, 260);

        // 頭頂的高光：幾道斜斜的亮色反光（動畫的「天使環」）。
        using var shine = new SolidBrush(HairShine);
        g.FillPolygon(shine, Pts(196, 104, 226, 96, 214, 116));
        g.FillPolygon(shine, Pts(238, 78, 262, 46, 256, 84));
        g.FillPolygon(shine, Pts(286, 84, 318, 62, 306, 92));
        g.FillPolygon(shine, Pts(150, 168, 178, 150, 172, 170));
    }

    private static void HeroBody(Graphics g)
    {
        // 公會大衣：深藍黑底、金色滾邊，立領。
        using GraphicsPath coat = CurvePath(0.35f,
            236, 330, 176, 344, 136, 372, 116, 440, 108, 760, 412, 760, 404, 440, 384, 372, 344, 344, 284, 330);
        FillInk(g, coat, Coat, 4.5f);
        CelShade(g, coat, CoatShade, 300, 330, 420, 330, 420, 760, 340, 760, 330, 520);
        using (var fold = new Pen(CoatShade, 3) { StartCap = LineCap.Round, EndCap = LineCap.Round })
        {
            g.DrawBezier(fold, 200, 470, 214, 560, 206, 640, 214, 760);
            g.DrawBezier(fold, 312, 470, 300, 560, 310, 660, 300, 760);
        }

        // 胸前 V 領露出的白襯衫
        using (GraphicsPath shirt = PolyPath(240, 334, 260, 440, 280, 334))
        {
            FillInk(g, shirt, Paper, 3);
            CelShade(g, shirt, PaperDim, 260, 334, 280, 334, 262, 430);
        }

        using (var trim = new Pen(Trim, 5) { StartCap = LineCap.Round, EndCap = LineCap.Round })
        {
            g.DrawLine(trim, 236, 338, 258, 446);
            g.DrawLine(trim, 284, 338, 262, 446);
            g.DrawLine(trim, 260, 446, 260, 760);
        }

        // 腰帶與扣環
        using (GraphicsPath belt = PolyPath(118, 640, 404, 632, 406, 668, 116, 676))
            FillInk(g, belt, Color.FromArgb(110, 66, 40), 3.5f);
        using (GraphicsPath buckle = CurvePath(0.2f, 240, 630, 280, 628, 282, 674, 238, 676))
            FillInk(g, buckle, Trim, 3.5f);

        // 立領
        using (GraphicsPath left = PolyPath(238, 296, 210, 306, 200, 356, 240, 344))
        {
            FillInk(g, left, Coat, 4);
            using var line = new Pen(Trim, 3.5f);
            g.DrawLine(line, 212, 312, 204, 350);
        }

        using (GraphicsPath right = PolyPath(282, 296, 310, 306, 320, 356, 280, 344))
        {
            FillInk(g, right, CoatShade, 4);
            using var line = new Pen(Trim, 3.5f);
            g.DrawLine(line, 308, 312, 316, 350);
        }

        // 原創公會紋章：帶翅膀的星形糖晶（畫在胸口）。
        GraphicsState crest = g.Save();
        g.TranslateTransform(322, 470);
        using (var red = new SolidBrush(Cape))
        {
            g.FillPolygon(red, Pts(-6, -4, -30, -18, -24, -2, -34, 4, -10, 6));
            g.FillPolygon(red, Pts(6, -4, 30, -18, 24, -2, 34, 4, 10, 6));
            g.FillPolygon(red, StarPoints(0, 0, 16, 6, 4));
        }

        g.Restore(crest);

        // 披風：紅底、深紅陰影、金邊，從左肩披下來。
        using GraphicsPath cape = CurvePath(0.3f,
            206, 346, 150, 358, 112, 420, 84, 560, 70, 760, 190, 760, 172, 600, 176, 470, 196, 400);
        FillInk(g, cape, Cape, 4.5f);
        CelShade(g, cape, CapeShade, 150, 420, 176, 470, 172, 600, 190, 760, 140, 760, 136, 560);
        using (var trim = new Pen(Trim, 4) { StartCap = LineCap.Round, EndCap = LineCap.Round })
            g.DrawBezier(trim, 196, 404, 174, 470, 170, 620, 186, 756);
        using (GraphicsPath clasp = CurvePath(0.5f, 186, 356, 202, 350, 210, 366, 196, 378, 182, 370))
            FillInk(g, clasp, Trim, 3.5f);
    }

    private static void HeroHead(Graphics g)
    {
        // 脖子與下巴陰影
        using (GraphicsPath neck = PolyPath(238, 280, 236, 340, 284, 340, 282, 280))
        {
            FillInk(g, neck, Skin, 3.5f);
            CelShade(g, neck, SkinShade, 236, 280, 284, 280, 284, 318, 260, 330, 236, 318);
        }

        // 耳朵
        using (GraphicsPath ear = CurvePath(0.5f, 188, 198, 170, 204, 166, 226, 176, 246, 190, 250))
            FillInk(g, ear, Skin, 3.5f);
        using (GraphicsPath ear = CurvePath(0.5f, 332, 198, 350, 204, 354, 226, 344, 246, 330, 250))
            FillInk(g, ear, SkinShade, 3.5f);

        // 臉：略尖的下巴
        using GraphicsPath face = CurvePath(0.45f,
            182, 150, 184, 206, 196, 254, 226, 288, 260, 308, 294, 288, 324, 254, 336, 206, 338, 150, 260, 128);
        FillInk(g, face, Skin, 4.5f);

        // 瀏海落在臉上的影子，與右半邊臉頰的陰影（光從左上來）。
        CelShade(g, face, SkinShade,
            180, 140, 186, 190, 206, 182, 232, 206, 250, 186, 262, 216, 274, 186, 292, 206, 316, 182, 336, 190, 340, 140);
        CelShade(g, face, SkinShade,
            318, 196, 340, 196, 338, 230, 322, 262, 296, 292, 286, 296, 312, 252, 320, 222);

        // 眉毛：往中間壓低，表情有自信。
        using (var brow = new SolidBrush(HairShade))
        {
            g.FillPolygon(brow, Pts(196, 174, 240, 186, 238, 194, 198, 182));
            g.FillPolygon(brow, Pts(324, 174, 280, 186, 282, 194, 322, 182));
        }

        HeroEye(g, 222, 222, -1);
        HeroEye(g, 298, 222, 1);

        // 鼻子
        using (var pen = new Pen(Ink, 2.4f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
            g.DrawLines(pen, Pts(263, 244, 268, 256, 260, 258));

        // 張嘴的笑：深紅口腔、舌頭、一顆小虎牙。
        using (GraphicsPath mouth = new GraphicsPath())
        {
            mouth.AddBezier(238, 270, 252, 276, 270, 276, 284, 266);
            mouth.AddBezier(284, 266, 280, 284, 266, 292, 258, 292);
            mouth.AddBezier(258, 292, 248, 292, 240, 282, 238, 270);
            mouth.CloseFigure();
            FillInk(g, mouth, Color.FromArgb(150, 34, 48), 0);
            CelShade(g, mouth, Color.FromArgb(244, 120, 130), 240, 284, 284, 280, 284, 300, 240, 300);
            using (var tooth = new SolidBrush(Color.White)) g.FillPolygon(tooth, Pts(268, 273, 277, 270, 273, 280));
            using var pen = new Pen(Ink, 3.2f) { LineJoin = LineJoin.Round };
            g.DrawPath(pen, mouth);
        }

        // 臉頰的紅暈斜線
        using (var blush = new Pen(Color.FromArgb(200, 236, 110, 120), 2.2f))
        {
            for (int i = 0; i < 3; i++)
            {
                g.DrawLine(blush, 202 + i * 7, 258, 208 + i * 7, 250);
                g.DrawLine(blush, 304 + i * 7, 258, 310 + i * 7, 250);
            }
        }

        // 前瀏海：分束的尖髮，最後畫才會蓋在額頭上。
        using GraphicsPath bangs = PolyPath(
            170, 118, 176, 150, 182, 196, 204, 164, 228, 198, 246, 162, 262, 210, 276, 162, 294, 198, 316, 164, 338, 196, 346, 150, 352, 118,
            338, 100, 284, 80, 252, 64, 228, 88, 178, 112);
        // 瀏海只描下緣的尖角，上緣和後面的頭髮連在一起，不畫線。
        FillInk(g, bangs, HairBase, 0);
        using (var edge = new Pen(Ink, 4.5f) { LineJoin = LineJoin.Round, StartCap = LineCap.Round, EndCap = LineCap.Round })
            g.DrawLines(edge, Pts(170, 118, 176, 150, 182, 196, 204, 164, 228, 198, 246, 162, 262, 210, 276, 162, 294, 198, 316, 164, 338, 196, 346, 150, 352, 118));
        CelShade(g, bangs, HairShade, 262, 140, 352, 120, 346, 150, 338, 196, 316, 164, 294, 198, 276, 162, 262, 210);
        using (var shine = new SolidBrush(HairShine))
        {
            g.FillPolygon(shine, Pts(238, 82, 258, 66, 254, 92));
            g.FillPolygon(shine, Pts(288, 90, 316, 76, 306, 100));
            g.FillPolygon(shine, Pts(196, 128, 226, 120, 212, 146));
            g.FillPolygon(shine, Pts(236, 122, 260, 116, 250, 140));
        }

        using (var strand = new Pen(HairShade, 2.4f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
        {
            g.DrawLine(strand, 214, 128, 206, 160);
            g.DrawLine(strand, 252, 124, 248, 158);
            g.DrawLine(strand, 286, 126, 290, 160);
        }
    }

    /// <summary>動畫大眼睛：粗上睫毛、琥珀色虹膜、兩顆白色高光。outer 是眼尾的方向（-1 左、+1 右）。</summary>
    private static void HeroEye(Graphics g, float cx, float cy, float outer)
    {
        GraphicsState state = g.Save();
        g.TranslateTransform(cx, cy);
        g.ScaleTransform(outer, 1);
        using GraphicsPath white = CurvePath(0.45f, -22, -10, 0, -18, 18, -16, 24, -6, 20, 12, 4, 22, -16, 16, -23, 2);
        using (var brush = new SolidBrush(Color.White)) g.FillPath(brush, white);
        GraphicsState clip = g.Save();
        g.SetClip(white, CombineMode.Intersect);
        using (var iris = new LinearGradientBrush(new PointF(0, -20), new PointF(0, 26), Color.FromArgb(150, 50, 16), Color.FromArgb(255, 176, 50)))
            g.FillEllipse(iris, -17, -18, 30, 42);
        using (var ring = new Pen(Color.FromArgb(110, 30, 10), 2)) g.DrawEllipse(ring, -17, -18, 30, 42);
        using (var pupil = new SolidBrush(Color.FromArgb(40, 14, 10))) g.FillEllipse(pupil, -8, -6, 12, 20);
        using (var lid = new SolidBrush(Color.FromArgb(70, 40, 20, 60))) g.FillRectangle(lid, -30, -24, 60, 12);
        g.Restore(clip);

        using (var lash = new Pen(Ink, 6.5f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
            g.DrawBezier(lash, -24, -8, -10, -24, 14, -24, 26, -10);
        Poly(g, Ink, 0, 22, -14, 36, -20, 28, -4);
        using (var lower = new Pen(Ink, 2.4f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
            g.DrawBezier(lower, 4, 22, 10, 21, 16, 17, 20, 12);
        using (var crease = new Pen(Ink, 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
            g.DrawBezier(crease, -12, -30, 0, -34, 12, -33, 22, -26);
        g.Restore(state);

        // 高光固定在左上，兩眼方向一致。
        Disc(g, Color.White, 0, cx - 6, cy - 6, 5, 6.5f);
        Disc(g, Color.White, 0, cx + 4, cy + 11, 2.6f);
    }

    private static void HeroArm(Graphics g)
    {
        // 舉起的右手：手肘往外、拳頭握在臉旁邊。
        using (GraphicsPath upper = PolyPath(342, 360, 388, 350, 466, 470, 428, 504))
        {
            FillInk(g, upper, Coat, 4.5f);
            CelShade(g, upper, CoatShade, 388, 350, 466, 470, 450, 488, 380, 380);
        }

        using (GraphicsPath fore = PolyPath(428, 504, 466, 470, 450, 372, 398, 376))
        {
            FillInk(g, fore, Coat, 4.5f);
            CelShade(g, fore, CoatShade, 440, 372, 450, 372, 466, 470, 448, 486);
        }

        using (GraphicsPath cuff = PolyPath(394, 374, 452, 368, 456, 392, 398, 398))
            FillInk(g, cuff, Trim, 3.5f);

        using GraphicsPath fist = CurvePath(0.5f, 388, 368, 380, 334, 390, 300, 418, 288, 448, 296, 458, 326, 452, 362);
        FillInk(g, fist, Skin, 4.5f);
        CelShade(g, fist, SkinShade, 436, 290, 462, 300, 462, 370, 440, 368, 446, 330);
        using var pen = new Pen(Ink, 2.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawBezier(pen, 396, 306, 400, 300, 408, 300, 410, 308);
        g.DrawBezier(pen, 412, 300, 416, 294, 426, 294, 428, 304);
        g.DrawBezier(pen, 430, 300, 434, 294, 444, 296, 446, 306);
        g.DrawBezier(pen, 386, 336, 400, 344, 420, 344, 436, 334);
    }
}
