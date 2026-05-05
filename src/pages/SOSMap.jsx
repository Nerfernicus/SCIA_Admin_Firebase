import { db } from "../lib/firebase";
import { collection, onSnapshot, orderBy, query, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import React, { useState, useEffect } from 'react';
import { MapPin, Crosshair, CheckCircle2, AlertTriangle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapController({ centerPosition }) {
    const map = useMap();
    React.useEffect(() => {
        if (centerPosition) map.flyTo(centerPosition, 16, { duration: 1.5 });
    }, [centerPosition, map]);
    return null;
}

const criticalIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;">
             <div style="position:absolute;width:100%;height:100%;background:#ef4444;border-radius:50%;animation:ping 1s cubic-bezier(0,0,0.2,1) infinite;opacity:0.5;"></div>
             <div style="width:16px;height:16px;background:#dc2626;border:2px solid white;border-radius:50%;z-index:10;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
           </div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
});

const dispatchedIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;">
             <div style="position:absolute;width:100%;height:100%;background:#f97316;border-radius:50%;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;opacity:0.4;"></div>
             <div style="width:16px;height:16px;background:#ea580c;border:2px solid white;border-radius:50%;z-index:10;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
           </div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
});

const myLocationIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;">
             <div style="position:absolute;width:100%;height:100%;background:#3b82f6;border-radius:50%;animation:ping 1s cubic-bezier(0,0,0.2,1) infinite;opacity:0.4;"></div>
             <div style="width:16px;height:16px;background:#2563eb;border:2px solid white;border-radius:50%;z-index:10;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
           </div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
});

