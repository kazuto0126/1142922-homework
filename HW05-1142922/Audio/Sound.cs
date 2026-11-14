using System.Reflection;
using System.Runtime.InteropServices;

namespace CandyLegend.Audio;

/// <summary>一首已解碼的音樂：立體聲交錯的 16-bit 取樣，加上把它壓到統一音量的倍率。</summary>
internal sealed class Song
{
    public readonly short[] Pcm;
    public readonly float Gain;

    public Song(short[] pcm, float gain)
    {
        Pcm = pcm;
        Gain = gain;
    }

    public int Frames => Pcm.Length / 2;
    public double Seconds => Frames / (double)Synth.SR;
}

/// <summary>
/// 遊戲用的聲音入口：Sound.Play(音效)、Sound.Music(曲目)。
/// 用 Windows 內建的 winmm 把混好的聲音送到音效卡，不需要任何套件；打不開音效裝置時遊戲照常運作。
/// </summary>
internal static class Sound
{
    /// <summary>音樂固定壓到這個平均音量，音效才一定蓋得過音樂。</summary>
    public const float MusicRms = 0.05f;

    // 曲目編號：0 合成的一般音樂（備用）、1 合成的魔王音樂（備用）、2 關卡地圖、3 第 1–3 關、4 第 4–6 關、
    // 5 魔王第一階段（OP14〈約束の日〉去人聲）、6 標題畫面與第 7–9 關（Butterfly）、
    // 7 魔王第二階段（龍化後，Fairy Tail Theme Song 加長版的前 4 分鐘）、
    // 8 魔王第一階段的第二首（ReoNa〈ANIMA〉去人聲，和 5 輪流播）。曲目都是使用者指定的。
    public const int Title = 6, Map = 2, BossPhase2 = 7, BossPhase1b = 8;

    /// <summary>包在 exe 裡的音樂檔名（Assets\Music\*.wav）；null 代表用程式合成。</summary>
    private static readonly string?[] Embedded = { null, null, "map", "stage1", "stage2", "stage3", "stage4", "stage5", "stage6" };

    private static readonly Song?[] Songs = new Song?[Embedded.Length];
    private static readonly bool[] Loading = new bool[Embedded.Length];
    private static float[][]? _fx;
    private static Mixer? _mixer;
    private static Engine? _engine;
    private static int _wanted = -1, _wantedAlt = -1;
    private static bool _musicOn = true;

    /// <summary>第幾關用哪一首：1–3 關、4–6 關、7–9 關、魔王關各一首。</summary>
    public static int StageTrack(int level) => level <= 3 ? 3 : level <= 6 ? 4 : level <= 9 ? 6 : 5;

    public static bool MusicOn
    {
        get => _musicOn;
        set
        {
            _musicOn = value;
            Apply();
        }
    }

    public static void Init()
    {
        if (_mixer != null) return;
        _fx = Synth.BuildEffects();
        _mixer = new Mixer();
        _engine = new Engine(_mixer);

        // 合成的音樂比較花時間，放到背景算，算好就自動開始播。
        var worker = new Thread(() =>
        {
            for (int i = 0; i < 2; i++)
            {
                Songs[i] = FromSynth(Synth.BuildSong(i == 1));
                Apply();
            }
        })
        {
            IsBackground = true,
            Name = "Composer",
        };
        worker.Start();
    }

    public static void Shutdown() => _engine?.Dispose();

    private static bool _offline;

    /// <summary>錄影用：不開音效裝置，所有歌一次解碼好，由錄影程式自己一格一格取聲音。</summary>
    public static void InitOffline()
    {
        if (_mixer != null) return;
        _offline = true;
        _fx = Synth.BuildEffects();
        _mixer = new Mixer();
        for (int i = 0; i < Embedded.Length; i++)
            if (Embedded[i] is string name) Songs[i] = LoadEmbedded(name);
    }

    /// <summary>錄影用：取出接下來 frames 個取樣，音效與音樂分開。</summary>
    public static void RenderOffline(float[] left, float[] right, float[] musicLeft, float[] musicRight, int frames) =>
        _mixer?.Render(left, right, frames, musicLeft, musicRight);

