import Image from 'next/image'
import { Package } from 'lucide-react'
import type { Media } from '@/payload-types'
import { cn } from '@/lib/utils'

export function ItemImage({
  image,
  name,
  className,
  sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw',
}: {
  image: Media | null
  name: string
  className?: string
  sizes?: string
}) {
  return (
    <div
      className={cn(
        'relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-md bg-muted',
        className,
      )}
    >
      {image?.url ? (
        <Image src={image.url} alt={image.alt} fill sizes={sizes} className="object-contain p-3" />
      ) : (
        <div role="img" aria-label={`Нет изображения: ${name}`}>
          <Package aria-hidden="true" className="size-9 text-muted-foreground/50" />
        </div>
      )}
    </div>
  )
}
