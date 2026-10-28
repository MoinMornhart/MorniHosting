import { demoPasskeyAccounts } from './backend';

/**
 * Stands in for @simplewebauthn/browser in the demo build. The demo page runs in a sealed frame
 * where the browser refuses real passkeys, so this shows a clearly marked pretend dialog instead
 * of the device's fingerprint or face prompt. In the real panel the device asks.
 */

interface Choice {
  readonly id: string;
  readonly label: string;
}

const STYLE = `
.mh-sheet{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.55)}
.mh-sheet>div{width:min(380px,100%);display:grid;gap:14px;padding:22px;border-radius:18px;background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);box-shadow:0 24px 60px rgba(0,0,0,.45);font:14px/1.45 Manrope,system-ui,sans-serif}
.mh-sheet h2{margin:0;font-size:17px;font-weight:700}
.mh-sheet p{margin:0;color:var(--muted-foreground)}
.mh-sheet .mh-print{justify-self:center;display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:var(--accent);color:var(--primary);font-size:30px}
.mh-sheet button{font:inherit;font-weight:600;border-radius:10px;padding:10px 14px;cursor:pointer;border:1px solid var(--border);background:var(--secondary);color:var(--foreground);text-align:left}
.mh-sheet button.mh-go{background:var(--primary);color:var(--primary-foreground);border-color:transparent;text-align:center}
.mh-sheet .mh-row{display:flex;gap:8px;justify-content:flex-end}
.mh-sheet .mh-note{font-size:12px}
`;

function sheet(title: string, text: string, choices: readonly Choice[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const root = document.createElement('div');
    root.className = 'mh-sheet';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    const style = document.createElement('style');
    style.textContent = STYLE;
    const box = document.createElement('div');
    const print = document.createElement('span');
    print.className = 'mh-print';
    print.textContent = '◉';
    print.setAttribute('aria-hidden', 'true');
    const heading = document.createElement('h2');
    heading.textContent = title;
    const body = document.createElement('p');
    body.textContent = text;
    const note = document.createElement('p');
    note.className = 'mh-note';
    note.textContent =
      'Simulation: In dieser Demo fragt nicht dein echtes Gerät. Im echten Panel erscheint hier der Fingerabdruck-, Gesichts- oder PIN-Dialog deines Geräts.';
    const close = (fn: () => void): void => {
      root.remove();
      fn();
    };
    const buttons = choices.map((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = choices.length === 1 ? 'mh-go' : '';
      button.textContent = choice.label;
      button.addEventListener('click', () => close(() => resolve(choice.id)));
      return button;
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Abbrechen';
    cancel.addEventListener('click', () =>
      close(() => reject(new DOMException('The operation was cancelled.', 'NotAllowedError'))),
    );
    const row = document.createElement('div');
    row.className = 'mh-row';
    row.append(cancel);
    box.append(print, heading, body, ...buttons, row, note);
    root.append(style, box);
    document.body.append(root);
    (buttons[0] ?? cancel).focus();
  });
}

export function browserSupportsWebAuthn(): boolean {
  return true;
}

export async function startAuthentication(): Promise<unknown> {
  const accounts = demoPasskeyAccounts();
  if (!accounts.length) throw new DOMException('No passkey on this device.', 'NotAllowedError');
  const id = await sheet(
    'Mit Passkey anmelden',
    'Wähle den Passkey für MorniHosting und bestätige mit Fingerabdruck, Gesicht oder PIN.',
    accounts,
  );
  return { id, rawId: id, type: 'public-key', response: {}, clientExtensionResults: {} };
}

export async function startRegistration(): Promise<unknown> {
  const id = `demo-${crypto.randomUUID()}`;
  await sheet('Passkey erstellen', 'MorniHosting möchte einen Passkey auf diesem Gerät speichern.', [
    { id, label: 'Mit Fingerabdruck bestätigen' },
  ]);
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: { transports: ['internal'] },
    clientExtensionResults: {},
  };
}
