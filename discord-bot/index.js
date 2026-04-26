const { assertConfig } = require('./src/config');
const { startBot } = require('./src/client');

async function main() {
  try {
    assertConfig();
    await startBot();
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

main();
