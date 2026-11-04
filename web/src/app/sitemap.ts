import type { MetadataRoute } from 'next'

const base = 'https://earshot.keronlabs.com'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/sign-in`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
