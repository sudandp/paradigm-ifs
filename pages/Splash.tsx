import React, { useState } from 'react';
import PermissionsPrimer from '../components/PermissionsPrimer';
import LoadingScreen from '../components/ui/LoadingScreen';

interface SplashProps {
  onComplete: () => void;
}

const Splash: React.FC<SplashProps> = ({ onComplete }) => {
    const [permissionsComplete, setPermissionsComplete] = useState(false);

    const handlePermissionsComplete = () => {
        setPermissionsComplete(true);
        onComplete();
    };

    // Show permissions primer on mobile
    if (!permissionsComplete) {
        return <PermissionsPrimer onComplete={handlePermissionsComplete} />;
    }

    // Show the same LoadingScreen used everywhere else
    return <LoadingScreen message="Initializing Application..." />;
};

export default Splash;

