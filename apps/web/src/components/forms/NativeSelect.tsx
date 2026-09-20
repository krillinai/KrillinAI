import { ChevronDown } from 'lucide-react';
import type { SelectHTMLAttributes } from 'react';
import './native-select.css';

export default function NativeSelect({
  className,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'>) {
  return (
    <div className="native-select">
      <select {...props} className={['native-select-control', className].filter(Boolean).join(' ')} />
      <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
    </div>
  );
}
