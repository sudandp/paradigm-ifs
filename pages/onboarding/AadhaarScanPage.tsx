import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboardingStore } from '../../store/onboardingStore';
import AadhaarQrScanner from '../../components/onboarding/AadhaarQrScanner';
import toast, { Toaster } from 'react-hot-toast';

const AadhaarScanPage: React.FC = () => {
  const navigate = useNavigate();
  const store = useOnboardingStore();

  const handleScanSuccess = (aadhaarData: any) => {
    // Auto-fill the form with scanned Aadhaar data
    const nameParts = aadhaarData.name.split(' ');
    const firstName = formatNameToTitleCase(nameParts.shift() || '');
    const lastName = nameParts.pop() || '';
    const middleName = nameParts.join(' ');

    store.updatePersonal({
      firstName,
      lastName,
      middleName,
      preferredName: firstName,
      dob: aadhaarData.dob,
      gender: aadhaarData.gender,
      idProofType: 'Aadhaar',
      idProofNumber: aadhaarData.aadhaarNumber
    });

    store.updateAddress({
      present: {
        ...aadhaarData.address,
        country: 'India',
        verifiedStatus: {
          line1: true,
          city: true,
          state: true,
          pincode: true,
          country: true
        }
      },
      permanent: {
        ...aadhaarData.address,
        country: 'India'
      },
      sameAsPresent: true
    });

    store.setPersonalVerifiedStatus({
      name: true,
      dob: true,
      idProofNumber: true
    });

    toast.success('Aadhaar details extracted successfully!');
    
    // Navigate back to PreUpload page - it will now show the auto-filled bits or 
    // the user can proceed to personal details. 
    // Note: The original logic in PreUpload navigated to /onboarding/add/personal.
    // We'll mimic that here but go back first to ensure state is reflected.
    setTimeout(() => {
      navigate('/onboarding/pre-upload');
    }, 1500);
  };

  const handleClose = () => {
    navigate(-1);
  };

  const formatNameToTitleCase = (str: string) => {
    return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  };

  return (
    <div className="h-screen w-full bg-black">
      <Toaster position="top-center" reverseOrder={false} />
      <AadhaarQrScanner 
        onScanSuccess={handleScanSuccess} 
        onClose={handleClose} 
        isFullScreenPage={true} 
      />
    </div>
  );
};

export default AadhaarScanPage;
