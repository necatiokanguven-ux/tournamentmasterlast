import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import TrackingView from './components/TrackingView.tsx';
import './index.css';

const isTrackingPage = window.location.pathname === '/track' || window.location.pathname.startsWith('/track/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isTrackingPage ? <TrackingView /> : <App />}
  </StrictMode>,
);
