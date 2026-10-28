import path from 'node:path';
import { runCommand } from './admin-cli.js';
import { openDatabase } from './db/index.js';

/** Entry point for `node dist/cli.js <command>`; see admin-cli.ts for the commands. */

const dataDir = path.resolve(process.env['MH_DATA_DIR'] ?? '/data');
/** argv starts with the node binary and this script. */
const ARGS_START = 2;

const [command = '', ...args] = process.argv.slice(ARGS_START);
const handle = openDatabase(path.join(dataDir, 'panel.db'));
try {
  const result = await runCommand(handle.db, command, args);
  process.stdout.write(`${result.message}\n`);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  handle.close();
}
