// stream.js
import { connectToDatabase } from './lib/mongodb.js';
import Song from './models/Song.js';
import { getFromSource } from './utils/fetchFromSource.js';
import { updateUserHistory } from './jobs/updateUserHistory.js';
import { isValidEmail } from './utils/validateEmail.js';
import songCache from './cache/songCache.js';

const streamSong = async (videoId, email, res) => {
    try {
        await connectToDatabase();

        if (!videoId) return res.status(400).json({ error: 'videoId is required' });

        const cacheKey = `song:${videoId}`;
        let songData = songCache.get(cacheKey);

        if (!songData) {
            let songDoc = await Song.findOne({ id: videoId });

            const isExpired = () => {
                try {
                    const linkArray = songDoc.song.adaptiveFormats;
                    const url = new URL(linkArray[linkArray.length - 1].url);
                    const expire = url.searchParams.get('expire');
                    return !expire || parseInt(expire) <= Math.floor(Date.now() / 1000);
                } catch {
                    return true;
                }
            };

            if (!songDoc || isExpired()) {
                const freshSong = await getFromSource(videoId);
                if (!freshSong) return res.status(404).json({ error: 'Could not fetch song' });

                songDoc = await Song.findOneAndUpdate(
                    { id: videoId },
                    { song: freshSong },
                    { upsert: true, new: true }
                );
                console.log('[Song] Fetched and saved fresh song data');
            }

            songData = songDoc.song;
            songCache.set(cacheKey, songData);
        } else {
            console.log('[Cache] Used cached song data');
        }

        // Send redirect immediately
        const streamUrl = songData.adaptiveFormats.at(-1).url;
        res.redirect(streamUrl);

        // Update user history async (fire-and-forget)
        if (email && isValidEmail(email)) {
            const historyData = {
                videoId,
                title: songData.title,
                author: songData.keywords?.at(-1) || 'Unknown',
                thumbnail: songData.thumbnail?.at(-1)?.url,
                duration: songData.duration,
                isExplicit: songData.isExplicit || false,
            };

            setImmediate(() => updateUserHistory(email, historyData));
        }

    } catch (err) {
        console.error('[StreamError]', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
};

export default streamSong;
