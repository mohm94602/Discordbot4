const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { config, setKeyIndex, getKeyIndex, getKeysCount } = require('./config');
const { ask, parseAIResponse } = require('./ai');
const { executeActions } = require('./commands');
const { postAuditLog } = require('./audit');
const { getAuditChannel } = require('./auditStore');
const {
  rememberUserMessage,
  rememberAssistantReply,
  getHistory,
} = require('./memory');
const voice = require('./voice');

const activeReplies = new Set();
const userCooldowns = new Map();
const COOLDOWN_MS = 3000;

function buildGuildContext(guild) {
  return {
    guildName: guild.name,
    memberCount: guild.memberCount,
    channels: guild.channels.cache
      .map((c) => `${c.name}(${c.id})`)
      .join(', ')
      .slice(0, 800),
    roles: guild.roles.cache
      .filter((r) => r.name !== '@everyone')
      .map((r) => `${r.name}(${r.id})`)
      .join(', ')
      .slice(0, 500),
  };
}

function isAskOnly(userId) {
  return Array.isArray(config.askOnlyUserIds) && config.askOnlyUserIds.includes(userId);
}

function isAuthorized(message) {
  if (isAskOnly(message.author.id)) return true;
  if (config.adminId) return message.author.id === config.adminId;
  return message.member?.permissions.has(PermissionFlagsBits.Administrator);
}

function extractUserText(client, message) {
  return message.content
    .replace(`<@${client.user.id}>`, '')
    .replace(/^!/, '')
    .trim();
}

function buildResponseEmbed({ description, results, hasRealActions }) {
  const embed = new EmbedBuilder()
    .setTitle(`🤖 ${config.botName}`)
    .setDescription(description.slice(0, 4096))
    .setColor('#5865F2')
    .setTimestamp();

  if (hasRealActions && results.length > 0) {
    embed.addFields({
      name: '📋 النتائج',
      value: results.join('\n').slice(0, 1024),
    });
  }

  return embed;
}

async function handleMessage(client, message) {
  if (message.author.bot) return;
  if (message.channel.type === ChannelType.DM) return;
  if (message.interaction) return;

  const mentioned = message.mentions.has(client.user);
  const prefixed = message.content.startsWith('!');
  if (!mentioned && !prefixed) return;

  if (!isAuthorized(message)) {
    return message.reply('⛔ ما عندك صلاحية لهذا الأمر.');
  }

  const userText = extractUserText(client, message);
  if (!userText) return message.reply('مرحباً! قل لي وش تبي.');

  if (/^join$/i.test(userText)) {
    if (isAskOnly(message.author.id)) {
      return message.reply(config.askOnlyDenyMessage);
    }
    try {
      await voice.joinUserVoice(message);
      return message.reply('🎙️ دخلت الفويس! كلّمني وأنا أسمعك وأرد عليك. اكتب `!leave` للخروج.');
    } catch (err) {
      return message.reply(`❌ ${err.message}`);
    }
  }

  if (/^leave$/i.test(userText)) {
    if (isAskOnly(message.author.id)) {
      return message.reply(config.askOnlyDenyMessage);
    }
    try {
      voice.leaveVoice(message.guild.id);
      return message.reply('👋 خرجت من الفويس.');
    } catch (err) {
      return message.reply(`❌ ${err.message}`);
    }
  }

  const keyMatch = userText.match(/^\/?key([1-9]|10)$/i);
  if (keyMatch) {
    if (isAskOnly(message.author.id)) {
      return message.reply(config.askOnlyDenyMessage);
    }
    const requested = parseInt(keyMatch[1], 10);
    const total = getKeysCount();
    if (requested > total) {
      return message.reply(`⚠️ المفتاح رقم ${requested} غير موجود. عدد المفاتيح المضافة: ${total}.`);
    }
    setKeyIndex(requested - 1);
    return message.reply(`✅ تم التبديل يدوياً للمفتاح رقم ${requested} (من أصل ${total}).`);
  }

  if (/^\/?keys$/i.test(userText)) {
    if (isAskOnly(message.author.id)) {
      return message.reply(config.askOnlyDenyMessage);
    }
    return message.reply(`🔑 المفتاح النشط: رقم ${getKeyIndex() + 1} من أصل ${getKeysCount()}.`);
  }

  const userKey = `${message.guild.id}:${message.author.id}`;

  const lastReplyAt = userCooldowns.get(userKey);
  if (lastReplyAt && Date.now() - lastReplyAt < COOLDOWN_MS) {
    return message.reply('⏳ شوي شوي، بس خلصت من طلبك السابق.');
  }

  if (activeReplies.has(userKey)) {
    return message.reply('⏳ لحظة، لسه أرد على رسالتك السابقة...');
  }
  activeReplies.add(userKey);

  const thinking = await message.reply('⏳ أفكر...');

  try {
    const guildContext = buildGuildContext(message.guild);
    const history = getHistory(message.guild.id, message.author.id);

    const aiResponse = await ask({
      userMessage: userText,
      guildContext,
      history,
    });

    let parsed;
    try {
      parsed = parseAIResponse(aiResponse);
    } catch {
      const fallback = aiResponse.slice(0, 1900);
      await thinking.edit(`🤖 ${fallback}`);
      rememberUserMessage(message.guild.id, message.author.id, userText);
      rememberAssistantReply(message.guild.id, message.author.id, fallback);
      userCooldowns.set(userKey, Date.now());
      return;
    }

    const allActions = Array.isArray(parsed.actions) ? parsed.actions : [];
    const replyActions = allActions.filter((a) => a.type === 'reply');
    let realActions = allActions.filter((a) => a.type !== 'reply');

    if (isAskOnly(message.author.id) && realActions.length > 0) {
      await thinking.edit(config.askOnlyDenyMessage);
      rememberUserMessage(message.guild.id, message.author.id, userText);
      rememberAssistantReply(message.guild.id, message.author.id, config.askOnlyDenyMessage);
      userCooldowns.set(userKey, Date.now());
      return;
    }

    const results = await executeActions(realActions, {
      guild: message.guild,
      message,
    });

    const replyText = replyActions
      .map((a) => a.message)
      .filter(Boolean)
      .join('\n\n');

    const responseText = (parsed.response || '').trim();
    const description =
      replyText ||
      responseText ||
      (results.length > 0 ? results.join('\n') : 'تم');

    const embed = buildResponseEmbed({
      description,
      results,
      hasRealActions: realActions.length > 0,
    });

    await thinking.edit({ content: '', embeds: [embed] });

    rememberUserMessage(message.guild.id, message.author.id, userText);
    rememberAssistantReply(message.guild.id, message.author.id, description);

    const auditChannelId = getAuditChannel(message.guild.id);
    if (auditChannelId && auditChannelId !== message.channel.id) {
      await postAuditLog({
        guild: message.guild,
        message,
        userText,
        results,
        response: description,
      });
    }

    userCooldowns.set(userKey, Date.now());
  } catch (err) {
    console.error(err);
    await thinking.edit(`❌ حدث خطأ: ${err.message}`);
  } finally {
    activeReplies.delete(userKey);
  }
}

module.exports = { handleMessage };
