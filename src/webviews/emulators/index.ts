import { PsNodeResult } from '../../emulators/utils';

declare const acquireVsCodeApi: () => {
  postMessage: (msg: any) => void;
  setState: <T>(newState: T) => T;
  getState: () => any;
};

const vscode = acquireVsCodeApi();

const startButton = getElement('.controls .button.start');
const stopButton = getElement('.controls .button.stop');

const projectSelector = getElement<HTMLSelectElement>(
  '.top-controls .project-selector'
);

const workspaceSelector = getElement('.top-controls .workspace-selector');

let functionsLogEntries: any[] = [];

const portBlocking: {
  processInfo?: PsNodeResult | undefined;
  port?: string | undefined;
} = {};

setupDOMListeners();

window.addEventListener('message', ({ data }) => {
  switch (data.command) {
    case 'initialize':
      initialize(data);
      break;
    case 'stdout':
    case 'stderr':
      showCLIOutput(data);
      break;
    case 'log':
      addLogEntry(data.message);
      break;
    case 'stopped':
      stopped();
      break;
    case 'focus':
      // The webview got focus.
      break;
    case 'error':
      // TODO
      console.log(data);
      break;
    case 'emulator-port-taken':
      openTerminateInstanceModal(data);
      break;
    case 'kill-process-result':
      const port = portBlocking.port;
      if (port) {
        const shellOutput = getElement('.tab-content--dashboard .shell-output');
        showDivider(
          shellOutput,
          (data.success ? 'Terminated' : 'Failed to terminate') +
            ' program at port ' +
            port
        );
      }
      portBlocking.port = undefined;
      portBlocking.processInfo = undefined;
      startButton.removeAttribute('disabled');
      startButton.classList.remove('is-loading');
      if (data.success) {
        start();
      }
      break;
    case 'select-project':
      const optionValue = data.email + '#' + data.projectId;
      const option = [...projectSelector.options].find(
        opt => opt.value === optionValue
      );
      if (option) {
        option.selected = true;
      } else {
        projectSelector.options[0].selected = true;
      }
      break;
    default:
      console.error('Unknown command received:', data);
    // TODO: throw? ignore?
  }
});

vscode.postMessage({
  command: 'ready'
});

window.addEventListener('DOMContentLoaded', () => {
  getElement('.tabs.main-navigation').addEventListener('click', openTab);
});

