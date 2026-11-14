namespace CandyLegend.Core;

public enum StepKind { Idle, Clear, Collapse, Collect, BossAttack, Shuffle, Finale, SkillStart, Fever, Wind, Lightning, Transform, RoarCharge, RoarResult, Won, Lost }

public enum BlastKind { Row, Col, Area, Beam, Bolt, All }

public enum BossAttackKind { Freeze, Stone, Drain }

public enum PlayState { Playing, Won, Lost }

public readonly record struct Removed(Piece Piece, int C, int R, int Wave);

public readonly record struct Blast(BlastKind Kind, int C, int R, int Wave, Element Element, int Size, int FromC, int FromR);

public readonly record struct CellHit(int C, int R, int Wave);

/// <summary>規則每推進一步，就把「發生了什麼」交給畫面去演出。</summary>
public sealed class StepResult
{
    public readonly StepKind Kind;
    public readonly List<Removed> Removed = new();
    public readonly List<Blast> Blasts = new();
    public readonly List<CellHit> JellyHits = new();
    public readonly List<CellHit> Unfrozen = new();
    public readonly List<CellHit> Created = new();
    public readonly List<CellHit> Collected = new();
    public readonly List<CellHit> Afflicted = new();
    public readonly List<int> ChargedFull = new();
    public BossAttackKind Attack;
    public int Skill = -1;

    /// <summary>這招是不是強化版。</summary>
    public bool Boosted;

    /// <summary>合體魔法編號（<see cref="Levels.Unisons"/>），不是合體魔法時是 -1。</summary>
    public int Unison = -1;

    /// <summary>妖精的光耀（六件神器都發動過之後的終極魔法）。</summary>
    public bool Glitter;

    /// <summary>強風轉向後的新風向（+1 往右、-1 往左）。</summary>
    public int Dir;

    /// <summary>黑龍的咆哮有沒有被玩家擋下來（防禦小遊戲的結果）。</summary>
    public bool Blocked;
    public int ScoreGain, Damage, Chain, MaxWave, Candies, Moved, Heal;

    public StepResult(StepKind kind) => Kind = kind;
}

/// <summary>
/// 一關的完整規則：步數、分數、目標、神器充能與魔王。
/// 畫面每演完一段動畫就呼叫一次 <see cref="Advance"/>，自動測試則連續呼叫到停為止，兩者走的是同一套規則。
/// </summary>
public sealed class Session
{
    private const int N = Board.N;

    /// <summary>補進來的新糖晶有多大機率「故意」接成三連，連鎖越深機率越低，才不會消個沒完。</summary>
    public static double MatchBias = 0.5;

    /// <summary>每多一層連鎖，故意接三連的機率乘上這個數。</summary>
    public static double ChainDecay = 0.86;

    /// <summary>連鎖到這一層就不再故意接，保證最後一定會停。</summary>
    public static int ChainCap = 14;

    /// <summary>沒接成三連時，有多大機率至少和鄰居同色，讓盤面一直有好走的步。</summary>
    public static double PairBias = 0.30;

    public readonly Board Board = new();
    public readonly LevelDef Level;
    public readonly Random Rng;

    public int Moves, Score, Chain, BestChain, WinBonus;
    public PlayState State = PlayState.Playing;
    public int JellyTotal, JellyCleared, ShardsCollected, ShardsSpawned, ShardsOnBoard;
    public readonly int[] Charge = new int[6];
    public readonly bool[] Owned = new bool[6];

    /// <summary>第 7–9 關破關後強化過的神器，會放強化版招式。</summary>
    public readonly bool[] Boosted = new bool[6];
    public readonly int ChargeNeed;
    public int BossHp, BossMaxHp, BossCounter, BossAttacks;

    /// <summary>場地機關（強風／落雷）還剩幾步發動，以及已經發動幾次。</summary>
    public int HazardCounter, HazardEvents;

    /// <summary>
    /// 每一條「掉落路線」：由上往下排好的格子。一般是一整行；有傳送門時，
    /// 入口行的格子後面接著出口行的格子，糖晶沿著路線往後掉，新糖晶只從路線起點補。
    /// </summary>
    public readonly List<Point[]> Chains = new();

    /// <summary>天空草原的風向：+1 糖晶往右掉、-1 往左掉；0 是一般往下掉。</summary>
    public int WindDir;

    /// <summary>ラストラッシュ：目標達成後，剩下的每一步都變成特殊糖晶炸掉，分數全部算進去。</summary>
    public bool Finale;
    public int FinaleScore, MovesAtGoal;

    /// <summary>
    /// FAIRY FEVER：一步之內連鎖達到 <see cref="FeverChain"/> 就觸發，接下來三步的分數都 ×2。
    /// </summary>
    public const int FeverChain = 7;
    public int FeverMoves, FeverCount;

    /// <summary>每件神器這一關自動發動了幾次。</summary>
    public readonly int[] SkillUses = new int[6];

    /// <summary>
    /// 妖精的光耀的六盞燈：神器每發動一次就點亮自己那一盞（合體魔法點亮兩盞），
    /// 六件神器都在身上、六盞全亮時，下一次盤面靜止就施放妖精的光耀，燈全部熄掉重來。
    /// </summary>
    public readonly bool[] GlitterLamp = new bool[6];
    public int GlitterUses;

    public bool GlitterReady => Owned.All(o => o) && GlitterLamp.All(l => l);

    /// <summary>每種合體魔法這一關各放了幾次。</summary>
    public readonly int[] UnisonUses = new int[Levels.Unisons.Length];
    private int _nextSkill;
    private bool _feverThisMove;
    private int _moveBestChain;

    public bool FeverActive => FeverMoves > 0 || (_feverThisMove && _resolving);

    private readonly bool[,] _done = new bool[N, N];
    private readonly Queue<(Piece Piece, int C, int R, int Wave)> _acts = new();
    private readonly int[] _cElem = new int[6];
    private int _cCandies, _cJelly, _cStones, _cUnfrozen, _cActs;
    private bool _resolving, _needCollapse, _playerMove;
    private Pending? _pending;
    private Point? _pref1, _pref2;
    private bool _swapHorizontal;
    private int _movesSinceShard, _shuffleFails, _finaleSweeps, _skillsThisMove;
    private bool _skillActive;

    private sealed class Pending
    {
        public int Skill = -1, Unison = -1;
        public bool Glitter;
        public Piece? A, B;
        public Point At, Other;
    }

    public bool IsBoss => Level.BossHp > 0;
    /// <summary>
    /// 第二階段：血量第一次掉到一半，阿庫諾洛基亞從人形態龍化。之後就算回血也維持龍形態。
    /// </summary>
    public bool PhaseTwo;
    private bool _transformDue;

    /// <summary>龍化後，黑龍的咆哮要先蓄力：畫面跳出防禦小遊戲，等玩家擋下或失敗才繼續。</summary>
    public bool AwaitingRoar;
    public int RoarsBlocked, RoarsTaken;

    public bool Enraged => IsBoss && PhaseTwo;
    public bool Busy => _resolving;

    public bool GoalsMet =>
        JellyCleared >= JellyTotal && ShardsCollected >= Level.Shards && (!IsBoss || BossHp <= 0) &&
        Score >= Level.TargetScore;

    public int Stars => State != PlayState.Won ? 0 : Score >= Level.Star3 ? 3 : Score >= Level.Star2 ? 2 : 1;

