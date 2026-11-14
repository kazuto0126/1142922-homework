namespace CandyLegend.Audio;

public enum Snd
{
    Match, Land, ShardLand, ShardCollect, Swap, Bad, Slash, Boom, Core, Bolt, Special, Jelly, Crack, Rock,
    Charge, Skill, BossHit, BossAttack, Freeze, BossDie, Win, Lose, Hint, Click, Shuffle, Star, Count,
}

/// <summary>
/// 所有音效與暫用的背景音樂都是程式算出來的波形，不需要任何音檔。
/// 兩個基本零件：<see cref="Tone"/>（會滑音的單音）和 <see cref="Hiss"/>（濾過的噪音），每個音效都是它們疊出來的。
/// </summary>
internal static class Synth
{
    public const int SR = 44100;
    private static uint _seed = 0x2F6E2B1;

    private static float Noise()
    {
        _seed ^= _seed << 13;
        _seed ^= _seed >> 17;
        _seed ^= _seed << 5;
        return (_seed & 0xFFFFFF) / 8388608f - 1f;
    }

    private static double Wave(int kind, double phase)
    {
        double x = phase - Math.Floor(phase);
        return kind switch
        {
            0 => Math.Sin(2 * Math.PI * x),
            1 => x < 0.5 ? 1 : -1,
            2 => 2 * x - 1,
            3 => 4 * Math.Abs(x - 0.5) - 1,
            _ => x < 0.25 ? 1 : -0.33,
        };
    }

    /// <summary>從 f0 滑到 f1 的單音，音量指數衰減。wrap 為 true 時超出緩衝區的尾巴會繞回開頭（給循環音樂用）。</summary>
    private static void Tone(float[] b, double start, double dur, double f0, double f1, double amp,
        int wave = 0, double decay = 6, double attack = 0.003, double vibrato = 0, bool wrap = false)
    {
        int s0 = (int)(start * SR), n = (int)(dur * SR);
        double phase = 0, ratio = f1 / f0;
        for (int i = 0; i < n; i++)
        {
            int at = s0 + i;
            if (at >= b.Length)
            {
                if (!wrap) break;
                at %= b.Length;
            }

            double t = (double)i / SR;
            double f = ratio == 1 ? f0 : f0 * Math.Pow(ratio, (double)i / n);
            if (vibrato > 0) f *= 1 + 0.006 * vibrato * Math.Sin(2 * Math.PI * 5.5 * t);
            phase += f / SR;
            double env = Math.Min(1, t / attack) * Math.Exp(-decay * t) * Math.Min(1, (n - i) / (0.006 * SR));
            b[at] += (float)(Wave(wave, phase) * amp * env);
        }
    }

    /// <summary>低通（或高通）濾過的噪音，截止頻率從 cut0 滑到 cut1。</summary>
    private static void Hiss(float[] b, double start, double dur, double amp, double cut0, double cut1,
        double decay, bool high = false, bool wrap = false)
    {
        int s0 = (int)(start * SR), n = (int)(dur * SR);
        double low = 0;
        for (int i = 0; i < n; i++)
        {
            int at = s0 + i;
            if (at >= b.Length)
            {
                if (!wrap) break;
                at %= b.Length;
            }

            double t = (double)i / SR;
            double cut = cut0 * Math.Pow(cut1 / cut0, (double)i / n);
            double a = 1 - Math.Exp(-2 * Math.PI * cut / SR);
            double x = Noise();
            low += a * (x - low);
            double env = Math.Min(1, t / 0.002) * Math.Exp(-decay * t) * Math.Min(1, (n - i) / (0.006 * SR));
            b[at] += (float)((high ? x - low : low) * amp * env);
        }
    }

    private static float[] Buffer(double seconds) => new float[(int)(seconds * SR)];

    private static float[] Normalize(float[] b, float peak)
    {
        float max = 0.0001f;
        foreach (float v in b) max = Math.Max(max, Math.Abs(v));
        float k = peak / max;
        for (int i = 0; i < b.Length; i++) b[i] *= k;
        return b;
    }

    public static float Rms(float[] b)
    {
        double sum = 0;
        foreach (float v in b) sum += v * v;
        return (float)Math.Sqrt(sum / Math.Max(1, b.Length));
    }

