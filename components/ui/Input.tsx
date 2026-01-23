import React from 'react';
// Fix: Changed `import type` to inline `import { type ... }` for UseFormRegisterReturn to fix namespace-as-type error.
import { type UseFormRegisterReturn } from 'react-hook-form';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  registration?: UseFormRegisterReturn;
  icon?: React.ReactNode;
}

const Input: React.FC<InputProps> = ({ label, id, error, registration, icon, ...props }) => {
  const { className, ...otherProps } = props;
  
  const baseClass = 'form-input';
  const errorClass = 'form-input--error';
  const finalClassName = `${baseClass} ${error ? errorClass : ''} ${icon ? '!pl-16' : ''} ${className || ''}`;
  
  const inputElement = (
    <div className="relative">
      {icon && (
        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
          {icon}
        </div>
      )}
      <input
        id={id}
        className={finalClassName}
        style={icon ? { paddingLeft: '3.5rem' } : undefined}
        aria-invalid={!!error}
        {...registration}
        {...otherProps}
      />
    </div>
  );

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-muted">
          {label}
        </label>
      )}
      <div className={label ? "mt-1" : ""}>
        {inputElement}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default Input;