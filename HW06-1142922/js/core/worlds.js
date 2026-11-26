// 九個世界與兩大陣營的資料。介面文字用中文（heroZh、work），演出用日文（heroJa、moveJa、reading）。

export const WORLDS = [
  { cell: 0, heroZh: '綠谷出久', heroJa: '緑谷出久', work: '我的英雄學院', moveJa: 'デトロイト・スマッシュ', reading: 'DETROIT SMASH', color: '#3cd070', line: null },
  { cell: 1, heroZh: '漩渦鳴人', heroJa: 'うずまきナルト', work: '火影忍者', moveJa: '螺旋丸', reading: 'らせんがん', color: '#ff7a00', line: null },
  { cell: 2, heroZh: '艾連', heroJa: 'エレン・イェーガー', work: '進擊的巨人', moveJa: '巨人化', reading: 'きょじんか', color: '#d4a017', line: null },
  { cell: 3, heroZh: '江戶川柯南', heroJa: '江戸川コナン', work: '名偵探柯南', moveJa: 'キック力増強シューズ', reading: 'きっくりょくぞうきょうしゅーず', color: '#2b6cff', line: '真実はいつもひとつ！' },
  { cell: 4, heroZh: '魯夫', heroJa: 'モンキー・D・ルフィ', work: '航海王', moveJa: 'ゴムゴムの猿神銃', reading: 'ばじゅらんぐがん', color: '#fff4d6', line: null },
  { cell: 5, heroZh: '御坂美琴', heroJa: '御坂美琴', work: '科學超電磁砲', moveJa: '超電磁砲', reading: 'レールガン', color: '#ffb347', line: null },
  { cell: 6, heroZh: '納茲', heroJa: 'ナツ・ドラグニル', work: 'FAIRY TAIL', moveJa: '火竜の咆哮', reading: 'かりゅうのほうこう', color: '#ff3b1f', line: null },
  { cell: 7, heroZh: '桐谷和人', heroJa: 'キリト', work: '刀劍神域', moveJa: 'スターバースト・ストリーム', reading: 'STARBURST STREAM', color: '#9be7ff', line: null },
  { cell: 8, heroZh: '黑崎一護', heroJa: '黒崎一護', work: '死神', moveJa: '月牙天衝', reading: 'げつがてんしょう', color: '#c0122c', line: null },
];

export const FACTIONS = {
  rimuru: {
    id: 'rimuru',
    nameZh: '利姆路',
    nameJa: 'リムル＝テンペスト',
    primary: '#3fd0ff',
    secondary: '#1a6fff',
    entranceJa: '暴食之王', entranceReading: 'ベルゼビュート',
    unisonJa: '神之怒', unisonReading: 'メギド',
    victoryJa: '暴食之王', victoryReading: 'ベルゼビュート',
  },
  gojo: {
    id: 'gojo',
    nameZh: '五條悟',
    nameJa: '五条悟',
    primary: '#f2f6ff',
    secondary: '#8a5cff',
    entranceJa: '無下限呪術', entranceReading: 'むかげんじゅじゅつ',
    unisonJa: '虚式「茈」', unisonReading: 'きょしき「むらさき」',
    victoryJa: '領域展開「無量空処」', victoryReading: 'りょういきてんかい「むりょうくうしょ」',
  },
};
