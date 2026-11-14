// 瀏覽器版的 System.Drawing：只實作遊戲用到的那一小部分 GDI+。
// 每個畫圖呼叫都記成一串數字指令，一格畫面結束時一次交給 gfx.js，在 <canvas> 上照順序畫出來。
// 這樣 Art.cs、GameForm.*.cs 等畫圖程式可以和 Windows 版共用同一份原始碼。

using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.JavaScript;

namespace System.Drawing
{
    /// <summary>指令緩衝區與 JavaScript 介面。</summary>
    internal static partial class Gfx
    {
        // 指令代碼（gfx.js 裡有同樣的表）
        public const int OpTarget = 1, OpReset = 2, OpSave = 3, OpRestore = 4, OpTranslate = 5, OpRotate = 6, OpScale = 7,
            OpResetTransform = 8, OpSmooth = 9, OpComposite = 10, OpFill = 20, OpStroke = 21, OpClip = 22, OpImage = 23,
            OpClear = 25, OpNewCanvas = 30, OpFree = 31;

        private static double[] _ops = new double[1 << 16];
        private static int _n;
        private static int _target = -1;
        private static readonly Dictionary<string, int> Strings = new();
        private static readonly List<string> NewStrings = new();
        private static readonly Dictionary<(int, string), float> Widths = new();
        private static int _nextCanvas = 1;

        public static int NewCanvasId() => _nextCanvas++;

        public static void Put(double v)
        {
            if (_n == _ops.Length) Array.Resize(ref _ops, _ops.Length * 2);
            _ops[_n++] = v;
        }

        public static void Put(double a, double b) { Put(a); Put(b); }
        public static void Put(double a, double b, double c) { Put(a); Put(b); Put(c); }
        public static void Put(double a, double b, double c, double d) { Put(a); Put(b); Put(c); Put(d); }

        public static void Bind(int target)
        {
            if (target == _target) return;
            _target = target;
            Put(OpTarget, target);
        }

        public static int Str(string s)
        {
            if (Strings.TryGetValue(s, out int id)) return id;
            id = Strings.Count;
            Strings[s] = id;
            NewStrings.Add(s);
            return id;
        }

        public static void Color(Color c) => Put(c.R, c.G, c.B, c.A);

        /// <summary>把累積的指令交給瀏覽器畫出來。</summary>
        public static void Flush()
        {
            if (_n == 0 && NewStrings.Count == 0) return;
            string[] strs = NewStrings.ToArray();
            NewStrings.Clear();
            JsFlush(new ArraySegment<double>(_ops, 0, _n), strs);
            _n = 0;
            _target = -1;
        }

        public static float MeasureWidth(Font font, string text) => MeasureCss(font.Css, text);

        public static float MeasureCss(string css, string text)
        {
            int fid = Str(css);
            if (Widths.TryGetValue((fid, text), out float w)) return w;
            w = (float)JsMeasure(css, text);
            if (Widths.Count > 20000) Widths.Clear();
            Widths[(fid, text)] = w;
            return w;
        }

        [JSImport("flush", "gfx")]
        private static partial void JsFlush([JSMarshalAs<JSType.MemoryView>] ArraySegment<double> ops, string[] strings);

        [JSImport("measure", "gfx")]
        private static partial double JsMeasure(string font, string text);

        [JSImport("getPixels", "gfx")]
        [return: JSMarshalAs<JSType.Array<JSType.Number>>]
        internal static partial byte[] JsGetPixels(int id);

        [JSImport("putPixels", "gfx")]
        internal static partial void JsPutPixels(int id, byte[] data);
    }

    public enum GraphicsUnit { World, Display, Pixel, Point, Inch, Document, Millimeter }

    [Flags]
    public enum FontStyle { Regular = 0, Bold = 1, Italic = 2, Underline = 4, Strikeout = 8 }

    public enum StringAlignment { Near = 0, Center = 1, Far = 2 }

    [Flags]
    public enum StringFormatFlags { NoWrap = 0x1000, NoClip = 0x4000, MeasureTrailingSpaces = 0x800, LineLimit = 0x2000 }

