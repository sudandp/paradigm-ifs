import React from 'react';
import { useLogoStore } from '../../store/logoStore';

const Logo: React.FC<{ className?: string; localPath?: string }> = ({ className = '', localPath }) => {
    const logo = useLogoStore((state) => state.currentLogo);
    const src = localPath || logo;
    return (
        <img
            src={src}
            alt="Paradigm Logo"
            className={`w-auto object-contain ${!className.includes('h-') && 'h-10'} ${className}`}
        />
    );
};

export default Logo;
