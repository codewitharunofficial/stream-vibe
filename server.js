import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import streamSong from './stream.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.json());
app.use(cors());

// Streaming endpoint
app.get('/play', async (req, res) => {
    const { videoId, email } = req.query;

    if (!videoId) {
        return res.status(400).json({ error: 'videoId is required' });
    }

    await streamSong(videoId, email, res);
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

app.listen(PORT, () => {
    console.log(`Streaming server running on port ${PORT}`);
});