function setupDOMListeners() {
  getElement(
    '.tab-content--dashboard .controls .button.start'
  ).addEventListener('click', start);

  getElement('.tab-content--dashboard .controls .button.stop').addEventListener(
    'click',
    stop
  );

  getElement('#switch-all-emulators').addEventListener(
    'change',
    toggleAllEmulatorsSwitch
  );

  getElements(
    '.tab-content--https-functions .log-level-selection input.is-checkradio'
  ).forEach(input => {
    input.addEventListener('change', applyHttpsFuncLogLevel);
  });

  getElement('.tab-content--https-functions .logging-table').addEventListener(
    'click',
    httpsFuncTableClick
  );

  // TODO: change this to attach click events to individual elements
  document.body.addEventListener('click', (event: Event) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('.modal .modal-background') ||
      target.closest('.modal .delete')
    ) {
      closeModal(event);
      return;
    }

    const modalButton = target.closest(
      '.modal-prompt-terminate-other-instance .modal-button'
    ) as HTMLElement;
    if (modalButton) {
      handleTerminateInstanceModal(event, modalButton);
      return;
    }
  });

  getElements('.tailing').forEach(element => {
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

  getElement<HTMLSelectElement>(
    '.tab-content--dashboard .workspace-selector-field .workspace-selector'
  ).addEventListener('change', function() {
    const path = this.options[this.selectedIndex].value;
    vscode.postMessage({
      command: 'folder-selected',
      path
    });
  });
}

function start() {
  const selectedProject =
    projectSelector.options[projectSelector.selectedIndex];

  if (!selectedProject || selectedProject.value === '') {
    // TODO: show message telling the user to select a project
    return;
  }

  // @ts-ignore
  const path = workspaceSelector.options[workspaceSelector.selectedIndex].value;
  const [email, projectId] = selectedProject.value.split('#');
  const debug = isSwitchEnabled('enable-debug');

  let emulators;
  const allEmulators = isSwitchEnabled('switch-all-emulators');
  if (allEmulators) {
    emulators = 'all';
  } else {
    const inputs = getElements<HTMLInputElement>(
      '.tab-content--dashboard input[id^="switch-emu-"]'
    );

    emulators = [...inputs]
      .filter(input => input.checked)
      .map(input => input.id.match(/switch-emu-(.+)/)![1]);
  }

  vscode.postMessage({
    command: 'start',
    email,
    projectId,
    path,
    emulators,
    debug
  });

  startButton.setAttribute('disabled', 'disabled');
  stopButton.removeAttribute('disabled');
  document.body.classList.add('running');
}

function stop() {
  stopButton.classList.add('is-loading');
  stopButton.setAttribute('disabled', 'disabled');
  document.body.classList.remove('running');
  document.body.classList.add('stopping');
  vscode.postMessage({ command: 'stop' });
}

function stopped() {
  startButton.removeAttribute('disabled');
  stopButton.setAttribute('disabled', 'disabled');
  stopButton.classList.remove('is-loading');
  document.body.classList.remove('running');
  document.body.classList.remove('stopping');

  const shellOutput = getElement('.tab-content--dashboard .shell-output');
  showDivider(shellOutput, 'DONE');

  ['firestore', 'database'].forEach(emulator => {
    if (isSwitchEnabled('switch-emu-' + emulator)) {
      const lastElem = getElement(
        `.tab-content--${emulator} .shell-output div:last-child`
      );
      if (lastElem && !lastElem.classList.contains('is-divider')) {
        const output = getElement(`.tab-content--${emulator} .shell-output`);
        showDivider(output, 'DONE');
      }
    }
  });
}

function initialize(data: { folders: any; accountsWithProjects: any }) {
  const { folders, accountsWithProjects } = data;

  const numAccounts = accountsWithProjects.length;

  accountsWithProjects.forEach(
    (awp: {
      email: string;
      projects: { forEach: (arg0: (project: any) => void) => void };
    }) => {
      let parent: HTMLSelectElement | HTMLOptGroupElement;

      if (numAccounts > 1) {
        parent = document.createElement('optgroup');
        parent.setAttribute('label', awp.email);
      } else {
        parent = projectSelector;
      }

      awp.projects.forEach(
        (project: { displayName: any; projectId: string }) => {
          const option = document.createElement('option');
          option.innerText = project.displayName || project.projectId;
          option.setAttribute('value', awp.email + '#' + project.projectId);
          parent.appendChild(option);
        }
      );

      if (numAccounts > 1) {
        projectSelector.appendChild(parent);
      }
    }
  );

  folders.forEach((folder: { name: string; path: string }) => {
    const option = document.createElement('option');
    option.innerText = folder.name;
    option.setAttribute('value', folder.path);
    workspaceSelector.appendChild(option);
  });

  setTimeout(() => {
    const event = document.createEvent('HTMLEvents');
    event.initEvent('change', false, true);
    workspaceSelector.dispatchEvent(event);
  }, 0);

  functionsLogEntries = [];

  startButton.removeAttribute('disabled');
  applyHttpsFuncLogLevel();
}

function showCLIOutput(data: { command: string; message: string }) {
  const shellOutput = getElement('.tab-content--dashboard .shell-output');
  const shellItem = document.createElement('div');
  shellItem.classList.add('item', 'item-' + data.command);
  shellItem.innerHTML = data.message;
  shellOutput.appendChild(shellItem);
  scrollToBottomIfEnabled(shellOutput.closest('.tailing') as HTMLElement);
}

function isSwitchEnabled(id: string) {
  const elem = getElement<HTMLInputElement>('#' + id);
  return elem && elem.checked;
}

function toggleAllEmulatorsSwitch(event: Event) {
  const isChecked = (event.currentTarget as HTMLInputElement).checked;
  ['functions', 'firestore', 'database', 'hosting'].forEach(service => {
    const element = getElement('#switch-emu-' + service);
    if (element) {
      if (isChecked) {
        element.setAttribute('disabled', 'disabled');
      } else {
        element.removeAttribute('disabled');
      }
    }
  });
}

function openTab(event: Event) {
  const tab = (event.target as Element).closest('li');

  if (tab) {
    const tabName = tab.dataset.tabname;

    const tabs = getElements('.tabs li');
    tabs.forEach(tab => {
      const isSelected = tab.classList.contains('tab--' + tabName);
      if (isSelected) {
        tab.classList.add('is-active');
      } else {
        tab.classList.remove('is-active');
      }
    });

    const contents = getElements('.tab-content');
    contents.forEach(tabContent => {
      const isSelected = tabContent.classList.contains(
        'tab-content--' + tabName
      );
      if (isSelected) {
        tabContent.classList.add('is-active');
        getElements(tabContent, '.tailing').forEach(element => {
          scrollToBottomIfEnabled(element);
        });
      } else {
        tabContent.classList.remove('is-active');
      }
    });
  }
}

function addLogEntry(entry: /*TODO*/ {
  module: string;
  mode: string;
  log?: any;
  from?: string;
  data?: any;
}) {
  switch (entry.module) {
    case 'functions':
      addFunctionsLogEntry(entry as any /*TODO*/);
      break;
    case 'firestore':
    case 'database':
      addLogEntryHelper(entry.module, entry as any /*TODO*/);
      break;
    case 'hosting':
      addHostingLogEntry(entry as any /*TODO*/);
      break;
    default:
      console.warn(`Unknown log module "${entry.module}".`, entry);
  }
}

function addFunctionsLogEntry(entry: { mode: string; log: any }) {
  const { mode, log } = entry;
  let functionType: string;

  if (mode === 'HTTPS') {
    functionType = 'https';
  } else if (mode === 'BACKGROUND') {
    functionType = 'callable';
  } else {
    console.warn(`Unknown mode "${mode}" from functions log:`, entry);
    return;
  }

  const output = getElement(
    `.tab-content--${functionType}-functions table tbody`
  );
  const row = document.createElement('tr');

  row.classList.add(
    'log-entry',
    'log-type--' + (log.type || 'unknown').toLowerCase(),
    'log-level--' + (log.level || 'unknown').toLowerCase()
  );

  let clickableText = false;
  if (log.data && Object.keys(log.data).length > 0) {
    clickableText = true;
    row.dataset.logEntryPos = String(functionsLogEntries.length);
    functionsLogEntries.push(log);
  }

  ['timestamp', 'type', 'level', 'text'].forEach(field => {
    let value = log[field] || '';
    const cell = document.createElement('td');
    cell.classList.add('log-entry-cell', 'log-entry-cell-' + field);
    cell.setAttribute('title', value);

    if (value && field === 'timestamp') {
      const date = new Date(value);
      value = date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      });
    }

    if (clickableText && field === 'text') {
      cell.classList.add('clickable');
    }

    cell.innerText = value;
    row.appendChild(cell);
  });

  output.appendChild(row);
  scrollToBottomIfEnabled(output.closest('.tailing') as HTMLElement);
}

