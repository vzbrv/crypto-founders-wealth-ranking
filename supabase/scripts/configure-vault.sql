select vault.update_secret(id, :'project_url')
from vault.secrets
where name = 'project_url';

select vault.create_secret(:'project_url', 'project_url', 'Supabase project URL for scheduled Edge Functions')
where not exists (select 1 from vault.secrets where name = 'project_url');

select vault.update_secret(id, :'cron_secret')
from vault.secrets
where name = 'cron_secret';

select vault.create_secret(:'cron_secret', 'cron_secret', 'Shared secret for scheduled Edge Functions')
where not exists (select 1 from vault.secrets where name = 'cron_secret');
