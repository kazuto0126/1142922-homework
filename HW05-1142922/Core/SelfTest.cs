using System.Text;

namespace CandyLegend.Core;

/// <summary>
/// 不開視窗的自我檢查：先驗證規則（配對、特殊糖晶、掉落、掉落物、冰封、岩石），
/// 再讓機器人把每一關試玩幾百場，量過關率、分數分布與連鎖長度。
/// 用法：HW05-1142922.exe --selftest 報告檔路徑
/// </summary>
public static class SelfTest
{
    private static readonly StringBuilder Out = new();
    private static int _failed;

    public static int Run(string path, int games = 300)
    {
        try
        {
            Rules();
            Simulate(games);
            Loudness();
        }
        catch (Exception ex)
        {
            _failed++;
            Out.AppendLine("EXCEPTION " + ex);
        }

        Out.AppendLine(_failed == 0 ? "RESULT: ALL PASSED" : $"RESULT: {_failed} FAILED");
        File.WriteAllText(path, Out.ToString());
        return _failed == 0 ? 0 : 1;
    }

    private static void Check(bool ok, string name)
    {
        if (!ok) _failed++;
        Out.AppendLine((ok ? "pass  " : "FAIL  ") + name);
    }

    private static readonly LevelDef Plain = new() { Number = 0, Name = "test", Moves = 50 };

    /// <summary>
    /// 做一個保證沒有任何三連的底盤（只用前五種屬性），再照字串把指定格子改掉：
    /// 'X' = 闇屬性糖晶、'H'/'V'/'B'/'C' = 闇屬性橫斬/直斬/爆裂/核心、'S' = 岩石、'I' = 掉落物、'F' = 冰封的闇糖晶。
    /// </summary>
    private static Session Make(string[] rows, LevelDef? level = null)
    {
        var s = new Session(level ?? Plain, 6, 0, 7);
        for (int r = 0; r < 9; r++)
        {
            for (int c = 0; c < 9; c++)
            {
                var p = new Piece { Kind = PieceKind.Candy, Element = (Element)((c + 2 * r) % 5), X = c, Y = r };
                char ch = r < rows.Length ? rows[r][c] : '.';
                switch (ch)
                {
                    case 'X': p.Element = Element.Sword; break;
                    case 'H': p.Element = Element.Sword; p.Special = Special.LineH; break;
                    case 'V': p.Element = Element.Sword; p.Special = Special.LineV; break;
                    case 'B': p.Element = Element.Sword; p.Special = Special.Bomb; break;
                    case 'C': p.Element = Element.Sword; p.Special = Special.Core; break;
                    case 'F': p.Element = Element.Sword; p.Frozen = true; break;
                    case 'S': p.Kind = PieceKind.Stone; break;
                    case 'I': p.Kind = PieceKind.Shard; break;
                }

                s.Board.Cells[c, r] = p;
                s.Board.Jelly[c, r] = 0;
            }
        }

        return s;
    }

    private static readonly Random RoarRng = new(42);

    private static List<StepResult> Drain(Session s)
    {
        var steps = new List<StepResult>();
        for (int guard = 0; guard < 3000; guard++)
        {
            StepResult res = s.Advance();
            steps.Add(res);
            // 機器人玩防禦小遊戲：大約三分之二擋得下來。
            if (s.AwaitingRoar)
            {
                steps.Add(s.ResolveRoar(RoarRng.NextDouble() < 0.65));
                continue;
            }

            if (res.Kind is StepKind.Idle or StepKind.Won or StepKind.Lost) break;
        }

        return steps;
    }

    private static bool Stable(Session s)
    {
        foreach (Piece? p in s.Board.Cells)
            if (p == null) return false;
        return s.Board.FindMatches().Count == 0;
    }

