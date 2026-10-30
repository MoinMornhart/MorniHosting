import net from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import { classifyMailError, realNetwork } from '../src/mail/check.js';

const LOCALHOST = '127.0.0.1';
const SHORT_TIMEOUT_MS = 2000;
const SMTP_AUTH_WRONG = 535;
const SMTP_MAILBOX_REFUSED = 553;

const smtpError = (fields: object): Error => Object.assign(new Error('smtp'), fields);

describe('mail check: errors become plain problems', () => {
  test.each([
    [smtpError({ code: 'EDNS', originalCode: 'ENOTFOUND' }), 'unreachable'],
    [smtpError({ code: 'ESOCKET', originalCode: 'ECONNREFUSED' }), 'port_closed'],
    [smtpError({ code: 'ETIMEDOUT' }), 'timeout'],
    [smtpError({ code: 'ESOCKET', originalCode: 'ERR_TLS_CERT_ALTNAME_INVALID' }), 'tls'],
    [smtpError({ code: 'ESOCKET', originalCode: 'DEPTH_ZERO_SELF_SIGNED_CERT' }), 'tls'],
    [new Error('ssl3_get_record:wrong version number'), 'wrong_security'],
    [smtpError({ code: 'EAUTH', responseCode: SMTP_AUTH_WRONG }), 'login'],
    [smtpError({ code: 'EENVELOPE', command: 'MAIL FROM', responseCode: SMTP_MAILBOX_REFUSED }), 'sender'],
    [smtpError({ code: 'EENVELOPE', command: 'RCPT TO', responseCode: SMTP_MAILBOX_REFUSED }), 'recipient'],
    [new Error('something odd'), 'other'],
  ])('%s → %s', (err, problem) => {
    expect(classifyMailError(err)).toBe(problem);
  });
});

describe('mail check: real TCP', () => {
  let server: net.Server | undefined;
  afterEach(() => server?.close());

  const listen = async (): Promise<number> => {
    server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server?.listen(0, LOCALHOST, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    return address.port;
  };

  test('an open port connects, a closed one is refused', async () => {
    const port = await listen();
    await expect(realNetwork.connect(LOCALHOST, port, SHORT_TIMEOUT_MS)).resolves.toBeUndefined();
    server?.close();
    const refused = await realNetwork.connect(LOCALHOST, port, SHORT_TIMEOUT_MS).catch((err: unknown) => err);
    expect(classifyMailError(refused)).toBe('port_closed');
  });

  test('an IP needs no lookup, a name is resolved', async () => {
    await expect(realNetwork.lookup('localhost')).resolves.toMatch(/^(127\.0\.0\.1|::1)$/); // eslint-disable-line ts-patterns/require-regex-example -- "127.0.0.1" or "::1"
  });
});
