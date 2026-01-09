export function getConfig(cfg) {
    cfg.name = "网易云音乐";
    cfg.version = "1.3.1";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man, songList = []) {
    request(`https://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s=${encodeURIComponent(meta.title)}&type=1&offset=0&total=true&limit=50`, (err, res, body) => {
        if (err || res.statusCode !== 200) return;

        songList = (JSON.parse(body)?.result?.songs || []).map(song => ({
            id: song.id, title: song.name, artist: song.artists?.map(item => item.name).join('、') || '', album: song.album?.name || ''
        }));
    });

    let lyricMeta = man.createLyric();

    songList.forEach(song => {
        request(`https://music.163.com/api/song/lyric?os=pc&id=${song.id}&yv=-1&tv=-1&lv=-1`, (err, res, body) => {
            if (err || res.statusCode !== 200) return;
            const data = JSON.parse(body);

            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.album = song.album;
            lyricMeta.lyricText = metaInfo(meta) + (parse(data?.yrc?.lyric, data?.tlyric?.lyric) || parseText(data?.lrc?.lyric) + parseText(data?.tlyric?.lyric));
            man.addLyric(lyricMeta);
        });
    });
}

import { formatTime, metaInfo, parseMerge } from "utils.js";

const parse = (lyric, translate) => {
    lyric = parseLrc(lyric);
    translate = parseTranslate(translate);

    return parseMerge(lyric, translate).join('\n');
};

const parseLrc = (content = "") =>
    content.replace(/^\[(ti|ar|al|by|offset|kana|language|ch).*\]\s*\r?\n?|.*\(\d+,\d+,\d+\)\s*([作编](\(\d+,\d+,\d+\)\s*)?[词曲]|演?[唱唄]).*\n?|\(\d+,\d+,0\)\s$|(?<=\)\s)\(\d+,\d+,0\)\s/gm, "")
        .replace(/^\[(\d+),\d+\]/gm, (_, startTime) => `[${formatTime(startTime)}]<${formatTime(startTime)}>`)
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
