import { DEMO_PASSWORD, DEMO_USER, installDemoBackend } from './backend';

/** Demo entry: the pretend server first, then the real app on top of it. */

installDemoBackend();

const banner = document.createElement('div');
banner.setAttribute('role', 'note');
banner.style.cssText = [
  'position:fixed',
  'left:50%',
  'bottom:calc(10px + env(safe-area-inset-bottom, 0px))',
  'transform:translateX(-50%)',
  'z-index:90',
  'max-width:calc(100vw - 32px)',
  'padding:7px 14px',
  'border-radius:999px',
  'border:1px solid var(--border)',
  'background:var(--popover)',
  'color:var(--muted-foreground)',
  'font:12px/1.4 Manrope,system-ui,sans-serif',
  'box-shadow:0 8px 24px rgba(0,0,0,.25)',
  'text-align:center',
].join(';');
banner.innerHTML = `<b style="color:var(--primary)">Demo</b> · Anmelden mit <b style="color:var(--foreground)">${DEMO_USER}</b> / <b style="color:var(--foreground)">${DEMO_PASSWORD}</b> oder Passkey · nichts wird gespeichert`;
const close = document.createElement('button');
close.type = 'button';
close.textContent = '×';
close.setAttribute('aria-label', 'Hinweis schließen');
close.style.cssText =
  'margin-left:8px;border:0;background:none;color:inherit;font:inherit;font-size:15px;line-height:1;cursor:pointer;padding:0 2px';
close.addEventListener('click', () => banner.remove());
banner.append(close);
document.body.append(banner);

await import('../main');
