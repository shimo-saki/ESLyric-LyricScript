export function getConfig(cfg) {
    cfg.name = "酷狗音乐";
    cfg.version = "1.1.1";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man) {
    let songList = [];
    
    request(`http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(`${meta.artist}-${meta.title}`)}&duration=${Math.round(meta.duration) * 1000}&hash=`, (err, res, body) => {
        if (err || res?.statusCode !== 200) return;

        songList = (JSON.parse(body)["candidates"] || [])
            .filter(item => item.id !== null && item.accesskey !== null && item.language !== "伴奏")
            .map(item => ({
                id: item.id, key: item.accesskey, title: item.song || "", artist: item.singer || ""
            }));
    });

    let lyric_meta = man.createLyric();
    for (const song of songList) {
        request(`http://lyrics.kugou.com/download?ver=1&client=pc&id=${song.id}&accesskey=${song.key}&fmt=krc&charset=utf8`, (err, res, body) => {
            if (err && res.statusCode !== 200) return;

            lyric_meta.title = song.title;
            lyric_meta.artist = song.artist;
            lyric_meta.lyricText = metaInfo(meta) + parse(JSON.parse(body)?.content);
            man.addLyric(lyric_meta);
        });
    }
}

// 解析歌词和翻译，并合并
function parse(content) {
    let zipData = xorKRC(base64Decode(content));
    let unzipData = zipData?.buffer && zlib.uncompress(zipData.buffer);
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
function parse_lrc(content) {
    const LINE_TIMESTAMP_REGEX = /^\[(?<start_time>\d+),\d+\]/;
    const WORD_TIMESTAMP_REGEX = /[<\(](?<start_time>\d+),(?<duration>\d+),\d+[>\)](?<word>[^<\(\n]*)/g;

    return content.replace(/\[(ti|ar|al|by|offset|kana|language|ch):[^\]]*\]\n|\r/g, '')
        .split('\n')
        .filter(line => LINE_TIMESTAMP_REGEX.test(line))
        .map(line => {
            const lineStartTime = parseInt(LINE_TIMESTAMP_REGEX.exec(line).groups.start_time);
            return line.replace(LINE_TIMESTAMP_REGEX, _ => `[${formatTime(lineStartTime)}]<${formatTime(lineStartTime)}>`)
                .replace(WORD_TIMESTAMP_REGEX, (_, start, duration, word) => `${word}<${formatTime(lineStartTime + parseInt(start) + parseInt(duration))}>`);
        });
}

// 解析翻译
function parse_translate(content) {
    if (!content.includes("language") || content.includes("eyJjb250ZW50IjpbXSwidmVyc2lvbiI6MX0=")) return [];

    const languageData = JSON.parse(atob(content.match(/\[language:(?<language>.*?)\]/).groups.language.trim()));
    return languageData.content
        .filter(item => item.type === 1)
        .flatMap(item => item.lyricContent.map(([line]) =>
            line.startsWith("TME") || line.startsWith("//") ? "" : line.replace(/[,， 　]+/g, " ")
        ));
}

// 合并Lrc和翻译
function parseMerge(lyric, translate) {
    if (!translate?.length) return lyric;

    return lyric.flatMap((lyricLine, index) => {
        if (!lyricLine) return [];

        const result = [lyricLine];
        if (translate[index]) result.push(`${lyricLine.slice(0, 10)}${translate[index]}`);
        return result;
    });
}

// base64 decode
function base64Decode(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const table = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;

    const bytes = new Uint8Array(str.length * 0.75);
    let cursor = 0;

    for (let i = 0; i < str.length; i += 4) {
        let c1 = table[str.charCodeAt(i)];
        let c2 = table[str.charCodeAt(i + 1)];
        let c3 = table[str.charCodeAt(i + 2)];
        let c4 = table[str.charCodeAt(i + 3)];
        bytes[cursor++] = (c1 << 2) | (c2 >> 4);
        bytes[cursor++] = (c2 & 15) << 4 | (c3 >> 2);
        bytes[cursor++] = (c3 & 3) << 6 | (c4 & 63);
    }
    return bytes.buffer;
}

function xorKRC(rawData) {
    if (!rawData) return;

    const view = new Uint8Array(rawData);
    const magic = [0x6b, 0x72, 0x63, 0x31]; // 'k','r','c','1'

    if (view.length < magic.length) return;
    for (let i = 0; i < magic.length; i++) {
        if (view[i] !== magic[i]) return;
    }

    const key = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69];
    const offset = magic.length;
    const decrypted = new Uint8Array(view.length - offset);

    // 异或解密
    for (let i = offset; i < view.length; i++) {
        decrypted[i - offset] = view[i] ^ key[(i - offset) % key.length];
    }
    return decrypted;
}

function decrypt(content) {
    if (!content) return "";
    const zipData = decoder.decodeQrc(restore(content));
    const unzipData = zipData && zlib.uncompress(zipData);
    content = unzipData && arrayBufferToString(unzipData)
    return (content?.match(/LyricContent="([\s\S]*?)"\//)?.[1] ?? content) || '';
}

function metaInfo(meta) {
    return `[ti:${meta.title}]\n[ar:${meta.artist}]\n[al:${meta.album}]\n`;
}

// 格式化时间
function formatTime(time) {
    const date = new Date(time);
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0').slice(0, 2);

    return `${minutes}:${seconds}.${milliseconds}`;
}
