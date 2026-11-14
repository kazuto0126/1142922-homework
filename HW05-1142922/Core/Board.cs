namespace CandyLegend.Core;

/// <summary>六種屬性。天空＝溫蒂的天空滅龍魔法，星＝露西的星靈魔法，劍＝艾爾莎的換裝魔法。</summary>
public enum Element { Fire, Ice, Sky, Thunder, Star, Sword }

public enum PieceKind { Candy, Shard, Stone }

public enum Special { None, LineH, LineV, Bomb, Core }

/// <summary>盤面上的一顆東西：糖晶、掉落物（哈比的魚）或岩石。</summary>
public sealed class Piece
{
    public PieceKind Kind;
    public Element Element;
    public Special Special;
    public bool Frozen;

    /// <summary>厚冰：冰封要打兩次才會解開（第一次只把厚冰打成普通冰封）。</summary>
    public bool ThickIce;

    // 以下只給畫面用：目前畫在哪一格（可以是小數）、掉落速度與動畫計時。
    public float X, Y, VY;
    public bool Falling;
    public float Pop;
    public float Squash;

    public bool IsCandy => Kind == PieceKind.Candy;
    public bool Matchable => Kind == PieceKind.Candy && Special != Special.Core;
    public bool Movable => Kind != PieceKind.Stone && !Frozen;
    public bool IsLine => Special is Special.LineH or Special.LineV;
}

/// <summary>一組連在一起的同屬性糖晶，以及它會合成出哪種特殊糖晶。</summary>
public sealed class MatchGroup
{
    public readonly List<Point> Cells = new();
    public Element Element;
    public Special Creates;
    public Point CreateAt;
    internal int MaxLen;
    internal bool HasH, HasV;
    internal int LongestRun;
}

public readonly record struct Move(Point A, Point B, int Value);

/// <summary>9×9 盤面，只管「哪裡有什麼」和「哪些連成線」，不管規則與計分。</summary>
public sealed class Board
{
    public const int N = 9;
    public const int Elements = 6;

    public readonly Piece?[,] Cells = new Piece?[N, N];
    public readonly int[,] Jelly = new int[N, N];

    public static bool In(int c, int r) => c >= 0 && r >= 0 && c < N && r < N;

    private int Elem(int c, int r)
    {
        Piece? p = Cells[c, r];
        return p != null && p.Matchable ? (int)p.Element : -1;
    }

    /// <summary>把某格換成 <paramref name="e"/> 屬性後，會不會立刻連成三顆以上。</summary>
    public bool WouldMatch(int c, int r, int e)
    {
        int h = 0, v = 0;
        for (int k = c - 1; k >= 0 && Elem(k, r) == e; k--) h++;
        for (int k = c + 1; k < N && Elem(k, r) == e; k++) h++;
        for (int k = r - 1; k >= 0 && Elem(c, k) == e; k--) v++;
        for (int k = r + 1; k < N && Elem(c, k) == e; k++) v++;
        return h >= 2 || v >= 2;
    }

    public bool HasNeighbour(int c, int r, int e) =>
        (c > 0 && Elem(c - 1, r) == e) || (c < N - 1 && Elem(c + 1, r) == e) ||
        (r > 0 && Elem(c, r - 1) == e) || (r < N - 1 && Elem(c, r + 1) == e);

