export function getConfig(cfg) {
    cfg.name = "TTML";
    cfg.version = "1.2.1";
    cfg.author = "ameyuri";
}

export function getLyrics(meta, man, songList = []) {
    let settings = {
        method: 'post',
        url: 'https://amlldb.bikonoo.com/api/search-lyrics',
        body: JSON.stringify({ "query": meta.title, "type": "title" }),
        headers: { "Content-Type": "application/json; charset=utf-8" }
    }

    request(settings, (err, res, body) => {
        if (err || res.statusCode !== 200) return;

        songList = (JSON.parse(body) || []).map(song => ({
            id: song.id, title: song.title, artist: song.artists, album: song.album.join(" / ")
        }));
    });

    let lyricMeta = man.createLyric();

    songList.forEach(song => {
        request(`https://amlldb.bikonoo.com/raw-lyrics/${song.id}`, (err, res, body) => {
            if (err || res.statusCode !== 200) return;

            lyricMeta.title = song.title;
            lyricMeta.artist = song.artist;
            lyricMeta.album = song.album;
            lyricMeta.lyricText = metaInfo(meta) + parse(body);
            man.addLyric(lyricMeta);
        })
    })
}

import { metaInfo, parseMerge } from "utils.js";

const parse = content => {
    const root = mxml.loadString(content);
    const pNodes = getPNodes(root);

    // 链式调用会导致空指针崩溃
    // const pNodes = getPNodes(mxml.loadString(content));

    const lyric = parseLrc(pNodes);
    const translate = parseTranslate(pNodes);
    return parseMerge(lyric, translate).join('\n');
};

const parseLrc = pNodes => pNodes.map(pNode =>
    getSpanNodes(pNode)
        .reduce((acc, span) => acc + (span == "mxml node" ? " " : `<${span.getAttr("begin")}>${span.getText() || ""}<${span.getAttr("end")}>`), `[${pNode.getAttr("begin")}]`)
        .replace(/(<\d{2}:\d{2}\.\d{3}>)(?=\1)|(?<=\d{2}:\d{2}\.\d{2})\d/g, "")
        .replace(/(?<=(<\d{2}:\d{2}\.\d{2}>))(?=(?!\1)<\d{2}:\d{2}\.\d{2}>)/g, " ")
);

const parseTranslate = pNodes => pNodes.map(pNode => getSpanNodes(pNode, true)[0]?.toString().replace(/<\/?span\b[^>]*>/g, "").replace(/\n/g, " "));

const getPNodes = root => Array.from(function* () {
    for (let pNode = root?.findElement("p"); pNode; pNode = pNode.getNextSibling()) yield pNode
}());

const getSpanNodes = (pNode, isTranslate = false) => Array.from(function* () {
    for (let spanNode = pNode?.findElement("span"); spanNode; spanNode = spanNode.getNextSibling()) {
        if (isTranslate ? spanNode.getAttr("ttm:role") === "x-translation" : !spanNode.getAttr("ttm:role")) yield spanNode;
    }
}());
