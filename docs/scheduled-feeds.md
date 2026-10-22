# Scheduled feed refresh

`vercel.json` schedules `/api/cron/feeds` daily at 06:00 UTC. Configure a random `CRON_SECRET` of at least 16 characters in the deployment. The endpoint refuses requests without the exact bearer secret; it never accepts a browser session as cron authorization.

The handler refreshes oldest-checked feeds first and records per-source errors. It stops starting fetches after 40 seconds and reports remaining subscriptions as `deferred`; each fetch already has a bounded timeout. Large libraries therefore require the durable job continuation work still outstanding. This is not a guarantee that every subscription refreshes daily.

Production requires DATABASE_URL, APP_ORIGIN, SETUP_SECRET, and CRON_SECRET. No cloud schedule has been activated or verified yet. Official guidance: https://vercel.com/docs/cron-jobs/manage-cron-jobs
