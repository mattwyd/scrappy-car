import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import './index.css'; // Import TailwindCSS styles
import { ThemeProvider } from '@mui/material/styles';
import theme from './theme';

ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById('root')
);