    public sealed class StringFormat : IDisposable
    {
        public StringAlignment Alignment { get; set; }
        public StringAlignment LineAlignment { get; set; }
        public StringFormatFlags FormatFlags { get; set; }

        public StringFormat() { }

        public StringFormat(StringFormat other)
        {
            Alignment = other.Alignment;
            LineAlignment = other.LineAlignment;
            FormatFlags = other.FormatFlags;
        }

        public static StringFormat GenericTypographic => new();
        public static StringFormat GenericDefault => new();
        public void Dispose() { }
    }

    public sealed class FontFamily
    {
        public string Name { get; }
        public FontFamily(string name) => Name = name;
        public static FontFamily GenericSansSerif => new("sans-serif");
        public static FontFamily GenericSerif => new("serif");
        public bool IsStyleAvailable(FontStyle style) => true;

        /// <summary>CSS 的 font-family：指定字型找不到時，各平台的中文／日文／襯線字型接著用。</summary>
        public string CssStack
        {
            get
            {
                string n = Name;
                if (n is "Palatino Linotype" or "Georgia" or "Times New Roman" or "serif")
                    return "\"Palatino Linotype\", Palatino, Georgia, \"Times New Roman\", serif";
                if (n.Contains("Gothic") || n.Contains("Meiryo"))
                    return "\"Yu Gothic UI\", \"Yu Gothic\", Meiryo, \"Hiragino Sans\", \"Hiragino Kaku Gothic ProN\", \"Noto Sans JP\", \"Noto Sans CJK JP\", \"Microsoft JhengHei\", sans-serif";
                return "\"Microsoft JhengHei UI\", \"Microsoft JhengHei\", \"PingFang TC\", \"Heiti TC\", \"Noto Sans TC\", \"Noto Sans CJK TC\", \"Source Han Sans TC\", \"Microsoft YaHei\", sans-serif";
            }
        }
    }

    public sealed class Font : IDisposable
    {
        public FontFamily FontFamily { get; }
        public float Size { get; }
        public FontStyle Style { get; }
        public string Name => FontFamily.Name;
        internal string Css { get; }

        public Font(FontFamily family, float emSize, FontStyle style = FontStyle.Regular, GraphicsUnit unit = GraphicsUnit.Point)
        {
            FontFamily = family;
            Size = emSize;
            Style = style;
            Css = Make(family, emSize, style);
        }

        public Font(string name, float emSize, FontStyle style = FontStyle.Regular, GraphicsUnit unit = GraphicsUnit.Point)
            : this(new FontFamily(name), emSize, style, unit) { }

        internal static string Make(FontFamily family, float px, FontStyle style) =>
            $"{((style & FontStyle.Bold) != 0 ? "bold " : "")}{px.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture)}px {family.CssStack}";

        public void Dispose() { }
    }

    public abstract class Brush : IDisposable
    {
        internal abstract void Write();
        public void Dispose() { }
    }

    public sealed class SolidBrush : Brush
    {
        public Color Color { get; set; }
        public SolidBrush(Color color) => Color = color;

        internal override void Write()
        {
            Gfx.Put(0);
            Gfx.Color(Color);
        }
    }

    public static class Brushes
    {
        public static Brush White => new SolidBrush(System.Drawing.Color.White);
        public static Brush Black => new SolidBrush(System.Drawing.Color.Black);
    }

    public sealed class Pen : IDisposable
    {
        public Color Color { get; set; }
        public float Width { get; set; }
        public LineJoin LineJoin { get; set; }
        public LineCap StartCap { get; set; }
        public LineCap EndCap { get; set; }
        public DashStyle DashStyle { get; set; }

        public Pen(Color color, float width = 1)
        {
            Color = color;
            Width = width;
        }

        internal void Write()
        {
            Gfx.Color(Color);
            Gfx.Put(Width, (int)LineJoin);
            bool round = StartCap == LineCap.Round || EndCap == LineCap.Round;
            bool square = StartCap == LineCap.Square || EndCap == LineCap.Square;
            Gfx.Put(round ? 1 : square ? 2 : 0, DashStyle == DashStyle.Dash ? 1 : DashStyle == DashStyle.Dot ? 2 : 0);
        }

