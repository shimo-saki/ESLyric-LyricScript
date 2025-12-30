export function getConfig(cfg) {
    cfg.name = "TTML";
    cfg.version = "1.1";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man) {
    let songList = [];
    let settings = {
        method: 'post',
        url: 'https://amlldb.bikonoo.com/api/search-lyrics',
        body: JSON.stringify({ "query": meta.title, "type": "title" }),
        headers: { "Content-Type": "application/json; charset=utf-8" }
    }

    request(settings, (err, res, body) => {
        if (err || res?.statusCode !== 200) return;

        songList = (JSON.parse(body) || []).map(song => ({
            id: song.id, title: song.title, artist: song.artists, album: song.album.join(" / ")
        }));
    });

    let lyricMeta = man.createLyric();

    songList.forEach(song => {
        request(`https://amlldb.bikonoo.com/raw-lyrics/${song.id}`, (err, res, body) => {
            if (err && res.statusCode !== 200) return;

            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.album = song.album;
            lyricMeta.lyricText = metaInfo(meta) + parse(body);
            man.addLyric(lyricMeta);
        })
    })
}

const parse = content => {
    const root = mxml.loadString(content, mxml.MXML_NO_CALLBACK);
    if (!root) return "";
    const pNodes = getPNodes(root);

    const lyric = parseLrc(pNodes);
    const translate = parseTranslate(pNodes);
    return parseMerge(lyric, translate).join('\n');
};

const parseLrc = pNodes => {
    const LINE_TIMESTAMP_REGEX = /(<\d{2}:\d{2}\.\d{3}>)(?=\1)|(?<=\d{2}:\d{2}\.\d{2})\d/g;
    const SPACE_REGEX = /(?<=(<\d{2}:\d{2}\.\d{3}>))(?=(?!\1)<\d{2}:\d{2}\.\d{3}>)/g;
    return pNodes.map(pNode => {
        let line = `[${pNode.getAttr("begin").replace(LINE_TIMESTAMP_REGEX, "")}]`;
        getSpanNodes(pNode).forEach(span => line += span === "mxml node" ? " " : `<${span.getAttr("begin")}>${span.getText() || ""}<${span.getAttr("end")}>`);

        return line
            .replace(LINE_TIMESTAMP_REGEX, "")
            .replace(SPACE_REGEX, " ");
    });
};

const parseTranslate = pNodes => pNodes.map(pNode => getSpanNodes(pNode, true)[0]?.toString().replace(/<\/?span\b[^>]*>/g, "").replace(/\n/g, " "));

const parseMerge = (lyric, translate) =>
    !translate?.length ? lyric : lyric.flatMap((lyricLine, i) =>
        lyricLine ? (translate[i] ? [lyricLine, `${lyricLine.slice(0, 10)}${translate[i]}`] : [lyricLine]) : []
    );

const getPNodes = root => Array.from(function* () {
    for (let pNode = root?.findElement("p"); pNode; pNode = pNode.getNextSibling()) yield pNode;
}());

const getSpanNodes = (pNode, isTranslate = false) => Array.from(function* () {
    for (let spanNode = pNode?.findElement("span"); spanNode; spanNode = spanNode.getNextSibling()) {
        if (isTranslate ? spanNode.getAttr("ttm:role") === "x-translation" : !spanNode.getAttr("ttm:role")) yield spanNode;
    }
}());

const metaInfo = meta => `[ti:${meta.title}]\n[ar:${meta.artist}]\n[al:${meta.album}]\n`;
