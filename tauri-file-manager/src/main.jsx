import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SplashScreen from './SplashScreen';
import { useTrayAnimation } from './useTrayAnimation';
import './index.css';

function Root() {
  const [splashDone, setSplashDone] = useState(false);
  useTrayAnimation();

  return (
    <>
      {!splashDone && <SplashScreen onFinish={() => setSplashDone(true)} />}
      {splashDone && <App />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
