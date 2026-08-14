import { defineConfig, defineDocs, frontmatterSchema, metaSchema } from 'fumadocs-mdx/config';

// You can customize Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const { docs, meta } = defineDocs();

export default defineConfig({
  mdxOptions: {
    // MDX options
  },
});
