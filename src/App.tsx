import { Button } from "@/components/ui/button"
import { Car, DollarSign, Recycle, Phone, MapPin, Banknote, Mail } from "lucide-react"

const phone_number: string = "+1 (647) 204-4200";
const email_address: string = "quote@scrappycar.ca";

export default function App() {
  return (
    <div className="flex flex-col min-h-screen mx-auto">
      <header className="px-4 lg:px-6 h-14 flex items-center">
        <a className="flex items-center justify-center" href="#">
          <Recycle className="h-6 w-6 text-green-500" />
          <span className="ml-2 text-2xl font-bold text-gray-800">Scrappy Car</span>
        </a>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <a className="hidden sm:block text-sm font-medium hover:underline underline-offset-4" href="#services">
            Services
          </a>
          <a className="hidden sm:block text-sm font-medium hover:underline underline-offset-4" href="#how-it-works">
            How It Works
          </a>
          <a className="hidden sm:block text-sm font-medium hov er:underline underline-offset-4" href="#areas">
            Areas We Serve
          </a>
          <a className="hidden sm:block text-sm font-medium hover:underline underline-offset-4" href="#contact">
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
                <p className="mx-auto max-w-[700px] text-gray-600 md:text-xl flex items-center justify-center">
                Fast, easy, and environmentally friendly scrap car removal service. Get paid on the spot!
                </p>
              </div>
              <div className="w-full max-w-sm space-y-2">
                <Button 
                  onClick={() => window.location.href = `tel:${phone_number}`}
                  className="w-full"
                >
                  <Phone className="mr-2 h-4 w-4" /> Call Now: {phone_number}
                </Button>
                <p className="text-sm text-gray-500">or</p>
                <Button 
                  onClick={() => window.location.href = `mailto:${email_address}?subject=Car%20Quote%20Request&body=Please%20attach%20photos%20of%20your%20car%20for%20a%20quote.`}
                  variant="outline"
                  className="w-full"
                >
                  <Mail className="mr-2 h-4 w-4" /> Email Photos for Quote
                </Button>
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
                <h3 className="text-xl font-bold mb-2">Free Car Removal</h3>
                <p className="text-gray-600">We'll pick up your car from anywhere in the area, free of charge.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <DollarSign className="h-12 w-12 text-green-600 mb-4" />
                <h3 className="text-xl font-bold mb-2">Best Cash Offers</h3>
                <p className="text-gray-600">Get the best value for your scrap car with our competitive pricing.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <Recycle className="h-12 w-12 text-green-600 mb-4" />
                <h3 className="text-xl font-bold mb-2">Hassle-Free Process</h3>
                <p className="text-gray-600">We handle all the paperwork and make the process quick and easy.</p>
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
                <h3 className="text-xl font-bold mb-2">Contact Us</h3>
                <p className="text-gray-600">Call us or email photos for a quick, no-obligation quote.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl font-bold mb-4">2</div>
                <h3 className="text-xl font-bold mb-2">Schedule Pickup</h3>
                <p className="text-gray-600">Choose a convenient time for us to collect your car.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl font-bold mb-4">3</div>
                <h3 className="text-xl font-bold mb-2">Get Paid</h3>
                <p className="text-gray-600">Receive cash on the spot when we collect your vehicle.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="areas" className="w-full py-12 md:py-24 lg:py-32 bg-green-600 text-white">
          <div className="container px-4 md:px-6">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12">Areas We Serve</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center">
                <MapPin className="h-12 w-12 mb-4" />
                <h3 className="text-xl font-bold mb-2">Toronto (GTA)</h3>
                <p>Greater Toronto Area</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <MapPin className="h-12 w-12 mb-4" />
                <h3 className="text-xl font-bold mb-2">Barrie</h3>
                <p>Simcoe County</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <MapPin className="h-12 w-12 mb-4" />
                <h3 className="text-xl font-bold mb-2">Mississauga</h3>
                <p>Peel Region</p>
              </div>
            </div>
          </div>
        </section>
        <section id="contact" className="w-full py-12 md:py-24 lg:py-32 bg-white">
          <div className="container px-4 md:px-6">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12">Contact Us</h2>
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">Get in Touch</h3>
                <p className="text-gray-600">Have questions or ready to sell your car? Reach out to us!</p>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <div className="flex items-center space-x-2">
                  <Phone className="h-5 w-5 text-green-600" />
                  <span>{phone_number}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Mail className="h-5 w-5 text-green-600" />
                  <span>{email_address}</span>
                </div>
              </div>
              <Button 
                onClick={() => window.location.href = `tel:${phone_number}`}
                className="mt-4"
              >
                Call Us Now
              </Button>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-gray-500">© 2023 Scrappy Car. All rights reserved.</p>
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