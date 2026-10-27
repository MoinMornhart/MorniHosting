export interface LineSplitter {
  readonly push: (chunk: string) => void;
  readonly flush: () => void;
}

const NEWLINE = '\n';
const CARRIAGE_RETURN = '\r';

/** Collects text chunks and calls `onLine` once per complete line (CRLF or LF). */
export function createLineSplitter(onLine: (line: string) => void): LineSplitter {
  const state = { pending: '' };
  const emit = (line: string): void => {
    const clean = line.endsWith(CARRIAGE_RETURN) ? line.slice(0, -1) : line;
    if (clean) onLine(clean);
  };
  return {
    push: (chunk) => {
      const parts = (state.pending + chunk).split(NEWLINE);
      state.pending = parts.pop() ?? '';
      parts.forEach(emit);
    },
    flush: () => {
      if (state.pending) emit(state.pending);
      state.pending = '';
    },
  };
}