    public static void Play(Snd sound, float gain = 1, float pan = 0, double rate = 1)
    {
        if (_mixer == null || _fx == null) return;
        _mixer.Play(_fx[(int)sound], gain, pan, rate);
    }

    /// <summary>切換曲目（-1 = 靜音）。包在 exe 裡的歌第一次用到時才在背景解碼，解好就接著播。</summary>
    /// <summary>設定音樂播放速度（魔王龍化後加快）。</summary>
    public static void MusicSpeed(double rate)
    {
        if (_mixer != null) _mixer.MusicRate = rate;
    }

    /// <param name="alt">有的話兩首輪流播（-1 = 只播一首循環）。</param>
    public static void Music(int track, int alt = -1)
    {
        // 換曲時速度回到原速（魔王龍化加快的效果只在那一關）。
        if (_mixer != null && track != _wanted) _mixer.MusicRate = 1;
        _wanted = track;
        _wantedAlt = alt;
        if (track >= 0 && track < Songs.Length) EnsureLoaded(track);
        if (alt >= 0 && alt < Songs.Length) EnsureLoaded(alt);
        Apply();
    }

    private static void EnsureLoaded(int track)
    {
        string? name = Embedded[track];
        if (name == null || Songs[track] != null || _offline) return;
        lock (Loading)
        {
            if (Loading[track]) return;
            Loading[track] = true;
        }

        ThreadPool.QueueUserWorkItem(_ =>
        {
            Songs[track] = LoadEmbedded(name) ?? Songs[0];
            Apply();
        });
    }

    private static void Apply()
    {
        if (_mixer == null) return;
        int wanted = _wanted;
        Song? song = _musicOn && wanted >= 0 && wanted < Songs.Length ? Songs[wanted] : null;
        int alt = _wantedAlt;
        _mixer.SetMusic(song, song != null && alt >= 0 && alt < Songs.Length ? Songs[alt] : null);
    }

    private static float GainFor(short[] pcm)
    {
        double sum = 0;
        for (int i = 0; i < pcm.Length; i++) sum += (double)pcm[i] * pcm[i];
        double rms = Math.Sqrt(sum / Math.Max(1, pcm.Length)) / 32768;
        return (float)(MusicRms / Math.Max(0.0001, rms));
    }

    private static Song FromSynth((float[] L, float[] R) song)
    {
        float peak = 0.0001f;
        for (int i = 0; i < song.L.Length; i++) peak = Math.Max(peak, Math.Max(Math.Abs(song.L[i]), Math.Abs(song.R[i])));
        var pcm = new short[song.L.Length * 2];
        for (int i = 0; i < song.L.Length; i++)
        {
            pcm[i * 2] = (short)(song.L[i] / peak * 32000);
            pcm[i * 2 + 1] = (short)(song.R[i] / peak * 32000);
        }

        return new Song(pcm, GainFor(pcm));
    }

    /// <summary>
    /// 讀取包在 exe 裡的音樂（Assets\Music\名稱.wav）。支援 16-bit PCM 與 IMA ADPCM（約四分之一大小）兩種格式，
    /// 單聲道會複製成立體聲，取樣率不是 44.1 kHz 會先換算。
    /// </summary>
    internal static Song? LoadEmbedded(string name)
    {
        try
        {
            using Stream? stream = Assembly.GetExecutingAssembly().GetManifestResourceStream($"Music.{name}.wav");
            if (stream == null) return null;
            using var reader = new BinaryReader(stream);
            if (new string(reader.ReadChars(4)) != "RIFF") return null;
            reader.ReadInt32();
            if (new string(reader.ReadChars(4)) != "WAVE") return null;
            int format = 0, channels = 0, rate = 0, blockAlign = 0, bits = 0, samplesPerBlock = 0;
            while (stream.Position + 8 <= stream.Length)
            {
                string id = new(reader.ReadChars(4));
                int size = reader.ReadInt32();
                if (id == "fmt ")
                {
                    long start = stream.Position;
                    format = reader.ReadUInt16();
                    channels = reader.ReadInt16();
                    rate = reader.ReadInt32();
                    reader.ReadInt32();
                    blockAlign = reader.ReadInt16();
                    bits = reader.ReadInt16();
                    if (size >= 20)
                    {
                        reader.ReadInt16();
                        samplesPerBlock = reader.ReadUInt16();
                    }

                    stream.Position = start + size + (size & 1);
                    if (channels is < 1 or > 2) return null;
                }
                else if (id == "data" && channels > 0)
                {
                    byte[] data = reader.ReadBytes((int)Math.Min(size, stream.Length - stream.Position));
                    short[]? pcm = format switch
                    {
                        1 when bits == 16 => Pcm16(data, channels),
                        0x11 when bits == 4 => DecodeIma(data, channels, blockAlign,
                            samplesPerBlock > 0 ? samplesPerBlock : (blockAlign - 4 * channels) * 2 / channels + 1),
                        _ => null,
                    };
                    if (pcm == null) return null;
                    if (rate != Synth.SR) pcm = Resample(pcm, rate);
                    return new Song(pcm, GainFor(pcm));
                }
                else
                {
                    stream.Position += size + (size & 1);
                }
            }
        }
        catch (Exception ex) when (ex is IOException or EndOfStreamException or ArgumentException or IndexOutOfRangeException)
        {
            // 音樂檔有問題就退回合成的音樂。
        }

        return null;
    }

