const { ChannelType } = require('discord.js');

const STRUCTURE = [
  {
    name: '📋 INFORMATION',
    type: ChannelType.GuildCategory,
    children: [
      { name: '📢-announcements', type: ChannelType.GuildText },
      { name: '📋-rules', type: ChannelType.GuildText },
      { name: '👋-welcome', type: ChannelType.GuildText },
    ],
  },
  {
    name: '💻 DEVELOPMENT',
    type: ChannelType.GuildCategory,
    children: [
      { name: '💬-general-dev', type: ChannelType.GuildText },
      { name: '🐛-bug-reports', type: ChannelType.GuildText },
      { name: '💡-ideas', type: ChannelType.GuildText },
      { name: '📦-releases', type: ChannelType.GuildText },
    ],
  },
  {
    name: '🌐 COMMUNITY',
    type: ChannelType.GuildCategory,
    children: [
      { name: '💬-general', type: ChannelType.GuildText },
      { name: '🎮-off-topic', type: ChannelType.GuildText },
    ],
  },
  {
    name: '🔊 VOICE',
    type: ChannelType.GuildCategory,
    children: [
      { name: '🔊 General', type: ChannelType.GuildVoice },
      { name: '🔊 Dev Meeting', type: ChannelType.GuildVoice },
    ],
  },
];

const DEFAULT_ROLES = [
  { name: '👑 Admin', color: '#FF0000' },
  { name: '🛠️ Developer', color: '#00FF00' },
  { name: '👥 Member', color: '#5865F2' },
];

function findChannelByName(guild, name, type, parentId) {
  return guild.channels.cache.find(
    (c) => c.name === name && c.type === type && (parentId ? c.parentId === parentId : true),
  );
}

function findRoleByName(guild, name) {
  return guild.roles.cache.find((r) => r.name === name);
}

async function setupFullServer(guild) {
  for (const cat of STRUCTURE) {
    let category = findChannelByName(guild, cat.name, cat.type);
    if (!category) {
      category = await guild.channels.create({ name: cat.name, type: cat.type });
    }
    for (const child of cat.children || []) {
      const existing = findChannelByName(guild, child.name, child.type, category.id);
      if (existing) continue;
      await guild.channels.create({
        name: child.name,
        type: child.type,
        parent: category.id,
      });
    }
  }
  for (const role of DEFAULT_ROLES) {
    if (findRoleByName(guild, role.name)) continue;
    await guild.roles.create(role);
  }
}

module.exports = { setupFullServer };
