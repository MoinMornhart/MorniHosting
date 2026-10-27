import net from 'node:net';
import { MS_PER_SECOND } from '../lib/units.js';

const TYPE_AUTH = 3;
const TYPE_COMMAND = 2;
const HEADER_BYTES = 12;
const LENGTH_BYTES = 4;
const ID_OFFSET = 4;
const TYPE_OFFSET = 8;
const PADDING_BYTES = 2;
const AUTH_ID = 1;
const COMMAND_ID = 2;
const FAILED_AUTH_ID = -1;
const TIMEOUT_SECONDS = 5;
const TIMEOUT_MS = TIMEOUT_SECONDS * MS_PER_SECOND;

export class RconError extends Error {
  override readonly name = 'RconError';
}

interface Packet {
  readonly id: number;
  readonly type: number;
  readonly body: string;
}

function encode(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, 'utf8');
  const buffer = Buffer.alloc(HEADER_BYTES + payload.length + PADDING_BYTES);
  buffer.writeInt32LE(buffer.length - LENGTH_BYTES, 0);
  buffer.writeInt32LE(id, ID_OFFSET);
  buffer.writeInt32LE(type, TYPE_OFFSET);
  payload.copy(buffer, HEADER_BYTES);
  return buffer;
}

/** Splits complete packets off the front of the buffer; returns them and the unread rest. */
export function decodePackets(
  buffer: Buffer,
  found: readonly Packet[] = [],
): { packets: Packet[]; rest: Buffer } {
  if (buffer.length < LENGTH_BYTES) return { packets: [...found], rest: buffer };
  const length = buffer.readInt32LE(0);
  const total = length + LENGTH_BYTES;
  if (buffer.length < total) return { packets: [...found], rest: buffer };
  const packet: Packet = {
    id: buffer.readInt32LE(ID_OFFSET),
    type: buffer.readInt32LE(TYPE_OFFSET),
    body: buffer.toString('utf8', HEADER_BYTES, total - PADDING_BYTES),
  };
  return decodePackets(buffer.subarray(total), [...found, packet]);
}

/** Sends one command over RCON and resolves with the server's answer. */
export async function rconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.connect({ host, port });
    const state: { buffer: Buffer; authed: boolean; done: boolean } = {
      buffer: Buffer.alloc(0),
      authed: false,
      done: false,
    };
    const finish = (err: Error | null, value = ''): void => {
      if (state.done) return;
      state.done = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    socket.setTimeout(TIMEOUT_MS, () => finish(new RconError('timeout')));
    socket.on('error', (err) => finish(new RconError(err.message, { cause: err })));
    socket.on('connect', () => socket.write(encode(AUTH_ID, TYPE_AUTH, password)));
    socket.on('data', (chunk) => {
      const { packets, rest } = decodePackets(Buffer.concat([state.buffer, chunk]));
      state.buffer = rest;
      packets.forEach((packet) => {
        if (!state.authed) {
          if (packet.id === FAILED_AUTH_ID) return finish(new RconError('auth failed'));
          if (packet.id !== AUTH_ID || packet.type !== TYPE_COMMAND) return undefined;
          state.authed = true;
          socket.write(encode(COMMAND_ID, TYPE_COMMAND, command));
          return undefined;
        }
        return packet.id === COMMAND_ID ? finish(null, packet.body) : undefined;
      });
    });
  });
}
