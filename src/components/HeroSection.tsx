import React from 'react';
import { Typography, Button, Container } from '@mui/material';

function HeroSection() {
  return (
    <Container maxWidth={false} disableGutters className="flex flex-col justify-center items-center h-screen text-center p-4 bg-gray-900 text-white">
      <Typography variant="h2" gutterBottom>
        Welcome to Scrap Car Services
      </Typography>
      <Typography variant="h5" paragraph>
        Your trusted solution for scrap car removal in Collingwood, Etobicoke, and Scarborough.
      </Typography>
      <Button variant="contained" color="primary" size="large" href="#contact">
        Get a Quote
      </Button>
    </Container>
  );
}

export default HeroSection;