# Notes for Claude working on this repo

## Supabase: new tables need explicit grants (since 2026-10-30)
Supabase no longer grants Data API access to new tables in `public` automatically.
Every migration that creates a table must also grant access in the same file, otherwise
the app gets "permission denied":

```sql
grant select, insert, update, delete on public.<table> to authenticated;
grant select, insert, update, delete on public.<table> to service_role;
```

Do not grant to `anon` (the app has no signed-out data access). Keep RLS enabled and add policies as usual.
Adding columns to an existing table is not affected.
