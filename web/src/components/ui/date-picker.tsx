import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { cn } from '@/lib/utils';

type PickerMode = 'date' | 'month';

export const today = () => dayjs().format('YYYY-MM-DD');
export const thisMonth = () => dayjs().format('YYYY-MM');

function pickerDate(value?: string, length = 10): Dayjs | null {
  const selected = value ? dayjs(value.slice(0, length)) : null;
  return selected?.isValid() ? selected : null;
}

export function DatePickerInput({
  className,
  mode = 'date',
  onChange,
  value,
  ...props
}: Omit<
  React.ComponentProps<typeof DatePicker>,
  'format' | 'onChange' | 'picker' | 'placeholder' | 'value'
> & { mode?: PickerMode; onChange: (value: string) => void; value?: string }) {
  const format = mode === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';

  return (
    <DatePicker
      className={cn('date-picker', className)}
      format={format}
      onChange={(_, dateString) => onChange(String(dateString))}
      picker={mode}
      placeholder={mode === 'month' ? '请选择月份' : '请选择日期'}
      value={pickerDate(value, format.length)}
      {...props}
    />
  );
}

export function DateRangePickerInput({
  className,
  onChange,
  value,
  ...props
}: Omit<
  React.ComponentProps<typeof DatePicker.RangePicker>,
  'format' | 'onChange' | 'placeholder' | 'value'
> & {
  onChange: (from?: string, to?: string) => void;
  value?: [string | undefined, string | undefined];
}) {
  const selected =
    value?.[0] || value?.[1]
      ? ([pickerDate(value?.[0]), pickerDate(value?.[1])] as [Dayjs | null, Dayjs | null])
      : null;

  return (
    <DatePicker.RangePicker
      className={cn('date-picker', 'date-range-picker', className)}
      format="YYYY-MM-DD"
      onChange={(_, [from, to]) => onChange(from || undefined, to || undefined)}
      placeholder={['开始日期', '结束日期']}
      value={selected}
      {...props}
    />
  );
}
