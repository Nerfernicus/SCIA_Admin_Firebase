import React, { useState, useEffect } from 'react';
import {
    Building2, BriefcaseMedical, Package,
    MapPin, Calendar, Pill, Clock as ClockIcon, CheckCircle2,
    XCircle, User, Phone, ChevronDown, X, Check,
    Loader2, AlertCircle
} from 'lucide-react';
import {
    collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ── Static Gen T 3S Health Centers ───────────────────────────────────────────
// "Gen T 3S Centers" are the Generation-Transforming Senior Services Centers
// in Valenzuela City. These are fixed, not dynamic.
const GEN_T_CENTERS = [
    {
        id: 'gen-t-1',
        name: 'Gen T 3S Center — Malinta',
        shortName: 'Malinta Center',
        location: 'Malinta, Valenzuela City, Metro Manila',
        address: 'Malinta Health Center Building, Valenzuela City',
        status: 'OPEN',
        headOfficial: 'Dr. Maria Santos',
        phone: '(02) 8292-0001',
        hours: 'Mon–Fri, 8:00 AM – 5:00 PM',
        services: ['Medical Consultation', 'Blood Pressure Monitoring', 'Blood Sugar Check', 'Senior Wellness Program'],
        staffColor: 'bg-blue-500',
        staffCount: '18',
        // Actual image: Valenzuela City Health Center / municipal health facility
        imgUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Valenzuela_City_Hall.jpg/640px-Valenzuela_City_Hall.jpg',
        avatarSeed: 'maria-santos',
        color: '#0f52ba',
    },
    {
        id: 'gen-t-2',
        name: 'Gen T 3S Center — Karuhatan',
        shortName: 'Karuhatan Center',
        location: 'Karuhatan, Valenzuela City, Metro Manila',
        address: 'Karuhatan Barangay Hall Compound, Valenzuela City',
        status: 'OPEN',
        headOfficial: 'Dr. Jose Reyes',
        phone: '(02) 8292-0002',
        hours: 'Mon–Fri, 8:00 AM – 5:00 PM',
        services: ['Medical Consultation', 'Dental Services', 'Physical Therapy', 'Nutrition Counseling'],
        staffColor: 'bg-teal-500',
        staffCount: '15',
        imgUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Philippine_Health_Center.jpg/640px-Philippine_Health_Center.jpg',
        avatarSeed: 'jose-reyes',
        color: '#0d9488',
    },
    {
        id: 'gen-t-3',
        name: 'Gen T 3S Center — Canumay',
        shortName: 'Canumay Center',
        location: 'Canumay East, Valenzuela City, Metro Manila',
        address: 'Canumay Community Health Center, Valenzuela City',
        status: 'OPEN',
        headOfficial: 'Nurse Ana Cruz',
        phone: '(02) 8292-0003',
        hours: 'Mon–Sat, 7:00 AM – 4:00 PM',
        services: ['Vaccination', 'Maternal & Child Health', 'Laboratory Services', 'Senior Rehabilitation'],
        staffColor: 'bg-purple-500',
        staffCount: '12',
        imgUrl: 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80',
        avatarSeed: 'ana-cruz',
        color: '#7c3aed',
    },
];

const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];
const MEDICATION_STATUSES   = ['active', 'completed', 'discontinued'];

