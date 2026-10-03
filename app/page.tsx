import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Marquee from "./components/Marquee";
import Stats from "./components/Stats";
import Reels from "./components/Reels";
import Barbers from "./components/Barbers";
import Services from "./components/Services";
import Booking from "./components/Booking";
import Location from "./components/Location";
import Footer from "./components/Footer";
import FloatingCTA from "./components/FloatingCTA";
import RevealRoot from "./components/RevealRoot";
import ScrollManager from "./components/ScrollManager";

export default function Home() {
  return (
    <>
      <div className="ambient" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="grain" aria-hidden />
      <Nav />
      <main className="page">
        <Hero />
        <Marquee />
        <Stats />
        <Reels />
        <Barbers />
        <Services />
        <Booking />
        <Location />
      </main>
      <div className="page">
        <Footer />
      </div>
      <FloatingCTA />
      <RevealRoot />
      <ScrollManager />
    </>
  );
}