function addLogEntryHelper(
  module: 'firestore' | 'database' | 'hosting',
  entry: { from: string; line: string }
) {
  const output = getElement(`.tab-content--${module} .shell-output`);
  const shellItem = document.createElement('div');
  shellItem.classList.add(
    'item',
    'item-' + (entry.from || 'unknown').toLowerCase()
  );
  shellItem.innerHTML = escapeHtml(entry.line);
  output.appendChild(shellItem);
  scrollToBottomIfEnabled(output.closest('.tailing') as HTMLElement);
}

function addHostingLogEntry({ line }: { line: string }) {
  const log = parseHostingLogLine(line);
  if (!log) {
    console.error('Failed to parse a Hosting log entry:', line);
    return;
  }

  const output = getElement(`.tab-content--hosting table tbody`);
  const row = document.createElement('tr');

  row.classList.add('log-entry');

  (['date', 'ip', 'statusCode', 'method', 'resource'] as Array<
    keyof HostingLogEntry
  >).forEach(field => {
    let value = log[field];
    const cell = document.createElement('td');
    cell.classList.add('log-entry-cell', 'log-entry-cell-' + field);
    cell.setAttribute('title', String(value || ''));

    if (value && field === 'date') {
      value = (value as Date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      });
    }

    cell.innerText = String(value || '');
    row.appendChild(cell);
  });

  output.appendChild(row);
  scrollToBottomIfEnabled(output.closest('.tailing') as HTMLElement);
}

