import React, { useId } from 'react';
// Fix: Changed `import type` to inline `import { type ... }` for UseFormRegisterReturn to fix namespace-as-type error.
import { type UseFormRegisterReturn } from 'react-hook-form';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  registration?: UseFormRegisterReturn;
  children: React.ReactNode;
}

const Select: React.FC<SelectProps> = ({ label, id, error, registration, children, ...props }) => {
  const generatedId = useId();
  const selectId = id || generatedId;
  const { className, ...otherProps } = props;
  
  const baseClass = 'form-input';
  const errorClass = 'form-input--error';
  const finalClassName = `${baseClass} ${error ? errorClass : ''} ${className || ''}`;

  const selectElement = (
    <select
      id={selectId}
      name={props.name || registration?.name || selectId}
      className={finalClassName}
      aria-invalid={!!error}
      {...registration}
      {...otherProps}
    >
      {children}
    </select>
  );

  return (
    <div>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-muted">
          {label}
        </label>
      )}
      <div className={label ? "mt-1" : ""}>
        {selectElement}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default Select;