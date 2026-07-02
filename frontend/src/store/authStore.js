import { create } from 'zustand';

function readToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
}

function readUser() {
  try {
    const direct = localStorage.getItem('auth_user') || sessionStorage.getItem('auth_user');
    if (direct) return JSON.parse(direct);
    // Eski zustand-persist formatidan migrate qilish
    const old = localStorage.getItem('teknoplast-auth');
    if (old) return JSON.parse(old)?.state?.user || null;
    return null;
  } catch { return null; }
}

const initToken = readToken();
const initUser = readUser();

const useAuthStore = create((set, get) => ({
  user: initUser,
  token: initToken,
  isAuthenticated: !!(initToken && initUser),

  // remember=true → localStorage (brauzer yopilsa ham qoladi, 30 kun)
  // remember=false → sessionStorage (brauzer yopilsa o'chadi, 8 soat)
  login: (token, user, remember = true) => {
    if (remember) {
      localStorage.setItem('token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('auth_user');
    } else {
      sessionStorage.setItem('token', token);
      sessionStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.removeItem('token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('teknoplast-auth');
    }
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('teknoplast-auth');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('auth_user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  updateUser: (user) => {
    if (localStorage.getItem('token')) {
      localStorage.setItem('auth_user', JSON.stringify(user));
    } else {
      sessionStorage.setItem('auth_user', JSON.stringify(user));
    }
    set({ user });
  },

  hasRole: (...roles) => {
    const { user } = get();
    return user && roles.includes(user.role);
  },

  isOwner: () => get().user?.role === 'OWNER',
  isAccountant: () => ['OWNER', 'ACCOUNTANT'].includes(get().user?.role),
  isSalesHead: () => ['OWNER', 'SALES_HEAD'].includes(get().user?.role),
  isProductionHead: () => ['OWNER', 'PRODUCTION_HEAD'].includes(get().user?.role),
  isKirimchi: () => ['OWNER', 'KIRIMCHI'].includes(get().user?.role),
  isOmborchi: () => ['OWNER', 'OMBORCHI'].includes(get().user?.role),
  isTaminotchi: () => ['OWNER', 'TAMINOTCHI'].includes(get().user?.role),
  isCycleTime: () => ['OWNER', 'CYCLE_TIME'].includes(get().user?.role),
  isAgent: () => get().user?.role === 'AGENT',
}));

export default useAuthStore;
