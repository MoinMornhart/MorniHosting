import { dnsConfigSchema, dnsDiscoverSchema } from '@mornihosting/shared';
import { actorOf, requireAdmin } from '../auth/context.js';
import type { Api } from '../context.js';
import type { DnsAutomation } from './service.js';

/** Own domain without NetBird (admins only): the panel acts with the admin's DNS key. */
export function registerDnsRoutes(app: Api, dns: DnsAutomation): void {
  app.get('/api/dns', async (request) => {
    requireAdmin(request);
    return dns.status();
  });

  app.post('/api/dns/discover', { schema: { body: dnsDiscoverSchema } }, async (request) => {
    requireAdmin(request);
    return { zones: await dns.discover(request.body) };
  });

  app.put('/api/dns', { schema: { body: dnsConfigSchema } }, async (request) => {
    requireAdmin(request);
    return dns.configure(request.body, actorOf(request));
  });

  app.delete('/api/dns', async (request) => {
    requireAdmin(request);
    return dns.disconnect(actorOf(request));
  });
}
