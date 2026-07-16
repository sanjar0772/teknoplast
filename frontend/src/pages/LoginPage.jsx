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
    <div className="relative min-h-screen overflow-hidden bg-slate-950 flex items-center justify-center p-4">
      {/* 3D fon: chuqur gradient + suzuvchi nur dog'lari + panjara */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950" />
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/30 blur-3xl animate-float-slow" />
      <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-emerald-500/20 blur-3xl animate-float-slower" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl animate-float-slow" />
      <div className="absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

      <div className="relative w-full max-w-md">
        {/* Logo — 3D kub */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-700 shadow-[0_20px_45px_-12px_rgba(59,130,246,0.65),inset_0_2px_0_rgba(255,255,255,0.35)] flex items-center justify-center rotate-3 hover:rotate-0 transition-transform duration-300">
            <Factory size={34} className="text-white drop-shadow-lg" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-blue-300 drop-shadow">TEKNOPLAST</h1>
          <p className="text-blue-300/80 mt-1 text-sm">Zavod Boshqaruv Tizimi</p>
        </div>

        {/* Form — shisha karta */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-white/20 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.8)] p-8">
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
