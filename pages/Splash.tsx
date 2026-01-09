import React, { useState } from 'react';
import Logo from '../components/ui/Logo';
import PermissionsPrimer from '../components/PermissionsPrimer';

const Splash: React.FC = () => {
    const [permissionsComplete, setPermissionsComplete] = useState(false);

    const handlePermissionsComplete = () => {
        setPermissionsComplete(true);
        // The app's initialization logic in App.tsx will proceed once the
        // splash screen is unmounted, so no further action is needed here.
    };

    // Show permissions primer on mobile
    if (!permissionsComplete) {
        return <PermissionsPrimer onComplete={handlePermissionsComplete} />;
    }

    // Show simple loading screen after permissions are granted
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
            <div className="splash-logo">
                <Logo className="h-16 mb-8" />
            </div>
            <p className="text-gray-600">Loading Application...</p>
        </div>
    );
};

export default Splash;