        public void Dispose() { }
    }

    public abstract class Image : IDisposable
    {
        internal int Id { get; init; }
        public int Width { get; init; }
        public int Height { get; init; }
        public Size Size => new(Width, Height);
        private bool _disposed;

        public void Dispose()
        {
            if (_disposed || Id <= 0) return;
            _disposed = true;
            Gfx.Put(Gfx.OpFree, Id);
        }
    }

    public sealed class Bitmap : Image
    {
        public Bitmap(int width, int height, PixelFormat format = PixelFormat.Format32bppArgb)
        {
            Id = Gfx.NewCanvasId();
            Width = Math.Max(1, width);
            Height = Math.Max(1, height);
            Gfx.Put(Gfx.OpNewCanvas, Id, Width, Height);
        }

        /// <summary>瀏覽器已經解碼好的圖片（gfx.js 的 loadImages 給的編號）。</summary>
        internal Bitmap(int id, int width, int height)
        {
            Id = id;
            Width = width;
            Height = height;
        }

        public BitmapData LockBits(Rectangle rect, ImageLockMode mode, PixelFormat format)
        {
            Gfx.Flush();
            byte[] rgba = Gfx.JsGetPixels(Id);
            int count = Width * Height;
            IntPtr mem = Marshal.AllocHGlobal(count * 4);
            var bgra = new byte[count * 4];
            for (int i = 0; i < count; i++)
            {
                bgra[i * 4] = rgba[i * 4 + 2];
                bgra[i * 4 + 1] = rgba[i * 4 + 1];
                bgra[i * 4 + 2] = rgba[i * 4];
                bgra[i * 4 + 3] = rgba[i * 4 + 3];
            }

            Marshal.Copy(bgra, 0, mem, bgra.Length);
            return new BitmapData { Scan0 = mem, Stride = Width * 4, Width = Width, Height = Height };
        }

        public void UnlockBits(BitmapData data)
        {
            int count = Width * Height;
            var bgra = new byte[count * 4];
            Marshal.Copy(data.Scan0, bgra, 0, bgra.Length);
            Marshal.FreeHGlobal(data.Scan0);
            var rgba = new byte[count * 4];
            for (int i = 0; i < count; i++)
            {
                rgba[i * 4] = bgra[i * 4 + 2];
                rgba[i * 4 + 1] = bgra[i * 4 + 1];
                rgba[i * 4 + 2] = bgra[i * 4];
                rgba[i * 4 + 3] = bgra[i * 4 + 3];
            }

            Gfx.Flush();
            Gfx.JsPutPixels(Id, rgba);
        }
    }

    public sealed class Graphics : IDisposable
    {
        private readonly int _target;
        private int _depth;
        private SmoothingMode _smoothing = SmoothingMode.AntiAlias;
        private InterpolationMode _interpolation = InterpolationMode.Bilinear;
        private CompositingMode _compositing = CompositingMode.SourceOver;

        private Graphics(int target)
        {
            _target = target;
            Gfx.Bind(target);
            Gfx.Put(Gfx.OpReset);
        }

        /// <summary>畫在網頁上的主畫布（編號 0）。</summary>
        internal static Graphics ForScreen() => new(0);

        public static Graphics FromImage(Image image) => new(image.Id);

        public SmoothingMode SmoothingMode { get => _smoothing; set => _smoothing = value; }
        public PixelOffsetMode PixelOffsetMode { get; set; }
        public System.Drawing.Text.TextRenderingHint TextRenderingHint { get; set; }
        public CompositingQuality CompositingQuality { get; set; }

        public InterpolationMode InterpolationMode
        {
            get => _interpolation;
            set
            {
                _interpolation = value;
                Op(Gfx.OpSmooth);
                Gfx.Put(value == InterpolationMode.NearestNeighbor ? 0 : 1);
            }
        }

