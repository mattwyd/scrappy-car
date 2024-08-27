import { Container, Grid, Paper, Typography } from '@mui/material';

function FeaturesSection() {
  return (
    <Container maxWidth={false} disableGutters className="py-16 bg-gray-800 text-white h-screen flex flex-col justify-center items-center">
      <Typography variant="h4" gutterBottom align="center">
        Our Services
      </Typography>
      <Grid container spacing={4} className="w-full max-w-screen-lg">
        <Grid item xs={12} sm={6} md={4}>
          <Paper className="p-4 bg-gray-700 h-full flex flex-col justify-center items-center" elevation={3}>
            <Typography variant="h6" gutterBottom>
              Service 1
            </Typography>
            <Typography>
              Details about service 1.
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Paper className="p-4 bg-gray-700 h-full flex flex-col justify-center items-center" elevation={3}>
            <Typography variant="h6" gutterBottom>
              Service 2
            </Typography>
            <Typography>
              Details about service 2.
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Paper className="p-4 bg-gray-700 h-full flex flex-col justify-center items-center" elevation={3}>
            <Typography variant="h6" gutterBottom>
              Service 3
            </Typography>
            <Typography>
              Details about service 3.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

export default FeaturesSection;