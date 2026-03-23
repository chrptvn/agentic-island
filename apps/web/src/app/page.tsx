import Hero from "@/components/home/Hero";
import Features from "@/components/home/Features";
import HowItWorks from "@/components/home/HowItWorks";
import LiveWorldsPreview from "@/components/home/LiveWorldsPreview";
import OpenSourceCTA from "@/components/home/OpenSourceCTA";

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <LiveWorldsPreview />
      <OpenSourceCTA />
    </>
  );
}
