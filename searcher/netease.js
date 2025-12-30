export function getConfig(cfg) {
    cfg.name = "网易云音乐";
    cfg.version = "1.2.3";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man) {
    let songList = [];

    request(`https://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s=${encodeURIComponent(meta.title)}&type=1&offset=0&total=true&limit=20`, (err, res, body) => {
        if (err || res?.statusCode !== 200) return;

        songList = (JSON.parse(body)?.result?.songs || []).map(song => ({
            id: song.id, title: song.name, artist: song.artists?.map(item => item.name).join('、') || '', album: song.album?.name || ''
        }));
    });

    let lyricMeta = man.createLyric();

    songList.forEach(song => {
        request(`https://music.163.com/api/song/lyric?os=pc&id=${song.id}&yv=-1&tv=-1&lv=-1`, (err, res, body) => {
            if (err && res.statusCode !== 200) return;
            const data = JSON.parse(body);

            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.album = song.album;
            lyricMeta.lyricText = metaInfo(meta) + (parse(data?.yrc?.lyric, data?.tlyric?.lyric) || parseText(data?.lrc?.lyric) + parseText(data?.tlyric?.lyric));
            man.addLyric(lyricMeta);
        });
    });
}

const parse = (lyric, translate) => {
    lyric = parseLrc(lyric);
    translate = parseTranslate(translate);

    return parseMerge(lyric, translate).join('\n');
};

const parseLrc = (content = "") =>
    content.replace(/^\[(ti|ar|al|by|offset|kana|language|ch).*\]\s*\r?\n?|.*\(\d+,\d+,\d+\)\s*([作编][词曲]|演?[唱唄]).*\n?|\(\d+,\d+,0\)\s$|(?<=\)\s)\(\d+,\d+,0\)\s/gm, "")
        .replace(/^\[(\d+),\d+\]/gm, (_, startTime) => `[${formatTime(parseInt(startTime))}]<${formatTime(parseInt(startTime))}>`)
        .replace(/[<\(](\d+),(\d+),\d+[>\)]([^<\(\n]*)/gm, (_, startTime, duration, word = "") => `${word}<${formatTime(parseInt(startTime) + parseInt(duration))}>`)
        .replace(/(?<=>\s)<\d{2}:\d{2}\.\d{2}>\s/gm, "")
        .replace(/[  　]+/gm, " ")
        .split(/\r?\n/);

const parseText = (content = "") =>
    content.replace(/^\[.*\]\s*([作编][词曲].*)?$|(?<=\[.*?\])\s+|.*纯音乐.*|\[00:00\.00 - 1\]/gm, "")
        .replace(/[,，  　]+/gm, " ");

const parseTranslate = (content = "") =>
    content.replace(/^\[.*?\]\s*\r?\n?/gm, "")
        .replace(/[,， 　]+/gm, " ")
        .split(/\r?\n/);

const parseMerge = (lyric, translate) =>
    !translate?.length ? lyric : lyric.flatMap((lyricLine, i) =>
        lyricLine ? (translate[i] ? [lyricLine, `${lyricLine.slice(0, 10)}${translate[i]}`] : [lyricLine]) : []
    );

const metaInfo = meta => `[ti:${meta.title}]\n[ar:${meta.artist}]\n[al:${meta.album}]\n`;

const formatTime = time => new Date(time).toISOString().slice(14, -2);
