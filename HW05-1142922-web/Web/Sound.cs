using System.Runtime.InteropServices;
using System.Runtime.InteropServices.JavaScript;

namespace CandyLegend.Audio;

/// <summary>
/// 網頁版的聲音：和 Windows 版的 Sound 同樣的呼叫方式，實際播放交給瀏覽器的 Web Audio（audio.js）。
/// 音效仍由 Synth 即時合成，開始時一次交給瀏覽器；音樂是 music\ 底下的 mp3，第一次用到才下載。
/// </summary>
internal static partial class Sound
{
    public const float MusicRms = 0.05f;
    public const int Title = 6, Map = 2, BossPhase2 = 7, BossPhase1b = 8;

    /// <summary>曲目編號對應的檔名（和 Windows 版一樣；0、1 是合成音樂，網頁版不用）。</summary>
    private static readonly string?[] Files = { null, null, "map", "stage1", "stage2", "stage3", "stage4", "stage5", "stage6" };

    private static bool _musicOn = true;
    private static bool _ready;

    public static int StageTrack(int level) => level <= 3 ? 3 : level <= 6 ? 4 : level <= 9 ? 6 : 5;

    public static bool MusicOn
    {
        get => _musicOn;
        set
        {
            _musicOn = value;
            JsMusicOn(value);
        }
    }

    public static void Init()
    {
        if (_ready) return;
        _ready = true;
        float[][] fx = Synth.BuildEffects();
        for (int i = 0; i < fx.Length; i++)
            JsAddEffect(i, MemoryMarshal.AsBytes(fx[i].AsSpan()).ToArray());
    }

    public static void Shutdown() { }

    public static void Play(Snd sound, float gain = 1, float pan = 0, double rate = 1)
    {
        if (_ready) JsPlay((int)sound, gain, pan, rate);
    }

    public static void MusicSpeed(double rate) => JsMusicSpeed(rate);

    public static void Music(int track, int alt = -1)
    {
        string a = track >= 0 && track < Files.Length ? Files[track] ?? "" : "";
        string b = alt >= 0 && alt < Files.Length ? Files[alt] ?? "" : "";
        JsMusic(a, b);
    }

    [JSImport("addEffect", "sound")]
    private static partial void JsAddEffect(int id, byte[] samples);

    [JSImport("play", "sound")]
    private static partial void JsPlay(int id, double gain, double pan, double rate);

    [JSImport("music", "sound")]
    private static partial void JsMusic(string track, string alt);

    [JSImport("musicSpeed", "sound")]
    private static partial void JsMusicSpeed(double rate);

    [JSImport("musicOn", "sound")]
    private static partial void JsMusicOn(bool on);
}
