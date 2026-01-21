import React, { useState, useEffect } from 'react';
import { format, getDaysInMonth, startOfMonth, endOfMonth, eachDayOfInterval, startOfDay, isAfter, isSameDay } from 'date-fns';
import { Download } from 'lucide-react';
import { api } from '../../services/api';
import { processDailyEvents, calculateWorkingHours, isLateCheckIn, isEarlyCheckOut } from '../../utils/attendanceCalculations';
import type { AttendanceEvent, User, StaffAttendanceRules } from '../../types';
import Button from '../ui/Button';
import { useSettingsStore } from '../../store/settingsStore';

interface MonthlyHoursReportProps {
  month: number; // 1-12
  year: number;
  userId?: string; // If provided, show single employee; otherwise show all
}

interface DailyData {
  date: number;
  status: string;
  inTime: string;
  outTime: string;
  grossDuration: string;
  breakIn: string;
  breakOut: string;
  breakDuration: string;
  netWorkedHours: string;
  ot: string;
  shift: string;
}

interface EmployeeMonthlyData {
  employeeId: string;
  employeeName: string;
  totalGrossWorkDuration: number; // hours
  totalNetWorkDuration: number; // hours (previously totalWorkDuration)
  totalBreakDuration: number; // hours
  totalOT: number; // hours (new)
  present: number;
  absent: number;
  weeklyOff: number;
  holidays: number;
  leaves: number;
  averageWorkingHrs: number;
  totalDurationPlusOT: number;
  shiftCounts: { [key: string]: number };
  dailyData: DailyData[];
}

