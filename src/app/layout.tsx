import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'IROP Agent Prototype',
  description: 'Irregular operations recovery copilot for airport staffing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
