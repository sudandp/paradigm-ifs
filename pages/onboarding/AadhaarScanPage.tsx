import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AadhaarQrScanner from '../../components/onboarding/AadhaarQrScanner';
import { useOnboardingStore } from '../../store/onboardingStore';
// import { toast } from 'react-hot-toast';

const AadhaarScanPage: React.FC = () => {
    const navigate = useNavigate();
    const updatePersonal = useOnboardingStore(state => state.updatePersonal);
    const updateAddress = useOnboardingStore(state => state.updateAddress);
    
    const handleScanSuccess = (data: any) => {
        // Update personal details
        updatePersonal({
            firstName: data.name.split(' ')[0] || '',
            middleName: data.name.split(' ').slice(1, -1).join(' ') || '',
            lastName: data.name.split(' ').slice(-1)[0] || '',
            dob: data.dob,
            gender: data.gender,
            idProofType: 'Aadhaar',
            idProofNumber: data.aadhaarNumber
        });

        // Update address details for both present and permanent
        updateAddress({
            present: {
                line1: data.address.line1,
                city: data.address.city,
                state: data.address.state,
                country: 'India',
                pincode: data.address.pincode,
                verifiedStatus: { country: true } // Assuming default verification
            },
            permanent: {
                line1: data.address.line1,
                city: data.address.city,
                state: data.address.state,
                country: 'India',
                pincode: data.address.pincode,
                verifiedStatus: { country: true }
            }
        });

        // toast.success('Aadhaar details scanned successfully!'); // Library not installed
        
        // Navigate directly to personal details page to see the result
        navigate('/onboarding/add/personal');
    };

    const handleClose = () => {
        navigate(-1); // Go back to previous page
    };

    return (
        <div className="w-full h-screen bg-black">
            <AadhaarQrScanner 
                onScanSuccess={handleScanSuccess} 
                onClose={handleClose} 
                isFullScreenPage={true}
            />
        </div>
    );
};

export default AadhaarScanPage;
