import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://siendo-otp.vercel.app',
  // Keep Astro 5's whitespace behavior: v7's new default ('jsx') strips the
  // spaces between inline elements that this site's markup relies on.
  compressHTML: true,
});
