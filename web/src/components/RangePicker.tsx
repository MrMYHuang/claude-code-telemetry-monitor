import React from 'react';
import type { RangeOption } from '../lib/format';
import { Clock } from 'lucide-react';

interface RangePickerProps {
  value: RangeOption;
  onChange: (range: RangeOption) => void;
}

const RANGES: { label: string; value: RangeOption }[] = [
  { label: '1h', value: '1h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
];

export const RangePicker: React.FC<RangePickerProps> = ({ value, onChange }) => {
  return (
    <div className="range-picker">
      <Clock size={15} className="range-picker-icon" />
      <div className="range-picker-buttons">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            className={`range-picker-btn ${value === r.value ? 'active' : ''}`}
            onClick={() => onChange(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
};
