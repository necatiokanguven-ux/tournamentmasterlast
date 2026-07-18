import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import TrackingView from './components/TrackingView.tsx';
import DealerShell from './dealer/DealerShell.tsx';
import FloorView from './floor/FloorView.tsx';
import './index.css';

const pathname = window.location.pathname;

function RootApp() {
  if (pathname === '/track' || pathname.startsWith('/track/')) {
    return <TrackingView />;
  }

  if (pathname.startsWith('/dealer')) {
    return <DealerShell />;
  }

  if (pathname.startsWith('/floor')) {
    return <FloorView />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