    private static short[] Pcm16(byte[] data, int channels)
    {
        int frames = data.Length / (2 * channels);
        var pcm = new short[frames * 2];
        for (int i = 0; i < frames; i++)
        {
            short l = BitConverter.ToInt16(data, i * 2 * channels);
            short r = channels == 2 ? BitConverter.ToInt16(data, i * 4 + 2) : l;
            pcm[i * 2] = l;
            pcm[i * 2 + 1] = r;
        }

        return pcm;
    }

    private static readonly int[] ImaStep =
    {
        7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
        130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060,
        1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
        7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
    };

    private static readonly int[] ImaIndex = { -1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8 };

    /// <summary>
    /// 解 WAV 裡的 IMA ADPCM（Microsoft 格式）：每個區塊開頭每個聲道有 4 位元組（起始值與步距索引），
    /// 之後每個聲道輪流 4 位元組（8 個取樣，先低 4 位元再高 4 位元）。輸出一律是立體聲交錯。
    /// </summary>
    private static short[] DecodeIma(byte[] data, int channels, int blockAlign, int samplesPerBlock)
    {
        int blocks = (data.Length + blockAlign - 1) / blockAlign;
        var temp = new short[(long)blocks * samplesPerBlock * channels > int.MaxValue ? 0 : blocks * samplesPerBlock * channels];
        int written = 0;
        var pred = new int[channels];
        var index = new int[channels];
        for (int b = 0; b < blocks; b++)
        {
            int o = b * blockAlign, end = Math.Min(data.Length, o + blockAlign);
            if (end - o < 4 * channels) break;
            for (int c = 0; c < channels; c++)
            {
                pred[c] = (short)(data[o + c * 4] | (data[o + c * 4 + 1] << 8));
                index[c] = Math.Clamp((int)data[o + c * 4 + 2], 0, 88);
                temp[written * channels + c] = (short)pred[c];
            }

            int n = 1;
            int p = o + 4 * channels;
            while (p + 4 * channels <= end && n < samplesPerBlock)
            {
                for (int c = 0; c < channels; c++)
                {
                    for (int k = 0; k < 4; k++)
                    {
                        byte value = data[p + c * 4 + k];
                        for (int half = 0; half < 2; half++)
                        {
                            int nibble = half == 0 ? value & 0x0F : value >> 4;
                            int step = ImaStep[index[c]];
                            int diff = step >> 3;
                            if ((nibble & 4) != 0) diff += step;
                            if ((nibble & 2) != 0) diff += step >> 1;
                            if ((nibble & 1) != 0) diff += step >> 2;
                            pred[c] = Math.Clamp((nibble & 8) != 0 ? pred[c] - diff : pred[c] + diff, -32768, 32767);
                            index[c] = Math.Clamp(index[c] + ImaIndex[nibble], 0, 88);
                            int at = n + k * 2 + half;
                            if (at < samplesPerBlock) temp[(written + at) * channels + c] = (short)pred[c];
                        }
                    }
                }

                p += 4 * channels;
                n += 8;
            }

            written += Math.Min(n, samplesPerBlock);
        }

        var pcm = new short[written * 2];
        for (int i = 0; i < written; i++)
        {
            pcm[i * 2] = temp[i * channels];
            pcm[i * 2 + 1] = temp[i * channels + channels - 1];
        }

        return pcm;
    }

