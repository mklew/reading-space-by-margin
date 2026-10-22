import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata={title:'Margin — A place for your reading',description:'Save articles, follow feeds, and make room to read.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Margin',statusBarStyle:'default'}};
export const viewport: Viewport={width:'device-width',initialScale:1,themeColor:'#f7f8f6'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
