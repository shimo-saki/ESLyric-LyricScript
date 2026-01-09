export { formatTime, metaInfo, parseMerge };

const formatTime = time => new Date(+time || 0).toISOString().slice(14, -2);

const metaInfo = meta => `[ti:${meta.title}]\n[ar:${meta.artist}]\n[al:${meta.album}]\n`;

const parseMerge = (lyric, translate) =>
    !translate?.some(item => item?.trim()) ? lyric : lyric.flatMap((lyricLine, i) =>
        lyricLine ? (translate[i] ? [lyricLine, `${lyricLine.slice(0, 10)}${translate[i]}`] : [lyricLine]) : []
    );