    private static short[] Resample(short[] pcm, int rate)
    {
        int frames = pcm.Length / 2;
        double step = (double)rate / Synth.SR;
        int outFrames = (int)(frames / step);
        var result = new short[outFrames * 2];
        for (int i = 0; i < outFrames; i++)
        {
            double pos = i * step;
            int at = (int)pos, next = Math.Min(frames - 1, at + 1);
            float frac = (float)(pos - at);
            for (int c = 0; c < 2; c++)
                result[i * 2 + c] = (short)(pcm[at * 2 + c] + (pcm[next * 2 + c] - pcm[at * 2 + c]) * frac);
        }

        return result;
    }

    // ───────────────────────── 混音 ─────────────────────────

    internal sealed class Mixer
    {
        private struct Voice
        {
            public float[] Data;
            public double Pos, Rate;
            public float L, R;
        }

        private readonly object _gate = new();
        private readonly Voice[] _voices = new Voice[40];
        private int _count;
        private Song? _mus, _next, _alt, _nextAlt;
        private double _musPos;

        /// <summary>音樂播放速度（1 = 原速）。魔王第二階段會加快，音高也跟著變高，聽起來更急。</summary>
        public double MusicRate = 1;
        private float _musGain;
        private bool _switching;

        public void Play(float[] data, float gain, float pan, double rate)
        {
            pan = Math.Clamp(pan, -1, 1);
            var voice = new Voice
            {
                Data = data, Rate = rate,
                L = gain * Math.Min(1, 1 - pan), R = gain * Math.Min(1, 1 + pan),
            };
            lock (_gate)
            {
                if (_count == _voices.Length)
                {
                    Array.Copy(_voices, 1, _voices, 0, _count - 1);
                    _count--;
                }

                _voices[_count++] = voice;
            }
        }

        /// <summary>
        /// 換曲。<paramref name="alt"/> 不是 null 時兩首輪流播：一首播完接另一首（魔王第一階段用）。
        /// </summary>
        public void SetMusic(Song? song, Song? alt = null)
        {
            lock (_gate)
            {
                // 同一組歌已經在播（可能正輪到第二首）：不重來，只補上剛解碼好的第二首。
                bool playingPair = !_switching && (ReferenceEquals(song, _mus) || (_alt != null && ReferenceEquals(song, _alt) && ReferenceEquals(alt, _mus)));
                if (playingPair)
                {
                    if (ReferenceEquals(song, _mus)) _alt = alt;
                    return;
                }

                if (_switching && ReferenceEquals(song, _next))
                {
                    _nextAlt = alt;
                    return;
                }

                _next = song;
                _nextAlt = alt;
                _switching = true;
            }
        }

