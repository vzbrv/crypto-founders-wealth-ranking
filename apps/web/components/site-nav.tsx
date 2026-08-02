"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const links = [
  { href: "/#ranking", label: "Ranking", kind: "ranking" },
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
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navLinksRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      navLinksRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    } else if (wasOpen.current) {
      menuButtonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

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
            className="brand-wordmark brand-wordmark-light"
            src="/brand/iqwiki-black-b.svg"
            alt=""
            width={126}
            height={32}
            priority
          />
          <Image
            className="brand-wordmark brand-wordmark-dark"
            src="/brand/iqwiki-white-w.svg"
            alt=""
            width={126}
            height={32}
            priority
          />
        </Link>
        <button
          className="menu-button"
          type="button"
          ref={menuButtonRef}
          aria-expanded={open}
          aria-controls="nav-links"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">{open ? "×" : "☰"}</span>
        </button>
        <div
          id="nav-links"
          ref={navLinksRef}
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
          className="footer-wordmark brand-wordmark-light"
          src="/brand/iqwiki-black-b.svg"
          alt=""
          width={126}
          height={32}
        />
        <Image
          className="footer-wordmark brand-wordmark-dark"
          src="/brand/iqwiki-white-w.svg"
          alt=""
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