        public CompositingMode CompositingMode
        {
            get => _compositing;
            set
            {
                _compositing = value;
                Op(Gfx.OpComposite);
                Gfx.Put(value == CompositingMode.SourceCopy ? 1 : 0);
            }
        }

        private void Op(int code)
        {
            Gfx.Bind(_target);
            Gfx.Put(code);
        }

        public GraphicsState Save()
        {
            Op(Gfx.OpSave);
            _depth++;
            return new GraphicsState(_depth);
        }

        public void Restore(GraphicsState state)
        {
            while (_depth >= state.Depth && _depth > 0)
            {
                Op(Gfx.OpRestore);
                _depth--;
            }
        }

        public void TranslateTransform(float dx, float dy)
        {
            Op(Gfx.OpTranslate);
            Gfx.Put(dx, dy);
        }

        public void RotateTransform(float degrees)
        {
            Op(Gfx.OpRotate);
            Gfx.Put(degrees);
        }

        public void ScaleTransform(float sx, float sy)
        {
            Op(Gfx.OpScale);
            Gfx.Put(sx, sy);
        }

        public void ResetTransform() => Op(Gfx.OpResetTransform);

        public void Clear(Color color)
        {
            Op(Gfx.OpClear);
            Gfx.Color(color);
        }

        public void SetClip(GraphicsPath path, CombineMode mode = CombineMode.Intersect)
        {
            Op(Gfx.OpClip);
            path.Write();
        }

        public void SetClip(RectangleF r, CombineMode mode = CombineMode.Intersect)
        {
            using var path = new GraphicsPath();
            path.AddRectangle(r);
            SetClip(path, mode);
        }

        public void SetClip(Rectangle r, CombineMode mode = CombineMode.Intersect) => SetClip((RectangleF)r, mode);

        // ── 填色 ──
        public void FillPath(Brush brush, GraphicsPath path)
        {
            Op(Gfx.OpFill);
            brush.Write();
            path.Write();
        }

        private void FillShape(Brush brush, Action<GraphicsPath> build)
        {
            using var path = new GraphicsPath();
            build(path);
            FillPath(brush, path);
        }

        public void FillRectangle(Brush brush, RectangleF r) => FillShape(brush, p => p.AddRectangle(r));
        public void FillRectangle(Brush brush, Rectangle r) => FillRectangle(brush, (RectangleF)r);
        public void FillRectangle(Brush brush, float x, float y, float w, float h) => FillRectangle(brush, new RectangleF(x, y, w, h));
        public void FillEllipse(Brush brush, float x, float y, float w, float h) => FillShape(brush, p => p.AddEllipse(x, y, w, h));
        public void FillEllipse(Brush brush, RectangleF r) => FillEllipse(brush, r.X, r.Y, r.Width, r.Height);
        public void FillPolygon(Brush brush, PointF[] pts) => FillShape(brush, p => p.AddPolygon(pts));
        public void FillPie(Brush brush, float x, float y, float w, float h, float start, float sweep) => FillShape(brush, p => p.AddPie(x, y, w, h, start, sweep));

        // ── 描邊 ──
        public void DrawPath(Pen pen, GraphicsPath path)
        {
            Op(Gfx.OpStroke);
            pen.Write();
            path.Write();
        }

        private void DrawShape(Pen pen, Action<GraphicsPath> build)
        {
            using var path = new GraphicsPath();
            build(path);
            DrawPath(pen, path);
        }

