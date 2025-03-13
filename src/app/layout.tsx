import '@/styles/globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import StylesLoadedMarker from '@/components/StylesLoadedMarker';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',  // Prevent layout shift with fonts
  preload: true,    // Prioritize font loading
});

export const metadata: Metadata = {
  title: 'Perforce Friend',
  description: 'A web client for Perforce version control',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <main className="min-h-screen">
          {children}
        </main>
        <StylesLoadedMarker />
      </body>
    </html>
  );
} 