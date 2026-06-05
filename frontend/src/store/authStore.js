import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (token, user) => {
        localStorage.setItem('token', token);
        set({ token, user, isAuthenticated: true });
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ token: null, user: null, isAuthenticated: false });
      },

      updateUser: (user) => set({ user }),

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
    }),
    {
      name: 'teknoplast-auth',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

export default useAuthStore;
