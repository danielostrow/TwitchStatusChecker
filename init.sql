CREATE TABLE IF NOT EXISTS user_mapping (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    twitch_username VARCHAR(255) NOT NULL,
    original_nickname VARCHAR(255) NOT NULL,
    UNIQUE(guild_id, user_id)
);
