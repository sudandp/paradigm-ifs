import React, { useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import type { Company, UploadedFile } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import UploadDocument from '../UploadDocument';

interface CompanyFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Company>, file?: File) => void;
  initialData: Partial<Company> | null;
  groupName: string;
  existingLocations: string[];
}

const companySchema = yup.object({
  id: yup.string(),
  name: yup.string().required('Company / LLP / Partnership / Society Name is required'),
  location: yup.string().required('Location is required'),
  address: yup.string().required('Address is required'),
}).defined();

const CompanyForm: React.FC<CompanyFormProps> = ({ isOpen, onClose, onSave, initialData, groupName, existingLocations }) => {
  const [logoFile, setLogoFile] = React.useState<UploadedFile | null>(null);
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm<Partial<Company>>({
    resolver: yupResolver(companySchema) as any,
  });

  const isEditing = !!initialData;

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset(initialData);
        if (initialData.logoUrl) {
            setLogoFile({ preview: initialData.logoUrl, name: 'Current Logo', type: 'image/jpeg', size: 0 } as UploadedFile);
        } else {
            setLogoFile(null);
        }
      } else {
        reset({ name: '', location: '', address: '' });
        setLogoFile(null);
      }
    }
  }, [initialData, reset, isOpen]);

  const onSubmit: SubmitHandler<Partial<Company>> = (data) => {
    onSave(data, logoFile?.file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-card p-6 w-full max-w-lg my-8 mx-auto animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-6">
            <h3 className="text-xl font-bold text-primary-text">{isEditing ? 'Edit Company / LLP / Partnership / Society' : 'Add Company / LLP / Partnership / Society'}</h3>
            <p className="text-sm text-muted">for {groupName}</p>
          </div>
          
          <div className="space-y-4 min-h-[250px]">
            <div>
              <Input
                label="Location (Select or Type New)"
                id="location"
                list="existing-locations"
                registration={register('location')}
                error={errors.location?.message}
                placeholder="e.g. Bangalore"
              />
              <datalist id="existing-locations">
                {existingLocations.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>
            
            <Input
              label="Address (Full)"
              id="address"
              registration={register('address')}
              error={errors.address?.message}
              placeholder="e.g. 123 Main St, Bangalore, India"
            />
            
            <div className="mb-4">
              <UploadDocument
                label="Company Logo"
                file={logoFile}
                onFileChange={setLogoFile}
                allowedTypes={['image/jpeg', 'image/png', 'image/webp']}
              />
            </div>

            <Input
              label="Company / LLP / Partnership / Society Name"
              id="name"
              registration={register('name')}
              error={errors.name?.message}
              placeholder="Legal name of the entity"
            />
          </div>
          <div className="mt-8 pt-4 border-t border-border flex justify-end space-x-3">
            <Button type="button" onClick={onClose} variant="secondary">Cancel</Button>
            <Button type="submit">{isEditing ? 'Save Changes' : 'Add'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompanyForm;
