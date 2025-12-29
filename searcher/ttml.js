export function getConfig(cfg) {
    cfg.name = "TTML";
    cfg.version = "1.0";
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

    for (let song of songList) {
        request(`https://amlldb.bikonoo.com/raw-lyrics/${song.id}`, (err, res, body) => {
            if (err && res.statusCode !== 200) return;

            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.album = song.album;
            lyricMeta.lyricText = metaInfo(meta) + parse(body);
            man.addLyric(lyricMeta);
        });
    }
}

function parse(content) {
    const root = mxml.loadString(content, mxml.MXML_NO_CALLBACK);
    if (!root) return "";
    const pNodes = getPNodes(root);

    const lyric = parseLrc(pNodes);
    const translate = parseTranslate(pNodes);

    return parseMerge(lyric, translate).join('\n');
}

function parseLrc(pNodes) {
    const LINE_TIMESTAMP_REGEX = /(<\d{2}:\d{2}\.\d{3}>)(?=\1)|(?<=\d{2}:\d{2}\.\d{2})\d/g;
    const SPACE_REGEX = /(?<=(<\d{2}:\d{2}\.\d{3}>))(?=(?!\1)<\d{2}:\d{2}\.\d{3}>)/g;
    return pNodes.map(pNode => {
        let line = `[${pNode.getAttr("begin").replace(LINE_TIMESTAMP_REGEX, "")}]`;
        
        getSpanNodes(pNode).forEach(span => line += span == "mxml node" ? " " : `<${span.getAttr("begin")}>${span.getText() || ""}<${span.getAttr("end")}>`);

        return line
            .replace(LINE_TIMESTAMP_REGEX, "")
            .replace(SPACE_REGEX, " ");
    });
}

function parseTranslate(pNodes) {
    return pNodes.map(pNode => getSpanNodes(pNode, true)[0]?.toString().replace(/<.*?>|\n/g, ""));
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

function getPNodes(root) {
    let pNodes = [];

    // 1. 获取第一个body/div/p 节点
    let pNode = root?.findPath("body/div/p");
    // 2. 循环查找所有后续 p 节点
    while (pNode) {
        pNodes.push(pNode);
        // 3. 查找下一个 p 节点
        pNode = pNode.getNextSibling();
    }
    return pNodes;
}

function getSpanNodes(pNode, isTranslate = false) {
    if (!pNode) return [];
    const spans = [];

    // 1. 遍历所有 span 节点
    for (let spanNode = pNode.findElement("span"); spanNode; spanNode = spanNode.getNextSibling()) {
        const role = spanNode.getAttr("ttm:role");
        // 2. 筛选 span 节点的属性
        if (isTranslate ? role === "x-translation" : !role) {
            spans.push(spanNode);
        }
    }
    return spans;
}

function metaInfo(meta) {
    return `[ti:${meta.title}]\n[ar:${meta.artist}]\n[al:${meta.album}]\n`;
}
