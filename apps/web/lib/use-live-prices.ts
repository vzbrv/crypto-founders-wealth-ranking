"use client";

import { useEffect, useMemo, useState } from "react";

import {
  COINBASE_WS_URL,
  LIVE_PRICE_STALE_AFTER_MS,
  collectLiveProducts,
  parseCoinbaseMessage,
  reconcileLivePrice,
  subscriptionMessages,
  type LiveProductPrice,
} from "./live-prices";
import type { RankingEntry } from "./ranking";

export type LiveConnectionState =
  "idle" | "connecting" | "live" | "reconnecting";

export function useLivePrices(entries: RankingEntry[]) {
  const products = useMemo(() => collectLiveProducts(entries), [entries]);
  const productKey = products.map(({ productId }) => productId).join(",");
  const [storedPrices, setStoredPrices] = useState<
    ReadonlyMap<string, LiveProductPrice>
  >(new Map());
  const [connectionState, setConnectionState] =
    useState<LiveConnectionState>("connecting");
  const [rejectedProducts, setRejectedProducts] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!productKey) return;
    const canonicalByProduct = new Map(
      products.map(({ productId, canonicalPriceUsd }) => [
        productId,
        canonicalPriceUsd,
      ]),
    );
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let watchdogTimer: number | undefined;
    let stopped = false;
    let attempts = 0;
    let lastMessageAt = Date.now();

    const connect = () => {
      if (stopped) return;
      if (watchdogTimer) window.clearInterval(watchdogTimer);
      setConnectionState(attempts ? "reconnecting" : "connecting");
      socket = new WebSocket(
        process.env.NEXT_PUBLIC_LIVE_PRICE_WS_URL ?? COINBASE_WS_URL,
      );
      socket.onopen = () => {
        attempts = 0;
        lastMessageAt = Date.now();
        setConnectionState("live");
        for (const message of subscriptionMessages([
          ...canonicalByProduct.keys(),
        ])) {
          socket?.send(message);
        }
      };
      socket.onmessage = ({ data }) => {
        lastMessageAt = Date.now();
        if (typeof data !== "string") return;
        for (const tick of parseCoinbaseMessage(data)) {
          const canonicalPrice = canonicalByProduct.get(tick.productId);
          if (canonicalPrice === undefined) continue;
          const result = reconcileLivePrice(tick, canonicalPrice);
          if (result.accepted) {
            setStoredPrices((current) => {
              const next = new Map(current);
              next.set(tick.productId, result.price);
              return next;
            });
            setRejectedProducts((current) => {
              if (!current.has(tick.productId)) return current;
              const next = new Set(current);
              next.delete(tick.productId);
              return next;
            });
          } else {
            setStoredPrices((current) => {
              if (!current.has(tick.productId)) return current;
              const next = new Map(current);
              next.delete(tick.productId);
              return next;
            });
            setRejectedProducts((current) =>
              new Set(current).add(tick.productId),
            );
          }
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        if (watchdogTimer) window.clearInterval(watchdogTimer);
        setConnectionState("reconnecting");
        attempts += 1;
        reconnectTimer = window.setTimeout(
          connect,
          Math.min(30_000, 1_000 * 2 ** (attempts - 1)),
        );
      };
      socket.onerror = () => socket?.close();
      watchdogTimer = window.setInterval(() => {
        if (
          socket?.readyState === WebSocket.OPEN &&
          Date.now() - lastMessageAt > 25_000
        ) {
          socket.close();
        }
      }, 5_000);
    };

    connect();
    return () => {
      stopped = true;
      socket?.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (watchdogTimer) window.clearInterval(watchdogTimer);
    };
  }, [productKey, products]);

  const prices = useMemo(() => {
    const next = new Map<string, LiveProductPrice>();
    for (const [productId, price] of storedPrices) {
      next.set(productId, {
        ...price,
        stale: clock - Date.parse(price.observedAt) > LIVE_PRICE_STALE_AFTER_MS,
      });
    }
    return next;
  }, [clock, storedPrices]);

  return {
    prices,
    connectionState: productKey ? connectionState : ("idle" as const),
    rejectedCount: rejectedProducts.size,
    supportedProductCount: products.length,
  };
}
