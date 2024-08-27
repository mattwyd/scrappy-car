import React from 'react';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import FeaturesSection from './components/FeaturesSection';
import Footer from './components/Footer';

function App() {
  return (
    <div className="h-screen overflow-hidden">
      <Header />
      <HeroSection />
      <FeaturesSection />
      <Footer />
    </div>
  );
}

export default App;