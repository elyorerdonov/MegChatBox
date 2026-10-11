MEGCHATBOX V5 — STARTER FOUNDATION
==================================

FILES
- index.html / style.css / script.js: sign-in and sign-up
- dashboard.html / dashboard.css / dashboard.js: dashboard, real profile search, contacts, basic direct chats, messages, profile/settings panels
- supabase.js: Supabase browser configuration
- schema.sql: starter database tables and RLS policies

IMPORTANT SETUP
1. In Supabase, open SQL Editor and run schema.sql in a new/test project. If you already have important data, back it up and inspect the SQL before running it.
2. Open supabase.js and replace:
   PASTE_YOUR_SUPABASE_PROJECT_URL_HERE
   PASTE_YOUR_SUPABASE_ANON_KEY_HERE
   with your Project URL and anon/public key from Supabase > Project Settings > API.
   Do NOT use the service_role key in browser code.
3. Upload all HTML/CSS/JS files to the same GitHub Pages folder.
4. In Supabase Auth settings, set the correct Site URL and redirect URLs for your GitHub Pages address.
5. Create a test account and check that the profile appears in public.profiles.

FIRST OWNER
After creating the account and its profile, open SQL Editor and run:
  update public.profiles set role='owner' where username='your_owner_username';
Replace the username. Do not expose Owner grants through client-side code.

CURRENT FOUNDATION INCLUDED
- Email/password signup and login
- Real profile search from profiles table (no hard-coded sample users)
- Up to 10 matching user results
- Recent search history stored in this browser
- Contact request and accept flow (basic)
- Contacts list
- Basic direct chat creation for accepted contacts
- Basic text messages and saved-message view
- Profile editing and online/last-seen privacy toggles
- Separate Owner and Admin settings tabs based on role/record
- Initial groups/channels/settings structure in the database

NOT YET COMPLETE
This is the V5 foundation, not the entire 37-section feature list. The following need further implementation and security work:
- Production-safe admin grant/revoke and permission editing via Edge Functions or trusted server
- Full Admin/Owner dashboards, moderation tools, audit history, verified duration
- Image/file/video upload, reactions, edit/delete, reply, pin, read receipts, typing indicators
- Decoration image assets and picker, media browser, custom wallpaper
- Complete group/channel create/edit/invite/leave/ownership transfer
- Private invite codes, join approval, reports and private community moderation
- Connected-device revocation, notifications, tips chat, statistics, anti-abuse hardening
- Mobile navigation refinements and final visual polish

SECURITY NOTES
- Never trust UI visibility as authorization.
- RLS policies are required, but this starter schema is not a complete production security audit.
- The sample policies allow authenticated profile reads for user search. For private usernames and sensitive moderation, use a dedicated safe search view/RPC that does not return private profiles.
- Admin/Owner changes must use a trusted server-side function with role checks. Never ship the service_role key to the browser.
- Review the chat_members policies before production; complex mutual-membership operations should be moved to secure SQL functions.
