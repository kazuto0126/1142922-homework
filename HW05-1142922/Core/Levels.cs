namespace CandyLegend.Core;

public enum LevelMode { Jelly, Shards, Mixed, Score, Boss }

/// <summary>主題關卡的場地機關：天空草原的強風、雷鳴峽谷的落雷（冰原的厚冰與星靈神殿的傳送門另外設定）。</summary>
public enum Hazard { None, Wind, Lightning }

/// <summary>一關的全部設定。果凍與障礙物用 9 行字串畫出來，一眼就能看出關卡長相。</summary>
public sealed class LevelDef
{
    public int Number;
    public string Name = "";
    public LevelMode Mode;
    public int Moves;

    /// <summary>'1'、'2' 代表果凍層數，其他字元代表沒有果凍。</summary>
    public string[] Jelly = Array.Empty<string>();

    /// <summary>'S' 是岩石，'F' 是被冰封的糖晶，'D' 是厚冰（要打兩次）。</summary>
    public string[] Blocks = Array.Empty<string>();

    public int Shards;
    public int ShardMax = 1;

    /// <summary>場地機關，以及每走幾步發動一次。</summary>
    public Hazard Hazard;
    public int HazardEvery = 3;

    /// <summary>
    /// 傳送門：每兩個數字一組（入口行, 出口行）。入口行最底下的糖晶會掉進傳送門，
    /// 從出口行的最上面掉出來；出口行自己不再補新糖晶。
    /// </summary>
    public int[] Portals = Array.Empty<int>();

    /// <summary>關卡說明裡的場地機關介紹（沒有機關是空字串）。</summary>
    public string FieldText =>
        Hazard == Hazard.Wind ? $"強風：糖晶往下風處的旁邊掉，每 {HazardEvery} 步風向反轉"
        : Hazard == Hazard.Lightning ? $"落雷：每 {HazardEvery} 步隨機劈碎兩格"
        : Portals.Length > 0 ? "傳送門：糖晶掉進底部的傳送門，會從另一行的頂端掉出來"
        : Blocks.Any(row => row.Contains('D')) ? "厚冰：厚厚的冰封要消兩次才會破"
        : "";
    public int ShardGap = 2;
    public int BossHp;

    /// <summary>分數挑戰關要達到的分數（0 代表沒有分數條件）。</summary>
    public int TargetScore;

    /// <summary>二星與三星需要的分數（一星 = 過關）。依機器人試玩：約九成的過關能拿二星、約七成能拿三星。</summary>
    public int Star2, Star3;

    /// <summary>0–5 是獲得的神器，6–8 是神器強化（各強化兩件，見 <see cref="Levels.Boosted"/>），-1 是沒有獎勵。</summary>
    public int Reward = -1;

    public string ModeName => Mode switch
    {
        LevelMode.Jelly => "清除果凍",
        LevelMode.Shards => "收集掉落物",
        LevelMode.Mixed => "綜合目標",
        LevelMode.Score => "分數挑戰",
        _ => "魔王決戰",
    };
}

public sealed class ArtifactInfo
{
    public string Name = "", Skill = "", Text = "";

    /// <summary>技能名的日文讀音，發動特寫時寫在招式名上面。</summary>
    public string Reading = "";
    public Element Element;

    /// <summary>第 7–9 關破關後的強化版招式（招式名、讀音、效果說明）。</summary>
    public string Skill2 = "", Reading2 = "", Text2 = "";

    public string SkillName(bool boosted) => boosted ? Skill2 : Skill;
    public string SkillReading(bool boosted) => boosted ? Reading2 : Reading;
    public string SkillText(bool boosted) => boosted ? Text2 : Text;
}

/// <summary>
/// 合體魔法（ユニゾンレイド）：兩件搭檔神器同時充滿時，兩人合放一招。
/// 只收原作有的組合：火＋雷、天空＋星；冰與劍沒有搭檔。
/// </summary>
public sealed class UnisonInfo
{
    public int A, B;
    public string Name = "", Reading = "", Pair = "", Text = "";
}

public static class Levels
{
    public const int Count = 10;

    /// <summary>
    /// 雷炎竜：原作天狼島篇納茲吃下拉克薩斯的雷，化成雷炎龍。
    /// 天竜の咆哮×サンドバスター：原作中溫蒂與露西（天蠍座）的合體魔法。
    /// </summary>
    public static readonly UnisonInfo[] Unisons =
    {
        new()
        {
            A = 0, B = 3, Name = "雷炎竜の咆哮", Reading = "ユニゾンレイド　らいえんりゅうのほうこう", Pair = "ナツ×ラクサス",
            Text = "三排寬的雷炎吐息橫掃盤面，再落下 12 道雷炎",
        },
        new()
        {
            A = 2, B = 4, Name = "天竜×サンドバスター", Reading = "ユニゾンレイド　てんりゅうのほうこう×サンドバスター", Pair = "ウェンディ×ルーシィ",
            Text = "天空之風捲起星靈的沙暴：三行龍捲貫穿盤面，再捲起 5 顆特殊糖晶引爆",
        },
    };