    public Session(LevelDef level, int artifactsOwned, int awaken, int seed)
    {
        Level = level;
        Rng = new Random(seed);
        Moves = level.Moves;
        for (int i = 0; i < 6; i++)
        {
            Owned[i] = i < artifactsOwned;
            Boosted[i] = Levels.IsBoosted(i, awaken);
        }

        ChargeNeed = 28 - 2 * Math.Clamp(awaken, 0, 3);
        BossHp = BossMaxHp = level.BossHp;
        BossCounter = 3;
        HazardCounter = level.HazardEvery;
        WindDir = level.Hazard == Hazard.Wind ? 1 : 0;
        BuildChains();
        Build();
    }

    private void Build()
    {
        for (int attempt = 0; attempt < 200; attempt++)
        {
            for (int r = 0; r < N; r++)
            {
                for (int c = 0; c < N; c++)
                {
                    int e;
                    do e = Rng.Next(Board.Elements);
                    while ((c >= 2 && Same(c - 1, r, e) && Same(c - 2, r, e)) || (r >= 2 && Same(c, r - 1, e) && Same(c, r - 2, e)));
                    Board.Cells[c, r] = new Piece { Kind = PieceKind.Candy, Element = (Element)e, X = c, Y = r };
                }
            }

            if (Board.HasAnyMove()) break;
        }

        JellyTotal = 0;
        for (int r = 0; r < N; r++)
        {
            for (int c = 0; c < N; c++)
            {
                char j = r < Level.Jelly.Length && c < Level.Jelly[r].Length ? Level.Jelly[r][c] : '.';
                Board.Jelly[c, r] = j is '1' or '2' ? j - '0' : 0;
                JellyTotal += Board.Jelly[c, r];
                char b = r < Level.Blocks.Length && c < Level.Blocks[r].Length ? Level.Blocks[r][c] : '.';
                if (b == 'S') Board.Cells[c, r] = new Piece { Kind = PieceKind.Stone, X = c, Y = r };
                else if (b == 'F') Board.Cells[c, r]!.Frozen = true;
                else if (b == 'D') Board.Cells[c, r]!.Frozen = Board.Cells[c, r]!.ThickIce = true;
            }
        }

        // 掉落物一開始就放在最上面一排，玩家一進關卡就看得到要護送什麼。
        int first = Math.Min(Level.ShardMax, Level.Shards);
        var columns = Enumerable.Range(0, N).OrderBy(_ => Rng.Next()).Take(first);
        foreach (int c in columns)
        {
            Board.Cells[c, 0] = new Piece { Kind = PieceKind.Shard, X = c, Y = 0 };
            ShardsSpawned++;
            ShardsOnBoard++;
        }

        if (!Board.HasAnyMove()) Shuffle();
    }

    private bool Same(int c, int r, int e)
    {
        Piece? p = Board.Cells[c, r];
        return p != null && p.Matchable && (int)p.Element == e;
    }

    // ───────────────────────── 玩家的動作 ─────────────────────────

    public bool TrySwap(Point a, Point b)
    {
        if (State != PlayState.Playing || _resolving) return false;
        if (!Board.In(a.X, a.Y) || !Board.In(b.X, b.Y)) return false;
        if (Math.Abs(a.X - b.X) + Math.Abs(a.Y - b.Y) != 1) return false;
        Piece? pa = Board.Cells[a.X, a.Y], pb = Board.Cells[b.X, b.Y];
        if (pa == null || pb == null || !pa.Movable || !pb.Movable) return false;
        bool combo = Board.IsCombo(pa, pb);
        Board.Cells[a.X, a.Y] = pb;
        Board.Cells[b.X, b.Y] = pa;
        if (!combo && Board.FindMatches().Count == 0)
        {
            Board.Cells[a.X, a.Y] = pa;
            Board.Cells[b.X, b.Y] = pb;
            return false;
        }

        Moves--;
        Chain = 0;
        _movesSinceShard++;
        _resolving = true;
        _playerMove = true;
        _skillActive = false;
        _skillsThisMove = 0;
        _feverThisMove = FeverMoves > 0;
        if (_feverThisMove) FeverMoves--;
        _moveBestChain = 0;
        _pref1 = b;
        _pref2 = a;
        _swapHorizontal = a.Y == b.Y;
        if (combo) _pending = new Pending { A = pa, B = pb, At = b, Other = a };
        return true;
    }

    public bool CanUse(int artifact) =>
        State == PlayState.Playing && !_resolving && artifact is >= 0 and < 6 &&
        Owned[artifact] && Charge[artifact] >= ChargeNeed;

    public bool UseArtifact(int artifact)
    {
        if (!CanUse(artifact)) return false;
        Charge[artifact] = 0;
        Chain = 0;
        _resolving = true;
        _playerMove = false;
        _skillActive = true;
        _pending = new Pending { Skill = artifact };
        return true;
    }

    // ───────────────────────── 展示模式用 ─────────────────────────

    /// <summary>展示模式：血量剛好一半，立刻龍化。</summary>
    public void DemoTransform()
    {
        BossHp = BossMaxHp / 2;
        _transformDue = true;
        _resolving = true;
    }

    /// <summary>展示模式：直接進入第二階段，黑龍的咆哮已經在蓄力（防禦小遊戲）。</summary>
    public void DemoRoar()
    {
        BossHp = BossMaxHp / 2;
        PhaseTwo = true;
        BossAttacks += (4 - BossAttacks % 3) % 3 + 1;
        BossCounter = 2;
        _resolving = true;
        AwaitingRoar = true;
    }

    /// <summary>展示模式：魔王血量歸零，直接進入擊倒演出。</summary>
    public void DemoDefeat()
    {
        PhaseTwo = true;
        BossHp = 0;
        _resolving = true;
    }

    /// <summary>只給截圖與自動測試用：直接放妖精的光耀（遊戲中是六盞燈全亮時自動發動）。</summary>
    public bool UseGlitter()
    {
        if (State != PlayState.Playing || _resolving) return false;
        Array.Clear(GlitterLamp);
        GlitterUses++;
        Chain = 0;
        _resolving = true;
        _playerMove = false;
        _skillActive = true;
        _pending = new Pending { Glitter = true };
        return true;
    }

    /// <summary>只給截圖與自動測試用：直接放某個合體魔法（遊戲中是充能條件滿足時自動發動）。</summary>
    public bool UseUnison(int unison)
    {
        UnisonInfo info = Levels.Unisons[unison];
        if (State != PlayState.Playing || _resolving || !Owned[info.A] || !Owned[info.B]) return false;
        Charge[info.A] = Charge[info.B] = 0;
        UnisonUses[unison]++;
        Chain = 0;
        _resolving = true;
        _playerMove = false;
        _skillActive = true;
        _pending = new Pending { Skill = info.A, Unison = unison };
        return true;
    }

    // ───────────────────────── 推進一步 ─────────────────────────

