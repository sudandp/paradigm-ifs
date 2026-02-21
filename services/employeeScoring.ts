/**
 * Employee Scoring Service
 * 
 * Calculates Performance, Attendance, and Response scores using existing
 * attendance_events and tasks data. Scores are 0–100 and stored monthly.
 * 
 * Formulas:
 *   Performance = (completedTasks/assignedTasks)*40 + (onTimeCompletion%)*40 + 20 (quality placeholder)
 *   Attendance  = (presentDays/workingDays)*100 - (lateDays*5)   [clamped 0–100]
 *   Response    = (taskAcceptanceSpeed)*50 + (checkInCompliance)*50
 *   Overall     = weighted sum based on role
 */

import { supabase } from './supabase';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, differenceInMinutes, differenceInDays } from 'date-fns';
import type { EmployeeScore, RoleCategory, RoleWeights, Task, AttendanceEvent } from '../types';
import { isLateCheckIn } from '../utils/attendanceCalculations';

// Role-based weight configuration
const ROLE_WEIGHTS: Record<RoleCategory, RoleWeights> = {
  office_staff: { performance: 0.5, attendance: 0.3, response: 0.2 },
  field_staff:  { performance: 0.4, attendance: 0.4, response: 0.2 },
  support:      { performance: 0.4, attendance: 0.2, response: 0.4 },
};

/**
 * Map a user role string to a RoleCategory for weight selection
 */
function getRoleCategory(role: string): RoleCategory {
  switch (role) {
    case 'field': return 'field_staff';
    case 'support': return 'support';
    default: return 'office_staff';
  }
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Normalize an attendance event type string for comparison.
 * The DB stores values like 'check in', 'check-in', 'Check In', etc.
 * We normalize to lowercase with no separators: 'checkin', 'checkout', 'breakin', 'breakout'
 */
function isCheckInEvent(type: string): boolean {
  const normalized = (type || '').toLowerCase().replace(/[-_\s]/g, '');
  return normalized === 'checkin';
}

// ─── Performance Score ──────────────────────────────────────────────

async function calculatePerformanceScore(
  userId: string,
  monthStart: string,
  monthEnd: string
): Promise<number> {
  // Fetch tasks assigned to this user within the month
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to_id', userId)
    .gte('created_at', monthStart)
    .lte('created_at', monthEnd);

  if (error || !tasks || tasks.length === 0) {
    // No tasks assigned → neutral score
    return 80;
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t: any) => t.status === 'Done').length;
  
  // Task completion rate (40%)
  const completionRate = (completedTasks / totalTasks) * 40;

  // On-time completion (40%) — tasks completed before or on due date
  const tasksWithDueDate = tasks.filter((t: any) => t.due_date && t.status === 'Done');
  let onTimeRate = 40; // Default full marks if no due dates set
  if (tasksWithDueDate.length > 0) {
    const onTimeTasks = tasksWithDueDate.filter((t: any) => {
      const completedAt = t.updated_at || t.created_at;
      return completedAt <= t.due_date;
    });
    onTimeRate = (onTimeTasks.length / tasksWithDueDate.length) * 40;
  }

  // Quality placeholder (20%) — fixed at 80% until rating system exists
  const qualityScore = 16; // 80% of 20

  return clamp(completionRate + onTimeRate + qualityScore, 0, 100);
}

// ─── Attendance Score ───────────────────────────────────────────────

async function calculateAttendanceScore(
  userId: string,
  monthStart: Date,
  monthEnd: Date,
  configuredStartTime: string = '10:00'
): Promise<number> {
  // Get all attendance events for the month
  const { data: events, error } = await supabase
    .from('attendance_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', monthStart.toISOString())
    .lte('timestamp', monthEnd.toISOString())
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('[Scoring] Error fetching attendance events:', error);
    return 0;
  }

  // Calculate working days only up to today (future days haven't happened yet)
  const today = new Date();
  const effectiveEnd = monthEnd > today ? today : monthEnd;
  const allDays = eachDayOfInterval({ start: monthStart, end: effectiveEnd });
  const workingDays = allDays.filter(d => {
    const day = getDay(d);
    return day !== 0 && day !== 6; // Exclude Sunday and Saturday
  }).length;

  if (workingDays === 0) return 100;

  // Group events by date to count present days & late days
  const eventsByDate = new Map<string, any[]>();
  (events || []).forEach((e: any) => {
    const dateKey = format(parseISO(e.timestamp), 'yyyy-MM-dd');
    if (!eventsByDate.has(dateKey)) eventsByDate.set(dateKey, []);
    eventsByDate.get(dateKey)!.push(e);
  });

  // Count present days (days with at least one check-in)
  const presentDays = Array.from(eventsByDate.entries()).filter(([_, dayEvents]) =>
    dayEvents.some((e: any) => isCheckInEvent(e.type))
  ).length;

  // Count late days
  let lateDays = 0;
  eventsByDate.forEach((dayEvents) => {
    const firstCheckIn = dayEvents.find((e: any) => isCheckInEvent(e.type));
    if (firstCheckIn) {
      const checkInTime = format(parseISO(firstCheckIn.timestamp), 'HH:mm');
      const { isLate } = isLateCheckIn(checkInTime, configuredStartTime);
      if (isLate) lateDays++;
    }
  });

  // Formula: (presentDays / workingDays) * 100 - (lateDays * 2)
  // Late penalty is 2 points per day (mild, as punctuality is secondary to presence)
  const score = (presentDays / workingDays) * 100 - (lateDays * 2);
  return clamp(score, 0, 100);
}

// ─── Response Score ─────────────────────────────────────────────────

