namespace CandyLegend;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // 不開視窗的自我檢查：HW05-1142922.exe --selftest 報告檔路徑 [每關場數]
        if (args.Length >= 2 && args[0] == "--selftest")
            return Core.SelfTest.Run(args[1], args.Length >= 3 && int.TryParse(args[2], out int games) ? games : 300);

        // SystemAware：畫面依主螢幕的縮放比例畫得清楚；拖到另一台縮放比例不同的螢幕（例如投影機）時由 Windows 幫忙縮放，版面不會跑掉。
        // 開發檢查用：把包在 exe 裡的音樂解碼成 16-bit 立體聲原始資料，和 ffmpeg 的結果比對。
        if (args.Length >= 3 && args[0] == "--decode")
        {
            Audio.Song? song = Audio.Sound.LoadEmbedded(args[1]);
            if (song == null) return 2;
            var bytes = new byte[song.Pcm.Length * 2];
            Buffer.BlockCopy(song.Pcm, 0, bytes, 0, bytes.Length);
            File.WriteAllBytes(args[2], bytes);
            return 0;
        }

        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // 不開視窗，把各個畫面畫成 PNG：HW05-1142922.exe --shots 資料夾
        if (args.Length >= 2 && args[0] == "--shots")
        {
            UI.GameForm.Shots(args[1], args.Length >= 3 ? args[2] : null);
            return 0;
        }

#if !RELEASE_EXE
        // 不開視窗，照劇本錄製展示影片：HW05-1142922.exe --video 資料夾 ffmpeg.exe
        if (args.Length >= 3 && args[0] == "--video")
        {
            UI.GameForm.Video(args[1], args[2]);
            return 0;
        }
#endif

        Application.Run(new UI.GameForm());
        return 0;
    }
}