    public StepResult Advance()
    {
        if (State == PlayState.Won) return new StepResult(StepKind.Won);
        if (State == PlayState.Lost) return new StepResult(StepKind.Lost);
        if (!_resolving || AwaitingRoar) return new StepResult(StepKind.Idle);

        if (_needCollapse)
        {
            _needCollapse = false;
            return Collapse();
        }

        if (_pending != null)
        {
            Pending pending = _pending;
            _pending = null;
            Chain++;
            _needCollapse = true;
            return pending.Glitter ? RunGlitter()
                : pending.Unison >= 0 ? RunUnison(pending.Unison)
                : pending.Skill >= 0 ? RunSkill(pending.Skill) : RunCombo(pending);
        }

        List<MatchGroup> groups = Board.FindMatches(_pref1, _pref2, _swapHorizontal, Rng);
        _pref1 = _pref2 = null;
        if (groups.Count > 0)
        {
            Chain++;
            _needCollapse = true;
            return ClearGroups(groups);
        }

        StepResult? collected = CollectShards();
        if (collected != null)
        {
            _needCollapse = true;
            return collected;
        }

        // 盤面已經靜止：神器充滿就自動發動。每走一步最多發動一招，其他充滿的神器排到下一步，
        // 否則長連鎖一次充滿好幾件，特寫會一直打斷遊戲。
        // 這一步連鎖夠長就進入 FAIRY FEVER（FEVER 中不會重複觸發）。
        if (_playerMove && !GoalsMet && !Finale && FeverMoves == 0 && !_feverThisMove && _moveBestChain >= FeverChain)
        {
            _moveBestChain = 0;
            FeverMoves = 3;
            FeverCount++;
            return new StepResult(StepKind.Fever);
        }

        // 血量第一次掉到一半：龍化。下一招固定是黑龍的咆哮，兩步後發動。
        if (_transformDue && State == PlayState.Playing && BossHp > 0)
        {
            _transformDue = false;
            PhaseTwo = true;
            BossAttacks += (4 - BossAttacks % 3) % 3;
            BossCounter = 2;
            return new StepResult(StepKind.Transform);
        }

        // 充滿的神器馬上自動發動；同時充滿好幾件就一件接一件放完，不用等玩家再走一步。
        // （技能造成的消除不會充能，所以最多連放六招，不會沒完沒了。）
        if (!GoalsMet && !Finale)
        {
            // 六盞燈全亮：先放妖精的光耀。
            if (GlitterReady)
            {
                Array.Clear(GlitterLamp);
                GlitterUses++;
                Chain = 0;
                _skillActive = true;
                _skillsThisMove++;
                _pending = new Pending { Glitter = true };
                return new StepResult(StepKind.SkillStart) { Glitter = true };
            }

            // 從上次發動的下一件開始找，六件神器輪流發動；
            // 如果每次都從第一件找起，前面的神器一充滿就插隊，後面的永遠排不到。
            for (int k = 0; k < 6; k++)
            {
                int a = (_nextSkill + k) % 6;
                if (!Owned[a] || Charge[a] < ChargeNeed) continue;
                _nextSkill = (a + 1) % 6;
                SkillUses[a]++;
                Charge[a] = 0;
                GlitterLamp[a] = true;
                Chain = 0;
                _skillActive = true;
                _skillsThisMove++;

                // 合體魔法：搭檔也同時充滿，就兩人合放一招，搭檔的充能一起用掉。
                // 合體魔法一次用掉兩件神器的充能，所以分數 ×4、傷害也比兩招分開放更高。
                int partner = Levels.Partner(a);
                if (partner >= 0 && Owned[partner] && Charge[partner] >= ChargeNeed)
                {
                    int u = Levels.UnisonOf(a);
                    SkillUses[partner]++;
                    GlitterLamp[partner] = true;
                    UnisonUses[u]++;
                    Charge[partner] = 0;
                    _pending = new Pending { Skill = a, Unison = u };
                    return new StepResult(StepKind.SkillStart) { Skill = a, Unison = u };
                }

                _pending = new Pending { Skill = a };
                return new StepResult(StepKind.SkillStart) { Skill = a, Boosted = Boosted[a] };
            }
        }

        // 依序檢查過關、魔王行動、失敗、沒步可走。
        if (GoalsMet)
        {
            if (!IsBoss)
            {
                StepResult? rush = FinaleStep();
                if (rush != null) return rush;
            }

            State = PlayState.Won;
            if (IsBoss) MovesAtGoal = Moves;
            WinBonus = IsBoss ? Moves * 400 : 0;
            Score += WinBonus;
            _resolving = false;
            return new StepResult(StepKind.Won);
        }

        if (_playerMove)
        {
            _playerMove = false;
            if (IsBoss && --BossCounter <= 0) return BossAttack();
            if (Level.Hazard != Hazard.None && --HazardCounter <= 0)
            {
                HazardCounter = Level.HazardEvery;
                HazardEvents++;
                return Level.Hazard == Hazard.Wind ? WindGust() : LightningStrike();
            }
        }

        if (Moves <= 0)
        {
            State = PlayState.Lost;
            _resolving = false;
            return new StepResult(StepKind.Lost);
        }

        if (!Board.HasAnyMove())
        {
            if (++_shuffleFails > 6)
            {
                State = PlayState.Lost;
                _resolving = false;
                return new StepResult(StepKind.Lost);
            }

            Shuffle();
            return new StepResult(StepKind.Shuffle);
        }

        _shuffleFails = 0;
        _resolving = false;
        return new StepResult(StepKind.Idle);
    }

    // ───────────────────────── 消除 ─────────────────────────

    private StepResult BeginClear()
    {
        Array.Clear(_done);
        Array.Clear(_cElem);
        _acts.Clear();
        _cCandies = _cJelly = _cStones = _cUnfrozen = _cActs = 0;
        return new StepResult(StepKind.Clear);
    }

    /// <summary>
    /// 打中一格：果凍少一層；岩石碎掉；冰封的糖晶只會解凍；一般糖晶被消除，特殊糖晶還會接著發動。
    /// 掉落物不受任何攻擊影響。
    /// </summary>
    private void Hit(int c, int r, int wave, StepResult res, bool trigger = true)
    {
        if (!Board.In(c, r) || _done[c, r]) return;
        _done[c, r] = true;
        Piece? p = Board.Cells[c, r];
        if (p != null && p.Kind == PieceKind.Shard) return;
        if (Board.Jelly[c, r] > 0)
        {
            Board.Jelly[c, r]--;
            JellyCleared++;
            _cJelly++;
            res.JellyHits.Add(new CellHit(c, r, wave));
        }

        if (p == null) return;
        if (wave > res.MaxWave) res.MaxWave = wave;
        if (p.Kind == PieceKind.Stone)
        {
            Board.Cells[c, r] = null;
            res.Removed.Add(new Removed(p, c, r, wave));
            _cStones++;
            return;
        }

        if (p.Frozen)
        {
            // 厚冰第一次被打只會變薄。
            if (p.ThickIce) p.ThickIce = false;
            else p.Frozen = false;
            res.Unfrozen.Add(new CellHit(c, r, wave));
            _cUnfrozen++;
            return;
        }

        Board.Cells[c, r] = null;
        res.Removed.Add(new Removed(p, c, r, wave));
        _cCandies++;
        if (p.Special != Special.Core) _cElem[(int)p.Element]++;
        if (trigger && p.Special != Special.None) _acts.Enqueue((p, c, r, wave + 1));
    }

    private void BlastRow(int r, int from, int wave, Element e, StepResult res)
    {
        res.Blasts.Add(new Blast(BlastKind.Row, from, r, wave, e, 1, from, r));
        for (int c = 0; c < N; c++) Hit(c, r, wave + Math.Abs(c - from) / 2, res);
    }

    private void BlastCol(int c, int from, int wave, Element e, StepResult res)
    {
        res.Blasts.Add(new Blast(BlastKind.Col, c, from, wave, e, 1, c, from));
        for (int r = 0; r < N; r++) Hit(c, r, wave + Math.Abs(r - from) / 2, res);
    }

    private void BlastArea(int c, int r, int radius, int wave, Element e, StepResult res)
    {
        res.Blasts.Add(new Blast(BlastKind.Area, c, r, wave, e, radius, c, r));
        for (int dc = -radius; dc <= radius; dc++)
            for (int dr = -radius; dr <= radius; dr++)
                Hit(c + dc, r + dr, wave + Math.Max(Math.Abs(dc), Math.Abs(dr)) - 1, res);
    }

