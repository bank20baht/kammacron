import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'
import { isStickerName } from '@20baht/stickers/load'

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /** A guide's one sticker, beside its title (components/PageTitle.astro); a name not in the set fails the build. */
        sticker: z
          .string()
          .refine(isStickerName, { error: 'not a @20baht/stickers name' })
          .optional(),
      }),
    }),
  }),
}