async function calculateResponseScore(
  userId: string,
  monthStart: string,
  monthEnd: string
): Promise<number> {
  // Fetch tasks assigned to this user within the month
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to_id', userId)
    .gte('created_at', monthStart)
    .lte('created_at', monthEnd);

  if (error || !tasks || tasks.length === 0) {
    return 80; // Neutral if no tasks
  }

  // Task acceptance speed (50%) — how quickly tasks moved from 'To Do' to 'In Progress'
  // Since we don't have a detailed activity log, we use escalation as a proxy:
  // No escalation = fast response (100), Level 1 = moderate (60), Level 2+ = slow (30)
  const escalationScores = tasks.map((t: any) => {
    switch (t.escalation_status) {
      case 'None': return 100;
      case 'Level 1': return 60;
      case 'Level 2': return 30;
      case 'Email Sent': return 20;
      default: return 80;
    }
  });
  const avgEscalation = escalationScores.reduce((a: number, b: number) => a + b, 0) / escalationScores.length;
  const taskAcceptance = (avgEscalation / 100) * 50;

  // Check-in compliance (50%) — based on attendance consistency
  // Uses the ratio of present days to working days as a proxy for responsiveness
  const { data: events } = await supabase
    .from('attendance_events')
    .select('timestamp, type')
    .eq('user_id', userId)
    .gte('timestamp', monthStart)
    .lte('timestamp', monthEnd);

  const uniqueDays = new Set(
    (events || [])
      .filter((e: any) => isCheckInEvent(e.type))
      .map((e: any) => format(parseISO(e.timestamp), 'yyyy-MM-dd'))
  );

  const start = parseISO(monthStart);
  const end = parseISO(monthEnd);
  const allDays = eachDayOfInterval({ start, end });
  const workingDays = allDays.filter(d => getDay(d) !== 0 && getDay(d) !== 6).length;
  const compliance = workingDays > 0 ? (uniqueDays.size / workingDays) * 50 : 25;

  return clamp(taskAcceptance + compliance, 0, 100);
}

// ─── Main Calculator ────────────────────────────────────────────────

export async function calculateEmployeeScores(
  userId: string,
  userRole: string,
  monthDate?: Date
): Promise<EmployeeScore> {
  const targetMonth = monthDate || new Date();
  const monthStart = startOfMonth(targetMonth);
  const monthEnd = endOfMonth(targetMonth);
  const monthKey = format(monthStart, 'yyyy-MM-01');
  const monthStartISO = monthStart.toISOString();
  const monthEndISO = monthEnd.toISOString();

  const roleCategory = getRoleCategory(userRole);
  const weights = ROLE_WEIGHTS[roleCategory];

  // Calculate all three scores in parallel
  const [performanceScore, attendanceScore, responseScore] = await Promise.all([
    calculatePerformanceScore(userId, monthStartISO, monthEndISO),
    calculateAttendanceScore(userId, monthStart, monthEnd),
    calculateResponseScore(userId, monthStartISO, monthEndISO),
  ]);

  // Weighted overall score
  const overallScore = clamp(
    performanceScore * weights.performance +
    attendanceScore * weights.attendance +
    responseScore * weights.response,
    0, 100
  );

  const now = new Date().toISOString();

  // Upsert into employee_scores table
  const scoreData = {
    user_id: userId,
    month: monthKey,
    performance_score: performanceScore,
    attendance_score: attendanceScore,
    response_score: responseScore,
    overall_score: overallScore,
    role_category: roleCategory,
    calculated_at: now,
  };

  const { data, error } = await supabase
    .from('employee_scores')
    .upsert(scoreData, { onConflict: 'user_id,month' })
    .select()
    .single();

  if (error) {
    console.error('Error upserting employee score:', error);
    // Return calculated values even if storage fails
    return {
      id: '',
      userId,
      month: monthKey,
      performanceScore,
      attendanceScore,
      responseScore,
      overallScore,
      roleCategory,
      calculatedAt: now,
      createdAt: now,
    };
  }

  return {
    id: data.id,
    userId: data.user_id,
    month: data.month,
    performanceScore: data.performance_score,
    attendanceScore: data.attendance_score,
    responseScore: data.response_score,
    overallScore: data.overall_score,
    roleCategory: data.role_category,
    calculatedAt: data.calculated_at,
    createdAt: data.created_at,
  };
}

/**
 * Fetch existing score for a user/month (without recalculating)
 */
export async function getEmployeeScore(
  userId: string,
  monthDate?: Date
): Promise<EmployeeScore | null> {
  const targetMonth = monthDate || new Date();
  const monthKey = format(startOfMonth(targetMonth), 'yyyy-MM-01');

  const { data, error } = await supabase
    .from('employee_scores')
    .select('*')
    .eq('user_id', userId)
    .eq('month', monthKey)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    month: data.month,
    performanceScore: data.performance_score,
    attendanceScore: data.attendance_score,
    responseScore: data.response_score,
    overallScore: data.overall_score,
    roleCategory: data.role_category,
    calculatedAt: data.calculated_at,
    createdAt: data.created_at,
  };
}

/**
 * Fetch score history for a user (multiple months)
 */
export async function getEmployeeScoreHistory(
  userId: string,
  limit: number = 6
): Promise<EmployeeScore[]> {
  const { data, error } = await supabase
    .from('employee_scores')
    .select('*')
    .eq('user_id', userId)
    .order('month', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((d: any) => ({
    id: d.id,
    userId: d.user_id,
    month: d.month,
    performanceScore: d.performance_score,
    attendanceScore: d.attendance_score,
    responseScore: d.response_score,
    overallScore: d.overall_score,
    roleCategory: d.role_category,
    calculatedAt: d.calculated_at,
    createdAt: d.created_at,
  }));
}
