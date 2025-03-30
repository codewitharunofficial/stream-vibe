// src/stream.js
import axios from 'axios';
import { connectToDatabase } from './lib/mongodb.js';
import Song from './models/Song.js';
import User from './models/User.js';

const streamSong = async (videoId, email, res) => {
    console.log(`Streaming song for videoId: ${videoId}, email: ${email}`);
    try {
        // Connect to MongoDB
        await connectToDatabase();
        console.log('Connected to MongoDB');

        // Validate videoId
        if (!videoId) {
            console.log('Missing videoId');
            res.status(400).json({ error: 'videoId is required' });
            return;
        }

        // Fetch song from DB or source
        let fetchedSong;
        let existingSong = await Song.findOne({ id: videoId });
        console.log('Song in DB:', !!existingSong);

        if (existingSong) {
            const linkArray = existingSong.song.adaptiveFormats;
            const url = new URL(linkArray[linkArray.length - 1].url);
            const expireTime = url.searchParams.get('expire');
            const currentTimeStamp = Math.floor(Date.now() / 1000);

            if (!expireTime || parseInt(expireTime) <= currentTimeStamp) {
                console.log('Song URL expired, fetching new URL');
                fetchedSong = await getFromSource(videoId);
                if (fetchedSong) {
                    existingSong = await Song.findOneAndUpdate(
                        { id: videoId },
                        { song: fetchedSong },
                        { upsert: true, new: true }
                    );
                    console.log('Updated song in DB');
                }
            } else {
                fetchedSong = existingSong.song;
                console.log('Using existing song URL');
            }
        } else {
            console.log('Song not in DB, fetching from source');
            fetchedSong = await getFromSource(videoId);
            if (fetchedSong) {
                existingSong = await Song.findOneAndUpdate(
                    { id: videoId },
                    { song: fetchedSong },
                    { upsert: true, new: true }
                );
                console.log('Saved new song to DB');
            }
        }

        if (!fetchedSong) {
            console.log('Song not found');
            res.status(404).json({ error: 'Song not found' });
            return;
        }

        // Update user history if email is provided
        if (email) {
            const songData = {
                videoId: videoId,
                title: fetchedSong.title,
                author: fetchedSong.author,
                thumbnail: fetchedSong.thumbnail[fetchedSong.thumbnail.length - 1].url,
                duration: fetchedSong.duration,
                isExplicit: fetchedSong.isExplicit || false,
            };
            await updateUserHistory(email, songData);
            console.log('Updated user history');
        }

        // Get the streaming URL
        const streamUrl = fetchedSong.adaptiveFormats[fetchedSong.adaptiveFormats.length - 1].url;
        console.log('Streaming URL:', streamUrl);

        // Stream the audio with retries
        let streamResponse;
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                streamResponse = await axios({
                    method: 'get',
                    url: streamUrl,
                    responseType: 'stream',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Referer': 'https://www.youtube.com/',
                        'Origin': 'https://www.youtube.com',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive'
                    },
                });
                console.log('Stream request successful');
                break; // Exit the retry loop on success
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error.response?.status, error.message);
                if (attempt === maxRetries) {
                    console.error('Max retries reached, failing...');
                    throw error;
                }
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }

        // Set headers for streaming
        res.setHeader('Content-Type', 'audio/webm');
        res.setHeader('Transfer-Encoding', 'chunked');
        console.log('Starting stream...');

        // Pipe the stream to the response
        streamResponse.data.pipe(res);

        streamResponse.data.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to stream audio' });
            }
        });

        res.on('close', () => {
            console.log('Stream closed by client');
            streamResponse.data.destroy();
        });
    } catch (error) {
        console.error('Error streaming song:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }
};

// Fetch song from external source
const getFromSource = async (id) => {
    console.log('Fetching song from external source...');
    const options = {
        method: 'GET',
        url: process.env.RAPID_API_BASE_URL,
        params: { id: id, cgeo: 'IN' },
        headers: {
            'x-rapidapi-key': process.env.RAPID_API_KEY,
            'x-rapidapi-host': process.env.RAPID_API_HOST,
        },
    };

    try {
        const { data } = await axios.request(options);
        if (data.status === 'OK') {
            return data;
        }
        throw new Error('Failed to fetch song from source');
    } catch (error) {
        console.error('Error fetching from source:', error);
        throw new Error(error.message);
    }
};

// Update Recently Played & Most Played
const updateUserHistory = async (email, songData) => {
    try {
        if (!songData) return;

        const user = await User.findOne({ email });

        if (!user) return;

        let recentlyPlayed = user.recently_played || [];
        let mostPlayed = user.most_played || [];

        // Remove song if it already exists in recently played, then add at index 0
        recentlyPlayed = recentlyPlayed.filter((item) => item.videoId !== songData.videoId);
        recentlyPlayed.unshift(songData);

        // Check if song is already in mostPlayed
        const songIndex = mostPlayed.findIndex((item) => item.videoId === songData.videoId);

        if (songIndex !== -1) {
            // If song exists, increase count
            mostPlayed[songIndex].count += 1;
        } else {
            // If song does not exist, add with count 1
            mostPlayed.push({ ...songData, count: 1 });
        }

        // Update user history
        await User.findOneAndUpdate(
            { email },
            {
                $set: { recently_played: recentlyPlayed, most_played: mostPlayed },
            },
            { upsert: true, new: true }
        );

        console.log('Updated user history for:', email);
    } catch (error) {
        console.error('Error updating user history:', error);
    }
};

export default streamSong;