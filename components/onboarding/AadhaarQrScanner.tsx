import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';
import Button from '../ui/Button';

interface AadhaarData {
    name: string;
    dob: string;
    gender: string;
    address: {
        line1: string;
        city: string;
        state: string;
        pincode: string;
    };
    aadhaarNumber: string;
    photo?: string;
}

interface AadhaarQrScannerProps {
    onScanSuccess: (data: AadhaarData) => void;
    onClose: () => void;
}

const AadhaarQrScanner: React.FC<AadhaarQrScannerProps> = ({ onScanSuccess, onClose }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const qrCodeRegionId = "qr-reader";

    useEffect(() => {
        startScanner();
        return () => {
            stopScanner();
        };
    }, []);

    const parseAadhaarQR = (qrText: string): AadhaarData | null => {
        try {
            // Aadhaar QR format: It's either XML or a pipe-separated format
            // New format (Secure QR): Contains signed XML data
            // Old format: Pipe-separated values
            
            if (qrText.includes('<?xml')) {
                // XML format - parse the PrintLetterBarcodeData
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(qrText, 'text/xml');
                
                const uid = xmlDoc.querySelector('uid')?.textContent || '';
                const name = xmlDoc.querySelector('name')?.textContent || '';
                const dob = xmlDoc.querySelector('dob')?.textContent || '';
                const gender = xmlDoc.querySelector('gender')?.textContent || '';
                const co = xmlDoc.querySelector('co')?.textContent || '';
                const house = xmlDoc.querySelector('house')?.textContent || '';
                const street = xmlDoc.querySelector('street')?.textContent || '';
                const lm = xmlDoc.querySelector('lm')?.textContent || '';
                const loc = xmlDoc.querySelector('loc')?.textContent || '';
                const vtc = xmlDoc.querySelector('vtc')?.textContent || '';
                const po = xmlDoc.querySelector('po')?.textContent || '';
                const dist = xmlDoc.querySelector('dist')?.textContent || '';
                const subdist = xmlDoc.querySelector('subdist')?.textContent || '';
                const state = xmlDoc.querySelector('state')?.textContent || '';
                const pc = xmlDoc.querySelector('pc')?.textContent || '';

                // Build address line
                const addressParts = [co, house, street, lm, loc, po, subdist].filter(Boolean);
                const line1 = addressParts.join(', ');

                return {
                    name,
                    dob: formatDobToISO(dob),
                    gender: formatGender(gender),
                    address: {
                        line1,
                        city: vtc || dist,
                        state,
                        pincode: pc
                    },
                    aadhaarNumber: uid
                };
            } else {
                // Pipe-separated format: UID|Name|DOB|Gender|Address components...
                const parts = qrText.split('|');
                if (parts.length < 4) {
                    throw new Error('Invalid Aadhaar QR format');
                }

                const [uid, name, dob, gender, ...addressParts] = parts;
                
                return {
                    name,
                    dob: formatDobToISO(dob),
                    gender: formatGender(gender),
                    address: {
                        line1: addressParts.slice(0, -3).join(', '),
                        city: addressParts[addressParts.length - 3] || '',
                        state: addressParts[addressParts.length - 2] || '',
                        pincode: addressParts[addressParts.length - 1] || ''
                    },
                    aadhaarNumber: uid
                };
            }
        } catch (err) {
            console.error('Error parsing Aadhaar QR:', err);
            return null;
        }
    };

    const formatDobToISO = (dob: string): string => {
        // Aadhaar DOB format is typically DD-MM-YYYY or DD/MM/YYYY
        if (!dob) return '';
        const parts = dob.split(/[-/]/);
        if (parts.length === 3) {
            const [day, month, year] = parts;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return dob;
    };

    const formatGender = (gender: string): string => {
        const g = gender.toUpperCase();
        if (g === 'M' || g === 'MALE') return 'Male';
        if (g === 'F' || g === 'FEMALE') return 'Female';
        return 'Other';
    };

    const startScanner = async () => {
        try {
            setIsScanning(true);
            setError(null);

            const html5QrCode = new Html5Qrcode(qrCodeRegionId);
            scannerRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                },
                (decodedText) => {
                    const parsedData = parseAadhaarQR(decodedText);
                    if (parsedData) {
                        stopScanner();
                        onScanSuccess(parsedData);
                    } else {
                        setError('Invalid Aadhaar QR code. Please try again.');
                    }
                },
                (errorMessage) => {
                    // Ignore continuous scanning errors
                }
            );
        } catch (err: any) {
            console.error('Scanner error:', err);
            setError(`Camera access denied or unavailable: ${err.message}`);
            setIsScanning(false);
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
                scannerRef.current.clear();
            } catch (err) {
                console.error('Error stopping scanner:', err);
            }
        }
        setIsScanning(false);
    };

    const handleClose = () => {
        stopScanner();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Camera className="h-5 w-5 text-accent" />
                        <h3 className="text-lg font-bold text-primary-text">Scan Aadhaar QR Code</h3>
                    </div>
                    <button onClick={handleClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6">
                    <div id={qrCodeRegionId} className="rounded-lg overflow-hidden border-2 border-accent/30"></div>
                    
                    {error && (
                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    <div className="mt-4 text-center text-sm text-muted">
                        <p>Position the QR code from the back of the Aadhaar card within the frame.</p>
                        <p className="mt-1">The scanner will automatically detect and extract details.</p>
                    </div>

                    <div className="mt-6">
                        <Button variant="secondary" onClick={handleClose} className="w-full">
                            Cancel
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AadhaarQrScanner;
