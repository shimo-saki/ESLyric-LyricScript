export function getConfig(cfg) {
    cfg.name = "酷狗音乐";
    cfg.version = "1.2.1";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man, songList = []) {
    request(`http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(`${meta.artist}-${meta.title}`)}`, (err, res, body) => {
        if (err || res.statusCode !== 200) return;

        songList = (JSON.parse(body)["candidates"] || [])
            .filter(song => song.id !== null && song.accesskey !== null && song.language !== "伴奏")
            .map(song => ({
                id: song.id, key: song.accesskey, title: song.song || "", artist: song.singer || ""
            }));
    });

    let lyricMeta = man.createLyric();

    songList.forEach(song => {
        request(`http://lyrics.kugou.com/download?ver=1&client=pc&id=${song.id}&accesskey=${song.key}&fmt=krc&charset=utf8`, (err, res, body) => {
            if (err || res.statusCode !== 200) return;

            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.lyricText = metaInfo(meta) + parse(JSON.parse(body)?.content);
            man.addLyric(lyricMeta);
        });
    });
}

import { formatTime, metaInfo, parseMerge } from "utils.js";

const parse = content => {
    content = arrayBufferToString(zlib.uncompress(decrypt(base64Decode(content))));
    if (!content) return '';

    const lyric = parseLrc(content);
    const translate = parseTranslate(content);
    return parseMerge(lyric, translate).join('\n');
}

const parseLrc = content => {
    const LINE_TIMESTAMP_REGEX = /^\[(?<startTime>\d+),\d+\]/;
    const WORD_TIMESTAMP_REGEX = /[<\(](?<startTime>\d+),(?<duration>\d+),\d+[>\)](?<word>[^<\(\n]*)/g;

    return content.replace(/\[(ti|ar|al|by|offset|kana|language|ch):[^\]]*\]\n|\r/g, '')
        .replace(/[  　]+/gm, " ")
        .split('\n')
        .filter(line => LINE_TIMESTAMP_REGEX.test(line))
        .map((line, { time = LINE_TIMESTAMP_REGEX.exec(line).groups.startTime }) =>
            line.replace(LINE_TIMESTAMP_REGEX, _ => `[${formatTime(time)}]<${formatTime(time)}>`)
                .replace(WORD_TIMESTAMP_REGEX, (_, startTime, duration, word) => `${word}<${formatTime(+time + +startTime + +duration)}>`)
        )
}

const parseTranslate = content => {
    if (!content.includes("language") || content.includes("eyJjb250ZW50IjpbXSwidmVyc2lvbiI6MX0=")) return;

    return JSON.parse(atob(content.match(/\[language:(?<language>[^\]]*)\]/).groups.language.trim()))
        .content
        .filter(item => item.type === 1)
        .flatMap(item => item.lyricContent.map(([line]) =>
            ["TME", "//"].some(prefix => line.startsWith(prefix)) ? "" : line.replace(/[,，  　]+/g, " ")
        ));
};

const base64Decode = (str, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', table = Uint8Array.from({ length: 256 }, (_, i) => chars.indexOf(String.fromCharCode(i)) || 0)) => {
    // const ;
    // const table = Uint8Array.from({ length: 256 }, (_, i) => chars.indexOf(String.fromCharCode(i)) || 0);

    return Uint8Array.from({ length: str.length * 3 >> 2 }, (_, i) => {
        const j = i / 3 << 2;
        switch (i % 3) {
            case 0: return (table[str.charCodeAt(j)] << 2) | (table[str.charCodeAt(j + 1)] >> 4);
            case 1: return (table[str.charCodeAt(j + 1)] & 0xf) << 4 | (table[str.charCodeAt(j + 2)] >> 2);
            case 2: return (table[str.charCodeAt(j + 2)] & 0x3) << 6 | table[str.charCodeAt(j + 3)];
        }
    });
};

const decrypt = content =>
    Uint8Array.from(content.slice(4), (val, i, key = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69]) => val ^ key[i % key.length]).buffer;
