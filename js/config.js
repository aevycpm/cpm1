/* Aevy backend settings.
   The publishable key is designed to be public: it ships in the browser.
   What protects the data is Row Level Security (supabase/schema.sql), not this key.
   NEVER put a "secret" or "service_role" key in this file. */
window.AEVY_CONFIG = {
  url: 'https://jjtgwzyupfqfnbkntkep.supabase.co',
  key: 'sb_publishable_ATZhUhGKT0KIDAQMbO2TKQ_ASu97PPj',
  newDays: 7,  /* how long the "New" badge shows; keep equal to aevy_new_user_days() in schema.sql */
  defaultCountry: 'BD',  /* phone country shown when the visitor's country cannot be detected (2-letter code) */
  adminNames: ['Aevy'],  /* display names reserved for the owner: the earliest account with this name shows the Admin badge */
  discover: true,  /* one-time "scripts from the community" card for new visitors (random public scripts, manual Download only) */
  suggestStrip: false,  /* the "Suggested accounts" row on Home: hidden. Set true to show it again */
  suggest: true,  /* "Follow Aevy" prompt + "Suggested accounts" strip on Home (real accounts only) */
  adminUsernames: ['aevy']  /* these accounts always show the red Admin badge (never the New badge). Also run the SQL in README to give them real Admin rights */
};
