export function getConfig(config) {
    config.name = "网易云音乐";
    config.version = "1.1";
    config.author = "ameyuri";
}

export function getLyrics(meta, man) {
    let songList = []

    request(`https://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s=${encodeURIComponent(meta.title)}&type=1&offset=0&total=true&limit=20`, (err, res, body) => {
        if (err && res.statusCode !== 200) return;
        const data = JSON.parse(body)["result"]["songs"] || [];

        for (let song of data) {
            songList.push({ id: song.id, title: song.name, artist: song.artists.map(item => item.name).join('、') || '', album: song.album.name });
        }
    })

    let lyricMeta = man.createLyric();

    for (let song of songList) {
        request(`https://music.163.com/api/song/lyric?os=pc&id=${song.id}&yv=-1&tv=-1&lv=-1`, (err, res, body) => {
            if (err && res.statusCode !== 200) return;
            const data = JSON.parse(body);

            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.album = song.album;
            if (data?.yrc?.lyric) {
                lyricMeta.lyricText = metaInfo(meta) + parse(data?.yrc?.lyric, (data?.tlyric?.lyric ?? ""));
            } else if (data?.lrc?.lyric && !(/纯音乐|\[00:00\.00-1\]/).test(data.lrc.lyric)) {
                lyricMeta.lyricText = metaInfo(meta) + data?.lrc?.lyric + (data?.tlyric?.lyric ?? "");
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
    // 替换信息标签
    return content.replace(/\[[ti|ar|al|by|offset|kana|language|ch].*\]\n/gm, "")
        .replace(/^\[(\d+),(\d+)\]/gm, (match, startTime, duration) => `[${formatTime(parseInt(startTime))}]<${formatTime(parseInt(startTime))}>`)
        .replace(/[<\(](\d+),(\d+),(\d+)[>\)]([^<\(\n]*)/gm, (match, startTime, duration, _, word = "") => `${word}<${formatTime(parseInt(startTime) + parseInt(duration))}>`)
        .split(/\r?\n/);
}

function parseTranslate(content) {
    return content.replace(/^\[.*?\]\n?/gm, "")
        .replace(/[,，]+/gm, " ")
        .split(/\r?\n/);
}

function parseMerge(lyric, translate) {
    /**
     * 合并Lrc和翻译，若无翻译则直接返回Lrc
     */
    if (!translate || translate.length === 0) return lyric;

    return lyric.reduce((result, lyricLine, index) => {
        if (!lyricLine) return result;

        result.push(lyricLine);
        if (translate[index]) {
            result.push(`${lyricLine.slice(0, 10)}${translate[index]}`);
        }
        return result;
    }, []);
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