export default function SOSMap() {
    const [myLocation, setMyLocation] = useState(null);
    const [isLocating, setIsLocating] = useState(false);
    // Listen to BOTH "emergencies" (mobile FE collection) AND legacy "sos_events"
    const [liveAlerts, setLiveAlerts] = useState([]);
    const mapCenter = [14.7080, 120.9860];

    useEffect(() => {
        // Primary: "emergencies" collection written by mobile app sendSOSAlert()
        const qEmergencies = query(collection(db, "emergencies"), orderBy("createdAt", "desc"));
        const unsubEmergencies = onSnapshot(qEmergencies, (snapshot) => {
            const alerts = snapshot.docs.map(d => ({ id: d.id, _source: 'emergencies', ...d.data() }));
            setLiveAlerts(prev => {
                const filtered = prev.filter(a => a._source !== 'emergencies');
                return [...alerts, ...filtered];
            });
        });

        return () => unsubEmergencies();
    }, []);

    const handleDispatch = async (alertId, source) => {
        const collName = source || 'emergencies';
        await updateDoc(doc(db, collName, alertId), {
            status: "dispatched",
            dispatchedAt: serverTimestamp(),
        });
    };

    const handleResolve = async (alertId, source) => {
        const collName = source || 'emergencies';
        await updateDoc(doc(db, collName, alertId), {
            status: "resolved",
            resolvedAt: serverTimestamp(),
        });
    };

    const handleLocateMe = () => {
        if (!('geolocation' in navigator)) { alert("Geolocation is not supported by your browser"); return; }
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            ({ coords: { latitude, longitude } }) => { setMyLocation([latitude, longitude]); setIsLocating(false); },
            (error) => { console.error(error); alert("Could not get your location."); setIsLocating(false); },
            { enableHighAccuracy: true }
        );
    };

    const latestPendingAlert = liveAlerts.find(a => a.status === 'pending' && a.latitude && a.longitude);
    const mapFocusTarget = myLocation ?? (latestPendingAlert ? [latestPendingAlert.latitude, latestPendingAlert.longitude] : null);
    const activeCount = liveAlerts.filter(a => a.status !== 'resolved').length;

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden font-sans bg-white">
            <div className="bg-white border-b border-gray-100 px-6 py-4 flex-none z-2000">
                <h1 className="text-2xl font-bold text-gray-900">SOS Map</h1>
                <p className="text-sm text-gray-500">Real-time emergency alerts in Valenzuela City</p>
            </div>

            <div className="relative flex-1 w-full bg-blue-50/20">
                <div className="absolute inset-0 z-0">
                    <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapController centerPosition={mapFocusTarget} />
                        {liveAlerts
                            .filter(a => a.status !== 'resolved' && a.latitude != null && a.longitude != null)
                            .map(alert => (
                                <Marker key={alert.id} position={[alert.latitude, alert.longitude]}
                                    icon={alert.status === 'pending' ? criticalIcon : dispatchedIcon}>
                                    <Popup className="font-sans" minWidth={200}>
                                        <div className="space-y-1">
                                            <p className="font-bold text-base">{alert.name}</p>
                                            <p className="text-red-600 font-semibold text-sm">{alert.emergencyType}</p>
                                            <p className="text-gray-600 text-sm">{alert.barangay}</p>
                                            <p className="text-gray-500 text-xs">{alert.address}</p>
                                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${
                                                alert.status === 'pending' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'
                                            }`}>{alert.status}</span>
                                            <div className="flex gap-2 mt-2">
                                                <a href={`https://maps.google.com/?q=${alert.latitude},${alert.longitude}`}
                                                    target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                                                    Open in Google Maps
                                                </a>
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        {myLocation && (
                            <Marker position={myLocation} icon={myLocationIcon}>
                                <Popup className="font-sans font-bold">Your Current Location</Popup>
                            </Marker>
                        )}
                        <ZoomControl position="bottomleft" />
                    </MapContainer>
                </div>

                <div className="absolute bottom-8 left-6 flex flex-col gap-3 z-1000">
                    <button onClick={handleLocateMe} disabled={isLocating}
                        className={`bg-white/90 backdrop-blur p-3 rounded-2xl shadow-lg border border-gray-100 transition-colors ${
                            isLocating ? 'text-gray-400 cursor-not-allowed' : 'text-[#0f52ba] hover:bg-gray-50'
                        }`} title="Locate me">
                        <Crosshair size={20} className={isLocating ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="absolute top-6 right-6 w-100 max-h-[calc(100vh-200px)] overflow-y-auto bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white p-5 z-1000 hidden sm:block hide-scrollbar">
                    <div className="flex justify-between items-start mb-5">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Live Alerts</h2>
                            <p className="text-sm text-gray-500 font-medium mt-0.5">
                                {activeCount} Active {activeCount === 1 ? 'Case' : 'Cases'} Nearby
                            </p>
                        </div>
                        <div className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border border-red-100 shadow-sm">
                            <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></div>LIVE
                        </div>
                    </div>
                    <div className="space-y-4">
                        {liveAlerts.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-8">No active alerts.</p>
                        )}
                        {liveAlerts.map((alert) => (
                            <div key={alert.id} className={`rounded-2xl p-4 shadow-sm border ${
                                alert.status === "pending" ? "bg-[#b91c1c] text-white shadow-red-500/20 border-transparent"
                                : alert.status === "dispatched" ? "bg-yellow-50 border-yellow-200"
                                : "bg-gray-50 border-gray-200 opacity-60"
                            }`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-bold text-base">{alert.name}</h3>
                                        <p className={`text-xs font-medium ${alert.status === "pending" ? "text-red-200" : "text-gray-500"}`}>
                                            {alert.emergencyType}
                                        </p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        alert.status === "pending" ? "bg-white text-red-700"
                                        : alert.status === "dispatched" ? "bg-yellow-200 text-yellow-800"
                                        : "bg-gray-200 text-gray-600"
                                    }`}>{alert.status}</span>
                                </div>
                                <div className={`text-sm mb-4 ${alert.status === "pending" ? "text-red-100" : "text-gray-600"}`}>
                                    <p>{alert.barangay} — {alert.address}</p>
                                </div>
                                {alert.status === "pending" && (
                                    <div className="flex gap-2">
                                        <button onClick={() => handleDispatch(alert.id, alert._source)}
                                            className="flex-1 bg-white hover:bg-gray-50 text-red-700 py-2.5 rounded-xl text-sm font-bold transition-colors">
                                            Dispatch Responder
                                        </button>
                                        <a href={`https://maps.google.com/?q=${alert.latitude},${alert.longitude}`}
                                            target="_blank" rel="noreferrer"
                                            className="bg-red-800 hover:bg-red-900 w-12 flex items-center justify-center rounded-xl transition-colors">
                                            <MapPin size={18} className="text-white" />
                                        </a>
                                    </div>
                                )}
                                {alert.status === "dispatched" && (
                                    <button onClick={() => handleResolve(alert.id, alert._source)}
                                        className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
                                        Mark Resolved
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .leaflet-control-zoom a { color: #4b5563 !important; border-radius: 8px !important; border: none !important; }
                .leaflet-bar { border: none !important; box-shadow: none !important; display: flex; flex-direction: column; gap: 8px; }
                .leaflet-popup-content { margin: 12px 16px; }
            `}} />
        </div>
    );
}
