import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import 'leaflet/dist/leaflet.css';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

import { SpeedInsights } from "@vercel/speed-insights/react";

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
      <SpeedInsights />
    </HashRouter>
  </React.StrictMode>
);