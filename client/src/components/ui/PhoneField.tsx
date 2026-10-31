import { inputClass } from '@/components/ui/Field';
import { sanitisePhone } from '@/lib/phone';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * A phone number, typed.
 *
 * One component rather than the same three attributes copied into a dozen forms: a
 * field that refuses letters here and accepts them on the next page is worse than one
 * that accepts them everywhere, because only the second is predictable.
 *
 * `dir="ltr"` because a number is read left to right even on a right-to-left page, and
 * `type="tel"` with `inputMode` so a phone offers its keypad.
 */
export function PhoneField({
  id,
  value,
  onChange,
  onBlur,
  required = false,
  disabled = false,
  placeholder,
}: Props) {
  return (
    <input
      id={id}
      name="phone"
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      dir="ltr"
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      className={inputClass}
      value={value}
      onChange={(e) => onChange(sanitisePhone(e.target.value))}
      onBlur={onBlur}
    />
  );
}
