import fs from 'node:fs/promises';
import path from 'node:path';

/** Total size of a folder and everything in it, in bytes. Links are counted, not followed; a vanished file counts 0. */
export async function folderBytes(absolute: string): Promise<number> {
  try {
    const stat = await fs.lstat(absolute);
    if (!stat.isDirectory()) return stat.size;
    const children = await fs.readdir(absolute);
    const sizes = await Promise.all(children.map((child) => folderBytes(path.join(absolute, child))));
    return sizes.reduce((sum, size) => sum + size, 0);
  } catch {
    return 0;
  }
}
