export function getConfig(cfg) {
    cfg.name = "酷狗音乐";
    cfg.version = "1.1.3";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man) {
    let songList = [];

    request(`http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(`${meta.artist}-${meta.title}`)}&duration=${Math.round(meta.duration) * 1000}&hash=`, (err, res, body) => {
        if (err || res?.statusCode !== 200) return;

        songList = (JSON.parse(body)["candidates"] || [])
            .filter(song => song.id !== null && song.accesskey !== null && song.language !== "伴奏")
            .map(song => ({
                id: song.id, key: song.accesskey, title: song.song || "", artist: song.singer || ""
            }));
    });

    let lyricMeta = man.createLyric();

    songList.forEach(song => {
        request(`http://lyrics.kugou.com/download?ver=1&client=pc&id=${song.id}&accesskey=${song.key}&fmt=krc&charset=utf8`, (err, res, body) => {
            if (err && res.statusCode !== 200) return;

            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.lyricText = metaInfo(meta) + parse(JSON.parse(body)?.content);
            man.addLyric(lyricMeta);
        });
    });
}

// 解析歌词和翻译，并合并
const parse = content => {
    const zipData = xorKRC(base64Decode(content));
    const unzipData = zipData?.buffer && zlib.uncompress(zipData.buffer);
    content = unzipData && arrayBufferToString(unzipData);
    if (!content) return;

    // 解析增强LRC
    const lyric = parse_lrc(content);
    // 解析翻译
    const translate = parse_translate(content);
    // 合并Lrc和翻译
    return parseMerge(lyric, translate).join('\n');
}

// 解析为增强LRC
const parse_lrc = content => {
    const LINE_TIMESTAMP_REGEX = /^\[(?<start_time>\d+),\d+\]/;
    const WORD_TIMESTAMP_REGEX = /[<\(](?<start_time>\d+),(?<duration>\d+),\d+[>\)](?<word>[^<\(\n]*)/g;

    return content.replace(/\[(ti|ar|al|by|offset|kana|language|ch):[^\]]*\]\n|\r/g, '')
        .replace(/[  　]+/gm, " ")
        .split('\n')
        .filter(line => LINE_TIMESTAMP_REGEX.test(line))
        .map(line => {
            const lineStartTime = parseInt(LINE_TIMESTAMP_REGEX.exec(line).groups.start_time);
            return line
                .replace(LINE_TIMESTAMP_REGEX, _ => `[${formatTime(lineStartTime)}]<${formatTime(lineStartTime)}>`)
                .replace(WORD_TIMESTAMP_REGEX, (_, start, duration, word) => `${word}<${formatTime(lineStartTime + parseInt(start) + parseInt(duration))}>`);
        });
}

// 解析翻译
const parse_translate = content => {
    if (!content.includes("language") || content.includes("eyJjb250ZW50IjpbXSwidmVyc2lvbiI6MX0=")) return [];

    return JSON.parse(atob(content.match(/\[language:(?<language>.*?)\]/).groups.language.trim()))
        .content
        .filter(item => item.type === 1)
        .flatMap(item => item.lyricContent.map(([line]) =>
            ["TME", "//"].some(prefix => line.startsWith(prefix)) ? "" : line.replace(/[,，  　]+/g, " ")
        ));
};

// 合并Lrc和翻译
const parseMerge = (lyric, translate) =>
    !translate?.length ? lyric : lyric.flatMap((lyricLine, i) =>
        lyricLine ? (translate[i] ? [lyricLine, `${lyricLine.slice(0, 10)}${translate[i]}`] : [lyricLine]) : []
    );

const base64Decode = (str) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const table = Uint8Array.from({ length: 256 }, (_, i) => chars.indexOf(String.fromCharCode(i)) || 0);

    return Uint8Array.from({ length: str.length * 3 >> 2 }, (_, i) => {
        const j = i / 3 << 2;
        switch (i % 3) {
            case 0: return (table[str.charCodeAt(j)] << 2) | (table[str.charCodeAt(j + 1)] >> 4);
            case 1: return (table[str.charCodeAt(j + 1)] & 0xf) << 4 | (table[str.charCodeAt(j + 2)] >> 2);
            case 2: return (table[str.charCodeAt(j + 2)] & 0x3) << 6 | table[str.charCodeAt(j + 3)];
        }
    }).buffer;
};

const xorKRC = rawData => {
    if (!rawData) return;

    const view = new Uint8Array(rawData);
    const magic = [0x6b, 0x72, 0x63, 0x31]; // 'k','r','c','1'
    const offset = magic.length;

    if (view.length < offset || !magic.every((val, idx) => view[idx] === val)) return;

    const key = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69];
    return Uint8Array.from({ length: view.length - offset }, (_, idx) => view[idx + offset] ^ key[idx % key.length]);
};

const metaInfo = meta => `[ti:${meta.title}]\n[ar:${meta.artist}]\n[al:${meta.album}]\n`;

const formatTime = time => new Date(time).toISOString().slice(14, -2);
