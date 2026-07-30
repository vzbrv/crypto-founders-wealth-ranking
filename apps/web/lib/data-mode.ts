interface DataEnvironment {
  NODE_ENV?: string;
  CRYPTO_FOUNDERS_TEST_FIXTURES?: string;
  CRYPTO_FOUNDERS_LOCAL_FIXTURES?: string;
}

export function shouldUseSyntheticFixtures(
  environment: DataEnvironment = process.env,
): boolean {
  if (environment.NODE_ENV === "test") return true;
  if (environment.CRYPTO_FOUNDERS_TEST_FIXTURES === "1") return true;
  return (
    environment.NODE_ENV === "development" &&
    environment.CRYPTO_FOUNDERS_LOCAL_FIXTURES === "1"
  );
}