    private void BlastElement(int e, int fromC, int fromR, int wave, StepResult res)
    {
        for (int c = 0; c < N; c++)
        {
            for (int r = 0; r < N; r++)
            {
                Piece? p = Board.Cells[c, r];
                if (p == null || !p.Matchable || (int)p.Element != e || _done[c, r]) continue;
                res.Blasts.Add(new Blast(BlastKind.Beam, c, r, wave, (Element)e, 1, fromC, fromR));
                Hit(c, r, wave + 1, res);
            }
        }
    }

    private void RunActivations(StepResult res)
    {
        while (_acts.Count > 0)
        {
            var (p, c, r, wave) = _acts.Dequeue();
            _cActs++;
            switch (p.Special)
            {
                case Special.LineH: BlastRow(r, c, wave, p.Element, res); break;
                case Special.LineV: BlastCol(c, r, wave, p.Element, res); break;
                case Special.Bomb: BlastArea(c, r, 1, wave, p.Element, res); break;
                case Special.Core: BlastElement(MostCommonElement(), c, r, wave, res); break;
            }
        }
    }

    private int MostCommonElement()
    {
        int[] count = new int[6];
        foreach (Piece? p in Board.Cells)
            if (p != null && p.Matchable) count[(int)p.Element]++;
        int best = 0;
        for (int e = 1; e < 6; e++)
            if (count[e] > count[best]) best = e;
        return best;
    }

    private StepResult ClearGroups(List<MatchGroup> groups)
    {
        StepResult res = BeginClear();
        foreach (MatchGroup g in groups)
            foreach (Point p in g.Cells)
                Hit(p.X, p.Y, 0, res);

        // 在岩石旁邊配對成功，岩石就會碎掉。
        foreach (MatchGroup g in groups)
        {
            foreach (Point p in g.Cells)
            {
                BreakStone(p.X - 1, p.Y, res);
                BreakStone(p.X + 1, p.Y, res);
                BreakStone(p.X, p.Y - 1, res);
                BreakStone(p.X, p.Y + 1, res);
            }
        }

        RunActivations(res);

        int bonus = 0;
        foreach (MatchGroup g in groups)
        {
            // ラストラッシュ期間不再生成新的特殊糖晶，否則會一直炸、一直生、停不下來。
            if (g.Creates == Special.None || Finale) continue;
            Point at = g.CreateAt;
            if (Board.Cells[at.X, at.Y] != null)
            {
                // 原本要生成的位置還有東西（例如只是解凍），就換到這組其他空出來的格子。
                int index = g.Cells.FindIndex(p => Board.Cells[p.X, p.Y] == null);
                if (index < 0) continue;
                at = g.Cells[index];
            }

            Board.Cells[at.X, at.Y] = new Piece
            {
                Kind = PieceKind.Candy, Element = g.Element, Special = g.Creates, X = at.X, Y = at.Y, Pop = 1,
            };
            res.Created.Add(new CellHit(at.X, at.Y, 0));
            bonus += g.Creates switch { Special.Core => 800, Special.Bomb => 400, _ => 200 };
        }

        return Finish(res, bonus, false);
    }

    private void BreakStone(int c, int r, StepResult res)
    {
        if (Board.In(c, r) && Board.Cells[c, r]?.Kind == PieceKind.Stone) Hit(c, r, 1, res);
    }

    private StepResult RunCombo(Pending pending)
    {
        StepResult res = BeginClear();
        Piece a = pending.A!, b = pending.B!;
        Point at = pending.At, other = pending.Other;
        if (a.Special == Special.Core && b.Special == Special.Core)
        {
            // 雙核心：整個盤面一起消掉。
            res.Blasts.Add(new Blast(BlastKind.All, at.X, at.Y, 0, Element.Star, 9, at.X, at.Y));
            for (int c = 0; c < N; c++)
                for (int r = 0; r < N; r++)
                    Hit(c, r, (Math.Abs(c - at.X) + Math.Abs(r - at.Y)) / 2, res, false);
        }
        else if (a.Special == Special.Core || b.Special == Special.Core)
        {
            bool coreIsA = a.Special == Special.Core;
            Piece partner = coreIsA ? b : a;
            Point corePos = coreIsA ? at : other;
            int e = (int)partner.Element;
            Special spread = partner.Special;
            Hit(corePos.X, corePos.Y, 0, res, false);
            if (spread != Special.None)
            {
                // 核心配特殊糖晶：同屬性的全部變成那種特殊糖晶，再一起發動。
                foreach (Piece? p in Board.Cells)
                {
                    if (p == null || !p.Matchable || (int)p.Element != e || p.Frozen) continue;
                    p.Special = spread == Special.Bomb ? Special.Bomb : Rng.Next(2) == 0 ? Special.LineH : Special.LineV;
                }
            }

            BlastElement(e, corePos.X, corePos.Y, 0, res);
        }
        else
        {
            bool lineA = a.IsLine, lineB = b.IsLine;
            Element e = a.Element;
            Hit(at.X, at.Y, 0, res, false);
            Hit(other.X, other.Y, 0, res, false);
            _done[at.X, at.Y] = _done[other.X, other.Y] = true;
            if (lineA && lineB)
            {
                BlastRow(at.Y, at.X, 0, e, res);
                BlastCol(at.X, at.Y, 0, b.Element, res);
            }
            else if (lineA || lineB)
            {
                for (int d = -1; d <= 1; d++)
                {
                    if (Board.In(at.X, at.Y + d)) BlastRow(at.Y + d, at.X, 0, e, res);
                    if (Board.In(at.X + d, at.Y)) BlastCol(at.X + d, at.Y, 0, b.Element, res);
                }
            }
            else
            {
                BlastArea(at.X, at.Y, 2, 0, e, res);
            }
        }

        RunActivations(res);
        return Finish(res, 500, false);
    }

    // ───────────────────────── 神器技能 ─────────────────────────

    private int Obstacle(int c, int r)
    {
        int v = Board.Jelly[c, r] * 2;
        Piece? p = Board.Cells[c, r];
        if (p == null) return v;
        if (p.Kind == PieceKind.Stone) v += 3;
        else if (p.Frozen) v += 2;
        return v;
    }

    /// <summary>障礙最多的 (2r+1)×(2r+1) 範圍中心，還沒被這招打過的格子才算。</summary>
    private Point BestSpot(int radius)
    {
        double best = -1;
        var at = new Point(4, 4);
        for (int c = radius; c < N - radius; c++)
        {
            for (int r = radius; r < N - radius; r++)
            {
                double v = Rng.NextDouble();
                for (int dc = -radius; dc <= radius; dc++)
                    for (int dr = -radius; dr <= radius; dr++)
                        v += _done[c + dc, r + dr] ? 0 : 1 + Obstacle(c + dc, r + dr);
                if (v <= best) continue;
                best = v;
                at = new Point(c, r);
            }
        }

        return at;
    }

    /// <summary>整排加整行障礙最多的十字交點，還沒被打過的格子才算。</summary>
    private Point BestCross()
    {
        double best = -1;
        var at = new Point(4, 4);
        for (int c = 0; c < N; c++)
        {
            for (int r = 0; r < N; r++)
            {
                double v = Rng.NextDouble();
                for (int k = 0; k < N; k++)
                {
                    if (!_done[k, r]) v += 1 + Obstacle(k, r);
                    if (k != r && !_done[c, k]) v += 1 + Obstacle(c, k);
                }

                if (v <= best) continue;
                best = v;
                at = new Point(c, r);
            }
        }

        return at;
    }

