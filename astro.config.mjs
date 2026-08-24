import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';

/**
 * Los enlaces a otras webs escritos en las notas de un episodio se abren en
 * otra pestaña, para no sacar a nadie del archivo a mitad de lectura. Los
 * internos siguen navegando en la misma.
 */
const enlacesExternosAOtraPestana = {
  name: 'enlaces-externos-a-otra-pestana',
  element: {
    filter: ['a'],
    visit(nodo, ctx) {
      const href = String(nodo.properties?.href ?? '');
      if (!/^https?:\/\//i.test(href) || href.includes('siendo-otp.vercel.app')) return;
      ctx.setProperty(nodo, 'target', '_blank');
      ctx.setProperty(nodo, 'rel', 'noopener');
    },
  },
};

export default defineConfig({
  site: 'https://siendo-otp.vercel.app',
  markdown: {
    processor: satteri({ hastPlugins: [enlacesExternosAOtraPestana] }),
  },
  // Keep Astro 5's whitespace behavior: v7's new default ('jsx') strips the
  // spaces between inline elements that this site's markup relies on.
  compressHTML: true,
});
