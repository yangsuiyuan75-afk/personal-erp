import { render } from '@testing-library/react';
import { DatePickerInput, DateRangePickerInput } from './date-picker';

describe('DatePickerInput', () => {
  it('renders a date without a time portion', () => {
    const { container } = render(
      <DatePickerInput onChange={() => undefined} value="2026-07-21T16:30:00.000Z" />,
    );

    expect(container.querySelector('input')).toHaveValue('2026-07-21');
  });

  it('renders a Chinese date range', () => {
    const { container } = render(
      <DateRangePickerInput
        onChange={() => undefined}
        value={['2026-07-16T00:00:00.000Z', '2026-07-21T00:00:00.000Z']}
      />,
    );
    const inputs = container.querySelectorAll('input');

    expect(inputs[0]).toHaveAttribute('placeholder', '开始日期');
    expect(inputs[1]).toHaveAttribute('placeholder', '结束日期');
    expect(inputs[0]).toHaveValue('2026-07-16');
    expect(inputs[1]).toHaveValue('2026-07-21');
  });
});
