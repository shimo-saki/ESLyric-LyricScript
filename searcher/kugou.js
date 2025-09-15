export function getConfig(cfg) {
    cfg.name = "酷狗音乐";
    cfg.version = "1.0.1";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man) {
    if (meta.duration == 0) return;

    let lyricCandidates = [];
    request(`http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(meta.artist + "-" + meta.title)}&duration=${Math.round(meta.duration) * 1000}&hash=`, (err, res, body) => {
        if (err && res.statusCode !== 200) return;
        let obj = JSON.parse(body);
        let candidates = obj["candidates"] || [];
        candidates.forEach(item => {
            if (item.id !== null && item.accesskey !== null) {
                lyricCandidates.push({
                    id: item.id,
                    key: item.accesskey,
                    title: item.song || "",
                    artist: item.singer || "",
                });
            }
        });
    });

    let lyric_meta = man.createLyric();
    // request lyrics
    for (const candidate of lyricCandidates) {
        request(`http://lyrics.kugou.com/download?ver=1&client=pc&id=${candidate.id}&accesskey=${candidate.key}&fmt=krc&charset=utf8`, (err, res, body) => {
            if (err && res.statusCode !== 200) return;
            let obj = JSON.parse(body);
            if (obj.content) {
                lyric_meta.title = candidate.title;
                lyric_meta.artist = candidate.artist;
                lyric_meta.lyricText = metaInfo(meta) + parse(obj.content);
                man.addLyric(lyric_meta);
            }
        });
    }
}

// 解析歌词和翻译，并合并
function parse(content) {
    let zipData = xorKRC(base64Decode(content))
    if (!zipData) return

    let unzipData = zlib.uncompress(zipData.buffer)
    if (unzipData == null) return

    content = arrayBufferToString(unzipData)
    // 解析增强LRC
    const lyric = parse_lrc(content);

    // 解析翻译
    const translate = parse_translate(content);

    // 合并Lrc和翻译
    return parseMerge(lyric, translate).join('\n');
}

// 解析为增强LRC
function parse_lrc(content) {
    const INFO_REPLACE_REGEX = /\[(ti|ar|al|by|offset|kana|language|ch):[^\]]*\]\n|\r/g;
    const LINE_TIMESTAMP_REGEX = /^\[(?<start_time>\d+),(?<duration>\d+)\]/;
    const WORD_TIMESTAMP_REGEX = /[<\(](?<start_time>\d+),(?<duration>\d+),\d+[>\)](?<word>[^<\(\n]*)/g;

    return content
        .replace(INFO_REPLACE_REGEX, '')
        .split('\n')
        .filter(line => LINE_TIMESTAMP_REGEX.test(line))
        .map(line => {
            const { groups } = line.match(LINE_TIMESTAMP_REGEX);
            const lineStart = parseInt(groups.start_time);
            return line
                .replace(LINE_TIMESTAMP_REGEX, `[${formatTime(lineStart)}]<${formatTime(lineStart)}>`)
                .replace(WORD_TIMESTAMP_REGEX, (_, ...args) => {
                    const g = args[args.length - 1];
                    const endTime = lineStart + parseInt(g.start_time) + parseInt(g.duration);
                    return `${g.word}<${formatTime(endTime)}>`;
                });
        });
}

// 解析翻译
function parse_translate(content) {
    if (content.includes("language") && !content.includes("eyJjb250ZW50IjpbXSwidmVyc2lvbiI6MX0=")) {
        let match = content.match(/language:(.*)/)

        const languageData = JSON.parse(atob(match[1].trim()));
        return languageData.content
            .filter(item => item.type === 1)
            .flatMap(item =>
                item.lyricContent.map(line =>
                    line[0].startsWith("TME") || line[0].startsWith("//") ? "" : line[0].replace(/[,，]+/g, " ")
                )
            );
    }
    return [];
}

// 合并Lrc和翻译
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

// base64 decode
function base64Decode(str) {
    let base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let base64Table = new Uint8Array(256);
    for (let i = 0; i < base64Chars.length; ++i) {
        base64Table[base64Chars.charCodeAt(i)] = i;
    }

    let bufLen = str.length * 0.75;
    let arrBuf = new ArrayBuffer(bufLen);
    let bytes = new Uint8Array(arrBuf);

    let cursor = 0;
    for (let i = 0; i < str.length; i += 4) {
        let c1 = base64Table[str.charCodeAt(i)];
        let c2 = base64Table[str.charCodeAt(i + 1)];
        let c3 = base64Table[str.charCodeAt(i + 2)];
        let c4 = base64Table[str.charCodeAt(i + 3)];
        bytes[cursor++] = (c1 << 2) | (c2 >> 4);
        bytes[cursor++] = ((c2 & 15) << 4) | (c3 >> 2);
        bytes[cursor++] = ((c3 & 3) << 6) | (c4 & 63);
    }
    return arrBuf;
}

function xorKRC(rawData) {
    if (null == rawData) return

    let dataView = new Uint8Array(rawData)
    let magicBytes = [0x6b, 0x72, 0x63, 0x31] // 'k' , 'r' , 'c' ,'1'
    if (dataView.length < magicBytes.length) return
    for (let i = 0; i < magicBytes.length; ++i) {
        if (dataView[i] != magicBytes[i]) return
    }

    let decryptedData = new Uint8Array(dataView.length - magicBytes.length)
    let encKey = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69]
    let hdrOffset = magicBytes.length
    for (let i = hdrOffset; i < dataView.length; ++i) {
        let x = dataView[i]
        let y = encKey[(i - hdrOffset) % encKey.length]
        decryptedData[i - hdrOffset] = x ^ y
    }

    return decryptedData
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
