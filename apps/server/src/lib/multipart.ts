import type { MultipartFile } from '@fastify/multipart';

/** Reads every uploaded file of a multipart request one after another (a recursive walk instead of a loop). */
export async function eachFile<TResult>(
  iterator: AsyncIterator<MultipartFile>,
  handle: (file: MultipartFile) => Promise<TResult>,
  done: readonly TResult[] = [],
): Promise<TResult[]> {
  const next = await iterator.next();
  if (next.done) return [...done];
  return eachFile(iterator, handle, [...done, await handle(next.value)]);
}
