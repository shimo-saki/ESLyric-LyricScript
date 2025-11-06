export function getConfig(cfg) {
    cfg.name = "网易云音乐";
    cfg.version = "1.2.1";
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

    for (let song of songList) {
        request(`https://music.163.com/api/song/lyric?os=pc&id=${song.id}&yv=-1&tv=-1&lv=-1`, (err, res, body) => {
            if (err && res.statusCode !== 200) return;
            const data = JSON.parse(body);

            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.album = song.album;
            if (data?.yrc?.lyric) {
                lyricMeta.lyricText = metaInfo(meta) + parse(data.yrc.lyric, data?.tlyric?.lyric ?? "");
            } else if (data?.lrc?.lyric && !(/纯音乐|\[00:00\.00-1\]/).test(data.lrc.lyric)) {
                lyricMeta.lyricText = metaInfo(meta) + parseText(data.lrc.lyric) + parseText(data?.tlyric?.lyric ?? "");
            }
            man.addLyric(lyricMeta);
        });
    }
}

function parse(lyric, translate) {   
    const lrc = parseLrc(lyric);
    const trans = parseTranslate(translate);

    return parseMerge(lrc, trans).join('\n');
}

function parseLrc(content) {
    return content.replace(/^\[(ti|ar|al|by|offset|kana|language|ch).*\]\s*\r?\n?|.*\(\d+,\d+,\d+\)[作词曲].*\n?/gm, "")
        .replace(/^\[(\d+),\d+\]/gm, (_, startTime) => `[${formatTime(parseInt(startTime))}]<${formatTime(parseInt(startTime))}>`)
        .replace(/[<\(](\d+),(\d+),\d+[>\)]([^<\(\n]*)/gm, (_, startTime, duration, word = "") => `${word}<${formatTime(parseInt(startTime) + parseInt(duration))}>`)
        .split(/\r?\n/);
}

function parseText(content) {
    return content.replace(/^\[.*\]\s*(作[词曲].*)?$|(?<=\[.*?\])\s+/gm, "")
}

function parseTranslate(content) {
    return content.replace(/^\[.*?\]\s*\r?\n?/gm, "")
        .replace(/[,， 　]+/gm, " ")
        .split(/\r?\n/);
}

function parseMerge(lyric, translate) {
    if (!translate?.length) return lyric;

    return lyric.flatMap((lyricLine, index) => {
        if (!lyricLine) return [];

        const result = [lyricLine];
        if (translate[index]) result.push(`${lyricLine.slice(0, 10)}${translate[index]}`);
        return result;
    });
}

function metaInfo(meta) {
    return `[ti:${meta.title}]\n[ar:${meta.artist}]\n[al:${meta.album}]\n`;
}

function formatTime(time) {
    const date = new Date(time);
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0').slice(0, 2);

    return `${minutes}:${seconds}.${milliseconds}`;
}