require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Pool } = require('pg');
const { isStreaming } = require('./twitch');

// PostgreSQL connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false // Disable SSL explicitly
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const STREAMING_EMOJI = '🦄';

function getUTCTimestamp() {
    return new Date().toISOString();
}

async function getUserData(guildId, userId) {
    const res = await pool.query('SELECT * FROM user_mapping WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
    return res.rows[0];
}

async function setUserData(guildId, userId, twitchUsername, originalNickname) {
    await pool.query(
        'INSERT INTO user_mapping (guild_id, user_id, twitch_username, original_nickname) VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, user_id) DO UPDATE SET twitch_username = $3, original_nickname = $4',
        [guildId, userId, twitchUsername, originalNickname]
    );
}

async function updateOriginalNickname(guildId, userId, originalNickname) {
    await pool.query('UPDATE user_mapping SET original_nickname = $3 WHERE guild_id = $1 AND user_id = $2', [guildId, userId, originalNickname]);
}

async function deleteOriginalNickname(guildId, userId) {
    await pool.query('UPDATE user_mapping SET original_nickname = NULL WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
}

async function checkStreamingStatus(guildId, member) {
    const userData = await getUserData(guildId, member.id);
    const twitchUsername = userData ? userData.twitch_username : null;

    if (!twitchUsername) {
        return;
    }

    try {
        const streamingStatus = await isStreaming(twitchUsername);

        if (streamingStatus) {
            if (!member.nickname || !member.nickname.includes(STREAMING_EMOJI)) {
                await updateOriginalNickname(guildId, member.id, member.nickname || member.user.username);
                await member.setNickname(`${STREAMING_EMOJI} ${member.nickname || member.user.username}`);
                console.log(`[${getUTCTimestamp()}] ${member.user.tag} (${member.id}) started streaming in guild ${guildId}`);
            }
        } else {
            if (member.nickname && member.nickname.includes(STREAMING_EMOJI)) {
                const originalNickname = userData.original_nickname || member.nickname.replace(STREAMING_EMOJI, '').trim();
                await member.setNickname(originalNickname);
                await deleteOriginalNickname(guildId, member.id);
                console.log(`[${getUTCTimestamp()}] ${member.user.tag} (${member.id}) stopped streaming in guild ${guildId}`);
            }
        }
    } catch (error) {
        console.error(`Error checking streaming status for ${twitchUsername}:`, error);
    }
}

client.on('ready', async () => {
    console.log(`[${getUTCTimestamp()}] ...ONLINE...`);

    client.guilds.cache.forEach(async guild => {
        const members = await guild.members.fetch();

        members.forEach(member => {
            if (!member.user.bot) {
                checkStreamingStatus(guild.id, member);
            }
        });

        setInterval(() => {
            members.forEach(member => {
                if (!member.user.bot) {
                    checkStreamingStatus(guild.id, member);
                }
            });
        }, 30 * 1000); // checks every 30 seconds.
    });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const [command, ...args] = message.content.split(' ');

    if (command === '!setTwitch') {
        const twitchUsername = args[0];
        if (!twitchUsername) {
            return message.reply('Please provide your Twitch username, e.g., !setTwitch <username>');
        }

        const member = await message.guild.members.fetch(message.author.id);
        const originalNickname = member.nickname || member.user.username;

        const userData = await getUserData(message.guild.id, message.author.id);

        if (userData) {
            // Update Twitch username if user already exists
            await setUserData(message.guild.id, message.author.id, twitchUsername, originalNickname);
            message.reply(`Your Twitch username has been updated to ${twitchUsername}.`);

            // Check and update the streaming status immediately
            checkStreamingStatus(message.guild.id, member);
        } else {
            // Set Twitch username and store original nickname if user is new
            await setUserData(message.guild.id, message.author.id, twitchUsername, originalNickname);
            message.reply(`Your Twitch username has been set to ${twitchUsername} and your original nickname has been stored as ${originalNickname}.`);
            console.log(`[${getUTCTimestamp()}] Added ${message.author.tag} (${message.author.id}) to guild ${message.guild.id} with Twitch username ${twitchUsername}`);
        }
    }
});

client.login(DISCORD_TOKEN);
