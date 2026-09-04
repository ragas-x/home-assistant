import type { Metadata } from 'next';
import { Anek_Kannada, Noto_Sans_Kannada } from 'next/font/google';
import './globals.css';

const notoKannada = Noto_Sans_Kannada({
  variable: '--font-noto-kannada',
  subsets: ['kannada', 'latin'],
  weight: 'variable',
  display: 'swap',
});

const anekKannada = Anek_Kannada({
  variable: '--font-anek-kannada',
  subsets: ['kannada', 'latin'],
  weight: 'variable',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  title: 'Home Dashboard',
  description:
    'A calm shared dashboard for meals, shopping, reminders and daily household rhythm.',
  applicationName: 'Home Dashboard',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Home' },
  openGraph: {
    title: 'Home Dashboard',
    description: 'Meals, shopping, Panchanga and intelligent reminders in one calm household dashboard.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Home Dashboard',
    description: 'Meals, shopping, Panchanga and intelligent reminders in one calm household dashboard.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-IN"
      className={`${notoKannada.variable} ${anekKannada.variable}`}
    >
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
