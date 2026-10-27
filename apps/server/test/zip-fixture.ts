/* eslint-disable ts-patterns/no-magic-numbers -- byte offsets of the ZIP format */
import { crc32 } from 'node:zlib';

/** Writes a minimal uncompressed ZIP, including names a normal archiver would refuse (for zip-slip tests). */
const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const VERSION = 20;
const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;

export function storedZip(entries: Readonly<Record<string, string>>): Buffer {
  const parts = Object.entries(entries).map(([name, text]) => ({
    name: Buffer.from(name),
    data: Buffer.from(text),
  }));
  const locals = parts.map((p) => {
    const header = Buffer.alloc(LOCAL_HEADER);
    header.writeUInt32LE(LOCAL_SIG, 0);
    header.writeUInt16LE(VERSION, 4);
    header.writeUInt32LE(crc32(p.data), 14);
    header.writeUInt32LE(p.data.length, 18);
    header.writeUInt32LE(p.data.length, 22);
    header.writeUInt16LE(p.name.length, 26);
    return Buffer.concat([header, p.name, p.data]);
  });
  const offsets = locals.reduce<number[]>(
    (acc, _buf, i) => [...acc, i ? (acc[i - 1] ?? 0) + (locals[i - 1]?.length ?? 0) : 0],
    [],
  );
  const centrals = parts.map((p, i) => {
    const header = Buffer.alloc(CENTRAL_HEADER);
    header.writeUInt32LE(CENTRAL_SIG, 0);
    header.writeUInt16LE(VERSION, 4);
    header.writeUInt16LE(VERSION, 6);
    header.writeUInt32LE(crc32(p.data), 16);
    header.writeUInt32LE(p.data.length, 20);
    header.writeUInt32LE(p.data.length, 24);
    header.writeUInt16LE(p.name.length, 28);
    header.writeUInt32LE(offsets[i] ?? 0, 42);
    return Buffer.concat([header, p.name]);
  });
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(END_RECORD);
  end.writeUInt32LE(END_SIG, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
}
