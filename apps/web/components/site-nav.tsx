"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/", label: "Ranking", kind: "ranking" },
  { href: "/methodology/", label: "Methodology", kind: "methodology" },
  { href: "/sources/", label: "Sources", kind: "sources" },
  { href: "/status/", label: "Status", kind: "status" },
] as const;

function isActive(
  pathname: string,
  kind: (typeof links)[number]["kind"],
): boolean {
  if (kind === "ranking")
    return pathname === "/" || pathname.startsWith("/ranking/");
  return pathname.startsWith(`/${kind}`);
}

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="Primary navigation">
        <Link
          className="brand-lockup"
          href="/"
          aria-label="IQ.wiki value created index home"
          onClick={() => setOpen(false)}
        >
          <Image
            className="brand-logo"
            src="/brand/iq-logo-pink.svg"
            alt="IQ.wiki"
            width={40}
            height={40}
            priority
          />
          <Image
            className="brand-wordmark"
            src="/brand/iqwiki-black-b.svg"
            alt="IQ.wiki"
            width={126}
            height={32}
            priority
          />
        </Link>
        <button
          className="menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="primary-navigation-links"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">{open ? "×" : "☰"}</span>
        </button>
        <div
          id="primary-navigation-links"
          className={`nav-links${open ? " is-open" : ""}`}
        >
          {links.map((link) => {
            const active = isActive(pathname, link.kind);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Image
          className="footer-wordmark"
          src="/brand/iqwiki-black-b.svg"
          alt="IQ.wiki"
          width={126}
          height={32}
        />
        <p>
          Research-driven provisional value estimates for outside holders and
          shareholders.
        </p>
      </div>
      <nav aria-label="Footer navigation">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
