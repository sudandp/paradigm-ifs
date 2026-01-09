import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Organization, BiometricDevice } from '../../types';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Toast from '../../components/ui/Toast';
import { Cpu, Plus, Trash2, Wifi, WifiOff, MapPin, RefreshCw, Settings } from 'lucide-react';

const ManageDevices: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [newDevice, setNewDevice] = useState({
    sn: '',
    name: '',
    organizationId: '',
    locationName: ''
  });
  const [editingDevice, setEditingDevice] = useState<BiometricDevice | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [devicesData, orgsData] = await Promise.all([
        api.getBiometricDevices(),
        api.getOrganizations()
      ]);
      setDevices(devicesData);
      setOrganizations(orgsData);
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      setToast({ message: 'Failed to load devices.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveDevice = async () => {
    const source = editingDevice || newDevice;
    
    if (!source.sn || !source.name) {
      setToast({ message: 'Serial Number and Name are required.', type: 'error' });
      return;
    }

    // Surgical payload: only send fields that are actually in the table and relevant for updates/inserts
    const payload = {
      sn: source.sn,
      name: source.name,
      organizationId: source.organizationId === '' ? null : source.organizationId,
      locationName: source.locationName === '' ? null : source.locationName,
    };

    try {
      if (editingDevice) {
        await api.updateBiometricDevice(editingDevice.id, payload);
        setToast({ message: 'Device updated successfully.', type: 'success' });
      } else {
        await api.addBiometricDevice(payload);
        setToast({ message: 'Device added successfully.', type: 'success' });
      }
      setIsAddModalOpen(false);
      setEditingDevice(null);
      setNewDevice({ sn: '', name: '', organizationId: '', locationName: '' });
      fetchData();
    } catch (error: any) {
      console.error('Save error:', error);
      setToast({ message: error.message || 'Failed to save device.', type: 'error' });
    }
  };

  const handleEditDevice = (device: any) => {
    setEditingDevice(device);
    setIsAddModalOpen(true);
  };

  const handleDeleteDevice = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this device?')) return;
    try {
      await api.deleteBiometricDevice(id);
      setToast({ message: 'Device deleted successfully.', type: 'success' });
      fetchData();
    } catch (error) {
      setToast({ message: 'Failed to delete device.', type: 'error' });
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary-text">Biometric Devices</h1>
          <p className="text-muted">Manage your eSSL AiFace-Mars devices across all sites.</p>
        </div>
        <Button onClick={() => { setEditingDevice(null); setIsAddModalOpen(true); }} className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Device
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse bg-card rounded-xl h-48"></div>
          ))
        ) : devices.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-card rounded-xl border border-dashed border-border">
            <Cpu className="h-12 w-12 mx-auto text-muted mb-4" />
            <p className="text-muted text-lg">No devices found. Add your first device to get started.</p>
          </div>
        ) : (
          devices.map((device) => (
            <div key={device.id} className="bg-card rounded-xl shadow-card p-6 border border-border hover:border-accent transition-colors relative">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-lg ${device.status === 'online' ? 'bg-emerald-500/10' : 'bg-gray-500/10'}`}>
                  {device.status === 'online' ? (
                    <Wifi className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <WifiOff className="h-6 w-6 text-gray-400" />
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditDevice(device)}
                    className="p-2 text-muted hover:text-accent transition-colors"
                  >
                    <Settings className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteDevice(device.id)}
                    className="p-2 text-muted hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-bold text-primary-text mb-1">{device.name}</h3>
              <p className="text-sm font-mono text-muted mb-4">SN: {device.sn}</p>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <MapPin className="h-4 w-4" />
                  <span>{device.locationName || device.organization?.shortName || 'Unassigned Site'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted">
                  <RefreshCw className="h-4 w-4" />
                  <span>Last seen: {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'Never'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${device.status === 'online' ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                <span className={`text-xs font-semibold uppercase tracking-wider ${device.status === 'online' ? 'text-emerald-500' : 'text-gray-400'}`}>
                  {device.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onConfirm={handleSaveDevice}
        title={editingDevice ? "Edit Biometric Device" : "Add New Biometric Device"}
        confirmButtonText={editingDevice ? "Save Changes" : "Add Device"}
        confirmButtonVariant="primary"
      >
        <div className="space-y-4 py-4">
          <Input
            label="Serial Number (SN)"
            value={editingDevice ? editingDevice.sn : newDevice.sn}
            onChange={(e) => editingDevice ? setEditingDevice({ ...editingDevice, sn: e.target.value }) : setNewDevice({ ...newDevice, sn: e.target.value })}
            placeholder="e.g. CI987654321"
            required
            disabled={!!editingDevice}
          />
          <Input
            label="Device Name"
            value={editingDevice ? editingDevice.name : newDevice.name}
            onChange={(e) => editingDevice ? setEditingDevice({ ...editingDevice, name: e.target.value }) : setNewDevice({ ...newDevice, name: e.target.value })}
            placeholder="e.g. Main Gate Arrival"
            required
          />
          <Input
            label="Manual Site (Optional)"
            value={editingDevice ? (editingDevice.locationName || '') : newDevice.locationName}
            onChange={(e) => editingDevice ? setEditingDevice({ ...editingDevice, locationName: e.target.value }) : setNewDevice({ ...newDevice, locationName: e.target.value })}
            placeholder="e.g. South Entry Gate"
          />
          <div className="text-xs text-muted -mt-2">If manual site is entered, it will override organization name in attendance logs.</div>
          
          <Select
            label="Assign Site (Organization)"
            value={editingDevice ? (editingDevice.organizationId || '') : newDevice.organizationId}
            onChange={(e) => editingDevice ? setEditingDevice({ ...editingDevice, organizationId: e.target.value }) : setNewDevice({ ...newDevice, organizationId: e.target.value })}
          >
            <option value="">Select a Site</option>
            {organizations.map(org => (
              <option key={org.id} value={org.id}>{org.shortName}</option>
            ))}
          </Select>
        </div>
      </Modal>
    </div>
  );
};

export default ManageDevices;
