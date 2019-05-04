window.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('click', (event: Event) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('.modal .modal-background') ||
      target.closest('.modal .delete')
    ) {
      closeModal(event);
      return;
    }
  });
});

export function enableTailing() {
  $$('.tailing').forEach(element => {
    element.addEventListener('scroll', () => {
      const dataset = element.dataset;

      if (dataset.disableTailOnScroll !== 'false') {
        const distanceFromBottom =
          element.scrollHeight - element.scrollTop - element.offsetHeight;
        dataset.tailEnabled = distanceFromBottom <= 15 ? 'true' : 'false';
      } else {
        dataset.disableTailOnScroll = 'true';
      }
    });
  });
}

export function isSwitchEnabled(id: string) {
  const elem = $<HTMLInputElement>('#' + id);
  return elem && elem.checked;
}

export function openTab(event: Event) {
  const tab = (event.target as Element).closest('li');

  if (tab) {
    const tabName = tab.dataset.tabname;

    const tabs = $$('.tabs li');
    tabs.forEach(tab => {
      const isSelected = tab.classList.contains('tab--' + tabName);
      if (isSelected) {
        tab.classList.add('is-active');
      } else {
        tab.classList.remove('is-active');
      }
    });

    const contents = $$('.tab-content');
    contents.forEach(tabContent => {
      const isSelected = tabContent.classList.contains(
        'tab-content--' + tabName
      );
      if (isSelected) {
        tabContent.classList.add('is-active');
        $$(tabContent, '.tailing').forEach(element => {
          scrollToBottomIfEnabled(element);
        });
      } else {
        tabContent.classList.remove('is-active');
      }
    });

    resetBadgeCounter(tab);
  }
}

export function openModal(
  selector: string,
  options:
    | string
    | {
        content: string;
        title: string;
        actionButton: string;
        isHTML?: boolean;
      }
) {
  const modal = $(selector);

  if (modal) {
    const contentElement = $(modal, '.content');

    if (typeof options === 'string') {
      contentElement.innerText = options;
    } else {
      if (options.isHTML) {
        contentElement.innerHTML = options.content;
      } else {
        contentElement.innerText = options.content;
      }

      $(modal, '.modal-title').innerText = options.title;

      const actionButton = $(modal, '.modal-button-action');
      actionButton.title = options.actionButton;
      actionButton.innerText = options.actionButton;
    }

    modal.classList.add('is-active');
    $('html').classList.add('is-clipped');
  }
}

export function closeModal(event: Event) {
  const modal = (event.target as HTMLElement).closest('.modal');
  if (modal) {
    modal.classList.remove('is-active');
    $('html').classList.remove('is-clipped');
    $(modal, '.content').innerHTML = '';
  }
}

export function scrollToBottomIfEnabled(element: HTMLElement) {
  if (element.dataset.tailEnabled !== 'false') {
    scrollToBottom(element);
  }
}

export function scrollToBottom(element: HTMLElement) {
  element.dataset.disableTailOnScroll = 'false';
  element.scrollTo(0, element.scrollHeight);
}

export function showDivider(shellOutput: Element, text: string): void {
  const divider = document.createElement('div');
  divider.classList.add('is-divider');
  divider.dataset.content = text.toUpperCase();
  shellOutput.appendChild(divider);
  setTimeout(() => {
    scrollToBottomIfEnabled(shellOutput.closest('.tailing') as HTMLElement);
  }, 0);
}

export function $<T extends HTMLElement = HTMLElement>(selector: string): T;
export function $<T extends HTMLElement = HTMLElement>(
  parent: Element,
  selector: string
): T;
export function $<T extends HTMLElement = HTMLElement>(
  parentOrSelector: string | Element,
  selector?: string
): T {
  if (typeof parentOrSelector === 'string') {
    return document.querySelector(parentOrSelector) as T;
  } else {
    return parentOrSelector.querySelector(selector!) as T;
  }
}

export function $$<T extends HTMLElement = HTMLElement>(
  selector: string
): NodeListOf<T>;
export function $$<T extends HTMLElement = HTMLElement>(
  parent: Element,
  selector: string
): NodeListOf<T>;
export function $$<T extends HTMLElement = HTMLElement>(
  parentOrSelector: string | Element,
  selector?: string
): NodeListOf<T> {
  if (typeof parentOrSelector === 'string') {
    return document.querySelectorAll(parentOrSelector);
  } else {
    return parentOrSelector.querySelectorAll(selector!);
  }
}

export function contains<T extends object, K extends string>(
  obj: T,
  field: K
): boolean {
  return Object.prototype.hasOwnProperty.call(obj, field);
}

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function resetBadgeCounter(element: HTMLElement) {
  const badge = element.classList.contains('.has-badge')
    ? element
    : $(element, '.has-badge');

  if (badge) {
    badge.removeAttribute('data-badge');
  }
}

export function incrementBadgeCounter(element: HTMLElement, increment = 1) {
  const badge = element.classList.contains('.has-badge')
    ? element
    : $(element, '.has-badge');
  const value = Number(badge.dataset.badge || 0);
  badge.dataset.badge = String(value + increment);
}

export function createDropdownCheckradioItem(
  inputId: string,
  htmlContent: string,
  onChange?: ((event: Event) => void) | null,
  extraInfo: [string, string][] = [],
  checked = true
): HTMLAnchorElement {
  const item = document.createElement('a');
  item.classList.add('dropdown-item', 'field');

  const input = document.createElement('input');
  input.classList.add('is-checkradio');
  input.setAttribute('id', inputId);
  input.setAttribute('type', 'checkbox');

  if (checked) {
    input.setAttribute('checked', 'checked');
  }

  if (onChange) {
    input.addEventListener('change', onChange);
  }

  if (extraInfo) {
    extraInfo.forEach(([name, value]) => {
      input.dataset[name] = value;
      input.classList.add(`${name}--${value}`);
    });
  }

  const label = document.createElement('label');
  label.classList.add('is-checkradio');
  label.setAttribute('for', inputId);
  label.innerHTML = htmlContent;

  item.appendChild(input);
  item.appendChild(label);

  return item;
}

export function createDropdownInfoItem(htmlContent: string): HTMLAnchorElement {
  const item = document.createElement('a');
  item.classList.add('dropdown-item');
  item.innerHTML = htmlContent;
  return item;
}

export function createDropdownDivider(): HTMLHRElement {
  const divider = document.createElement('hr');
  divider.classList.add('dropdown-divider');
  return divider;
}
