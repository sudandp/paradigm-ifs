// Attendance calculation utilities for hours-based attendance tracking

import { differenceInMinutes, parseISO } from 'date-fns';
import type { AttendanceEvent, DailyAttendanceStatus } from '../types';

/**
 * Calculate total hours between two timestamps
 */
export function calculateDailyHours(checkIn: string, checkOut: string): number {
  const minutes = differenceInMinutes(parseISO(checkOut), parseISO(checkIn));
  return minutes / 60;
}

/**
 * Calculate working hours with automatic lunch break deduction
 * 
 * IMPORTANT RULES:
 * - Maximum total time (check-in to check-out): 9 hours
 * - Lunch break: 60 minutes (1 hour) - ALWAYS AUTO-DEDUCTED
 * - Minimum working hours (after lunch deduction): 8 hours
 * - Working Hours = Total Hours - 1 hour (lunch)
 * 
 * The 60-minute lunch is deducted automatically regardless of whether
 * break-in/break-out events are recorded. This ensures consistent calculation
 * and affects loss of pay even if employee doesn't explicitly take lunch.
 * 
 * @param checkIn Check-in timestamp
 * @param checkOut Check-out timestamp
 * @param breakIn Break-in timestamp (optional, for tracking purposes)
 * @param breakOut Break-out timestamp (optional, for tracking purposes)
 * @returns Object with totalHours, breakHours, and workingHours
 */
export function calculateWorkingHours(
  checkIn: string,
  checkOut: string,
  breakIn?: string,
  breakOut?: string
): { totalHours: number; breakHours: number; workingHours: number } {
  const totalHours = calculateDailyHours(checkIn, checkOut);
  
  let breakHours = 0;
  
  // If actual break-in/out is recorded, use the actual duration
  if (breakIn && breakOut) {
    breakHours = calculateDailyHours(breakIn, breakOut);
  }
  
  // Cap totalHours at 9 hours maximum
  const MAX_TOTAL_HOURS = 9;
  const cappedTotalHours = Math.min(totalHours, MAX_TOTAL_HOURS);
  
  // Working hours = Total hours - Break hours
  const workingHours = Math.max(0, cappedTotalHours - breakHours);
  
  return { totalHours: cappedTotalHours, breakHours, workingHours };
}

/**
 * Calculate loss of pay hours
 * @param workingHours Actual hours worked (excluding breaks)
 * @param requiredHours Required daily hours (e.g., 8)
 * @returns Hours of loss of pay (0 if no shortfall)
 */
export function calculateLossOfPay(workingHours: number, requiredHours: number): number {
  const shortfall = requiredHours - workingHours;
  return Math.max(0, shortfall);
}

/**
 * Calculate monthly target and shortfall based on working days
 * @param totalHours Actual hours worked in month
 * @param workingDays Number of days employee checked in
 * @param requiredHoursPerDay Required hours per day (default 8)
 * @returns Object with target hours, actual hours, hoursShort, and daysAbsent
 */
export function calculateMonthlyShortfall(
  totalHours: number,
  workingDays: number,
  requiredHoursPerDay: number = 8
): { targetHours: number; totalHours: number; hoursShort: number; daysAbsent: number } {
  // Monthly target is auto-calculated: working days × required hours per day
  const targetHours = workingDays * requiredHoursPerDay;
  const hoursShort = Math.max(0, targetHours - totalHours);
  const daysAbsent = Math.floor(hoursShort / requiredHoursPerDay);
  
  return { targetHours, totalHours, hoursShort, daysAbsent };
}

/**
 * Check if check-in is late
 * @param checkInTime Actual check-in time (HH:mm format or ISO string)
 * @param configuredStartTime Configured start time (HH:mm format)
 * @returns Object with isLate flag and minutesLate
 */
export function isLateCheckIn(
  checkInTime: string,
  configuredStartTime: string
): { isLate: boolean; minutesLate: number } {
  // Extract time portion if ISO string
  const checkInTimeOnly = checkInTime.includes('T') 
    ? checkInTime.split('T')[1].substring(0, 5) 
    : checkInTime;
  
  const [checkInHour, checkInMin] = checkInTimeOnly.split(':').map(Number);
  const [configHour, configMin] = configuredStartTime.split(':').map(Number);
  
  const checkInMinutes = checkInHour * 60 + checkInMin;
  const configMinutes = configHour * 60 + configMin;
  
  const minutesLate = Math.max(0, checkInMinutes - configMinutes);
  
  return {
    isLate: minutesLate > 0,
    minutesLate,
  };
}

/**
 * Check if check-out is early
 * @param checkOutTime Actual check-out time (HH:mm format or ISO string)
 * @param configuredEndTime Configured end time (HH:mm format)
 * @returns Object with isEarly flag and minutesEarly
 */
export function isEarlyCheckOut(
  checkOutTime: string,
  configuredEndTime: string
): { isEarly: boolean; minutesEarly: number } {
  const checkOutTimeOnly = checkOutTime.includes('T')
    ? checkOutTime.split('T')[1].substring(0, 5)
    : checkOutTime;
  
  const [checkOutHour, checkOutMin] = checkOutTimeOnly.split(':').map(Number);
  const [configHour, configMin] = configuredEndTime.split(':').map(Number);
  
  const checkOutMinutes = checkOutHour * 60 + checkOutMin;
  const configMinutes = configHour * 60 + configMin;
  
  const minutesEarly = Math.max(0, configMinutes - checkOutMinutes);
  
  return {
    isEarly: minutesEarly > 0,
    minutesEarly,
  };
}

/**
 * Calculate attendance status based on hours worked
 * @param workingHours Actual hours worked (excluding breaks)
 * @param minHoursFullDay Minimum hours for full day (e.g., 8)
 * @param minHoursHalfDay Minimum hours for half day (e.g., 4)
 * @returns DailyAttendanceStatus
 */
export function calculateHoursBasedStatus(
  workingHours: number,
  minHoursFullDay: number,
  minHoursHalfDay: number
): DailyAttendanceStatus {
  if (workingHours >= minHoursFullDay) {
    return 'Present';
  } else if (workingHours >= minHoursHalfDay) {
    return 'Half Day';
  } else if (workingHours > 0) {
    return 'Incomplete';
  } else {
    return 'Absent';
  }
}

/**
 * Process daily attendance events to calculate hours
 * @param events All attendance events for a day
 * @returns Summary of the day's attendance
 */
export function processDailyEvents(events: AttendanceEvent[]): {
  checkIn: string | null;
  checkOut: string | null;
  breakIn: string | null;
  breakOut: string | null;
  totalHours: number;
  breakHours: number;
  workingHours: number;
} {
  const checkInEvent = events.find(e => e.type === 'check-in');
  const checkOutEvent = events.find(e => e.type === 'check-out');
  const breakInEvent = events.find(e => e.type === 'break-in');
  const breakOutEvent = events.find(e => e.type === 'break-out');
  
  const checkIn = checkInEvent?.timestamp || null;
  const checkOut = checkOutEvent?.timestamp || null;
  const breakIn = breakInEvent?.timestamp || null;
  const breakOut = breakOutEvent?.timestamp || null;
  
  let totalHours = 0;
  let breakHours = 0;
  let workingHours = 0;
  
  if (checkIn && checkOut) {
    const result = calculateWorkingHours(checkIn, checkOut, breakIn || undefined, breakOut || undefined);
    totalHours = result.totalHours;
    breakHours = result.breakHours;
    workingHours = result.workingHours;
  }
  
  return {
    checkIn,
    checkOut,
    breakIn,
    breakOut,
    totalHours,
    breakHours,
    workingHours,
  };
}