    private static void Rules()
    {
        Out.AppendLine("== 規則檢查 ==");
        string[] empty = Enumerable.Repeat(".........", 9).ToArray();

        Session s = Make(empty);
        Check(s.Board.FindMatches().Count == 0, "底盤沒有任何三連");
        Check(!s.TrySwap(new Point(0, 0), new Point(2, 0)), "不相鄰的兩格不能交換");

        // 三連
        string[] rows = (string[])empty.Clone();
        rows[8] = "XX.......";
        rows[7] = "..X......";
        s = Make(rows);
        Check(s.Board.FindMatches().Count == 0, "交換前還沒連成線");
        Check(s.TrySwap(new Point(2, 7), new Point(2, 8)), "交換後連成三顆就算有效");
        Check(s.Moves == 49, "有效交換扣一步");
        StepResult first = s.Advance();
        Check(first.Kind == StepKind.Clear && first.Removed.Count == 3 && first.Created.Count == 0, "三連消掉三顆，不產生特殊糖晶");
        Drain(s);
        Check(Stable(s), "消除後盤面補滿且沒有殘留三連");

        // 無效交換
        s = Make(empty);
        Piece before = s.Board.Cells[0, 0]!;
        Check(!s.TrySwap(new Point(0, 0), new Point(1, 0)) && s.Board.Cells[0, 0] == before && s.Moves == 50,
            "連不成線的交換會退回，不扣步數");

        // 四連 → 斬擊
        rows = (string[])empty.Clone();
        rows[8] = "XX.X.....";
        rows[7] = "..X......";
        s = Make(rows);
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        first = s.Advance();
        Check(first.Created.Count == 1 && s.Board.Cells[2, 8] is { Special: Special.LineV }, "四連在交換的位置生成斬擊糖晶（直著滑得到直斬）");

        // L 型 → 爆裂
        rows = (string[])empty.Clone();
        rows[8] = "XXX......";
        rows[7] = "..X......";
        rows[6] = "..X......";
        s = Make(rows);
        List<MatchGroup> groups = s.Board.FindMatches();
        Check(groups.Count == 1 && groups[0].Creates == Special.Bomb && groups[0].Cells.Count == 5 &&
              groups[0].CreateAt == new Point(2, 8), "L 型判定為爆裂糖晶，生成在轉角");

        // 五連 → 核心
        rows = (string[])empty.Clone();
        rows[8] = "XX.XX....";
        rows[7] = "..X......";
        s = Make(rows);
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        first = s.Advance();
        Check(first.Created.Count == 1 && s.Board.Cells[2, 8] is { Special: Special.Core }, "五連生成屬性核心");

        // 橫斬清整排
        rows = (string[])empty.Clone();
        rows[8] = "HX.......";
        rows[7] = "..X......";
        s = Make(rows);
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        first = s.Advance();
        Check(first.Removed.Count == 9 && first.Blasts.Any(b => b.Kind == BlastKind.Row), "橫斬糖晶被消除時清掉整排 9 格");

        // 爆裂 3×3
        rows = (string[])empty.Clone();
        rows[5] = "BX.......";
        rows[4] = "..X......";
        s = Make(rows);
        s.TrySwap(new Point(2, 4), new Point(2, 5));
        first = s.Advance();
        Check(first.Removed.Count == 7, "爆裂糖晶炸掉周圍（三連 3 格 + 3×3 內另外 4 格）");
        Check(first.Blasts.Any(b => b.Kind == BlastKind.Area), "爆裂糖晶產生範圍爆炸");

        // 核心 + 一般糖晶
        rows = (string[])empty.Clone();
        rows[4] = "....C....";
        s = Make(rows);
        Element target = s.Board.Cells[5, 4]!.Element;
        int count = s.Board.Cells.Cast<Piece?>().Count(p => p != null && p.Matchable && p.Element == target);
        Check(s.TrySwap(new Point(4, 4), new Point(5, 4)), "核心可以和任何糖晶交換");
        first = s.Advance();
        Check(first.Removed.Count == count + 1, "核心消掉場上所有同屬性糖晶");

        // 雙特殊合體
        rows = (string[])empty.Clone();
        rows[4] = "...HV....";
        s = Make(rows);
        Check(s.TrySwap(new Point(3, 4), new Point(4, 4)), "兩顆斬擊糖晶可以直接交換");
        first = s.Advance();
        Check(first.Removed.Count == 17, "斬擊 + 斬擊 = 十字（一排加一行共 17 格）");

        // 果凍
        rows = (string[])empty.Clone();
        rows[8] = "XX.......";
        rows[7] = "..X......";
        s = Make(rows);
        s.Board.Jelly[0, 8] = 2;
        s.Board.Jelly[1, 8] = 1;
        s.JellyTotal = 3;
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        first = s.Advance();
        Check(s.Board.Jelly[0, 8] == 1 && s.Board.Jelly[1, 8] == 0 && s.JellyCleared == 2, "在果凍上消除會讓果凍少一層");

        // 掉落物
        rows = (string[])empty.Clone();
        rows[8] = "XX.......";
        rows[7] = "I.X......";
        var shardLevel = new LevelDef { Number = 0, Moves = 50, Shards = 1, ShardMax = 1 };
        s = Make(rows, shardLevel);
        s.ShardsSpawned = 1;
        s.ShardsOnBoard = 1;
        s.ShardsCollected = 0;
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        List<StepResult> all = Drain(s);
        Check(all.Any(x => x.Kind == StepKind.Collect) && s.ShardsCollected == 1, "掉落物掉到最底排就被收集");
        Check(s.State == PlayState.Won, "收集完掉落物就過關");
        Check(all.Any(x => x.Kind == StepKind.Finale) && s.Moves == 0 && s.FinaleScore > 0,
            "過關後剩下的步數全部變成ラストラッシュ並計分");

        // 分數挑戰
        var scoreLevel = new LevelDef { Number = 0, Moves = 50, Mode = LevelMode.Score, TargetScore = 1 };
        rows = (string[])empty.Clone();
        rows[8] = "XX.......";
        rows[7] = "..X......";
        s = Make(rows, scoreLevel);
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        Drain(s);
        Check(s.State == PlayState.Won, "分數挑戰：分數達到目標就過關");
        scoreLevel.TargetScore = 99_999_999;
        s = Make(rows, scoreLevel);
        s.Moves = 1;
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        Drain(s);
        Check(s.State == PlayState.Lost, "分數挑戰：步數用完分數不夠就失敗");

        // 冰封
        rows = (string[])empty.Clone();
        rows[8] = "XF.......";
        rows[7] = "..X......";
        s = Make(rows);
        Check(!s.TrySwap(new Point(1, 8), new Point(1, 7)), "冰封的糖晶不能被移動");
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        first = s.Advance();
        Check(first.Unfrozen.Count == 1 && first.Removed.Count == 2 && s.Board.Cells[1, 8] is { Frozen: false },
            "冰封的糖晶被配對時只會解凍");

        // 岩石
        rows = (string[])empty.Clone();
        rows[8] = "XX.S.....";
        rows[7] = "..X......";
        s = Make(rows);
        Check(!s.TrySwap(new Point(3, 8), new Point(3, 7)), "岩石不能被移動");
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        first = s.Advance();
        Check(first.Removed.Any(x => x.Piece.Kind == PieceKind.Stone), "在岩石旁邊配對會把岩石打碎");

        // 神器
        s = Make(empty);
        Check(!s.UseArtifact(0), "神器沒充滿不能發動");
        s.Charge[3] = s.ChargeNeed;
        Check(s.UseArtifact(3), "神器充滿可以發動");
        first = s.Advance();
        Check(first.Skill == 3 && first.Removed.Count == 18 && s.Moves == 50, "鳴御雷（神鳴殿）劈碎 18 格且不耗步數");
        Drain(s);
        Check(Stable(s) && s.Charge[3] < s.ChargeNeed, "技能結束後盤面穩定、充能歸零重來");

        rows = (string[])empty.Clone();
        rows[8] = "XX.......";
        rows[7] = "..X......";
        s = Make(rows, new LevelDef { Number = 0, Moves = 50, TargetScore = 99_999_999 });
        s.Charge[2] = s.ChargeNeed;
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        all = Drain(s);
        Check(all.Any(x => x.Kind == StepKind.SkillStart && x.Skill == 2) && all.Any(x => x.Skill == 2 && x.Kind == StepKind.Clear) &&
              s.Charge[2] < s.ChargeNeed, "神器充滿後自動發動");

        // 強化版招式：同一個盤面，強化版打掉的格子一定比一般版多，放完盤面要穩定。
        for (int skill = 0; skill < 6; skill++)
        {
            int Hits(bool boost, out StepResult res, out bool stable)
            {
                Session t = Make(empty);
                t.Boosted[skill] = boost;
                t.Charge[skill] = t.ChargeNeed;
                t.UseArtifact(skill);
                res = t.Advance();
                Drain(t);
                stable = Stable(t);
                return res.Removed.Count + res.Unfrozen.Count;
            }

            int normal = Hits(false, out _, out _);
            int strong = Hits(true, out StepResult boosted, out bool ok);
            bool extra = skill != 0 || boosted.Created.Count == 2;
            Check(boosted.Boosted && strong > normal && ok && extra,
                $"強化版「{Levels.Artifacts[skill].Skill2}」比一般版打得多（{normal} → {strong} 格）{(skill == 0 ? $"，留下 {boosted.Created.Count} 顆火種" : "")}");
        }

        // 合體魔法：同一個盤面，合體魔法打掉的格子比兩件神器各自的招式都多，放完盤面要穩定。
        for (int u = 0; u < Levels.Unisons.Length; u++)
        {
            UnisonInfo info = Levels.Unisons[u];
            int Single(int skill)
            {
                Session t = Make(empty);
                t.Charge[skill] = t.ChargeNeed;
                t.UseArtifact(skill);
                StepResult r = t.Advance();
                return r.Removed.Count + r.Unfrozen.Count;
            }

            Session us = Make(empty);
            bool used = us.UseUnison(u);
            StepResult ur = us.Advance();
            Drain(us);
            int hits = ur.Removed.Count + ur.Unfrozen.Count;
            int best = Math.Max(Single(info.A), Single(info.B));
            Check(used && ur.Unison == u && hits > best && Stable(us),
                $"合體魔法「{info.Name}」比單一招式打得多（{best} → {hits} 格）");
        }

        rows = (string[])empty.Clone();
        rows[8] = "XX.......";
        rows[7] = "..X......";
        s = Make(rows, new LevelDef { Number = 0, Moves = 50, TargetScore = 99_999_999 });
        s.Charge[0] = s.ChargeNeed;
        s.Charge[3] = s.ChargeNeed;
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        all = Drain(s);
        Check(all.Any(x => x.Kind == StepKind.SkillStart && x.Unison == 0) && s.Charge[0] < s.ChargeNeed && s.Charge[3] == 0 &&
              !all.Any(x => x.Kind == StepKind.SkillStart && x.Unison < 0 && x.Skill is 0 or 3),
            "一件神器充滿、搭檔也同時充滿時，自動合放合體魔法");

        // 妖精的光耀：整個盤面每一格都打到；六盞燈全亮才會自動發動。
        s = Make(empty);
        int candies = s.Board.Cells.Cast<Piece?>().Count(p => p is { Kind: PieceKind.Candy });
        Check(s.UseGlitter(), "可以直接施放妖精的光耀");
        first = s.Advance();
        Drain(s);
        Check(first.Glitter && first.Removed.Count >= candies && Stable(s), $"妖精的光耀打中整個盤面（{first.Removed.Count} 格）");

        rows = (string[])empty.Clone();
        rows[8] = "XX.......";
        rows[7] = "..X......";
        s = Make(rows, new LevelDef { Number = 0, Moves = 50, TargetScore = 99_999_999 });
        for (int i = 0; i < 6; i++) s.GlitterLamp[i] = i != 5;
        s.Charge[5] = s.ChargeNeed;
        s.TrySwap(new Point(2, 7), new Point(2, 8));
        all = Drain(s);
        Check(all.Any(x => x.Kind == StepKind.SkillStart && x.Glitter) && s.GlitterUses == 1 && !s.GlitterLamp.Any(l => l),
            "第六件神器發動、六盞燈全亮後，自動施放妖精的光耀");

        // 魔王第二階段：血量掉到一半會龍化，之後黑龍的咆哮要等防禦小遊戲的結果。
        var boss = new Session(Levels.All[9], 6, 3, 21);
        boss.BossHp = boss.BossMaxHp / 2 + 10;
        for (int guard = 0; guard < 60 && !boss.PhaseTwo && boss.State == PlayState.Playing; guard++)
        {
            List<Move> bm = boss.Board.FindMoves();
            if (bm.Count == 0 || !boss.TrySwap(bm[0].A, bm[0].B)) break;
            Drain(boss);
        }

        Check(boss.PhaseTwo && boss.Enraged, "魔王血量掉到一半時龍化");
        int blockedBefore = boss.RoarsBlocked + boss.RoarsTaken;
        for (int guard = 0; guard < 30 && boss.RoarsBlocked + boss.RoarsTaken == blockedBefore && boss.State == PlayState.Playing; guard++)
        {
            List<Move> bm = boss.Board.FindMoves();
            if (bm.Count == 0 || !boss.TrySwap(bm[0].A, bm[0].B)) break;
            Drain(boss);
        }

        Check(boss.RoarsBlocked + boss.RoarsTaken > blockedBefore && !boss.AwaitingRoar, "龍化後會放出要防禦的黑龍的咆哮");
        var roar = new Session(Levels.All[9], 6, 3, 22);
        roar.BossHp = roar.BossMaxHp / 2 - 1000;
        roar.PhaseTwo = true;
        int hpBefore = roar.BossHp;
        StepResult good = roar.ResolveRoar(true);
        StepResult bad = roar.ResolveRoar(false);
        Check(good.Blocked && roar.BossHp == hpBefore - roar.BossMaxHp * 5 / 100 && bad.Afflicted.Count >= 3 &&
              bad.Afflicted.All(a => roar.Board.Cells[a.C, a.R]?.Kind == PieceKind.Stone),
            "擋下咆哮會反擊魔王；沒擋下就有一個十字的糖晶化為岩石");

        // 場地機關
        var thick = new Session(new LevelDef { Number = 0, Moves = 50, TargetScore = 99_999_999, Blocks = new[] { "", "", "", "", "....D...." } }, 6, 0, 3);
        Piece ice = thick.Board.Cells[4, 4]!;
        Check(ice.Frozen && ice.ThickIce, "'D' 會放出厚冰");
        Check(Levels.All[1].FieldText.Contains("厚冰") && Levels.All[2].Hazard == Hazard.Wind &&
              Levels.All[3].Hazard == Hazard.Lightning && Levels.All[4].Portals.Length == 4, "第 2–5 關各有自己的場地機關");

        var thick2 = new Session(new LevelDef { Number = 0, Moves = 50, TargetScore = 99_999_999, Blocks = new[] { "", "", "", "", "....D...." } }, 6, 0, 3);
        thick2.Charge[1] = thick2.ChargeNeed;
        thick2.UseArtifact(1);
        StepResult iceHit = thick2.Advance();
        Check(iceHit.Unfrozen.Count > 0 && thick2.Board.Cells.Cast<Piece?>().Any(p => p is { Frozen: true }) &&
              !thick2.Board.Cells.Cast<Piece?>().Any(p => p is { ThickIce: true }),
            "厚冰被打一次只會變成普通冰封");
        Drain(thick2);

        // 傳送門：入口行底下的魚不算收集，要穿過傳送門掉到出口行的底部才算。
        var portal = new Session(new LevelDef { Number = 0, Moves = 50, Shards = 1, ShardMax = 1, Portals = new[] { 1, 7 } }, 6, 0, 5);
        Check(portal.Chains.Count == 8 && portal.Chains.Any(chain => chain.Length == 18 && chain[0] == new Point(1, 0) && chain[^1] == new Point(7, 8)),
            "傳送門把入口行與出口行接成一條掉落路線");
        bool fishFell = false;
        for (int guard = 0; guard < 300 && portal.State == PlayState.Playing && portal.ShardsCollected == 0; guard++)
        {
            List<Move> pm = portal.Board.FindMoves();
            if (pm.Count == 0 || !portal.TrySwap(pm[guard % pm.Count].A, pm[guard % pm.Count].B)) break;
            foreach (StepResult step in Drain(portal))
                if (step.Kind == StepKind.Collect && step.Collected.Any(x => x.C == 1)) fishFell = true;
        }

        Check(!fishFell, "入口行的最底下不會收集到魚");
        Check(Stable(portal), "有傳送門的盤面放完後是穩定的");

        // 強風：整排滑一格；落雷：劈碎兩格。
        foreach (Hazard hz in new[] { Hazard.Wind, Hazard.Lightning })
        {
            var h = new Session(new LevelDef { Number = 0, Moves = 50, TargetScore = 99_999_999, Hazard = hz, HazardEvery = 1 }, 0, 0, 9);
            List<Move> hm = h.Board.FindMoves();
            h.TrySwap(hm[0].A, hm[0].B);
            all = Drain(h);
            var kind = hz == Hazard.Wind ? StepKind.Wind : StepKind.Lightning;
            StepResult? ev = all.FirstOrDefault(x => x.Kind == kind);
            Check(ev != null && (hz == Hazard.Wind ? ev.Dir == h.WindDir && h.Chains.All(chain => chain[0].Y == chain[^1].Y) : ev.Removed.Count + ev.Unfrozen.Count >= 2) && Stable(h),
                hz == Hazard.Wind ? "強風關糖晶往旁邊掉，每隔幾步風向反轉" : "每隔幾步會落雷劈碎兩格");
        }

        Check(new Session(Levels.All[7], 6, 1, 1).Boosted.Count(b => b) == 2 &&
              new Session(Levels.All[9], 6, 3, 1).Boosted.All(b => b) &&
              new Session(Levels.All[6], 6, 0, 1).Boosted.All(b => !b), "第 7、8、9 關各強化兩件神器");

        // 提示
        s = new Session(Levels.All[0], 0, 0, 99);
        List<Move> moves = s.Board.FindMoves();
        bool allValid = moves.Count > 0;
        foreach (Move m in moves)
        {
            var copy = new Session(Levels.All[0], 0, 0, 99);
            if (!copy.TrySwap(m.A, m.B)) allValid = false;
        }

        Check(allValid, $"提示找到的每一步都真的可以走（{moves.Count} 步）");
    }

