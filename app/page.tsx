import Nav from "./components/Nav";
import CinematicIntro from "./components/CinematicIntro";
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
import { getServices } from "@/lib/services";

// Rendu à chaque visite : les prix / packs changés depuis /barber sont en ligne tout de suite.
export const dynamic = "force-dynamic";

export default async function Home() {
  const services = await getServices();
  return (
    <>
      <div className="ambient" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="grain" aria-hidden />
      <Nav />
      <CinematicIntro />
      <main className="page">
        <Hero />
        <Marquee />
        <Stats />
        <Reels />
        <Barbers />
        <Services services={services} />
        <Booking services={services} />
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
