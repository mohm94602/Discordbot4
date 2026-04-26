const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { config } = require('./config');
const { handleMessage } = require('./handler');

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
    ],
  });

  client.once('clientReady', () => {
    console.log(`✅ ${client.user.tag} جاهز! [${config.aiModel}]`);
    client.user.setActivity('جاهز للأوامر 🚀', { type: ActivityType.Watching });
  });

  client.on('messageCreate', (message) => handleMessage(client, message));

  client.on('error', (err) => console.error('Discord client error:', err));

  return client;
}

async function startBot() {
  const client = createClient();
  await client.login(config.token);
  return client;
}

module.exports = { startBot };
