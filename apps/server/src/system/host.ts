import fs from 'node:fs';
import os from 'node:os';
import type { HostInfo } from '@mornihosting/shared';
import type { DockerDriver } from '../docker/driver.js';
import { BYTES_PER_GB, BYTES_PER_MB, PERCENT } from '../lib/units.js';

/** Host load for the dashboard strip. /proc/stat inside a container still shows the host's CPU. */

interface CpuSample {
  readonly idle: number;
  readonly total: number;
}

const state: { last: CpuSample | null; percent: number | null } = { last: null, percent: null };
const IDLE_FIELD = 3;
const IOWAIT_FIELD = 4;

function readCpu(): CpuSample | null {
  try {
    const first = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0] ?? '';
    const values = first.trim().split(/\s+/).slice(1).map(Number); // eslint-disable-line ts-patterns/require-regex-example -- splits on runs of whitespace: "cpu  1 2" → ["cpu", "1", "2"]
    const idle = (values[IDLE_FIELD] ?? 0) + (values[IOWAIT_FIELD] ?? 0);
    const total = values.reduce((a, b) => a + b, 0);
    return { idle, total };
  } catch {
    return null;
  }
}

export function sampleHostCpu(): void {
  const now = readCpu();
  if (!now) return;
  if (state.last) {
    const total = now.total - state.last.total;
    const idle = now.idle - state.last.idle;
    state.percent = total > 0 ? ((total - idle) / total) * PERCENT : state.percent;
  }
  state.last = now;
}

export async function hostInfo(docker: DockerDriver, dataDir: string): Promise<HostInfo> {
  const info = await (async () => {
    try {
      return await docker.hostInfo();
    } catch {
      return { name: os.hostname(), cpus: os.cpus().length, memoryBytes: os.totalmem() };
    }
  })();
  const disk = await (async () => {
    try {
      const s = await fs.promises.statfs(dataDir);
      return {
        total: (s.blocks * s.bsize) / BYTES_PER_GB,
        used: ((s.blocks - s.bfree) * s.bsize) / BYTES_PER_GB,
      };
    } catch {
      return null;
    }
  })();
  return {
    name: info.name,
    cpuPercent: state.percent,
    cpuCores: info.cpus,
    memoryUsedMb: (os.totalmem() - os.freemem()) / BYTES_PER_MB,
    memoryTotalMb: os.totalmem() / BYTES_PER_MB,
    diskUsedGb: disk?.used ?? null,
    diskTotalGb: disk?.total ?? null,
  };
}