    /// <summary>在被炸空的格子裡放下特殊糖晶，留給玩家之後引爆。</summary>
    private void PlantSpecials(int count, Special kind, Element element, StepResult res)
    {
        var empty = new List<Point>();
        for (int c = 0; c < N; c++)
            for (int r = 0; r < N; r++)
                if (Board.Cells[c, r] == null) empty.Add(new Point(c, r));
        foreach (Point p in empty.OrderBy(_ => Rng.Next()).Take(count))
        {
            Board.Cells[p.X, p.Y] = new Piece { Kind = PieceKind.Candy, Element = element, Special = kind, X = p.X, Y = p.Y, Pop = 1 };
            res.Created.Add(new CellHit(p.X, p.Y, res.MaxWave));
        }
    }

    private StepResult RunSkill(int skill)
    {
        StepResult res = BeginClear();
        res.Skill = skill;
        var element = (Element)skill;
        bool boost = Boosted[skill];
        res.Boosted = boost;
        switch (skill)
        {
            case 0:
            {
                // 紅蓮爆炎刃：挑障礙最多的五個 3×3。強化版「炎竜王の崩拳」：六個，再加一記 5×5 的拳，留下兩顆炸彈火種。
                var used = new bool[N, N];
                for (int n = 0; n < (boost ? 6 : 5); n++)
                {
                    double best = -1;
                    int bc = 4, br = 4;
                    for (int c = 1; c < N - 1; c++)
                    {
                        for (int r = 1; r < N - 1; r++)
                        {
                            double v = Rng.NextDouble();
                            for (int dc = -1; dc <= 1; dc++)
                                for (int dr = -1; dr <= 1; dr++)
                                    v += used[c + dc, r + dr] ? -3 : Obstacle(c + dc, r + dr);
                            if (v <= best) continue;
                            best = v;
                            bc = c;
                            br = r;
                        }
                    }

                    for (int dc = -1; dc <= 1; dc++)
                        for (int dr = -1; dr <= 1; dr++)
                            used[bc + dc, br + dr] = true;
                    BlastArea(bc, br, 1, n * 2, element, res);
                }

                if (boost)
                {
                    Point fist = BestSpot(2);
                    BlastArea(fist.X, fist.Y, 2, 13, element, res);
                    RunActivations(res);
                    PlantSpecials(2, Special.Bomb, element, res);
                }

                break;
            }
            case 1:
            {
                // 絕對冰結：多一步，粉碎所有冰封與岩石，再凍碎十二格。
                // （自動發動很頻繁，加太多步會讓步數越滾越多。）
                // 魔王戰裡不加步數（技能很頻繁，加步數會讓戰鬥越打越長），改成把魔王的下一招往後拖兩步。
                if (IsBoss) BossCounter += 2;
                else Moves += 1;
                for (int c = 0; c < N; c++)
                {
                    for (int r = 0; r < N; r++)
                    {
                        Piece? p = Board.Cells[c, r];
                        if (p == null || (!p.Frozen && p.Kind != PieceKind.Stone)) continue;
                        res.Blasts.Add(new Blast(BlastKind.Bolt, c, r, 0, element, 1, c, r));
                        Hit(c, r, (c + r) / 3, res);
                    }
                }

                var extra = new List<Point>();
                for (int c = 0; c < N; c++)
                    for (int r = 0; r < N; r++)
                        if (!_done[c, r] && Board.Cells[c, r] is { Kind: PieceKind.Candy })
                            extra.Add(new Point(c, r));
                foreach (Point p in extra.OrderBy(_ => Rng.Next()).Take(boost ? 16 : 12))
                {
                    res.Blasts.Add(new Blast(BlastKind.Bolt, p.X, p.Y, 0, element, 1, p.X, p.Y));
                    Hit(p.X, p.Y, (p.X + p.Y) / 3, res);
                }

                if (boost)
                {
                    // 氷魔の激昂：三道冰槍從天而降，貫穿障礙最多的三個直行。
                    var cols = Enumerable.Range(0, N)
                        .Select(c => (Col: c, Value: Enumerable.Range(0, N).Sum(r => Obstacle(c, r)) + Rng.NextDouble()))
                        .OrderByDescending(x => x.Value).Take(3).ToList();
                    for (int i = 0; i < cols.Count; i++) BlastCol(cols[i].Col, 0, 7 + i * 2, element, res);
                }

                break;
            }
            case 2:
            {
                // 照破・天空穿：貫穿三整排，優先選障礙多、或在掉落物下方的排。
                var rows = Enumerable.Range(0, N).Select(r =>
                {
                    double v = r * 0.1 + Rng.NextDouble() * 0.5;
                    for (int c = 0; c < N; c++)
                    {
                        v += Obstacle(c, r);
                        for (int k = 0; k < r; k++)
                            if (Board.Cells[c, k]?.Kind == PieceKind.Shard) v += 4;
                    }

                    return (Row: r, Value: v);
                }).OrderByDescending(x => x.Value).Take(boost ? 4 : 3).ToList();
                for (int i = 0; i < rows.Count; i++) BlastRow(rows[i].Row, i % 2 == 0 ? 0 : N - 1, i * 3, element, res);
                if (boost)
                {
                    // ミルキーウェイ：銀河漩渦捲走 5×5，每條哈比的魚正下方整行打通。
                    Point eye = BestSpot(2);
                    BlastArea(eye.X, eye.Y, 2, 12, element, res);
                    for (int c = 0; c < N; c++)
                    {
                        for (int r = 0; r < N - 1; r++)
                        {
                            if (Board.Cells[c, r]?.Kind != PieceKind.Shard) continue;
                            BlastCol(c, r, 14, element, res);
                            break;
                        }
                    }
                }

                break;
            }
            case 3:
            {
                // 神鳴殿：十八道落雷，優先劈障礙。
                var cells = new List<(int C, int R, double Value)>();
                for (int c = 0; c < N; c++)
                    for (int r = 0; r < N; r++)
                        if (Board.Cells[c, r] is { Kind: not PieceKind.Shard })
                            cells.Add((c, r, Obstacle(c, r) * 10 + Rng.NextDouble()));
                int n = 0;
                foreach (var cell in cells.OrderByDescending(x => x.Value).Take(boost ? 24 : 18))
                {
                    int w = boost ? n * 3 / 4 : n;
                    res.Blasts.Add(new Blast(BlastKind.Bolt, cell.C, cell.R, w, element, 1, cell.C, cell.R));
                    Hit(cell.C, cell.R, w, res);
                    n++;
                }

                if (boost)
                {
                    // 雷竜方天戟：雷戟落在障礙最多的十字上，整排整行一起貫穿。
                    Point at = BestCross();
                    BlastRow(at.Y, at.X, 19, element, res);
                    BlastCol(at.X, at.Y, 19, element, res);
                }

                break;
            }
            case 4:
            {
                // 全天星辰（ウラノ・メトリア）：五顆普通糖晶變成特殊糖晶，馬上引爆。
                var cells = new List<Point>();
                for (int c = 0; c < N; c++)
                    for (int r = 0; r < N; r++)
                        if (Board.Cells[c, r] is { Kind: PieceKind.Candy, Special: Special.None, Frozen: false })
                            cells.Add(new Point(c, r));
                // 強化版「スタードレス」：八顆，最後一顆是核心，消滅場上最多的屬性。
                Special[] kinds = boost
                    ? new[] { Special.Bomb, Special.LineH, Special.LineV, Special.Bomb, Special.LineH, Special.LineV, Special.Bomb, Special.Core }
                    : new[] { Special.Bomb, Special.LineH, Special.LineV, Special.Bomb, Special.LineH };
                int n = 0;
                foreach (Point p in cells.OrderBy(_ => Rng.Next()).Take(kinds.Length))
                {
                    Board.Cells[p.X, p.Y]!.Special = kinds[n];
                    res.Blasts.Add(new Blast(BlastKind.Bolt, p.X, p.Y, n * 2, element, 1, p.X, p.Y));
                    Hit(p.X, p.Y, n * 2, res);
                    n++;
                }

                break;
            }
            default:
            {
                // 天輪・五芒星之劍：場上最多的兩種屬性全部斬掉，岩石也一起。
                int first = MostCommonElement();
                BlastElement(first, 4, 4, 0, res);
                int second = MostCommonElement();
                if (second != first) BlastElement(second, 4, 4, 3, res);
                if (boost)
                {
                    // 天輪・繚乱の剣：再斬第三種屬性。
                    int third = MostCommonElement();
                    if (third != first && third != second) BlastElement(third, 4, 4, 6, res);
                }

                for (int c = 0; c < N; c++)
                    for (int r = 0; r < N; r++)
                        if (Board.Cells[c, r]?.Kind == PieceKind.Stone)
                            Hit(c, r, 2, res);
                break;
            }
        }

        RunActivations(res);
        return Finish(res, 300, true);
    }