// ── Appointment Row ───────────────────────────────────────────────────────────
function AppointmentRow({ appt, onUpdate }) {
    const [loading, setLoading] = useState(false);

    const updateStatus = async (newStatus) => {
        setLoading(true);
        try {
            await updateDoc(doc(db, 'appointments', appt.id), { status: newStatus, updatedAt: serverTimestamp() });
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const badgeColor = {
        pending:   'bg-yellow-100 text-yellow-700',
        confirmed: 'bg-blue-100 text-blue-700',
        completed: 'bg-green-100 text-green-700',
        cancelled: 'bg-red-100 text-red-700',
    }[appt.status] || 'bg-gray-100 text-gray-600';

    return (
        <div className="flex items-start justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-white transition-colors">
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#0f52ba]/10 flex items-center justify-center shrink-0">
                    <User size={16} className="text-[#0f52ba]" />
                </div>
                <div>
                    <p className="font-bold text-gray-900 text-sm">{appt.patientName || 'Unknown Patient'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {appt.date} {appt.time && `at ${appt.time}`} — {appt.reason || 'General Consultation'}
                    </p>
                    {appt.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{appt.notes}</p>}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${badgeColor}`}>
                    {appt.status}
                </span>
                {appt.status === 'pending' && (
                    <div className="flex gap-1">
                        <button onClick={() => updateStatus('confirmed')} disabled={loading}
                            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition-colors" title="Confirm">
                            {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button onClick={() => updateStatus('cancelled')} disabled={loading}
                            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors" title="Cancel">
                            <X size={12} />
                        </button>
                    </div>
                )}
                {appt.status === 'confirmed' && (
                    <button onClick={() => updateStatus('completed')} disabled={loading}
                        className="text-xs bg-green-500 hover:bg-green-600 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors">
                        {loading ? '…' : 'Done'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Medication Row ────────────────────────────────────────────────────────────
function MedicationRow({ med, onUpdate }) {
    const [loading, setLoading] = useState(false);

    const updateStatus = async (newStatus) => {
        setLoading(true);
        try {
            await updateDoc(doc(db, 'medications', med.id), { status: newStatus, updatedAt: serverTimestamp() });
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const badgeColor = {
        active:        'bg-green-100 text-green-700',
        completed:     'bg-blue-100 text-blue-700',
        discontinued:  'bg-red-100 text-red-600',
    }[med.status] || 'bg-gray-100 text-gray-600';

    return (
        <div className="flex items-start justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-white transition-colors">
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                    <Pill size={16} className="text-green-600" />
                </div>
                <div>
                    <p className="font-bold text-gray-900 text-sm">{med.medicationName || 'Unknown Medication'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {med.patientName} — {med.dosage || ''} {med.frequency || ''}
                    </p>
                    {med.prescribedBy && (
                        <p className="text-xs text-gray-400 mt-0.5">Prescribed by: {med.prescribedBy}</p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${badgeColor}`}>
                    {med.status}
                </span>
                {med.status === 'active' && (
                    <button onClick={() => updateStatus('completed')} disabled={loading}
                        className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors">
                        {loading ? '…' : 'Complete'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Add Appointment Modal ────────────────────────────────────────────────────
function AddAppointmentModal({ centerId, centerName, onClose }) {
    const [patientName, setPatientName] = useState('');
    const [date, setDate]               = useState('');
    const [time, setTime]               = useState('');
    const [reason, setReason]           = useState('');
    const [notes, setNotes]             = useState('');
    const [saving, setSaving]           = useState(false);
    const [error, setError]             = useState('');

    const handleSave = async () => {
        if (!patientName || !date) { setError('Patient name and date are required.'); return; }
        setSaving(true);
        try {
            await addDoc(collection(db, 'appointments'), {
                centerId, centerName, patientName, date, time, reason, notes,
                status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            });
            onClose();
        } catch (e) { console.error(e); setError('Failed to save.'); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md z-10 p-6">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-gray-900">New Appointment</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <p className="text-xs text-[#0f52ba] font-semibold mb-4">{centerName}</p>
                {error && <p className="text-xs text-red-500 mb-3 font-semibold">{error}</p>}
                <div className="space-y-3">
                    {[
                        { label: 'Patient Name', value: patientName, setter: setPatientName, placeholder: 'Full name' },
                        { label: 'Date', value: date, setter: setDate, type: 'date' },
                        { label: 'Time', value: time, setter: setTime, type: 'time' },
                        { label: 'Reason', value: reason, setter: setReason, placeholder: 'e.g. General Consultation' },
                    ].map(({ label, value, setter, type, placeholder }) => (
                        <div key={label}>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</label>
                            <input type={type || 'text'} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
                        </div>
                    ))}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none" />
                    </div>
                    <button onClick={handleSave} disabled={saving}
                        className="w-full py-3 rounded-xl bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        {saving ? 'Saving…' : 'Book Appointment'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Add Medication Modal ─────────────────────────────────────────────────────
function AddMedicationModal({ centerId, centerName, onClose }) {
    const [patientName,    setPatientName]    = useState('');
    const [medicationName, setMedicationName] = useState('');
    const [dosage,         setDosage]         = useState('');
    const [frequency,      setFrequency]      = useState('');
    const [prescribedBy,   setPrescribedBy]   = useState('');
    const [saving,         setSaving]         = useState(false);
    const [error,          setError]          = useState('');

    const handleSave = async () => {
        if (!patientName || !medicationName) { setError('Patient and medication name are required.'); return; }
        setSaving(true);
        try {
            await addDoc(collection(db, 'medications'), {
                centerId, centerName, patientName, medicationName, dosage, frequency, prescribedBy,
                status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            });
            onClose();
        } catch (e) { console.error(e); setError('Failed to save.'); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md z-10 p-6">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-gray-900">Add Medication Record</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <p className="text-xs text-[#0f52ba] font-semibold mb-4">{centerName}</p>
                {error && <p className="text-xs text-red-500 mb-3 font-semibold">{error}</p>}
                <div className="space-y-3">
                    {[
                        { label: 'Patient Name', value: patientName, setter: setPatientName, placeholder: 'Full name' },
                        { label: 'Medication Name', value: medicationName, setter: setMedicationName, placeholder: 'e.g. Amlodipine 5mg' },
                        { label: 'Dosage', value: dosage, setter: setDosage, placeholder: 'e.g. 1 tablet' },
                        { label: 'Frequency', value: frequency, setter: setFrequency, placeholder: 'e.g. Once daily' },
                        { label: 'Prescribed By', value: prescribedBy, setter: setPrescribedBy, placeholder: 'Doctor name' },
                    ].map(({ label, value, setter, placeholder }) => (
                        <div key={label}>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</label>
                            <input type="text" value={value} onChange={e => setter(e.target.value)} placeholder={placeholder}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
                        </div>
                    ))}
                    <button onClick={handleSave} disabled={saving}
                        className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Pill size={16} />}
                        {saving ? 'Saving…' : 'Add Medication'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Center Detail Panel ──────────────────────────────────────────────────────
function CenterDetail({ center, onClose }) {
    const [tab, setTab]                   = useState('appointments');
    const [appointments, setAppointments] = useState([]);
    const [medications, setMedications]   = useState([]);
    const [loadingAppt, setLoadingAppt]   = useState(true);
    const [loadingMeds, setLoadingMeds]   = useState(true);
    const [showAddAppt, setShowAddAppt]   = useState(false);
    const [showAddMed,  setShowAddMed]    = useState(false);

    useEffect(() => {
        const qA = query(
            collection(db, 'appointments'),
            orderBy('createdAt', 'desc')
        );
        const unsubA = onSnapshot(qA, snap => {
            setAppointments(snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(a => a.centerId === center.id));
            setLoadingAppt(false);
        }, () => setLoadingAppt(false));

        const qM = query(
            collection(db, 'medications'),
            orderBy('createdAt', 'desc')
        );
        const unsubM = onSnapshot(qM, snap => {
            setMedications(snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(m => m.centerId === center.id));
            setLoadingMeds(false);
        }, () => setLoadingMeds(false));

        return () => { unsubA(); unsubM(); };
    }, [center.id]);

    const pendingCount    = appointments.filter(a => a.status === 'pending').length;
    const activeMedsCount = medications.filter(m => m.status === 'active').length;

    return (
        <div className="fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative ml-auto w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden z-10">

                {/* Header */}
                <div className="relative h-44 shrink-0 overflow-hidden">
                    <img src={center.imgUrl} alt={center.name}
                        className="w-full h-full object-cover"
                        onError={e => { e.target.src = 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=600&q=80'; }}
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
                    <button onClick={onClose}
                        className="absolute top-4 right-4 w-9 h-9 bg-white/20 backdrop-blur rounded-xl text-white hover:bg-white/30 flex items-center justify-center">
                        <X size={18} />
                    </button>
                    <div className="absolute bottom-4 left-5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded mb-1 inline-block ${
                            center.status === 'OPEN' ? 'bg-green-400 text-white' : 'bg-red-500 text-white'
                        }`}>{center.status}</span>
                        <h2 className="text-white font-bold text-xl leading-tight">{center.name}</h2>
                        <p className="text-white/70 text-xs flex items-center gap-1 mt-0.5">
                            <MapPin size={11} /> {center.location}
                        </p>
                    </div>
                </div>

                {/* Info strip */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-3 gap-3 shrink-0">
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Head Official</p>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5">{center.headOfficial}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hours</p>
                        <p className="text-xs font-medium text-gray-700 mt-0.5 flex items-center gap-1"><ClockIcon size={10}/>{center.hours}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Phone</p>
                        <p className="text-xs font-medium text-gray-700 mt-0.5 flex items-center gap-1"><Phone size={10}/>{center.phone}</p>
                    </div>
                </div>

                {/* Services */}
                <div className="px-5 py-3 border-b border-gray-100 shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Services</p>
                    <div className="flex flex-wrap gap-1.5">
                        {center.services.map(s => (
                            <span key={s} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">{s}</span>
                        ))}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 shrink-0">
                    <button onClick={() => setTab('appointments')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                            tab === 'appointments' ? 'text-[#0f52ba] border-b-2 border-[#0f52ba]' : 'text-gray-400 hover:text-gray-600'
                        }`}>
                        <Calendar size={15} /> Appointments
                        {pendingCount > 0 && (
                            <span className="w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                {pendingCount}
                            </span>
                        )}
                    </button>
                    <button onClick={() => setTab('medications')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                            tab === 'medications' ? 'text-[#0f52ba] border-b-2 border-[#0f52ba]' : 'text-gray-400 hover:text-gray-600'
                        }`}>
                        <Pill size={15} /> Medications
                        {activeMedsCount > 0 && (
                            <span className="w-4 h-4 bg-green-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                {activeMedsCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {tab === 'appointments' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-900">Appointments</h3>
                                <button onClick={() => setShowAddAppt(true)}
                                    className="text-sm bg-[#0f52ba] hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-colors">
                                    <Calendar size={13} /> New
                                </button>
                            </div>
                            {loadingAppt ? (
                                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
                            ) : appointments.length === 0 ? (
                                <div className="text-center py-10">
                                    <Calendar size={32} className="text-gray-200 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400">No appointments yet.</p>
                                    <p className="text-xs text-gray-400 mt-1">Click "New" to book an appointment from the app.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {appointments.map(a => <AppointmentRow key={a.id} appt={a} />)}
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'medications' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-900">Medication Records</h3>
                                <button onClick={() => setShowAddMed(true)}
                                    className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-colors">
                                    <Pill size={13} /> Add
                                </button>
                            </div>
                            {loadingMeds ? (
                                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
                            ) : medications.length === 0 ? (
                                <div className="text-center py-10">
                                    <Pill size={32} className="text-gray-200 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400">No medication records yet.</p>
                                    <p className="text-xs text-gray-400 mt-1">Click "Add" to record a medication.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {medications.map(m => <MedicationRow key={m.id} med={m} />)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showAddAppt && (
                <AddAppointmentModal centerId={center.id} centerName={center.name} onClose={() => setShowAddAppt(false)} />
            )}
            {showAddMed && (
                <AddMedicationModal centerId={center.id} centerName={center.name} onClose={() => setShowAddMed(false)} />
            )}
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function HealthCenters() {
    const [selectedCenter, setSelectedCenter] = useState(null);
    const [apptCounts, setApptCounts]         = useState({});
    const [medCounts,  setMedCounts]          = useState({});

    // Live count badges on cards
    useEffect(() => {
        const qA = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));
        const unsubA = onSnapshot(qA, snap => {
            const counts = {};
            snap.docs.forEach(d => {
                const a = d.data();
                if (a.status === 'pending') counts[a.centerId] = (counts[a.centerId] || 0) + 1;
            });
            setApptCounts(counts);
        }, () => {});

        const qM = query(collection(db, 'medications'), orderBy('createdAt', 'desc'));
        const unsubM = onSnapshot(qM, snap => {
            const counts = {};
            snap.docs.forEach(d => {
                const m = d.data();
                if (m.status === 'active') counts[m.centerId] = (counts[m.centerId] || 0) + 1;
            });
            setMedCounts(counts);
        }, () => {});

        return () => { unsubA(); unsubM(); };
    }, []);

    return (
        <div className="flex-1 bg-[#f8f9fa] min-h-screen p-8 font-sans">

            {/* Header — NO duplicate bell/settings/avatar */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Health Centers</h1>
                <p className="text-gray-500">Manage Gen T 3S Centers — appointments and medications for senior citizens.</p>
            </div>

            {/* KPI Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-50 p-3 rounded-xl text-blue-600"><Building2 size={24} /></div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gen T 3S Centers</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-4xl font-bold text-gray-900">3</h2>
                        <span className="text-sm font-medium text-[#0f52ba]">All Active</span>
                    </div>
                </div>
                <div className="bg-[#ffc107] rounded-3xl p-6 shadow-sm text-gray-900">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-yellow-500/30 p-3 rounded-xl text-yellow-900"><Calendar size={24} /></div>
                        <span className="text-xs font-bold text-yellow-900/70 uppercase tracking-wider">Pending Appts</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-4xl font-bold">{Object.values(apptCounts).reduce((a, b) => a + b, 0)}</h2>
                        <span className="text-sm font-medium text-yellow-900/80">Awaiting Confirmation</span>
                    </div>
                </div>
                <div className="bg-[#0f52ba] rounded-3xl p-6 shadow-sm text-white">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-white/20 p-3 rounded-xl text-white"><Pill size={24} /></div>
                        <span className="text-xs font-bold text-blue-100 uppercase tracking-wider">Active Medications</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-4xl font-bold">{Object.values(medCounts).reduce((a, b) => a + b, 0)}</h2>
                        <span className="text-sm font-medium text-blue-100">Current Records</span>
                    </div>
                </div>
            </div>

            {/* Gen T Center Cards */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {GEN_T_CENTERS.map(center => (
                    <div key={center.id} className="bg-white rounded-3xl shadow-sm border border-gray-50 overflow-hidden flex flex-col hover:shadow-md transition-shadow">

                        {/* Center Image */}
                        <div className="relative h-44 overflow-hidden bg-gray-100">
                            <img
                                src={center.imgUrl}
                                alt={center.name}
                                className="w-full h-full object-cover"
                                onError={e => { e.target.src = 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=600&q=80'; }}
                            />
                            <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
                            {/* Gen T badge */}
                            <div className="absolute top-3 left-3">
                                <span className="bg-white text-[#0f52ba] text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shadow-sm">
                                    Gen T 3S
                                </span>
                            </div>
                            <div className="absolute top-3 right-3">
                                <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shadow-sm ${
                                    center.status === 'OPEN' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                }`}>
                                    {center.status}
                                </span>
                            </div>
                            <div className="absolute bottom-3 left-4 right-4">
                                <h3 className="text-white font-bold text-base leading-tight">{center.name}</h3>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-5 flex-1 flex flex-col">
                            <p className="text-gray-500 text-sm flex items-center gap-1.5 mb-4">
                                <MapPin size={13} className="text-gray-400" /> {center.location}
                            </p>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-gray-50 rounded-2xl p-3 text-center">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <Calendar size={13} className="text-[#0f52ba]" />
                                        <span className="text-lg font-bold text-gray-900">{apptCounts[center.id] || 0}</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pending Appts</p>
                                </div>
                                <div className="bg-gray-50 rounded-2xl p-3 text-center">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <Pill size={13} className="text-green-600" />
                                        <span className="text-lg font-bold text-gray-900">{medCounts[center.id] || 0}</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active Meds</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                                <img
                                    src={`https://api.dicebear.com/7.x/notionists/svg?seed=${center.avatarSeed}`}
                                    alt={center.headOfficial}
                                    className="w-9 h-9 rounded-full border border-gray-200 bg-gray-50"
                                />
                                <div>
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Head Official</p>
                                    <p className="text-sm font-semibold text-gray-900">{center.headOfficial}</p>
                                </div>
                            </div>

                            <button
                                onClick={() => setSelectedCenter(center)}
                                className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors text-white"
                                style={{ background: `linear-gradient(135deg, ${center.color}, ${center.color}cc)` }}
                            >
                                Manage Center →
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {selectedCenter && (
                <CenterDetail center={selectedCenter} onClose={() => setSelectedCenter(null)} />
            )}
        </div>
    );
}