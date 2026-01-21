import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'react-date-range';
import { format } from 'date-fns';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  id: string;
  error?: string;
  value?: string | null;
  onChange?: (value: string) => void;
  maxDate?: Date;
  minDate?: Date;
}

const DatePicker: React.FC<DatePickerProps> = ({ label, id, error, value, onChange, maxDate, minDate, ...props }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const pickerRef = useRef<HTMLDivElement>(null);
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const handleDateChange = (date: Date) => {
    if (onChange) {
      onChange(format(date, 'yyyy-MM-dd'));
    }
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isMobile && pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobile]);

  const { className, ...otherProps } = props;
  const baseClass = isMobile ? 'fo-input' : 'form-input';
  const errorClass = isMobile ? 'fo-input--error' : 'form-input--error';
  const finalClassName = `${baseClass} ${error ? errorClass : ''} flex justify-between items-center cursor-pointer ${className || ''}`;

  // A date needs to be provided to the calendar. Use the value, or today as a fallback.
  // Add a time component to avoid timezone issues where the date might be off by one.
  const selectedDate = value ? new Date(value + 'T12:00:00') : new Date();

  const calendarContent = (
    <div className={`
      ${isMobile 
        ? 'fixed inset-0 date-picker-overlay bg-[#041b0f] z-[99999] flex flex-col pt-safe animate-slide-up' 
        : 'absolute mt-1 left-0 z-[70] rounded-2xl shadow-2xl overflow-hidden border animate-fade-in-scale'}
      ${isDark ? 'dark-calendar bg-[#041b0f] !bg-[#041b0f] border-emerald-900/50' : 'bg-white border-gray-200'}
    `}
    style={isMobile ? { backgroundColor: '#041b0f' } : {}}
    >
      {/* Header for Mobile */}
      {isMobile && (
        <div className="flex items-center p-4 border-b border-white/10 bg-[#041b0f] sticky top-0">
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 -ml-2 text-white hover:bg-white/5 rounded-full transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h2 className="ml-2 text-lg font-semibold text-white">Select {label || 'Date'}</h2>
        </div>
      )}

      <div className={`${isMobile ? 'flex-1 flex items-center justify-center p-4' : ''}`}>
        <Calendar
          date={selectedDate}
          onChange={handleDateChange}
          maxDate={maxDate}
          minDate={minDate}
          color={isDark ? "#10B981" : "#005D22"}
          rangeColors={[isDark ? "#10B981" : "#005D22"]}
          className={isMobile ? 'scale-110 md:scale-100' : ''}
        />
      </div>

      {isMobile && (
         <div className="p-4 border-t border-white/10 bg-[#041b0f]">
            <button 
              onClick={() => setIsOpen(false)}
              className="w-full py-4 bg-emerald-600 text-white font-semibold rounded-xl active:scale-[0.98] transition-all"
            >
              Done
            </button>
         </div>
      )}
    </div>
  );

  return (
    <div ref={pickerRef}>
      {label && <label htmlFor={id} className={`block text-sm font-medium ${isDark ? 'text-emerald-400/80' : 'text-muted'}`}>{label}</label>}
      <div className={label ? "mt-1 relative" : "relative"}>
        <div
          id={id}
          className={finalClassName}
          onClick={() => setIsOpen(!isOpen)}
          role="button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={`Date picker for ${label}`}
        >
          <span className={value ? '' : 'text-muted'}>{value ? format(selectedDate, 'dd MMM, yyyy') : 'Select date'}</span>
          <CalendarIcon className="h-4 w-4 text-muted" />
        </div>
        
        {isOpen && (isMobile ? createPortal(calendarContent, document.body) : calendarContent)}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default DatePicker;