    /// <summary>音效一定要蓋得過背景音樂：量每個主要音效的平均音量，和音樂固定的平均音量比。</summary>
    private static void Loudness()
    {
        Out.AppendLine();
        Out.AppendLine("== 音效與音樂的音量差（dB，越大代表音效越明顯） ==");
        float[][] fx = Audio.Synth.BuildEffects();
        var (left, right) = Audio.Synth.BuildSong(false);
        Check(left.Length == right.Length && left.Length > Audio.Synth.SR * 10, $"暫用背景音樂長度 {left.Length / (double)Audio.Synth.SR:0.0} 秒");
        foreach (var (name, label, expect) in new[] { ("map", "關卡地圖", 92.0), ("stage1", "第 1–3 關", 90.1), ("stage2", "第 4–6 關", 90.1), ("stage3", "魔王第一階段", 266.3), ("stage4", "標題與第 7–9 關", 214.2), ("stage5", "魔王第二階段", 240.0), ("stage6", "魔王第一階段第二首", 268.9) })
        {
            Audio.Song? song = Audio.Sound.LoadEmbedded(name);
            double seconds = song?.Seconds ?? 0;
            double rms = 0;
            if (song != null)
            {
                for (int i = 0; i < song.Pcm.Length; i += 7) rms += (double)song.Pcm[i] * song.Pcm[i];
                rms = Math.Sqrt(rms / (song.Pcm.Length / 7.0)) / 32768;
            }

            Check(song != null && Math.Abs(seconds - expect) < 1.5 && rms > 0.01,
                $"{label}音樂已包進 exe 並解碼：{seconds:0.0} 秒（原曲 {expect:0.0} 秒），平均音量 {20 * Math.Log10(Math.Max(1e-6, rms)):0.0} dBFS");
        }
        (Audio.Snd Sound, float Gain)[] main =
        {
            (Audio.Snd.Match, 0.95f), (Audio.Snd.Land, 0.5f), (Audio.Snd.ShardLand, 0.85f), (Audio.Snd.ShardCollect, 1f),
            (Audio.Snd.Slash, 0.8f), (Audio.Snd.Boom, 0.85f), (Audio.Snd.Jelly, 0.75f),
        };
        foreach (var (sound, gain) in main)
        {
            // 只量音效最響的 80 毫秒，比較接近耳朵聽到的「一聲」。
            float[] data = fx[(int)sound];
            int window = Math.Min(data.Length, Audio.Synth.SR * 80 / 1000);
            double best = 0;
            for (int start = 0; start + window <= data.Length; start += window / 2)
            {
                double sum = 0;
                for (int i = 0; i < window; i++) sum += data[start + i] * data[start + i];
                best = Math.Max(best, Math.Sqrt(sum / window));
            }

            double db = 20 * Math.Log10(best * gain / Audio.Sound.MusicRms);
            Check(db >= 4, $"{sound,-13} 比音樂大 {db:0.0} dB");
        }
    }

