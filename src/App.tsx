import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Car, DollarSign, Recycle, Phone, Mail, MapPin } from "lucide-react"


export default function App() {
  return (
    <div className="flex flex-col min-h-screen mx-auto">
      <header className="px-4 lg:px-6 h-14 flex items-center">
        <a className="flex items-center justify-center" href="#">
          <Recycle className="h-6 w-6 text-green-500" />
          <span className="ml-2 text-2xl font-bold text-gray-800">ScrappyCar</span>
        </a>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <a className="text-sm font-medium hover:underline underline-offset-4" href="#services">
            Services
          </a>
          <a className="text-sm font-medium hover:underline underline-offset-4" href="#how-it-works">
            How It Works
          </a>
          <a className="text-sm font-medium hover:underline underline-offset-4" href="#contact">
            Contact
          </a>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-green-100">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  Turn Your Old Car into Cash
                </h1>
                <p className="mx-auto max-w-[700px] text-gray-600 md:text-xl">
                  Fast, easy, and environmentally friendly scrap car removal service. Get paid on the spot!
                </p>
              </div>
              <div className="w-full max-w-sm space-y-2">
                <form className="flex space-x-2">
                  <Input className="max-w-lg flex-1" placeholder="Enter your postcode" type="text" />
                  <Button type="submit">Get a Quote</Button>
                </form>
              </div>
            </div>
          </div>
        </section>
        <section id="services" className="w-full py-12 md:py-24 lg:py-32 bg-white">
          <div className="container px-4 md:px-6">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12">Our Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center">
                <Car className="h-12 w-12 text-green-600 mb-4" />
                <h3 className="text-xl font-bold mb-2">Free Car Collection</h3>
                <p className="text-gray-600">We&apos;ll pick up your car from anywhere, completely free of charge.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <DollarSign className="h-12 w-12 text-green-600 mb-4" />
                <h3 className="text-xl font-bold mb-2">Instant Cash Payment</h3>
                <p className="text-gray-600">Get paid on the spot when we collect your vehicle.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <Recycle className="h-12 w-12 text-green-600 mb-4" />
                <h3 className="text-xl font-bold mb-2">Eco-Friendly Recycling</h3>
                <p className="text-gray-600">We ensure your car is recycled in an environmentally responsible way.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="w-full py-12 md:py-24 lg:py-32 bg-gray-100">
          <div className="container px-4 md:px-6">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl font-bold mb-4">1</div>
                <h3 className="text-xl font-bold mb-2">Request a Quote</h3>
                <p className="text-gray-600">Enter your postcode and car details for an instant quote.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl font-bold mb-4">2</div>
                <h3 className="text-xl font-bold mb-2">Schedule Collection</h3>
                <p className="text-gray-600">Choose a convenient time for us to collect your car.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl font-bold mb-4">3</div>
                <h3 className="text-xl font-bold mb-2">Get Paid</h3>
                <p className="text-gray-600">Receive instant cash payment when we collect your vehicle.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="contact" className="w-full py-12 md:py-24 lg:py-32 bg-green-600 text-white">
          <div className="container px-4 md:px-6">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12">Contact Us</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center">
                <Phone className="h-12 w-12 mb-4" />
                <h3 className="text-xl font-bold mb-2">Phone</h3>
                <p>0800 123 4567</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <Mail className="h-12 w-12 mb-4" />
                <h3 className="text-xl font-bold mb-2">Email</h3>
                <p>info@scrapease.com</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <MapPin className="h-12 w-12 mb-4" />
                <h3 className="text-xl font-bold mb-2">Address</h3>
                <p>123 Scrap Street, Recycling City, RC1 2DE</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-gray-500">© 2023 ScrapEase. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <a className="text-xs hover:underline underline-offset-4 text-gray-500" href="#">
            Terms of Service
          </a>
          <a className="text-xs hover:underline underline-offset-4 text-gray-500" href="#">
            Privacy
          </a>
        </nav>
      </footer>
    </div>
  )
}