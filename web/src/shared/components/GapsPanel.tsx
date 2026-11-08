/**
 * The "Gaps & shortcuts" panel (implementation plan, section 1). Every site shows what it leaves out
 * and what it fakes, so nobody mistakes a shortcut for the real thing. The same list is in README.md.
 */
import { useState } from 'react';

export interface Gap {
  /** Conflict or shortcut ID from the plan, e.g. "A2" or "SC-1". */
  id: string;
  kind: 'gap' | 'shortcut';
  what: string;
  closedBy: string;
}

export function GapsPanel({ items }: { items: Gap[] }) {
  const [open, setOpen] = useState(false);
  const shortcuts = items.filter((g) => g.kind === 'shortcut');
  const gaps = items.filter((g) => g.kind === 'gap');
  return (
    <aside className="gaps" aria-label="Gaps and shortcuts">
      <button type="button" className="gaps__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Gaps &amp; shortcuts <span className="gaps__count">{items.length}</span>
      </button>
      {open && (
        <div className="gaps__body">
          <p className="gaps__lede">What this build leaves out or fakes. Nothing here counts as built.</p>
          {[['Shortcuts (faked for now)', shortcuts], ['Gaps (left out)', gaps]].map(([title, list]) => (
            <section key={title as string}>
              <h2 className="gaps__h">{title as string}</h2>
              <ul className="gaps__list">
                {(list as Gap[]).map((g) => (
                  <li key={g.id}>
                    <b>{g.id}</b> {g.what} <span className="gaps__close">Closed by: {g.closedBy}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}
