import Hero from "./_components/Hero";
import Stats from "./_components/Stats";
import TikTokGrid from "./_components/TikTokGrid";
import Barbers from "./_components/Barbers";
import Services from "./_components/Services";
import Booking from "./_components/Booking";
import Location from "./_components/Location";
import Footer from "./_components/Footer";
import StickyBar from "./_components/StickyBar";

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
