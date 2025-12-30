export function getConfig(cfg) {
    cfg.name = "QQ 音乐";
    cfg.version = "1.1.3";
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
    });
}

const parse = (lyric, translate) => {
    lyric = parseLrc(lyric);
    translate = parseTranslate(translate);

    return parseMerge(lyric, translate).join('\n');
};

const parseLrc = content =>
    content.replace(/^\[(ti|ar|al|by|offset|kana|language|ch).*\]\s*\r?\n?/gm, "")
        .replace(/[  　]+/gm, " ")
        .replace(/^\[(\d+),\d+\]/gm, (_, startTime) => `[${formatTime(parseInt(startTime))}]<${formatTime(parseInt(startTime))}>`)
        .replace(/[<\(](\d+),(\d+)[>\)]/gm, (_, startTime, duration) => `<${formatTime(parseInt(startTime) + parseInt(duration))}>`)
        .split(/\r?\n/);

const parseTranslate = content =>
    content.replace(/^\[.*?\]\s*\r?\n?|.*(著作权|\/\/)$/gm, "")
        .replace(/[,，  　]+/gm, " ")
        .split(/\r?\n/);

const parseMerge = (lyric, translate) =>
    !translate?.length ? lyric : lyric.flatMap((lyricLine, i) =>
        lyricLine ? (translate[i] ? [lyricLine, `${lyricLine.slice(0, 10)}${translate[i]}`] : [lyricLine]) : []
    );

import * as decoder from "parser_ext.so"

const decrypt = content => {
    if (!content) return "";
    const zipData = decoder.decodeQrc(restore(content));
    content = zipData && arrayBufferToString(zlib.uncompress(zipData));
    return (content?.match(/LyricContent="([\s\S]*?)"\//)?.[1] ?? content) || '';
};

const restore = hexText => {
    if (hexText.length % 2 !== 0) return null;

    const sig = "[offset:0]\n";
    return Uint8Array.from({ length: (hexText.length / 2) + sig.length }, (_, idx) =>
        idx < sig.length ? sig.charCodeAt(idx) : parseInt(hexText.substr((idx - sig.length) * 2, 2), 16)
    ).buffer;
};

const metaInfo = meta => `[ti:${meta.title}]\n[ar:${meta.artist}]\n[al:${meta.album}]\n`;

const formatTime = time => new Date(time).toISOString().slice(14, -2);
