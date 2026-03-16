import React, { useState } from 'react';
import PermissionsPrimer from '../components/PermissionsPrimer';
import LoadingScreen from '../components/ui/LoadingScreen';

interface SplashProps {
  onComplete: () => void;
}

const Splash: React.FC<SplashProps> = ({ onComplete }) => {
    const [permissionsComplete, setPermissionsComplete] = useState(false);

    // Track if we've already triggered completion to avoid double calls
    const [hasCompleted, setHasCompleted] = React.useState(false);

    React.useEffect(() => {
        if (!hasCompleted) {
            console.log('[Splash] Auto-completing splash sequence...');
            setHasCompleted(true);
            onComplete();
        }
    }, [onComplete, hasCompleted]);

    /* 
    // Permissions check disabled per project requirement.
    if (!permissionsComplete) {
        return <PermissionsPrimer onComplete={handlePermissionsComplete} />;
    }
    */

    // Directly trigger completion if needed, though App.tsx now handles it better.
    // We'll just show the loading screen until the app is ready.

    // Show the same LoadingScreen used everywhere else
    return <LoadingScreen message="Initializing Application..." />;
};

export default Splash;

