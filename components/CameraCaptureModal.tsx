import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, Check, X, Loader2, Zap, ZapOff, Sun, Crop, ZoomIn, ZoomOut, ArrowLeft } from 'lucide-react';
import Button from './ui/Button';
import { api } from '../services/api';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Image: string, mimeType: string) => void;
  captureGuidance?: 'document' | 'profile' | 'none';
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', error => reject(error));
    image.src = url;
  });

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('No 2d context');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/jpeg', 0.9);
}

const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({ isOpen, onClose, onCapture, captureGuidance = 'none' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');

  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isFlashSupported, setIsFlashSupported] = useState(false);
  const [isScreenFlashOn, setIsScreenFlashOn] = useState(false);
  const [isScreenFlashActive, setIsScreenFlashActive] = useState(false);
  const [facingMode, setFacingMode] = useState<string | undefined>();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    stopCamera();
    setCapturedImage(null);
    setShowCropper(false);
    setIsFlashOn(false);
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);

      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities();
        setIsFlashSupported(!!(capabilities as any).torch);
        setFacingMode(videoTrack.getSettings().facingMode);
      } else {
        setIsFlashSupported(false);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please check permissions.");
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let isCancelled = false;

    const initializeAndStartCamera = async () => {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (isCancelled) {
          tempStream.getTracks().forEach(track => track.stop());
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        tempStream.getTracks().forEach(track => track.stop());

        if (isCancelled) return;
        setCameras(videoDevices);

        if (videoDevices.length > 0) {
          let cameraIndexToUse = currentCameraIndex;
          if (cameraIndexToUse >= videoDevices.length) cameraIndexToUse = 0;
          await startCamera(videoDevices[cameraIndexToUse].deviceId);
        } else {
          setError("No camera found.");
        }
      } catch (err) {
        console.error(err);
        setError("Could not access camera.");
      }
    };

    initializeAndStartCamera();
    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [isOpen, currentCameraIndex, startCamera, stopCamera]);

  const captureImageFromVideo = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      setCapturedImage(canvas.toDataURL('image/jpeg', 0.9));
      stopCamera();
    }
  };

  const handleCapture = () => {
    if (facingMode === 'user' && isScreenFlashOn) {
      setIsScreenFlashActive(true);
      setTimeout(() => {
        captureImageFromVideo();
        setIsScreenFlashActive(false);
      }, 100);
    } else {
      captureImageFromVideo();
    }
  };

  const handleRetake = () => {
    setError(null);
    setCapturedImage(null);
    setCroppedImage(null);
    setShowCropper(false);
    setZoom(1);
  };

  const handleToggleFlash = async () => {
    if (!streamRef.current || !isFlashSupported) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: !isFlashOn } as any] });
      setIsFlashOn(!isFlashOn);
    } catch (err) {
      console.error('Failed to toggle flash', err);
    }
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleShowCropper = () => {
    setShowCropper(true);
    setZoom(1);
  };

  const handleApplyCrop = async () => {
    try {
      if (capturedImage && croppedAreaPixels) {
        const croppedImg = await getCroppedImg(capturedImage, croppedAreaPixels);
        setCroppedImage(croppedImg);
        setShowCropper(false);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to crop image');
    }
  };

  const handleCancelCrop = () => {
    setShowCropper(false);
    setZoom(1);
    setCroppedImage(null);
  };

  const handleUsePhoto = async () => {
    const imageToUse = croppedImage || capturedImage;
    if (imageToUse) {
      setIsProcessing(true);
      try {
        const originalBase64 = imageToUse.split(',')[1];
        setProcessingMessage("Enhancing photo...");
        const enhancedBase64 = captureGuidance === 'document'
          ? await api.enhanceDocumentPhoto(originalBase64, 'image/jpeg') : null;
        const finalBase64 = enhancedBase64 || originalBase64;
        onCapture(finalBase64, 'image/jpeg');
        onClose();
      } catch (err: any) {
        setError(err.message || 'Processing failed.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  const displayImage = croppedImage || capturedImage;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black text-white">
      {isScreenFlashActive && <div className="absolute inset-0 bg-white z-50"></div>}
      {isProcessing && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80">
          <Loader2 className="h-12 w-12 animate-spin text-white" />
          <p className="mt-4 text-lg font-semibold">{processingMessage}</p>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent z-30 flex justify-between items-center">
        <Button variant="icon" className="!text-white hover:!bg-white/20 !p-2" onClick={handleClose}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h3 className="text-lg font-bold flex-1 text-center">
          {showCropper ? 'Crop Photo' : capturedImage ? 'Preview' : 'Capture Photo'}
        </h3>
        <div className="w-10"></div>
      </div>

      <div className="flex-grow relative flex items-center justify-center overflow-hidden bg-black">
        {error && !capturedImage && (
          <div className="absolute inset-0 flex items-center justify-center text-white p-4 text-center bg-black/50 z-10">{error}</div>
        )}

        {showCropper && capturedImage ? (
          <div className="absolute inset-0">
            <Cropper
              image={capturedImage}
              crop={crop}
              zoom={zoom}
              aspect={captureGuidance === 'profile' ? 1 : 4 / 3}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              cropShape={captureGuidance === 'profile' ? 'round' : 'rect'}
              style={{
                containerStyle: {
                  backgroundColor: 'transparent',
                },
                mediaStyle: {
                  objectFit: 'contain',
                },
              }}
              classes={{
                containerClassName: 'bg-black/30',
              }}
            />
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${capturedImage ? 'hidden' : ''}`} />
            {displayImage && <img src={displayImage} alt="Preview" className="w-full h-full object-contain" />}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent z-30">
        {error && !capturedImage && <div className="mb-2 p-3 bg-red-500/30 text-white text-sm rounded-lg text-center">{error}</div>}

        {showCropper && (
          <div className="mb-4 px-4">
            <div className="flex items-center gap-3">
              <ZoomOut className="h-5 w-5 text-white/70" />
              <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 h-1 bg-white/20 rounded-lg" />
              <ZoomIn className="h-5 w-5 text-white/70" />
            </div>
          </div>
        )}

        <div className="flex justify-around items-center">
          {showCropper ? (
            <>
              <Button onClick={handleCancelCrop} variant="secondary" size="lg" className="!rounded-full !px-6">Cancel</Button>
              <Button onClick={handleApplyCrop} size="lg" className="!rounded-full !px-6"><Check className="h-5 w-5 mr-2" /> Apply</Button>
            </>
          ) : capturedImage ? (
            <>
              <Button onClick={handleRetake} variant="secondary" size="lg" className="!rounded-full !p-4"><RefreshCw className="h-6 w-6" /></Button>
              <Button onClick={handleShowCropper} variant="secondary" size="lg" className="!rounded-full !p-4"><Crop className="h-6 w-6" /></Button>
              <Button onClick={handleUsePhoto} size="lg" className="!rounded-full !p-4"><Check className="h-6 w-6" /></Button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 flex items-center justify-center">
                {facingMode === 'environment' && isFlashSupported && (
                  <Button onClick={handleToggleFlash} variant="icon" className="!text-white hover:!bg-white/20 !rounded-full !p-3">
                    {isFlashOn ? <ZapOff className="h-6 w-6" /> : <Zap className="h-6 w-6" />}
                  </Button>
                )}
                {facingMode === 'user' && (
                  <Button onClick={() => setIsScreenFlashOn(!isScreenFlashOn)} variant="icon" className={`!rounded-full !p-3 ${isScreenFlashOn ? '!text-yellow-400' : '!text-white'} hover:!bg-white/20`}>
                    <Sun className="h-6 w-6" />
                  </Button>
                )}
              </div>
              <Button onClick={handleCapture} disabled={!!error || !streamRef.current} size="lg" className="!rounded-full !w-20 !h-20"><Camera className="h-8 w-8" /></Button>
              <div className="w-16 h-16 flex items-center justify-center">
                {cameras.length > 1 && (
                  <Button onClick={() => setCurrentCameraIndex(i => (i + 1) % cameras.length)} variant="icon" className="!text-white hover:!bg-white/20 !rounded-full !p-3">
                    <RefreshCw className="h-6 w-6" />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraCaptureModal;
