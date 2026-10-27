"use client";

import { PIN_KEYS } from "../offline/profiles";
import { IconBackspace } from "./icons";

/**
 * Picture PIN keypad: nine pictures, each with its number. Four taps make a
 * PIN. Entered keys are shown as dots, never as pictures, so someone looking
 * over the learner's shoulder cannot read it from the screen.
 */
export function PinPad({
  value,
  onChange,
  disabled,
  length = 4,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  length?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3" aria-label={`${value.length} of ${length}`} role="status">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={`h-5 w-5 rounded-full border-2 ${i < value.length ? "border-primary bg-primary" : "border-line bg-white"}`} />
        ))}
      </div>
      <div className="grid w-full max-w-sm grid-cols-3 gap-3">
        {PIN_KEYS.map((k) => (
          <button
            key={k.digit}
            type="button"
            data-testid={`pin-key-${k.digit}`}
            aria-label={`${k.digit}`}
            disabled={disabled || value.length >= length}
            onClick={() => onChange(value + k.digit)}
            className="relative flex aspect-square items-center justify-center rounded-2xl border-2 border-line bg-white p-2 active:scale-95 disabled:opacity-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/images/${k.image}.svg`} alt="" className="h-full w-full" draggable={false} />
            <span className="absolute left-2 top-1 text-lg font-bold text-ink-soft">{k.digit}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="pin-backspace"
        aria-label="remove last"
        disabled={disabled || value.length === 0}
        onClick={() => onChange(value.slice(0, -1))}
        className="flex h-14 w-24 items-center justify-center rounded-2xl text-ink-soft disabled:opacity-30"
      >
        <IconBackspace size={32} />
      </button>
    </div>
  );
}
