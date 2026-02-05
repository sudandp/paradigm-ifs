
import { format } from 'date-fns';

const matchesDate = (targetDate: any, compareDay: Date) => {
    if (!targetDate) return false;
    try {
        const compareStr = format(compareDay, 'yyyy-MM-dd');
        const compareMMDD = format(compareDay, '-MM-dd');
        
        console.log(`Checking ${compareStr} against ${targetDate}`);

        if (typeof targetDate === 'string') {
            // 1. Try exact full date match
            if (targetDate.includes(compareStr)) return true;

            // 2. Try partial MM-DD match (Year agnostic)
            if (targetDate.includes(compareMMDD)) return true;
            if (targetDate.endsWith(compareMMDD)) return true;

            if (targetDate.startsWith('-')) {
                return compareStr.endsWith(targetDate);
            }
            
            const cleanDate = targetDate.split(' ')[0].split('T')[0];
            return cleanDate === compareStr;
        }
        
        // 2. If it's a Date object
        if (targetDate instanceof Date) {
            return format(targetDate, 'yyyy-MM-dd') === compareStr;
        }
        
        return false;
    } catch (e) {
        return false;
    }
};

const day = new Date('2026-01-15T00:00:00');
const target = '-01-15';

console.log('Match?', matchesDate(target, day));
