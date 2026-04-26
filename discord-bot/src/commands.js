const { ChannelType, EmbedBuilder } = require('discord.js');
const { setupFullServer } = require('./setupServer');
const { setAuditChannel, clearAuditChannel } = require('./auditStore');
const { clearHistory } = require('./memory');

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function resolveChannelType(value) {
  if (value === 'voice') return ChannelType.GuildVoice;
  if (value === 'category') return ChannelType.GuildCategory;
  return ChannelType.GuildText;
}

const POLL_EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];

// ─────────────────────────────────────────
// Command handlers
// ─────────────────────────────────────────

const handlers = {

  // ── القنوات ──────────────────────────────

  async createChannel(action, { guild }) {
    const ch = await guild.channels.create({
      name: action.name,
      type: resolveChannelType(action.channelType),
      parent: action.categoryId || null,
    });
    return `تم إنشاء القناة **${ch.name}**`;
  },

  async deleteChannel(action, { guild }) {
    const ch = guild.channels.cache.get(action.channelId);
    if (!ch) throw new Error('القناة غير موجودة');
    const name = ch.name;
    await ch.delete();
    return `تم حذف القناة **${name}**`;
  },

  async renameChannel(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    await ch.setName(action.newName);
    return `تم تغيير اسم القناة إلى **${action.newName}**`;
  },

  async setChannelTopic(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    await ch.setTopic(action.topic);
    return `تم تعيين وصف القناة: *${action.topic}*`;
  },

  async lockChannel(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    return `تم قفل القناة **${ch.name}** 🔒`;
  },

  async unlockChannel(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    return `تم فتح القناة **${ch.name}** 🔓`;
  },

  async clearMessages(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    const amount = Math.min(action.amount || 10, 100);
    await ch.bulkDelete(amount, true);
    return `تم مسح **${amount}** رسالة من ${ch.name}`;
  },

  // ── الأعضاء ──────────────────────────────

  async createRole(action, { guild }) {
    try {
      const role = await guild.roles.create({ name: action.name, color: action.color || null });
      return `تم إنشاء الرول **${role.name}**`;
    } catch (err) {
      if (err.code === 50013 || /Missing Permissions/i.test(err.message)) {
        throw new Error('ما عندي صلاحية إنشاء رولات (Manage Roles ناقصة).');
      }
      throw new Error(`تعذر إنشاء الرول: ${err.message}`);
    }
  },

  async deleteRole(action, { guild }) {
    const role = guild.roles.cache.get(action.roleId);
    if (!role) throw new Error('الرول غير موجود');
    const name = role.name;
    await role.delete();
    return `تم حذف الرول **${name}**`;
  },

  async assignRole(action, { guild }) {
    const member = await guild.members.fetch(action.userId);
    const role = guild.roles.cache.get(action.roleId);
    if (!role) throw new Error('الرول غير موجود');
    await member.roles.add(role);
    return `تم إعطاء **${member.user.username}** الرول **${role.name}**`;
  },

  async removeRole(action, { guild }) {
    const member = await guild.members.fetch(action.userId);
    const role = guild.roles.cache.get(action.roleId);
    if (!role) throw new Error('الرول غير موجود');
    await member.roles.remove(role);
    return `تم إزالة رول **${role.name}** من **${member.user.username}**`;
  },

  async kickMember(action, { guild }) {
    const member = await guild.members.fetch(action.userId);
    const name = member.user.username;
    await member.kick(action.reason || 'بدون سبب');
    return `تم طرد **${name}** 👢`;
  },

  async banMember(action, { guild }) {
    await guild.members.ban(action.userId, {
      reason: action.reason || 'بدون سبب',
      deleteMessageDays: action.days || 0,
    });
    return `تم حظر **${action.userId}** 🔨`;
  },

  async unbanMember(action, { guild }) {
    await guild.members.unban(action.userId);
    return `تم رفع الحظر عن **${action.userId}**`;
  },

  // ── الإعلانات والتفاعل ───────────────────

  async sendAnnouncement(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    if (!ch.isTextBased?.()) throw new Error(`${ch?.name} ليست قناة نصية`);
    const embed = new EmbedBuilder()
      .setTitle(action.title || '📢 إعلان')
      .setDescription(action.message)
      .setColor(action.color || '#5865F2')
      .setTimestamp();
    await ch.send({ embeds: [embed] });
    return `تم إرسال الإعلان في **${ch.name}**`;
  },

  async sendEmbed(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    if (!ch.isTextBased?.()) throw new Error(`${ch?.name} ليست قناة نصية`);
    const embed = new EmbedBuilder()
      .setTitle(action.title || '')
      .setDescription(action.description || '')
      .setColor(action.color || '#5865F2')
      .setTimestamp();
    if (action.footer) embed.setFooter({ text: action.footer });
    if (Array.isArray(action.fields)) {
      for (const f of action.fields) {
        embed.addFields({ name: f.name || '\u200b', value: f.value || '\u200b', inline: f.inline || false });
      }
    }
    await ch.send({ embeds: [embed] });
    return `تم إرسال الـ embed في **${ch.name}**`;
  },

  async sendPoll(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    if (!ch.isTextBased?.()) throw new Error(`${ch?.name} ليست قناة نصية`);
    const options = (action.options || []).slice(0, 9);
    if (options.length < 2) throw new Error('التصويت يحتاج خيارين على الأقل');
    const lines = options.map((opt, i) => `${POLL_EMOJIS[i]} ${opt}`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${action.question}`)
      .setDescription(lines)
      .setColor('#FEE75C')
      .setFooter({ text: 'صوّت باستخدام الإيموجي أدناه' })
      .setTimestamp();
    const msg = await ch.send({ embeds: [embed] });
    for (let i = 0; i < options.length; i++) {
      await msg.react(POLL_EMOJIS[i]);
    }
    return `تم إنشاء التصويت في **${ch.name}**`;
  },

  async sendWelcome(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    if (!ch.isTextBased?.()) throw new Error(`${ch?.name} ليست قناة نصية`);
    let member;
    try {
      member = await guild.members.fetch(action.userId);
    } catch {
      throw new Error('العضو غير موجود');
    }
    const embed = new EmbedBuilder()
      .setTitle('👋 أهلاً وسهلاً!')
      .setDescription(
        action.message ||
        `مرحباً بك **${member.displayName}** في سيرفر **${guild.name}**! 🎉\nنتمنى لك وقتاً ممتعاً معنا.`
      )
      .setThumbnail(member.displayAvatarURL({ size: 256 }))
      .setColor('#57F287')
      .setTimestamp()
      .setFooter({ text: `عدد الأعضاء: ${guild.memberCount}` });
    await ch.send({ embeds: [embed] });
    return `تم إرسال رسالة الترحيب بـ **${member.displayName}**`;
  },

  // ── مسابقات وألعاب ───────────────────────

  async sendQuiz(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    if (!ch.isTextBased?.()) throw new Error(`${ch?.name} ليست قناة نصية`);
    const embed = new EmbedBuilder()
      .setTitle('🧠 مسابقة!')
      .setDescription(`**${action.question}**${action.hint ? `\n\n💡 تلميح: *${action.hint}*` : ''}`)
      .setColor('#EB459E')
      .setFooter({ text: 'أول واحد يجاوب صح يكسب! اكتب جوابك في الشات' })
      .setTimestamp();
    await ch.send({ embeds: [embed] });

    // ننتظر الجواب الصحيح 60 ثانية
    const filter = (m) => m.content.toLowerCase().trim() === String(action.answer).toLowerCase().trim();
    try {
      const collected = await ch.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
      const winner = collected.first()?.author;
      const winEmbed = new EmbedBuilder()
        .setTitle('🎉 إجابة صحيحة!')
        .setDescription(`**${winner?.username}** أجاب صح! الجواب كان: **${action.answer}**`)
        .setColor('#57F287')
        .setTimestamp();
      await ch.send({ embeds: [winEmbed] });
    } catch {
      await ch.send(`⏰ انتهى الوقت! الجواب كان: **${action.answer}**`);
    }

    return `تم إطلاق مسابقة في **${ch.name}**`;
  },

  async sendGiveaway(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    if (!ch.isTextBased?.()) throw new Error(`${ch?.name} ليست قناة نصية`);
    const duration = action.duration || 60; // بالثواني
    const winners = action.winnersCount || 1;

    const embed = new EmbedBuilder()
      .setTitle('🎁 سحب على جوائز!')
      .setDescription(
        `**الجائزة:** ${action.prize}\n` +
        `**عدد الفائزين:** ${winners}\n` +
        `**المدة:** ${duration} ثانية\n\n` +
        `تفاعل بـ 🎉 للمشاركة!`
      )
      .setColor('#FF73FA')
      .setTimestamp(new Date(Date.now() + duration * 1000))
      .setFooter({ text: `ينتهي السحب بعد ${duration} ثانية` });

    const giveawayMsg = await ch.send({ embeds: [embed] });
    await giveawayMsg.react('🎉');

    setTimeout(async () => {
      try {
        const reaction = giveawayMsg.reactions.cache.get('🎉');
        if (!reaction) return;
        const users = await reaction.users.fetch();
        const participants = users.filter((u) => !u.bot);
        if (participants.size === 0) {
          await ch.send('❌ ما أحد شارك في السحب!');
          return;
        }
        const shuffled = [...participants.values()].sort(() => Math.random() - 0.5);
        const selectedWinners = shuffled.slice(0, Math.min(winners, shuffled.length));
        const winnerMentions = selectedWinners.map((u) => `<@${u.id}>`).join(', ');
        const resultEmbed = new EmbedBuilder()
          .setTitle('🎉 انتهى السحب!')
          .setDescription(`**الجائزة:** ${action.prize}\n**الفائز/ون:** ${winnerMentions}`)
          .setColor('#57F287')
          .setTimestamp();
        await ch.send({ embeds: [resultEmbed] });
      } catch (e) {
        console.error('Giveaway error:', e);
      }
    }, duration * 1000);

    return `تم إطلاق السحب في **${ch.name}** — ينتهي بعد ${duration} ثانية`;
  },

  // ── معلومات ──────────────────────────────

  async getAvatar(action, { guild, message }) {
    const targetId = action.userId || message.author.id;
    let user, displayName, displayAvatar;
    try {
      const member = await guild.members.fetch(targetId);
      user = member.user;
      displayName = member.displayName || user.username;
      displayAvatar = member.displayAvatarURL({ size: 1024, extension: 'png', forceStatic: false });
    } catch {
      user = await message.client.users.fetch(targetId);
      displayName = user.username;
      displayAvatar = user.displayAvatarURL({ size: 1024, extension: 'png', forceStatic: false });
    }
    const embed = new EmbedBuilder()
      .setTitle(`🖼️ افتار ${displayName}`)
      .setColor('#5865F2')
      .setImage(displayAvatar)
      .setURL(displayAvatar)
      .setFooter({ text: `ID: ${user.id}` });
    await message.channel.send({ embeds: [embed] });
    return `تم إرسال افتار **${displayName}**`;
  },

  async getUserInfo(action, { guild, message }) {
    const targetId = action.userId || message.author.id;
    const member = await guild.members.fetch(targetId);
    const user = member.user;
    const roles = member.roles.cache
      .filter((r) => r.name !== '@everyone')
      .map((r) => r.name)
      .join(', ') || 'لا يوجد';
    const joinedAt = member.joinedAt?.toLocaleDateString('ar-SA') || 'غير معروف';
    const createdAt = user.createdAt?.toLocaleDateString('ar-SA') || 'غير معروف';
    const embed = new EmbedBuilder()
      .setTitle(`👤 معلومات ${member.displayName}`)
      .setThumbnail(member.displayAvatarURL({ size: 256 }))
      .setColor('#5865F2')
      .addFields(
        { name: '🆔 المعرّف', value: user.id, inline: true },
        { name: '📛 الاسم', value: user.username, inline: true },
        { name: '📅 انضم للسيرفر', value: joinedAt, inline: true },
        { name: '🗓️ إنشاء الحساب', value: createdAt, inline: true },
        { name: '🎭 الرولات', value: roles, inline: false },
      )
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return `تم عرض معلومات **${member.displayName}**`;
  },

  async getServerStats(_action, { guild, message }) {
    const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const roles = guild.roles.cache.size - 1;
    const bots = guild.members.cache.filter((m) => m.user.bot).size;
    const humans = guild.memberCount - bots;
    const embed = new EmbedBuilder()
      .setTitle(`📊 إحصائيات ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }) || null)
      .setColor('#5865F2')
      .addFields(
        { name: '👥 الأعضاء', value: `${guild.memberCount}`, inline: true },
        { name: '🧑 البشر', value: `${humans}`, inline: true },
        { name: '🤖 البوتات', value: `${bots}`, inline: true },
        { name: '💬 قنوات نصية', value: `${textChannels}`, inline: true },
        { name: '🔊 قنوات صوتية', value: `${voiceChannels}`, inline: true },
        { name: '🎭 الرولات', value: `${roles}`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `ID: ${guild.id}` });
    await message.channel.send({ embeds: [embed] });
    return 'تم عرض إحصائيات السيرفر';
  },

  async showHelp(_action, { message }) {
    const embed = new EmbedBuilder()
      .setTitle('🤖 مميزات البوت — دليل الاستخدام')
      .setColor('#5865F2')
      .setDescription('كلّمني بالعربي بشكل طبيعي وأنا أفهم وأنفذ. هذه أمثلة لما أقدر أسويه:')
      .addFields(
        {
          name: '🔧 إدارة القنوات',
          value:
            '`إنشاء قناة نصية اسمها عام` `احذف قناة الاختبار` `اقفل هذي القناة`\n' +
            '`امسح 20 رسالة` `غيّر اسم القناة` `حدد وصف للقناة`',
        },
        {
          name: '👥 إدارة الأعضاء',
          value:
            '`إنشاء رول VIP لونه ذهبي` `أعطِ فلان رول Member`\n' +
            '`اطرد فلان` `احظر فلان` `ارفع الحظر عن فلان`',
        },
        {
          name: '📢 إعلانات وتفاعل',
          value:
            '`أرسل إعلان في قناة الإعلانات عن الأبديت الجديد`\n' +
            '`أرسل embed جميل بعنوان "قواعد السيرفر"`\n' +
            '`رحّب بـ @فلان في قناة الترحيب`',
        },
        {
          name: '📊 تصويت',
          value:
            '`إنشاء تصويت: وش لعبتكم المفضلة؟ الخيارات: فورتنايت، ماينكرافت، GTA`',
        },
        {
          name: '🎙️ فويس شات',
          value:
            '`!join` لدخول البوت قناتك الصوتية والاستماع لكلامك\n' +
            'يحوّل صوتك لنص، يرد عليك، ويتكلم بصوته.\n' +
            '`!leave` لخروج البوت من القناة الصوتية.',
        },
        {
          name: '🎮 مسابقات وسحوبات',
          value:
            '`إطلق مسابقة سؤال: ما عاصمة اليابان؟`\n' +
            '`سحب على جائزة نيتفليكس شهر كامل لمدة 5 دقائق`',
        },
        {
          name: '📊 معلومات',
          value:
            '`وش إحصائيات السيرفر؟` `معلومات عن @فلان`\n' +
            '`اجيبلي افتار @فلان` `كم عضو عندنا؟`',
        },
        {
          name: '🧠 ذكاء اصطناعي',
          value: 'اسألني أي سؤال عام: برمجة، علوم، ترجمة، رياضيات، نصائح، وأي شيء ثاني!',
        },
        {
          name: '⚙️ نظام',
          value:
            '`إعداد السيرفر` `عيّن قناة السجل` `امسح سياق محادثتي`',
        },
      )
      .setFooter({ text: 'كلّمني بشكل طبيعي — ما تحتاج تحفظ أوامر!' })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return 'تم عرض قائمة المميزات';
  },

  // ── نظام ─────────────────────────────────

  async reply(action) {
    return action.message;
  },

  async setupServer(_action, { guild }) {
    await setupFullServer(guild);
    return 'تم إعداد السيرفر بالكامل! ✅';
  },

  async setAuditChannel(action, { guild, message }) {
    const ch = guild.channels.cache.get(action.channelId) || message.channel;
    if (!ch.isTextBased?.()) throw new Error('قناة السجل لازم تكون نصية');
    setAuditChannel(guild.id, ch.id);
    return `تم تعيين قناة السجل: **${ch.name}**`;
  },

  async clearAuditChannel(_action, { guild }) {
    clearAuditChannel(guild.id);
    return 'تم إلغاء قناة السجل';
  },

  async clearHistory(action, { guild, message }) {
    const targetId = action.userId || message.author.id;
    clearHistory(guild.id, targetId);
    return `تم مسح سياق المحادثة`;
  },
};

// ─────────────────────────────────────────
// منفّذ الأوامر الرئيسي
// ─────────────────────────────────────────

async function executeActions(actions, ctx) {
  const results = [];
  for (const action of actions) {
    const handler = handlers[action.type];
    if (!handler) {
      results.push(`❌ أمر غير معروف: ${action.type}`);
      continue;
    }
    try {
      const result = await handler(action, ctx);
      results.push(`✅ ${result}`);
    } catch (err) {
      results.push(`❌ خطأ في ${action.type}: ${err.message}`);
    }
  }
  return results;
}

module.exports = { executeActions };
