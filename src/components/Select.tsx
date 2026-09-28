import { useId } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  labelClassName?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  /** Accessible name when there is no visible `label` (and no external <label htmlFor>). */
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

export default function Select({
  value,
  onChange,
  options,
  placeholder,
  label,
  labelClassName = 'block text-sm font-medium mb-2 text-body',
  className = '',
  disabled = false,
  required = false,
  name,
  id,
  ariaLabel,
  ariaDescribedBy,
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className={labelClassName}>
          {label}
          {required && <span className="text-red-600 ml-1" aria-hidden>*</span>}
        </label>
      )}
      <div className="select-wrapper">
        <select
          id={selectId}
          name={name}
          aria-label={label ? undefined : ariaLabel}
          aria-describedby={ariaDescribedBy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`select focus-ring ${className}`}
          disabled={disabled}
          required={required}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
