const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'audit-channels.json');

let cache = null;

function ensureLoaded() {
  if (cache) return cache;
  try {
    if (fs.existsSync(STORE_FILE)) {
      cache = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    } else {
      cache = {};
    }
  } catch (err) {
    console.error('Failed to load audit store:', err.message);
    cache = {};
  }
  return cache;
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('Failed to persist audit store:', err.message);
  }
}

function getAuditChannel(guildId) {
  const store = ensureLoaded();
  return store[guildId] || null;
}

function setAuditChannel(guildId, channelId) {
  const store = ensureLoaded();
  store[guildId] = channelId;
  persist();
}

function clearAuditChannel(guildId) {
  const store = ensureLoaded();
  delete store[guildId];
  persist();
}

module.exports = { getAuditChannel, setAuditChannel, clearAuditChannel };
