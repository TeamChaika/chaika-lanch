'use client';

import { useState } from 'react';
import manifest from '@/data/image-manifest.json';
import hosting from '@/data/image-hosting.json';
import type { ImageVariant } from '@/data/menu';

export type FoodImageSource = string;

type Props = {
  src: FoodImageSource;
  alt: string;
  variants?: ImageVariant[];
  width: number;
  height: number;
  sizes: string;
  className?: string;
  eager?: boolean;
  desktopOnly?: boolean;
};

const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

// Bundled and uploaded photos share the same responsive WebP format.
export function FoodImage({ src, variants: uploadedVariants, alt, width, height, sizes, className, eager = false, desktopOnly = false }: Props) {
  const [localFallback, setLocalFallback] = useState(false);
  const bundled = Object.hasOwn(manifest, src) ? manifest[src as keyof typeof manifest] : undefined;
  const variants = uploadedVariants ?? bundled ?? manifest['/images/lunch-photo-029.webp'];
  const base = localFallback ? '' : hosting.baseUrl;
  const srcSet = variants.map((variant) => `${base}${variant.path} ${variant.width}w`).join(', ');
  const fallback = variants.find((variant) => variant.width >= 640) ?? variants[variants.length - 1];
  const props = {
    width, height, sizes, className,
    loading: eager ? 'eager' as const : 'lazy' as const,
    decoding: 'async' as const,
    fetchPriority: eager ? 'high' as const : 'auto' as const,
    onError: () => { if (bundled && !localFallback) setLocalFallback(true); },
    // The server-rendered hero can fail before React attaches onError.
    ref: (image: HTMLImageElement | null) => {
      if (image?.complete && image.naturalWidth === 0 && bundled && !localFallback) setLocalFallback(true);
    },
  };

  // A media source prevents the hidden desktop hero from downloading on phones.
  if (desktopOnly) return <picture><source media="(min-width: 701px)" type="image/webp" srcSet={srcSet} sizes={sizes} /><img {...props} alt={alt} src={transparentPixel} /></picture>;
  // eslint-disable-next-line @next/next/no-img-element -- Responsive WebP files are generated locally and hosted on S3.
  return <img {...props} alt={alt} src={`${base}${fallback.path}`} srcSet={srcSet} />;
}
