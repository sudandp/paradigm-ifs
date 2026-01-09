import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';

export interface MonthlyReportRow {
    userName: string;
    statuses: string[];
    presentDays: number;
    halfDays: number;
    absentDays: number;
    weekOffs: number;
    holidays: number;
    weekendPresents: number;
    holidayPresents: number;
    totalPayableDays: number;
    sickLeaves: number;
    earnedLeaves: number;
    compOffs: number;
    workFromHomeDays: number;
}

export const exportAttendanceToExcel = async (
    data: MonthlyReportRow[],
    dateRange: { startDate: Date; endDate: Date },
    logoBase64?: string
) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Monthly Attendance Report');

    // 1. Add Logo if available
    if (logoBase64 && logoBase64.startsWith('data:image')) {
        try {
            const base64Data = logoBase64.split(',')[1];
            const imageId = workbook.addImage({
                base64: base64Data,
                extension: 'png',
            });
            worksheet.addImage(imageId, {
                tl: { col: 0, row: 0 },
                ext: { width: 180, height: 45 }
            });
        } catch (error) {
            console.error('Failed to add logo to Excel:', error);
        }
    } else {
        console.warn('Excel Export: Logo not provided in base64 format.');
    }

    // 2. Add Title and Date Range
    worksheet.getRow(1).height = 35;
    worksheet.mergeCells('A1:AJ1'); 
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Monthly Attendance Report';
    titleCell.font = { size: 20, bold: true, color: { argb: 'FF000000' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.getRow(2).height = 25;
    worksheet.mergeCells('A2:AJ2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `${format(dateRange.startDate, 'dd MMM yyyy')} to ${format(dateRange.endDate, 'dd MMM yyyy')}`;
    dateCell.font = { size: 12, color: { argb: 'FF444444' }, italic: true };
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Move start row down to accommodate header
    let currentRow = 5;

    // 3. Define columns
    const dayInterval: Date[] = [];
    let d = new Date(dateRange.startDate);
    while (d <= dateRange.endDate) {
        dayInterval.push(new Date(d));
        d.setDate(d.getDate() + 1);
    }

    // Header Row 1: Day Numbers
    const headerRow1 = worksheet.getRow(currentRow);
    const dayNumbers = [
        '', // Employee Name column
        ...dayInterval.map(date => format(date, 'd')),
        ...new Array(13).fill('') // Summary columns
    ];
    headerRow1.values = dayNumbers;
    headerRow1.height = 20;
    headerRow1.font = { bold: true, size: 10 };
    headerRow1.alignment = { horizontal: 'center', vertical: 'middle' };
    
    // Style day number cells
    headerRow1.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber > 1 && colNumber <= dayInterval.length + 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        }
    });

    currentRow++;

    // Header Row 2: Names and Summary Headers
    const headerRow2 = worksheet.getRow(currentRow);
    const mainHeaders = [
        'Employee Name',
        ...dayInterval.map(date => format(date, 'EEE')),
        'P', '1/2P', 'W/H', 'A', 'WO', 'H', 'WOP', 'HP', 'S/L', 'E/L', 'C/O', 'Total'
    ];
    headerRow2.values = mainHeaders;
    headerRow2.height = 25;
    headerRow2.font = { bold: true, color: { argb: 'FF000000' } };
    headerRow2.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    headerRow2.alignment = { vertical: 'middle', horizontal: 'center' };

    // Set column widths
    worksheet.getColumn(1).width = 28; // Employee Name
    for (let i = 2; i <= dayInterval.length + 1; i++) {
        worksheet.getColumn(i).width = 5;
    }
    // Summary columns widths
    const lastColIndex = dayInterval.length + 14;
    for (let i = dayInterval.length + 2; i <= lastColIndex; i++) {
        worksheet.getColumn(i).width = 7;
    }

    // Apply borders to headerRow2 manually
    headerRow2.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    currentRow++;

    // 4. Add data rows
    data.forEach(row => {
        const rowData = [
            row.userName,
            ...row.statuses,
            row.presentDays,
            row.halfDays,
            row.workFromHomeDays,
            row.absentDays,
            row.weekOffs,
            row.holidays,
            row.weekendPresents,
            row.holidayPresents,
            row.sickLeaves,
            row.earnedLeaves,
            row.compOffs,
            row.totalPayableDays
        ];
        const excelRow = worksheet.getRow(currentRow);
        excelRow.values = rowData;
        excelRow.height = 22;

        // Apply background colors to special columns
        const col_SL = dayInterval.length + 11;
        const col_EL = dayInterval.length + 12;
        const col_CO = dayInterval.length + 13;
        const col_Total = dayInterval.length + 14;

        excelRow.getCell(col_SL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }; // Light Green
        excelRow.getCell(col_EL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } }; // Light Blue
        excelRow.getCell(col_CO).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E5F5' } }; // Light Purple
        excelRow.getCell(col_Total).font = { bold: true };

        // Borders and alignment for all cells in row
        excelRow.eachCell({ includeEmpty: true }, (cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            if (Number(cell.col) > 1) cell.alignment = { horizontal: 'center', vertical: 'middle' };
            else cell.alignment = { vertical: 'middle', indent: 1 };
        });

        currentRow++;
    });

    // 5. Generate and Save
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Monthly_Attendance_Report_${format(dateRange.startDate, 'MMM_yyyy')}.xlsx`;
    saveAs(new Blob([buffer]), fileName);
};
