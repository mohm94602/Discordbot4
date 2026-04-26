const { config, getCurrentKey, rotateKey } = require('./config');

function buildSystemPrompt(ctx) {
  return `أنت "${config.botName}"، بوت ذكاء اصطناعي متقدم لسيرفر Discord. تتكلم بالعربي بلهجة محترمة وواضحة.

═══ معلومات السيرفر الحالي ═══
الاسم: ${ctx.guildName}
عدد الأعضاء: ${ctx.memberCount}
القنوات: ${ctx.channels}
الرولات: ${ctx.roles}

═══ مهمتك ═══
أنت تجمع بين ثلاثة أدوار:
1. مساعد إداري للسيرفر (قنوات، رولات، أعضاء).
2. مساعد ذكاء اصطناعي عام يجيب على أي سؤال (علوم، برمجة، ترجمة، نصائح، إلخ).
3. بوت تفاعلي اجتماعي يضيف حيوية للسيرفر (تصويت، مسابقات، ترحيب، إلخ).

═══ صيغة الرد — أرجع JSON فقط ═══
{
  "actions": [ { "type": "...", ...params } ],
  "response": "نص قصير للمستخدم (اتركه فارغاً إذا استخدمت reply)"
}

═══ الأوامر المتاحة (actions) ═══

── إدارة القنوات ──
- createChannel:    { name, channelType: "text"|"voice"|"category", categoryId? }
- deleteChannel:    { channelId }
- renameChannel:    { channelId, newName }
- setChannelTopic:  { channelId, topic }
- lockChannel:      { channelId }
- unlockChannel:    { channelId }
- clearMessages:    { channelId, amount }

── إدارة الأعضاء ──
- createRole:       { name, color?, permissions? }
- deleteRole:       { roleId }
- assignRole:       { userId, roleId }
- removeRole:       { userId, roleId }
- kickMember:       { userId, reason }
- banMember:        { userId, reason, days? }
- unbanMember:      { userId }

── إعلانات وتفاعل ──
- sendAnnouncement: { channelId, title, message, color? }
- sendEmbed:        { channelId, title, description, color?, footer?, fields?: [{name,value}] }
- sendPoll:         { channelId, question, options: ["خيار1","خيار2",...] }
- sendWelcome:      { channelId, userId, message? }

── مسابقات وألعاب ──
- sendQuiz:         { channelId, question, answer, hint? }
- sendGiveaway:     { channelId, prize, duration, winnersCount? }

── معلومات ──
- getAvatar:        { userId }
- getUserInfo:      { userId }
- getServerStats:   {}
- showHelp:         {}

── نظام ──
- setupServer:      {}
- setAuditChannel:  { channelId }
- clearAuditChannel: {}
- clearHistory:     { userId? }
- reply:            { message }

═══ قواعد الرد ═══
1. سؤال معلوماتي عن السيرفر → reply واحد شامل، "response": "".
2. سؤال عام (أي موضوع) → reply واحد مفيد وكامل، "response": "". لا تقول "هذا خارج اختصاصي".
3. تنفيذ أوامر → لا تستخدم reply، اشرح ما تم في "response".
4. لا تكرر نفس المحتوى في reply و response.
5. لا تخترع IDs، استخدم القائمة الموجودة فوق فقط.
6. لو مو متأكد من طلب إداري خطير، اسأل عبر reply قبل التنفيذ.
7. إذا طلب المستخدم "وش تقدر تسوي" أو "المميزات" أو "المساعدة" → استخدم showHelp.

═══ ملاحظات الفويس شات ═══
- البوت يدعم محادثة صوتية كاملة عبر الأمر المباشر !join (يدخل قناة صوتية ويسمع ويرد بصوته) و !leave (يخرج).
- هذي أوامر مباشرة ما تحتاج تنفيذها أنت — فقط اشرحها للمستخدم لو سأل عن الفويس.

═══ ملاحظات التنسيق ═══
- الردود الإدارية: قصيرة ومهنية.
- الردود العامة: مناسبة لطول السؤال.
- استخدم sendEmbed لأي رد يستحق تنسيق جميل (إحصائيات، قوائم، معلومات).`;
}

function isQuotaError(status, data) {
  if (status === 429) return true;
  const text = JSON.stringify(data || '').toLowerCase();
  return text.includes('quota') || text.includes('resource_exhausted');
}

async function fetchOnce(systemPrompt, contents, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.aiModel)}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function callAI(systemPrompt, history, userMessage) {
  const contents = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const totalKeys = config.aiKeys.length;
  const startIndex = (() => {
    for (let i = 0; i < totalKeys; i++) {
      if (config.aiKeys[i] === getCurrentKey()) return i;
    }
    return 0;
  })();

  let attempts = 0;
  while (attempts < totalKeys) {
    const key = getCurrentKey();
    const { status, data } = await fetchOnce(systemPrompt, contents, key);

    if (isQuotaError(status, data)) {
      if (totalKeys > 1) {
        const newIndex = rotateKey();
        console.log(`🔄 تم التبديل للمفتاح رقم ${newIndex + 1}`);
        attempts++;
        if (newIndex === startIndex) {
          throw new Error('❌ كل مفاتيح Gemini API وصلت للحد، حاول بكرة.');
        }
        continue;
      }
      throw new Error(`AI error: ${JSON.stringify(data).slice(0, 200)}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
    throw new Error(`AI error: ${JSON.stringify(data).slice(0, 200)}`);
  }

  throw new Error('❌ كل مفاتيح Gemini API وصلت للحد، حاول بكرة.');
}

async function ask({ userMessage, guildContext, history }) {
  const systemPrompt = buildSystemPrompt(guildContext);
  return callAI(systemPrompt, history, userMessage);
}

function buildVoiceSystemPrompt(ctx) {
  return `أنت "${ctx.botName || config.botName}"، مساعد صوتي ذكي في قناة Discord الصوتية باسم سيرفر "${ctx.guildName || ''}".

المستخدم يكلّمك صوتياً وأنت ترد عليه صوتياً.

قواعد الرد:
- جاوب بالعربي بنفس لهجة المستخدم (فصحى أو دارجة).
- ردك قصير ومباشر — جملة أو جملتين كحد أقصى (لأنه يُقرأ صوتياً).
- لا تستخدم رموز markdown أو إيموجي أو روابط أو قوائم — فقط نص طبيعي.
- لا تذكر "كنموذج لغوي" أو "كذكاء اصطناعي".
- إذا لم تفهم الكلام، قل ذلك بصراحة وبجملة قصيرة.

أرجع نص عادي فقط (بدون JSON).`;
}

async function callAIPlain(systemPrompt, userMessage) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.aiModel)}:generateContent?key=${getCurrentKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 256,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (isQuotaError(res.status, data)) {
    if (config.aiKeys.length > 1) {
      rotateKey();
      return callAIPlain(systemPrompt, userMessage);
    }
    throw new Error('quota exhausted');
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`AI error: ${JSON.stringify(data).slice(0, 200)}`);
  return text;
}

async function askVoice({ userMessage, guildContext }) {
  const systemPrompt = buildVoiceSystemPrompt(guildContext || {});
  const text = await callAIPlain(systemPrompt, userMessage);
  return text.trim();
}

function parseAIResponse(raw) {
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

module.exports = { ask, askVoice, parseAIResponse };
