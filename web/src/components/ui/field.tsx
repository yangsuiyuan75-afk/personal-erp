import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ChangeEvent,
  type FocusEvent,
  type ForwardedRef,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} autoComplete="off" className={cn('input', className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} autoComplete="off" className={cn('input textarea', className)} />;
}

type SelectValue = string | string[];

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }
>(function Select(
  {
    children,
    className,
    defaultValue,
    multiple,
    onBlur,
    onChange,
    placeholder,
    size: _size,
    value,
    ...props
  },
  ref,
) {
  const nativeRef = useRef<HTMLSelectElement>(null);
  const [options, setOptions] = useState<
    Array<{ value: string; label: string; disabled: boolean }>
  >([]);
  const [internalValue, setInternalValue] = useState<SelectValue>(multiple ? [] : '');
  const controlledValue =
    value === undefined ? undefined : Array.isArray(value) ? value.map(String) : String(value);
  const selectedValue = controlledValue ?? internalValue;

  useLayoutEffect(() => {
    const native = nativeRef.current;
    if (!native) return;
    setOptions(
      Array.from(native.options).map((option) => ({
        value: option.value,
        label: option.text,
        disabled: option.disabled,
      })),
    );
    if (controlledValue === undefined)
      setInternalValue(
        multiple ? Array.from(native.selectedOptions, (option) => option.value) : native.value,
      );
  }, [children, controlledValue, multiple]);

  const updateValue = (next: string | string[] | null) => {
    const native = nativeRef.current;
    const normalized = Array.isArray(next) ? next : (next ?? '');
    if (native) {
      if (Array.isArray(normalized)) {
        for (const option of native.options) option.selected = normalized.includes(option.value);
      } else native.value = normalized;
    }
    if (controlledValue === undefined) setInternalValue(normalized);
    onChange?.({
      currentTarget: native,
      target: native,
      type: 'change',
    } as ChangeEvent<HTMLSelectElement>);
  };

  const notifyBlur = () =>
    onBlur?.({
      currentTarget: nativeRef.current,
      target: nativeRef.current,
      type: 'blur',
    } as FocusEvent<HTMLSelectElement>);

  return (
    <>
      <select
        aria-hidden
        className="select-native-bridge"
        defaultValue={defaultValue}
        multiple={multiple}
        ref={(node) => {
          nativeRef.current = node;
          assignRef(ref, node);
        }}
        tabIndex={-1}
        {...props}
      >
        {children}
      </select>
      <BaseSelect.Root
        items={options.map(({ value: optionValue, label }) => ({ value: optionValue, label }))}
        multiple={multiple}
        onValueChange={updateValue as never}
        value={selectedValue as never}
      >
        <BaseSelect.Trigger
          aria-label={props['aria-label']}
          className={cn('input select', multiple && 'select-multiple', className)}
          disabled={props.disabled}
          onBlur={notifyBlur}
        >
          <BaseSelect.Value
            className="select-value"
            placeholder={placeholder ?? options[0]?.label ?? '请选择'}
          />
          <BaseSelect.Icon>
            <ChevronDown aria-hidden size={16} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner className="select-positioner" sideOffset={6}>
            <BaseSelect.Popup className="select-popup">
              <BaseSelect.List className="select-list">
                {options.map((option) => (
                  <BaseSelect.Item
                    className="select-item"
                    disabled={option.disabled}
                    key={option.value}
                    value={option.value}
                  >
                    <BaseSelect.ItemIndicator className="select-item-indicator">
                      <Check aria-hidden size={14} />
                    </BaseSelect.ItemIndicator>
                    <BaseSelect.ItemText className="select-item-text">
                      {option.label}
                    </BaseSelect.ItemText>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </>
  );
});
