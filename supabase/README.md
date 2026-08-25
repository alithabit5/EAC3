# Supabase setup

1. Open the Supabase project SQL Editor.
2. Create a new query and paste the contents of `migrations/202608250001_initial_schema.sql`.
3. Run the query and confirm the tables appear under the `public` schema.
4. In Authentication > Providers, enable Email.
5. Create the first user under Authentication > Users.
6. In Table Editor > profiles, add a row for that user's UUID with `display_name` and role `admin`.

The browser client should use the project URL and publishable key from `.env.example`. Never put the database password or a `service_role` key in browser code or GitHub.

The current `Dashboard.dc.html` is a design-tool export. It remains a reference prototype until the UI is recreated in a normal application build that can load environment variables and use Supabase Auth, Storage, and the tables above.
