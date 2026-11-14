using System.Runtime.InteropServices.JavaScript;
using CandyLegend.UI;

namespace CandyLegend.Web;

/// <summary>網頁和 C# 之間的出入口：main.js 呼叫這裡的方法開始遊戲、送每一格與滑鼠鍵盤事件。</summary>
public static partial class Bridge
{
    private static GameForm? _game;

    public static void Main() { }

    [JSExport]
    public static void Start(double scale)
    {
        _game = new GameForm((float)scale);
        Gfx.Flush();
    }

    [JSExport]
    public static void Frame(double dt) => _game?.Frame((float)dt);

    [JSExport]
    public static void MouseMove(double x, double y, bool left) => _game?.MouseMove((float)x, (float)y, left);

    [JSExport]
    public static void MouseDown(double x, double y) => _game?.MouseDown((float)x, (float)y);

    [JSExport]
    public static void MouseUp() => _game?.MouseUp();

    [JSExport]
    public static void KeyDown(int keyCode) => _game?.KeyDown(keyCode);
}

/// <summary>main.js 開始前先解碼好的圖片（魔王、光耀截圖、徽章）。</summary>
internal static partial class WebImages
{
    private static readonly Dictionary<string, Bitmap> Cache = new();

    public static Bitmap Get(string resource)
    {
        if (Cache.TryGetValue(resource, out Bitmap? bmp)) return bmp;
        double[] info = JsImageInfo(resource);
        bmp = new Bitmap((int)info[0], (int)info[1], (int)info[2]);
        Cache[resource] = bmp;
        return bmp;
    }

    [JSImport("imageInfo", "gfx")]
    [return: JSMarshalAs<JSType.Array<JSType.Number>>]
    private static partial double[] JsImageInfo(string name);
}
