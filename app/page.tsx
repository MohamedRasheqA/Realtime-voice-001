'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../components/App'), { 
  ssr: false,
  loading: () => <p>Loading application...</p>
});

export default function Home() {
  return <App />;
}
