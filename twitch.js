const axios = require('axios');
require('dotenv').config();

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_ACCESS_TOKEN = process.env.TWITCH_ACCESS_TOKEN;

async function isStreaming(username) {
    try {
        const response = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${TWITCH_ACCESS_TOKEN}`
            }
        });

        return response.data.data.length > 0;
    } catch (error) {
        console.error('Error fetching Twitch stream data:', error);
        return false;
    }
}

module.exports = { isStreaming };
