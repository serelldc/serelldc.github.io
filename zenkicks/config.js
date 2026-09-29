// =====================================================================
// ZENKICKS — settings you fill in once (see README.md, step 2)
// The anon key is safe to publish: the database rules (schema.sql)
// decide what each user can read and write.
// =====================================================================
window.ZK_CONFIG = {
  // Supabase > Project Settings > API
  SUPABASE_URL: '',        // e.g. 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: '',   // the long "anon public" key

  // Sign-in options
  GOOGLE_LOGIN: false,     // true after you enable Google in Supabase > Authentication > Providers
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
