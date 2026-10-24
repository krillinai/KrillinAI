import { useRef, type InputHTMLAttributes } from 'react';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import Select from './Select.js';
import './suggested-input.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'list'> & {
  value: string;
  suggestions: readonly string[];
  onChange(value: string): void;
};

/** Free text with an explicit, styled suggestion menu; never opens a browser datalist. */
export default function SuggestedInput({ value, suggestions, onChange, ...props }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const l = useLocalizedCopy();
  const options = [...new Set(suggestions)];
  return <div className="suggested-input" ref={anchorRef}>
    <input {...props} value={value} onChange={event => onChange(event.currentTarget.value)} />
    {options.length ? <Select anchorRef={anchorRef} aria-label={l(`${props['aria-label'] ?? ''}推荐选项`, `${props['aria-label'] ?? ''} suggestions`)}
      value={value} disabled={props.disabled} title={l('查看推荐选项', 'Show suggestions')}
      onChange={event => onChange(event.currentTarget.value)}>
      {!options.includes(value) ? <option value={value} hidden>{value}</option> : null}
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </Select> : null}
  </div>;
}
