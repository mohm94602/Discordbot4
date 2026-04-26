const fs = require('fs');
const path = require('path');
const { config } = require('./config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'memory.json');

const conversations = new Map();
const timers = new Map();

function loadFromDisk() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      for (const [key, list] of Object.entries(raw)) {
        if (Array.isArray(list)) conversations.set(key, list);
      }
    }
  } catch (err) {
    console.error('Failed to load memory store:', err.message);
  }
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {};
    for (const [key, list] of conversations.entries()) {
      obj[key] = list;
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('Failed to persist memory store:', err.message);
  }
}

loadFromDisk();

function keyOf(guildId, userId) {
  return `${guildId}:${userId}`;
}

function scheduleExpiry(key) {
  if (timers.has(key)) clearTimeout(timers.get(key));
  const t = setTimeout(() => {
    conversations.delete(key);
    timers.delete(key);
    persist();
  }, config.memoryTtlMs);
  timers.set(key, t);
}

function append(key, role, content) {
  const list = conversations.get(key) || [];
  list.push({ role, content, at: Date.now() });
  const trimmed = list.slice(-config.memoryMaxItems);
  conversations.set(key, trimmed);
  scheduleExpiry(key);
  persist();
}

function rememberUserMessage(guildId, userId, content) {
  append(keyOf(guildId, userId), 'user', content);
}

function rememberAssistantReply(guildId, userId, content) {
  append(keyOf(guildId, userId), 'assistant', content);
}

function getHistory(guildId, userId) {
  const key = keyOf(guildId, userId);
  const list = conversations.get(key) || [];
  const fresh = list.filter((item) => Date.now() - item.at < config.memoryTtlMs);
  if (fresh.length !== list.length) {
    conversations.set(key, fresh);
    persist();
  }
  return fresh.map(({ role, content }) => ({ role, content }));
}

function clearHistory(guildId, userId) {
  const key = keyOf(guildId, userId);
  conversations.delete(key);
  if (timers.has(key)) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }
  persist();
}

module.exports = {
  rememberUserMessage,
  rememberAssistantReply,
  getHistory,
  clearHistory,
};
