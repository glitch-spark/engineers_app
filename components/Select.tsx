import React from 'react';

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
}

export default function Select({
  value,
  onChange,
  options,
  placeholder,
  label,
  labelClassName = 'block text-sm font-medium mb-2 text-gray-700',
  className = '',
  disabled = false,
  required = false,
  name,
  id
}: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className={labelClassName}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="select-wrapper">
        <select
          id={id}
          name={name}
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
