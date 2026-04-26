const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const prism = require('prism-media');
const {
  joinVoiceChannel,
  EndBehaviorType,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');

const { askVoice } = require('./ai');
const { config } = require('./config');

const sessions = new Map();

function getSession(guildId) {
  return sessions.get(guildId);
}

async function joinUserVoice(message) {
  const member = message.member;
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    throw new Error('لازم تكون في قناة صوتية أول.');
  }

  const guildId = message.guild.id;
  if (sessions.has(guildId)) {
    return sessions.get(guildId);
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: message.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (err) {
    connection.destroy();
    throw new Error('فشل الاتصال بالقناة الصوتية.');
  }

  const player = createAudioPlayer();
  connection.subscribe(player);

  const session = {
    connection,
    player,
    textChannel: message.channel,
    voiceChannel,
    guildId,
    speaking: new Set(),
    isSpeaking: false,
    pendingQueue: [],
  };
  sessions.set(guildId, session);

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    sessions.delete(guildId);
  });
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    sessions.delete(guildId);
  });

  setupSpeechListening(session);
  return session;
}

function setupSpeechListening(session) {
  const receiver = session.connection.receiver;
  receiver.speaking.on('start', (userId) => {
    if (session.speaking.has(userId)) return;
    if (session.isSpeaking) return;
    session.speaking.add(userId);
    captureAndProcess(session, userId)
      .catch((err) => {
        console.error('voice capture error:', err);
        try {
          session.textChannel.send(`⚠️ خطأ في معالجة الصوت: ${err.message}`).catch(() => {});
        } catch {}
      })
      .finally(() => {
        session.speaking.delete(userId);
      });
  });
}

async function captureAndProcess(session, userId) {
  const receiver = session.connection.receiver;
  const opusStream = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 },
  });

  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  const pcmStream = opusStream.pipe(decoder);

  const wavPath = path.join(os.tmpdir(), `discord-${session.guildId}-${userId}-${Date.now()}.wav`);

  await new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, [
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      '-i', 'pipe:0',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      wavPath,
    ], { stdio: ['pipe', 'ignore', 'ignore'] });

    pcmStream.pipe(ff.stdin);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    ff.on('error', reject);
  });

  const stats = fs.statSync(wavPath);
  if (stats.size < 32000) {
    fs.unlink(wavPath, () => {});
    return;
  }

  let userText;
  try {
    userText = await transcribe(wavPath);
  } finally {
    fs.unlink(wavPath, () => {});
  }

  if (!userText || userText.trim().length < 2) return;
  if (/^\(.+\)$/.test(userText.trim())) return;

  await session.textChannel.send(`🎙️ <@${userId}>: ${userText}`).catch(() => {});

  const reply = await askVoice({
    userMessage: userText,
    guildContext: {
      guildName: session.textChannel.guild.name,
      botName: config.botName,
    },
  });

  if (!reply || !reply.trim()) return;

  await session.textChannel.send(`🤖 ${reply}`).catch(() => {});
  await speak(session, reply);
}

async function transcribe(wavPath) {
  const { nodewhisper } = require('nodejs-whisper');
  const out = await nodewhisper(wavPath, {
    modelName: 'tiny',
    autoDownloadModelName: 'tiny',
    removeWavFileAfterTranscription: false,
    withCuda: false,
    logger: { log: () => {}, error: console.error },
    whisperOptions: {
      outputInText: true,
      outputInVtt: false,
      outputInSrt: false,
      outputInCsv: false,
      translateToEnglish: false,
      wordTimestamps: false,
      timestamps_length: 0,
      splitOnWord: false,
    },
  });
  if (!out) return '';
  return String(out)
    .replace(/\[[^\]]+\]/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .trim();
}

function chunkText(text, max = 180) {
  const chunks = [];
  let remaining = text.replace(/\s+/g, ' ').trim();
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function downloadTts(text, lang = 'ar') {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob&total=1&idx=0&textlen=${text.length}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux x86_64) AppleWebKit/537.36',
      'Referer': 'https://translate.google.com/',
    },
  });
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('TTS returned empty audio');
  return buf;
}

async function speak(session, text) {
  const lang = /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
  const chunks = chunkText(text);
  const tmpFiles = [];

  try {
    session.isSpeaking = true;
    for (const chunk of chunks) {
      let buf;
      try {
        buf = await downloadTts(chunk, lang);
      } catch (e) {
        console.error('TTS chunk failed:', e.message);
        continue;
      }
      const filePath = path.join(os.tmpdir(), `tts-${session.guildId}-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
      fs.writeFileSync(filePath, buf);
      tmpFiles.push(filePath);

      const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary });
      session.player.play(resource);
      await new Promise((resolve) => {
        const onIdle = () => { session.player.off('error', onError); resolve(); };
        const onError = (e) => { console.error('player error:', e); session.player.off(AudioPlayerStatus.Idle, onIdle); resolve(); };
        session.player.once(AudioPlayerStatus.Idle, onIdle);
        session.player.once('error', onError);
      });
    }
  } finally {
    session.isSpeaking = false;
    for (const f of tmpFiles) fs.unlink(f, () => {});
  }
}

function leaveVoice(guildId) {
  const session = sessions.get(guildId);
  const conn = session?.connection || getVoiceConnection(guildId);
  if (!conn) throw new Error('البوت مو في قناة صوتية.');
  try { session?.player?.stop(true); } catch {}
  conn.destroy();
  sessions.delete(guildId);
}

module.exports = { joinUserVoice, leaveVoice, getSession };
