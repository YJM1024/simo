import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
}

/** Simo Button: 4 variants × 2 sizes + disabled/loading/focus-visible. */
export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'simo-btn',
    `simo-btn--${variant}`,
    size === 'sm' ? 'simo-btn--sm' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="simo-btn__spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
