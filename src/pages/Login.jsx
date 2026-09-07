import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Eye, EyeOff, AlertCircle } from 'lucide-react';
import mapOfValenzuela from '../assets/map_of_valenzuela.jpg';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
      if (!adminSnap.exists()) {
        await auth.signOut();
        setError('This account does not have admin privileges.');
        setLoading(false);
        return;
      }

      navigate('/', { replace: true });
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError('Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* Left: map panel, styled like an ID card face */}
      <div className="hidden lg:flex lg:flex-col relative w-1/2 bg-[#0a2140]">
        <img src={mapOfValenzuela} alt="Map of Valenzuela" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-[#0a2140]/70" />

        <div className="relative flex-1 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full border-2 border-[#d9a545] flex items-center justify-center">
              <ShieldCheck size={20} className="text-[#d9a545]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight tracking-wide">SCIA Admin</h1>
              <p className="text-xs text-blue-100/80">Secure Admin Portal</p>
            </div>
          </div>

          <div className="max-w-sm">
            <h2 className="font-serif text-3xl leading-snug mb-3">
              Serving Valenzuela's senior citizens.
            </h2>
            <p className="text-sm text-blue-100/80 leading-relaxed">
              Manage announcements, ID verification, and barangay coordination across every district in the city.
            </p>

            <div className="flex gap-3 mt-6">
              <span className="flex items-center gap-2 pl-3 pr-4 py-1.5 border-l-2 border-[#d9a545] bg-white/5 text-xs text-blue-50">
                OSCA Admin
              </span>
              <span className="flex items-center gap-2 pl-3 pr-4 py-1.5 border-l-2 border-blue-300 bg-white/5 text-xs text-blue-50">
                Barangay Admin
              </span>
            </div>
          </div>
        </div>

        {/* Gold stripe, echoes the accent band on a senior citizen ID */}
        <div className="h-1.5 bg-[#d9a545]" />
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex items-center justify-center bg-white p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Mobile-only header, since the map panel is hidden below lg */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-full border-2 border-[#d9a545] flex items-center justify-center">
              <ShieldCheck size={18} className="text-[#0f52ba]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">SCIA Admin</h1>
              <p className="text-xs text-gray-500">Secure Admin Portal</p>
            </div>
          </div>

          <h2 className="font-serif text-2xl text-gray-900 mb-1">Welcome back</h2>
          <p className="text-sm text-gray-500 mb-7">Sign in with your admin account to continue.</p>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border-l-2 border-red-400 text-red-700 text-sm px-3.5 py-2.5 mb-6">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@scia.gov"
                required
                autoComplete="email"
                className="w-full border-0 border-b-2 border-gray-200 py-2 px-0.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0f52ba] transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full border-0 border-b-2 border-gray-200 py-2 pr-9 px-0.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0f52ba] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0f52ba] hover:bg-[#0c4295] disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 text-sm font-medium transition-colors mt-3 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-8">
            Access is restricted to authorized personnel only. Contact your system administrator for access.
          </p>
        </div>
      </div>
    </div>
  );
}
