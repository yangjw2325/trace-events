import './globals.css';
import {Suspense} from 'react';
import ResearchApp from './research-app';
export const metadata={title:'溯源 · 投资事件与证据时间线',description:'追踪投资事件，查清每次变化'};
export default function Layout({children}){return <html lang="zh-CN"><body><Suspense fallback={<main className="wrap">正在读取事件…</main>}><ResearchApp/></Suspense>{children}</body></html>}