    /// <summary>
    /// 合體魔法：比兩招各放一次更大的單一招式。兩件神器任一件強化過，合體魔法也跟著加量。
    /// </summary>
    private StepResult RunUnison(int unison)
    {
        StepResult res = BeginClear();
        UnisonInfo info = Levels.Unisons[unison];
        res.Skill = info.A;
        res.Unison = unison;
        bool boost = Boosted[info.A] || Boosted[info.B];
        var ea = (Element)info.A;
        var eb = (Element)info.B;
        switch (unison)
        {
            case 0:
            {
                // 雷炎竜の咆哮：三排寬的雷炎吐息從左邊橫掃，接著雷炎劈在障礙最多的地方。
                int row = Math.Clamp(BestRow(), 1, N - 2);
                for (int k = -1; k <= 1; k++) BlastRow(row + k, 0, Math.Abs(k), ea, res);
                var cells = new List<(int C, int R, double Value)>();
                for (int c = 0; c < N; c++)
                    for (int r = 0; r < N; r++)
                        if (!_done[c, r] && Board.Cells[c, r] is { Kind: not PieceKind.Shard })
                            cells.Add((c, r, Obstacle(c, r) * 10 + Rng.NextDouble()));
                int n = 0;
                foreach (var cell in cells.OrderByDescending(x => x.Value).Take(boost ? 16 : 12))
                {
                    int w = 7 + n / 2;
                    res.Blasts.Add(new Blast(BlastKind.Bolt, cell.C, cell.R, w, n % 2 == 0 ? eb : ea, 1, cell.C, cell.R));
                    Hit(cell.C, cell.R, w, res);
                    n++;
                }

                if (boost)
                {
                    Point at = BestSpot(1);
                    BlastArea(at.X, at.Y, 1, 14, ea, res);
                }

                break;
            }
            default:
            {
                // 天竜の咆哮×サンドバスター：三行寬的沙暴龍捲由下往上貫穿，再把五顆糖晶捲成特殊糖晶引爆。
                int col = Math.Clamp(BestCol(), 1, N - 2);
                for (int k = -1; k <= 1; k++) BlastCol(col + k, N - 1, Math.Abs(k), ea, res);
                var cells = new List<Point>();
                for (int c = 0; c < N; c++)
                    for (int r = 0; r < N; r++)
                        if (!_done[c, r] && Board.Cells[c, r] is { Kind: PieceKind.Candy, Special: Special.None, Frozen: false })
                            cells.Add(new Point(c, r));
                Special[] kinds = boost
                    ? new[] { Special.LineH, Special.Bomb, Special.LineH, Special.Bomb, Special.LineH, Special.Bomb, Special.Core }
                    : new[] { Special.LineH, Special.Bomb, Special.LineH, Special.Bomb, Special.LineH };
                int n = 0;
                foreach (Point p in cells.OrderBy(_ => Rng.Next()).Take(kinds.Length))
                {
                    Board.Cells[p.X, p.Y]!.Special = kinds[n];
                    int w = 8 + n * 2;
                    res.Blasts.Add(new Blast(BlastKind.Bolt, p.X, p.Y, w, eb, 1, p.X, p.Y));
                    Hit(p.X, p.Y, w, res);
                    n++;
                }

                break;
            }
        }

        RunActivations(res);
        return Finish(res, 600, true);
    }

    /// <summary>
    /// 妖精的光耀（フェアリーグリッター）：集結日月星辰之光的光環在盤面上收束，
    /// 從外圈一路勒到中心，整個盤面每一格都被打中一次。
    /// </summary>
    private StepResult RunGlitter()
    {
        StepResult res = BeginClear();
        res.Glitter = true;
        for (int c = 0; c < N; c++)
            for (int r = 0; r < N; r++)
                Hit(c, r, 4 - Math.Max(Math.Abs(c - 4), Math.Abs(r - 4)) + 1, res, false);
        return Finish(res, 3000, true);
    }

    /// <summary>障礙最多的一排。</summary>
    private int BestRow() => Enumerable.Range(0, N).MaxBy(r =>
    {
        double v = Rng.NextDouble();
        for (int c = 0; c < N; c++) v += 1 + Obstacle(c, r);
        return v;
    });

    /// <summary>障礙最多的一行。</summary>
    private int BestCol() => Enumerable.Range(0, N).MaxBy(c =>
    {
        double v = Rng.NextDouble();
        for (int r = 0; r < N; r++)
        {
            v += 1 + Obstacle(c, r);
            if (Board.Cells[c, r]?.Kind == PieceKind.Shard) v += 3;
        }

        return v;
    });

    private StepResult Finish(StepResult res, int bonus, bool skill)
    {
        // 神器技能固定兩倍分數，連鎖則依連鎖數加倍。
        // 連鎖越長分數倍率越高：第 n 連鎖 ×(1+2+…+n)，也就是 1、3、6、10、15、21…，到第 12 連鎖（×78）封頂。
        int c = Math.Min(Chain, 12);
        int mul = res.Glitter ? 6 : res.Unison >= 0 ? 4 : skill ? 2 : Math.Max(1, c * (c + 1) / 2);
        if (_feverThisMove && !Finale) mul *= 2;
        if (Chain > _moveBestChain) _moveBestChain = Chain;
        int raw = _cCandies * 40 + _cJelly * 120 + _cStones * 60 + _cUnfrozen * 40 + _cActs * 150 + bonus;
        res.ScoreGain = raw * mul;
        res.Chain = Chain;
        res.Candies = _cCandies;
        Score += res.ScoreGain;
        if (Finale) FinaleScore += res.ScoreGain;
        if (Chain > BestChain) BestChain = Chain;

        // 神器技能造成的消除不再幫神器充能，否則六件神器會互相充能、連發個沒完。
        for (int e = 0; e < 6 && !_skillActive; e++)
        {
            if (_cElem[e] == 0 || !Owned[e] || Charge[e] >= ChargeNeed) continue;
            Charge[e] = Math.Min(ChargeNeed, Charge[e] + _cElem[e]);
            if (Charge[e] >= ChargeNeed) res.ChargedFull.Add(e);
        }

        if (IsBoss && BossHp > 0)
        {
            // 每顆糖晶都算傷害，連鎖越深倍率越高；神器技能另外加成。
            double damage = (_cCandies * 20 + _cActs * 60 + _cStones * 10) * (1 + 0.3 * (Chain - 1));
            if (res.Glitter) damage = damage * 5 + 5000;
            else if (res.Unison >= 0) damage = damage * 3.6 + 1500;
            else if (skill) damage = damage * 1.3 + 300;
            res.Damage = (int)damage;
            BossHp = Math.Max(0, BossHp - res.Damage);
            if (!PhaseTwo && BossHp > 0 && BossHp * 2 <= BossMaxHp) _transformDue = true;
        }

        return res;
    }