        public void DrawLine(Pen pen, float x1, float y1, float x2, float y2) => DrawShape(pen, p => p.AddLine(x1, y1, x2, y2));
        public void DrawLine(Pen pen, PointF a, PointF b) => DrawLine(pen, a.X, a.Y, b.X, b.Y);
        public void DrawLines(Pen pen, PointF[] pts) => DrawShape(pen, p => p.AddLines(pts));
        public void DrawPolygon(Pen pen, PointF[] pts) => DrawShape(pen, p => p.AddPolygon(pts));
        public void DrawEllipse(Pen pen, float x, float y, float w, float h) => DrawShape(pen, p => p.AddEllipse(x, y, w, h));
        public void DrawEllipse(Pen pen, RectangleF r) => DrawEllipse(pen, r.X, r.Y, r.Width, r.Height);
        public void DrawRectangle(Pen pen, float x, float y, float w, float h) => DrawShape(pen, p => p.AddRectangle(new RectangleF(x, y, w, h)));
        public void DrawRectangle(Pen pen, RectangleF r) => DrawRectangle(pen, r.X, r.Y, r.Width, r.Height);
        public void DrawRectangle(Pen pen, Rectangle r) => DrawRectangle(pen, r.X, r.Y, r.Width, r.Height);
        public void DrawArc(Pen pen, float x, float y, float w, float h, float start, float sweep) => DrawShape(pen, p => p.AddArc(x, y, w, h, start, sweep));
        public void DrawArc(Pen pen, RectangleF r, float start, float sweep) => DrawArc(pen, r.X, r.Y, r.Width, r.Height, start, sweep);

        public void DrawBezier(Pen pen, float x1, float y1, float x2, float y2, float x3, float y3, float x4, float y4) =>
            DrawShape(pen, p => p.AddBezier(x1, y1, x2, y2, x3, y3, x4, y4));

        public void DrawBezier(Pen pen, PointF a, PointF b, PointF c, PointF d) => DrawBezier(pen, a.X, a.Y, b.X, b.Y, c.X, c.Y, d.X, d.Y);

        // ── 文字 ──
        public void DrawString(string s, Font font, Brush brush, float x, float y, StringFormat? format = null)
        {
            using var path = new GraphicsPath();
            path.AddText(s, font.Css, font.Size, x, y, format);
            FillPath(brush, path);
        }

        public void DrawString(string s, Font font, Brush brush, PointF p, StringFormat? format = null) => DrawString(s, font, brush, p.X, p.Y, format);

        public SizeF MeasureString(string s, Font font, int width = 0, StringFormat? format = null) =>
            new(Gfx.MeasureWidth(font, s), font.Size * 1.3f);

        public SizeF MeasureString(string s, Font font) => MeasureString(s, font, 0, null);

        // ── 貼圖 ──
        private void Image(Image image, float dx, float dy, float dw, float dh, float sx, float sy, float sw, float sh, ImageAttributes? attrs)
        {
            Op(Gfx.OpImage);
            ColorMatrix m = attrs?.Matrix ?? ColorMatrix.Identity;
            Gfx.Put(image.Id, dx, dy, dw);
            Gfx.Put(dh, sx, sy, sw);
            Gfx.Put(sh, m.Matrix33, m.Matrix00, m.Matrix11);
            Gfx.Put(m.Matrix22);
        }

        public void DrawImage(Image image, RectangleF dest) => Image(image, dest.X, dest.Y, dest.Width, dest.Height, 0, 0, image.Width, image.Height, null);
        public void DrawImage(Image image, Rectangle dest) => DrawImage(image, (RectangleF)dest);
        public void DrawImage(Image image, float x, float y, float w, float h) => DrawImage(image, new RectangleF(x, y, w, h));
        public void DrawImage(Image image, float x, float y) => DrawImage(image, new RectangleF(x, y, image.Width, image.Height));

        public void DrawImage(Image image, PointF[] dest, RectangleF src, GraphicsUnit unit, ImageAttributes? attrs = null) =>
            Image(image, dest[0].X, dest[0].Y, dest[1].X - dest[0].X, dest[2].Y - dest[0].Y, src.X, src.Y, src.Width, src.Height, attrs);

        public void DrawImage(Image image, Rectangle dest, float sx, float sy, float sw, float sh, GraphicsUnit unit, ImageAttributes? attrs = null) =>
            Image(image, dest.X, dest.Y, dest.Width, dest.Height, sx, sy, sw, sh, attrs);

        public void DrawImage(Image image, Rectangle dest, int sx, int sy, int sw, int sh, GraphicsUnit unit, ImageAttributes? attrs = null) =>
            Image(image, dest.X, dest.Y, dest.Width, dest.Height, sx, sy, sw, sh, attrs);

