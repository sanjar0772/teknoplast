import { create } from 'zustand';

const useThemeStore = create((set) => ({
  theme: localStorage.getItem('teknoplast-theme') || 'white-red',
  setTheme: (theme) => {
    localStorage.setItem('teknoplast-theme', theme);
    document.documentElement.setAttribute('data-app-theme', theme);
    set({ theme });
  },
  initTheme: () => {
    const theme = localStorage.getItem('teknoplast-theme') || 'white-red';
    document.documentElement.setAttribute('data-app-theme', theme);
    set({ theme });
  },
}));

export default useThemeStore;
