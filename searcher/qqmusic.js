export function getConfig(cfg) {
    cfg.name = "QQ 音乐";
    cfg.version = "1.1.1";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man) {
    let songList = [];

    request(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=30&w=${meta.title}&format=json`, (err, res, body) => {
        if (err || res?.statusCode !== 200) return;

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
            module: 'music.musichallSong.PlayLyricInfo'
        }
    }
    for (const song of songList) {
        data['music.musichallSong.PlayLyricInfo.GetPlayLyricInfo']['param'] = {
            songID: song.id,
            songName: btoa(song.title),
            singerName: btoa(song.artist),
            albumName: btoa(song.album),
            interval: meta.duration | 0,
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
        let settings = {
            method: 'post',
            url: `https://u.y.qq.com/cgi-bin/musicu.fcg?pcachetime=${new Date().getTime()}`,
            headers: {
                'Referer': 'https://y.qq.com',
                'Host': 'u.y.qq.com'
            },
            body: JSON.stringify(data)
        }

        request(settings, (err, res, body) => {
            if (err || res.statusCode != 200) return

            let data = JSON.parse(body)['music.musichallSong.PlayLyricInfo.GetPlayLyricInfo']['data'];
            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.album = song.album;
            lyricMeta.lyricText = metaInfo(meta) + parse(decrypt(data?.lyric), decrypt(data?.trans));

            man.addLyric(lyricMeta);
        })
    }

}

import * as decoder from "parser_ext.so"

function decrypt(content) {
    if (!content) return "";
    const zipData = decoder.decodeQrc(restore(content));
    const unzipData = zipData && zlib.uncompress(zipData);
    content = unzipData && arrayBufferToString(unzipData)
    return (content?.match(/LyricContent="([\s\S]*?)"\//)?.[1] ?? content) || '';
}

function restore(hexText) {
    if (hexText.length % 2 !== 0) return null;

    const sig = "[offset:0]\n";
    const arrBuf = new Uint8Array(hexText.length / 2 + sig.length);
    arrBuf.set(sig.split('').map(char => char.charCodeAt(0)), 0);

    for (let i = 0; i < hexText.length; i += 2) {
        arrBuf[sig.length + i / 2] = parseInt(hexText.substr(i, 2), 16);
    }
    return arrBuf.buffer;
}

function parse(lyric, translate) {
    const lrc = parseLrc(lyric);
    const trans = parseTranslate(translate);

    return parseMerge(lrc, trans).join('\n');
}

function parseLrc(content) {
    // 替换信息标签
    return content.replace(/^\[(ti|ar|al|by|offset|kana|language|ch).*\]\s*\r?\n?/gm, "")
        .replace(/^\[(\d+),\d+\]/gm, (_, startTime) => `[${formatTime(parseInt(startTime))}]<${formatTime(parseInt(startTime))}>`)
        .replace(/[<\(](\d+),(\d+)[>\)]/gm, (_, startTime, duration) => `<${formatTime(parseInt(startTime) + parseInt(duration))}>`)
        .split(/\r?\n/);
}

function parseTranslate(content) {
    return content.replace(/^\[.*?\]\s*\r?\n?|.*(著作权|\/\/)$/gm, "")
        .replace(/[,， 　]+/gm, " ")
        .split(/\r?\n/);
}

function parseMerge(lyric, translate) {
    if (!translate?.length) return lyric;

    return lyric.flatMap((lyricLine, index) => {
        if (!lyricLine) return [];

        let result = [lyricLine];
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
