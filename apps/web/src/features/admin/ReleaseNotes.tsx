import type { ReactElement } from 'react';

// A Markdown heading: "## Neu" and "### Fixes" match, "#hashtag" and "Neu" do not.
// https://regex101.com/?flavor=javascript&regex=%5E%23%7B1%2C6%7D%5Cs%2B&flags=gm&testString=%23%23%20Neu%0A%23%23%23%20Fixes%0A%23hashtag%0ANeu
const HEADING = /^#{1,6}\s+/;
// A list item: "- Geyser" and "* TPS" match, "-5 Grad" and "Text" do not.
// https://regex101.com/?flavor=javascript&regex=%5E%5B-*%5D%5Cs%2B&flags=gm&testString=-%20Geyser%0A*%20TPS%0A-5%20Grad%0AText
const LIST_ITEM = /^[-*]\s+/;
// Bold and code marks inside a line: "**neu**" and "`update`" match, "Text" does not.
// https://regex101.com/?flavor=javascript&regex=%5C*%5C*%7C%60&flags=gm&testString=**neu**%0A%60update%60%0AText
const INLINE_MARKS = /\*\*|`/g;

/** GitHub release notes are Markdown; this shows headings and lists without a Markdown library. */
export function ReleaseNotes({ text }: { text: string }): ReactElement {
  const lines = text
    .split('\n')
    .map((line) => line.trim().replaceAll(INLINE_MARKS, ''))
    .filter(Boolean);
  return (
    <div className="grid max-h-56 gap-1 overflow-y-auto rounded-[12px] bg-secondary p-3 text-[13px] text-muted-foreground">
      {lines.map((line, i) => {
        const key = `${i}-${line}`;
        if (HEADING.test(line)) {
          return (
            <p key={key} className="mt-1 font-semibold text-foreground first:mt-0">
              {line.replace(HEADING, '')}
            </p>
          );
        }
        if (LIST_ITEM.test(line)) {
          return (
            <p key={key} className="flex gap-2 pl-1">
              <span aria-hidden className="text-primary">
                •
              </span>
              <span>{line.replace(LIST_ITEM, '')}</span>
            </p>
          );
        }
        return <p key={key}>{line}</p>;
      })}
    </div>
  );
}
