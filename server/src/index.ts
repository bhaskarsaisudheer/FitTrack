import { createApp } from './app.js';
import { config } from './config/env.js';
import { checkDatabaseConnection, closeDatabase } from './config/database.js';

async function main(): Promise<void> {
  try {
    await checkDatabaseConnection();
    console.log(`[fittrack] Connected to MySQL database "${config.dbName}".`);
  } catch (error) {
    console.error('[fittrack] Could not reach the database:', error);
    console.error(
      '[fittrack] Check that MySQL is running and that server/.env holds the correct credentials.',
    );
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[fittrack] API listening on http://localhost:${config.port}`);
    console.log(`[fittrack] Health check: http://localhost:${config.port}/api/health`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n[fittrack] ${signal} received, shutting down.`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    // Do not hang forever if a connection refuses to close.
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[fittrack] Fatal startup error:', error);
  process.exit(1);
});