    /// <summary>
    /// 找出所有三連以上的組合。<paramref name="prefer1"/>、<paramref name="prefer2"/> 是玩家剛交換的兩格，
    /// 特殊糖晶會優先生成在那裡。
    /// </summary>
    public List<MatchGroup> FindMatches(Point? prefer1 = null, Point? prefer2 = null,
        bool? swapHorizontal = null, Random? rng = null)
    {
        var groups = new List<MatchGroup>();
        var runs = new List<(int C, int R, int Len, bool Horizontal)>();
        for (int r = 0; r < N; r++)
        {
            for (int c = 0; c < N;)
            {
                int e = Elem(c, r), k = c + 1;
                if (e >= 0) while (k < N && Elem(k, r) == e) k++;
                if (e >= 0 && k - c >= 3) runs.Add((c, r, k - c, true));
                c = k;
            }
        }

        for (int c = 0; c < N; c++)
        {
            for (int r = 0; r < N;)
            {
                int e = Elem(c, r), k = r + 1;
                if (e >= 0) while (k < N && Elem(c, k) == e) k++;
                if (e >= 0 && k - r >= 3) runs.Add((c, r, k - r, false));
                r = k;
            }
        }

        if (runs.Count == 0) return groups;

        // 橫線和直線有共用格子時，要合併成同一組（L 型、T 型、十字）。
        int[] parent = new int[runs.Count];
        for (int i = 0; i < parent.Length; i++) parent[i] = i;
        int Find(int x)
        {
            while (parent[x] != x) x = parent[x] = parent[parent[x]];
            return x;
        }

        var owner = new int[N, N];
        var cover = new int[N, N];
        for (int c = 0; c < N; c++) for (int r = 0; r < N; r++) owner[c, r] = -1;
        for (int i = 0; i < runs.Count; i++)
        {
            var run = runs[i];
            for (int k = 0; k < run.Len; k++)
            {
                int c = run.C + (run.Horizontal ? k : 0), r = run.R + (run.Horizontal ? 0 : k);
                cover[c, r] |= run.Horizontal ? 1 : 2;
                if (owner[c, r] < 0) owner[c, r] = i;
                else parent[Find(i)] = Find(owner[c, r]);
            }
        }

        var byRoot = new Dictionary<int, MatchGroup>();
        var added = new bool[N, N];
        for (int i = 0; i < runs.Count; i++)
        {
            var run = runs[i];
            int root = Find(i);
            if (!byRoot.TryGetValue(root, out MatchGroup? g))
            {
                g = new MatchGroup { Element = (Element)Elem(run.C, run.R), LongestRun = i };
                byRoot[root] = g;
                groups.Add(g);
            }

            if (run.Len > g.MaxLen)
            {
                g.MaxLen = run.Len;
                g.LongestRun = i;
            }

            if (run.Horizontal) g.HasH = true;
            else g.HasV = true;
            for (int k = 0; k < run.Len; k++)
            {
                int c = run.C + (run.Horizontal ? k : 0), r = run.R + (run.Horizontal ? 0 : k);
                if (added[c, r]) continue;
                added[c, r] = true;
                g.Cells.Add(new Point(c, r));
            }
        }

        foreach (MatchGroup g in groups)
        {
            var longest = runs[g.LongestRun];
            bool hasPrefer1 = prefer1.HasValue && g.Cells.Contains(prefer1.Value);
            bool hasPrefer2 = prefer2.HasValue && g.Cells.Contains(prefer2.Value);
            if (g.MaxLen >= 5) g.Creates = Special.Core;
            else if (g.HasH && g.HasV) g.Creates = Special.Bomb;
            else if (g.MaxLen == 4)
            {
                // 玩家橫著滑就得到橫斬，直著滑就得到直斬；連鎖掉出來的則隨機。
                bool horizontal = (hasPrefer1 || hasPrefer2) && swapHorizontal.HasValue
                    ? swapHorizontal.Value
                    : rng != null ? rng.Next(2) == 0 : !longest.Horizontal;
                g.Creates = horizontal ? Special.LineH : Special.LineV;
            }

            if (hasPrefer1) g.CreateAt = prefer1!.Value;
            else if (hasPrefer2) g.CreateAt = prefer2!.Value;
            else
            {
                Point at = longest.Horizontal
                    ? new Point(longest.C + longest.Len / 2, longest.R)
                    : new Point(longest.C, longest.R + longest.Len / 2);
                if (g.Creates == Special.Bomb)
                {
                    foreach (Point p in g.Cells)
                    {
                        if (cover[p.X, p.Y] != 3) continue;
                        at = p;
                        break;
                    }
                }

                g.CreateAt = at;
            }
        }

        return groups;
    }

    /// <summary>兩顆特殊糖晶互換（或核心配任何糖晶）會直接發動合體技，不需要連成三顆。</summary>
    public static bool IsCombo(Piece a, Piece b) =>
        a.IsCandy && b.IsCandy &&
        (a.Special == Special.Core || b.Special == Special.Core ||
         (a.Special != Special.None && b.Special != Special.None));

    /// <summary>交換這兩格值多少（0 代表不能換）。提示、洗牌檢查和自動測試都用它。</summary>
    public int EvaluateSwap(int c1, int r1, int c2, int r2)
    {
        Piece? a = Cells[c1, r1], b = Cells[c2, r2];
        if (a == null || b == null || !a.Movable || !b.Movable) return 0;
        if (IsCombo(a, b)) return 60;
        Cells[c1, r1] = b;
        Cells[c2, r2] = a;
        List<MatchGroup> groups = FindMatches();
        Cells[c1, r1] = a;
        Cells[c2, r2] = b;
        int value = 0;
        foreach (MatchGroup g in groups)
        {
            value += g.Cells.Count + g.Creates switch
            {
                Special.Core => 12,
                Special.Bomb => 7,
                Special.LineH or Special.LineV => 4,
                _ => 0,
            };
        }

        return value;
    }

    public List<Move> FindMoves()
    {
        var moves = new List<Move>();
        for (int c = 0; c < N; c++)
        {
            for (int r = 0; r < N; r++)
            {
                if (c + 1 < N)
                {
                    int v = EvaluateSwap(c, r, c + 1, r);
                    if (v > 0) moves.Add(new Move(new Point(c, r), new Point(c + 1, r), v));
                }

                if (r + 1 < N)
                {
                    int v = EvaluateSwap(c, r, c, r + 1);
                    if (v > 0) moves.Add(new Move(new Point(c, r), new Point(c, r + 1), v));
                }
            }
        }

        return moves;
    }

    public bool HasAnyMove()
    {
        for (int c = 0; c < N; c++)
            for (int r = 0; r < N; r++)
                if ((c + 1 < N && EvaluateSwap(c, r, c + 1, r) > 0) || (r + 1 < N && EvaluateSwap(c, r, c, r + 1) > 0))
                    return true;
        return false;
    }
}
