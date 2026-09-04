import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Home Dashboard',
    short_name: 'Home',
    description: 'A calm shared dashboard for the household.',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#f6f5f1',
    theme_color: '#f6f5f1',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
