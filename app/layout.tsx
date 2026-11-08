import type { Metadata } from 'next';
import './globals.css';
import {Suspense} from 'react';
import WorkhubShell from '@/components/workhub-shell';
export const metadata: Metadata = { robots:{index:false,follow:false}, title: 'Aces Intelligence Workhub', description: 'One workspace for your team’s tasks, time, and projects. Built for Aces Intelligence.', icons: { icon: '/favicon.svg?v=2', apple: '/aces-logo.svg' } };
export default function RootLayout({ children }: {
    children: React.ReactNode;
}) { return <html lang="en"><body><Suspense fallback={<main>Opening Workhub…</main>}><WorkhubShell>{children}</WorkhubShell></Suspense></body></html>; }
