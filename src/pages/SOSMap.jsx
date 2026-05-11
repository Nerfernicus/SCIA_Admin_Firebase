import { db } from "../lib/firebase";
import {
  collection, onSnapshot, orderBy, query,
  doc, updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import React, { useState, useEffect } from 'react';
import { MapPin, Crosshair, CheckCircle2, AlertTriangle, Trash2, X, History } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
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

function DeleteConfirmModal({ alert, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Alert?</h2>
        <p className="text-sm text-gray-500 mb-1">You are about to delete the SOS alert from</p>
        <p className="text-sm font-bold text-gray-800 mb-4">"{alert?.name}"</p>
        <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-4 py-2 mb-6">
          This will permanently remove this record from the system.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SOSMap() {
  const [myLocation, setMyLocation]     = useState(null);
  const [isLocating, setIsLocating]     = useState(false);
  const [liveAlerts, setLiveAlerts]     = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showHistory, setShowHistory]   = useState(false);
  const [toast, setToast]               = useState('');
  const mapCenter = [14.7080, 120.9860];

  useEffect(() => {
    const qEmergencies = query(collection(db, "emergencies"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qEmergencies, (snapshot) => {
      const alerts = snapshot.docs.map(d => ({ id: d.id, _source: 'emergencies', ...d.data() }));
      setLiveAlerts(alerts);
    });
    return () => unsub();
  }, []);

  // Detect repeat SOS users (same userId/uid or name appearing more than once)
  const repeatKeys = (() => {
    const counts = {};
    liveAlerts.forEach(a => {
      // Mobile app writes `uid`; admin SOSMap previously wrote `userId` — check both
      const key = a.userId || a.uid || a.name;
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();

  const isRepeat = (a) => repeatKeys.has(a.userId || a.uid || a.name);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const handleDispatch = async (alertId, source) => {
    await updateDoc(doc(db, source || 'emergencies', alertId), {
      status: "dispatched",
      dispatchedAt: serverTimestamp(),
    });
  };

  const handleResolve = async (alertId, source) => {
    await updateDoc(doc(db, source || 'emergencies', alertId), {
      status: "resolved",
      resolvedAt: serverTimestamp(),
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteDoc(doc(db, deleteTarget._source || 'emergencies', deleteTarget.id));
    showToast(`Alert from "${deleteTarget.name}" deleted.`);
    setDeleteTarget(null);
  };

  const handleLocateMe = () => {
    if (!('geolocation' in navigator)) { alert("Geolocation is not supported by your browser"); return; }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => { setMyLocation([latitude, longitude]); setIsLocating(false); },
      (error) => { console.error(error); alert("Could not get your location."); setIsLocating(false); },
      { enableHighAccuracy: true },
    );
  };

  const activeAlerts   = liveAlerts.filter(a => a.status !== 'resolved');
  const resolvedAlerts = liveAlerts.filter(a => a.status === 'resolved');

  const latestPendingAlert = activeAlerts.find(a => a.status === 'pending' && a.latitude && a.longitude);
  const mapFocusTarget = myLocation ?? (latestPendingAlert ? [latestPendingAlert.latitude, latestPendingAlert.longitude] : null);

  // Alerts to show in the panel (active always shown; history toggled)
  const panelAlerts = showHistory ? liveAlerts : activeAlerts;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden font-sans bg-white">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[9999] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3">
          <CheckCircle2 size={16} className="text-green-400" />
          {toast}
          <button onClick={() => setToast('')}><X size={14} className="text-white/60 hover:text-white" /></button>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          alert={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      <div className="bg-white border-b border-gray-100 px-6 py-4 flex-none z-[2000]">
        <h1 className="text-2xl font-bold text-gray-900">SOS Map</h1>
        <p className="text-sm text-gray-500">Real-time emergency alerts in Valenzuela City</p>
      </div>

      <div className="relative flex-1 w-full bg-blue-50/20">
        {/* Map */}
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

        {/* Locate me button */}
        <div className="absolute bottom-8 left-6 flex flex-col gap-3 z-[1000]">
          <button onClick={handleLocateMe} disabled={isLocating}
            className={`bg-white/90 backdrop-blur p-3 rounded-2xl shadow-lg border border-gray-100 transition-colors ${
              isLocating ? 'text-gray-400 cursor-not-allowed' : 'text-[#0f52ba] hover:bg-gray-50'
            }`} title="Locate me">
            <Crosshair size={20} className={isLocating ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Alerts panel */}
        <div className="absolute top-6 right-6 w-100 max-h-[calc(100vh-200px)] overflow-y-auto bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white p-5 z-[1000] hidden sm:block hide-scrollbar">

          {/* Panel header */}
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Live Alerts</h2>
              <p className="text-sm text-gray-500 font-medium mt-0.5">
                {activeAlerts.length} Active · {resolvedAlerts.length} Resolved
              </p>
            </div>
            <div className="flex items-center gap-2">
              {repeatKeys.size > 0 && (
                <span className="bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 border border-orange-200">
                  <AlertTriangle size={11} /> {repeatKeys.size} Repeat
                </span>
              )}
              <div className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border border-red-100 shadow-sm">
                <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></div>LIVE
              </div>
            </div>
          </div>

          {/* Repeat warning */}
          {repeatKeys.size > 0 && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
              <AlertTriangle size={12} className="text-orange-500 shrink-0" />
              Some users have sent <strong className="mx-0.5">multiple SOS alerts</strong> — highlighted below.
            </div>
          )}

          {/* History toggle */}
          {resolvedAlerts.length > 0 && (
            <button
              onClick={() => setShowHistory(h => !h)}
              className={`w-full flex items-center justify-center gap-2 mb-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                showHistory
                  ? 'bg-gray-100 border-gray-200 text-gray-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <History size={13} />
              {showHistory ? 'Hide Resolved History' : `Show Resolved History (${resolvedAlerts.length})`}
            </button>
          )}

          <div className="space-y-3">
            {panelAlerts.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No alerts.</p>
            )}

            {panelAlerts.map((alert) => {
              const repeat = isRepeat(alert);
              const isResolved = alert.status === 'resolved';

              return (
                <div
                  key={alert.id}
                  className={`rounded-2xl p-4 shadow-sm border relative ${
                    isResolved
                      ? repeat
                        ? 'bg-orange-50/60 border-orange-200 opacity-80'
                        : 'bg-gray-50 border-gray-200 opacity-70'
                      : alert.status === 'pending'
                        ? repeat
                          ? 'bg-[#b91c1c] text-white shadow-red-500/20 border-orange-400 ring-2 ring-orange-400/50'
                          : 'bg-[#b91c1c] text-white shadow-red-500/20 border-transparent'
                        : repeat
                          ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-200'
                          : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  {/* Delete button — top right */}
                  <button
                    onClick={() => setDeleteTarget(alert)}
                    title="Delete alert"
                    className={`absolute top-3 right-3 p-1.5 rounded-lg transition-colors ${
                      alert.status === 'pending'
                        ? 'text-red-200 hover:text-white hover:bg-red-700'
                        : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                    }`}
                  >
                    <Trash2 size={13} />
                  </button>

                  <div className="flex justify-between items-start mb-2 pr-7">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base">{alert.name}</h3>
                        {repeat && (
                          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            alert.status === 'pending' ? 'bg-orange-400 text-white' : 'bg-orange-500 text-white'
                          }`}>
                            <AlertTriangle size={9} /> REPEAT
                          </span>
                        )}
                      </div>
                      <p className={`text-xs font-medium ${alert.status === "pending" ? "text-red-200" : "text-gray-500"}`}>
                        {alert.emergencyType}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-2 shrink-0 ${
                      alert.status === "pending"   ? "bg-white text-red-700"
                      : alert.status === "dispatched" ? "bg-yellow-200 text-yellow-800"
                      : "bg-gray-200 text-gray-600"
                    }`}>{alert.status}</span>
                  </div>

                  <div className={`text-sm mb-3 ${alert.status === "pending" ? "text-red-100" : "text-gray-600"}`}>
                    <p>{alert.barangay} — {alert.address}</p>
                    {isResolved && alert.resolvedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Resolved {alert.resolvedAt?.toDate?.()?.toLocaleString?.() || '—'}
                      </p>
                    )}
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
              );
            })}
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
