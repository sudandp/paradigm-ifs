import React, { forwardRef, InputHTMLAttributes } from 'react';

// Extend standard input props and add custom ones
interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  labelClassName?: string;
  inputClassName?: string;
  // 'id' is already in InputHTMLAttributes, but we'll keep it explicit if needed,
  // though it's better to rely on the spread props for RHF compatibility.
  // We'll remove 'checked', 'onChange', and 'disabled' from the explicit props
  // as they are handled by InputHTMLAttributes and react-hook-form.
}

// Use forwardRef to allow react-hook-form to attach a ref
const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ id, label, description, className, labelClassName, inputClassName, ...props }, ref) => {
    // The 'id' prop is used for the input and label association.
    // We use the 'id' passed in, or rely on the 'name' from RHF if 'id' is missing,
    // but for accessibility, 'id' is crucial. We'll ensure 'id' is used.
    const inputId = id || props.name;

    return (
      <div className={`relative flex items-start ${className}`}>
        <div className="flex h-6 items-center">
          <input
            id={inputId}
            aria-describedby={description ? `${inputId}-description` : undefined}
            type="checkbox"
            ref={ref} // Attach the ref from forwardRef
            className={`h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent cursor-pointer ${inputClassName || ''}`}
            {...props} // Spread all other props (name, onChange, onBlur, checked, etc.)
          />
        </div>
        <div className="ml-3 text-sm leading-6">
          <label htmlFor={inputId} className={`font-medium text-primary-text cursor-pointer ${labelClassName}`}>
            {label}
          </label>
          {description && (
            <p id={`${inputId}-description`} className="text-muted">
              {description}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
