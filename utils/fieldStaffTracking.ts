import { differenceInMinutes, parseISO } from 'date-fns';
import type { AttendanceEvent } from '../types';

export interface SiteTravelBreakdown {
  totalHours: number;
  siteHours: number;
  travelHours: number;
  sitePercentage: number;
  travelPercentage: number;
  siteVisits: number;
}

/**
 * Calculate site vs travel time from check-in/out events
 * 
 * Logic:
 * - Site time = Sum of (checkout - checkin) for each location
 * - Travel time = Sum of (next_checkin - previous_checkout)
 * 
 * @param events All check-in/check-out events for a day
 * @returns Breakdown of site vs travel time
 */
export function calculateSiteTravelTime(events: AttendanceEvent[]): SiteTravelBreakdown {
  // Filter only check-in and check-out events, sort by time
  const checkEvents = events
    .filter(e => e.type === 'check-in' || e.type === 'check-out')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let totalSiteMinutes = 0;
  let totalTravelMinutes = 0;
  let siteVisits = 0;
  let lastCheckout: Date | null = null;
  let lastCheckin: Date | null = null;

  for (const event of checkEvents) {
    const eventTime = new Date(event.timestamp);

    if (event.type === 'check-in') {
      // If there was a previous checkout, calculate travel time
      if (lastCheckout) {
        const travelMinutes = differenceInMinutes(eventTime, lastCheckout);
        totalTravelMinutes += Math.max(0, travelMinutes);
      }
      lastCheckin = eventTime;
      siteVisits++;
    } else if (event.type === 'check-out') {
      // If there was a matching checkin, calculate site time
      if (lastCheckin) {
        const siteMinutes = differenceInMinutes(eventTime, lastCheckin);
        totalSiteMinutes += Math.max(0, siteMinutes);
        lastCheckin = null; // Reset checkin
      }
      lastCheckout = eventTime;
    }
  }

  const totalMinutes = totalSiteMinutes + totalTravelMinutes;
  const totalHours = totalMinutes / 60;
  const siteHours = totalSiteMinutes / 60;
  const travelHours = totalTravelMinutes / 60;

  return {
    totalHours,
    siteHours,
    travelHours,
    sitePercentage: totalMinutes > 0 ? (totalSiteMinutes / totalMinutes) * 100 : 0,
    travelPercentage: totalMinutes > 0 ? (totalTravelMinutes / totalMinutes) * 100 : 0,
    siteVisits,
  };
}

/**
 * Validate field staff attendance against site percentage rules
 */
export function validateFieldStaffAttendance(
  breakdown: SiteTravelBreakdown,
  rules: {
    minimumSitePercentage: number;
    minimumHoursFullDay: number;
    minimumHoursHalfDay: number;
  }
): {
  isValid: boolean;
  violations: string[];
  status: 'P' | '1/2P' | 'A';
} {
  const violations: string[] = [];
  
  // Check site percentage
  if (breakdown.sitePercentage < rules.minimumSitePercentage) {
    violations.push('site_time_low');
  }
  
  // Check total hours
  let status: 'P' | '1/2P' | 'A' = 'A';
  if (breakdown.totalHours >= rules.minimumHoursFullDay) {
    status = 'P';
  } else if (breakdown.totalHours >= rules.minimumHoursHalfDay) {
    status = '1/2P';
    if (!violations.includes('insufficient_hours')) {
      violations.push('insufficient_hours');
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    status,
  };
}
