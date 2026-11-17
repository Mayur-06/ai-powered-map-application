import MapWrapper from '@/components/map/MapWrapper';

export default function Home() {
  return (
    <main
      className="relative h-[100dvh] w-screen overflow-hidden"
      style={{ width: '100vw', height: '100dvh', position: 'relative', overflow: 'hidden' }}
    >
      <MapWrapper />
    </main>
  );
}
