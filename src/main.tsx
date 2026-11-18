import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './Root';
import { loadLibrary } from './data/exercises';
import './index.css';

loadLibrary().finally(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
));
