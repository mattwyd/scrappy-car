import { Container, Typography } from '@mui/material';

function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-4 flex justify-center items-center">
      <Container maxWidth="lg">
        <Typography align="center">
          &copy; 2024 Scrap Car Company. All rights reserved.
        </Typography>
      </Container>
    </footer>
  );
}

export default Footer;