import { productStage } from "../lib/product";

export default function Home() {
  return (
    <main>
      <p className="eyebrow">Repository foundation only</p>
      <h1>Crypto Founders Wealth Ranking</h1>
      <p className="summary">
        The application shell and engineering safeguards are ready. Rankings,
        providers, calculations, and curated records are intentionally deferred.
      </p>
      <p className="stage">{productStage}</p>
    </main>
  );
}