        public void Dispose()
        {
            if (_target != 0)
            {
                Gfx.Bind(_target);
                Gfx.Put(Gfx.OpReset);
            }
        }
    }
}

namespace System.Drawing.Text
{
    public enum TextRenderingHint { SystemDefault, SingleBitPerPixelGridFit, SingleBitPerPixel, AntiAliasGridFit, AntiAlias, ClearTypeGridFit }
}

namespace System.Drawing.Drawing2D
{
    public enum SmoothingMode { Invalid = -1, Default, HighSpeed, HighQuality, None, AntiAlias }
    public enum InterpolationMode { Invalid = -1, Default, Low, High, Bilinear, Bicubic, NearestNeighbor, HighQualityBilinear, HighQualityBicubic }
    public enum PixelOffsetMode { Invalid = -1, Default, HighSpeed, HighQuality, None, Half }
    public enum CompositingMode { SourceOver, SourceCopy }
    public enum CompositingQuality { Invalid = -1, Default, HighSpeed, HighQuality, GammaCorrected, AssumeLinear }
    public enum LineJoin { Miter = 0, Bevel = 1, Round = 2, MiterClipped = 3 }
    public enum LineCap { Flat = 0, Square = 1, Round = 2, Triangle = 3 }
    public enum DashStyle { Solid, Dash, Dot, DashDot, DashDotDot, Custom }
    public enum CombineMode { Replace, Intersect, Union, Xor, Exclude, Complement }
    public enum FillMode { Alternate, Winding }

    public sealed class GraphicsState
    {
        internal int Depth { get; }
        internal GraphicsState(int depth) => Depth = depth;
    }

    public sealed class ColorBlend
    {
        public Color[] Colors { get; set; } = Array.Empty<Color>();
        public float[] Positions { get; set; } = Array.Empty<float>();
    }

    public sealed class LinearGradientBrush : Brush
    {
        private readonly PointF _a, _b;
        private readonly Color _c1, _c2;
        public ColorBlend? InterpolationColors { get; set; }

        public LinearGradientBrush(PointF a, PointF b, Color c1, Color c2)
        {
            _a = a;
            _b = b;
            _c1 = c1;
            _c2 = c2;
        }

        internal override void Write()
        {
            Gfx.Put(1);
            Gfx.Put(_a.X, _a.Y, _b.X, _b.Y);
            if (InterpolationColors is { Colors.Length: > 1 } blend)
            {
                Gfx.Put(blend.Colors.Length);
                for (int i = 0; i < blend.Colors.Length; i++)
                {
                    Gfx.Put(blend.Positions[i]);
                    Gfx.Color(blend.Colors[i]);
                }
            }
            else
            {
                Gfx.Put(2);
                Gfx.Put(0);
                Gfx.Color(_c1);
                Gfx.Put(1);
                Gfx.Color(_c2);
            }
        }
    }

    /// <summary>放射漸層：以路徑外框（橢圓）為邊界，中心色在 CenterPoint。</summary>
    public sealed class PathGradientBrush : Brush
    {
        private readonly RectangleF _bounds;
        public Color CenterColor { get; set; } = Color.White;
        public Color[] SurroundColors { get; set; } = { Color.White };
        public PointF CenterPoint { get; set; }
        public PointF FocusScales { get; set; }

        /// <summary>GDI+ 的位置 0 是外框、1 是中心；畫布的放射漸層相反，寫出時翻過來。</summary>
        public ColorBlend? InterpolationColors { get; set; }

        public PathGradientBrush(GraphicsPath path)
        {
            _bounds = path.GetBounds();
            CenterPoint = new PointF(_bounds.X + _bounds.Width / 2, _bounds.Y + _bounds.Height / 2);
        }

