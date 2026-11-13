import React from 'react';

export type StatusKind = 'ok' | 'warn' | 'danger' | 'idle';

export interface StatusDotProps {
  kind?: StatusKind;
  label: string;
  pulse?: boolean;
}

const DEFAULT_LABEL: Record<StatusKind, string> = {
  ok: '正常',
  warn: '告警',
  danger: '故障',
  idle: '空闲',
};

/** Simo StatusDot: 4 semantic states, optional pulse (reduced-motion aware). */
export function StatusDot({ kind = 'ok', label, pulse = false }: StatusDotProps) {
  const text = label || DEFAULT_LABEL[kind];
  return (
    <span className={`simo-status simo-status--${kind}${pulse ? ' simo-status--pulse' : ''}`}>
      <span className="simo-status__dot" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
