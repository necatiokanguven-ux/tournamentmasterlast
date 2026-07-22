import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import TrackingView from './components/TrackingView.tsx';
import DealerShell from './dealer/DealerShell.tsx';
import FloorView from './floor/FloorView.tsx';
import VenueDisplayView from './components/VenueDisplayView.tsx';
import './index.css';

function getAppPathname(): string {
  const { pathname } = window.location;
  if (pathname === '/app' || pathname === '/app/') {
    return '/';
  }
  if (pathname.startsWith('/app/')) {
    return pathname.slice(4);
  }
  return pathname;
}

const pathname = getAppPathname();

function RootApp() {
  if (pathname === '/track' || pathname.startsWith('/track/')) {
    return <TrackingView />;
  }

  if (pathname.startsWith('/dealer')) {
    return <DealerShell />;
  }

  if (pathname.startsWith('/floor') || pathname === '/f' || pathname.startsWith('/f/')) {
    return <FloorView />;
  }

  if (pathname === '/display' || pathname.startsWith('/display/')) {
    return <VenueDisplayView />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