        /// <param name="musicLeft">錄影用：不是 null 時音樂另外寫到這兩個陣列，left/right 只剩音效。</param>
        public void Render(float[] left, float[] right, int frames, float[]? musicLeft = null, float[]? musicRight = null)
        {
            float[] ml = musicLeft ?? left, mr = musicRight ?? right;
            if (musicLeft != null)
            {
                Array.Clear(musicLeft, 0, frames);
                Array.Clear(musicRight!, 0, frames);
            }

            Array.Clear(left, 0, frames);
            Array.Clear(right, 0, frames);
            lock (_gate)
            {
                for (int i = 0; i < frames; i++)
                {
                    if (_switching)
                    {
                        // 換曲時先淡出再切，避免爆音。
                        _musGain -= 1f / (0.25f * Synth.SR);
                        if (_musGain <= 0 || _mus == null)
                        {
                            _mus = _next;
                            _alt = _nextAlt;
                            _musPos = 0;
                            _musGain = 0;
                            _switching = false;
                        }
                    }
                    else if (_musGain < 1)
                    {
                        _musGain = Math.Min(1, _musGain + 1f / (0.5f * Synth.SR));
                    }

                    if (_mus == null) continue;
                    float k = _mus.Gain * _musGain / 32768f;
                    int at = (int)_musPos, nx = at + 1 < _mus.Frames ? at + 1 : 0;
                    float f = (float)(_musPos - at);
                    ml[i] += (_mus.Pcm[at * 2] + (_mus.Pcm[nx * 2] - _mus.Pcm[at * 2]) * f) * k;
                    mr[i] += (_mus.Pcm[at * 2 + 1] + (_mus.Pcm[nx * 2 + 1] - _mus.Pcm[at * 2 + 1]) * f) * k;
                    _musPos += MusicRate;
                    if (_musPos >= _mus.Frames)
                    {
                        _musPos -= _mus.Frames;
                        if (_alt != null)
                        {
                            (_mus, _alt) = (_alt, _mus);
                            _musPos = 0;
                        }
                    }
                }

                for (int v = 0; v < _count; v++)
                {
                    ref Voice voice = ref _voices[v];
                    float[] data = voice.Data;
                    int last = data.Length - 1;
                    for (int i = 0; i < frames; i++)
                    {
                        int at = (int)voice.Pos;
                        if (at >= last)
                        {
                            voice.Pos = -1;
                            break;
                        }

                        float frac = (float)(voice.Pos - at);
                        float sample = data[at] + (data[at + 1] - data[at]) * frac;
                        left[i] += sample * voice.L;
                        right[i] += sample * voice.R;
                        voice.Pos += voice.Rate;
                    }
                }

                int keep = 0;
                for (int v = 0; v < _count; v++)
                    if (_voices[v].Pos >= 0) _voices[keep++] = _voices[v];
                _count = keep;
            }

            for (int i = 0; i < frames; i++)
            {
                left[i] = Soft(left[i]);
                right[i] = Soft(right[i]);
            }
        }

        /// <summary>很多音效同時響時平滑地壓住，不讓聲音破掉。</summary>
        private static float Soft(float x)
        {
            float a = Math.Abs(x);
            if (a <= 0.75f) return x;
            float y = 0.75f + 0.25f * MathF.Tanh((a - 0.75f) / 0.25f);
            return x < 0 ? -y : y;
        }
    }

    // ───────────────────────── 輸出到音效卡 ─────────────────────────

    private sealed class Engine : IDisposable
    {
        private const int FramesPerBuffer = 882;
        private const int BufferCount = 4;
        private readonly Mixer _mixer;
        private readonly Thread _thread;
        private volatile bool _stop;

        public Engine(Mixer mixer)
        {
            _mixer = mixer;
            _thread = new Thread(Loop) { IsBackground = true, Name = "Soundscape", Priority = ThreadPriority.Highest };
            _thread.Start();
        }

        public void Dispose()
        {
            _stop = true;
            if (_thread != Thread.CurrentThread) _thread.Join(1500);
        }

        private void Loop()
        {
            IntPtr output = IntPtr.Zero;
            var buffers = new List<WaveBuffer>(BufferCount);
            var left = new float[FramesPerBuffer];
            var right = new float[FramesPerBuffer];
            try
            {
                var format = new WaveFormat
                {
                    FormatTag = 1, Channels = 2, SamplesPerSec = Synth.SR, AvgBytesPerSec = Synth.SR * 4,
                    BlockAlign = 4, BitsPerSample = 16,
                };
                // WAVE_MAPPER 代表使用 Windows 目前預設的輸出裝置。
                if (Native.waveOutOpen(out output, uint.MaxValue, ref format, IntPtr.Zero, IntPtr.Zero, 0) != 0) return;
                for (int i = 0; i < BufferCount; i++) buffers.Add(new WaveBuffer(output));
                while (!_stop)
                {
                    bool wrote = false;
                    foreach (WaveBuffer buffer in buffers)
                    {
                        if (buffer.Submitted && !buffer.Done) continue;
                        _mixer.Render(left, right, FramesPerBuffer);
                        short[] samples = buffer.Samples;
                        for (int i = 0; i < FramesPerBuffer; i++)
                        {
                            samples[i * 2] = (short)(Math.Clamp(left[i], -1f, 1f) * 32000);
                            samples[i * 2 + 1] = (short)(Math.Clamp(right[i], -1f, 1f) * 32000);
                        }

                        if (Native.waveOutWrite(output, buffer.Header, WaveBuffer.HeaderSize) != 0) return;
                        buffer.Submitted = true;
                        wrote = true;
                    }

                    Thread.Sleep(wrote ? 1 : 3);
                }
            }
            catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException
                or ExternalException or InvalidOperationException)
            {
                // 聲音只是加分項目，音效裝置有問題時不能讓遊戲當掉。
            }
            finally
            {
                if (output != IntPtr.Zero) Native.waveOutReset(output);
                foreach (WaveBuffer buffer in buffers) buffer.Release(output);
                if (output != IntPtr.Zero) Native.waveOutClose(output);
            }
        }

