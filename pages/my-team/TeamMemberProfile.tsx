import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Download, Calendar, MapPin, Clock, 
  Navigation, Briefcase, ChevronRight, Info 
} from 'lucide-react';
import { 
  format, differenceInMinutes, startOfDay, endOfDay, 
  parseISO, isSameDay, addDays, subDays 
} from 'date-fns';
import { api } from '../../services/api';
import { User, AttendanceEvent } from '../../types';
import { calculateDistanceMeters, reverseGeocode } from '../../utils/locationUtils';

// Helper component to resolve GPS coordinates into a text address
const ResolveAddress: React.FC<{ lat: number, lng: number, fallback?: string | null }> = ({ lat, lng, fallback }) => {
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const resolve = async () => {
      // Only resolve if fallback is likely just coordinates or missing
      const needsResolution = !fallback || fallback.startsWith('GPS:') || fallback === 'Location Timeout' || fallback === 'Location Unavailable' || fallback === 'Unknown Site';
      if (!needsResolution) {
        setResolvedAddress(fallback);
        return;
      }

      try {
        setLoading(true);
        const address = await reverseGeocode(lat, lng);
        setResolvedAddress(address);
      } catch (err) {
        setResolvedAddress(fallback || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } finally {
        setLoading(false);
      }
    };
    resolve();
  }, [lat, lng, fallback]);

  if (loading) return <span className="animate-pulse text-accent/50 text-[10px]">Resolving address...</span>;
  return <span>{resolvedAddress || fallback || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>;
};

interface ActivitySegment {
  id: string;
  type: 'Work' | 'Travel';
  startTime: string;
  endTime: string;
  duration: string;
  durationMin: number;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  distance?: number; // in km
}

const TeamMemberProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<User | null>(null);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchMemberDetails();
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchActivityLog();
    }
  }, [id, selectedDate]);

  const fetchMemberDetails = async () => {
    try {
      const user = await api.getUserById(id!);
      if (user) setMember(user);
    } catch (err) {
      console.error('Error fetching user details:', err);
    }
  };
  const fetchActivityLog = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const data = await api.getLocationHistory(id, dateStr);
      setEvents(data);
    } catch (err) {
      console.error('Error fetching activity log:', err);
    } finally {
      setLoading(false);
    }
  };

  const timeline = useMemo(() => {
    if (events.length === 0) return [];

    // 1. Deduplicate and sort events
    const sorted = [...events]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .filter((e, i, arr) => {
        if (i === 0) return true;
        const prev = arr[i - 1];
        return e.type !== prev.type || e.timestamp !== prev.timestamp;
      });

    const workSegments: ActivitySegment[] = [];
    const travelSegments: ActivitySegment[] = [];

    // 2. Identify Work segments (Pairs of check-in -> check-out)
    let activeIn: AttendanceEvent | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const evt = sorted[i];
      if (evt.type === 'check-in') {
        if (!activeIn) {
          activeIn = evt;
        }
      } else if (evt.type === 'check-out') {
        if (activeIn) {
          const start = parseISO(activeIn.timestamp);
          const end = parseISO(evt.timestamp);
          const durationMin = Math.max(0, differenceInMinutes(end, start));

          // Improved location name fallback: use coordinates if site name is unknown
          let locName = activeIn.locationName || 'Unknown Site';
          if (locName === 'Unknown Site' && activeIn.latitude && activeIn.longitude) {
            locName = `GPS: ${activeIn.latitude.toFixed(4)}, ${activeIn.longitude.toFixed(4)}`;
          }

          workSegments.push({
            id: `work-${activeIn.id}`,
            type: 'Work',
            startTime: activeIn.timestamp,
            endTime: evt.timestamp,
            duration: `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`,
            durationMin,
            locationName: locName,
            latitude: activeIn.latitude,
            longitude: activeIn.longitude
          });
          activeIn = null;
        }
      }
    }

    // Handle open check-in (ongoing work)
    if (activeIn) {
      const isToday = isSameDay(selectedDate, new Date());
      const endTs = isToday ? new Date().toISOString() : endOfDay(parseISO(activeIn.timestamp)).toISOString();
      const start = parseISO(activeIn.timestamp);
      const end = parseISO(endTs);
      const durationMin = Math.max(0, differenceInMinutes(end, start));

      workSegments.push({
        id: `work-${activeIn.id}`,
        type: 'Work',
        startTime: activeIn.timestamp,
        endTime: endTs,
        duration: `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`,
        durationMin,
        locationName: activeIn.locationName || 'Unknown Site',
        latitude: activeIn.latitude,
        longitude: activeIn.longitude
      });
    }

    // 3. Identify Travel segments (Gaps between Work segments)
    for (let j = 0; j < workSegments.length - 1; j++) {
      const current = workSegments[j];
      const next = workSegments[j + 1];

      const start = parseISO(current.endTime);
      const end = parseISO(next.startTime);
      const durationMin = Math.max(0, differenceInMinutes(end, start));

      // Coordinate matching for distance
      const outEvt = sorted.find(e => e.timestamp === current.endTime && e.type === 'check-out');
      const inEvt = sorted.find(e => e.timestamp === next.startTime && e.type === 'check-in');

      let dist = 0;
      if (outEvt?.latitude && outEvt?.longitude && inEvt?.latitude && inEvt?.longitude) {
        dist = calculateDistanceMeters(
          outEvt.latitude, outEvt.longitude,
          inEvt.latitude, inEvt.longitude
        ) / 1000;
      }

      // Only show travel if there's significant distance OR duration
      if (durationMin > 0 || dist > 0.05) {
        travelSegments.push({
          id: `travel-${j}`,
          type: 'Travel',
          startTime: current.endTime,
          endTime: next.startTime,
          duration: `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`,
          durationMin,
          distance: Number(dist.toFixed(2))
        });
      }
    }

    // Combine and final sort
    return [...workSegments, ...travelSegments].sort((a, b) => 
      a.startTime.localeCompare(b.startTime)
    );
  }, [events, selectedDate]);

  const metrics = useMemo(() => {
    let totalDist = 0;
    let workMin = 0;
    let travelMin = 0;

    timeline.forEach(s => {
      if (s.type === 'Work') workMin += s.durationMin;
      if (s.type === 'Travel') {
        travelMin += s.durationMin;
        totalDist += s.distance || 0;
      }
    });

    return {
      totalDistance: totalDist.toFixed(2),
      workDuration: `${Math.floor(workMin / 60)}h ${workMin % 60}m`,
      travelTime: `${Math.floor(travelMin / 60)}h ${travelMin % 60}m`
    };
  }, [timeline]);

  const exportReport = () => {
    const csvContent = [
      ['Type', 'Start Time', 'End Time', 'Duration', 'Details/Location'].join(','),
      ...timeline.map(s => [
        s.type,
        format(parseISO(s.startTime), 'hh:mm a'),
        format(parseISO(s.endTime), 'hh:mm a'),
        s.duration,
        s.type === 'Work' ? `"${s.locationName}"` : `${s.distance} km`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Activity_Report_${member?.name}_${format(selectedDate, 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!member) return null;

  return (
    <div className="flex flex-col min-h-full bg-background p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-card rounded-full border border-border transition-colors text-muted hover:text-primary-text"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-primary-text">{member.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full font-medium">
                {member.role.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-muted">•</span>
              <span className="text-xs text-muted">{member.email}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={exportReport}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl hover:bg-accent/90 transition-all font-medium text-sm shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Report</span>
          </button>
          <div className="flex items-center gap-2 bg-card border border-border p-1 rounded-xl shadow-sm">
            <button 
              onClick={() => setSelectedDate(subDays(selectedDate, 1))}
              className="p-1 px-2 hover:bg-background rounded-lg text-muted"
            >
              &larr;
            </button>
            <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
              <Calendar className="w-4 h-4 text-accent" />
              {format(selectedDate, 'dd MMM, yyyy')}
            </div>
            <button 
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              disabled={isSameDay(selectedDate, new Date())}
              className="p-1 px-2 hover:bg-background rounded-lg text-muted disabled:opacity-30"
            >
              &rarr;
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Metrics */}
        <div className="lg:col-span-4 space-y-4">
          <MetricCard 
            title="Total Distance"
            value={`${metrics.totalDistance} km`}
            subtext="Traveled across segments"
            icon={<Navigation className="w-5 h-5" />}
            color="bg-blue-500"
          />
          <MetricCard 
            title="Work Duration"
            value={metrics.workDuration}
            subtext="Total time at site locations"
            icon={<Briefcase className="w-5 h-5" />}
            color="bg-green-500"
          />
          <MetricCard 
            title="Travel Time"
            value={metrics.travelTime}
            subtext="Total time spent commuting"
            icon={<MapPin className="w-5 h-5" />}
            color="bg-orange-500"
          />
          
          {/* Quick Info */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-bold text-primary-text mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-accent" />
              Day Insights
            </h3>
            <div className="space-y-3">
              <InsightItem label="First Check-in" value={events.find(e => e.type === 'check-in') ? format(parseISO(events.find(e => e.type === 'check-in')!.timestamp), 'hh:mm a') : 'N/A'} />
              <InsightItem label="Last Event" value={events.length > 0 ? format(parseISO(events[events.length - 1].timestamp), 'hh:mm a') : 'N/A'} />
              <InsightItem label="Sites Visited" value={new Set(timeline.filter(s => s.type === 'Work').map(s => s.locationName)).size.toString()} />
            </div>
          </div>
        </div>

        {/* Right: Timeline */}
        <div className="lg:col-span-8">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden min-h-[500px]">
            <h3 className="text-lg font-bold text-primary-text mb-6">Activity Timeline</h3>
            
            {loading ? (
              <div className="space-y-8 animate-pulse">
                {[1,2,3].map(i => (
                  <div key={i} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-slate-200" />
                    <div className="flex-1 h-20 bg-slate-100 rounded-xl" />
                  </div>
                ))}
              </div>
            ) : timeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted opacity-50">
                <Clock className="w-12 h-12 mb-3" />
                <p>No activity recorded for this day.</p>
              </div>
            ) : (
              <div className="relative space-y-2">
                {/* Vertical Line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-border via-border to-transparent" />
                
                {timeline.map((s, idx) => (
                  <div key={s.id} className="relative pl-10 pb-8 last:pb-0">
                    {/* Indicator Dot */}
                    <div className={`absolute left-0 top-1.5 w-8 h-8 rounded-full border-4 border-card flex items-center justify-center z-10 ${
                      s.type === 'Work' ? 'bg-green-500' : 'bg-orange-500'
                    }`}>
                      {s.type === 'Work' ? <Briefcase className="w-3 h-3 text-white" /> : <Navigation className="w-3 h-3 text-white" />}
                    </div>

                    <div className={`p-4 rounded-2xl border transition-all duration-300 ${
                      s.type === 'Work' 
                        ? 'bg-green-500/5 border-green-500/10 hover:border-green-500/30' 
                        : 'bg-orange-500/5 border-orange-500/10 hover:border-orange-500/30'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                            s.type === 'Work' ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'
                          }`}>
                            {s.type === 'Work' ? 'At Location' : 'Travel'}
                          </span>
                        <h4 className="font-bold text-primary-text">
                          {s.type === 'Work' ? (
                            s.latitude && s.longitude ? (
                              <ResolveAddress 
                                lat={s.latitude} 
                                lng={s.longitude} 
                                fallback={s.locationName} 
                              />
                            ) : s.locationName
                          ) : 'Travel to next stop'}
                        </h4>
                          {s.type === 'Work' && s.latitude && s.longitude && (
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-[10px] text-accent flex items-center hover:underline bg-accent/5 px-2 py-0.5 rounded-lg border border-accent/20"
                            >
                              <MapPin className="h-2.5 w-2.5 mr-1" /> View Map
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs font-medium text-muted">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {format(parseISO(s.startTime), 'hh:mm a')} - {format(parseISO(s.endTime), 'hh:mm a')}
                          </div>
                          <span className="bg-background px-2 py-0.5 rounded-lg border border-border">
                            {s.duration}
                          </span>
                        </div>
                      </div>

                      {s.type === 'Work' && s.latitude && (
                        <div className="flex items-center gap-4 text-xs text-muted">
                          <div className="flex items-center gap-1 capitalize">
                            <MapPin className="w-3.5 h-3.5 text-green-500" />
                            Lat: {s.latitude.toFixed(4)}, Lng: {s.longitude?.toFixed(4)}
                          </div>
                        </div>
                      )}

                      {s.type === 'Travel' && (
                        <div className="flex items-center gap-1 text-xs font-semibold text-orange-600">
                           <Navigation className="w-3.5 h-3.5" />
                           {s.distance} km
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button className="fixed bottom-8 right-8 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 hover:scale-110 transition-all duration-300 flex items-center justify-center z-50 group">
        <Navigation className="w-6 h-6 group-hover:rotate-12 transition-transform" />
      </button>
    </div>
  );
};

const MetricCard: React.FC<{ title: string; value: string; subtext: string; icon: React.ReactNode; color: string }> = ({ title, value, subtext, icon, color }) => (
  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow group">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-xl text-white shadow-sm ${color} group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-muted uppercase tracking-wider">{title}</p>
        <h4 className="text-xl font-extrabold text-primary-text">{value}</h4>
        <p className="text-[10px] text-muted mt-0.5">{subtext}</p>
      </div>
    </div>
  </div>
);

const InsightItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-muted">{label}</span>
    <span className="font-bold text-primary-text">{value}</span>
  </div>
);

export default TeamMemberProfile;
