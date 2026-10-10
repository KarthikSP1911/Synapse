import PracticeSetup from "@/components/practice-setup";

export default function Home() {
  return (
    <div className="container py-8 sm:py-10">
      <h1 className="sr-only">Start a practice session</h1>
      <PracticeSetup />
    </div>
  );
}
