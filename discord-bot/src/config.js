require('dotenv').config();

const aiKeys = [];
for (let i = 1; i <= 10; i++) {
  const key = process.env[`GEMINI_API_KEY_${i}`];
  if (key && key.trim()) aiKeys.push(key.trim());
}
if (aiKeys.length === 0 && process.env.GEMINI_API_KEY) {
  aiKeys.push(process.env.GEMINI_API_KEY.trim());
}

let currentKeyIndex = 0;

function getCurrentKey() {
  return aiKeys[currentKeyIndex];
}

function rotateKey() {
  currentKeyIndex = (currentKeyIndex + 1) % aiKeys.length;
  return currentKeyIndex;
}

function setKeyIndex(index) {
  if (index < 0 || index >= aiKeys.length) return false;
  currentKeyIndex = index;
  return true;
}

function getKeyIndex() {
  return currentKeyIndex;
}

function getKeysCount() {
  return aiKeys.length;
}

const rawToken = (process.env.DISCORD_TOKEN_2 || process.env.DISCORD_TOKEN || '').trim();

const config = {
  token: rawToken,
  clientId: process.env.CLIENT_ID,
  botName: process.env.BOT_NAME || 'DevBot',
  adminId: process.env.ADMIN_ID,
  aiKey: aiKeys[0],
  aiKeys,
  aiModel: 'gemini-2.5-flash',
  memoryTtlMs: 72 * 60 * 60 * 1000,
  memoryMaxItems: 12,
  askOnlyUserIds: ['1347216776475312241'],
  askOnlyDenyMessage: 'روح لعن طبون مك aw9 منسمعش الهدرة من زامل كما نتا',
};

function assertConfig() {
  if (!config.token) {
    throw new Error('DISCORD_TOKEN غير موجود في الإعدادات.');
  }
  if (aiKeys.length === 0) {
    throw new Error('GEMINI_API_KEY غير موجود في الإعدادات.');
  }
}

module.exports = {
  config,
  assertConfig,
  getCurrentKey,
  rotateKey,
  setKeyIndex,
  getKeyIndex,
  getKeysCount,
};
