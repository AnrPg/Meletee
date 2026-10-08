/* Meletee — public configuration (committed to git, deployed to the website).
   Same Supabase project as noema-lite, so one account works in both apps.
   Never put secrets here: the publishable key is public by design and every
   table is protected by row-level security. */
window.MELETEE_CONFIG = {
  appName: 'Meletee',
  siteUrl: 'https://meletee.netlify.app',
  noemaUrl: 'https://noema-lite.netlify.app',
  supabaseUrl: 'https://awlvbxlpvjkhkreumfln.supabase.co',
  supabaseKey: 'sb_publishable_dsXV2ViLUJV3jOuuctz5ng_MYfQ2H_Z',
};
