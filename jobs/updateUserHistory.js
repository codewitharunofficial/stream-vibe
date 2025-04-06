// jobs/updateUserHistory.js
import User from '../models/User.js';

export const updateUserHistory = async (email, songData) => {
    try {
        const user = await User.findOne({ email });
        if (!user) return;

        let recentlyPlayed = user.recently_played || [];
        let mostPlayed = user.most_played || [];

        recentlyPlayed = recentlyPlayed.filter((item) => item.videoId !== songData.videoId);
        recentlyPlayed.unshift(songData);

        const existingIndex = mostPlayed.findIndex((item) => item.videoId === songData.videoId);
        if (existingIndex !== -1) {
            mostPlayed[existingIndex].count += 1;
        } else {
            mostPlayed.push({ ...songData, count: 1 });
        }

        await User.findOneAndUpdate(
            { email },
            { $set: { recently_played: recentlyPlayed, most_played: mostPlayed } },
            { new: true }
        );

        console.log(`[UserHistory] Updated for ${email}`);
    } catch (error) {
        console.error('[UserHistory] Update failed:', error.message);
    }
};
