import L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

export const pickupIcon = new L.Icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: 'hue-rotate-icon-pickup',
});

export const dropoffIcon = new L.Icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Position en direct du livreur (zem) pendant la course
export const livreurIcon = new L.DivIcon({
  html: '<div style="font-size:24px; line-height:1; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));">🏍️</div>',
  className: 'livreur-marker-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
