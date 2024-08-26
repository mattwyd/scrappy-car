import { useState } from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="header">
        <h1>Scrappy Car</h1>
        <p>Your trusted service for moving and scrapping cars.</p>
      </header>

      <main>
        <section className="about-us">
          <h2>About Us</h2>
          <p>
            At Scrappy Car, we provide reliable and cost-effective solutions for moving and scrapping your vehicles.
            Our team of experts ensures a hassle-free experience, whether you need to transport a scrap car or get rid
            of an old vehicle.
          </p>
        </section>

        <section className="service-locations">
          <h2>Service Locations</h2>
          <ul>
            <li>Toronto, ON</li>
            <li>Mississauga, ON</li>
            <li>Brampton, ON</li>
            <li>Oakville, ON</li>
            <li>Hamilton, ON</li>
          </ul>
        </section>

        <section className="contact-info">
          <h2>Contact Us</h2>
          <p>
            <strong>Phone:</strong> +1 (123) 456-7890
          </p>
          <p>
            <strong>Email:</strong> contact@scrappycar.com
          </p>
          <p>
            <strong>Address:</strong> 1234 Car Lane, Toronto, ON, Canada
          </p>
        </section>
      </main>

      <footer>
        <p>&copy; 2024 Scrappy Car. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;