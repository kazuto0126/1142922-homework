using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using CandyLegend.Audio;
using CandyLegend.Core;

namespace CandyLegend.UI;

/// <summary>關卡進行中：操作、動畫節奏、特效。規則本身都在 <see cref="Session"/>。</summary>
internal sealed partial class GameForm
{
    private const int BX = 352, BY = 200, CS = 64;
    private const float BossX = 1104, BossY = 196;
    private static readonly RectangleF BoardRect = new(BX, BY, CS * 9, CS * 9);

    private enum FxKind { Row, Col, Ring, Beam, Bolt, Jelly, Ice, Spark, Flash, Zap, Slash, Pillar, Frost, Gust, Circle, Veil, Blade, Lines }

    private sealed class Ghost
    {
        public Piece P = null!;
        public float X, Y, Delay, T;
        public bool Started;
    }

    private struct Particle
    {
        public float X, Y, VX, VY, Life, Max, Size;
        public Color C;
        public bool Star;

        /// <summary>Delay：延後幾秒才出現；G：重力（負的會往上飄，例如火焰）。</summary>
        public float Delay, G;
    }

    private sealed class FloatText
    {
        public string S = "";
        public float X, Y, T, Max = 1, Size = 24, Angle, Delay;
        public Color C;
        public bool Shout;
    }

    private sealed class Fx
    {
        public FxKind Kind;
        public float X, Y, X2, Y2, T, Max = 0.35f, Delay, Size = 60;
        public Color C;
        public int Seed;
        public float Angle;
    }

    private sealed class Orb
    {
        public float X0, Y0, X1, Y1, T, Delay, Max = 0.45f;
        public Color C;
        public bool HitsBoss;
        public Bitmap? Sprite;
    }

    private Session? _s;
    private LevelDef _level = Levels.All[0];
    private Bitmap? _playLayer, _hudLayer;
    private int _hudFrame;
    private bool _pumping, _waitSettle, _ending, _bossHitPlayed;
    private float _wait, _idle, _shake, _bossFlash, _bossHpShown, _bossAct, _scoreShown, _chainPop, _cut, _movesPop, _endTimer, _landGap, _endSpawn;
    private int _bannerSkill = -1, _chainShown, _newReward = -1, _wonStars;
    private bool _firstClear;
    private string _bossCall = "";
    private Point? _sel, _downCell;
    private PointF _downAt;
    private Move? _hint;
    private Piece? _badA, _badB;
    private Point _badCellA, _badCellB;
    private float _badT;
    private readonly float[] _slotFlash = new float[6];
    private readonly List<Ghost> _ghosts = new();
    private readonly List<Particle> _parts = new();
    private readonly List<FloatText> _texts = new();
    private readonly List<Fx> _fx = new();
    private readonly List<Orb> _orbs = new();
    private readonly List<(float At, Action Do)> _later = new();

    /// <summary>這一關已經播過完整特寫的必殺技；第二次起改播短版。</summary>
    private readonly HashSet<int> _cutSeen = new();

    /// <summary>打擊定格：大爆炸的瞬間整個畫面停住零點幾秒，打擊感更重。</summary>
    private float _hitStop;
    private Point? _hover;
    private bool _warned;
    private bool _cutOn;

    private static PointF Center(float c, float r) => new(BX + c * CS + CS / 2f, BY + r * CS + CS / 2f);

    private bool CanInput => _s != null && !_pumping && !_ending && _badA == null && _overlay == Overlay.None &&
                             _s.State == PlayState.Playing;

    private void StartLevel(int index) => StartLevel(Levels.All[index]);

    private void StartLevel(LevelDef level)
    {
        _level = level;
        int cleared = _demo ? Levels.Count - 1 : _progress.Cleared;
        _demoAction = null;
        _s = new Session(_level, Math.Min(6, cleared), Math.Clamp(cleared - 6, 0, 3), Environment.TickCount);
        _ghosts.Clear();
        _parts.Clear();
        _texts.Clear();
        _fx.Clear();
        _orbs.Clear();
        _later.Clear();
        _cutSeen.Clear();
        _cutOn = false;
        _qteOn = false;
        _tcutOn = false;
        Array.Clear(_slotFlash);
        _sel = _downCell = null;
        _hint = null;
        _badA = _badB = null;
        _ending = false;
        _idle = _shake = _bossFlash = _bossAct = _scoreShown = _chainPop = _cut = _movesPop = _endTimer = 0;
        _chainShown = 0;
        _hitStop = 0;
        _warned = false;
        _bossHpShown = _s.BossHp;

        // 開場口號：先喊出這關的模式，糖晶落定時喊「スタート!!」。
        Shout(_level.ModeName + "!", BX + 288, BY + 250, ModeColor(_level.Mode), 0.2f, 72);
        Shout("スタート!!", BX + 288, BY + 300, Gold, 1.0f, 88);
        After(1.0f, () =>
        {
            Sound.Play(Snd.Star, 1, 0, 1.2);
            _shake = Math.Max(_shake, 0.3f);
        });

        // 開場：糖晶從上面一行一行掉進來。
        for (int c = 0; c < Board.N; c++)
        {
            for (int r = 0; r < Board.N; r++)
            {
                Piece p = _s.Board.Cells[c, r]!;
                p.Y = r - 10 - c * 0.3f;
                p.VY = 6;
                p.Falling = true;
            }
        }

        _pumping = true;
        _waitSettle = true;
        _wait = 0.2f;
        _scene = Scene.Play;
        _overlay = Overlay.None;
        BuildPlayLayer();
        // 第 1–3、4–6、7–9 關和魔王關各用一首歌（使用者指定）。
        Sound.Music(Sound.StageTrack(_level.Number), _level.BossHp > 0 ? Sound.BossPhase1b : -1);
        Sound.MusicSpeed(1);
    }

    // ───────────────────────── 每一格的更新 ─────────────────────────

    private void UpdatePlay(float dt)
    {
        if (_s == null) return;
        if (_overlay == Overlay.Pause) return;
        if (_hitStop > 0)
        {
            _hitStop -= dt;
            return;
        }

        UpdateEffects(dt);
        bool settled = AnimatePieces(dt);

        _scoreShown += (_s.Score - _scoreShown) * Math.Min(1, dt * 9);
        if (Math.Abs(_s.Score - _scoreShown) < 1) _scoreShown = _s.Score;
        _bossHpShown += (_s.BossHp - _bossHpShown) * Math.Min(1, dt * 5);
        if (_shake > 0) _shake = Math.Max(0, _shake - dt * 2.4f);
        if (_bossFlash > 0) _bossFlash = Math.Max(0, _bossFlash - dt * 4);
        if (_bossAct > 0) _bossAct = Math.Max(0, _bossAct - dt * 1.1f);
        if (_chainPop > 0) _chainPop = Math.Max(0, _chainPop - dt * 1.6f);
        if (_movesPop > 0) _movesPop = Math.Max(0, _movesPop - dt * 2.2f);
        if (_cutOn)
        {
            _cut += dt;
            if (_cut >= CutLength) _cutOn = false;
        }

        if (_tcutOn)
        {
            _tcut += dt;
            if (_tcut >= TransformLength) _tcutOn = false;
        }
        if (_landGap > 0) _landGap -= dt;
        for (int i = 0; i < 6; i++)
            if (_slotFlash[i] > 0) _slotFlash[i] = Math.Max(0, _slotFlash[i] - dt * 1.5f);

        if (_ending)
        {
            EndSequence(dt);
            return;
        }

        if (_overlay != Overlay.None) return;
        if (_qteOn)
        {
            UpdateQte(dt);
            return;
        }

        DemoTick();

        // 剩三步時喊一次，提醒玩家。
        if (!_pumping && !_warned && _s.State == PlayState.Playing && !_s.Finale && _s.Moves is > 0 and <= 3)
        {
            _warned = true;
            Shout($"あと{_s.Moves}手!", BX + 288, BY + 288, Color.FromArgb(255, 90, 90), 0, 70);
            Sound.Play(Snd.Bad, 0.8f, 0, 1.4);
        }

        if (_pumping)
        {
            _wait -= dt;
            if (_wait <= 0 && (!_waitSettle || settled)) NextStep();
        }
        else if (_s.State == PlayState.Playing)
        {
            // 10 秒沒有動作就自動提示一步。
            _idle += dt;
            if (_idle >= 10 && _hint == null) ShowHint();
        }
    }

    private void ShowHint()
    {
        if (!CanInput) return;
        List<Move> moves = _s!.Board.FindMoves();
        if (moves.Count == 0) return;
        _hint = moves.MaxBy(m => m.Value);
        _sel = null;
        Sound.Play(Snd.Hint);
    }

    private static float Approach(float value, float target, float step) =>
        value < target ? Math.Min(target, value + step) : Math.Max(target, value - step);

    private bool AnimatePieces(float dt)
    {
        bool settled = true, shardLanded = false;
        int landed = 0;
        Piece?[,] cells = _s!.Board.Cells;
        for (int c = 0; c < Board.N; c++)
        {
            for (int r = 0; r < Board.N; r++)
            {
                Piece? p = cells[c, r];
                if (p == null) continue;
                if (p.Falling)
                {
                    p.X = c;
                    p.VY = Math.Min(p.VY + 52f * dt, 21f);
                    p.Y += p.VY * dt;
                    if (p.Y >= r)
                    {
                        p.Y = r;
                        p.VY = 0;
                        p.Falling = false;
                        p.Squash = 1;
                        landed++;
                        if (p.Kind == PieceKind.Shard) shardLanded = true;
                    }
                    else settled = false;
                }
                else if (p != _badA && p != _badB && (p.X != c || p.Y != r))
                {
                    float far = Math.Max(Math.Abs(c - p.X), Math.Abs(r - p.Y));
                    float step = Math.Max(9f, far * 6f) * dt;
                    p.X = Approach(p.X, c, step);
                    p.Y = Approach(p.Y, r, step);
                    if (p.X != c || p.Y != r) settled = false;
                }

                if (p.Squash > 0) p.Squash = Math.Max(0, p.Squash - dt * 6);
                if (p.Pop > 0) p.Pop = Math.Max(0, p.Pop - dt * 3.2f);
            }
        }

        if (landed > 0 && _landGap <= 0)
        {
            Sound.Play(Snd.Land, Math.Min(0.75f, 0.3f + landed * 0.06f), 0, 0.9 + _rng.NextDouble() * 0.25);
            _landGap = 0.07f;
        }

        if (shardLanded) Sound.Play(Snd.ShardLand, 0.85f);

        // 換不成的時候，兩顆糖晶往對方靠一下再彈回來。
        if (_badA != null && _badB != null)
        {
            _badT += dt / 0.3f;
            float k = _badT >= 1 ? 0 : (float)Math.Sin(Math.PI * _badT) * 0.42f;
            _badA.X = _badCellA.X + (_badCellB.X - _badCellA.X) * k;
            _badA.Y = _badCellA.Y + (_badCellB.Y - _badCellA.Y) * k;
            _badB.X = _badCellB.X + (_badCellA.X - _badCellB.X) * k;
            _badB.Y = _badCellB.Y + (_badCellA.Y - _badCellB.Y) * k;
            if (_badT >= 1) _badA = _badB = null;
            else settled = false;
        }

        return settled;
    }

