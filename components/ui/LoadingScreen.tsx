
import React from 'react';
import { Loader2 } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Loading...', fullScreen = true }) => {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const containerClasses = fullScreen
    ? `fixed inset-0 z-50 flex flex-col items-center justify-center ${isDark ? 'bg-[#041b0f]/80' : 'bg-white/80'} backdrop-blur-sm transition-opacity duration-300`
    : `flex flex-col items-center justify-center min-h-[400px] w-full ${isDark ? 'text-white' : 'text-gray-900'}`;

  return (
    <div className={containerClasses}>
      <Loader2 className={`h-12 w-12 animate-spin mb-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
      <p className={`text-lg font-medium ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>{message}</p>
    </div>
  );
};

export default LoadingScreen;
