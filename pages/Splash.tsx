import React, { useState } from 'react';
import PermissionsPrimer from '../components/PermissionsPrimer';
import LoadingScreen from '../components/ui/LoadingScreen';

const Splash: React.FC = () => {
    const [permissionsComplete, setPermissionsComplete] = useState(false);

    const handlePermissionsComplete = () => {
        setPermissionsComplete(true);
    };

    // Show permissions primer on mobile
    if (!permissionsComplete) {
        return <PermissionsPrimer onComplete={handlePermissionsComplete} />;
    }

    // Show the same LoadingScreen used everywhere else
    return <LoadingScreen message="Loading Application..." />;
};

export default Splash;