        [StructLayout(LayoutKind.Sequential, Pack = 2)]
        private struct WaveFormat
        {
            public ushort FormatTag, Channels;
            public uint SamplesPerSec, AvgBytesPerSec;
            public ushort BlockAlign, BitsPerSample, ExtraSize;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WaveHeader
        {
            public IntPtr Data;
            public uint BufferLength, BytesRecorded;
            public UIntPtr User;
            public uint Flags, Loops;
            public IntPtr Next;
            public UIntPtr Reserved;
        }

        private sealed class WaveBuffer
        {
            internal static readonly uint HeaderSize = (uint)Marshal.SizeOf<WaveHeader>();
            private static readonly int FlagsOffset = (int)Marshal.OffsetOf<WaveHeader>(nameof(WaveHeader.Flags));

            internal readonly short[] Samples = new short[FramesPerBuffer * 2];
            internal readonly IntPtr Header;
            private GCHandle _pin;
            private bool _prepared;
            internal bool Submitted;

            internal bool Done => (Marshal.ReadInt32(Header, FlagsOffset) & 1) != 0;

            internal WaveBuffer(IntPtr output)
            {
                _pin = GCHandle.Alloc(Samples, GCHandleType.Pinned);
                Header = Marshal.AllocHGlobal((int)HeaderSize);
                Marshal.StructureToPtr(new WaveHeader
                {
                    Data = _pin.AddrOfPinnedObject(),
                    BufferLength = (uint)(Samples.Length * sizeof(short)),
                }, Header, false);
                if (Native.waveOutPrepareHeader(output, Header, HeaderSize) != 0)
                {
                    Marshal.FreeHGlobal(Header);
                    _pin.Free();
                    throw new InvalidOperationException("Windows could not prepare an audio buffer.");
                }

                _prepared = true;
            }

            internal void Release(IntPtr output)
            {
                if (_prepared)
                {
                    // waveOutReset 已經把排隊的緩衝區還回來，才能安全釋放。
                    if (Native.waveOutUnprepareHeader(output, Header, HeaderSize) != 0) return;
                    _prepared = false;
                }

                Marshal.FreeHGlobal(Header);
                if (_pin.IsAllocated) _pin.Free();
            }
        }

        private static class Native
        {
            [DllImport("winmm.dll", ExactSpelling = true)]
            internal static extern uint waveOutOpen(out IntPtr waveOut, uint device, ref WaveFormat format,
                IntPtr callback, IntPtr instance, uint flags);

            [DllImport("winmm.dll", ExactSpelling = true)]
            internal static extern uint waveOutPrepareHeader(IntPtr waveOut, IntPtr header, uint size);

            [DllImport("winmm.dll", ExactSpelling = true)]
            internal static extern uint waveOutWrite(IntPtr waveOut, IntPtr header, uint size);

            [DllImport("winmm.dll", ExactSpelling = true)]
            internal static extern uint waveOutUnprepareHeader(IntPtr waveOut, IntPtr header, uint size);

            [DllImport("winmm.dll", ExactSpelling = true)]
            internal static extern uint waveOutReset(IntPtr waveOut);

            [DllImport("winmm.dll", ExactSpelling = true)]
            internal static extern uint waveOutClose(IntPtr waveOut);
        }
    }
}