const MonthlyHoursReport: React.FC<MonthlyHoursReportProps> = ({ month, year, userId }) => {
  const [reportData, setReportData] = useState<EmployeeMonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const { attendance, officeHolidays, fieldHolidays, siteHolidays } = useSettingsStore();

  const getStaffCategory = (role: string): 'office' | 'field' | 'site' => {
    const r = role.toLowerCase();
    if (['admin', 'developer', 'hr', 'operations_manager', 'back_office'].includes(r)) return 'office';
    if (['field_staff', 'site_manager'].includes(r)) return 'field';
    return 'site';
  };

  useEffect(() => {
    loadReportData();
  }, [month, year, userId]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      // Fetch users
      const usersData = await api.getUsers();
      setUsers(usersData);

      // Filter users if userId is provided
      const targetUsers = userId ? usersData.filter(u => u.id === userId) : usersData;

      // Fetch attendance events for the month
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));
      
      const employeeReports: EmployeeMonthlyData[] = [];

      for (const user of targetUsers) {
        const events = await api.getAttendanceEvents(user.id, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'));
        const monthlyData = processEmployeeMonth(user, events, year, month);
        employeeReports.push(monthlyData);
      }

      setReportData(employeeReports);
    } catch (error) {
      console.error('Error loading monthly report:', error);
    } finally {
      setLoading(false);
    }
  };

  const processEmployeeMonth = (user: User, events: AttendanceEvent[], year: number, month: number): EmployeeMonthlyData => {
    const daysInMonth = getDaysInMonth(new Date(year, month - 1));
    const dailyData: DailyData[] = [];
    
    let totalGrossWorkDuration = 0;
    let totalNetWorkDuration = 0;
    let totalBreakDuration = 0;
    let totalOT = 0;
    let present = 0;
    let absent = 0;
    let weeklyOff = 0;
    let holidaysCount = 0;

    const shiftCounts: { [key: string]: number } = {};
    let daysPresentInWeek = 0;

    const category = getStaffCategory(user.role);
    const rules = attendance[category];
    const categoryHolidays = category === 'office' ? officeHolidays : category === 'field' ? fieldHolidays : siteHolidays;

    // Process each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month - 1, day);
      const isSunday = currentDate.getDay() === 0; // 0 = Sunday
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.timestamp.startsWith(dateStr));
      const isHoliday = categoryHolidays.some(h => h.date === dateStr);

      if (dayEvents.length === 0) {
        let status = '-';
        const today = startOfDay(new Date());
        const isFuture = isAfter(currentDate, today);
        const isToday = isSameDay(currentDate, today);

        if (isSameDay(currentDate, startOfDay(currentDate))) {
             if (currentDate.getDay() === 1) daysPresentInWeek = 0; // Reset on Monday
        }

        if (isSunday) {
           // User Requirement: "first week off dont apply this changes... so first W/O... should start even 1,2,3... W/O will be granted"
           // Logic: If it's the first Sunday of the month (day <= 7), grant W/O automatically (if not future).
           // For subsequent weeks, apply the >= 4 days present rule.
           const isFirstSunday = day <= 7;
           
           if (!isFuture) {
             if (isFirstSunday || daysPresentInWeek >= 4) {
               status = 'W/O';
               weeklyOff++;
             } else {
               status = '-';
             }
           } else {
              status = '-';
           }
        } else if (isHoliday) {
          status = 'H';
          if (!isFuture) holidaysCount++;
        } else {
          // Normal day, no events
          if (!isFuture && !isToday) {
            status = 'A';
            absent++;
          }
        }

        dailyData.push({
          date: day,
          status,
          inTime: '-',
          outTime: '-',
          grossDuration: '-',
          breakIn: '-',
          breakOut: '-',
          breakDuration: '-',
          netWorkedHours: '-',
          ot: '-',
          shift: '-',
        });
        continue;
      }

      const { checkIn, checkOut, breakIn, breakOut, workingHours: netHours, breakHours, totalHours: grossHours } = processDailyEvents(dayEvents);

      let duration = netHours;
      let breakInTime = breakIn ? format(new Date(breakIn), 'HH:mm') : '-';
      let breakOutTime = breakOut ? format(new Date(breakOut), 'HH:mm') : '-';
      let ot = 0;

      const formatTime = (hrs: number) => {
        const totalMinutes = Math.round(hrs * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h}:${String(m).padStart(2, '0')}`;
      };

      if (checkIn && checkOut) {
        // Calculate OT
        const maxDailyHours = rules.dailyWorkingHours?.max || 9;
        ot = Math.max(0, netHours - maxDailyHours);
        
        totalNetWorkDuration += duration;
        totalGrossWorkDuration += grossHours;
        totalBreakDuration += breakHours;
        totalOT += ot;
        present++;
      }

      // Track days present in current week for W/O calculation
       if (currentDate.getDay() === 1) daysPresentInWeek = 0; // Reset on Monday if processed here
       if (duration >= (rules.minimumHoursHalfDay || 4)) {
           daysPresentInWeek++;
       }

      // Determine shift type
      let shift = '-';
      if (checkIn) {
        const checkInDate = new Date(checkIn);
        const hour = checkInDate.getHours();
        const minutes = checkInDate.getMinutes();
        const timeVal = hour + minutes / 60; // Decimal time for comparison

        // Shift A: 7 AM start (+/-). Cutoff < 8:30
        // GS: 9 AM start (+/-). 8:30 - 11:30
        // Shift B: 1 PM start (+/-). 11:30 - 20:00
        // Shift C: 9 PM start (+/-). > 20:00

        if (timeVal >= 5 && timeVal < 8.5) { // 05:00 to 08:30
           shift = 'Shift A'; 
        } else if (timeVal >= 8.5 && timeVal < 11.5) { // 08:30 to 11:30 (9am +/- 2ish)
           shift = 'GS';
        } else if (timeVal >= 11.5 && timeVal < 20) { // 11:30 to 20:00
           shift = 'Shift B';
        } else {
           shift = 'Shift C'; // Night
        }
      }
      if (shift !== '-') {
        shiftCounts[shift] = (shiftCounts[shift] || 0) + 1;
      }

      let status = '-'; // Default to nothing
      const fullDayHours = rules.minimumHoursFullDay || 8;
      const halfDayHours = rules.minimumHoursHalfDay || 4;
      
      const today = startOfDay(new Date());
      const isFuture = isAfter(currentDate, today);
      const isToday = isSameDay(currentDate, today);

      if (duration >= fullDayHours) status = 'P';
      else if (duration >= halfDayHours) status = '1/2P';
      else if (isSunday) {
         // Same logic for processed Sundays
         const isFirstSunday = day <= 7;
         if (!isFuture) {
             if (isFirstSunday || daysPresentInWeek >= 4) {
                status = 'W/O';
                weeklyOff++;
             } else {
                status = '-'; 
             }
         } else {
            status = '-';
         }
      } else if (isHoliday) {
        status = 'H';
        if (!isFuture) holidaysCount++;
      } else {
        // Only mark Absent if it's strictly in the past
        // If it's today or future, and criteria not met, stay as '-'
        if (!isFuture && !isToday) {
          status = 'A';
          absent++;
        }
      }

      dailyData.push({
        date: day,
        status,
        inTime: checkIn ? format(new Date(checkIn), 'HH:mm') : '-',
        outTime: checkOut ? format(new Date(checkOut), 'HH:mm') : '-',
        grossDuration: grossHours > 0 ? formatTime(grossHours) : '-',
        breakIn: breakInTime,
        breakOut: breakOutTime,
        breakDuration: breakHours > 0 ? formatTime(breakHours) : '-',
        netWorkedHours: netHours > 0 ? formatTime(netHours) : '-',
        ot: ot > 0 ? formatTime(ot) : '-',
        shift: shift || '-',
      });
    }

    const averageWorkingHrs = present > 0 ? totalNetWorkDuration / present : 0;

    return {
      employeeId: user.id,
      employeeName: user.name,
      totalGrossWorkDuration,
      totalNetWorkDuration,
      totalBreakDuration,
      totalOT,
      present,
      absent,
      weeklyOff,
      holidays: holidaysCount,
      leaves: 0, // TODO: Calculate from leave requests
      averageWorkingHrs: Math.round(averageWorkingHrs * 100) / 100,
      totalDurationPlusOT: totalNetWorkDuration,
      shiftCounts,
      dailyData,
    };
  };

  const exportToExcel = () => {
    // TODO: Implement Excel export using your existing excelExport utility
    console.log('Export to Excel', reportData);
  };

  if (loading) {
    return <div className="p-8 text-center">Loading report...</div>;
  }

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Monthly Status Report (Detailed Work Duration)</h2>
          <p className="text-gray-600">
            {format(new Date(year, month - 1, 1), 'MMM dd yyyy')} To {format(new Date(year, month - 1, getDaysInMonth(new Date(year, month - 1))), 'MMM dd yyyy')}
          </p>
        </div>
        <Button onClick={exportToExcel}>
          <Download className="mr-2 h-4 w-4" /> Download CSV
        </Button>
      </div>

      {reportData.map((employee) => (
        <div key={employee.employeeId} className="mb-12 border border-gray-300 rounded-lg p-6 bg-white">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Employee: {employee.employeeId} - {employee.employeeName}</h3>
            <div className="text-sm text-gray-700 mt-2">
              <p>
                Total Gross Work Duration: {employee.totalGrossWorkDuration.toFixed(2)} Hrs, 
                Total Net Work Duration: {employee.totalNetWorkDuration.toFixed(2)} Hrs, 
                Total Break Time: {employee.totalBreakDuration.toFixed(2)} Hrs,
                Total OT: {employee.totalOT.toFixed(2)} Hrs
              </p>
              <p>
                Present: {employee.present}, Absent: {employee.absent}, WeeklyOff: {employee.weeklyOff}, 
                Holidays: {employee.holidays}, Leaves: {employee.leaves}
              </p>
              <p>
                Average Working Hrs: {employee.averageWorkingHrs.toFixed(2)} Hrs
              </p>
              <p>
                Shift Count: {Object.entries(employee.shiftCounts).map(([shift, count]) => `${shift} ${count}`).join(' ')}
              </p>
            </div>
          </div>

          {/* Daily grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-gray-300">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="p-2 text-left font-semibold bg-gray-200 text-gray-900 border-r border-gray-300">Status</th>
                  {employee.dailyData.map((day) => (
                    <th key={day.date} className="p-1 text-center font-normal border-l border-gray-300 bg-white text-gray-900">{day.date}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300">Status</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 font-bold text-gray-900">
                      <span className={
                        day.status === 'P' ? 'text-green-600' : 
                        (day.status === '1/2P' || day.status === 'C/O') ? 'text-blue-600' : 
                        day.status === 'W/O' ? 'text-gray-500' : 
                        day.status === 'H' ? 'text-orange-600' :
                        'text-red-600'
                      }>
                        {day.status}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300">InTime</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 text-gray-900">{day.inTime}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300">OutTime</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 text-gray-900">{day.outTime}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300 whitespace-nowrap">Gross Dur</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 text-gray-900">{day.grossDuration}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300 whitespace-nowrap">Break In</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 text-gray-900">{day.breakIn}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300">Break Out</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 text-gray-900">{day.breakOut}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300 whitespace-nowrap">Break Dur</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 text-gray-900">{day.breakDuration}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300 whitespace-nowrap">Net Worked Hrs</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 text-gray-900">{day.netWorkedHours}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300 whitespace-nowrap">OT</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 text-gray-900">{day.ot}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="p-2 font-semibold bg-gray-200 text-gray-900 border-r border-gray-300 whitespace-nowrap">Shift</td>
                  {employee.dailyData.map((day) => (
                    <td key={day.date} className="p-1 text-center border-l border-gray-300 text-gray-900">{day.shift}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MonthlyHoursReport;
