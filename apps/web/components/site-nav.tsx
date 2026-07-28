import Link from "next/link";

export function SiteNav() {
  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <Link className="wordmark" href="/">
        Crypto Founders
      </Link>
      <div className="nav-links">
        <Link href="/#ranking">Ranking</Link>
        <Link href="/methodology/">Methodology</Link>
        <Link href="/sources/">Sources</Link>
        <Link href="/status/">Status</Link>
      </div>
    </nav>
  );
}
