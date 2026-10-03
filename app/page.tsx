import Hero from "./components/Hero";
import Stats from "./components/Stats";
import TikTokGrid from "./components/TikTokGrid";
import Barbers from "./components/Barbers";
import Services from "./components/Services";
import Booking from "./components/Booking";
import Location from "./components/Location";
import Footer from "./components/Footer";
import StickyBar from "./components/StickyBar";

export default function Home() {
  return (
    <main>
      <Hero />
      <Stats />
      <div className="barber-pole" aria-hidden />
      <TikTokGrid />
      <Barbers />
      <div className="barber-pole" aria-hidden />
      <Services />
      <Booking />
      <div className="barber-pole" aria-hidden />
      <Location />
      <Footer />
      <StickyBar />
    </main>
  );
}
