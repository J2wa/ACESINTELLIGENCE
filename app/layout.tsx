import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Aces Intelligence Workhub', description: 'One workspace for your team’s tasks, time, and projects. Built for Aces Intelligence.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: {
    children: React.ReactNode;
}) { return <html lang="en"><body>{children}</body></html>; }
