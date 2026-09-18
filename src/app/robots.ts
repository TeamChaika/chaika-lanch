import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/payment/', '/api/'] },
    sitemap: 'https://lunch.chaika.team/sitemap.xml',
  };
}
