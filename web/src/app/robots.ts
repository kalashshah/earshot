import type { MetadataRoute } from 'next'

const disallow = ['/api/', '/app-link']
const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Google-Extended', 'Bingbot']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow }, ...aiBots.map((userAgent) => ({ userAgent, allow: '/', disallow }))],
    sitemap: 'https://earshot.keronlabs.com/sitemap.xml',
  }
}
