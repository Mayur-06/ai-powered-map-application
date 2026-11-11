import MapWrapper from '@/components/map/MapWrapper';

export default function Home() {
  return (
    <main
      className="relative h-screen w-screen overflow-hidden"
      style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}
    >
      <MapWrapper />
    </main>
  );
}