function openModal(
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
  const modal = getElement(selector);

  if (modal) {
    const contentElement = getElement(modal, '.content');

    if (typeof options === 'string') {
      contentElement.innerText = options;
    } else {
      if (options.isHTML) {
        contentElement.innerHTML = options.content;
      } else {
        contentElement.innerText = options.content;
      }

      getElement(modal, '.modal-title').innerText = options.title;

      const actionButton = getElement(modal, '.modal-button-action');
      actionButton.title = options.actionButton;
      actionButton.innerText = options.actionButton;
    }

    modal.classList.add('is-active');
    getElement('html').classList.add('is-clipped');
  }
}

function closeModal(event: Event) {
  const modal = (event.target as HTMLElement).closest('.modal');
  if (modal) {
    modal.classList.remove('is-active');
    getElement('html').classList.remove('is-clipped');
    getElement(modal, '.content').innerHTML = '';
  }
}

function httpsFuncTableClick(event: Event) {
  const row = (event.target as HTMLElement).closest('tr')!;
  if (contains(row.dataset, 'logEntryPos')) {
    const logEntryPos = Number(row.dataset.logEntryPos);
    const entry = functionsLogEntries[logEntryPos];
    openModal('.modal-json-viewer', JSON.stringify(entry.data, null, 2));
  }
}

function applyHttpsFuncLogLevel() {
  const table = getElement<HTMLTableElement>(
    '.tab-content--https-functions table'
  );

  ['user', 'info', 'debug', 'error', 'system'].forEach(level => {
    const checkbox = getElement<HTMLInputElement>(
      '#tab-content--https-functions--log-level--' + level
    );

    if (checkbox.checked) {
      table.classList.add('log-level--' + level);
    } else {
      table.classList.remove('log-level--' + level);
    }
  });
}

function scrollToBottomIfEnabled(element: HTMLElement) {
  if (element.dataset.tailEnabled !== 'false') {
    scrollToBottom(element);
  }
}

function scrollToBottom(element: HTMLElement) {
  element.dataset.disableTailOnScroll = 'false';
  element.scrollTo(0, element.scrollHeight);
}

function openTerminateInstanceModal(data: {
  emulator: any;
  processInfo: PsNodeResult;
}): void {
  let isInstanceOf:
    | 'database'
    | 'firestore'
    | 'functions'
    | 'hosting'
    | undefined;
  let errorMsg = `<h4>Failed to start the <span class="capitalize">${
    data.emulator.name
  }</span> emulator.</h4>`;

  if (data.processInfo) {
    portBlocking.processInfo = data.processInfo;
    portBlocking.port = data.emulator.addr.port;

    if (isDatabaseEmulatorInstance(data.processInfo)) {
      isInstanceOf = 'database';
    } else if (isFirestoreEmulatorInstance(data.processInfo)) {
      isInstanceOf = 'firestore';
    } else if (isOtherEmulatorInstance(data.processInfo)) {
      isInstanceOf = data.emulator.name;
    }

    if (typeof isInstanceOf === 'string') {
      errorMsg += `
    There's ${
      isInstanceOf === data.emulator.name ? 'another' : 'an'
    } instance of the <span class="capitalize">${isInstanceOf}</span>
    emulator already using port ${portBlocking.port}.
    <br/><br/>
    <b>Do you want to terminate it to free the port?</b>
    `;
    } else {
      const { pid, command, arguments: args } = data.processInfo;
      const fullCmd = command + ' ' + args.join(' ');
      errorMsg += `
    <div>The port ${
      portBlocking.port
    } is already taken by another program:</div>
    <div><pre><code><b>    PID</b>: ${pid}\n<b>Command</b>: ${fullCmd}</code></pre></div>
    <br/>
    <div><b>Do you want to terminate the other program to free the port?</b></div>
    <br/>
    <div><i><b>Warning:</b> You might lose data if you terminate it unexpectedly.</i></div>
    `;
    }

    openModal('.modal-prompt-terminate-other-instance', {
      isHTML: true,
      content: errorMsg,
      title: 'Warning',
      actionButton:
        'Terminate ' +
        (typeof isInstanceOf === 'string' ? 'instance' : 'program')
    });
  } else {
    const shellOutput = getElement('.tab-content--dashboard .shell-output');
    showDivider(
      shellOutput,
      'Unknown program is using port ' + data.emulator.addr.port
    );
  }
}

