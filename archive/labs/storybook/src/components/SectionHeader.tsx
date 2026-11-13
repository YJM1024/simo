import React from 'react';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/** Simo SectionHeader: title + optional subtitle + optional actions row. */
export function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div className="simo-section">
      <div className="simo-section__row">
        <h2 className="simo-section__title">{title}</h2>
        {actions ? <div className="simo-section__actions">{actions}</div> : null}
      </div>
      {subtitle ? <p className="simo-section__subtitle">{subtitle}</p> : null}
    </div>
  );
}
