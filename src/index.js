import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './team-colors.css';
import reportWebVitals from './reportWebVitals';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);

// replace with React.StrictMode if you want
// disabled to avoid doubled api calls

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
