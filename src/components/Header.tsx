import React from 'react';
import { AppBar, Toolbar, Typography, Button } from '@mui/material';

function Header() {
  return (
    <AppBar position="static" className="bg-gray-800">
      <Toolbar>
        <Typography variant="h6" className="flex-grow">
          Scrap Car Company
        </Typography>
        <Button color="inherit" href="#about" className="ml-4">About Us</Button>
        <Button color="inherit" href="#services" className="ml-4">Services</Button>
        <Button color="inherit" href="#contact" className="ml-4">Contact</Button>
      </Toolbar>
    </AppBar>
  );
}

export default Header;