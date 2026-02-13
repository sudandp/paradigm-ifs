
import React from 'react';
import { useAuthStore } from '../../store/authStore';
import { Avatars } from './Avatars';

interface ProfilePlaceholderProps {
    className?: string;
    photoUrl?: string | null;
    seed?: string;
}

export const ProfilePlaceholder: React.FC<ProfilePlaceholderProps> = ({ className, photoUrl, seed }) => {
    const { user } = useAuthStore();

    const isValidPhoto = photoUrl && (photoUrl.startsWith('http') || photoUrl.startsWith('https') || photoUrl.startsWith('data:'));

    if (isValidPhoto) {
        return <img src={photoUrl} alt="Profile" className={`object-cover ${className || ''}`} onError={(e) => (e.currentTarget.style.display = 'none')} />;
    }

    const effectiveSeed = seed || user?.id;

    if (!effectiveSeed) {
        const FallbackAvatar = Avatars[0];
        return <FallbackAvatar className={`text-muted/60 ${className || ''}`} />;
    }

    const avatarIndex = effectiveSeed.charCodeAt(effectiveSeed.length - 1) % Avatars.length;
    const SelectedAvatar = Avatars[avatarIndex];

    return <SelectedAvatar className={className || ''} />;
};