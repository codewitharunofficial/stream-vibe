// src/stream.js
import axios from 'axios';
import { connectToDatabase } from './lib/mongodb.js';
import Song from './models/Song.js';
import User from './models/User.js';

const streamSong = async (videoId, email, res) => {
    try {
        // Connect to MongoDB
        await connectToDatabase();

        // Validate videoId
        if (!videoId) {
            res.status(400).json({ error: 'videoId is required' });
            return;
        }

        // Fetch song from DB or source
        let fetchedSong;
        let existingSong = await Song.findOne({ id: videoId });

        if (existingSong) {
            const linkArray = existingSong.song.adaptiveFormats;
            const url = new URL(linkArray[linkArray.length - 1].url);
            const expireTime = url.searchParams.get('expire');
            const currentTimeStamp = Math.floor(Date.now() / 1000);

            if (!expireTime || parseInt(expireTime) <= currentTimeStamp) {
                fetchedSong = await getFromSource(videoId);
                if (fetchedSong) {
                    existingSong = await Song.findOneAndUpdate(
                        { id: videoId },
                        { song: fetchedSong },
                        { upsert: true, new: true }
                    );
                }
            } else {
                fetchedSong = existingSong.song;
            }
        } else {
            fetchedSong = await getFromSource(videoId);
            if (fetchedSong) {
                existingSong = await Song.findOneAndUpdate(
                    { id: videoId },
                    { song: fetchedSong },
                    { upsert: true, new: true }
                );
            }
        }

        if (!fetchedSong) {
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
        }

        // Get the streaming URL
        const streamUrl = fetchedSong.adaptiveFormats[fetchedSong.adaptiveFormats.length - 1].url;

        // Stream the audio
        const response = await axios({
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
        });

        // Set headers for streaming
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Pipe the stream to the response
        response.data.pipe(res);

        response.data.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to stream audio' });
            }
        });

        res.on('close', () => {
            response.data.destroy();
        });
    } catch (error) {
        console.error('Error streaming song:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

// Fetch song from external source
const getFromSource = async (id) => {
    console.log('Fetching song from external source...');
    const options = {
        method: 'GET',
        url: 'https://yt-api.p.rapidapi.com/dl',
        params: { id: id, cgeo: 'IN' },
        headers: {
            'x-rapidapi-key': "b1c26628e0msh3fbbf13ea24b4abp184561jsna2ebae86e910",
            'x-rapidapi-host': 'yt-api.p.rapidapi.com',
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