    private static void Simulate(int games)
    {
        Out.AppendLine();
        Out.AppendLine($"== 機器人試玩（每關 {games} 場） ==");
        Out.AppendLine("關卡        過關率  10%分  30%分  中位分  剩餘步  每步連鎖  連鎖≥2  最長  神器/場  FEVER/場");
        for (int index = 0; index < Levels.Count; index++)
        {
            LevelDef level = Levels.All[index];
            int artifacts = Math.Min(6, index), awaken = Math.Clamp(index - 6, 0, 3);
            var uses = new long[6];
            int wins = 0, moveCount = 0, chained = 0, longest = 0, skills = 0, broken = 0, fevers = 0, unisons = 0, glitters = 0;
            long chainSum = 0, leftSum = 0;
            var scores = new List<int>();
            for (int game = 0; game < games; game++)
            {
                var s = new Session(level, artifacts, awaken, 1000 + index * 7919 + game);
                var rng = new Random(game * 31 + index);
                for (int guard = 0; guard < 400 && s.State == PlayState.Playing; guard++)
                {
                    List<Move> moves = s.Board.FindMoves();
                    if (moves.Count == 0)
                    {
                        broken++;
                        break;
                    }

                    Move pick = rng.NextDouble() < 0.6 ? moves.MaxBy(m => m.Value) : moves[rng.Next(moves.Count)];
                    if (!s.TrySwap(pick.A, pick.B))
                    {
                        broken++;
                        break;
                    }

                    skills += Drain(s).Count(x => x.Kind == StepKind.SkillStart);
                    moveCount++;
                    chainSum += s.Chain;
                    if (s.Chain >= 2) chained++;
                    longest = Math.Max(longest, s.Chain);
                    if (s.State == PlayState.Playing && !Stable(s)) broken++;
                }

                fevers += s.FeverCount;
                unisons += s.UnisonUses.Sum();
                glitters += s.GlitterUses;
                for (int a = 0; a < 6; a++) uses[a] += s.SkillUses[a];
                if (s.State == PlayState.Won)
                {
                    wins++;
                    leftSum += s.MovesAtGoal;
                    scores.Add(s.Score);
                }
            }

            scores.Sort();
            int Pct(double p) => scores.Count == 0 ? 0 : scores[(int)Math.Min(scores.Count - 1, scores.Count * p)];
            Out.AppendLine(
                $"{level.Number,2} {level.ModeName,-6} {100.0 * wins / games,6:0}%  {Pct(0.1),6}  {Pct(0.3),6}  {Pct(0.5),6}  " +
                $"{(wins > 0 ? (double)leftSum / wins : 0),5:0.0}  {(double)chainSum / Math.Max(1, moveCount),7:0.00}  {100.0 * chained / Math.Max(1, moveCount),5:0}%  {longest,4}  {(double)skills / games,6:0.0}  {(double)fevers / games,7:0.0}  合體 {(double)unisons / games:0.0}  光耀 {(double)glitters / games:0.0}");
            Check(broken == 0, $"第 {level.Number} 關試玩過程沒有卡住或盤面異常");
            if (artifacts == 6 && uses.Sum() >= games * 6L)
            {
                string each = string.Join(" / ", uses.Select(u => $"{(double)u / games:0.0}"));
                Check(uses.Min() * 2 >= uses.Max(), $"第 {level.Number} 關六件神器輪流發動，每場各 {each} 次");
            }
        }
    }
}