    /// <summary>
    /// 目標達成後的ラストラッシュ：第一次呼叫只宣告開始；之後每次把最多三步換成特殊糖晶當場引爆，
    /// 步數用完再把盤面上剩下的特殊糖晶全部引爆。全部結束回傳 null，代表可以結算了。
    /// </summary>
    private StepResult? FinaleStep()
    {
        if (!Finale)
        {
            Finale = true;
            MovesAtGoal = Moves;
            return new StepResult(StepKind.Finale);
        }

        var normal = new List<Point>();
        var special = new List<Point>();
        for (int c = 0; c < N; c++)
        {
            for (int r = 0; r < N; r++)
            {
                if (Board.Cells[c, r] is not { Kind: PieceKind.Candy, Frozen: false } p) continue;
                if (p.Special == Special.None) normal.Add(new Point(c, r));
                else special.Add(new Point(c, r));
            }
        }

        if (Moves <= 0 || normal.Count == 0)
        {
            Moves = 0;
            if (special.Count == 0 || ++_finaleSweeps > 3) return null;
            StepResult last = BeginClear();
            Chain = 1;
            foreach (Point p in special) Hit(p.X, p.Y, 0, last);
            RunActivations(last);
            _needCollapse = true;
            return Finish(last, 0, false);
        }

        StepResult res = BeginClear();
        Chain = 1;
        int n = Math.Min(Moves, 3);
        Moves -= n;
        Special[] kinds = { Special.LineH, Special.LineV, Special.Bomb };
        foreach (Point p in normal.OrderBy(_ => Rng.Next()).Take(n))
        {
            Board.Cells[p.X, p.Y]!.Special = kinds[Rng.Next(kinds.Length)];
            res.Created.Add(new CellHit(p.X, p.Y, 0));
            Hit(p.X, p.Y, 0, res);
        }

        RunActivations(res);
        _needCollapse = true;
        return Finish(res, 0, false);
    }

    // ───────────────────────── 掉落與補充 ─────────────────────────

    private StepResult Collapse()
    {
        var res = new StepResult(StepKind.Collapse);
        var empties = new List<Point>();
        var spawnCount = new int[N, N];
        var order = new int[N, N];
        foreach (Point[] chain in Chains)
        {
            int write = chain.Length - 1;
            for (int i = chain.Length - 1; i >= 0; i--)
            {
                Point from = chain[i];
                Piece? p = Board.Cells[from.X, from.Y];
                if (p == null) continue;
                if (i != write)
                {
                    Point to = chain[write];
                    Board.Cells[to.X, to.Y] = p;
                    Board.Cells[from.X, from.Y] = null;
                    // 往旁邊掉（強風）時用滑的；穿過傳送門的糖晶從出口行上方掉出來，落差和原本要掉的距離一樣。
                    if (WindDir != 0) p.Falling = false;
                    else
                    {
                        if (to.X != from.X) p.Y = to.Y - (write - i);
                        p.Falling = true;
                    }

                    res.Moved++;
                }

                write--;
            }

            for (int i = write; i >= 0; i--)
            {
                empties.Add(chain[i]);
                spawnCount[chain[i].X, chain[i].Y] = write + 1;
                order[chain[i].X, chain[i].Y] = i;
            }
        }

        if (empties.Count == 0) return res;

        // 還有掉落物沒出場的話，讓它從某一行的最上面掉下來。
        Point? shardAt = null;
        if (ShardsSpawned < Level.Shards && ShardsOnBoard < Level.ShardMax &&
            (ShardsOnBoard == 0 || _movesSinceShard >= Level.ShardGap))
        {
            var tops = empties.Where(p => Chains.Any(chain => chain[0] == p)).ToList();
            if (tops.Count > 0)
            {
                shardAt = tops[Rng.Next(tops.Count)];
                ShardsSpawned++;
                ShardsOnBoard++;
                _movesSinceShard = 0;
            }
        }

        // 由下往上補，這樣挑顏色時下面與左右的鄰居都已經確定了。
        // （往旁邊掉時是由下風處往上風處補。）
        foreach (Point cell in empties.OrderByDescending(p => order[p.X, p.Y]).ThenBy(_ => Rng.Next()))
        {
            var piece = shardAt == cell
                ? new Piece { Kind = PieceKind.Shard }
                : new Piece { Kind = PieceKind.Candy, Element = (Element)PickElement(cell.X, cell.Y) };
            if (WindDir != 0)
            {
                // 從上風處的盤面外面滑進來。
                piece.X = cell.X - WindDir * spawnCount[cell.X, cell.Y];
                piece.Y = cell.Y;
            }
            else
            {
                piece.X = cell.X;
                piece.Y = cell.Y - spawnCount[cell.X, cell.Y];
                piece.Falling = true;
            }

            Board.Cells[cell.X, cell.Y] = piece;
            res.Moved++;
        }

        return res;
    }

    /// <summary>
    /// 新糖晶的屬性不是完全隨機：有一定機率直接和原本的糖晶接成三連（連鎖），
    /// 不然也盡量和鄰居同色，讓下一步好走。連鎖越深機率越低，到第 ChainCap 連鎖就不再故意接。
    /// </summary>
    private int PickElement(int c, int r)
    {
        Span<int> pool = stackalloc int[Board.Elements];
        int depth = Math.Max(0, Chain - 1);
        double matchChance = Chain >= ChainCap ? 0 : MatchBias * Math.Pow(ChainDecay, depth);
        double roll = Rng.NextDouble();
        int n = 0;
        if (roll < matchChance)
        {
            for (int e = 0; e < Board.Elements; e++)
                if (Board.WouldMatch(c, r, e)) pool[n++] = e;
        }
        else if (roll < matchChance + PairBias)
        {
            for (int e = 0; e < Board.Elements; e++)
                if (Board.HasNeighbour(c, r, e) && !Board.WouldMatch(c, r, e)) pool[n++] = e;
        }

        if (n > 0) return pool[Rng.Next(n)];
        int pick = Rng.Next(Board.Elements);
        if (Chain >= ChainCap)
        {
            for (int tries = 0; tries < 12 && Board.WouldMatch(c, r, pick); tries++) pick = Rng.Next(Board.Elements);
        }

        return pick;
    }

    private StepResult? CollectShards()
    {
        StepResult? res = null;
        foreach (Point[] chain in Chains)
        {
            // 只有掉落路線的終點才收集得到（有傳送門時，入口行的最底下不是終點）。
            Point end = chain[^1];
            Piece? p = Board.Cells[end.X, end.Y];
            if (p == null || p.Kind != PieceKind.Shard) continue;
            res ??= new StepResult(StepKind.Collect);
            Board.Cells[end.X, end.Y] = null;
            res.Removed.Add(new Removed(p, end.X, end.Y, 0));
            res.Collected.Add(new CellHit(end.X, end.Y, 0));
            ShardsCollected++;
            ShardsOnBoard--;
        }

        if (res == null) return null;
        res.ScoreGain = res.Collected.Count * 1000;
        Score += res.ScoreGain;
        return res;
    }

    // ───────────────────────── 魔王與洗牌 ─────────────────────────

    private void BuildChains()
    {
        Chains.Clear();
        if (WindDir != 0)
        {
            // 強風：每一排是一條路線，從上風處往下風處掉。
            for (int r = 0; r < N; r++)
                Chains.Add(Enumerable.Range(0, N).Select(k => new Point(WindDir > 0 ? k : N - 1 - k, r)).ToArray());
            return;
        }

        int[] next = Enumerable.Repeat(-1, N).ToArray();
        bool[] isExit = new bool[N];
        for (int i = 0; i + 1 < Level.Portals.Length; i += 2)
        {
            next[Level.Portals[i]] = Level.Portals[i + 1];
            isExit[Level.Portals[i + 1]] = true;
        }

        for (int c = 0; c < N; c++)
        {
            if (isExit[c]) continue;
            var chain = new List<Point>();
            for (int col = c; col >= 0; col = next[col])
                for (int r = 0; r < N; r++)
                    chain.Add(new Point(col, r));
            Chains.Add(chain.ToArray());
        }
    }