function handleTerminateInstanceModal(
  event: Event,
  modalButton: HTMLElement
): void {
  if (modalButton.dataset.option === 'cancel') {
    portBlocking.port = undefined;
    portBlocking.processInfo = undefined;
    closeModal(event);
  } else if (modalButton.dataset.option === 'action') {
    if (portBlocking.processInfo) {
      startButton.setAttribute('disabled', 'disabled');
      startButton.classList.add('is-loading');

      vscode.postMessage({
        command: 'kill-process',
        pid: portBlocking.processInfo.pid
      });
    }
    closeModal(event);
  }
}

function isDatabaseEmulatorInstance(info: PsNodeResult): boolean {
  return (
    info &&
    contains(info, 'arguments') &&
    info.command === 'java' &&
    /firebase-database-emulator(.+)\.jar/.test(info.arguments.join(' '))
  );
}

function isFirestoreEmulatorInstance(info: PsNodeResult): boolean {
  return (
    info &&
    contains(info, 'arguments') &&
    info.command === 'java' &&
    /cloud-firestore-emulator(.+)\.jar/.test(info.arguments.join(' '))
  );
}

function isOtherEmulatorInstance(info: PsNodeResult): boolean {
  return (
    info &&
    contains(info, 'arguments') &&
    info.command === 'node' &&
    /firebase(.+)emulators:start/.test(info.arguments.join(' '))
  );
}

function showDivider(shellOutput: Element, text: string): void {
  const divider = document.createElement('div');
  divider.classList.add('is-divider');
  divider.dataset.content = text.toUpperCase();
  shellOutput.appendChild(divider);
  setTimeout(() => {
    scrollToBottomIfEnabled(shellOutput.closest('.tailing') as HTMLElement);
  }, 0);
}

function getElement<T extends HTMLElement = HTMLElement>(selector: string): T;
function getElement<T extends HTMLElement = HTMLElement>(
  parent: Element,
  selector: string
): T;
function getElement<T extends HTMLElement = HTMLElement>(
  parentOrSelector: string | Element,
  selector?: string
): T {
  if (typeof parentOrSelector === 'string') {
    return document.querySelector(parentOrSelector) as T;
  } else {
    return parentOrSelector.querySelector(selector!) as T;
  }
}

function getElements<T extends HTMLElement = HTMLElement>(
  selector: string
): NodeListOf<T>;
function getElements<T extends HTMLElement = HTMLElement>(
  parent: Element,
  selector: string
): NodeListOf<T>;
function getElements<T extends HTMLElement = HTMLElement>(
  parentOrSelector: string | Element,
  selector?: string
): NodeListOf<T> {
  if (typeof parentOrSelector === 'string') {
    return document.querySelectorAll(parentOrSelector);
  } else {
    return parentOrSelector.querySelectorAll(selector!);
  }
}

function contains<T extends object, K extends string>(
  obj: T,
  field: K
): boolean {
  return Object.prototype.hasOwnProperty.call(obj, field);
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface HostingLogEntry {
  ip: string;
  date: Date;
  method: string;
  resource: string;
  protocol: string;
  statusCode: number;
  size: number;
  referer: string | null;
  userAgent: string;
}

const hostingLogEntryRegex = /^(\S+) (\S+) (\S+) \[([\w:/]+\s[+\-]\d{4})\] "(\S+)\s?(\S+)?\s?(\S+)?" (\d{3}|-) (\d+|-)\s?"?([^"]*)"?\s?"?([^"]*)?"?\n?$/;
const hostingLogDateRegex = /^(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+) ([\+\-])(\d+)$/;

function parseHostingLogLine(line: string): HostingLogEntry | undefined {
  const match = line.match(hostingLogEntryRegex);
  if (!match) {
    return;
  }

  const d = match[4].match(hostingLogDateRegex);
  if (!d) {
    return;
  }

  const date = new Date(
    `${d[1]} ${d[2]} ${d[3]} ${d[4]}:${d[5]}:${d[6]} GMT${d[7]}${d[8]}`
  );

  return {
    ip: match[1],
    date,
    method: match[5],
    resource: match[6],
    protocol: match[7],
    statusCode: Number(match[8]),
    size: Number(match[9]) || 0,
    referer: match[10] === '-' ? null : match[10],
    userAgent: match[11]
  };
}
