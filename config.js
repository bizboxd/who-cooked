// Who Cooked configuration. Everything in here is safe to be public.
//
// SUPABASE_*: the shared league database (accounts, games, ratings).
//   Leave both empty to run in demo mode (everything saved in this browser only).
// REVENUECAT_*: public SDK keys for Pro.
//   Leave empty and payments stay off.
window.BUT_CONFIG = {
  SUPABASE_URL: "https://majmjuxulvqcjdfumswv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_UCfMJ2v_xnT2Y-WBla_IxA_k6IrXK5j",

  // Sign-in options. Turn one on only after its provider is set up in Supabase (see README).
  AUTH: {
    APPLE_IOS: true,  // native Sign in with Apple in the iPhone app (Supabase Apple provider: client ID = bundle ID)
    APPLE_WEB: false, // needs an Apple Services ID + key in Supabase
    GOOGLE: true,     // Google Cloud project "Who Cooked" (besu@bizboxd.com), web client in Supabase
    PHONE: false,     // needs an SMS provider (e.g. Twilio) in Supabase
  },

  REVENUECAT_IOS_KEY: "", // appl_...  (RevenueCat > Project > API keys > Apple App Store)
  REVENUECAT_WEB_KEY: "", // rcb_...   (RevenueCat > Project > API keys > Web Billing)
  REVENUECAT_ENTITLEMENT: "pro",

  // Ads for free players (Pro hides them). Leave empty to keep ads off.
  ADSENSE_CLIENT: "", // ca-pub-...      (Google AdSense, website)
  ADSENSE_SLOT: "",   // ad unit slot id (Google AdSense, website)
  ADMOB_BANNER_ID: "", // ca-app-pub-.../... (Google AdMob banner unit, iPhone app)
};
