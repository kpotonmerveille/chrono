import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import './LeafletIcons';

const COTONOU_CENTER = [6.3654, 2.4183];

function ClickCatcher({ onPick }) {
  useMapEvents({
    click(e) {
      onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function LocationPicker({ value, onChange, height = 220 }) {
  const position = value && value[0] ? value : null;
  return (
    <div>
      <MapContainer
        center={position || COTONOU_CENTER}
        zoom={13}
        style={{ height, width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCatcher onPick={onChange} />
        {position && <Marker position={position} />}
      </MapContainer>
      <p className="text-xs text-slate-500 mt-1">Touchez la carte pour placer le point précis (optionnel mais recommandé pour un tarif exact).</p>
    </div>
  );
}
