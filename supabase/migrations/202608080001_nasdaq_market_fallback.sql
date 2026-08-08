-- Nasdaq is a best-effort secondary source for unresolved public-company quotes.
-- These limits are internal operational guardrails for the public endpoint, not
-- a claim that Nasdaq publishes this request quota or an SLA for this API.
insert into provider_quota_config (
  provider, plan, documented_monthly_quota, hard_monthly_request_limit,
  estimated_monthly_requests, max_requests_per_run, provider_docs_url
) values (
  'nasdaq', 'free_demo', 10000, 9000, 744, 1,
  'https://www.nasdaq.com/market-activity/quotes/real-time'
)
on conflict (provider) do nothing;