    public static float[][] BuildEffects()
    {
        var fx = new float[(int)Snd.Count][];
        float[] b;

        // 清除：清脆的「叮」，連鎖時整個往上移調
        b = Buffer(0.3);
        Tone(b, 0, 0.28, 880, 880, 0.55, 0, 13);
        Tone(b, 0, 0.26, 1320, 1320, 0.28, 0, 16);
        Tone(b, 0, 0.14, 2640, 2640, 0.12, 0, 26);
        Tone(b, 0, 0.05, 520, 300, 0.4, 0, 40);
        Hiss(b, 0, 0.03, 0.35, 7000, 5000, 70, true);
        fx[(int)Snd.Match] = Normalize(b, 0.85f);

        // 糖晶落地
        b = Buffer(0.12);
        Tone(b, 0, 0.1, 230, 105, 0.7, 0, 28);
        Hiss(b, 0, 0.025, 0.3, 1800, 700, 80);
        fx[(int)Snd.Land] = Normalize(b, 0.7f);

        // 掉落物落地：金屬「鏘」加一聲悶響
        b = Buffer(0.4);
        Tone(b, 0, 0.38, 1568, 1568, 0.4, 0, 9);
        Tone(b, 0, 0.34, 2349, 2349, 0.22, 0, 11);
        Tone(b, 0, 0.3, 3136, 3136, 0.1, 0, 14);
        Tone(b, 0, 0.1, 300, 140, 0.5, 0, 30);
        fx[(int)Snd.ShardLand] = Normalize(b, 0.85f);

        // 收集掉落物：往上的琶音加亮粉
        b = Buffer(0.9);
        double[] arp = { 1046.5, 1318.5, 1568, 2093, 2637 };
        for (int i = 0; i < arp.Length; i++)
        {
            Tone(b, i * 0.07, 0.5, arp[i], arp[i], 0.36, 3, 7);
            Tone(b, i * 0.07, 0.4, arp[i] * 2, arp[i] * 2, 0.12, 0, 9);
        }

        Hiss(b, 0.1, 0.6, 0.12, 9000, 12000, 5, true);
        fx[(int)Snd.ShardCollect] = Normalize(b, 0.9f);

        b = Buffer(0.14);
        Hiss(b, 0, 0.13, 0.5, 700, 3600, 14);
        fx[(int)Snd.Swap] = Normalize(b, 0.5f);

        b = Buffer(0.24);
        Tone(b, 0, 0.09, 196, 176, 0.5, 1, 14);
        Tone(b, 0.11, 0.11, 147, 128, 0.5, 1, 14);
        fx[(int)Snd.Bad] = Normalize(b, 0.5f);

        // 斬擊
        b = Buffer(0.4);
        Hiss(b, 0, 0.36, 0.7, 9000, 900, 9);
        Hiss(b, 0, 0.1, 0.5, 5000, 9000, 26, true);
        Tone(b, 0, 0.2, 2200, 420, 0.22, 2, 15);
        fx[(int)Snd.Slash] = Normalize(b, 0.9f);

        // 爆炸
        b = Buffer(0.7);
        Tone(b, 0, 0.6, 150, 36, 1.0, 0, 6);
        Hiss(b, 0, 0.55, 0.7, 3600, 260, 7);
        Hiss(b, 0, 0.05, 0.6, 8000, 3000, 50, true);
        fx[(int)Snd.Boom] = Normalize(b, 0.95f);

        // 屬性核心
        b = Buffer(1.0);
        Tone(b, 0, 0.5, 400, 1700, 0.3, 3, 2.5);
        Tone(b, 0, 0.5, 600, 2550, 0.2, 0, 2.5);
        Tone(b, 0.38, 0.5, 130, 44, 0.8, 0, 7);
        Hiss(b, 0.38, 0.55, 0.5, 6000, 500, 6);
        Hiss(b, 0.4, 0.5, 0.15, 9000, 12000, 5, true);
        fx[(int)Snd.Core] = Normalize(b, 0.95f);

        // 落雷
        b = Buffer(0.45);
        for (int i = 0; i < 5; i++) Hiss(b, i * 0.045, 0.07, 0.6, 9000, 3500, 30, true);
        Hiss(b, 0, 0.4, 0.5, 4000, 400, 8);
        Tone(b, 0, 0.25, 130, 52, 0.6, 2, 11);
        fx[(int)Snd.Bolt] = Normalize(b, 0.9f);

        b = Buffer(0.4);
        Tone(b, 0, 0.14, 660, 990, 0.4, 4, 8);
        Tone(b, 0.1, 0.28, 990, 1485, 0.4, 4, 7);
        Tone(b, 0.1, 0.28, 1980, 2970, 0.12, 0, 9);
        fx[(int)Snd.Special] = Normalize(b, 0.75f);

        // 果凍：啵
        b = Buffer(0.2);
        Tone(b, 0, 0.15, 250, 640, 0.6, 0, 12);
        Tone(b, 0.02, 0.1, 500, 940, 0.22, 0, 15);
        fx[(int)Snd.Jelly] = Normalize(b, 0.75f);

        // 冰裂
        b = Buffer(0.25);
        Hiss(b, 0, 0.09, 0.6, 9000, 5000, 38, true);
        Tone(b, 0, 0.16, 2600, 2200, 0.3, 0, 24);
        Tone(b, 0.03, 0.14, 3400, 3000, 0.22, 0, 28);
        Tone(b, 0.06, 0.12, 4200, 3900, 0.14, 0, 30);
        fx[(int)Snd.Crack] = Normalize(b, 0.75f);

        // 岩石碎裂
        b = Buffer(0.3);
        Hiss(b, 0, 0.26, 0.8, 1500, 260, 13);
        Tone(b, 0, 0.14, 112, 56, 0.6, 0, 20);
        fx[(int)Snd.Rock] = Normalize(b, 0.85f);

        // 神器充滿
        b = Buffer(0.8);
        Tone(b, 0, 0.5, 1318.5, 1318.5, 0.34, 0, 6);
        Tone(b, 0.1, 0.6, 1975.5, 1975.5, 0.34, 0, 5);
        Tone(b, 0.1, 0.6, 2637, 2637, 0.16, 0, 6);
        Hiss(b, 0.1, 0.5, 0.1, 9000, 12000, 6, true);
        fx[(int)Snd.Charge] = Normalize(b, 0.8f);

        // 發動神器
        b = Buffer(1.2);
        Hiss(b, 0, 0.5, 0.45, 400, 7000, 3);
        Tone(b, 0, 0.5, 196, 784, 0.32, 2, 3);
        foreach (double f in new[] { 523.25, 659.25, 784, 1046.5 })
        {
            Tone(b, 0.4, 0.75, f, f, 0.22, 3, 4);
            Tone(b, 0.4, 0.75, f * 2, f * 2, 0.07, 0, 5);
        }

        Tone(b, 0.4, 0.4, 110, 50, 0.6, 0, 8);
        fx[(int)Snd.Skill] = Normalize(b, 0.95f);

        b = Buffer(0.2);
        Tone(b, 0, 0.16, 190, 68, 0.8, 0, 17);
        Hiss(b, 0, 0.06, 0.45, 2600, 900, 40);
        fx[(int)Snd.BossHit] = Normalize(b, 0.8f);

        // 魔王出招：低沉的咆哮
        b = Buffer(0.9);
        Tone(b, 0, 0.85, 92, 54, 0.6, 2, 2.4, 0.02, 5);
        Tone(b, 0, 0.85, 138, 81, 0.3, 1, 2.6, 0.02, 5);
        Hiss(b, 0, 0.8, 0.35, 300, 2400, 3);
        fx[(int)Snd.BossAttack] = Normalize(b, 0.9f);

        b = Buffer(0.5);
        double[] chime = { 2093, 2637, 3136, 3951 };
        for (int i = 0; i < chime.Length; i++) Tone(b, i * 0.04, 0.3, chime[i], chime[i], 0.3, 0, 12);
        Hiss(b, 0, 0.3, 0.2, 8000, 11000, 10, true);
        fx[(int)Snd.Freeze] = Normalize(b, 0.75f);

        // 魔王爆炸：一連串爆炸加長長的轟鳴
        b = Buffer(3.0);
        double[] booms = { 0, 0.32, 0.62, 0.9, 1.25, 1.7 };
        for (int i = 0; i < booms.Length; i++)
        {
            Tone(b, booms[i], 0.6, 170 - i * 14, 34, 0.9, 0, 5.5);
            Hiss(b, booms[i], 0.5, 0.6, 4200, 260, 7);
        }

        Tone(b, 0, 2.9, 62, 30, 0.5, 0, 1.1);
        Hiss(b, 1.7, 1.25, 0.8, 5000, 180, 2.6);
        fx[(int)Snd.BossDie] = Normalize(b, 0.98f);

        // 過關號角
        b = Buffer(1.5);
        double[] fan = { 523.25, 659.25, 784, 1046.5 };
        for (int i = 0; i < fan.Length; i++) Tone(b, i * 0.11, 0.2, fan[i], fan[i], 0.3, 4, 7);
        foreach (double f in new[] { 1046.5, 1318.5, 1568 }) Tone(b, 0.5, 0.95, f, f, 0.24, 4, 2.6, 0.003, 3);
        fx[(int)Snd.Win] = Normalize(b, 0.8f);

        b = Buffer(1.1);
        double[] sad = { 440, 349.2, 293.7, 220 };
        for (int i = 0; i < sad.Length; i++) Tone(b, i * 0.2, 0.45, sad[i], sad[i] * 0.97, 0.4, 3, 5);
        fx[(int)Snd.Lose] = Normalize(b, 0.7f);

        b = Buffer(0.4);
        Tone(b, 0, 0.18, 1568, 1568, 0.3, 0, 13);
        Tone(b, 0.13, 0.25, 2093, 2093, 0.3, 0, 11);
        fx[(int)Snd.Hint] = Normalize(b, 0.6f);

        b = Buffer(0.07);
        Tone(b, 0, 0.06, 1300, 900, 0.4, 1, 45);
        fx[(int)Snd.Click] = Normalize(b, 0.45f);

        b = Buffer(0.5);
        Hiss(b, 0, 0.25, 0.5, 600, 4500, 6);
        Hiss(b, 0.2, 0.28, 0.5, 4500, 600, 6);
        fx[(int)Snd.Shuffle] = Normalize(b, 0.6f);

        b = Buffer(0.4);
        Tone(b, 0, 0.36, 2093, 2093, 0.34, 0, 9);
        Tone(b, 0.05, 0.3, 3136, 3136, 0.2, 0, 10);
        fx[(int)Snd.Star] = Normalize(b, 0.7f);

        return fx;
    }

