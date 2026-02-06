import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

import { SpeedInsights } from "@vercel/speed-insights/react";
import { defineCustomElements } from '@ionic/pwa-elements/loader';

// Initialize PWA elements for camera support in web browser
defineCustomElements(window);


const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <SpeedInsights />
    </HashRouter>
  </React.StrictMode>
);