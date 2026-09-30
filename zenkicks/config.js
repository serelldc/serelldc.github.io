// =====================================================================
// ZENKICKS — settings you fill in once (see README.md, step 2)
// The anon key is safe to publish: the database rules (schema.sql)
// decide what each user can read and write.
// =====================================================================
window.ZK_CONFIG = {
  // Supabase > Project Settings > API
  SUPABASE_URL: 'https://dsgyxkrputkifxnbcknf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZ3l4a3JwdXRraWZ4bmJja25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzkxNDMsImV4cCI6MjEwNjI1NTE0M30.UPz9kk8zzgqZ49yih6Ii8MUiFdzm0uorjQm3FnF8avw',

  // Sign-in options
  OTP_LENGTH: 6,           // digits in the email sign-in code (Supabase > Auth > Email > Email OTP length)
  GOOGLE_LOGIN: true,      // true after you enable Google in Supabase > Authentication > Providers
  SMS_LOGIN: false,        // true after you connect an SMS provider (Twilio etc.) in Supabase — costs per SMS

  // Ads — leave off until you have steady users
  ADS: {
    enabled: false,
    // Option A: your own sponsor (e.g. a UAE sneaker store). Shown when enabled and no AdSense client is set.
    sponsor: { name: '', text: '', link: '', image: '' },
    // Option B: Google AdSense (after your site is approved)
    adsenseClient: '',     // e.g. 'ca-pub-1234567890123456'
    adsenseSlot: ''        // e.g. '1234567890'
  },

  // Shown in the footer of the profile page
  CONTACT_EMAIL: '',
  INSTAGRAM: ''
};
