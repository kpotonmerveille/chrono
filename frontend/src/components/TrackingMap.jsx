import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { pickupIcon, dropoffIcon, livreurIcon } from './LeafletIcons';

const COTONOU_CENTER = [6.3654, 2.4183];

export default function TrackingMap({ delivery, livreurPosition, height = 260 }) {
  const pickup = delivery.pickup_lat && delivery.pickup_lng ? [delivery.pickup_lat, delivery.pickup_lng] : null;
  const dropoff = delivery.dropoff_lat && delivery.dropoff_lng ? [delivery.dropoff_lat, delivery.dropoff_lng] : null;
  const livreur = livreurPosition ? [livreurPosition.lat, livreurPosition.lng] : null;
  const points = [pickup, dropoff].filter(Boolean);
  const center = livreur || pickup || dropoff || COTONOU_CENTER;

  if (!pickup && !dropoff) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 text-slate-400 text-sm flex items-center justify-center" style={{ height }}>
        Localisation non précisée pour cette livraison
      </div>
    );
  }

  return (
    <div>
      <MapContainer center={center} zoom={13} style={{ height, width: '100%' }} scrollWheelZoom={false}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {pickup && <Marker position={pickup} icon={pickupIcon}><Popup>Point de retrait<br />{delivery.pickup_address}</Popup></Marker>}
        {dropoff && <Marker position={dropoff} icon={dropoffIcon}><Popup>Point de livraison<br />{delivery.dropoff_address}</Popup></Marker>}
        {points.length === 2 && <Polyline positions={points} pathOptions={{ color: '#e07a2c', dashArray: '6 8' }} />}
        {livreur && <Marker position={livreur} icon={livreurIcon}><Popup>Position du livreur (en direct)</Popup></Marker>}
      </MapContainer>
      {livreurPosition && (
        <p className="text-[11px] text-slate-400 mt-1">
          📍 Position du livreur mise à jour {new Date(livreurPosition.at).toLocaleTimeString('fr-FR')}
        </p>
      )}
    </div>
  );
}
