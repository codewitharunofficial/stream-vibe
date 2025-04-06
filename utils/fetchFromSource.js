// utils/fetchFromSource.js
import axios from 'axios';

export const getFromSource = async (id, retryCount = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            const response = await axios.get(process.env.RAPID_API_BASE_URL, {
                params: { id, cgeo: 'IN' },
                headers: {
                    'x-rapidapi-key': process.env.RAPID_API_KEY,
                    'x-rapidapi-host': process.env.RAPID_API_HOST,
                },
            });

            if (response.data.status === 'OK') return response.data;
            throw new Error('Invalid response from source');

        } catch (error) {
            console.warn(`Attempt ${attempt} failed:`, error.message);
            if (attempt === retryCount) throw error;
            await new Promise((res) => setTimeout(res, delay * attempt)); // Exponential backoff
        }
    }
};