        internal override void Write()
        {
            Gfx.Put(2);
            Gfx.Put(_bounds.X + _bounds.Width / 2, _bounds.Y + _bounds.Height / 2, Math.Max(0.01f, _bounds.Width / 2), Math.Max(0.01f, _bounds.Height / 2));
            Gfx.Put(CenterPoint.X, CenterPoint.Y);
            float focus = Math.Clamp(Math.Max(FocusScales.X, FocusScales.Y), 0, 0.99f);
            if (InterpolationColors is { Colors.Length: > 1 } blend)
            {
                int count = blend.Colors.Length;
                Gfx.Put(count);
                for (int k = count - 1; k >= 0; k--)
                {
                    Gfx.Put(focus + (1 - blend.Positions[k]) * (1 - focus));
                    Gfx.Color(blend.Colors[k]);
                }

                return;
            }

            Color surround = SurroundColors.Length > 0 ? SurroundColors[0] : Color.Transparent;
            if (focus > 0)
            {
                Gfx.Put(3);
                Gfx.Put(0);
                Gfx.Color(CenterColor);
                Gfx.Put(focus);
                Gfx.Color(CenterColor);
            }
            else
            {
                Gfx.Put(2);
                Gfx.Put(0);
                Gfx.Color(CenterColor);
            }

            Gfx.Put(1);
            Gfx.Color(surround);
        }
    }

    /// <summary>記錄路徑的每一段，畫的時候在 gfx.js 裡變成 Path2D。</summary>
    public sealed class GraphicsPath : IDisposable
    {
        // 路徑指令：0 移動、1 直線、2 貝茲、3 封閉、4 橢圓、5 弧、6 矩形、7 文字
        private readonly List<double> _d = new();
        private int _count;
        private bool _open;
        private float _minX = float.MaxValue, _minY = float.MaxValue, _maxX = float.MinValue, _maxY = float.MinValue;

        public FillMode FillMode { get; set; }

        private void Grow(float x, float y)
        {
            _minX = Math.Min(_minX, x);
            _minY = Math.Min(_minY, y);
            _maxX = Math.Max(_maxX, x);
            _maxY = Math.Max(_maxY, y);
        }

        private void Cmd(int code, params float[] args)
        {
            _count++;
            _d.Add(code);
            foreach (float a in args) _d.Add(a);
        }

        private void To(float x, float y)
        {
            Cmd(_open ? 1 : 0, x, y);
            _open = true;
            Grow(x, y);
        }

        public void AddLine(float x1, float y1, float x2, float y2)
        {
            To(x1, y1);
            To(x2, y2);
        }

        public void AddLine(PointF a, PointF b) => AddLine(a.X, a.Y, b.X, b.Y);

        public void AddLines(PointF[] pts)
        {
            foreach (PointF p in pts) To(p.X, p.Y);
        }

        public void AddBezier(float x1, float y1, float x2, float y2, float x3, float y3, float x4, float y4)
        {
            To(x1, y1);
            Cmd(2, x2, y2, x3, y3, x4, y4);
            Grow(x2, y2);
            Grow(x3, y3);
            Grow(x4, y4);
        }

        public void AddBezier(PointF a, PointF b, PointF c, PointF d) => AddBezier(a.X, a.Y, b.X, b.Y, c.X, c.Y, d.X, d.Y);

        public void AddArc(float x, float y, float w, float h, float start, float sweep)
        {
            float cx = x + w / 2, cy = y + h / 2;
            double a = start * Math.PI / 180;
            float sx = cx + (float)Math.Cos(a) * w / 2, sy = cy + (float)Math.Sin(a) * h / 2;
            if (!_open)
            {
                Cmd(0, sx, sy);
                _open = true;
            }

            Cmd(5, x, y, w, h, start, sweep);
            Grow(x, y);
            Grow(x + w, y + h);
        }

        public void AddArc(RectangleF r, float start, float sweep) => AddArc(r.X, r.Y, r.Width, r.Height, start, sweep);

        public void AddPie(float x, float y, float w, float h, float start, float sweep)
        {
            CloseFigure();
            Cmd(0, x + w / 2, y + h / 2);
            _open = true;
            AddArc(x, y, w, h, start, sweep);
            CloseFigure();
        }

        public void AddEllipse(float x, float y, float w, float h)
        {
            _open = false;
            Cmd(4, x, y, w, h);
            Grow(x, y);
            Grow(x + w, y + h);
        }

