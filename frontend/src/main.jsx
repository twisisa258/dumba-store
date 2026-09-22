import React from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider } from './i18n.jsx';
import { AlertProvider } from './alerts.jsx';
import { CartProvider } from './cart.jsx';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider>
      <AlertProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </AlertProvider>
    </LangProvider>
  </React.StrictMode>
);
