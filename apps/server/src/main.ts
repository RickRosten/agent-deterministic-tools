import { createApp, settingsFromEnv } from './app.js';

const logger = (level: string, message: string, data?: Record<string, unknown>) => {
  if (level === 'debug' && process.env['DEBUG'] !== 'true') return;
  process.stderr.write(`${JSON.stringify({ level, message, ...data })}\n`);
};

try {
  const running = await createApp(settingsFromEnv(process.env), logger).listen();
  const shutdown = () => {
    void running.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  logger('error', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
