'use client'

import { Button } from "@/components/ui/button"
import { Recycle, AttachMoney, LocalShipping, Phone, Mail, MapPin, MapIcon } from "lucide-react"
import { useEffect } from 'react'

export function ScrappyCar() {
  const phoneNumber = "0800 123 4567"

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-gray-100" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <header className="px-4 lg:px-6 h-16 flex items-center bg-gray-800 text-white shadow-md">
        <a className="flex items-center justify-center" href="#">
          <Recycle className="h-8 w-8 text-teal-400" />
          <span className="ml-2 text-2xl font-medium">Scrappy Car</span>
        </a>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <a className="text-sm font-medium hover:text-teal-400 transition-colors" href="#services">
            Services
          </a>
          <a className="text-sm font-medium hover:text-teal-400 transition-colors" href="#how-it-works">
            How It Works
          </a>
          <a className="text-sm font-medium hover:text-teal-400 transition-colors" href="#areas-served">
            Areas Served
          </a>
          <a className="text-sm font-medium hover:text-teal-400 transition-colors" href="#contact">
            Contact
          </a>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-gray-800">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  Turn Your Clunker into Cash
                </h1>
                <p className="mx-auto max-w-[700px] text-gray-400 md:text-xl">
                  Fast, easy, and eco-friendly scrap car removal. Get paid on the spot!
                </p>
              </div>
              <div className="w-full max-w-sm space-y-2">
                <a href={`tel:${phoneNumber.replace(/\s/g, '')}`} className="w-full sm:hidden">
                  <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white">Call Today</Button>
                </a>
                <div className="hidden sm:block">
                  <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white cursor-default">
                    Call Today: {phoneNumber}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="services" className="w-full py-12 md:py-24 lg:py-32 bg-gray-900">
          <div className="container px-4 md:px-6 mx-auto">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12 text-teal-400">Our Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center p-6 bg-gray-800 rounded-lg shadow-md">
                <LocalShipping className="h-12 w-12 text-teal-400 mb-4" />
                <h3 className="text-xl font-bold mb-2 text-white">Free Car Collection</h3>
                <p className="text-gray-400">We'll pick up your car from anywhere, completely free of charge.</p>
              </div>
              <div className="flex flex-col items-center text-center p-6 bg-gray-800 rounded-lg shadow-md">
                <AttachMoney className="h-12 w-12 text-teal-400 mb-4" />
                <h3 className="text-xl font-bold mb-2 text-white">Instant Cash Payment</h3>
                <p className="text-gray-400">Get paid on the spot when we collect your vehicle.</p>
              </div>
              <div className="flex flex-col items-center text-center p-6 bg-gray-800 rounded-lg shadow-md">
                <Recycle className="h-12 w-12 text-teal-400 mb-4" />
                <h3 className="text-xl font-bold mb-2 text-white">Eco-Friendly Recycling</h3>
                <p className="text-gray-400">We ensure your car is recycled in an environmentally responsible way.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="w-full py-12 md:py-24 lg:py-32 bg-gray-800">
          <div className="container px-4 md:px-6 mx-auto">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12 text-teal-400">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-teal-600 text-white flex items-center justify-center text-2xl font-bold mb-4 shadow-lg">1</div>
                <h3 className="text-xl font-bold mb-2 text-white">Give Us a Call</h3>
                <p className="text-gray-400">Contact us with your car details for an instant quote.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-teal-600 text-white flex items-center justify-center text-2xl font-bold mb-4 shadow-lg">2</div>
                <h3 className="text-xl font-bold mb-2 text-white">Schedule Collection</h3>
                <p className="text-gray-400">Choose a convenient time for us to collect your car.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-teal-600 text-white flex items-center justify-center text-2xl font-bold mb-4 shadow-lg">3</div>
                <h3 className="text-xl font-bold mb-2 text-white">Get Paid</h3>
                <p className="text-gray-400">Receive instant cash payment when we collect your vehicle.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="areas-served" className="w-full py-12 md:py-24 lg:py-32 bg-gray-900">
          <div className="container px-4 md:px-6 mx-auto">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12 text-teal-400">Areas We Serve</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center p-6 bg-gray-800 rounded-lg shadow-md">
                <MapIcon className="h-12 w-12 text-teal-400 mb-4" />
                <h3 className="text-xl font-bold mb-2 text-white">Greater Toronto Area (GTA)</h3>
                <p className="text-gray-400">Serving Toronto and surrounding municipalities.</p>
              </div>
              <div className="flex flex-col items-center text-center p-6 bg-gray-800 rounded-lg shadow-md">
                <MapIcon className="h-12 w-12 text-teal-400 mb-4" />
                <h3 className="text-xl font-bold mb-2 text-white">Barrie</h3>
                <p className="text-gray-400">Covering Barrie and nearby areas.</p>
              </div>
              <div className="flex flex-col items-center text-center p-6 bg-gray-800 rounded-lg shadow-md">
                <MapIcon className="h-12 w-12 text-teal-400 mb-4" />
                <h3 className="text-xl font-bold mb-2 text-white">Mississauga</h3>
                <p className="text-gray-400">Operating throughout Mississauga.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="contact" className="w-full py-12 md:py-24 lg:py-32 bg-gray-800">
          <div className="container px-4 md:px-6 mx-auto">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12 text-teal-400">Contact Us</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center p-6 bg-gray-700 rounded-lg shadow-lg">
                <Phone className="h-12 w-12 mb-4 text-teal-400" />
                <h3 className="text-xl font-bold mb-2 text-white">Phone</h3>
                <p className="text-gray-400">{phoneNumber}</p>
              </div>
              <div className="flex flex-col items-center text-center p-6 bg-gray-700 rounded-lg shadow-lg">
                <Mail className="h-12 w-12 mb-4 text-teal-400" />
                <h3 className="text-xl font-bold mb-2 text-white">Email</h3>
                <p className="text-gray-400">info@scrappycar.com</p>
              </div>
              <div className="flex flex-col items-center text-center p-6 bg-gray-700 rounded-lg shadow-lg">
                <MapPin className="h-12 w-12 mb-4 text-teal-400" />
                <h3 className="text-xl font-bold mb-2 text-white">Address</h3>
                <p className="text-gray-400">123 Scrap Street, Toronto, ON M5V 2T6</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t border-gray-800 bg-gray-900">
        <p className="text-xs text-gray-400">© 2023 Scrappy Car. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <a className="text-xs hover:text-teal-400 transition-colors text-gray-400" href="#">
            Terms of Service
          </a>
          <a className="text-xs hover:text-teal-400 transition-colors text-gray-400" href="#">
            Privacy
          </a>
        </nav>
      </footer>
    </div>
  )
}