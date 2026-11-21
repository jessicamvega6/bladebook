/**
 * The loading message used on all three websites: the gliding BladeBook skate next to the words.
 * The words stay so the wait is always spelled out; the drawing is hidden from screen readers.
 */
import type { CSSProperties } from 'react';
import './loading.css';

export function Loading({ text = 'Loading…', page, style }: { text?: string; page?: boolean; style?: CSSProperties }) {
  return (
    <p className={`muted loading${page ? ' loading--page' : ''}`} role="status" aria-busy="true" style={style}>
      <svg className="loading__skate" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <g className="boot" strokeWidth={2}>
          <path d="M8.5 3v9.2c0 1.6 1 2.7 2.7 3.2l5.6 1.7" />
          <path d="M4 20h16" /><path d="M6.5 20v-2" /><path d="M17.5 20v-2.3" />
        </g>
        <path className="ice" d="M1 21.6H23" />
        <path className="ice2" d="M3 23.4H21" />
      </svg>
      <span>{text}</span>
    </p>
  );
}
