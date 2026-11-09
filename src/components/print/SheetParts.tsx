import type { ReactNode } from 'react';

export function SheetHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="fs-header">
      <img
        src={`${import.meta.env.BASE_URL}branding/powered-by-fate-light.svg`}
        alt="Powered by Fate"
        loading="eager"
        decoding="sync"
      />
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

export function SheetSection({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`fs-section ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function WriteLines({ count = 2 }: { count?: number }) {
  return (
    <div className="fs-write-lines" aria-label="Space for handwritten notes">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} />
      ))}
    </div>
  );
}

export function TextValue({ children }: { children?: ReactNode }) {
  return <div className="fs-text-value">{children || <WriteLines count={1} />}</div>;
}

export function SheetFooter() {
  return (
    <footer className="fs-footer">
      <p>
        ©2013 Evil Hat Productions, LLC. This work is based on Fate Core System and Fate Accelerated Edition
        (found at http://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and
        edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine,
        Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under the Creative Commons
        Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).
      </p>
      Fate™ is a trademark of Evil Hat Productions, LLC. The Powered by Fate logo is © Evil Hat Productions,
      LLC and is used with permission.
      <p>
        Fate Core supporting game tools by Nick Oddson ·{' '}
        <a href="https://noddson.github.io/fatecc/">noddson.github.io/fatecc</a>
      </p>
    </footer>
  );
}
