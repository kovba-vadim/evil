import Image from 'next/image'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { Homepage } from '@/payload-types'

export function HomepageContent({ homepage }: { homepage: Homepage }) {
  const image = homepage.image && typeof homepage.image === 'object' ? homepage.image : null

  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{homepage.title}</h1>
      {homepage.description && (
        <RichText data={homepage.description} className="homepage-richtext" />
      )}
      {image?.url && (
        <Image
          src={image.url}
          alt={image.alt}
          width={image.width ?? 1200}
          height={image.height ?? 800}
          sizes="(min-width: 1024px) 768px, 100vw"
          className="h-auto w-full rounded-lg"
        />
      )}
    </article>
  )
}
