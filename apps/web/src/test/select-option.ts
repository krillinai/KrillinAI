import { fireEvent, within } from '@testing-library/react';

/** Choose by the submitted value while exercising the visible listbox interaction. */
export function selectOption(control: HTMLElement, value: string | number): void {
  if (control instanceof HTMLSelectElement) {
    fireEvent.change(control, { target: { value: String(value) } });
    return;
  }
  const list = selectListbox(control);
  const option = within(list).getAllByRole('option').find(element => element.getAttribute('data-value') === String(value) || element.textContent === String(value));
  if (!option) throw new Error(`Select has no option with value ${value}`);
  fireEvent.click(option);
}

export function selectListbox(control: HTMLElement): HTMLElement {
  if (control instanceof HTMLSelectElement) return control;
  document.querySelectorAll<HTMLElement>('.app-select-trigger[aria-expanded="true"]').forEach(other => {
    if (other !== control) fireEvent.click(other);
  });
  if (control.getAttribute('aria-expanded') !== 'true') fireEvent.click(control);
  const listId = control.getAttribute('aria-controls');
  const list = listId && document.getElementById(listId);
  if (!list) throw new Error('Select did not open a listbox');
  return list;
}

/** Existing workspace tests edit several control types through the same operation. */
export function changeControl(control: HTMLElement, event: { target: Record<string, unknown> }): void {
  if (control.matches('button.app-select-trigger') && 'value' in event.target) {
    selectOption(control, String(event.target.value));
  } else {
    fireEvent.change(control, event);
  }
}