    /// <summary>向規則要下一步，並決定這一步的演出要等多久。</summary>
    private void NextStep()
    {
        _waitSettle = false;
        StepResult res = _s!.Advance();
        switch (res.Kind)
        {
            case StepKind.Clear:
                ShowClear(res);
                // 連鎖越深，每一段的停頓越短（最多縮到六成），長連鎖會越演越快。
                _wait = (0.25f + res.MaxWave * 0.055f) * Math.Max(0.6f, 1 - 0.04f * (res.Chain - 1)) + (res.Skill >= 0 ? 0.5f : 0);
                break;
            case StepKind.Collapse:
                _waitSettle = true;
                _wait = res.Moved > 0 ? 0.03f : 0;
                break;
            case StepKind.Collect:
                ShowCollect(res);
                _wait = 0.4f;
                break;
            case StepKind.BossAttack:
                ShowBossAttack(res);
                _wait = 1.15f;
                break;
            case StepKind.Transform:
                StartTransform();
                _wait = TransformLength;
                break;
            case StepKind.RoarCharge:
                StartQte();
                break;
            case StepKind.Wind:
                ShowWind(res);
                _wait = 0.55f;
                break;
            case StepKind.Lightning:
                ShowLightning(res);
                _wait = 0.65f;
                break;
            case StepKind.Fever:
                ShowFever();
                _wait = 0.9f;
                break;
            case StepKind.SkillStart:
                StartCutIn(res.Skill, res.Unison, res.Glitter);
                break;
            case StepKind.Finale:
                // 目標達成：剩下的步數變成ラストラッシュ。
                Shout("目標達成!!", BX + 288, BY + 220, Gold, 0, 76);
                if (_s.Moves > 0)
                {
                    Shout("ラストラッシュ!!", BX + 288, BY + 320, Color.FromArgb(255, 130, 190), 0.35f, 60);
                    Shout($"残り{_s.Moves}手 → ボーナス!!", BX + 288, BY + 400, Color.White, 0.7f, 40);
                }
                Sound.Play(Snd.Charge, 1);
                After(0.35f, () => Sound.Play(Snd.Star, 0.9f));
                _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 244, 200), Max = 0.4f });
                _hint = null;
                _wait = 1.0f;
                break;
            case StepKind.Shuffle:
                Toast("沒有可以走的步了，重新洗牌！");
                Sound.Play(Snd.Shuffle);
                _waitSettle = true;
                _wait = 0.7f;
                break;
            case StepKind.Idle:
                _pumping = false;
                _idle = 0;
                _hint = null;
                break;
            default:
                _pumping = false;
                BeginEnd();
                break;
        }
    }

    // ───────────────────────── 玩家操作 ─────────────────────────

    private static Point? CellAt(PointF m) =>
        BoardRect.Contains(m) ? new Point((int)((m.X - BX) / CS), (int)((m.Y - BY) / CS)) : null;

    private void PlayMouseDown()
    {
        if (_qteOn && _overlay == Overlay.None)
        {
            QteClick();
            return;
        }

        if (!CanInput) return;
        Point? cell = CellAt(_mouse);
        if (cell == null)
        {
            _sel = null;
            return;
        }

        Point at = cell.Value;
        _fx.Add(new Fx { Kind = FxKind.Ring, X = _mouse.X, Y = _mouse.Y, C = Color.White, Size = 34, Max = 0.28f });
        if (_sel is Point from && Math.Abs(from.X - at.X) + Math.Abs(from.Y - at.Y) == 1)
        {
            TrySwapCells(from, at);
            _downCell = null;
            return;
        }

        Piece? p = _s!.Board.Cells[at.X, at.Y];
        if (p == null || !p.Movable)
        {
            Sound.Play(Snd.Bad, 0.6f);
            Toast(p is { Frozen: true } ? "被冰封的糖晶不能移動，在它旁邊配對可以解凍" : "岩石不能移動，在它旁邊配對可以打碎");
            _sel = null;
            return;
        }

        _sel = at;
        _downCell = at;
        _downAt = _mouse;
    }

    private void PlayMouseMove(bool down)
    {
        if (!down || _downCell == null || !CanInput) return;
        float dx = _mouse.X - _downAt.X, dy = _mouse.Y - _downAt.Y;
        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) < 22) return;
        Point from = _downCell.Value;
        Point to = Math.Abs(dx) > Math.Abs(dy)
            ? new Point(from.X + Math.Sign(dx), from.Y)
            : new Point(from.X, from.Y + Math.Sign(dy));
        _downCell = null;
        if (Board.In(to.X, to.Y)) TrySwapCells(from, to);
    }

    private void TrySwapCells(Point a, Point b)
    {
        if (!CanInput) return;
        Piece? pa = _s!.Board.Cells[a.X, a.Y], pb = _s.Board.Cells[b.X, b.Y];
        _sel = null;
        if (_s.TrySwap(a, b))
        {
            if (pa != null) pa.Squash = 1;
            if (pb != null) pb.Squash = 1;
            Sound.Play(Snd.Swap);
            _pumping = true;
            _waitSettle = true;
            _wait = 0.02f;
            _hint = null;
            _idle = 0;
            return;
        }

        Sound.Play(Snd.Bad);
        if (pa == null || pb == null || !pa.Movable || !pb.Movable) return;
        _badA = pa;
        _badB = pb;
        _badCellA = a;
        _badCellB = b;
        _badT = 0;
    }

    /// <summary>只給截圖與示範用：直接發動某件神器（遊戲中神器是充滿後自動發動）。</summary>
    private void UseArtifact(int index)
    {
        if (!CanInput || index is < 0 or > 5 || !_s!.UseArtifact(index)) return;
        StartCutIn(index);
        _pumping = true;
    }

    /// <summary>只給截圖與示範用：直接放妖精的光耀。</summary>
    private void UseGlitter()
    {
        if (!CanInput || !_s!.UseGlitter()) return;
        StartCutIn(-1, -1, true);
        _pumping = true;
    }

    /// <summary>只給截圖與示範用：直接放某個合體魔法。</summary>
    private void UseUnison(int unison)
    {
        if (!CanInput || !_s!.UseUnison(unison)) return;
        StartCutIn(Levels.Unisons[unison].A, unison);
        _pumping = true;
    }

    /// <summary>必殺技特寫：盤面靜止約一秒，招式名「蓋章」完才開始演出。合體魔法是兩件神器並排的雙色分鏡。</summary>
    private void StartCutIn(int index, int unison = -1, bool glitter = false)
    {
        // 第一次完整播；同一關再發動同一招時，直接從招式名蓋好的那一刻開始（約 0.7 秒）。
        // 妖精的光耀每次都完整播。
        bool repeat = !glitter && !_cutSeen.Add(unison >= 0 ? 100 + unison : index);
        _cut = repeat ? 0.45f : 0;
        _cutOn = true;
        _bannerSkill = index;
        bool boost = !glitter && unison < 0 && _s!.Boosted[index];
        bool big = boost || unison >= 0 || glitter;
        BuildCutLayers(index, boost, unison, glitter);
        Sound.Play(Snd.Skill);
        if (unison >= 0 || glitter) Sound.Play(Snd.Charge, 0.9f, 0, 0.8);
        if (glitter) After(0.12f, () => Sound.Play(Snd.Core, 1, 0, 0.7));
        After(Math.Max(0, 0.31f - _cut), () =>
        {
            Sound.Play(Snd.BossHit, 1, 0, 0.6);
            if (big) Sound.Play(Snd.Star, 0.9f, 0, 0.9);
            if (unison >= 0 || glitter) Sound.Play(Snd.Boom, 0.9f, 0, 0.7);
            _shake = Math.Max(_shake, unison >= 0 || glitter ? 1 : boost ? 0.8f : 0.5f);
        });
        _waitSettle = false;
        _wait = CutLength - 0.12f - _cut;
        _hint = null;
        _sel = null;
        _idle = 0;
    }

    // ───────────────────────── 把規則的結果演出來 ─────────────────────────

    private static readonly int[] ChainSteps = { 0, 2, 4, 5, 7, 9, 11, 12, 14, 16 };

    private void Shout(string text, float x, float y, Color color, float delay, float size = 44)
    {
        _texts.Add(new FloatText
        {
            S = text, X = x, Y = y, C = color, Size = size, Max = 0.8f, Delay = delay, Shout = true,
            Angle = -12 + (float)_rng.NextDouble() * 24,
        });
    }

    private void ShowClear(StepResult res)
    {
        const float wave = 0.055f;
        if (res.Glitter) ShowGlitter(res);
        else if (res.Unison >= 0) ShowUnison(res);
        else if (res.Skill >= 0) ShowSkill(res);

        // ラストラッシュ：每扣一步，就有一道金光從步數圓牌飛到被變成特殊糖晶的那一格，抵達才爆開。
        float lead = 0;
        if (_s!.Finale && res.Created.Count > 0)
        {
            lead = 0.28f;
            foreach (CellHit made in res.Created)
            {
                PointF to = Center(made.C, made.R);
                _orbs.Add(new Orb { X0 = 176, Y0 = 434, X1 = to.X, Y1 = to.Y, Max = lead, C = Gold });
            }

            _texts.Add(new FloatText { S = $"-{res.Created.Count}", X = 240, Y = 400, C = Gold, Size = 34, Max = 0.8f });
            _movesPop = 1;
        }
        float sumX = 0, sumY = 0;
        int count = 0;
        bool stone = false;
        foreach (Removed rm in res.Removed)
        {
            _ghosts.Add(new Ghost { P = rm.Piece, X = rm.C, Y = rm.R, Delay = rm.Wave * wave + lead });
            sumX += rm.C;
            sumY += rm.R;
            count++;
            if (rm.Piece.Kind == PieceKind.Stone) stone = true;
        }

        bool row = false, area = false, beam = false, bolt = false, all = false;
        foreach (Blast b in res.Blasts)
        {
            PointF at = Center(b.C, b.R);
            Color color = Art.Main[(int)b.Element];
            float delay = b.Wave * wave + lead;
            switch (b.Kind)
            {
                case BlastKind.Row:
                case BlastKind.Col:
                    _fx.Add(new Fx { Kind = b.Kind == BlastKind.Row ? FxKind.Row : FxKind.Col, X = at.X, Y = at.Y, C = color, Delay = delay, Max = 0.36f });
                    if (!row && res.Skill < 0) Shout("ズバッ!", at.X, at.Y - 26, color, delay);
                    row = true;
                    break;
                case BlastKind.Area:
                    _fx.Add(new Fx { Kind = FxKind.Ring, X = at.X, Y = at.Y, C = color, Delay = delay, Size = (b.Size * 2 + 1) * CS * 0.72f, Max = 0.4f });
                    if (!area && res.Skill < 0) Shout("ドン!!", at.X, at.Y - 30, color, delay, 50);
                    area = true;
                    break;
                case BlastKind.Beam:
                {
                    PointF from = Center(b.FromC, b.FromR);
                    _fx.Add(new Fx { Kind = FxKind.Beam, X = from.X, Y = from.Y, X2 = at.X, Y2 = at.Y, C = color, Delay = delay, Max = 0.3f });
                    beam = true;
                    break;
                }
                case BlastKind.Bolt:
                    // 絕對冰結與全天星辰用的是自己的演出，不畫閃電。
                    // 沙暴合體魔法也一樣。
                    if (res.Unison >= 1 || (res.Unison < 0 && res.Skill is 1 or 4)) break;
                    _fx.Add(new Fx { Kind = FxKind.Bolt, X = at.X, Y = at.Y, C = color, Delay = delay, Max = 0.3f, Seed = _rng.Next() });
                    bolt = true;
                    break;
                default:
                    _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.White, Max = 0.6f });
                    _fx.Add(new Fx { Kind = FxKind.Ring, X = at.X, Y = at.Y, C = Color.White, Size = 700, Max = 0.7f });
                    Shout("ドォォン!!", BX + 288, BY + 250, Color.FromArgb(255, 214, 50), 0, 76);
                    all = true;
                    break;
            }
        }

        foreach (CellHit j in res.JellyHits)
        {
            PointF at = Center(j.C, j.R);
            _fx.Add(new Fx { Kind = FxKind.Jelly, X = at.X, Y = at.Y, C = Color.FromArgb(255, 120, 190), Delay = j.Wave * wave + lead, Max = 0.3f });
        }

        foreach (CellHit u in res.Unfrozen)
        {
            PointF at = Center(u.C, u.R);
            _fx.Add(new Fx { Kind = FxKind.Ice, X = at.X, Y = at.Y, C = Color.FromArgb(190, 236, 255), Delay = u.Wave * wave + lead, Max = 0.35f });
        }

        foreach (CellHit made in res.Created)
        {
            PointF at = Center(made.C, made.R);
            _fx.Add(new Fx { Kind = FxKind.Spark, X = at.X, Y = at.Y, C = Color.FromArgb(255, 236, 120), Delay = 0.08f + lead, Max = 0.45f });
        }

        // 清除音效：連鎖越深音越高。
        if (res.Removed.Count > 0 || res.Unfrozen.Count > 0)
        {
            int step = ChainSteps[Math.Clamp(res.Chain - 1, 0, ChainSteps.Length - 1)];
            float pan = count > 0 ? (sumX / count - 4) / 6f : 0;
            Sound.Play(Snd.Match, 0.95f, pan, Math.Pow(2, step / 12.0));
        }

        if (row) Sound.Play(Snd.Slash, 0.8f);
        if (area || all) Sound.Play(Snd.Boom, all ? 1 : 0.85f);
        if (beam || all) Sound.Play(Snd.Core, 0.85f);
        if (bolt) Sound.Play(Snd.Bolt, 0.8f);
        if (res.JellyHits.Count > 0) Sound.Play(Snd.Jelly, 0.75f);
        if (res.Unfrozen.Count > 0) Sound.Play(Snd.Crack, 0.8f);
        if (stone) Sound.Play(Snd.Rock, 0.8f);
        if (res.Created.Count > 0) Sound.Play(Snd.Special, 0.8f);
        // 大爆炸瞬間定格一下（必殺技有自己的特寫，不再定格）。
        if (res.Skill < 0 && (all || area)) _hitStop = Math.Max(_hitStop, all ? 0.12f : 0.06f);
        if (all) _shake = 1;
        else if (area) _shake = Math.Max(_shake, 0.5f);
        else if (row || bolt) _shake = Math.Max(_shake, 0.22f);

        if (res.ScoreGain > 0 && count > 0)
        {
            PointF at = Center(sumX / count, sumY / count);
            _texts.Add(new FloatText
            {
                S = "+" + res.ScoreGain, X = at.X, Y = at.Y - 8, C = Color.White, Size = res.ScoreGain >= 3000 ? 34 : 26, Max = 0.9f,
            });
        }

        if (res.Chain >= 2)
        {
            _chainShown = res.Chain;
            _chainPop = 1;
            if (res.Chain >= 3)
                Shout($"{res.Chain}連鎖!", BX + 288, BY + 70, Art.Main[(res.Chain + 2) % 6], 0.05f, Math.Min(74, 40 + res.Chain * 4));

            // 連鎖喝采：越長越誇張，配上集中線與定格。
            string? cheer = res.Chain switch { 3 => "ナイス!", 5 => "グレート!!", 8 => "すごすぎ!!!", 12 => "神!!!!", _ => null };
            if (cheer != null)
            {
                Shout(cheer, BX + 288, BY + 440, Art.Main[res.Chain * 2 % 6], 0.12f, 50 + res.Chain * 3);
                _fx.Add(new Fx { Kind = FxKind.Lines, X = BX + 288, Y = BY + 288, C = Art.Light[res.Chain % 6], Max = 0.55f, Seed = _rng.Next() });
                Sound.Play(Snd.Star, 0.85f, 0, 1 + res.Chain * 0.05);
                if (res.Chain >= 8) _hitStop = Math.Max(_hitStop, 0.08f);
            }
        }

        foreach (int artifact in res.ChargedFull)
        {
            _slotFlash[artifact] = 1;
            Sound.Play(Snd.Charge, 0.9f, 0.5f);
        }

        if (res.Damage > 0)
        {
            // 魔王戰：消掉的糖晶化成光彈飛去打魔王。
            _bossHitPlayed = false;
            int sent = 0;
            foreach (Removed rm in res.Removed)
            {
                if (rm.Piece.Kind != PieceKind.Candy || sent >= 12) continue;
                PointF from = Center(rm.C, rm.R);
                _orbs.Add(new Orb
                {
                    X0 = from.X, Y0 = from.Y, X1 = BossX + _rng.Next(-40, 41), Y1 = BossY + _rng.Next(-50, 51),
                    Delay = rm.Wave * wave + lead + sent * 0.02f, C = Art.Main[(int)rm.Piece.Element], HitsBoss = true,
                });
                sent++;
            }

            _texts.Add(new FloatText
            {
                S = "-" + res.Damage, X = BossX + _rng.Next(-30, 31), Y = BossY - 60, C = Color.FromArgb(255, 236, 120),
                Size = res.Damage >= 800 ? 46 : 34, Max = 1.1f, Delay = 0.45f, Shout = true,
            });
        }
    }

    private void ShowCollect(StepResult res)
    {
        Sound.Play(Snd.ShardCollect, 1);
        foreach (CellHit hit in res.Collected)
        {
            PointF at = Center(hit.C, hit.R);
            _fx.Add(new Fx { Kind = FxKind.Spark, X = at.X, Y = at.Y, C = Color.FromArgb(255, 236, 120), Max = 0.5f, Size = 90 });
            _orbs.Add(new Orb { X0 = at.X, Y0 = at.Y, X1 = 56, Y1 = ShardGoalY, Max = 0.6f, C = Color.FromArgb(255, 214, 50), Sprite = Art.ShardSprite });
            _texts.Add(new FloatText { S = "+1000", X = at.X, Y = at.Y - 30, C = Color.FromArgb(255, 236, 120), Size = 30, Max = 1 });
            Burst(at.X, at.Y, Color.FromArgb(255, 226, 90), 16, 260, true);
        }
    }

    private void ShowBossAttack(StepResult res)
    {
        _bossAct = 1;
        _shake = Math.Max(_shake, 0.4f);
        Sound.Play(Snd.BossAttack, 0.95f, 0.4f);
        Color color = res.Attack switch
        {
            BossAttackKind.Freeze => Color.FromArgb(150, 226, 255),
            BossAttackKind.Stone => Color.FromArgb(255, 120, 70),
            _ => Color.FromArgb(190, 110, 255),
        };
        _bossCall = res.Attack switch
        {
            BossAttackKind.Freeze => "黑龍降下「終焉的黑羽」！糖晶被封住了",
            BossAttackKind.Stone => "黑龍發出「黑龍的咆哮」！糖晶化為岩石",
            _ => "黑龍發動「黑龍的吞噬」！傷勢復原、充能被吞",
        };
        Toast(_bossCall, 2.8f);
        if (res.Attack == BossAttackKind.Stone)
        {
            // 黑龍的咆哮：盤面一瞬間被黑色的咆哮罩住。
            _fx.Add(new Fx { Kind = FxKind.Veil, C = Color.FromArgb(10, 4, 20), Size = 200, Max = 1.0f });
            Shout("ゴゴゴゴ…", BX + 288, BY + 86, Color.FromArgb(190, 110, 255), 0.1f, 64);
        }
        else if (res.Attack == BossAttackKind.Drain)
        {
            // 黑龍的吞噬：魔王身上展開吞噬的魔法陣，血量回復，神器欄閃一下表示充能被奪走。
            _fx.Add(new Fx { Kind = FxKind.Circle, X = BossX, Y = BossY + 10, C = Color.FromArgb(190, 110, 255), Size = 150, Max = 1.2f });
            _fx.Add(new Fx { Kind = FxKind.Veil, C = Color.FromArgb(120, 60, 200), Size = 90, Max = 1.0f });
            for (int i = 0; i < 6; i++) _slotFlash[i] = 1;
            if (res.Heal > 0)
            {
                _texts.Add(new FloatText
                {
                    S = "+" + res.Heal, X = BossX, Y = BossY - 70, C = Color.FromArgb(120, 255, 150), Size = 44, Max = 1.3f, Delay = 0.3f, Shout = true,
                });
            }

            Sound.Play(Snd.Charge, 0.9f, 0.4f, 0.5);
        }
        else
        {
            _fx.Add(new Fx { Kind = FxKind.Circle, X = BossX, Y = BossY + 10, C = color, Size = 130, Max = 0.9f });
        }

        foreach (CellHit hit in res.Afflicted)
        {
            PointF at = Center(hit.C, hit.R);
            _fx.Add(new Fx { Kind = FxKind.Zap, X = BossX, Y = BossY, X2 = at.X, Y2 = at.Y, C = color, Delay = 0.25f, Max = 0.4f });
            _fx.Add(new Fx { Kind = FxKind.Ice, X = at.X, Y = at.Y, C = color, Delay = 0.5f, Max = 0.4f });
        }

        Sound.Play(res.Attack == BossAttackKind.Stone ? Snd.Rock : Snd.Freeze, 0.7f);
    }

    private void Burst(float x, float y, Color color, int count, float speed, bool stars = false)
    {
        for (int i = 0; i < count; i++)
        {
            double a = _rng.NextDouble() * Math.PI * 2;
            float v = speed * (0.35f + (float)_rng.NextDouble() * 0.65f);
            _parts.Add(new Particle
            {
                X = x, Y = y, VX = (float)Math.Cos(a) * v, VY = (float)Math.Sin(a) * v - 40,
                Max = 0.35f + (float)_rng.NextDouble() * 0.3f, Size = 3 + (float)_rng.NextDouble() * 5,
                C = _rng.Next(4) == 0 ? Color.White : color, Star = stars && i % 2 == 0, G = 420,
            });
        }
    }

    /// <summary>過幾秒後再做某件事（延後的音效、震動、特效），讓必殺技的演出有節奏。</summary>
    private void After(float delay, Action action) => _later.Add((_time + delay, action));

    private void UpdateEffects(float dt)
    {
        for (int i = _later.Count - 1; i >= 0; i--)
        {
            if (_time < _later[i].At) continue;
            Action action = _later[i].Do;
            _later.RemoveAt(i);
            action();
        }

        for (int i = _ghosts.Count - 1; i >= 0; i--)
        {
            Ghost ghost = _ghosts[i];
            if (ghost.Delay > 0)
            {
                ghost.Delay -= dt;
                continue;
            }

            if (!ghost.Started)
            {
                ghost.Started = true;
                PointF at = Center(ghost.X, ghost.Y);
                Color color = ghost.P.Kind switch
                {
                    PieceKind.Stone => Color.FromArgb(150, 148, 170),
                    PieceKind.Shard => Color.FromArgb(255, 214, 50),
                    _ => ghost.P.Special == Special.Core ? Color.White : Art.Main[(int)ghost.P.Element],
                };
                Burst(at.X, at.Y, color, ghost.P.Special != Special.None ? 12 : 7, 210);
            }

            ghost.T += dt / 0.22f;
            if (ghost.T >= 1) _ghosts.RemoveAt(i);
        }

        for (int i = _parts.Count - 1; i >= 0; i--)
        {
            Particle p = _parts[i];
            if (p.Delay > 0)
            {
                p.Delay -= dt;
                _parts[i] = p;
                continue;
            }

            p.Life += dt;
            if (p.Life >= p.Max)
            {
                _parts.RemoveAt(i);
                continue;
            }

            p.VY += p.G * dt;
            p.X += p.VX * dt;
            p.Y += p.VY * dt;
            _parts[i] = p;
        }

        for (int i = _texts.Count - 1; i >= 0; i--)
        {
            FloatText text = _texts[i];
            if (text.Delay > 0)
            {
                text.Delay -= dt;
                continue;
            }

            text.T += dt;
            if (!text.Shout) text.Y -= 46 * dt;
            if (text.T >= text.Max) _texts.RemoveAt(i);
        }

        for (int i = _fx.Count - 1; i >= 0; i--)
        {
            Fx fx = _fx[i];
            if (fx.Delay > 0)
            {
                fx.Delay -= dt;
                continue;
            }

            fx.T += dt;
            if (fx.T >= fx.Max) _fx.RemoveAt(i);
        }

        for (int i = _orbs.Count - 1; i >= 0; i--)
        {
            Orb orb = _orbs[i];
            if (orb.Delay > 0)
            {
                orb.Delay -= dt;
                continue;
            }

            orb.T += dt;
            if (orb.T < orb.Max) continue;
            _orbs.RemoveAt(i);
            if (!orb.HitsBoss) continue;
            _bossFlash = 1;
            Burst(orb.X1, orb.Y1, orb.C, 5, 180);
            if (_bossHitPlayed) continue;
            _bossHitPlayed = true;
            Sound.Play(Snd.BossHit, 0.85f, 0.5f);
        }
    }

    // ───────────────────────── 過關與失敗 ─────────────────────────

    private void BeginEnd()
    {
        _ending = true;
        _endTimer = 0;
        _endSpawn = 0;
        _hint = null;
        _sel = null;
        Sound.Music(-1);
        if (_s!.State == PlayState.Won)
        {
            int n = _level.Number;
            _wonStars = _s.Stars;
            // 展示模式的結果不算進存檔。
            _firstClear = !_demo && n > _progress.Cleared;
            _newReward = _firstClear ? _level.Reward : -1;
            if (!_demo)
            {
                _progress.Cleared = Math.Max(_progress.Cleared, n);
                _progress.Best[n - 1] = Math.Max(_progress.Best[n - 1], _s.Score);
                _progress.Stars[n - 1] = Math.Max(_progress.Stars[n - 1], _wonStars);
                if (!_headless) _progress.Save();
            }
            if (_s.IsBoss)
            {
                Sound.Play(Snd.BossDie, 1);
                Shout("ドォォォン!!", BX + 288, BY + 260, Color.FromArgb(255, 214, 50), 1.7f, 96);
            }
            else
            {
                Sound.Play(Snd.Win, 0.9f);
                Shout("クリア!", BX + 288, BY + 260, Color.FromArgb(255, 214, 50), 0, 96);
            }
        }
        else
        {
            Sound.Play(Snd.Lose, 0.9f);
        }
    }

    private void EndSequence(float dt)
    {
        _endTimer += dt;
        _endSpawn -= dt;
        bool won = _s!.State == PlayState.Won;
        float length = !won ? 0.9f : _s.IsBoss ? FinaleStart + FinaleLength : 1.4f;
        if (won && _s.IsBoss)
        {
            // 魔王被打倒：身上連續爆炸，最後一發最大。
            if (_endSpawn <= 0 && _endTimer < 2.6f)
            {
                _endSpawn = _endTimer < 1.7f ? 0.14f : 0.07f;
                float x = BossX + _rng.Next(-110, 111), y = BossY + _rng.Next(-130, 131);
                Color color = Art.Main[_rng.Next(6)];
                _fx.Add(new Fx { Kind = FxKind.Ring, X = x, Y = y, C = color, Size = 60 + _rng.Next(90), Max = 0.4f });
                Burst(x, y, color, 14, 320, true);
                _bossFlash = 1;
                _shake = Math.Max(_shake, _endTimer < 1.7f ? 0.5f : 1f);
            }

            if (_endTimer >= FinaleStart && _endTimer - dt < FinaleStart)
            {
                Sound.Play(Snd.Star, 1, 0, 0.8);
                Sound.Play(Snd.Core, 1, 0, 0.7);
            }

            if (_endTimer >= FinaleStart + 0.55f && _endTimer - dt < FinaleStart + 0.55f) Sound.Play(Snd.Boom, 0.8f, 0, 1.2);
            if (_endTimer >= FinaleStart + 0.9f && _endTimer - dt < FinaleStart + 0.9f) Sound.Play(Snd.Star, 1, 0, 1.1);

            if (_endTimer >= 1.7f && _endTimer - dt < 1.7f)
            {
                _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.White, Max = 0.9f });
                _fx.Add(new Fx { Kind = FxKind.Ring, X = BossX, Y = BossY, C = Color.White, Size = 900, Max = 0.9f });
                _shake = 1.4f;
            }
        }
        else if (won && _endSpawn <= 0)
        {
            _endSpawn = 0.1f;
            Burst(BX + _rng.Next(576), BY + _rng.Next(200), Art.Main[_rng.Next(6)], 12, 300, true);
        }

        if (_endTimer < length) return;
        _ending = false;
        if (won && _s.IsBoss)
        {
            // 魔王：金色徽章之後接片尾名單，名單結束才跳出過關畫面。
            StartCredits(false);
            return;
        }

        _overlay = won ? Overlay.Win : Overlay.Lose;
        _overlayT = _time;
        if (won) Sound.Play(Snd.Star, 0.8f);
    }

    private void AfterWin()
    {
        if (_demo)
        {
            OpenDemo();
            return;
        }

        int next = _level.Number;
        GoMap();
        if (next < Levels.Count) OpenIntro(next);
    }

    // ───────────────────────── 畫盤面 ─────────────────────────

    private void BuildPlayLayer()
    {
        _playLayer?.Dispose();
        Bitmap source = _s!.IsBoss ? _bgBoss : _bgNormal;
        _playLayer = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppPArgb);
        using Graphics g = Graphics.FromImage(_playLayer);
        Blit(g, source);
        Art.Setup(g);
        g.ScaleTransform(S, S);

        Art.Panel(g, new RectangleF(16, 16, 320, 768), Art.Paper);
        Art.Panel(g, new RectangleF(352, 16, 576, 160), Art.Paper);
        Art.Panel(g, new RectangleF(944, 16, 320, 768), Art.Paper);

        Art.Panel(g, new RectangleF(BX - 12, BY - 12, CS * 9 + 24, CS * 9 + 24), Color.FromArgb(240, 8, 9, 24), 12, 8);
        for (int c = 0; c < Board.N; c++)
        {
            for (int r = 0; r < Board.N; r++)
            {
                Color tile = (c + r) % 2 == 0 ? Color.FromArgb(26, 28, 58) : Color.FromArgb(32, 34, 68);
                Art.Fill(g, tile, new RectangleF(BX + c * CS + 2, BY + r * CS + 2, CS - 4, CS - 4), 10);
            }
        }

        DrawHudStatic(g);
        _hudLayer?.Dispose();
        _hudLayer = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppPArgb);
        _hudFrame = 0;
    }

    /// <summary>
    /// 記分板不需要每一格都重畫：每三格才把「底圖 + 記分板」重新合成一次，其餘時間直接貼這張合成好的圖。
    /// 盤面上的糖晶和特效仍然每一格都畫，所以動作一樣流暢。
    /// </summary>
    private void RefreshHud()
    {
        using Graphics g = Graphics.FromImage(_hudLayer!);
        Blit(g, _playLayer!);
        Art.Setup(g);
        g.ScaleTransform(S, S);
        DrawHud(g);
    }

    private static GraphicsState BeginStamps(Graphics g)
    {
        GraphicsState state = g.Save();
        g.ResetTransform();
        g.InterpolationMode = InterpolationMode.NearestNeighbor;
        return state;
    }

    /// <summary>把預先依螢幕比例畫好的小圖原尺寸貼上（不縮放），要先呼叫 <see cref="BeginStamps"/>。</summary>
    private void Stamp(Graphics g, Bitmap sprite, float cx, float cy) =>
        g.DrawImage(sprite, new Rectangle(
            (int)MathF.Round(cx * S - sprite.Width / 2f), (int)MathF.Round(cy * S - sprite.Height / 2f),
            sprite.Width, sprite.Height));

    private bool Animated(Piece p, int c, int r) =>
        p.Pop > 0 || p.Squash > 0 || p.Special != Special.None ||
        (_hover is Point hv && hv.X == c && hv.Y == r) ||
        (_downCell is Point dc && dc.X == c && dc.Y == r) ||
        (_sel is Point sel && sel.X == c && sel.Y == r) ||
        (_hint is Move h && ((h.A.X == c && h.A.Y == r) || (h.B.X == c && h.B.Y == r)));

    private void DrawPlay(Graphics g)
    {
        if (_s == null || _playLayer == null || _hudLayer == null) return;
        _hover = CanInput ? CellAt(_mouse) : null;
        float shakeX = 0, shakeY = 0;
        if (_shake > 0)
        {
            shakeX = (float)(_rng.NextDouble() - 0.5) * 16 * Math.Min(1, _shake);
            shakeY = (float)(_rng.NextDouble() - 0.5) * 16 * Math.Min(1, _shake);
        }

        if (_hudFrame++ % 4 == 0) RefreshHud();
        Blit(g, _hudLayer, shakeX * S, shakeY * S);
        if (_s.PhaseTwo) DrawPhaseTwoTint(g);
        GraphicsState shaken = g.Save();
        g.TranslateTransform(shakeX, shakeY);

        Board board = _s.Board;
        GraphicsState clip = g.Save();
        g.SetClip(BoardRect, CombineMode.Intersect);

        GraphicsState stamps = BeginStamps(g);
        for (int c = 0; c < Board.N; c++)
            for (int r = 0; r < Board.N; r++)
                if (board.Jelly[c, r] > 0)
                {
                    PointF at = Center(c, r);
                    Stamp(g, Art.JellySprite(board.Jelly[c, r]), at.X + shakeX, at.Y + shakeY);
                }

        g.Restore(stamps);

        // 滑鼠所在的格子亮一層白色底光。
        if (_hover is Point lit)
            Art.Fill(g, Color.FromArgb((int)(70 + 30 * Math.Sin(_time * 6)), 255, 255, 255),
                new RectangleF(BX + lit.X * CS + 3, BY + lit.Y * CS + 3, CS - 6, CS - 6), 12);

        // 提示的兩格與選取的那一格先畫底光。
        if (_hint is Move hint)
        {
            float glow = 0.5f + 0.5f * (float)Math.Sin(_time * 7);
            foreach (Point p in new[] { hint.A, hint.B })
                Art.Fill(g, Color.FromArgb((int)(90 + 110 * glow), 255, 236, 120),
                    new RectangleF(BX + p.X * CS + 3, BY + p.Y * CS + 3, CS - 6, CS - 6), 12);
        }

        // 靜止或單純在掉落的糖晶直接原尺寸貼圖（最快），有縮放動畫的留到下一輪。
        stamps = BeginStamps(g);
        for (int r = Board.N - 1; r >= 0; r--)
        {
            for (int c = 0; c < Board.N; c++)
            {
                Piece? p = board.Cells[c, r];
                if (p == null || Animated(p, c, r)) continue;
                float x = BX + p.X * CS + CS / 2f + shakeX, y = BY + p.Y * CS + CS / 2f + shakeY;
                Stamp(g, Art.SpriteOf(p), x, y);
                if (p.Frozen) Stamp(g, p.ThickIce ? Art.ThickIceSprite : Art.IceSprite, x, y);
            }
        }

        g.Restore(stamps);

        for (int r = Board.N - 1; r >= 0; r--)
        {
            for (int c = 0; c < Board.N; c++)
            {
                Piece? p = board.Cells[c, r];
                if (p == null || !Animated(p, c, r)) continue;
                float x = BX + p.X * CS + CS / 2f, y = BY + p.Y * CS + CS / 2f;
                float scale = 1;
                if (p.Pop > 0) scale += (float)Math.Sin(p.Pop * Math.PI) * 0.45f;
                if (p.Special != Special.None) scale += 0.04f * (float)Math.Sin(_time * 6 + c + r);
                bool hinted = _hint is Move h && ((h.A.X == c && h.A.Y == r) || (h.B.X == c && h.B.Y == r));
                if (hinted) scale += 0.09f * (float)Math.Sin(_time * 9);
                if (_sel is Point sel && sel.X == c && sel.Y == r) scale += 0.1f;

                // 滑鼠移到糖晶上會微微放大；按住拖曳時糖晶會跟著手往那個方向偏過去。
                if (_hover is Point hv && hv.X == c && hv.Y == r) scale += 0.07f + 0.02f * (float)Math.Sin(_time * 8);
                if (_downCell is Point dc && dc.X == c && dc.Y == r)
                {
                    float dx = _mouse.X - _downAt.X, dy = _mouse.Y - _downAt.Y;
                    if (Math.Abs(dx) > Math.Abs(dy)) x += Math.Clamp(dx, -CS * 0.32f, CS * 0.32f);
                    else y += Math.Clamp(dy, -CS * 0.32f, CS * 0.32f);
                }
                float squash = (float)Math.Sin(p.Squash * Math.PI) * 0.16f;
                Art.Draw(g, Art.SpriteOf(p), x, y + squash * 10, Art.Sprite * scale, 1, 1 + squash, 1 - squash);
                if (p.Frozen) Art.Draw(g, p.ThickIce ? Art.ThickIceSprite : Art.IceSprite, x, y);
            }
        }

        DrawPortals(g);
        DrawWind(g);

        foreach (Ghost ghost in _ghosts)
        {
            PointF at = Center(ghost.X, ghost.Y);
            if (!ghost.Started)
            {
                Art.Draw(g, Art.SpriteOf(ghost.P), at.X, at.Y);
                continue;
            }

            float t = ghost.T;
            float scale = t < 0.3f ? 1 + t * 1.2f : 1.36f * (1 - (t - 0.3f) / 0.7f);
            Art.Disc(g, Color.FromArgb((int)(200 * (1 - t)), 255, 255, 255), 0, at.X, at.Y, 30 * (0.6f + t));
            Art.Draw(g, Art.SpriteOf(ghost.P), at.X, at.Y, Art.Sprite * Math.Max(0.05f, scale), 1 - t * 0.6f);
        }

        foreach (Fx fx in _fx)
            if (fx.Delay <= 0 && OnBoard(fx.Kind))
                DrawFx(g, fx);
        g.Restore(clip);

        // FEVER 中盤面外框變成流動的彩虹。
        if (_s.FeverActive)
        {
            var frame = new RectangleF(BX - 9, BY - 9, CS * 9 + 18, CS * 9 + 18);
            using GraphicsPath path = Art.Round(frame, 16);
            for (int k = 0; k < 3; k++)
            {
                using var pen = new Pen(Hue(_time * 0.6f + k * 0.12f), 7 - k * 2) { LineJoin = LineJoin.Round };
                g.DrawPath(pen, path);
                frame.Inflate(-3, -3);
            }
        }

        if (_sel is Point selected)
        {
            float pulse = 0.5f + 0.5f * (float)Math.Sin(_time * 10);
            using GraphicsPath path = Art.Round(new RectangleF(BX + selected.X * CS + 1, BY + selected.Y * CS + 1, CS - 2, CS - 2), 12);
            using var ink = new Pen(Art.Ink, 6.5f);
            using var white = new Pen(Art.Mix(Color.White, Color.FromArgb(255, 236, 120), pulse), 3.5f);
            g.DrawPath(ink, path);
            g.DrawPath(white, path);
        }

        if (_hint is Move arrow)
        {
            // 提示：一隻會動的箭頭指出該往哪邊滑。
            PointF a = Center(arrow.A.X, arrow.A.Y), b = Center(arrow.B.X, arrow.B.Y);
            float slide = 0.5f + 0.5f * (float)Math.Sin(_time * 6);
            float mx = a.X + (b.X - a.X) * (0.3f + 0.4f * slide), my = a.Y + (b.Y - a.Y) * (0.3f + 0.4f * slide);
            float angle = (float)(Math.Atan2(b.Y - a.Y, b.X - a.X) * 180 / Math.PI);
            GraphicsState state = g.Save();
            g.TranslateTransform(mx, my);
            g.RotateTransform(angle);
            Art.Poly(g, Color.FromArgb(255, 236, 120), 3.2f, -16, -8, 2, -8, 2, -18, 22, 0, 2, 18, 2, 8, -16, 8);
            g.Restore(state);
        }

        foreach (Fx fx in _fx)
            if (fx.Delay <= 0 && !OnBoard(fx.Kind))
                DrawFx(g, fx);

        foreach (Particle p in _parts)
        {
            if (p.Delay > 0) continue;
            float life = 1 - p.Life / p.Max;
            Color color = Art.Alpha(p.C, (int)(255 * Math.Min(1, life * 2)));
            if (p.Star)
            {
                using var brush = new SolidBrush(color);
                g.FillPolygon(brush, Art.StarPoints(p.X, p.Y, p.Size * 1.7f * life + 1, p.Size * 0.45f * life + 0.4f, 4, p.Life * 400));
            }
            else
            {
                Art.Disc(g, color, 0, p.X, p.Y, p.Size * (0.4f + 0.6f * life));
            }
        }

        g.Restore(shaken);

        foreach (Orb orb in _orbs)
        {
            if (orb.Delay > 0) continue;
            float t = orb.T / orb.Max, ease = t * t * (3 - 2 * t);
            float x = orb.X0 + (orb.X1 - orb.X0) * ease;
            float y = orb.Y0 + (orb.Y1 - orb.Y0) * ease - (float)Math.Sin(t * Math.PI) * 90;
            if (orb.Sprite != null)
            {
                Art.Draw(g, orb.Sprite, x, y, Art.Sprite * (1 - 0.4f * t));
                continue;
            }

            Art.Disc(g, Art.Alpha(orb.C, 110), 0, x, y, 15);
            Art.Disc(g, orb.C, 2.4f, x, y, 9);
            Art.Disc(g, Color.White, 0, x - 2, y - 2, 3.5f);
        }

        foreach (FloatText text in _texts)
        {
            if (text.Delay > 0) continue;
            float t = text.T / text.Max;
            int alpha = (int)(255 * Math.Min(1, (1 - t) * 3));
            if (text.Shout)
            {
                // 漫畫狀聲字：先彈大再縮回，帶一點傾斜。
                float scale = t < 0.18f ? 0.4f + t / 0.18f * 0.9f : 1.3f - Math.Min(0.3f, (t - 0.18f) * 1.5f);
                Art.Outlined(g, text.S, text.Size, Art.Alpha(text.C, alpha), Art.Alpha(Art.Ink, alpha), text.Size * 0.2f,
                    text.X, text.Y, 1, text.Angle, scale);
            }
            else
            {
                Art.Outlined(g, text.S, text.Size, Art.Alpha(text.C, alpha), Art.Alpha(Art.Ink, alpha), 6, text.X, text.Y);
            }
        }

        // 剩三步以內，畫面四周泛紅、跟著心跳脈動。
        if (_s.State == PlayState.Playing && !_s.Finale && _s.Moves is > 0 and <= 3 && !_ending)
        {
            int alpha = (int)(60 + 50 * Math.Sin(_time * 7));
            using var pen = new Pen(Color.FromArgb(alpha, 255, 40, 50), 34);
            g.DrawRectangle(pen, 0, 0, W, H);
        }

        if (_qteOn) DrawQte(g);
        if (_cutOn && (_bannerSkill >= 0 || _cutGlitter)) DrawCutIn(g);
        if (_tcutOn) DrawTransformCut(g);
        if (_ending && _s.IsBoss && _s.State == PlayState.Won && _endTimer >= FinaleStart) DrawFairyFinale(g, _endTimer - FinaleStart);
    }

    private void ShowFever()
    {
        Shout("FAIRY FEVER!!", BX + 288, BY + 250, Gold, 0, 76);
        Shout("3 手間スコア×2", BX + 288, BY + 330, Color.White, 0.25f, 42);
        _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 236, 160), Max = 0.45f });
        _fx.Add(new Fx { Kind = FxKind.Lines, X = BX + 288, Y = BY + 288, C = Gold, Max = 0.8f, Seed = _rng.Next() });
        Sound.Play(Snd.Win, 0.85f, 0, 1.15);
        _shake = Math.Max(_shake, 0.6f);
    }

    /// <summary>色相循環：0–1 對應一圈彩虹。</summary>
    private static Color Hue(float h)
    {
        h = (h % 1 + 1) % 1 * 6;
        float x = 1 - Math.Abs(h % 2 - 1);
        (float r, float g, float b) = (int)h switch
        {
            0 => (1f, x, 0f), 1 => (x, 1f, 0f), 2 => (0f, 1f, x), 3 => (0f, x, 1f), 4 => (x, 0f, 1f), _ => (1f, 0f, x),
        };
        return Color.FromArgb((int)(255 * (0.35f + 0.65f * r)), (int)(255 * (0.35f + 0.65f * g)), (int)(255 * (0.35f + 0.65f * b)));
    }

    private void DrawFx(Graphics g, Fx fx)
    {
        float t = Math.Clamp(fx.T / fx.Max, 0, 1), fade = 1 - t;
        switch (fx.Kind)
        {
            case FxKind.Row:
            case FxKind.Col:
            {
                float reach = Math.Min(1, t * 2.6f) * 600, thick = 46 * fade + 4;
                bool row = fx.Kind == FxKind.Row;
                RectangleF outer = row
                    ? new RectangleF(fx.X - reach, fx.Y - thick / 2, reach * 2, thick)
                    : new RectangleF(fx.X - thick / 2, fx.Y - reach, thick, reach * 2);
                RectangleF inner = row
                    ? new RectangleF(fx.X - reach, fx.Y - thick * 0.22f, reach * 2, thick * 0.44f)
                    : new RectangleF(fx.X - thick * 0.22f, fx.Y - reach, thick * 0.44f, reach * 2);
                Art.Fill(g, Art.Alpha(fx.C, (int)(210 * fade)), outer);
                Art.Fill(g, Art.Alpha(Color.White, (int)(250 * fade)), inner);
                break;
            }
            case FxKind.Ring:
            {
                float radius = fx.Size * (0.25f + 0.75f * (1 - fade * fade));
                Art.Disc(g, Art.Alpha(Color.White, (int)(150 * fade * fade)), 0, fx.X, fx.Y, radius * 0.9f);
                using var pen = new Pen(Art.Alpha(fx.C, (int)(255 * fade)), 4 + 14 * fade);
                g.DrawEllipse(pen, fx.X - radius, fx.Y - radius, radius * 2, radius * 2);
                using var ink = new Pen(Art.Alpha(Art.Ink, (int)(220 * fade)), 2.5f);
                g.DrawEllipse(ink, fx.X - radius - 2 - 7 * fade, fx.Y - radius - 2 - 7 * fade, (radius + 2 + 7 * fade) * 2, (radius + 2 + 7 * fade) * 2);
                break;
            }
            case FxKind.Beam:
            case FxKind.Zap:
            {
                float head = Math.Min(1, t * 2.2f);
                float x = fx.X + (fx.X2 - fx.X) * head, y = fx.Y + (fx.Y2 - fx.Y) * head;
                Art.Line(g, Art.Alpha(fx.C, (int)(230 * fade)), 9 * fade + 2, fx.X, fx.Y, x, y);
                Art.Line(g, Art.Alpha(Color.White, (int)(240 * fade)), 3.5f * fade + 1, fx.X, fx.Y, x, y);
                Art.Disc(g, Art.Alpha(Color.White, (int)(255 * fade)), 0, x, y, 9 * fade + 3);
                break;
            }
            case FxKind.Bolt:
            {
                // 從盤面上方劈下來的閃電，折線位置由種子決定所以每一格都一樣。
                var rng = new Random(fx.Seed);
                var pts = new PointF[7];
                float top = BY - 30;
                for (int i = 0; i < pts.Length; i++)
                {
                    float k = i / (float)(pts.Length - 1);
                    float jitter = i == pts.Length - 1 ? 0 : (float)(rng.NextDouble() - 0.5) * 46;
                    pts[i] = new PointF(fx.X + jitter, top + (fx.Y - top) * k);
                }

                using var glow = new Pen(Art.Alpha(fx.C, (int)(220 * fade)), 10 * fade + 2) { LineJoin = LineJoin.Round };
                using var core = new Pen(Art.Alpha(Color.White, (int)(255 * fade)), 3.5f) { LineJoin = LineJoin.Round };
                g.DrawLines(glow, pts);
                g.DrawLines(core, pts);
                Art.Disc(g, Art.Alpha(Color.White, (int)(200 * fade)), 0, fx.X, fx.Y, 26 * fade + 6);
                break;
            }
            case FxKind.Jelly:
            case FxKind.Ice:
            {
                float radius = 18 + 24 * t;
                using var pen = new Pen(Art.Alpha(fx.C, (int)(255 * fade)), 2 + 6 * fade);
                g.DrawEllipse(pen, fx.X - radius, fx.Y - radius, radius * 2, radius * 2);
                if (fx.Kind == FxKind.Ice)
                    for (int i = 0; i < 6; i++)
                    {
                        double a = i * Math.PI / 3 + 0.4;
                        float near = 12 + 20 * t, far = near + 12 * fade;
                        Art.Line(g, Art.Alpha(Color.White, (int)(255 * fade)), 3,
                            fx.X + (float)Math.Cos(a) * near, fx.Y + (float)Math.Sin(a) * near,
                            fx.X + (float)Math.Cos(a) * far, fx.Y + (float)Math.Sin(a) * far);
                    }

                break;
            }
            case FxKind.Spark:
            {
                float size = fx.Size * (0.4f + 0.8f * t);
                using var brush = new SolidBrush(Art.Alpha(fx.C, (int)(230 * fade)));
                g.FillPolygon(brush, Art.StarPoints(fx.X, fx.Y, size, size * 0.16f, 4, t * 90));
                using var white = new SolidBrush(Art.Alpha(Color.White, (int)(255 * fade)));
                g.FillPolygon(white, Art.StarPoints(fx.X, fx.Y, size * 0.6f, size * 0.1f, 4, 45 + t * 90));
                break;
            }
            case FxKind.Slash:
            {
                // 月牙形的斬擊，沿著 Angle 的方向劃過去。
                float reach = fx.Size * Math.Min(1, 0.3f + t * 2.4f), bulge = Math.Min(36, fx.Size * 0.2f) * (0.35f + 0.65f * fade);
                GraphicsState state = g.Save();
                g.TranslateTransform(fx.X, fx.Y);
                g.RotateTransform(fx.Angle);
                using var path = new GraphicsPath();
                path.AddBezier(-reach, 0, -reach * 0.5f, -bulge * 2.1f, reach * 0.5f, -bulge * 2.1f, reach, 0);
                path.AddBezier(reach, 0, reach * 0.5f, -bulge * 0.6f, -reach * 0.5f, -bulge * 0.6f, -reach, 0);
                path.CloseFigure();
                using (var brush = new SolidBrush(Art.Alpha(fx.C, (int)(240 * fade)))) g.FillPath(brush, path);
                using (var core = new Pen(Art.Alpha(Color.White, (int)(255 * fade)), 2 + 3 * fade))
                    g.DrawBezier(core, -reach, 0, -reach * 0.5f, -bulge * 1.45f, reach * 0.5f, -bulge * 1.45f, reach, 0);
                g.Restore(state);
                break;
            }
            case FxKind.Pillar:
            {
                // 從盤面上方貫穿到目標格的火柱／光柱。
                float swell = (float)Math.Sin(Math.Min(1, t * 2.2f) * Math.PI / 2);
                float width = fx.Size * swell * (0.3f + 0.7f * fade), top = BY - 70, bottom = fx.Y + 30;
                Art.Fill(g, Art.Alpha(fx.C, (int)(180 * fade)), new RectangleF(fx.X - width / 2, top, width, bottom - top), width / 2);
                Art.Fill(g, Art.Alpha(Color.White, (int)(235 * fade)), new RectangleF(fx.X - width * 0.2f, top, width * 0.4f, bottom - top), width * 0.2f);
                Art.Disc(g, Art.Alpha(Color.White, (int)(210 * fade)), 0, fx.X, bottom - 8, width * 0.85f, width * 0.3f);
                break;
            }
            case FxKind.Frost:
            {
                // 由左到右橫掃整個盤面的寒氣。
                float x = BX - 170 + t * (CS * 9 + 340);
                for (int i = 0; i < 6; i++)
                    Art.Fill(g, Art.Alpha(i == 0 ? Color.White : fx.C, 215 - i * 34), new RectangleF(x - i * 32, BY, 34, CS * 9));
                break;
            }
            case FxKind.Gust:
            {
                // 沿著一整排貫穿過去的天空之風：一條風帶加上幾道高速的白線。
                bool toRight = fx.Seed % 2 == 0;
                var rng = new Random(fx.Seed);
                Art.Fill(g, Art.Alpha(fx.C, (int)(110 * fade)), new RectangleF(BX, fx.Y - 31, CS * 9, 62));
                for (int i = 0; i < 10; i++)
                {
                    float offset = (float)(rng.NextDouble() - 0.5) * 56, length = 130 + rng.Next(170);
                    float head = -220 + (t * 1.8f - (float)rng.NextDouble() * 0.45f) * (CS * 9 + 520);
                    float x1 = toRight ? BX + head : BX + CS * 9 - head, x0 = toRight ? x1 - length : x1 + length;
                    Art.Line(g, Art.Alpha(Color.White, (int)(245 * fade)), 2.5f + i % 3 * 1.6f, x0, fx.Y + offset, x1, fx.Y + offset);
                }

                break;
            }
            case FxKind.Circle:
            {
                // 旋轉的魔法陣：雙圈加六芒星。
                float radius = fx.Size * (0.25f + 0.75f * Math.Min(1, t * 5));
                int alpha = (int)(255 * Math.Min(1, fade * 3));
                float spin = fx.T * 150;
                Art.Disc(g, Art.Alpha(fx.C, alpha / 6), 0, fx.X, fx.Y, radius);
                using var thick = new Pen(Art.Alpha(fx.C, alpha), Math.Max(2.5f, fx.Size * 0.035f)) { LineJoin = LineJoin.Round };
                using var thin = new Pen(Art.Alpha(Color.White, alpha), Math.Max(1.5f, fx.Size * 0.014f)) { LineJoin = LineJoin.Round };
                g.DrawEllipse(thick, fx.X - radius, fx.Y - radius, radius * 2, radius * 2);
                g.DrawEllipse(thin, fx.X - radius * 0.88f, fx.Y - radius * 0.88f, radius * 1.76f, radius * 1.76f);
                g.DrawEllipse(thick, fx.X - radius * 0.44f, fx.Y - radius * 0.44f, radius * 0.88f, radius * 0.88f);
                g.DrawPolygon(thick, Art.StarPoints(fx.X, fx.Y, radius * 0.88f, radius * 0.44f, 3, spin));
                g.DrawPolygon(thick, Art.StarPoints(fx.X, fx.Y, radius * 0.88f, radius * 0.44f, 3, spin + 60));
                g.DrawPolygon(thin, Art.StarPoints(fx.X, fx.Y, radius * 0.44f, radius * 0.22f, 3, -spin * 1.6f));
                break;
            }
            case FxKind.Blade:
            {
                // 筆直的劍光：從 (X,Y) 一口氣劃到 (X2,Y2)，兩端尖、中間粗。
                float head = Math.Min(1, t * 4);
                float hx = fx.X + (fx.X2 - fx.X) * head, hy = fx.Y + (fx.Y2 - fx.Y) * head;
                float len = MathF.Sqrt((hx - fx.X) * (hx - fx.X) + (hy - fx.Y) * (hy - fx.Y));
                if (len < 1) break;
                float nx = -(hy - fx.Y) / len, ny = (hx - fx.X) / len, w = 12 * (0.3f + 0.7f * fade);
                float mx = (fx.X + hx) / 2, my = (fx.Y + hy) / 2;
                using (var brush = new SolidBrush(Art.Alpha(fx.C, (int)(235 * fade))))
                    g.FillPolygon(brush, new[] { new PointF(fx.X, fx.Y), new PointF(mx + nx * w, my + ny * w), new PointF(hx, hy), new PointF(mx - nx * w, my - ny * w) });
                Art.Line(g, Art.Alpha(Color.White, (int)(255 * fade)), 2.5f + 2 * fade, fx.X, fx.Y, hx, hy);
                break;
            }
            case FxKind.Lines:
            {
                // 以盤面中央為中心往外放射的集中線。
                var rng = new Random(fx.Seed);
                GraphicsState state = g.Save();
                g.SmoothingMode = SmoothingMode.HighSpeed;
                for (int i = 0; i < 40; i++)
                {
                    double a = rng.NextDouble() * Math.PI * 2, spread = 0.01 + rng.NextDouble() * 0.025;
                    float near = 300 + (float)rng.NextDouble() * 60 + t * 40, far = 700;
                    using var brush = new SolidBrush(Art.Alpha(i % 3 == 0 ? Color.White : fx.C, (int)(200 * fade)));
                    g.FillPolygon(brush, new[]
                    {
                        new PointF(fx.X + (float)Math.Cos(a) * near, fx.Y + (float)Math.Sin(a) * near),
                        new PointF(fx.X + (float)Math.Cos(a - spread) * far, fx.Y + (float)Math.Sin(a - spread) * far),
                        new PointF(fx.X + (float)Math.Cos(a + spread) * far, fx.Y + (float)Math.Sin(a + spread) * far),
                    });
                }

                g.Restore(state);
                break;
            }
            case FxKind.Veil:
                // 整個盤面罩上一層顏色（Size 是最濃時的不透明度）。
                Art.Fill(g, Art.Alpha(fx.C, (int)(fx.Size * Math.Sin(t * Math.PI))), BoardRect);
                break;
            default:
                Art.Fill(g, Art.Alpha(fx.C, (int)(210 * fade * fade)), new RectangleF(-40, -40, W + 80, H + 80));
                break;
        }
    }

    /// <summary>畫在盤面裡、會被盤面邊框裁切的特效。</summary>
    private static bool OnBoard(FxKind kind) =>
        kind is FxKind.Row or FxKind.Col or FxKind.Flash or FxKind.Jelly or FxKind.Ice
            or FxKind.Slash or FxKind.Frost or FxKind.Gust or FxKind.Veil or FxKind.Blade;

    private const float CutLength = 1.15f;
    private const int CutBand = 430;
    private Bitmap? _cutBare, _cutFull;
    private int _cutSkill = -1, _cutUnison = -1;
    private bool _cutBoost, _cutGlitter;

    /// <summary>
    /// 特寫的分鏡先畫成兩張橫條圖層（一張只有底、一張連神器和招式名都有），
    /// 演出時只需要平移貼圖，神器衝進來和招式名蓋章那零點幾秒才即時畫。
    /// </summary>
    private void BuildCutLayers(int skill, bool boost, int unison = -1, bool glitter = false)
    {
        if (_cutSkill == skill && _cutBoost == boost && _cutUnison == unison && _cutGlitter == glitter && _cutBare != null && _cutFull != null) return;
        _cutSkill = skill;
        _cutBoost = boost;
        _cutUnison = unison;
        _cutGlitter = glitter;
        _cutBare?.Dispose();
        _cutFull?.Dispose();
        int width = (int)Math.Round(W * S), height = (int)Math.Round(CutBand * S);
        _cutBare = new Bitmap(width, height, PixelFormat.Format32bppPArgb);
        _cutFull = new Bitmap(width, height, PixelFormat.Format32bppPArgb);
        foreach (Bitmap layer in new[] { _cutBare, _cutFull })
        {
            using Graphics g = Graphics.FromImage(layer);
            Art.Setup(g);
            g.ScaleTransform(S, S);
            g.TranslateTransform(W / 2f, CutBand / 2f);
            g.RotateTransform(-4);
            if (glitter)
            {
                PaintGlitterBand(g);
                if (layer != _cutFull) continue;
                PaintGlitterName(g, 1, 255);
                PaintGlitterLabel(g);
                continue;
            }

            if (unison >= 0)
            {
                PaintUnisonBand(g, unison);
                if (layer != _cutFull) continue;
                PaintUnisonIcons(g, unison, 0);
                PaintCutSeal(g, "合体");
                PaintUnisonName(g, unison, 1, 255);
                PaintUnisonLabel(g, unison);
                continue;
            }

            PaintCutBand(g, skill, boost);
            if (layer != _cutFull) continue;
            PaintCutIcon(g, skill, -425);
            if (boost) PaintCutSeal(g);
            PaintCutName(g, skill, 1, 255, boost);
            Art.Outlined(g, $"神器「{Levels.Artifacts[skill].Name}」{(boost ? "強化" : "")}發動！", 26, Art.Ink, Color.White, 7, 170, 82);
        }
    }

    /// <summary>合體魔法的分鏡：左半是第一件神器的顏色，右半斜切成第二件的顏色，交界是一道金光。</summary>
    private static void PaintUnisonBand(Graphics g, int unison)
    {
        UnisonInfo u = Levels.Unisons[unison];
        PaintCutBand(g, u.A, true);
        GraphicsState state = g.Save();
        using (var path = new GraphicsPath())
        {
            path.AddPolygon(new[] { new PointF(-60, -160), new PointF(800, -160), new PointF(800, 160), new PointF(-140, 160) });
            g.SetClip(path, CombineMode.Intersect);
        }

        PaintCutBand(g, u.B, true);
        g.Restore(state);
        Art.Poly(g, Gold, 0, -66, -138, -50, -138, -130, 138, -146, 138);
        Art.Poly(g, Color.White, 0, -60, -138, -56, -138, -136, 138, -140, 138);
    }

    /// <summary>兩件神器一前一後疊在左邊；<paramref name="rush"/> 是衝進來的位移。</summary>
    private static void PaintUnisonIcons(Graphics g, int unison, float rush)
    {
        UnisonInfo u = Levels.Unisons[unison];
        foreach (var (e, x) in new[] { (u.B, -360f), (u.A, -560f) })
        {
            float at = x + rush;
            Art.Disc(g, Art.Alpha(Color.White, 70), 0, at, 0, 124);
            Art.Disc(g, Art.Alpha(Color.White, 110), 0, at, 0, 96);
            Art.Artifact(g, e, at, 0, 200, true);
        }
    }

    private static void PaintUnisonName(Graphics g, int unison, float scale, int alpha)
    {
        UnisonInfo u = Levels.Unisons[unison];
        float size = u.Name.Length <= 4 ? 104 : u.Name.Length <= 6 ? 86 : 64;
        const float x = 190;
        Art.Outlined(g, u.Name, size, Art.Alpha(Art.Ink, alpha), Art.Alpha(Art.Ink, alpha), 22, x + 8, -2, 1, 0, scale, true);
        Art.Outlined(g, u.Name, size, Art.Alpha(Gold, alpha), Art.Alpha(Color.FromArgb(90, 40, 0), alpha), 18, x, -12, 1, 0, scale, true);
        Art.Outlined(g, u.Name, size, Art.Alpha(Color.FromArgb(255, 246, 200), alpha), Art.Alpha(Color.FromArgb(120, 60, 0), alpha), 12, x, -12, 1, 0, scale, true);
        if (scale <= 1.1f)
            Art.Outlined(g, u.Reading, 24, Art.Alpha(Gold, alpha), Art.Alpha(Art.Ink, alpha), 7, x, -90, 1, 0, 1, true);
    }

    private static void PaintUnisonLabel(Graphics g, int unison)
    {
        UnisonInfo u = Levels.Unisons[unison];
        Art.Outlined(g, $"合體魔法　{u.Pair}　發動！", 26, Art.Ink, Color.White, 7, 190, 82);
    }

    /// <summary>強化版特寫：神器右上角蓋一顆金色「覚醒」印章。</summary>
    private static void PaintCutSeal(Graphics g, string text = "覚醒")
    {
        Art.Disc(g, Art.Ink, 0, -298, -66, 50);
        Art.Disc(g, Gold, 4, -300, -70, 46);
        Art.Disc(g, Art.Alpha(Color.White, 90), 0, -312, -84, 16, 9);
        Art.Outlined(g, text, 30, Color.White, Art.Ink, 7, -300, -70, 1, 0, 1, true);
    }

    private static void PaintCutBand(Graphics g, int e, bool boost = false)
    {
        Color main = Art.Main[e], shade = Art.Shade[e];
        Art.Fill(g, Art.Ink, new RectangleF(-780, -108, 1560, 250));
        Art.Fill(g, main, new RectangleF(-780, -118, 1560, 236));
        Art.Fill(g, shade, new RectangleF(-780, 62, 1560, 56));
        Art.Fill(g, Art.Alpha(Color.White, 64), new RectangleF(-780, -118, 1560, 44));
        for (int i = 0; i < 9; i++)
        {
            float x = i * 200 - 860;
            Art.Poly(g, Art.Alpha(Color.White, 44), 0, x, -118, x + 70, -118, x + 14, 118, x - 56, 118);
        }

        Art.Fill(g, Art.Ink, new RectangleF(-780, -127, 1560, 9));
        Art.Fill(g, Art.Ink, new RectangleF(-780, 118, 1560, 9));
        Color edge = boost ? Gold : Color.White;
        Art.Fill(g, edge, new RectangleF(-780, -117, 1560, boost ? 6 : 3));
        Art.Fill(g, edge, new RectangleF(-780, boost ? 110 : 113, 1560, boost ? 6 : 3));
        if (boost)
        {
            // 強化版：上下多一圈金色細邊，加一排金色斜光。
            Art.Fill(g, Gold, new RectangleF(-780, -138, 1560, 5));
            Art.Fill(g, Gold, new RectangleF(-780, 133, 1560, 5));
            for (int i = 0; i < 9; i++)
            {
                float x = i * 200 - 760;
                Art.Poly(g, Art.Alpha(Gold, 70), 0, x, -118, x + 24, -118, x - 32, 118, x - 56, 118);
            }
        }

        string element = Levels.ElementNames[e];
        Art.Text(g, element, element.Length > 1 ? 170 : 250, Art.Alpha(shade, 150), element.Length > 1 ? 470 : 505, -6, 1, true, true);
    }

    private static void PaintCutIcon(Graphics g, int e, float x)
    {
        Art.Disc(g, Art.Alpha(Color.White, 70), 0, x, 0, 152);
        Art.Disc(g, Art.Alpha(Color.White, 110), 0, x, 0, 116);
        Art.Artifact(g, e, x, 0, 250, true);
    }

    private static void PaintCutName(Graphics g, int e, float scale, int alpha, bool boost = false)
    {
        // 招式名用日文字型，上面一小行是讀音。強化版的招式名是金色字。
        ArtifactInfo info = Levels.Artifacts[e];
        string name = info.SkillName(boost);
        float size = name.Length <= 4 ? 104 : 88;
        Art.Outlined(g, name, size, Art.Alpha(Art.Ink, alpha), Art.Alpha(Art.Ink, alpha), 22, 178, -2, 1, 0, scale, true);
        if (boost)
            Art.Outlined(g, name, size, Art.Alpha(Gold, alpha), Art.Alpha(Color.FromArgb(90, 40, 0), alpha), 18, 170, -12, 1, 0, scale, true);
        Art.Outlined(g, name, size, Art.Alpha(boost ? Color.FromArgb(255, 246, 200) : Color.White, alpha), Art.Alpha(boost ? Color.FromArgb(120, 60, 0) : Art.Ink, alpha), boost ? 12 : 16, 170, -12, 1, 0, scale, true);
        if (scale <= 1.1f)
            Art.Outlined(g, info.SkillReading(boost), 26, Art.Alpha(boost ? Gold : Art.Light[e], alpha), Art.Alpha(Art.Ink, alpha), 7, 170, -90, 1, 0, 1, true);
    }

    /// <summary>必殺技特寫：全畫面壓暗、集中線、斜切的漫畫分鏡，招式名像蓋章一樣砸下來。</summary>
    private void DrawCutIn(Graphics g)
    {
        int e = _bannerSkill, uni = _cutUnison;
        if (_cutBare == null || _cutFull == null || _cutSkill != e) return;
        if (_cutGlitter)
        {
            DrawGlitterCut(g);
            return;
        }

        int e2 = uni >= 0 ? Levels.Unisons[uni].B : e;
        float t = _cut;
        float enter = Math.Clamp(t / 0.16f, 0, 1), leave = Math.Clamp((CutLength - t) / 0.16f, 0, 1);
        float show = Math.Min(enter, leave);

        Art.Fill(g, Art.Alpha(Art.Ink, (int)(175 * show)), new RectangleF(-20, -20, W + 40, H + 40));

        // 集中線：每隔幾格換一組，看起來像在閃動。細長的三角形不需要反鋸齒，畫起來快很多。
        GraphicsState lines = g.Save();
        g.SmoothingMode = SmoothingMode.HighSpeed;
        var rng = new Random((int)(t * 24) * 7919 + e);
        for (int i = 0; i < 40; i++)
        {
            double a = rng.NextDouble() * Math.PI * 2, spread = 0.006 + rng.NextDouble() * 0.02;
            float near = 300 + (float)rng.NextDouble() * 170;
            Color ray = i % 3 == 0 ? Color.White : (_cutBoost || uni >= 0) && i % 3 == 1 ? Gold : Art.Light[i % 2 == 0 ? e : e2];
            using var brush = new SolidBrush(Art.Alpha(ray, (int)((50 + rng.Next(100)) * show)));
            g.FillPolygon(brush, new[] { Ray(a, near), Ray(a - spread, 1200), Ray(a + spread, 1200) });
        }

        g.Restore(lines);

        // 分鏡沿著自己傾斜的方向滑進來、滑出去。
        float inK = 1 - enter, outK = 1 - leave;
        float slide = (inK * inK * inK - outK * outK * outK) * 1500;
        const double tilt = -4 * Math.PI / 180;
        float dx = slide * (float)Math.Cos(tilt), dy = slide * (float)Math.Sin(tilt);
        const float settled = 0.47f;
        Blit(g, t >= settled ? _cutFull : _cutBare, dx * S, (H / 2f - CutBand / 2f + dy) * S, true);
        if (t >= settled) return;

        GraphicsState state = g.Save();
        g.TranslateTransform(W / 2f + dx, H / 2f + dy);
        g.RotateTransform(-4);

        // 神器從左邊衝進來
        float rush = Math.Clamp((t - 0.05f) / 0.2f, 0, 1), back = 1 - rush;
        if (uni >= 0) PaintUnisonIcons(g, uni, -back * back * 520 + (float)Math.Sin(rush * Math.PI) * 26);
        else PaintCutIcon(g, e, -425 - back * back * 520 + (float)Math.Sin(rush * Math.PI) * 26);

        // 招式名蓋章：從兩倍半大砸到原尺寸，落定時整條分鏡閃白。
        float stamp = Math.Clamp((t - 0.2f) / 0.12f, 0, 1);
        if (stamp > 0)
        {
            float land = Math.Clamp((t - 0.32f) / (settled - 0.32f), 0, 1);
            float scale = stamp < 1 ? 2.6f - 1.6f * stamp : 1 + 0.08f * (1 - land);
            int alpha = (int)(255 * Math.Min(1, stamp * 2));
            if (uni >= 0) PaintUnisonName(g, uni, scale, alpha);
            else PaintCutName(g, e, scale, alpha, _cutBoost);
            if (stamp >= 1)
            {
                if (uni >= 0)
                {
                    PaintCutSeal(g, "合体");
                    PaintUnisonLabel(g, uni);
                }
                else
                {
                    if (_cutBoost) PaintCutSeal(g);
                    Art.Outlined(g, $"神器「{Levels.Artifacts[e].Name}」{(_cutBoost ? "強化" : "")}發動！", 26, Art.Ink, Color.White, 7, 170, 82);
                }

                Art.Fill(g, Art.Alpha(Color.White, (int)(200 * (1 - land))), new RectangleF(-780, -118, 1560, 236));
            }
        }

        g.Restore(state);

        static PointF Ray(double a, float r) =>
            new(W / 2f + (float)Math.Cos(a) * r, H / 2f + (float)Math.Sin(a) * r * 0.72f);
    }

    /// <summary>往上竄的火焰。</summary>
    private void Flames(float x, float y, int count, float delay)
    {
        for (int i = 0; i < count; i++)
        {
            _parts.Add(new Particle
            {
                X = x + _rng.Next(-46, 47), Y = y + _rng.Next(-20, 21),
                VX = _rng.Next(-90, 91), VY = -60 - _rng.Next(240), G = -260,
                Max = 0.45f + (float)_rng.NextDouble() * 0.45f, Size = 4 + (float)_rng.NextDouble() * 7,
                C = (i % 4) switch { 0 => Color.White, 1 => Color.FromArgb(255, 226, 90), _ => Color.FromArgb(255, 120, 40) },
                Delay = delay + (float)_rng.NextDouble() * 0.12f,
            });
        }
    }

    /// <summary>六個必殺技各自的演出，疊在一般的消除特效底下。</summary>
    private void ShowSkill(StepResult res)
    {
        const float wave = 0.055f;
        float midX = BX + CS * 4.5f, midY = BY + CS * 4.5f;
        switch (res.Skill)
        {
            case 0:
            {
                // 紅蓮爆炎刃：每個爆點先是交叉的火焰斬擊，再衝出火柱。
                int n = 0;
                foreach (Blast b in res.Blasts)
                {
                    if (b.Kind != BlastKind.Area) continue;
                    PointF at = Center(b.C, b.R);
                    float delay = b.Wave * wave;
                    _fx.Add(new Fx { Kind = FxKind.Slash, X = at.X, Y = at.Y + 16, Size = 176, Angle = 38, C = Color.FromArgb(255, 160, 40), Delay = delay, Max = 0.3f });
                    _fx.Add(new Fx { Kind = FxKind.Slash, X = at.X, Y = at.Y + 16, Size = 176, Angle = 142, C = Color.FromArgb(255, 84, 40), Delay = delay + 0.05f, Max = 0.3f });
                    _fx.Add(new Fx { Kind = FxKind.Pillar, X = at.X, Y = at.Y, Size = 150, C = Color.FromArgb(255, 110, 30), Delay = delay + 0.1f, Max = 0.55f });
                    Flames(at.X, at.Y + 20, 30, delay + 0.1f);
                    if (n > 0)
                    {
                        After(delay, () =>
                        {
                            Sound.Play(Snd.Boom, 0.85f, 0, 1.12);
                            _shake = Math.Max(_shake, 0.7f);
                        });
                    }

                    n++;
                }

                Shout("ドゴォォン!!", midX, BY + 86, Color.FromArgb(255, 160, 40), 0.1f, 70);
                Sound.Play(Snd.Slash, 0.9f, 0, 0.8);
                _shake = Math.Max(_shake, 0.8f);
                break;
            }
            case 1:
            {
                // 絕對冰結：寒氣橫掃盤面，冰封與岩石一起碎裂，多出來的三步飛向步數。
                var ice = Color.FromArgb(190, 236, 255);
                _fx.Add(new Fx { Kind = FxKind.Veil, C = Color.FromArgb(150, 220, 255), Size = 125, Max = 1.0f });
                _fx.Add(new Fx { Kind = FxKind.Frost, C = ice, Max = 0.6f });
                for (int i = 0; i < 70; i++)
                {
                    float x = BX + (float)_rng.NextDouble() * CS * 9;
                    _parts.Add(new Particle
                    {
                        X = x, Y = BY + (float)_rng.NextDouble() * CS * 9, VX = 40 + _rng.Next(130), VY = _rng.Next(-30, 50), G = 60,
                        Max = 0.7f + (float)_rng.NextDouble() * 0.6f, Size = 2 + (float)_rng.NextDouble() * 4,
                        C = i % 3 == 0 ? Color.White : ice, Star = i % 4 == 0, Delay = (x - BX) / (CS * 9) * 0.5f,
                    });
                }

                foreach (Blast b in res.Blasts)
                {
                    if (b.Kind != BlastKind.Bolt) continue;
                    PointF at = Center(b.C, b.R);
                    _fx.Add(new Fx { Kind = FxKind.Ice, X = at.X, Y = at.Y, C = ice, Delay = 0.4f, Max = 0.4f });
                    _fx.Add(new Fx { Kind = FxKind.Spark, X = at.X, Y = at.Y, C = Color.White, Size = 54, Delay = 0.4f, Max = 0.4f });
                }

                Shout("パキィィン!!", midX, midY - 60, Color.FromArgb(150, 226, 255), 0.4f, 78);
                Sound.Play(Snd.Freeze, 1, 0, 0.7);
                After(0.4f, () =>
                {
                    Sound.Play(Snd.Crack, 1);
                    Sound.Play(Snd.Freeze, 0.8f, 0, 1.3);
                    _shake = Math.Max(_shake, 0.6f);
                    _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(220, 244, 255), Max = 0.35f });
                });
                _texts.Add(new FloatText { S = _s!.IsBoss ? "魔王 ストップ!" : "+1手", X = midX, Y = midY + 30, C = Gold, Size = 64, Max = 1.1f, Delay = 0.55f, Shout = true });
                _orbs.Add(new Orb { X0 = midX, Y0 = midY + 30, X1 = 176, Y1 = 434, Delay = 1.0f, Max = 0.55f, C = Gold });
                After(1.55f, () =>
                {
                    _movesPop = 1;
                    Sound.Play(Snd.Star, 0.9f, -0.6f);
                });
                break;
            }
            case 2:
            {
                // 照破・天空穿：壓縮的氣流沿著整排貫穿過去。
                var wind = Color.FromArgb(150, 255, 190);
                _fx.Add(new Fx { Kind = FxKind.Veil, C = Color.FromArgb(120, 240, 160), Size = 70, Max = 0.9f });
                foreach (Blast b in res.Blasts)
                {
                    if (b.Kind != BlastKind.Row) continue;
                    bool toRight = b.C <= 4;
                    float y = Center(0, b.R).Y, delay = b.Wave * wave;
                    _fx.Add(new Fx { Kind = FxKind.Gust, Y = y, C = wind, Delay = delay, Max = 0.62f, Seed = _rng.Next(1000) * 2 + (toRight ? 0 : 1) });
                    for (int i = 0; i < 24; i++)
                    {
                        _parts.Add(new Particle
                        {
                            X = toRight ? BX - 20 : BX + CS * 9 + 20, Y = y + _rng.Next(-28, 29),
                            VX = (toRight ? 1 : -1) * (620 + _rng.Next(520)), VY = _rng.Next(-70, 71), G = 0,
                            Max = 0.5f + (float)_rng.NextDouble() * 0.4f, Size = 3 + (float)_rng.NextDouble() * 5,
                            C = i % 3 == 0 ? Color.White : wind, Star = i % 2 == 0, Delay = delay + (float)_rng.NextDouble() * 0.25f,
                        });
                    }

                    float pan = toRight ? -0.5f : 0.5f;
                    After(delay, () =>
                    {
                        Sound.Play(Snd.Shuffle, 1, pan, 1.5);
                        Sound.Play(Snd.Slash, 0.7f, pan, 1.35);
                        _shake = Math.Max(_shake, 0.5f);
                    });
                }

                Shout("ゴォォォッ!!", midX, BY + 86, wind, 0.05f, 70);
                break;
            }
            case 3:
            {
                // 神鳴殿：雷水晶先在盤面上方亮起，再一道一道降下落雷。
                _fx.Add(new Fx { Kind = FxKind.Veil, C = Color.FromArgb(20, 14, 40), Size = 150, Max = 1.1f });
                int n = 0;
                foreach (Blast b in res.Blasts)
                {
                    if (b.Kind != BlastKind.Bolt) continue;
                    PointF at = Center(b.C, b.R);
                    float delay = b.Wave * wave;
                    _fx.Add(new Fx { Kind = FxKind.Spark, X = at.X, Y = BY - 30, C = Gold, Size = 40, Delay = Math.Max(0, delay - 0.14f), Max = 0.36f });
                    _fx.Add(new Fx { Kind = FxKind.Ring, X = at.X, Y = at.Y, C = Color.FromArgb(255, 236, 120), Size = 58, Delay = delay, Max = 0.3f });
                    if (n % 3 == 0) _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 244, 170), Delay = delay, Max = 0.16f });
                    if (n % 2 == 1)
                    {
                        float pan = (b.C - 4) / 5f;
                        double rate = 0.9 + _rng.NextDouble() * 0.5;
                        After(delay, () =>
                        {
                            Sound.Play(Snd.Bolt, 0.75f, pan, rate);
                            _shake = Math.Max(_shake, 0.45f);
                        });
                    }

                    n++;
                }

                Shout("バリバリバリッ!!", midX, BY + 86, Gold, 0.1f, 64);
                break;
            }
            case 4:
            {
                // ウラノ・メトリア（全天星辰）：盤面化為星空，中央展開星靈魔法陣，群星化成光柱落在目標上。
                _fx.Add(new Fx { Kind = FxKind.Veil, C = Color.FromArgb(14, 16, 64), Size = 190, Max = 1.2f });
                _fx.Add(new Fx { Kind = FxKind.Circle, X = midX, Y = midY, C = Gold, Size = 260, Max = 1.15f });
                for (int i = 0; i < 60; i++)
                {
                    _parts.Add(new Particle
                    {
                        X = BX + (float)_rng.NextDouble() * CS * 9, Y = BY + (float)_rng.NextDouble() * CS * 9, G = 0,
                        VX = _rng.Next(-20, 21), VY = _rng.Next(-20, 21), Max = 0.6f + (float)_rng.NextDouble() * 0.6f,
                        Size = 2 + (float)_rng.NextDouble() * 4, C = i % 3 == 0 ? Color.FromArgb(255, 170, 214) : Color.White,
                        Star = true, Delay = (float)_rng.NextDouble() * 0.3f,
                    });
                }
                foreach (Blast b in res.Blasts)
                {
                    if (b.Kind != BlastKind.Bolt) continue;
                    PointF at = Center(b.C, b.R);
                    float delay = b.Wave * wave + 0.12f;
                    _fx.Add(new Fx { Kind = FxKind.Circle, X = at.X, Y = at.Y, C = Color.FromArgb(255, 170, 214), Size = 62, Delay = delay, Max = 0.65f });
                    _fx.Add(new Fx { Kind = FxKind.Pillar, X = at.X, Y = at.Y, Size = 96, C = Color.FromArgb(255, 226, 120), Delay = delay + 0.06f, Max = 0.5f });
                    After(delay + 0.06f, () =>
                    {
                        Burst(at.X, at.Y, Gold, 18, 320, true);
                        _shake = Math.Max(_shake, 0.4f);
                    });
                }

                Shout("キラァァン!!", midX, BY + 86, Color.FromArgb(255, 226, 120), 0.05f, 68);
                Sound.Play(Snd.Charge, 1, 0, 0.75);
                After(0.18f, () => Sound.Play(Snd.Star, 0.9f, 0, 0.8));
                break;
            }
            default:
            {
                // 天輪・五芒星之劍：五道劍光沿著五芒星的五條邊依序斬出，最後劍陣一起閃光。
                _fx.Add(new Fx { Kind = FxKind.Veil, C = Color.FromArgb(40, 8, 24), Size = 180, Max = 1.1f });
                const float radius = 236;
                for (int i = 0; i < 5; i++)
                {
                    double a0 = (-90 + i * 144) * Math.PI / 180, a1 = (-90 + (i + 1) * 144) * Math.PI / 180;
                    float x0 = midX + (float)Math.Cos(a0) * radius, y0 = midY + (float)Math.Sin(a0) * radius;
                    float x1 = midX + (float)Math.Cos(a1) * radius, y1 = midY + (float)Math.Sin(a1) * radius;
                    float delay = i * 0.07f;
                    _fx.Add(new Fx
                    {
                        Kind = FxKind.Blade, X = x0, Y = y0, X2 = x1, Y2 = y1,
                        C = i % 2 == 0 ? Color.FromArgb(255, 90, 110) : Color.FromArgb(236, 236, 255),
                        Delay = delay, Max = 0.75f - delay,
                    });
                    _fx.Add(new Fx { Kind = FxKind.Spark, X = x0, Y = y0, C = Color.White, Size = 46, Delay = delay, Max = 0.35f });
                    double rate = 0.7 + i * 0.08;
                    After(delay, () =>
                    {
                        Sound.Play(Snd.Slash, 0.75f, 0, rate);
                        _shake = Math.Max(_shake, 0.35f);
                    });
                }

                After(0.4f, () =>
                {
                    _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 220, 230), Max = 0.3f });
                    _fx.Add(new Fx { Kind = FxKind.Ring, X = midX, Y = midY, C = Color.FromArgb(255, 90, 110), Size = 300, Max = 0.45f });
                    Sound.Play(Snd.Boom, 0.8f, 0, 1.3);
                    _shake = Math.Max(_shake, 0.7f);
                });
                Shout("ズバァァン!!", midX, BY + 86, Color.FromArgb(255, 120, 140), 0.1f, 70);
                break;
            }
        }

        if (res.Boosted) ShowBoost(res);
    }

    /// <summary>強化版招式（第 7–9 關破關後）額外的演出：金色覺醒光環，加上每招自己的追加效果。</summary>
    private void ShowBoost(StepResult res)
    {
        const float wave = 0.055f;
        float midX = BX + CS * 4.5f, midY = BY + CS * 4.5f;
        Color light = Art.Light[res.Skill];

        // 共通：金色魔法陣在盤面中央展開，金粉往上飄。
        _fx.Add(new Fx { Kind = FxKind.Circle, X = midX, Y = midY, C = Art.Alpha(Gold, 170), Size = 210, Max = 0.8f });
        _fx.Add(new Fx { Kind = FxKind.Ring, X = midX, Y = midY, C = Gold, Size = 420, Delay = 0.05f, Max = 0.45f });
        for (int i = 0; i < 46; i++)
        {
            _parts.Add(new Particle
            {
                X = BX + (float)_rng.NextDouble() * CS * 9, Y = BY + CS * 9 - (float)_rng.NextDouble() * 40,
                VX = _rng.Next(-30, 31), VY = -160 - _rng.Next(260), G = 40, Max = 0.9f + (float)_rng.NextDouble() * 0.6f,
                Size = 2.5f + (float)_rng.NextDouble() * 4, C = i % 3 == 0 ? Color.White : i % 3 == 1 ? Gold : light,
                Star = i % 2 == 0, Delay = (float)_rng.NextDouble() * 0.5f,
            });
        }

        Sound.Play(Snd.Star, 0.8f, 0, 1.25);

        switch (res.Skill)
        {
            case 0:
                // 炎竜王の崩拳：5×5 的炎拳砸下，巨大火柱加整片閃光。
                foreach (Blast b in res.Blasts)
                {
                    if (b.Kind != BlastKind.Area || b.Size < 2) continue;
                    PointF at = Center(b.C, b.R);
                    float delay = b.Wave * wave;
                    _fx.Add(new Fx { Kind = FxKind.Pillar, X = at.X, Y = at.Y, Size = 300, C = Color.FromArgb(255, 200, 60), Delay = delay, Max = 0.75f });
                    _fx.Add(new Fx { Kind = FxKind.Ring, X = at.X, Y = at.Y, C = Color.FromArgb(255, 120, 30), Size = 420, Delay = delay, Max = 0.5f });
                    _fx.Add(new Fx { Kind = FxKind.Ring, X = at.X, Y = at.Y, C = Color.White, Size = 260, Delay = delay + 0.06f, Max = 0.4f });
                    Flames(at.X, at.Y, 70, delay);
                    Flames(at.X - CS * 1.5f, at.Y + CS, 25, delay + 0.05f);
                    Flames(at.X + CS * 1.5f, at.Y + CS, 25, delay + 0.05f);
                    Shout("ドゴォォォン!!!", at.X, at.Y - 70, Color.FromArgb(255, 200, 60), delay, 84);
                    After(delay, () =>
                    {
                        _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 210, 120), Max = 0.35f });
                        Sound.Play(Snd.Boom, 1, 0, 0.8);
                        Sound.Play(Snd.BossHit, 0.8f, 0, 0.7);
                        _shake = 1;
                    });
                }

                break;
            case 1:
                // 氷魔の激昂：冰槍從盤面上方刺下，整行結霜碎裂。
                foreach (Blast b in res.Blasts)
                {
                    if (b.Kind != BlastKind.Col) continue;
                    float x = Center(b.C, 0).X, delay = b.Wave * wave;
                    _fx.Add(new Fx { Kind = FxKind.Pillar, X = x, Y = BY + CS * 4.5f, Size = 120, C = Color.FromArgb(200, 240, 255), Delay = delay, Max = 0.55f });
                    for (int r = 0; r < 9; r++)
                    {
                        PointF at = Center(b.C, r);
                        _fx.Add(new Fx { Kind = FxKind.Ice, X = at.X, Y = at.Y, C = Color.FromArgb(200, 240, 255), Delay = delay + r * 0.025f, Max = 0.4f });
                    }

                    for (int i = 0; i < 18; i++)
                    {
                        _parts.Add(new Particle
                        {
                            X = x + _rng.Next(-20, 21), Y = BY - 10, VX = _rng.Next(-60, 61), VY = 600 + _rng.Next(400), G = 300,
                            Max = 0.6f, Size = 2 + (float)_rng.NextDouble() * 4, C = i % 2 == 0 ? Color.White : Color.FromArgb(170, 230, 255),
                            Star = i % 3 == 0, Delay = delay + (float)_rng.NextDouble() * 0.1f,
                        });
                    }

                    After(delay, () =>
                    {
                        Sound.Play(Snd.Crack, 1, (b.C - 4) / 5f, 0.8);
                        Sound.Play(Snd.Slash, 0.7f, (b.C - 4) / 5f, 0.6);
                        _shake = Math.Max(_shake, 0.7f);
                    });
                }

                Shout("ガキィィン!!", midX, BY + 150, Color.FromArgb(170, 230, 255), 0.45f, 74);
                break;
            case 2:
                // ミルキーウェイ：星河漩渦在 5×5 中心旋轉，打通魚下方的通道。
                foreach (Blast b in res.Blasts)
                {
                    PointF at = Center(b.C, b.R);
                    float delay = b.Wave * wave;
                    if (b.Kind == BlastKind.Area && b.Size >= 2)
                    {
                        _fx.Add(new Fx { Kind = FxKind.Circle, X = at.X, Y = at.Y, C = Color.FromArgb(160, 255, 210), Size = 230, Delay = delay, Max = 0.8f });
                        for (int i = 0; i < 50; i++)
                        {
                            double a = i * 0.5;
                            float r0 = 20 + i * 3.2f;
                            _parts.Add(new Particle
                            {
                                X = at.X + (float)Math.Cos(a) * r0, Y = at.Y + (float)Math.Sin(a) * r0,
                                VX = (float)(-Math.Sin(a) * 260), VY = (float)(Math.Cos(a) * 260), G = 0,
                                Max = 0.7f, Size = 2 + (float)_rng.NextDouble() * 4,
                                C = i % 3 == 0 ? Color.White : i % 3 == 1 ? Color.FromArgb(150, 255, 190) : Color.FromArgb(190, 170, 255),
                                Star = true, Delay = delay + i * 0.006f,
                            });
                        }

                        Shout("キュオォォン!!", at.X, at.Y - 60, Color.FromArgb(160, 255, 210), delay, 70);
                        After(delay, () =>
                        {
                            Sound.Play(Snd.Shuffle, 1, 0, 0.8);
                            Sound.Play(Snd.Charge, 0.8f, 0, 1.2);
                            _shake = Math.Max(_shake, 0.7f);
                        });
                    }
                    else if (b.Kind == BlastKind.Col)
                    {
                        _fx.Add(new Fx { Kind = FxKind.Pillar, X = at.X, Y = BY + CS * 4.5f, Size = 110, C = Color.FromArgb(150, 255, 190), Delay = delay, Max = 0.5f });
                        _texts.Add(new FloatText { S = "↓", X = at.X, Y = at.Y + 40, C = Gold, Size = 52, Max = 0.8f, Delay = delay, Shout = true });
                    }
                }

                break;
            case 3:
                // 雷竜方天戟：雷戟落在十字交點，整排整行化為雷光。
                foreach (Blast b in res.Blasts)
                {
                    if (b.Kind != BlastKind.Row) continue;
                    PointF at = Center(b.C, b.R);
                    float delay = b.Wave * wave;
                    _fx.Add(new Fx { Kind = FxKind.Pillar, X = at.X, Y = BY + CS * 4.5f, Size = 150, C = Color.FromArgb(255, 240, 140), Delay = delay - 0.08f, Max = 0.6f });
                    _fx.Add(new Fx { Kind = FxKind.Ring, X = at.X, Y = at.Y, C = Color.FromArgb(255, 236, 120), Size = 380, Delay = delay, Max = 0.5f });
                    for (int k = 0; k < 9; k++)
                    {
                        PointF rowAt = Center(k, b.R), colAt = Center(b.C, k);
                        _fx.Add(new Fx { Kind = FxKind.Bolt, X = rowAt.X, Y = rowAt.Y, C = Gold, Delay = delay + k * 0.012f, Max = 0.3f, Seed = _rng.Next() });
                        _fx.Add(new Fx { Kind = FxKind.Bolt, X = colAt.X, Y = colAt.Y, C = Gold, Delay = delay + k * 0.012f, Max = 0.3f, Seed = _rng.Next() });
                    }

                    Shout("ズドォォォン!!", at.X, at.Y - 60, Gold, delay, 80);
                    After(delay, () =>
                    {
                        _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 250, 200), Max = 0.3f });
                        Sound.Play(Snd.Bolt, 1, 0, 0.7);
                        Sound.Play(Snd.Boom, 0.9f, 0, 1.1);
                        _shake = 1;
                    });
                }

                break;
            case 4:
                // スタードレス：核心化為巨大星爆，同屬性糖晶一起被光束射穿。
                foreach (Blast b in res.Blasts)
                {
                    if (b.Kind != BlastKind.Beam) continue;
                    PointF from = Center(b.FromC, b.FromR);
                    float delay = b.Wave * wave;
                    _fx.Add(new Fx { Kind = FxKind.Circle, X = from.X, Y = from.Y, C = Color.FromArgb(255, 170, 214), Size = 200, Delay = delay, Max = 0.8f });
                    _fx.Add(new Fx { Kind = FxKind.Ring, X = from.X, Y = from.Y, C = Color.White, Size = 500, Delay = delay, Max = 0.55f });
                    Shout("キラキラァン!!", from.X, from.Y - 60, Color.FromArgb(255, 200, 230), delay, 72);
                    After(delay, () =>
                    {
                        Burst(from.X, from.Y, Color.FromArgb(255, 200, 230), 40, 520, true);
                        _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 230, 245), Max = 0.3f });
                        Sound.Play(Snd.Core, 1, 0, 0.9);
                        _shake = Math.Max(_shake, 0.8f);
                    });
                    break;
                }

                break;
            default:
            {
                // 天輪・繚乱の剣：第二個倒轉的五芒星，劍雨從天而降。
                const float radius = 236;
                for (int i = 0; i < 5; i++)
                {
                    double a0 = (90 + i * 144) * Math.PI / 180, a1 = (90 + (i + 1) * 144) * Math.PI / 180;
                    float delay = 0.36f + i * 0.06f;
                    _fx.Add(new Fx
                    {
                        Kind = FxKind.Blade,
                        X = midX + (float)Math.Cos(a0) * radius, Y = midY + (float)Math.Sin(a0) * radius,
                        X2 = midX + (float)Math.Cos(a1) * radius, Y2 = midY + (float)Math.Sin(a1) * radius,
                        C = i % 2 == 0 ? Gold : Color.FromArgb(255, 150, 170), Delay = delay, Max = 0.7f,
                    });
                }

                for (int i = 0; i < 14; i++)
                {
                    float x = BX + 20 + (float)_rng.NextDouble() * (CS * 9 - 40), delay = 0.3f + i * 0.04f;
                    _fx.Add(new Fx { Kind = FxKind.Blade, X = x - 30, Y = BY - 20, X2 = x + 30, Y2 = BY + CS * 9 + 20, C = Color.FromArgb(236, 236, 255), Delay = delay, Max = 0.35f });
                    if (i % 3 == 0) After(delay, () => Sound.Play(Snd.Slash, 0.6f, (x - midX) / 300f, 1.4));
                }

                Shout("ズババババッ!!", midX, BY + 400, Color.FromArgb(255, 150, 170), 0.45f, 70);
                break;
            }
        }
    }

    /// <summary>合體魔法的演出：兩種屬性的光一起爆開，再加上每招自己的畫面。</summary>
    private void ShowUnison(StepResult res)
    {
        const float wave = 0.055f;
        float midX = BX + CS * 4.5f, midY = BY + CS * 4.5f;
        UnisonInfo u = Levels.Unisons[res.Unison];
        Color la = Art.Light[u.A], lb = Art.Light[u.B];

        // 共通：雙色魔法陣與金環，兩色光粒往外噴。
        _fx.Add(new Fx { Kind = FxKind.Circle, X = midX, Y = midY, C = Art.Alpha(la, 150), Size = 230, Max = 0.9f });
        _fx.Add(new Fx { Kind = FxKind.Circle, X = midX, Y = midY, C = Art.Alpha(lb, 150), Size = 170, Delay = 0.08f, Max = 0.85f });
        _fx.Add(new Fx { Kind = FxKind.Ring, X = midX, Y = midY, C = Gold, Size = 520, Delay = 0.05f, Max = 0.5f });
        Burst(midX, midY, la, 26, 460, true);
        Burst(midX, midY, lb, 26, 460, true);
        Sound.Play(Snd.Star, 0.9f, 0, 1.1);

        switch (res.Unison)
        {
            case 0:
            {
                // 雷炎竜の咆哮：三排寬的吐息，火焰沿著排一路燒過去，雷光纏在火上。
                bool shouted = false;
                foreach (Blast b in res.Blasts)
                {
                    float delay = b.Wave * wave;
                    if (b.Kind == BlastKind.Row)
                    {
                        float y = Center(0, b.R).Y;
                        _fx.Add(new Fx { Kind = FxKind.Gust, Y = y, C = Color.FromArgb(255, 150, 60), Delay = delay, Max = 0.62f, Seed = _rng.Next(1000) * 2 });
                        for (int c = 0; c < 9; c += 2)
                        {
                            PointF at = Center(c, b.R);
                            Flames(at.X, at.Y, 10, delay + c * 0.03f);
                            _fx.Add(new Fx { Kind = FxKind.Bolt, X = at.X, Y = at.Y, C = Color.FromArgb(255, 236, 120), Delay = delay + c * 0.03f, Max = 0.25f, Seed = _rng.Next() });
                        }

                        if (!shouted)
                        {
                            shouted = true;
                            Shout("ゴアァァァッ!!!", midX, y - 70, Color.FromArgb(255, 170, 60), delay + 0.1f, 84);
                            After(delay, () =>
                            {
                                _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 220, 140), Max = 0.35f });
                                Sound.Play(Snd.Boom, 1, -0.6f, 0.75);
                                Sound.Play(Snd.Bolt, 0.9f, 0.4f, 0.8);
                                _shake = 1;
                            });
                        }
                    }
                    else if (b.Kind == BlastKind.Bolt && b.Wave == 7)
                    {
                        After(delay, () =>
                        {
                            Sound.Play(Snd.Bolt, 1, 0, 0.9);
                            _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 250, 200), Max = 0.2f });
                        });
                        Shout("バリバリィッ!!", midX, BY + CS * 7.5f, Color.FromArgb(255, 236, 120), delay, 66);
                    }
                }

                break;
            }
            default:
            {
                // 天竜×サンドバスター：三根沙暴龍捲由下往上捲，捲起的糖晶化成星星炸開。
                Color sand = Color.FromArgb(240, 210, 140), wind = Color.FromArgb(160, 255, 210);
                foreach (Blast b in res.Blasts)
                {
                    PointF at = Center(b.C, b.R);
                    float delay = b.Wave * wave;
                    if (b.Kind == BlastKind.Col)
                    {
                        _fx.Add(new Fx { Kind = FxKind.Pillar, X = at.X, Y = midY, Size = 130, C = b.C % 2 == 0 ? wind : sand, Delay = delay, Max = 0.7f });
                        for (int i = 0; i < 30; i++)
                        {
                            double a = i * 0.7;
                            _parts.Add(new Particle
                            {
                                X = at.X + (float)Math.Cos(a) * 30, Y = BY + CS * 9 - i * 6,
                                VX = (float)(-Math.Sin(a) * 220), VY = -380 - _rng.Next(260), G = 0, Max = 0.7f,
                                Size = 2.5f + (float)_rng.NextDouble() * 4, C = i % 3 == 0 ? Color.White : i % 3 == 1 ? sand : wind,
                                Star = i % 4 == 0, Delay = delay + i * 0.01f,
                            });
                        }
                    }
                    else if (b.Kind == BlastKind.Bolt)
                    {
                        _fx.Add(new Fx { Kind = FxKind.Ring, X = at.X, Y = at.Y, C = Color.FromArgb(255, 200, 230), Size = 120, Delay = delay, Max = 0.4f });
                        After(delay, () => Burst(at.X, at.Y, Color.FromArgb(255, 220, 240), 10, 260, true));
                    }
                }

                Shout("ゴォォォォッ!!", midX, BY + 120, sand, 0.05f, 80);
                Shout("キラァン!!", midX, BY + CS * 7.5f, Color.FromArgb(255, 200, 230), 0.5f, 62);
                After(0, () =>
                {
                    Sound.Play(Snd.Shuffle, 1, 0, 0.7);
                    Sound.Play(Snd.Boom, 0.8f, 0, 1.2);
                    _shake = 1;
                });
                After(0.45f, () => Sound.Play(Snd.Core, 0.9f, 0, 1.1));
                break;
            }
        }
    }

    // ───────────────────────── 妖精的光耀 ─────────────────────────

    /// <summary>妖精的光耀的分鏡：比一般特寫更寬的動畫截圖，上下兩道金邊。</summary>
    private static void PaintGlitterBand(Graphics g)
    {
        var rect = new RectangleF(-700, -172, 1400, 344);
        Art.Fill(g, Art.Ink, new RectangleF(-790, -190, 1580, 380));
        Art.Fill(g, Gold, new RectangleF(-790, -184, 1580, 368));
        Art.Fill(g, Art.Ink, new RectangleF(-790, -176, 1580, 352));
        GraphicsState state = g.Save();
        g.InterpolationMode = InterpolationMode.HighQualityBilinear;
        Bitmap art = Art.GlitterArt;
        // 圖不夠寬的部分用金色光暈補滿。
        Art.Fill(g, Color.FromArgb(255, 238, 160), new RectangleF(-790, -172, 1580, 344));
        g.DrawImage(art, rect);
        using (var fadeL = new LinearGradientBrush(new PointF(-700, 0), new PointF(-560, 0), Color.FromArgb(255, 255, 238, 160), Color.FromArgb(0, 255, 238, 160)))
            g.FillRectangle(fadeL, -701, rect.Y, 141, rect.Height);
        using (var fadeR = new LinearGradientBrush(new PointF(560, 0), new PointF(700, 0), Color.FromArgb(0, 255, 238, 160), Color.FromArgb(255, 255, 238, 160)))
            g.FillRectangle(fadeR, 560, rect.Y, 141, rect.Height);
        // 下半部壓暗，招式名比較清楚。
        using (var shade = new LinearGradientBrush(new PointF(0, 0), new PointF(0, 172), Color.FromArgb(0, 10, 6, 30), Color.FromArgb(170, 10, 6, 30)))
            g.FillRectangle(shade, -790, 0, 1580, 172);
        g.Restore(state);
        Art.Fill(g, Gold, new RectangleF(-790, -176, 1580, 4));
        Art.Fill(g, Gold, new RectangleF(-790, 172, 1580, 4));
    }

    private static void PaintGlitterName(Graphics g, float scale, int alpha)
    {
        const string name = "妖精の輝き";
        const float y = 70;
        Art.Outlined(g, name, 110, Art.Alpha(Art.Ink, alpha), Art.Alpha(Art.Ink, alpha), 24, 8, y + 10, 1, 0, scale, true);
        Art.Outlined(g, name, 110, Art.Alpha(Gold, alpha), Art.Alpha(Color.FromArgb(90, 40, 0), alpha), 20, 0, y, 1, 0, scale, true);
        Art.Outlined(g, name, 110, Art.Alpha(Color.FromArgb(255, 250, 220), alpha), Art.Alpha(Color.FromArgb(120, 60, 0), alpha), 12, 0, y, 1, 0, scale, true);
        if (scale <= 1.1f)
            Art.Outlined(g, "妖精三大魔法　フェアリーグリッター", 26, Art.Alpha(Gold, alpha), Art.Alpha(Art.Ink, alpha), 7, 0, y - 82, 1, 0, 1, true);
    }

    private static void PaintGlitterLabel(Graphics g) =>
        Art.Outlined(g, "六件神器的光芒集結　發動！", 24, Art.Ink, Color.White, 7, 0, 150);

    /// <summary>妖精的光耀特寫：全畫面變暗，金白集中線，寬幅分鏡滑入，招式名蓋章。</summary>
    private void DrawGlitterCut(Graphics g)
    {
        float t = _cut;
        float enter = Math.Clamp(t / 0.16f, 0, 1), leave = Math.Clamp((CutLength - t) / 0.16f, 0, 1);
        float show = Math.Min(enter, leave);
        Art.Fill(g, Art.Alpha(Art.Ink, (int)(200 * show)), new RectangleF(-20, -20, W + 40, H + 40));

        GraphicsState lines = g.Save();
        g.SmoothingMode = SmoothingMode.HighSpeed;
        var rng = new Random((int)(t * 24) * 7919 + 77);
        for (int i = 0; i < 48; i++)
        {
            double a = rng.NextDouble() * Math.PI * 2, spread = 0.006 + rng.NextDouble() * 0.02;
            float near = 330 + (float)rng.NextDouble() * 170;
            Color ray = i % 2 == 0 ? Color.White : Gold;
            using var brush = new SolidBrush(Art.Alpha(ray, (int)((60 + rng.Next(110)) * show)));
            g.FillPolygon(brush, new[] { Ray(a, near), Ray(a - spread, 1200), Ray(a + spread, 1200) });
        }

        g.Restore(lines);

        float inK = 1 - enter, outK = 1 - leave;
        float slide = (inK * inK * inK - outK * outK * outK) * 1500;
        const double tilt = -4 * Math.PI / 180;
        float dx = slide * (float)Math.Cos(tilt), dy = slide * (float)Math.Sin(tilt);
        const float settled = 0.47f;
        Blit(g, t >= settled ? _cutFull! : _cutBare!, dx * S, (H / 2f - CutBand / 2f + dy) * S, true);
        if (t >= settled) return;

        GraphicsState state = g.Save();
        g.TranslateTransform(W / 2f + dx, H / 2f + dy);
        g.RotateTransform(-4);
        float stamp = Math.Clamp((t - 0.2f) / 0.12f, 0, 1);
        if (stamp > 0)
        {
            float land = Math.Clamp((t - 0.32f) / (settled - 0.32f), 0, 1);
            PaintGlitterName(g, stamp < 1 ? 2.6f - 1.6f * stamp : 1 + 0.08f * (1 - land), (int)(255 * Math.Min(1, stamp * 2)));
            if (stamp >= 1)
            {
                PaintGlitterLabel(g);
                Art.Fill(g, Art.Alpha(Color.White, (int)(220 * (1 - land))), new RectangleF(-790, -172, 1580, 344));
            }
        }

        g.Restore(state);

        static PointF Ray(double a, float r) =>
            new(W / 2f + (float)Math.Cos(a) * r, H / 2f + (float)Math.Sin(a) * r * 0.72f);
    }

    /// <summary>妖精的光耀的盤面演出：金色光環從外圈一圈圈往中心收束，最後整片金光。</summary>
    private void ShowGlitter(StepResult res)
    {
        const float wave = 0.055f;
        float midX = BX + CS * 4.5f, midY = BY + CS * 4.5f;
        Color light = Color.FromArgb(255, 240, 150);
        _fx.Add(new Fx { Kind = FxKind.Circle, X = midX, Y = midY, C = Art.Alpha(Gold, 190), Size = 300, Max = 1.2f });
        for (int ring = 0; ring < 5; ring++)
        {
            float delay = (ring + 1) * wave * 1.2f;
            _fx.Add(new Fx { Kind = FxKind.Ring, X = midX, Y = midY, C = ring % 2 == 0 ? Gold : Color.White, Size = 640 - ring * 120, Delay = delay, Max = 0.45f });
        }

        for (int i = 0; i < 90; i++)
        {
            double a = i * Math.PI * 2 / 90;
            float r0 = 300;
            _parts.Add(new Particle
            {
                X = midX + (float)Math.Cos(a) * r0, Y = midY + (float)Math.Sin(a) * r0,
                VX = (float)(-Math.Cos(a) * 420), VY = (float)(-Math.Sin(a) * 420), G = 0, Max = 0.7f,
                Size = 3 + (float)_rng.NextDouble() * 4, C = i % 3 == 0 ? Color.White : i % 3 == 1 ? Gold : light,
                Star = i % 2 == 0, Delay = (float)_rng.NextDouble() * 0.15f,
            });
        }

        Shout("フェアリーグリッター!!!", midX, BY + 70, Gold, 0, 64);
        Shout("キィィィィン!!!", midX, BY + CS * 7.6f, Color.White, 0.3f, 76);
        Sound.Play(Snd.Star, 1, 0, 0.8);
        After(0.06f, () => Sound.Play(Snd.Core, 1, 0, 0.9));
        After(5 * wave * 1.2f, () =>
        {
            _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 246, 200), Max = 0.6f });
            Burst(midX, midY, Gold, 50, 700, true);
            Sound.Play(Snd.Boom, 1, 0, 0.6);
            Sound.Play(Snd.BossHit, 1, 0, 0.8);
            _shake = 1;
            _hitStop = Math.Max(_hitStop, 0.12f);
        });
    }

    // ───────────────────────── 場地機關 ─────────────────────────

    private static readonly Color[] PortalColors = { Color.FromArgb(255, 120, 220), Color.FromArgb(110, 220, 255) };

    /// <summary>星靈神殿的傳送門：入口畫在入口行的底邊，出口畫在出口行的頂邊，同一組同色，緩緩旋轉。</summary>
    private void DrawPortals(Graphics g)
    {
        int[] portals = _level.Portals;
        for (int i = 0; i + 1 < portals.Length; i += 2)
        {
            Color color = PortalColors[i / 2 % PortalColors.Length];
            Portal(g, BX + portals[i] * CS + CS / 2f, BY + CS * 9 - 6, color, true);
            Portal(g, BX + portals[i + 1] * CS + CS / 2f, BY + 6, color, false);
        }

        void Portal(Graphics gr, float x, float y, Color color, bool entry)
        {
            float spin = _time * (entry ? 3 : -3);
            float glow = 0.75f + 0.25f * (float)Math.Sin(_time * 4);
            Art.Disc(gr, Art.Alpha(color, (int)(110 * glow)), 0, x, y, CS * 0.56f, 16);
            using (var pen = new Pen(Art.Alpha(Art.Ink, 200), 6.5f))
                gr.DrawEllipse(pen, x - CS * 0.44f, y - 11, CS * 0.88f, 22);
            using (var pen = new Pen(Art.Alpha(color, 245), 3.6f))
                gr.DrawEllipse(pen, x - CS * 0.44f, y - 11, CS * 0.88f, 22);
            for (int k = 0; k < 6; k++)
            {
                double a = spin + k * Math.PI / 3;
                Art.Disc(gr, Art.Alpha(Color.White, 220), 0, x + (float)Math.Cos(a) * CS * 0.36f, y + (float)Math.Sin(a) * 6, 2.4f);
            }

            Art.Outlined(gr, entry ? "▼" : "▼", 14, color, Art.Ink, 3, x, entry ? y - 14 : y + 14);
        }
    }

    /// <summary>
    /// 天空草原的風：盤面上淡淡的風線往下風處流，下風處的邊上是一條發光的收集帶，
    /// 加上箭頭，讓玩家知道糖晶與哈比的魚會往哪邊掉。
    /// </summary>
    private void DrawWind(Graphics g)
    {
        int dir = _s!.WindDir;
        if (dir == 0) return;
        float left = BX, width = CS * 9;
        using (var pen = new Pen(Color.FromArgb(46, 220, 255, 240), 2.4f))
        {
            for (int i = 0; i < 9; i++)
            {
                float y = BY + CS * (i + 0.5f) + (float)Math.Sin(i * 1.7) * 18;
                float head = ((_time * 0.6f + i * 0.37f) % 1.4f - 0.2f) * width;
                float x1 = dir > 0 ? left + head : left + width - head, x0 = x1 - dir * 120;
                g.DrawLine(pen, x0, y, x1, y);
            }
        }

        float edge = dir > 0 ? BX + CS * 9 - 6 : BX + 6;
        float pulse = 0.6f + 0.4f * (float)Math.Sin(_time * 4);
        Art.Fill(g, Color.FromArgb((int)(120 * pulse), 150, 240, 200), new RectangleF(edge - 5, BY, 10, CS * 9));
        for (int r = 0; r < Board.N; r += 2)
            Art.Outlined(g, dir > 0 ? "▶" : "◀", 16, Color.FromArgb(150, 240, 200), Art.Ink, 3, edge - dir * 12, Center(0, r).Y);
    }

    /// <summary>強風轉向：整個盤面吹過幾道風帶，喊出新風向。</summary>
    private void ShowWind(StepResult res)
    {
        Color wind = Color.FromArgb(150, 240, 200);
        for (int r = 1; r < Board.N; r += 3)
            _fx.Add(new Fx { Kind = FxKind.Gust, Y = Center(0, r).Y, C = wind, Delay = r * 0.03f, Max = 0.6f, Seed = _rng.Next(1000) * 2 + (res.Dir > 0 ? 0 : 1) });
        Shout(res.Dir > 0 ? "風向逆転!! →" : "← 風向逆転!!", BX + CS * 4.5f, BY + CS * 4.5f, wind, 0, 56);
        Sound.Play(Snd.Shuffle, 1, res.Dir * 0.5f, 1.1);
        _hint = null;
        _idle = 0;
    }

    /// <summary>落雷：先暗一下，再劈下來，被劈到的格子照一般消除演出。</summary>
    private void ShowLightning(StepResult res)
    {
        _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 250, 210), Max = 0.25f });
        ShowClear(res);
        foreach (Blast b in res.Blasts)
        {
            if (b.Kind != BlastKind.Bolt) continue;
            PointF at = Center(b.C, b.R);
            _fx.Add(new Fx { Kind = FxKind.Pillar, X = at.X, Y = BY + CS * 4.5f, Size = 70, C = Color.FromArgb(255, 240, 140), Delay = b.Wave * 0.055f, Max = 0.35f });
        }

        Shout("ピシャーン!!", BX + CS * 4.5f, BY + 60, Color.FromArgb(255, 236, 120), 0, 56);
        Sound.Play(Snd.Bolt, 1, 0, 0.8);
        _shake = Math.Max(_shake, 0.6f);
        _hint = null;
        _idle = 0;
    }

    // ───────────────────────── 魔王第二階段 ─────────────────────────

    private const float TransformLength = 1.9f, QteTime = 3.4f, QteRadius = 44;
    private bool _tcutOn, _qteOn;
    private float _tcut, _qteT;
    private readonly List<PointF> _qteTargets = new();
    private int _qteNext;

    /// <summary>龍化：全畫面特寫，人形態被黑光吞沒、龍形態破出，音樂換成第二階段的曲子。</summary>
    private void StartTransform()
    {
        _tcutOn = true;
        _tcut = 0;
        _hint = null;
        _sel = null;
        Sound.Play(Snd.BossAttack, 1, 0, 0.6);
        Sound.Play(Snd.Boom, 1, 0, 0.5);
        After(0.55f, () =>
        {
            Sound.Play(Snd.BossHit, 1, 0, 0.5);
            Sound.Play(Snd.Rock, 1, 0, 0.6);
            _shake = 1;
            _bossFlash = 1;
            Sound.Music(Sound.BossPhase2);
        });
    }

    private void DrawTransformCut(Graphics g)
    {
        float t = _tcut;
        float enter = Math.Clamp(t / 0.2f, 0, 1), leave = Math.Clamp((TransformLength - t) / 0.2f, 0, 1);
        float show = Math.Min(enter, leave);
        Art.Fill(g, Art.Alpha(Color.FromArgb(8, 2, 14), (int)(220 * show)), new RectangleF(-20, -20, W + 40, H + 40));

        // 前半是人形態，被黑光吞掉；0.55 秒時一閃，換成龍形態破出來，越放越大。
        bool dragon = t >= 0.55f;
        Bitmap art = dragon ? Art.BossArt : Art.HumanArt;
        float zoom = dragon ? 1.05f + (t - 0.55f) * 0.12f : 1 + t * 0.1f;
        float h = 520 * zoom, w = h * art.Width / art.Height;
        GraphicsState state = g.Save();
        using (var band = new GraphicsPath())
        {
            band.AddPolygon(new[] { new PointF(0, H / 2f - 210), new PointF(W, H / 2f - 250), new PointF(W, H / 2f + 210), new PointF(0, H / 2f + 250) });
            g.SetClip(band, CombineMode.Intersect);
            g.InterpolationMode = InterpolationMode.HighQualityBilinear;
            var attrs = new System.Drawing.Imaging.ImageAttributes();
            float a = show;
            attrs.SetColorMatrix(new System.Drawing.Imaging.ColorMatrix { Matrix33 = a });
            g.DrawImage(art, new Rectangle((int)(W / 2f - w / 2), (int)(H / 2f - h / 2 + 30), (int)w, (int)h), 0, 0, art.Width, art.Height, GraphicsUnit.Pixel, attrs);
            if (!dragon)
                Art.Fill(g, Art.Alpha(Color.FromArgb(20, 0, 40), (int)(230 * Math.Clamp(t / 0.55f, 0, 1))), new RectangleF(0, 0, W, H));
            else
                Art.Fill(g, Art.Alpha(Color.FromArgb(255, 30, 40), (int)(25 * show)), new RectangleF(0, 0, W, H));
        }

        g.Restore(state);
        using (var pen = new Pen(Art.Alpha(Color.FromArgb(255, 60, 60), (int)(255 * show)), 5))
        {
            g.DrawLine(pen, 0, H / 2f - 210, W, H / 2f - 250);
            g.DrawLine(pen, 0, H / 2f + 250, W, H / 2f + 210);
        }

        float flash = Math.Clamp(1 - Math.Abs(t - 0.55f) / 0.12f, 0, 1);
        if (flash > 0) Art.Fill(g, Art.Alpha(Color.White, (int)(255 * flash)), new RectangleF(-20, -20, W + 40, H + 40));

        if (dragon)
        {
            float stamp = Math.Clamp((t - 0.65f) / 0.12f, 0, 1);
            int alpha = (int)(255 * Math.Min(stamp * 2, 1) * show);
            float scale = stamp < 1 ? 2.4f - 1.4f * stamp : 1;
            Art.Outlined(g, "龍化", 130, Art.Alpha(Color.FromArgb(255, 60, 60), alpha), Art.Alpha(Art.Ink, alpha), 22, W / 2f, H / 2f + 150, 1, -4, scale, true);
            if (stamp >= 1)
            {
                Art.Outlined(g, "アクノロギア", 30, Art.Alpha(Gold, alpha), Art.Alpha(Art.Ink, alpha), 8, W / 2f, H / 2f + 50, 1, -4, 1, true);
                Art.Outlined(g, "黑龍阿庫諾洛基亞　真身現世！", 26, Art.Alpha(Color.White, alpha), Art.Alpha(Art.Ink, alpha), 7, W / 2f, H / 2f + 240, 1, -4);
            }
        }
    }

    /// <summary>
    /// 防禦小遊戲：黑龍的咆哮蓄力中，盤面上出現四個編號魔法陣，3.4 秒內照 1→4 的順序點完就擋下來。
    /// </summary>
    private void StartQte()
    {
        _qteOn = true;
        _qteT = 0;
        _qteNext = 0;
        _qteTargets.Clear();
        _hint = null;
        _sel = null;
        for (int tries = 0; tries < 400 && _qteTargets.Count < 4; tries++)
        {
            var p = new PointF(BX + 60 + (float)_rng.NextDouble() * (CS * 9 - 120), BY + 90 + (float)_rng.NextDouble() * (CS * 9 - 150));
            if (_qteTargets.All(q => Math.Abs(q.X - p.X) + Math.Abs(q.Y - p.Y) > 150)) _qteTargets.Add(p);
        }

        while (_qteTargets.Count < 4) _qteTargets.Add(new PointF(BX + 90 + _qteTargets.Count * 120, BY + 300));
        _bossAct = 1;
        Sound.Play(Snd.BossAttack, 1, 0.4f, 0.7);
        Sound.Play(Snd.Charge, 1, 0.4f, 0.6);
    }

    private void UpdateQte(float dt)
    {
        _qteT += dt;
        if (_qteT >= QteTime) FinishQte(false);
    }

    private void QteClick()
    {
        if (_qteNext >= _qteTargets.Count) return;
        PointF target = _qteTargets[_qteNext];
        float dx = _mouse.X - target.X, dy = _mouse.Y - target.Y;
        if (dx * dx + dy * dy > QteRadius * QteRadius * 1.3f)
        {
            Sound.Play(Snd.Bad, 0.6f);
            return;
        }

        _qteNext++;
        _fx.Add(new Fx { Kind = FxKind.Ring, X = target.X, Y = target.Y, C = Gold, Size = 140, Max = 0.35f });
        Burst(target.X, target.Y, Gold, 14, 260, true);
        Sound.Play(Snd.Special, 0.9f, 0, 1 + _qteNext * 0.12);
        if (_qteNext >= _qteTargets.Count) FinishQte(true);
    }

    private void FinishQte(bool blocked)
    {
        _qteOn = false;
        StepResult res = _s!.ResolveRoar(blocked);
        _waitSettle = false;
        _wait = 1.1f;
        if (blocked)
        {
            float midX = BX + CS * 4.5f;
            Shout("防いだ!!", midX, BY + 220, Gold, 0, 84);
            Shout("カウンター!!", midX, BY + 330, Color.White, 0.3f, 64);
            _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(255, 246, 200), Max = 0.3f });
            foreach (PointF p in _qteTargets)
                _orbs.Add(new Orb { X0 = p.X, Y0 = p.Y, X1 = BossX + _rng.Next(-40, 41), Y1 = BossY + _rng.Next(-50, 51), Max = 0.45f, C = Gold, HitsBoss = true });
            _texts.Add(new FloatText { S = "-" + res.Damage, X = BossX, Y = BossY - 60, C = Gold, Size = 50, Max = 1.2f, Delay = 0.45f, Shout = true });
            Sound.Play(Snd.Star, 1);
            After(0.45f, () =>
            {
                Sound.Play(Snd.BossHit, 1);
                _bossFlash = 1;
                _shake = Math.Max(_shake, 0.6f);
            });
        }
        else
        {
            ShowBossAttack(res);
            _fx.Add(new Fx { Kind = FxKind.Flash, C = Color.FromArgb(60, 0, 30), Max = 0.5f });
            Shout("ゴアアアァァッ!!!", BX + CS * 4.5f, BY + CS * 4.5f, Color.FromArgb(255, 80, 80), 0, 90);
            Sound.Play(Snd.Boom, 1, 0, 0.5);
            _shake = 1;
        }
    }

    /// <summary>防禦小遊戲的畫面：盤面壓暗、四個編號魔法陣、剩餘時間條，龍口的光越聚越亮。</summary>
    private void DrawQte(Graphics g)
    {
        float left = Math.Clamp(1 - _qteT / QteTime, 0, 1);
        Art.Fill(g, Color.FromArgb(150, 10, 0, 20), BoardRect);
        var bar = new RectangleF(BX + 20, BY + 18, CS * 9 - 40, 22);
        Art.Track(g, bar, 10);
        Art.Fill(g, left > 0.35f ? Gold : Color.FromArgb(255, 80, 80), new RectangleF(bar.X + 3, bar.Y + 3, (bar.Width - 6) * left, bar.Height - 6), 8);
        Art.Outlined(g, "黒竜の咆哮　蓄力中！", 30, Color.FromArgb(255, 90, 90), Art.Ink, 7, BX + CS * 4.5f, BY + 64, 1, 0, 1, true);
        Art.Outlined(g, "照 1→4 的順序點擊魔法陣，擋下黑龍的咆哮！", 18, Color.White, Art.Ink, 5, BX + CS * 4.5f, BY + 100);

        for (int i = 0; i < _qteTargets.Count; i++)
        {
            PointF p = _qteTargets[i];
            bool done = i < _qteNext, next = i == _qteNext;
            float pulse = next ? 1 + 0.12f * (float)Math.Sin(_time * 12) : 1;
            float r = QteRadius * pulse;
            Color color = done ? Color.FromArgb(120, 255, 200) : next ? Gold : Color.FromArgb(200, 190, 230);
            Art.Disc(g, Art.Alpha(color, done ? 60 : 110), 0, p.X, p.Y, r + 10);
            using (var pen = new Pen(Art.Alpha(color, 240), 4)) g.DrawEllipse(pen, p.X - r, p.Y - r, r * 2, r * 2);
            GraphicsState spin = g.Save();
            g.TranslateTransform(p.X, p.Y);
            g.RotateTransform(_time * (i % 2 == 0 ? 90 : -90));
            using (var pen = new Pen(Art.Alpha(color, 200), 2))
            {
                PointF[] star = Enumerable.Range(0, 5).Select(k => new PointF((float)Math.Cos(k * 4 * Math.PI / 5) * r * 0.8f, (float)Math.Sin(k * 4 * Math.PI / 5) * r * 0.8f)).ToArray();
                g.DrawPolygon(pen, star);
            }

            g.Restore(spin);
            Art.Outlined(g, done ? "✓" : (i + 1).ToString(), 34, Color.White, Art.Ink, 7, p.X, p.Y);
        }

        // 魔王欄：龍口聚光，越接近時間到越亮。
        float charge = 1 - left;
        Art.Disc(g, Art.Alpha(Color.FromArgb(200, 120, 255), (int)(80 + 150 * charge)), 0, BossX - 10, BossY + 70, 20 + 40 * charge);
        Art.Disc(g, Art.Alpha(Color.White, (int)(120 + 120 * charge)), 0, BossX - 10, BossY + 70, 8 + 16 * charge);
    }

    /// <summary>龍化之後：畫面四周染上暗紅，慢慢脈動。</summary>
    private void DrawPhaseTwoTint(Graphics g)
    {
        float pulse = 0.5f + 0.5f * (float)Math.Sin(_time * 2.2f);
        Art.Fill(g, Color.FromArgb(30, 0, 0, 0), new RectangleF(0, 0, W, H));
        using var path = new GraphicsPath();
        path.AddEllipse(-W * 0.25f, -H * 0.25f, W * 1.5f, H * 1.5f);
        using var brush = new PathGradientBrush(path)
        {
            CenterColor = Color.FromArgb(0, 120, 0, 10),
            SurroundColors = new[] { Color.FromArgb((int)(60 + 40 * pulse), 140, 0, 20) },
        };
        g.FillRectangle(brush, 0, 0, W, H);
    }

    // ───────────────────────── 擊倒魔王後的妖精尾巴徽章 ─────────────────────────

    private const float FinaleStart = 3.2f, FinaleLength = 3.6f;

    /// <summary>
    /// 魔王倒下後：畫面暗下來，金色的妖精尾巴徽章從中央浮現、發光，背後的光芒慢慢轉，
    /// 最後蓋上「だって俺たちは、フェアリーテイルだから！」。
    /// </summary>
    private void DrawFairyFinale(Graphics g, float t)
    {
        float enter = Math.Clamp(t / 0.5f, 0, 1);
        Art.Fill(g, Color.FromArgb((int)(200 * enter), 10, 6, 20), new RectangleF(-20, -20, W + 40, H + 40));
        float cx = W / 2f, cy = H / 2f - 40;

        // 背後轉動的金色光芒
        GraphicsState rays = g.Save();
        g.TranslateTransform(cx, cy);
        g.RotateTransform(t * 12);
        for (int i = 0; i < 24; i++)
        {
            g.RotateTransform(15);
            using var brush = new SolidBrush(Color.FromArgb((int)((i % 2 == 0 ? 70 : 40) * enter), 255, 214, 110));
            g.FillPolygon(brush, new[] { new PointF(0, 0), new PointF(-26, -900), new PointF(26, -900) });
        }

        g.Restore(rays);

        // 柔光
        using (var path = new GraphicsPath())
        {
            float r = 300 + 20 * (float)Math.Sin(t * 3);
            path.AddEllipse(cx - r, cy - r, r * 2, r * 2);
            using var glow = new PathGradientBrush(path) { CenterColor = Color.FromArgb((int)(170 * enter), 255, 230, 150), SurroundColors = new[] { Color.FromArgb(0, 255, 200, 80) } };
            g.FillPath(glow, path);
        }

        // 徽章：從大到正常大小落下，金色，外面一圈發光的描邊
        float land = Math.Clamp((t - 0.2f) / 0.35f, 0, 1);
        float size = 340 * (1.6f - 0.6f * (1 - (1 - land) * (1 - land)));
        float pulse = 1 + 0.03f * (float)Math.Sin(t * 5);
        if (land > 0)
        {
            int alpha = (int)(255 * land);
            for (int k = 3; k >= 1; k--)
                Art.Mark(g, cx, cy, size * pulse * (1 + k * 0.05f), Color.FromArgb(alpha * 40 / 255, 255, 240, 160));
            Art.Mark(g, cx + 6, cy + 8, size * pulse, Color.FromArgb(alpha * 200 / 255, 60, 30, 0));
            Art.Mark(g, cx, cy, size * pulse, Color.FromArgb(alpha, 255, 196, 50));
            Art.Mark(g, cx - 3, cy - 4, size * pulse * 0.97f, Color.FromArgb(alpha * 70 / 255, 255, 246, 200));
        }

        if (land >= 1 && t - 0.55f < 0.25f)
            Art.Fill(g, Color.FromArgb((int)(220 * (1 - (t - 0.55f) / 0.25f)), 255, 250, 220), new RectangleF(-20, -20, W + 40, H + 40));

        // 台詞：日文，「妖精尾巴」用片假名
        float stamp = Math.Clamp((t - 0.9f) / 0.15f, 0, 1);
        if (stamp > 0)
        {
            int alpha = (int)(255 * stamp);
            float scale = 1.8f - 0.8f * stamp;
            Art.Outlined(g, "だって俺たちは、", 40, Art.Alpha(Color.White, alpha), Art.Alpha(Art.Ink, alpha), 9, cx, cy + 230, 1, 0, scale, true);
            Art.Outlined(g, "フェアリーテイルだから！", 64, Art.Alpha(Gold, alpha), Art.Alpha(Color.FromArgb(90, 40, 0), alpha), 14, cx, cy + 300, 1, 0, scale, true);
        }

        // 金粉
        var rng = new Random(77);
        for (int i = 0; i < 60; i++)
        {
            float x = (float)rng.NextDouble() * W, speed = 40 + (float)rng.NextDouble() * 80;
            float y = H - ((t * speed + (float)rng.NextDouble() * H) % (H + 40));
            Art.Disc(g, Color.FromArgb((int)(180 * enter), 255, 226, 120), 0, x, y, 1.5f + (float)rng.NextDouble() * 2.5f);
        }
    }
}
