// Must be loaded before Express and HTTP instrumentation.
const sdk = require('./telemetry');

const fs = require('node:fs');
const path = require('node:path');
const pino = require('pino');

const {
  createLogger
} = require('./logger');

const {
  createApp
} = require('./app');

// Create log directory automatically.
const logsDirectory = path.resolve('logs');

fs.mkdirSync(logsDirectory, {
  recursive: true
});

const fileStream = fs.createWriteStream(
  path.join(logsDirectory, 'app.ndjson'),
  { flags: 'a' }
);

// Write the same structured logs to:
// 1. Terminal
// 2. JSON log file for Filebeat
const logger = createLogger(
  pino.multistream([
    { stream: process.stdout },
    { stream: fileStream }
  ])
);

const port = Number(
  process.env.PORT || 3000
);

const server = createApp(logger).listen(
  port,
  '127.0.0.1',

  () => {
    logger.info('server.started', {
      'server.port': port
    });

    console.log(
      `API running at http://127.0.0.1:${port}`
    );
  }
);

let stopping = false;

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    logger.info('server.stopped', {
      'event.reason': signal
    });

    await sdk.shutdown();

    await new Promise((resolve) => {
      fileStream.end(resolve);
    });

    process.exitCode = 0;
  } catch (error) {
    console.error(
      'Shutdown failed:',
      error.message
    );

    process.exitCode = 1;
  }
}

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);