    // ───────────────────────── 暫用背景音樂 ─────────────────────────

    private static double Midi(string name)
    {
        int semitone = "C D EF G A B".IndexOf(name[0]);
        int i = 1;
        if (name[i] == '#')
        {
            semitone++;
            i++;
        }

        int octave = name[i] - '0';
        return 440 * Math.Pow(2, (12 * (octave + 1) + semitone - 69) / 12.0);
    }

    /// <summary>
    /// 之後會換成使用者提供的音樂，這裡先用程式合成一首頂著：主旋律、琶音、貝斯、鼓。
    /// boss 為 true 時是比較快的小調版本。回傳的左右聲道長度剛好是整數小節，可以無縫循環。
    /// </summary>
    public static (float[] L, float[] R) BuildSong(bool boss)
    {
        double bpm = boss ? 164 : 138;
        double eighth = 60.0 / bpm / 2;
        string[] chords = boss
            ? new[] { "A2m", "F2", "G2", "E2m", "A2m", "F2", "G2", "E2" }
            : new[] { "F2", "G2", "E2m", "A2m", "F2", "G2", "C3", "C3", "A2m", "F2", "C3", "G2", "A2m", "F2", "G2", "G2" };
        string melody = boss
            ? "A4 . A4 C5 E5 . D5 C5 | F5 . E5 . C5 . A4 . | G4 . B4 D5 G5 . F5 D5 | E5 . . B4 E5 . G5 . | " +
              "A5 . A5 G5 E5 . C5 E5 | F5 . A5 . C6 . A5 F5 | G5 . B5 . D6 . B5 G5 | E5 . G#5 . B5 . E6 ."
            : "A4 C5 F5 . E5 . C5 . | D5 . B4 D5 G5 . . - | G5 . E5 . B4 . E5 G5 | A5 . . G5 E5 . C5 . | " +
              "A4 C5 F5 . A5 . G5 F5 | G5 . D5 . B5 . A5 G5 | C6 . . G5 E5 . G5 . | C6 . . . - - G5 . | " +
              "E5 . A5 . C6 . B5 A5 | A5 . F5 . C5 . F5 A5 | G5 . E5 . C5 E5 G5 . | D5 . G5 . B5 . . - | " +
              "E5 . A5 . C6 . D6 C6 | C6 . A5 . F5 . A5 C6 | D6 . B5 . G5 . B5 D6 | D6 . . . G5 A5 B5 .";

        int bars = chords.Length;
        int length = (int)Math.Round(bars * 8 * eighth * SR);
        float[] lead = new float[length], arp = new float[length], bass = new float[length], drums = new float[length];

        string[] notes = melody.Split(new[] { ' ', '|' }, StringSplitOptions.RemoveEmptyEntries);
        for (int i = 0; i < notes.Length; i++)
        {
            if (notes[i] is "." or "-") continue;
            int hold = 1;
            while (i + hold < notes.Length && notes[i + hold] == ".") hold++;
            double f = Midi(notes[i]);
            Tone(lead, i * eighth, hold * eighth + 0.12, f, f, 0.5, 4, 2.2 / Math.Max(1, hold * 0.6), 0.006, 2.5, true);
            Tone(lead, i * eighth, hold * eighth + 0.12, f * 1.004, f * 1.004, 0.22, 3, 2.6, 0.006, 2.5, true);
        }

        for (int bar = 0; bar < bars; bar++)
        {
            string chord = chords[bar];
            bool minor = chord.EndsWith('m');
            double root = Midi(minor ? chord[..^1] : chord);
            double third = root * Math.Pow(2, (minor ? 3 : 4) / 12.0), fifth = root * Math.Pow(2, 7 / 12.0);
            double[] tones = { root * 4, third * 4, fifth * 4, root * 8, fifth * 4, third * 4, root * 4, fifth * 2 };
            double t0 = bar * 8 * eighth;
            for (int step = 0; step < 16; step++)
            {
                double t = t0 + step * eighth / 2;
                Tone(arp, t, 0.22, tones[step % 8], tones[step % 8], 0.3, 3, 14, 0.002, 0, true);

                // 鼓：大鼓、小鼓、hi-hat
                bool kick = boss ? step % 4 == 0 : step is 0 or 8 or 10;
                if (kick)
                {
                    Tone(drums, t, 0.16, 150, 44, 0.9, 0, 20, 0.001, 0, true);
                }

                if (step is 4 or 12)
                {
                    Hiss(drums, t, 0.14, 0.55, 5200, 1800, 24, false, true);
                    Tone(drums, t, 0.08, 220, 150, 0.3, 3, 30, 0.001, 0, true);
                }

                if (step % 2 == 0 || boss) Hiss(drums, t, 0.04, step % 4 == 2 ? 0.26 : 0.16, 9000, 9000, 70, true, true);
            }

            for (int step = 0; step < 8; step++)
            {
                double f = boss && step % 2 == 1 ? root * 2 : root;
                if (!boss && step is 3 or 7) f = fifth;
                Tone(bass, t0 + step * eighth, eighth * 0.92, f, f, 0.5, 3, 5, 0.004, 0, true);
                Tone(bass, t0 + step * eighth, eighth * 0.92, f, f, 0.2, 1, 7, 0.004, 0, true);
            }
        }

        // 主旋律加一點左右回音，琶音偏左、主旋律偏右，中間留給音效
        int echo = (int)(eighth * 3 * SR);
        float[] left = new float[length], right = new float[length];
        for (int i = 0; i < length; i++)
        {
            float delayed = lead[(i - echo + length) % length] * 0.28f;
            left[i] = lead[i] * 0.42f + delayed * 0.9f + arp[i] * 0.5f + bass[i] * 0.55f + drums[i] * 0.5f;
            right[i] = lead[i] * 0.5f + delayed * 0.3f + arp[i] * 0.28f + bass[i] * 0.55f + drums[i] * 0.5f;
        }

        return (left, right);
    }
}
