import { createConcordServer } from './createServer.js';

async function main(): Promise<void> {
  const server = await createConcordServer();
  console.log(`[Concord Server] Rodando em ${server.address} (dados em ${server.config.dataDir})`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Concord Server] Encerrando (${signal})...`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Concord Server] Erro fatal ao iniciar:', err);
  process.exit(1);
});