        public void AddEllipse(RectangleF r) => AddEllipse(r.X, r.Y, r.Width, r.Height);

        public void AddRectangle(RectangleF r)
        {
            _open = false;
            Cmd(6, r.X, r.Y, r.Width, r.Height);
            Grow(r.X, r.Y);
            Grow(r.Right, r.Bottom);
        }

        public void AddRectangle(Rectangle r) => AddRectangle((RectangleF)r);

        public void AddPolygon(PointF[] pts)
        {
            if (pts.Length == 0) return;
            _open = false;
            foreach (PointF p in pts) To(p.X, p.Y);
            CloseFigure();
        }

        /// <summary>封閉的基數樣條（GDI+ 預設張力 0.5），換算成貝茲曲線。</summary>
        public void AddClosedCurve(PointF[] pts, float tension = 0.5f)
        {
            int n = pts.Length;
            if (n < 3)
            {
                AddPolygon(pts);
                return;
            }

            _open = false;
            To(pts[0].X, pts[0].Y);
            float k = tension / 3;
            for (int i = 0; i < n; i++)
            {
                PointF p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
                float c1x = p1.X + (p2.X - p0.X) * k, c1y = p1.Y + (p2.Y - p0.Y) * k;
                float c2x = p2.X - (p3.X - p1.X) * k, c2y = p2.Y - (p3.Y - p1.Y) * k;
                Cmd(2, c1x, c1y, c2x, c2y, p2.X, p2.Y);
                Grow(c1x, c1y);
                Grow(c2x, c2y);
                Grow(p2.X, p2.Y);
            }

            CloseFigure();
        }

        public void AddString(string s, FontFamily family, int style, float emSize, PointF origin, StringFormat? format) =>
            AddText(s, Font.Make(family, emSize, (FontStyle)style), emSize, origin.X, origin.Y, format);

        internal void AddText(string s, string css, float px, float x, float y, StringFormat? format)
        {
            int align = (int)(format?.Alignment ?? StringAlignment.Near);
            int valign = (int)(format?.LineAlignment ?? StringAlignment.Near);
            _open = false;
            Cmd(7, Gfx.Str(s), Gfx.Str(css), align, valign, x, y);
            float w = Gfx.MeasureCss(css, s);
            float left = align == 0 ? x : align == 1 ? x - w / 2 : x - w;
            float top = valign == 0 ? y : valign == 1 ? y - px * 0.5f : y - px;
            Grow(left, top);
            Grow(left + w, top + px);
        }

        public void CloseFigure()
        {
            if (!_open) return;
            Cmd(3);
            _open = false;
        }

        public void StartFigure() => _open = false;

        public RectangleF GetBounds() =>
            _minX > _maxX ? RectangleF.Empty : new RectangleF(_minX, _minY, _maxX - _minX, _maxY - _minY);

        internal void Write()
        {
            Gfx.Put(_count);
            foreach (double v in _d) Gfx.Put(v);
        }

        public void Dispose() { }
    }
}

namespace System.Drawing.Imaging
{
    public enum PixelFormat { Format24bppRgb = 137224, Format32bppRgb = 139273, Format32bppArgb = 2498570, Format32bppPArgb = 925707 }
    public enum ImageLockMode { ReadOnly = 1, WriteOnly = 2, ReadWrite = 3 }

    public sealed class BitmapData
    {
        public IntPtr Scan0 { get; set; }
        public int Stride { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
    }

    public sealed class ColorMatrix
    {
        public float Matrix00 { get; set; } = 1;
        public float Matrix11 { get; set; } = 1;
        public float Matrix22 { get; set; } = 1;
        public float Matrix33 { get; set; } = 1;
        public float Matrix44 { get; set; } = 1;
        internal static readonly ColorMatrix Identity = new();
    }

    public sealed class ImageAttributes : IDisposable
    {
        internal ColorMatrix Matrix { get; private set; } = ColorMatrix.Identity;
        public void SetColorMatrix(ColorMatrix matrix) => Matrix = matrix;
        public void Dispose() { }
    }
}
