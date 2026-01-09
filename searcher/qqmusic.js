export function getConfig(cfg) {
    cfg.name = "QQ 音乐";
    cfg.version = "1.2.1";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man, songList = []) {
    request(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=30&w=${meta.title}&format=json`, (err, res, body) => {
        if (err || res.statusCode !== 200) return;

        songList = (JSON.parse(body).data?.song?.list || []).map(song => ({
            id: song.songid, title: song.songname || '', artist: song.singer?.map(item => item.name).join('、') || '', album: song.albumname || ''
        }));
    });

    let lyricMeta = man.createLyric();

    let data = {
        comm: {
            _channelid: '0',
            _os_version: '6.2.9200-2',
            authst: '',
            ct: '19',
            cv: '1873',
            patch: '118',
            psrf_access_token_expiresAt: 0,
            psrf_qqaccess_token: '',
            psrf_qqopenid: '',
            psrf_qqunionid: '',
            tmeAppID: 'qqmusic',
            tmeLoginType: 2,
            uin: '0',
            wid: '0'
        },
        'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo': {
            method: 'GetPlayLyricInfo',
            module: 'music.musichallSong.PlayLyricInfo',
            param: {
                crypt: 1,
                ct: 19,
                cv: 1873,
                qrc: 1,
                qrc_t: 0,
                lrc: 1,
                lrc_t: 0,
                roma: 1,
                roma_t: 0,
                trans: 1,
                trans_t: 0,
                type: -1
            }
        }
    }
    songList.forEach(song => {
        Object.assign(data['music.musichallSong.PlayLyricInfo.GetPlayLyricInfo'].param, {
            songID: song.id,
            songName: btoa(song.title),
            singerName: btoa(song.artist),
            albumName: btoa(song.album),
            interval: meta.duration | 0,
        });
        let info = {
            method: 'post',
            url: `https://u.y.qq.com/cgi-bin/musicu.fcg?pcachetime=${new Date().getTime()}`,
            headers: {
                'Referer': 'https://y.qq.com',
                'Host': 'u.y.qq.com'
            },
            body: JSON.stringify(data)
        }

        request(info, (err, res, body) => {
            if (err || res.statusCode != 200) return

            let data = JSON.parse(body)['music.musichallSong.PlayLyricInfo.GetPlayLyricInfo']['data'];
            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.album = song.album;
            lyricMeta.lyricText = metaInfo(meta) + parse(decrypt(data?.lyric), decrypt(data?.trans));
            man.addLyric(lyricMeta);
        })
    });
}

import { formatTime, metaInfo, parseMerge } from "utils.js";
import { decodeQrc } from "parser_ext.so";

const parse = (lyric, translate) => {
    lyric = parseLrc(lyric);
    translate = parseTranslate(translate);

    return parseMerge(lyric, translate).join('\n');
};

const parseLrc = content =>
    content.replace(/^\[(ti|ar|al|by|offset|kana|language|ch).*\]\s*\r?\n?/gm, "")
        .replace(/[  　]+/gm, " ")
        .replace(/^\[(?<startTime>\d+),\d+\]/gm, (_, startTime) => `[${formatTime(startTime)}]<${formatTime(startTime)}>`)
        .replace(/[<\(](?<startTime>\d+),(?<duration>\d+)[>\)]/gm, (_, startTime, duration) => `<${formatTime(+startTime + +duration)}>`)
        .split(/\r?\n/);

const parseTranslate = content =>
    content.replace(/^\[.*?\]\s*\r?\n?|.*(著作权|\/\/)$/gm, "")
        .replace(/[,，  　]+/gm, " ")
        .split(/\r?\n/);

const decrypt = content => {
    if (!content) return "";
    content = arrayBufferToString(zlib.uncompress(decodeQrc(restore(content))));

    return (content?.match(/LyricContent="([\s\S]*?)"\//)?.[1] ?? content) || '';
};

const restore = (hexText, sig = "[offset:0]\n") =>
    Uint8Array.from({ length: (hexText.length / 2) + sig.length }, (_, i) =>
        i < sig.length ? sig.charCodeAt(i) : parseInt(hexText.substr((i - sig.length) * 2, 2), 16)
    ).buffer;
