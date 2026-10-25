import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

const inputClasses =
  'w-full min-h-[48px] rounded-xl border border-border-subtle bg-surface px-3.5 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

/** Wraps an input with its label, hint and error message. */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** A labelled text input. */
export function TextInput({ label, error, hint, id, ...props }: TextInputProps) {
  const inputId = id ?? props.name;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint}>
      <input
        id={inputId}
        className={`${inputClasses} ${error ? 'border-danger' : ''}`}
        {...props}
      />
    </Field>
  );
}

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
}

/** A labelled select input. */
export function SelectInput({ label, error, hint, id, options, ...props }: SelectInputProps) {
  const selectId = id ?? props.name;
  return (
    <Field label={label} htmlFor={selectId} error={error} hint={hint}>
      <select
        id={selectId}
        className={`${inputClasses} ${error ? 'border-danger' : ''}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