    /// <summary>這件神器所屬的合體魔法編號。</summary>
    public static int UnisonOf(int artifact) => Array.FindIndex(Unisons, u => u.A == artifact || u.B == artifact);

    /// <summary>合體魔法的搭檔；沒有搭檔的神器回傳 -1。</summary>
    public static int Partner(int artifact)
    {
        int index = UnisonOf(artifact);
        if (index < 0) return -1;
        UnisonInfo u = Unisons[index];
        return u.A == artifact ? u.B : u.A;
    }

    public static readonly string[] ElementNames = { "火", "冰", "天空", "雷", "星", "劍" };

    /// <summary>神器強化獎勵（Reward 6–8）各強化哪兩件神器：第 7 關火與冰、第 8 關天空與雷、第 9 關星與劍。</summary>
    public static int[] Boosted(int reward) => new[] { (reward - 6) * 2, (reward - 6) * 2 + 1 };

    /// <summary>已經打過 <paramref name="tiers"/> 個強化關卡時，這件神器是不是強化版。</summary>
    public static bool IsBoosted(int artifact, int tiers) => tiers >= artifact / 2 + 1;

    public static readonly ArtifactInfo[] Artifacts =
    {
        // 神器與技能的名稱取自《FAIRY TAIL》的招式（使用者指定）；技能名用日文原文，畫面比較有張力。
        // 火＝納茲、冰＝格雷、天空＝溫蒂、雷＝拉格薩斯、星＝露西、劍＝艾爾莎。
        // 強化版（第 7、8、9 關各強化兩件）也取自同一部作品的招式。
        new()
        {
            Element = Element.Fire, Name = "紅蓮鳳凰劍", Skill = "紅蓮爆炎刃", Reading = "滅竜奥義　ぐれんばくえんじん", Text = "在障礙最多的五處引爆 3×3 爆炎",
            Skill2 = "炎竜王の崩拳", Reading2 = "滅竜奥義　えんりゅうおうのほうけん", Text2 = "六處爆炎＋一記 5×5 炎龍王之拳，還留下兩顆炸彈火種",
        },
        new()
        {
            Element = Element.Ice, Name = "槍騎兵", Skill = "絶対氷結", Reading = "アイスドシェル", Text = "步數 +1（魔王戰改為拖延魔王出招），粉碎冰封與岩石，再凍碎 12 格",
            Skill2 = "氷魔の激昂", Reading2 = "滅悪魔法　ひょうまのげきこう", Text2 = "步數 +1，粉碎冰封與岩石，凍碎 16 格，再用三道冰槍貫穿三直行",
        },
        new()
        {
            Element = Element.Sky, Name = "天龍的波颪", Skill = "照破・天空穿", Reading = "滅竜奥義　しょうは・てんくうせん", Text = "天空之風一口氣貫穿三整排",
            Skill2 = "ミルキーウェイ", Reading2 = "滅竜魔法　てんのがわ", Text2 = "貫穿四整排，銀河漩渦捲走 5×5，還替哈比的魚開出直達底部的路",
        },
        new()
        {
            Element = Element.Thunder, Name = "鳴御雷", Skill = "神鳴殿", Reading = "かみなりでん", Text = "落雷劈碎 18 格",
            Skill2 = "雷竜方天戟", Reading2 = "滅竜奥義　らいりゅうほうてんげき", Text2 = "落雷 24 道，再擲出雷戟十字貫穿整個盤面",
        },
        new()
        {
            Element = Element.Star, Name = "黃金星靈鑰匙", Skill = "ウラノ・メトリア", Reading = "星霊魔法　全天八十八星座", Text = "群星降下，把 5 顆糖晶變成特殊糖晶並立刻引爆",
            Skill2 = "スタードレス", Reading2 = "星霊衣×ウラノ・メトリア", Text2 = "8 顆特殊糖晶連環引爆，其中一顆是消滅整種屬性的核心",
        },
        new()
        {
            Element = Element.Sword, Name = "天輪之鎧", Skill = "天輪・五芒星の剣", Reading = "換装魔法　ペンタグラムソード", Text = "五芒星劍陣斬盡場上最多的兩種屬性",
            Skill2 = "天輪・繚乱の剣", Reading2 = "換装魔法　ブルーメンブラット", Text2 = "百劍齊舞，斬盡場上最多的三種屬性與所有岩石",
        },
    };

