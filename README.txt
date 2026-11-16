Aevy - CPM script ecosystem (Supabase backend)
==============================================

Project: https://jjtgwzyupfqfnbkntkep.supabase.co  (settings are in js/config.js)

Setup (about 5 minutes, one time)
---------------------------------
1. Supabase dashboard -> SQL Editor -> New query -> paste the whole of supabase/schema.sql -> Run.
   This creates the tables, the Row Level Security policies, the profile trigger and the
   delete-account function. It is safe to run again. Without it every request fails.
2. Authentication -> Sign In / Providers -> Email: enabled.
   Recommended: turn OFF "Confirm email" so new accounts can sign in at once.
   (With it ON everything still works: the user must click the emailed link before signing in.)
3. Google button (optional): Authentication -> Sign In / Providers -> Google -> Enable, paste the
   Google OAuth client ID + secret. In Google Cloud Console add this redirect URI to the client:
       https://jjtgwzyupfqfnbkntkep.supabase.co/auth/v1/callback
4. Authentication -> URL Configuration:
     Site URL        = the address where you host the site (e.g. https://yourname.github.io/aevy/)
     Redirect URLs   = add the same address, plus http://localhost:8080/ for local testing.
   Google sign-in and password-reset links return to these addresses.
5. Serve the folder over http(s) - do not open index.html with file://.
   Examples:  npx serve .    or    python3 -m http.server 8080
   Any static host works (Netlify, Vercel, Cloudflare Pages, GitHub Pages ...).

The publishable key in js/config.js is meant to be public. Data is protected by Row Level
Security (supabase/schema.sql), not by hiding the key. Never put a secret / service_role key in the site.

What lives where
----------------
Accounts        Supabase Auth (auth.users: email + password, hashed by Supabase) and Google
Profiles        table public.profiles      (public: username, name, bio, colour; username is unique)
Scripts         table public.scripts       (title, language, category, visibility, preview...)
Script files    table public.script_files  (the file content, max 2 MB per script; any file type)
Saved videos    table public.videos        (private to each user)
Browser         only the colour theme stays in localStorage; Supabase keeps the login session.

Ownership and privacy (enforced by Row Level Security, not just the UI)
-----------------------------------------------------------------------
- Public scripts: anyone can read and download. Private: only the owner.
- Only the owner can create, edit, replace the file of, or delete a script.
- Owner and created date cannot be changed; usernames are permanent and unique.
- Saved videos are readable only by their owner.
- Deleting an account removes the profile, scripts, files and videos (database cascade).

Moving old data
---------------
If the browser still holds scripts from the old local version, the Profile page shows an
"Upload to your account" button. Data from the previous Firebase project is NOT migrated
automatically (different database); download your scripts from the old site first if you need them.

AI assistant ("Ask AI" button, bottom-right corner)
---------------------------------------------------
The chat works out of the box in "Offline helper" mode (answers common questions about the site).
For live AI answers, deploy the included Supabase Edge Function once (needs the Supabase CLI):
   supabase login
   supabase link --project-ref jjtgwzyupfqfnbkntkep
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
   supabase functions deploy aevy-chat --no-verify-jwt
Optional: supabase secrets set ALLOWED_ORIGIN=https://your-site   (only your site may call it)
The AI key lives only in Supabase secrets, never in the website. The function limits message length
and rate (20 messages/min per IP); watch your Anthropic usage because the endpoint is public.
Edit the personality / site knowledge in supabase/functions/aevy-chat/index.ts (SYSTEM text).
The panel header shows "Live" when the function answers, "Offline helper" when it does not.
Model: defaults to claude-sonnet-5-5; set another with: supabase secrets set AEVY_CHAT_MODEL=claude-haiku-5-5 (cheaper, faster).

Look and feel
-------------
css/style.css  the whole interface; the colour and spacing tokens are at the top of the file (dark and light sets)
To add your own artwork (e.g. anime illustrations), put the image in assets/ and use it in index.html.

Any file type
-------------
Scripts can be any file: plain text, obfuscated or encrypted scripts, and binary files. Text is stored
as is. Anything that is not valid UTF-8 text (encrypted / binary) is stored losslessly as base64 and
decoded again on download, so the downloaded file is byte-for-byte the original, with its original
extension. Encrypted files are shown as "Binary or encrypted file" instead of text and cannot be
copied as text; use Download. Limit: 2 MB per file.
If you ran an older schema.sql, run the new one again (it adds the "ext" column and the larger limit).

Notes
-----
- Sign in uses email + password; the username is the public handle.
- Password reset: "Forgot password?" on the sign-in form emails a reset link; opening it asks for a new password.
- Google sign-in: new Google users are asked to pick a username before their profile is created.
- Libraries load up to 1000 public scripts / profiles. Add pagination if you grow past that.
- supabase-js 2.117.3 is loaded from cdn.jsdelivr.net, so the site needs internet.
