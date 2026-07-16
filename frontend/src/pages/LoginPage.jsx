import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Phone, Factory } from 'lucide-react';
import { authAPI } from '../services/api';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    try {
      setLoading(true);
      const res = await authAPI.login({ ...data, remember });
      login(res.data.token, res.data.user, remember);
      toast.success(`Xush kelibsiz, ${res.data.user.full_name}!`);
      navigate('/');
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-50 flex items-center justify-center p-4">
      {/* Oq fon — yumshoq nur dog'lari */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-red-50/30 to-gray-100" />
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-red-400/15 blur-3xl animate-float-slow" />
      <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-red-300/10 blur-3xl animate-float-slower" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-red-200/15 blur-3xl animate-float-slow" />
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

      <div className="relative w-full max-w-md">
        {/* Logo — qizil qalqon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <svg width="72" height="72" viewBox="0 0 100 100">
              <path d="M50 5 L90 28 L90 72 L50 95 L10 72 L10 28Z" fill="#b91c1c"/>
              <path d="M50 15 L82 34 L82 66 L50 85 L18 66 L18 34Z" fill="#dc2626"/>
              <path d="M38 42 L50 28 L62 42 L62 58 L50 68 L38 58Z" fill="#fca5a5" opacity="0.3"/>
              <text x="35" y="60" fontFamily="system-ui" fontSize="32" fontWeight="900" fill="#fff">T</text>
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">TEKNOPLAST</h1>
          <p className="text-gray-500 mt-1 text-sm">Zavod Boshqaruv Tizimi</p>
        </div>

        {/* Form — shisha karta */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.12)] p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Tizimga kirish</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Telefon raqam</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  {...register('phone', { required: 'Telefon kiritilmagan' })}
                  placeholder="+998901234567"
                  className="input pl-9"
                />
              </div>
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
            </div>

            <div>
              <label className="label">Parol</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  {...register('password', { required: 'Parol kiritilmagan', minLength: { value: 6, message: 'Kamida 6 belgi' } })}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="input pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
              />
              <label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer select-none">
                Eslab qolish
              </label>
              <span className="ml-auto text-xs text-gray-400">
                {remember ? '30 kun' : 'Faqat shu sessiya'}
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Kirilmoqda...
                </span>
              ) : 'Kirish'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Teknoplast Boshqaruv Tizimi © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