    // ───────────────────────── 場地機關 ─────────────────────────

    /// <summary>
    /// 天空草原的強風：糖晶一直往下風處（旁邊）掉，每隔幾步風向反轉。
    /// 哈比的魚被吹到下風處的邊上就收集。風向反轉時盤面是滿的，不會馬上移動，之後的消除才會往新方向掉。
    /// </summary>
    private StepResult WindGust()
    {
        WindDir = -WindDir;
        BuildChains();
        return new StepResult(StepKind.Wind) { Dir = WindDir };
    }

    /// <summary>雷鳴峽谷的落雷：隨機劈碎兩格（特殊糖晶被劈到會發動）。落雷不加分、不幫神器充能。</summary>
    private StepResult LightningStrike()
    {
        BeginClear();
        var res = new StepResult(StepKind.Lightning);
        var cells = new List<Point>();
        for (int c = 0; c < N; c++)
            for (int r = 0; r < N; r++)
                if (Board.Cells[c, r] is { Kind: not PieceKind.Shard })
                    cells.Add(new Point(c, r));
        int n = 0;
        foreach (Point p in cells.OrderBy(_ => Rng.Next()).Take(2))
        {
            res.Blasts.Add(new Blast(BlastKind.Bolt, p.X, p.Y, n * 3, Element.Thunder, 1, p.X, p.Y));
            Hit(p.X, p.Y, n * 3, res);
            n++;
        }

        RunActivations(res);
        _needCollapse = true;
        return res;
    }

    private StepResult BossAttack()
    {
        var res = new StepResult(StepKind.BossAttack);
        BossAttacks++;
        res.Attack = (BossAttacks % 3) switch
        {
            1 => BossAttackKind.Freeze,
            2 => BossAttackKind.Stone,
            _ => BossAttackKind.Drain,
        };
        BossCounter = Enraged ? 2 : 3;

        var targets = new List<Point>();
        for (int c = 0; c < N; c++)
            for (int r = 0; r < N; r++)
                if (Board.Cells[c, r] is { Kind: PieceKind.Candy, Special: Special.None, Frozen: false })
                    targets.Add(new Point(c, r));
        targets = targets.OrderBy(_ => Rng.Next()).ToList();

        switch (res.Attack)
        {
            case BossAttackKind.Freeze:
                // 「終焉的黑羽」：黑龍的羽毛落下，把糖晶封住不能移動。
                foreach (Point p in targets.Take(Enraged ? 7 : 5))
                {
                    Board.Cells[p.X, p.Y]!.Frozen = true;
                    res.Afflicted.Add(new CellHit(p.X, p.Y, 0));
                }

                break;
            case BossAttackKind.Stone when PhaseTwo:
                // 龍化後的黑龍的咆哮：先蓄力，等防禦小遊戲的結果（見 ResolveRoar）。
                AwaitingRoar = true;
                return new StepResult(StepKind.RoarCharge) { Attack = BossAttackKind.Stone };
            case BossAttackKind.Stone:
            {
                // 「黑龍的咆哮」：咆哮以一格為中心轟成十字，碰到的糖晶化為岩石；狂暴後再多兩格。
                var marked = new List<Point>();
                if (targets.Count > 0)
                {
                    Point center = targets[0];
                    foreach (var (dc, dr) in new[] { (0, 0), (1, 0), (-1, 0), (0, 1), (0, -1) })
                    {
                        var p = new Point(center.X + dc, center.Y + dr);
                        if (targets.Contains(p)) marked.Add(p);
                    }
                }

                if (Enraged) marked.AddRange(targets.Where(p => !marked.Contains(p)).Take(2));
                foreach (Point p in marked)
                {
                    Board.Cells[p.X, p.Y] = new Piece { Kind = PieceKind.Stone, X = p.X, Y = p.Y, Pop = 1 };
                    res.Afflicted.Add(new CellHit(p.X, p.Y, 0));
                }

                break;
            }
            default:
                // 「黑龍的吞噬」：黑龍吞下神器的魔力，傷勢復原一部分，神器累積的充能也被奪走四成。
                for (int i = 0; i < 6; i++) Charge[i] = Charge[i] * 6 / 10;
                res.Heal = Math.Min(BossMaxHp - BossHp, BossMaxHp * (Enraged ? 6 : 4) / 100);
                BossHp += res.Heal;
                break;
        }

        return res;
    }

    /// <summary>
    /// 防禦小遊戲結束：擋下來就反擊（魔王扣最大血量的 5%），沒擋下就整招吃下去，
    /// 以一格為中心半徑 2 的十字（最多 9 格）全部化為岩石。
    /// </summary>
    public StepResult ResolveRoar(bool blocked)
    {
        AwaitingRoar = false;
        var res = new StepResult(StepKind.RoarResult) { Attack = BossAttackKind.Stone, Blocked = blocked };
        if (blocked)
        {
            RoarsBlocked++;
            res.Damage = Math.Min(BossHp, BossMaxHp * 5 / 100);
            BossHp -= res.Damage;
            return res;
        }

        RoarsTaken++;
        var targets = new List<Point>();
        for (int c = 0; c < N; c++)
            for (int r = 0; r < N; r++)
                if (Board.Cells[c, r] is { Kind: PieceKind.Candy, Special: Special.None, Frozen: false })
                    targets.Add(new Point(c, r));
        if (targets.Count == 0) return res;
        Point center = targets[Rng.Next(targets.Count)];
        for (int d = -2; d <= 2; d++)
        {
            foreach (var p in new[] { new Point(center.X + d, center.Y), new Point(center.X, center.Y + d) })
            {
                if (!targets.Contains(p) || res.Afflicted.Any(a => a.C == p.X && a.R == p.Y)) continue;
                Board.Cells[p.X, p.Y] = new Piece { Kind = PieceKind.Stone, X = p.X, Y = p.Y, Pop = 1 };
                res.Afflicted.Add(new CellHit(p.X, p.Y, Math.Abs(d)));
            }
        }

        return res;
    }

    /// <summary>沒有任何一步可以走時，把能動的糖晶重新洗牌，保證洗完沒有現成的三連而且至少有一步可走。</summary>
    private void Shuffle()
    {
        var spots = new List<Point>();
        var pieces = new List<Piece>();
        for (int c = 0; c < N; c++)
        {
            for (int r = 0; r < N; r++)
            {
                if (Board.Cells[c, r] is not { Kind: PieceKind.Candy, Frozen: false } p) continue;
                spots.Add(new Point(c, r));
                pieces.Add(p);
            }
        }

        for (int attempt = 0; attempt < 400; attempt++)
        {
            if (attempt >= 200)
            {
                foreach (Piece p in pieces)
                    if (p.Special == Special.None) p.Element = (Element)Rng.Next(Board.Elements);
            }

            for (int i = pieces.Count - 1; i > 0; i--)
            {
                int j = Rng.Next(i + 1);
                (pieces[i], pieces[j]) = (pieces[j], pieces[i]);
            }

            for (int i = 0; i < spots.Count; i++) Board.Cells[spots[i].X, spots[i].Y] = pieces[i];
            if (Board.FindMatches().Count == 0 && Board.HasAnyMove()) return;
        }
    }
}
