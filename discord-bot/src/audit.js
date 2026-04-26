const { EmbedBuilder } = require('discord.js');
const { getAuditChannel } = require('./auditStore');

async function postAuditLog({ guild, message, userText, results, response }) {
  const channelId = getAuditChannel(guild.id);
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setTitle('📝 سجل أمر')
    .setColor('#2B2D31')
    .setTimestamp()
    .addFields(
      {
        name: '👤 المستخدم',
        value: `${message.author.tag} (<@${message.author.id}>)`,
        inline: true,
      },
      {
        name: '📍 القناة',
        value: `<#${message.channel.id}>`,
        inline: true,
      },
      {
        name: '💬 الطلب',
        value: userText.slice(0, 1024) || '—',
      },
    );

  if (response) {
    embed.addFields({ name: '🤖 الرد', value: response.slice(0, 1024) });
  }

  if (results && results.length > 0) {
    embed.addFields({
      name: '📋 النتائج',
      value: results.join('\n').slice(0, 1024),
    });
  }

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Failed to post audit log:', err.message);
  }
}

module.exports = { postAuditLog };