    public static readonly LevelDef[] All =
    {
        new()
        {
            Number = 1, Name = "炎之試煉", Mode = LevelMode.Score, Moves = 20, Reward = 0, Star2 = 350000, Star3 = 390000,
            TargetScore = 290000,
        },
        new()
        {
            Number = 2, Name = "霜華之谷", Mode = LevelMode.Shards, Moves = 20, Reward = 1, Star2 = 550000, Star3 = 760000,
            Shards = 5, ShardMax = 2,
            Blocks = new[]
            {
                ".........",
                ".........",
                "D.......D",
                ".........",
                "..D...D..",
                ".........",
                "D..D.D..D",
                ".........",
                ".........",
            },
        },
        new()
        {
            Number = 3, Name = "天空草原", Mode = LevelMode.Mixed, Moves = 16, Reward = 2, Star2 = 430000, Star3 = 740000,
            Shards = 3, ShardMax = 1, Hazard = Hazard.Wind, HazardEvery = 4,
            Jelly = new[]
            {
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                "111111111",
                "111111111",
                "111111111",
            },
        },
        new()
        {
            Number = 4, Name = "雷鳴峽谷", Mode = LevelMode.Jelly, Moves = 12, Reward = 3, Star2 = 150000, Star3 = 210000,
            Hazard = Hazard.Lightning, HazardEvery = 3,
            Jelly = new[]
            {
                ".........",
                ".........",
                "..11111..",
                "..12221..",
                "..12221..",
                "..12221..",
                "..11111..",
                ".........",
                ".........",
            },
            Blocks = new[]
            {
                "F.......F",
                ".........",
                ".........",
                "....F....",
                "...F.F...",
                "....F....",
                ".........",
                ".........",
                "F..F.F..F",
            },
        },
        new()
        {
            Number = 5, Name = "星靈神殿", Mode = LevelMode.Shards, Moves = 18, Reward = 4, Star2 = 1630000, Star3 = 2050000,
            Shards = 8, ShardMax = 2, Portals = new[] { 1, 7, 3, 5 },
            Blocks = new[]
            {
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                ".........",
                ".SSSSSSS.",
                ".........",
                ".........",
            },
        },
        new()
        {
            Number = 6, Name = "緋劍迴廊", Mode = LevelMode.Score, Moves = 17, Reward = 5, Star2 = 1300000, Star3 = 1350000,
            TargetScore = 1250000,
        },
        new()
        {
            Number = 7, Name = "熔岩裂谷", Mode = LevelMode.Jelly, Moves = 10, Reward = 6, Star2 = 240000, Star3 = 310000,
            Jelly = new[]
            {
                ".........",
                ".2222222.",
                ".2222222.",
                ".2222222.",
                ".2222222.",
                ".2222222.",
                ".2222222.",
                ".2222222.",
                ".........",
            },
            Blocks = new[]
            {
                ".........",
                ".........",
                ".........",
                "...S.S...",
                ".........",
                "...S.S...",
                ".........",
                ".........",
                ".........",
            },
        },
        new()
        {
            Number = 8, Name = "冰封王道", Mode = LevelMode.Shards, Moves = 17, Reward = 7, Star2 = 1150000, Star3 = 1470000,
            Shards = 8, ShardMax = 2,
            Blocks = new[]
            {
                ".........",
                ".........",
                "F.F.F.F.F",
                ".........",
                ".F.F.F.F.",
                ".........",
                "SS.....SS",
                ".........",
                ".........",
            },
        },
        new()
        {
            Number = 9, Name = "魔王城門", Mode = LevelMode.Mixed, Moves = 12, Reward = 8, Star2 = 360000, Star3 = 540000,
            Shards = 4, ShardMax = 2,
            Jelly = new[]
            {
                "22.....22",
                "222...222",
                ".222.222.",
                "..22222..",
                "...222...",
                "..22222..",
                ".222.222.",
                "222...222",
                "22.....22",
            },
            Blocks = new[]
            {
                ".........",
                "....F....",
                ".........",
                "S.......S",
                ".F.....F.",
                "S.......S",
                ".........",
                "....F....",
                ".........",
            },
        },
        new()
        {
            Number = 10, Name = "魔王決戰", Mode = LevelMode.Boss, Moves = 40, BossHp = 780000, Star2 = 12400000, Star3 = 13200000,
        },
    };
}
